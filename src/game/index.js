// The game: one scene state machine that wires input, world, HUD, audio, and
// effects together. Scoring rules live in run.js, holds in hold.js, boards in
// scoreboard.js, gate/orb population in spawner.js, camera motion in camera.js.

import { THEME } from '../config/theme.js'
import { BIRD_HIT } from '../config/world.js'
import { BASE_SPEED, CHALLENGE_TARGET, SECTOR } from '../config/rules.js'
import { createRng } from '../lib/rng.js'
import { formatTime } from '../lib/time.js'
import { loadBest, loadChallengeBest, saveBest, saveChallengeBest } from '../lib/storage.js'
import { UNIFORMS, kickUniform } from '../render/uniforms.js'
import { hitTunnel, passMargin, passContact } from '../world/collision.js'
import { createHud } from '../hud/index.js'
import { scoreApi } from './api.js'
import { createCameraRig } from './camera.js'
import { generateCourse } from './challenge.js'
import { createRunClock } from './clock.js'
import { createHold } from './hold.js'
import { createRun, rewindDistance } from './run.js'
import { createScoreboard } from './scoreboard.js'
import { createSpawner } from './spawner.js'
import { createSparks } from './sparks.js'

export { RESUME_COUNTDOWN, heldPauseReason, pauseTapAction } from './hold.js'
export { rewindDistance } from './run.js'

/** Pass margin (world units) under which a gate counts as a close call. */
const NEAR_MISS = 0.34
/** Seconds the world rewinds after a spare before the run resumes. */
const REWIND_TIME = 0.45
/** Scroll speed of the attract loop behind the menus. */
const IDLE_SPEED = 2.2
/** Distance over which the hazard hum ramps up as a gate approaches. */
const HAZARD_RANGE = 38
/** Per-second decay of the screen-wide kick pulse. */
const KICK_DECAY = 2.6

const MENU_SCENES = new Set(['menu', 'credits', 'scores'])

export function createGame({
  bird,
  tunnel,
  gates,
  powerups,
  input,
  camera,
  audio,
  fx,
  postfx,
  screen,
  reduceMotion = false,
  onResume,
  god = false,
  startLives = 1,
  hud = createHud(),
  api = scoreApi,
  now = Date.now,
}) {
  // menu | credits | playing | respawn | dead | entry | scores  (help is a modal)
  let scene = 'menu'
  let best = loadBest()
  /** Bumped on every session start/abort so a slow challenge fetch cannot arm a stale run. */
  let sessionGen = 0
  let deathNewBest = false
  const lessonsSeen = new Set()
  let rewindLeft = 0
  let rewindTotal = 0
  let hitStop = 0

  const clock = createRunClock(now)
  const run = createRun({ startLives })
  const rig = createCameraRig({ camera, bird, reduceMotion })
  const spawner = createSpawner({ gates, powerups, run })
  const sparks = createSparks({ fx, gates, bird, run })
  const scoreboard = createScoreboard({ api, hud, isShowing: () => scene === 'scores' })
  const hold = createHold({
    clock,
    hud,
    audio,
    now,
    isLive: () => scene === 'playing',
    isBlocked: () => screen.needsRotate || screen.hidden,
    onRelease: goLive,
  })

  const passedGates = []
  const collectedOrbs = []
  const burst = { x: 0, y: 0, hw: 0, hh: 0, color: 0 }

  // ---------------------------------------------------------------- helpers

  function syncSpeed({ toAudio = true } = {}) {
    hud.setSpeed(run.speed)
    if (toAudio) audio.setSpeed(run.speed)
  }

  function scrollWorld(dz, dt) {
    tunnel.scroll(dz)
    gates.scroll(dz, dt)
    powerups.scroll(dz, dt)
    UNIFORMS.uScroll.value += dz
  }

  function launchBird(strength = 9) {
    bird.flap()
    audio.flap()
    fx.puff(bird.x, bird.y, 0, strength)
  }

  /** The run is live again after any hold: restore the drone and tell the loop. */
  function goLive() {
    audio.setSpeed(run.speed)
    onResume?.()
  }

  function orbPickup(orb, { color, flash, toast, tone, sound }) {
    hud.toast(toast, tone)
    if (orb.type === 'damper') {
      fx.damperBurst(orb.x, orb.y, orb.z)
      postfx.warp(0.5, 0.5, 1.25)
    } else if (orb.type === 'life') {
      fx.lifeBurst(orb.x, orb.y, orb.z)
    } else if (orb.type === 'shunt') {
      fx.shuntBurst(orb.x, orb.y, orb.z)
      rig.punch(3.8)
    } else {
      fx.orbBurst(orb.x, orb.y, orb.z, color, orb.type)
    }
    sound()
    postfx.flash(color, flash)
    kickUniform(0.4)
    fx.kick(0.4)
  }

  /** Personal best readout: gates for a run, best extract time for the day's challenge. */
  function showBest(beat = false) {
    if (run.challenge) {
      const pb = loadChallengeBest(run.day)
      hud.setBest(pb ? formatTime(pb) : '—', beat)
    } else {
      hud.setBest(best, beat)
    }
  }

  function showScoreReadout(animate = false) {
    if (run.challenge) hud.setExtract(run.gatesCleared, run.target, animate)
    else hud.setScore(run.score, animate)
  }

  // ----------------------------------------------------------- session flow

  function beginSession(mode = 'run', session = {}) {
    sessionGen += 1
    scene = 'playing'
    UNIFORMS.uHazard.value = 0
    UNIFORMS.uOverdrive.value = 0
    run.begin(mode, session)
    if (session.day) scoreboard.challengeDay = session.day
    hud.setGameMode(mode)
    lessonsSeen.clear()
    hold.clear()
    rewindLeft = rewindTotal = 0
    clock.start(session.now ?? now())
    bird.reset()
    gates.reset()
    powerups.reset()
    spawner.reset()
    sparks.reset()
    hud.setLives(run.lives)
    hud.hideRespawn()
    spawner.spawnAhead()
    showScoreReadout()
    showBest()
    syncSpeed()
    hud.showPlaying()
    hold.pause('begin')
    if (mode === 'run') {
      api
        .startRun('run')
        .then((data) => {
          run.token = data?.token ?? null
        })
        .catch(() => {})
    }
  }

  async function beginChallenge() {
    const gen = ++sessionGen
    try {
      const data = await api.startRun('challenge')
      if (gen !== sessionGen || scene !== 'menu') return
      const seed = Number(data.seed)
      const target = Number(data.target) || CHALLENGE_TARGET
      if (!Number.isFinite(seed) || !data.token || !data.day) throw new Error('bad course')
      beginSession('challenge', {
        token: data.token,
        day: data.day,
        target,
        now: Number(data.now) || Date.now(),
        course: generateCourse(createRng(seed >>> 0), target),
      })
    } catch {
      if (scene === 'menu' && gen === sessionGen) hud.toast('BOARD OFFLINE', 'mag')
    }
  }

  function toMenu() {
    sessionGen += 1
    scene = 'menu'
    run.end()
    hold.clear()
    UNIFORMS.uHazard.value = 0
    UNIFORMS.uOverdrive.value = 0
    hud.setGameMode(run.mode)
    hud.hideRespawn()
    bird.reset()
    gates.reset()
    powerups.reset()
    tunnel.reset()
    sparks.reset()
    rewindLeft = rewindTotal = 0
    rig.reset()
    hud.setScore(0)
    hud.setBest(best)
    hud.setLives(1)
    hud.setSpeed(BASE_SPEED)
    hud.hideEntry()
    hud.showMenu()
    audio.title()
    scoreboard.refresh()
  }

  function selectMenuItem(item) {
    if (screen.needsRotate) return
    if (item === 'new') beginSession('run')
    else if (item === 'tutorial') beginSession('tutorial')
    else if (item === 'challenge') void beginChallenge()
    else if (item === 'help') hud.showHelp()
    else if (item === 'scores') openScores(scoreboard.tab)
    else if (item === 'credits') {
      scene = 'credits'
      hud.showCredits()
    }
  }

  function openScores(kind) {
    scene = 'scores'
    scoreboard.open(kind)
  }

  // --------------------------------------------------------------- run end

  /** Shared teardown when a run stops for any reason. */
  function endRun() {
    scene = 'dead'
    hold.clear()
    UNIFORMS.uHazard.value = 0
    UNIFORMS.uOverdrive.value = 0
    hud.hideRespawn()
  }

  /** The end-of-run card for the current session. */
  function showEndCard() {
    if (run.challenge) {
      hud.showDead(run.gatesCleared, false, {
        challenge: true,
        extracted: run.extracted,
        time: run.extractTime,
        target: run.target,
      })
    } else {
      hud.showDead(run.score, deathNewBest)
    }
  }

  /** Open the initials entry if the value makes the board, else show the end card. */
  function offerEntry(kind, value, entryExtra) {
    if (run.token && scoreboard.qualifiesFor(kind, value)) {
      scene = 'entry'
      hud.showEntry(value, scoreboard.rankFor(kind, value), scoreboard.beginEntry(), entryExtra)
    } else {
      showEndCard()
    }
  }

  function die() {
    if (scene !== 'playing') return
    endRun()
    bird.kill()
    audio.crash()
    fx.explode(bird.x, bird.y, 0)
    postfx.flash(0xffffff, 1)
    postfx.glitch(1)
    rig.jolt(0.5)
    hitStop = 0.09
    if (!run.scored) {
      deathNewBest = false
      showEndCard()
      return
    }
    const newBest = run.score > best
    if (newBest) {
      best = run.score
      saveBest(best)
      hud.setBest(best, true)
    }
    deathNewBest = newBest && run.score > 0
    if (run.score > 0) offerEntry('run', run.score)
    else showEndCard()
  }

  function extract() {
    if (scene !== 'playing') return
    endRun()
    run.markExtracted(clock.elapsed())
    audio.milestone()
    postfx.flash(THEME.ice, 0.35)
    UNIFORMS.uKick.value = 1.4
    saveChallengeBest(run.day, run.extractTime)
    showBest(true)
    offerEntry('challenge', run.extractTime, { challenge: true, time: run.extractTime })
  }

  function editEntry(action) {
    if (scene !== 'entry') return
    if (scoreboard.editEntry(action)) submitEntry()
  }

  function skipEntry() {
    scene = 'dead'
    scoreboard.cancelEntry()
    showEndCard()
  }

  function submitEntry() {
    scene = 'scores'
    const token = run.token
    run.token = null
    scoreboard.submit({
      kind: run.extracted ? 'challenge' : 'run',
      score: run.extracted ? run.extractTime : run.score,
      token,
      // Challenge rank is `score` (the frozen extract). pausedMs lets the
      // server bound that claim against the token clock so a pause cannot
      // shrink the ceiling below a real run.
      pausedMs: Math.round(clock.pausedMs),
    })
  }

  // --------------------------------------------------------- in-run events

  function onGatePassed(gate) {
    const { shuntSpent, extract: reached } = run.clearGate()
    const contact = passContact(bird.pos, BIRD_HIT, gate)
    const close = contact.margin < NEAR_MISS
    const milestone = run.scored && run.score % SECTOR === 0

    showScoreReadout(true)
    gates.celebrate(gate, bird.x, bird.y)
    gates.burstShape(gate, bird.x, bird.y, burst)
    fx.gateBurst(burst.x, burst.y, gate.z, burst.hw, burst.hh, burst.color, close ? 70 : 42)
    fx.kick(close ? 1 : 0.6)
    postfx.kick(close ? 1.1 : 0.55)
    postfx.warp(0.5, 0.5, close ? 1.1 : 0.7)
    kickUniform(close ? 1 : 0.55)
    rig.punch(close ? 6 : 3.2)
    audio.gate(run.score)

    if (close) {
      fx.scrapeSparks(contact.x, contact.y, gate.z, contact.nx, contact.ny)
      rig.jolt(0.12)
      hud.toast('CLOSE CALL', 'mag')
      hud.hot()
      audio.nearMiss()
      postfx.flash(THEME.ice, 0.12)
    }
    if (milestone) {
      hud.toast(`SECTOR ${run.score / SECTOR}`, 'sodium')
      audio.milestone()
      postfx.flash(THEME.sodium, 0.22)
      UNIFORMS.uKick.value = 1.4
    } else if (shuntSpent) {
      hud.toast('SHUNT SPENT', 'ice')
    } else if (run.scored && best > 0 && run.score === best + 1) {
      hud.toast('NEW BEST', 'ice')
    }
    if (run.scored && run.score > best) hud.setBest(run.score, true)

    syncSpeed()
    if (reached) extract()
  }

  // Tutorial: freeze the run under an explainer card the first time each orb type is collected.
  function triggerLesson(type) {
    if (!run.tutorial || lessonsSeen.has(type)) return
    lessonsSeen.add(type)
    hold.showLesson(type)
  }

  function onOrbCollected(orb) {
    if (orb.type === 'shunt') {
      run.engageShunt()
      syncSpeed()
      orbPickup(orb, {
        color: THEME.ice,
        flash: 0.14,
        toast: 'SHUNT ENGAGED',
        tone: 'ice',
        sound: audio.shunt,
      })
      triggerLesson('shunt')
      return
    }
    if (orb.type === 'life') {
      hud.setLives(run.addLife(), true)
      orbPickup(orb, { color: THEME.green, flash: 0.14, toast: 'SPARE +1', tone: 'green', sound: audio.life })
      triggerLesson('life')
      return
    }
    run.addDamper()
    syncSpeed()
    orbPickup(orb, { color: THEME.gold, flash: 0.1, toast: 'DAMPERS', tone: 'gold', sound: audio.orb })
    triggerLesson('damper')
  }

  /** Burn a spare life: rewind to just past the last gate and wait for a tap. */
  function consumeSpare(hitGate) {
    hud.setLives(run.spendLife())
    const anchor = hitGate ?? gates.nearestAhead()
    const back = anchor ? rewindDistance(anchor.z, anchor.gap) : 0
    powerups.cullBehind(anchor ? anchor.z : 0)
    bird.reset()
    UNIFORMS.uOverdrive.value = 0
    // Speed goes to the HUD only: audio.setSpeed would re-assert the drone that crash() silences.
    syncSpeed({ toAudio: false })
    audio.crash()
    fx.orbBurst(bird.x, bird.y, 0, THEME.green)
    postfx.flash(THEME.green, 0.5)
    postfx.glitch(0.5)
    rig.jolt(0.25)
    hitStop = 0.06
    scene = 'respawn'
    rewindLeft = rewindTotal = back
    if (rewindLeft === 0) hud.showRespawn()
  }

  function resumeFromSpare() {
    scene = 'playing'
    hud.hideRespawn()
    launchBird()
    goLive()
  }

  /** A flap/tap while held: begin, resume, dismiss a lesson, or nothing. */
  function tapWhileHeld() {
    const result = hold.tap()
    if (result === 'ignore' || result === 'hold') return
    if (result === 'begin') {
      audio.arm()
      postfx.kick(0.5)
      UNIFORMS.uKick.value = 0.6
    }
    launchBird(result === 'begin' ? 14 : 9)
    goLive()
  }

  function syncScreen() {
    hud.setRotate(screen.needsRotate)
    hud.setFullscreen(screen.isFullscreen, screen.supportsFullscreen, screen.isStandalone)
    if (scene === 'playing' && (screen.needsRotate || screen.hidden)) {
      hold.pause(screen.needsRotate ? 'rotate' : 'hidden')
    } else if (scene === 'playing' && hold.paused) {
      // A lesson card is already asking for the tap; do not stack JUMP TO RESUME on top of it.
      hud.showPaused(hold.heldOverlay())
    }
    if (screen.hidden) audio.suspend()
    else audio.resume()
  }

  // ------------------------------------------------------------ frame loop

  function updateMenus(dt, { tapped, blocked }) {
    const dz = IDLE_SPEED * dt
    bird.updateIdle(dt, dz)
    scrollWorld(dz, dt)
    if (scene === 'menu') {
      if (blocked) return
      if (input.navEdge) hud.moveMenu(input.navEdge)
      if (input.selectEdge) selectMenuItem(hud.menuItem)
    } else if (scene === 'scores') {
      const side = input.strafeEdge || input.navEdge
      if (side) openScores(side < 0 ? 'run' : 'challenge')
      else if (tapped || input.backEdge || input.selectEdge) toMenu()
    } else if (tapped || input.backEdge || input.selectEdge) {
      toMenu()
    }
  }

  function updatePlaying(dt, { tapped }) {
    // Esc leaves a tutorial; everywhere else it is the keyboard pause key alongside P.
    if (run.tutorial && input.backEdge) return toMenu()
    const pauseKey = input.pauseEdge || (!run.tutorial && input.backEdge)

    if (hold.paused) {
      audio.clearHazard()
      UNIFORMS.uHazard.value = 0
      UNIFORMS.uOverdrive.value = 0
      if (hold.reason === 'countdown') {
        if (pauseKey) hold.pause('menu')
        else hold.tickCountdown()
      } else if (pauseKey && hold.reason === 'menu') hold.continueFromMenu()
      else if (tapped) tapWhileHeld()
      return
    }
    if (pauseKey) return void hold.openMenu()

    if (input.flapEdge) launchBird()
    const dz = run.speed * dt
    bird.updatePlay(dt, input, dz)
    scrollWorld(dz, dt)

    const hitGate = gates.hits(bird.pos, BIRD_HIT)
    if (!god && (hitTunnel(bird.pos, BIRD_HIT) || hitGate)) {
      if (run.lives > 1) consumeSpare(hitGate)
      else die()
      return
    }

    if (gates.collectPassed(passedGates)) {
      for (const gate of passedGates) {
        onGatePassed(gate)
        if (scene !== 'playing') return
      }
    }
    spawner.spawnAhead()
    if (powerups.collect(bird.pos, BIRD_HIT, collectedOrbs)) {
      for (const orb of collectedOrbs) onOrbCollected(orb)
    }
    const targetOverdrive = run.shuntLeft > 0 ? 1 : 0
    UNIFORMS.uOverdrive.value += (targetOverdrive - UNIFORMS.uOverdrive.value) * Math.min(1, dt * 7.0)
    const next = gates.nearestAhead()
    if (next) {
      const prox = next.z < 0 ? Math.max(0, Math.min(1, 1 + next.z / HAZARD_RANGE)) : 1
      const hazardIntensity = prox * prox
      audio.hazard(next.type, hazardIntensity)
      UNIFORMS.uHazard.value = hazardIntensity
    } else {
      audio.clearHazard()
      UNIFORMS.uHazard.value = 0
    }
  }

  function updateRespawn(dt, { tapped }) {
    if (run.tutorial && input.backEdge) return toMenu()
    if (rewindLeft > 0) {
      const step = Math.min(rewindLeft, (rewindTotal / REWIND_TIME) * dt)
      scrollWorld(-step, dt)
      rewindLeft -= step
      if (rewindLeft === 0) hud.showRespawn()
      bird.updateIdle(dt, 0)
    } else if (tapped && !screen.needsRotate) {
      resumeFromSpare()
    } else {
      bird.updateIdle(dt, 0)
    }
  }

  function updateEntry(dt) {
    bird.updateDead(dt)
    if (input.charEdge) editEntry({ char: input.charEdge })
    else if (input.navEdge) editEntry(input.navEdge < 0 ? 'up' : 'down')
    else if (input.strafeEdge) editEntry(input.strafeEdge < 0 ? 'left' : 'right')
    else if (input.eraseEdge) editEntry('erase')
    else if (input.selectEdge) editEntry('select')
    else if (input.backEdge && !input.eraseEdge) skipEntry()
  }

  function update(realDt) {
    if (input.muteEdge && scene !== 'entry') {
      audio.toggleMute()
      hud.setMuted(audio.muted)
    }
    if (input.debugEdge && scene !== 'entry') bird.toggleCollider()
    if (scene === 'menu' || scene === 'dead') {
      if (input.helpEdge) hud.toggleHelp()
      else if (input.backEdge && hud.helpOpen) hud.hideHelp()
    }

    let dt = realDt
    if (hitStop > 0) {
      hitStop -= realDt
      dt = 0
    }
    if (hold.paused) dt = 0

    UNIFORMS.uTime.value += dt
    UNIFORMS.uKick.value = Math.max(0, UNIFORMS.uKick.value - dt * KICK_DECAY)

    const tapped = input.flapEdge || input.restartEdge || input.tapEdge
    // While the manual is open, flaps must not start or reset a run.
    const blocked = screen.needsRotate || hud.helpOpen
    const frame = { tapped, blocked }

    if (scene !== 'playing') UNIFORMS.uOverdrive.value = 0

    if (MENU_SCENES.has(scene)) updateMenus(dt, frame)
    else if (scene === 'playing') updatePlaying(dt, frame)
    else if (scene === 'respawn') updateRespawn(dt, frame)
    else if (scene === 'dead') {
      if (!run.extracted) bird.updateDead(dt)
      if (tapped && !blocked) toMenu()
    } else if (scene === 'entry') updateEntry(dt)

    hud.updateTouch(input)
    const live = scene === 'playing' && !hold.paused
    fx.update(dt, live ? run.speed : IDLE_SPEED)
    sparks.update(dt, live)
    postfx.update(hold.paused ? 0 : realDt)
    rig.update(hold.paused ? 0 : realDt, { follow: !MENU_SCENES.has(scene), banking: scene === 'playing' })
  }

  // ------------------------------------------------------------- bootstrap

  hud.setBest(best)
  hud.setScore(0)
  hud.setLives(1)
  hud.setSpeed(BASE_SPEED)
  hud.setMuted(audio.muted)
  hud.setInputMode(input.mode)
  hud.showMenu()
  hud.bindSys({
    onMute() {
      audio.toggleMute()
      hud.setMuted(audio.muted)
    },
    onFullscreen() {
      screen.toggleFullscreen()
    },
    onHelp() {
      if (scene === 'menu' || scene === 'dead') hud.toggleHelp()
    },
  })
  hud.bindMenu({
    onSelect(item) {
      if (scene === 'menu' && !hud.helpOpen) selectMenuItem(item)
    },
    onBack() {
      if (scene === 'credits' || scene === 'scores') toMenu()
    },
    onExit() {
      if (run.tutorial && (scene === 'playing' || scene === 'respawn')) toMenu()
    },
    onBoard(kind) {
      if (scene === 'scores') openScores(kind)
    },
  })
  hud.bindEntry({ onAction: editEntry })
  hud.bindPause({ onPause: hold.openMenu, onContinue: hold.continueFromMenu })
  scoreboard.refresh()

  return {
    update,
    syncScreen,
    hud,
    setInputMode: hud.setInputMode,
    get state() {
      return scene
    },
    get mode() {
      return run.mode
    },
    get lesson() {
      return hold.lesson
    },
    get paused() {
      return hold.paused
    },
    get pauseReason() {
      return hold.reason
    },
    get countdown() {
      return hold.countdownLeft()
    },
    get score() {
      return run.score
    },
    get cleared() {
      return run.gatesCleared
    },
    get extracted() {
      return run.extracted
    },
    get extractTime() {
      return run.extractTime
    },
    get pausedMs() {
      return clock.pausedMs
    },
    get lives() {
      return run.lives
    },
    get speed() {
      return run.speed
    },
    get shuntLeft() {
      return run.shuntLeft
    },
  }
}

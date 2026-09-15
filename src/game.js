import * as THREE from 'three'
import { BIRD_RADIUS, BEST_KEY, SHARED, THEME } from './theme.js'
import {
  BASE_SPEED,
  CHALLENGE_TARGET,
  SECTOR,
  SHUNT_GATES,
  SHUNT_SPEED,
  challengeBestKey,
  createRng,
  difficulty,
  formatTime,
  pickLifeSlot,
  rollOrbType,
  stageDelta,
} from './rules.js'
import {
  createEntry,
  entryAction,
  fetchBoard,
  initialsOf,
  placement,
  placementTime,
  qualifies,
  qualifiesTime,
  startRun,
  submitScore,
} from './board.js'
import { hitTunnel, passMargin } from './collision.js'
import { createRunClock } from './clock.js'
import { createHud } from './hud.js'
import { generateCourse } from './challenge.js'
import {
  TUTORIAL_DAMPER,
  TUTORIAL_ORB_SPREAD,
  tutorialDifficulty,
  tutorialGateType,
  tutorialOrbType,
  tutorialSpeed,
} from './tutorial.js'

export { SHUNT_GATES, SHUNT_SPEED, pickLifeSlot, rollOrbType }

const NEAR_MISS = 0.34
const BASE_FOV = 68
const REWIND_TIME = 0.45
// How far past the last cleared gate the bird sits after a spare (z of that gate).
// Must clear the plate + collider so resume does not instantly re-hit it.
const RESPAWN_INSIDE = 1.2
// Seconds between CONTINUE and the run going live. The release itself never
// flaps, so the first jump after a pause is always the player's own.
export const RESUME_COUNTDOWN = 3

export function rewindDistance(anchorZ, gap) {
  return Math.max(0, anchorZ + gap - RESPAWN_INSIDE)
}

/**
 * What a flap/tap does while the run is held. A lesson dismiss stays paused;
 * the pause menu (and the countdown out of it) only releases through
 * CONTINUE, never a stray flap.
 */
export function pauseTapAction({ paused, lesson, blocked, menu = false }) {
  if (!paused || blocked || menu) return 'ignore'
  if (lesson) return 'hold'
  return 'resume'
}

/**
 * Keep "jump to begin" and the pause menu through rotate/hide; a lesson still
 * takes the overlay. An interrupted countdown falls back to the pause menu so
 * the run never goes live while the screen is unusable.
 */
export function heldPauseReason(current, next) {
  if (current === 'countdown') return 'menu'
  if ((current === 'begin' || current === 'menu') && next !== 'lesson' && next !== current) return current
  return next
}

export function loadBest() {
  const n = Number(localStorage.getItem(BEST_KEY) || '0')
  return Number.isFinite(n) ? n : 0
}

export function saveBest(n) {
  localStorage.setItem(BEST_KEY, String(n))
}

export { difficulty, stageDelta } from './rules.js'

export function createGame({
  bird,
  tunnel,
  obstacles,
  powerups,
  input,
  camera,
  audio,
  fx,
  postfx,
  screen,
  reduceMotion,
  onResume,
  god = false,
  startLives = 1,
  hud: hudOverride,
  api = { startRun, fetchBoard, submitScore },
  now = Date.now,
} = {}) {
  const hud = hudOverride ?? createHud()
  const clock = createRunClock(now)
  // menu | credits | playing | respawn | dead | entry | scores  (help is a modal)
  let state = 'menu'
  // run | tutorial | challenge — which rules the current (or next) session uses.
  let mode = 'run'
  const lessonsSeen = new Set()
  let lesson = null
  let score = 0
  let cleared = 0
  let best = loadBest()
  let board = null
  let challengeBoard = null
  let challengeMeta = { day: null, target: CHALLENGE_TARGET }
  let scoresKind = 'run'
  let runToken = null
  let course = null
  let extracted = false
  let extractTime = 0
  let armGen = 0
  let entry = null
  let deathNewBest = false
  let speed = BASE_SPEED
  let slow = 0
  let lives = 1
  let shuntLeft = 0
  let gatesSpawned = 0
  let lifeSlot = -1
  let rewindLeft = 0
  let rewindTotal = 0
  let shake = 0
  let fovPunch = 0
  let hitStop = 0
  let roll = 0
  let paused = false
  let pauseReason = null
  let countdown = 0
  const camBase = new THREE.Vector3(0, 0.55, 6.4)
  const look = new THREE.Vector3()
  const passed = []
  const spawned = []
  const collected = []
  const burst = { x: 0, y: 0, hw: 0, hh: 0, color: 0 }

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
      if (state === 'menu' || state === 'dead') hud.toggleHelp()
    },
  })
  hud.bindMenu({
    onSelect(item) {
      if (state === 'menu' && !hud.helpOpen) choose(item)
    },
    onBack() {
      if (state === 'credits' || state === 'scores') toMenu()
    },
    onExit() {
      if (mode === 'tutorial' && (state === 'playing' || state === 'respawn')) toMenu()
    },
    onBoard(kind) {
      if (state === 'scores') openScores(kind)
    },
  })
  hud.bindEntry({
    onAction(action) {
      if (state === 'entry') applyEntry(action)
    },
  })
  hud.bindPause({
    onPause: holdMenu,
    onContinue: continueRun,
  })
  refreshBoard()

  const tutorial = () => mode === 'tutorial'
  const challenge = () => mode === 'challenge'

  function currentDifficulty() {
    return tutorial() ? tutorialDifficulty() : difficulty(score)
  }

  function spawnAhead() {
    const diff = currentDifficulty()
    obstacles.ensureAhead(
      score,
      diff,
      spawned,
      tutorial() ? tutorialGateType : undefined,
      challenge() ? course : undefined,
    )
    maybeDropOrbs(spawned, diff)
  }

  function scrollWorld(dz, dt) {
    tunnel.scroll(dz)
    obstacles.scroll(dz, dt)
    powerups.scroll(dz, dt)
    SHARED.uScroll.value += dz
  }

  function applySpeed() {
    const shunt = !tutorial() && shuntLeft > 0 ? SHUNT_SPEED : 0
    speed = tutorial() ? tutorialSpeed(slow) : Math.max(BASE_SPEED, difficulty(score).speed - slow + shunt)
    hud.setSpeed(speed)
    audio.setSpeed(speed)
  }

  function maybeDropOrbs(gates, diff) {
    for (const obs of gates) {
      const idx = gatesSpawned++
      const z = obs.z - diff.spacing * 0.5
      if (tutorial()) {
        powerups.spawn(z, tutorialOrbType(idx), TUTORIAL_ORB_SPREAD)
        continue
      }
      if (challenge()) {
        const spec = course?.[idx]
        if (spec?.orb) powerups.spawn(z, spec.orb.type, undefined, spec.orb)
        continue
      }
      if (idx % SECTOR === 0) lifeSlot = pickLifeSlot(idx)
      const drop = rollOrbType({ lifeDue: idx === lifeSlot })
      if (drop) powerups.spawn(z, drop)
    }
  }

  function pause(reason) {
    pauseReason = heldPauseReason(pauseReason, reason)
    if (state !== 'playing') {
      hud.showPaused(pauseReason)
      return
    }
    if (!paused) {
      paused = true
      clock.hold()
      audio.title()
      audio.clearHazard()
    }
    hud.showPaused(pauseReason)
  }

  /** The overlay to show for the current hold once the screen is usable again. */
  function heldOverlay() {
    if (lesson) return 'lesson'
    if (pauseReason === 'begin' || pauseReason === 'menu') return pauseReason
    return 'resume'
  }

  function release() {
    paused = false
    pauseReason = null
    countdown = 0
    lesson = null
    clock.release()
    hud.hidePaused()
    hud.hideLesson()
  }

  /** PAUSE button / P / Esc: hold a live run behind the pause menu. */
  function holdMenu() {
    if (state !== 'playing' || paused) return false
    pause('menu')
    return true
  }

  /**
   * CONTINUE: the only way out of the pause menu. Flaps and taps never release
   * it. Starts the countdown rather than going live; see `finishCountdown`.
   */
  function continueRun() {
    if (state !== 'playing' || !paused || pauseReason !== 'menu') return false
    if (screen.needsRotate || screen.hidden) return false
    pauseReason = 'countdown'
    countdown = RESUME_COUNTDOWN
    audio.tick()
    hud.showPaused('countdown', countdown)
    return true
  }

  /** Runs the countdown on real time (the sim dt is 0 while held). */
  function tickCountdown(realDt) {
    const before = Math.ceil(countdown)
    countdown = Math.max(0, countdown - realDt)
    if (countdown === 0) {
      finishCountdown()
      return
    }
    const after = Math.ceil(countdown)
    if (after !== before) {
      audio.tick()
      hud.showPaused('countdown', countdown)
    }
  }

  /** Deliberately no launchBird: the bird keeps its held velocity until the player flaps. */
  function finishCountdown() {
    release()
    audio.setSpeed(speed)
    onResume?.()
  }

  // Tutorial: freeze the run under an explainer card the first time each orb type is collected.
  function teach(type) {
    if (!tutorial() || lessonsSeen.has(type)) return
    lessonsSeen.add(type)
    lesson = type
    pause('lesson')
    hud.showLesson(type)
  }

  function launchBird(strength = 9) {
    bird.flap()
    audio.flap()
    fx.puff(bird.x, bird.y, 0, strength)
  }

  function tryResume() {
    const action = pauseTapAction({
      paused,
      lesson,
      blocked: screen.needsRotate || screen.hidden,
      menu: pauseReason === 'menu' || pauseReason === 'countdown',
    })
    if (action === 'ignore') return false
    if (action === 'hold') {
      lesson = null
      hud.hideLesson()
      pause('resume')
      return true
    }
    const begin = pauseReason === 'begin'
    release()
    if (begin) {
      audio.arm()
      postfx.kick(0.5)
      SHARED.uKick.value = 0.6
    }
    launchBird(begin ? 14 : 9)
    audio.setSpeed(speed)
    onResume?.()
    return true
  }

  function syncScreen() {
    hud.setRotate(screen.needsRotate)
    hud.setFullscreen(screen.isFullscreen, screen.supportsFullscreen, screen.isStandalone)
    if (state === 'playing' && (screen.needsRotate || screen.hidden)) {
      pause(screen.needsRotate ? 'rotate' : 'hidden')
    } else if (state === 'playing' && paused) {
      // A lesson card is already asking for the tap; do not stack JUMP TO RESUME on top of it.
      hud.showPaused(heldOverlay())
    }
    if (screen.hidden) audio.suspend()
    else audio.resume()
  }

  function arm(nextMode = 'run', session = {}) {
    armGen += 1
    mode = nextMode
    hud.setGameMode(mode)
    lessonsSeen.clear()
    lesson = null
    state = 'playing'
    paused = false
    pauseReason = null
    score = 0
    cleared = 0
    extracted = false
    extractTime = 0
    slow = 0
    lives = Math.max(1, startLives)
    shuntLeft = 0
    gatesSpawned = 0
    lifeSlot = -1
    rewindLeft = 0
    rewindTotal = 0
    course = session.course ?? null
    challengeMeta = {
      day: session.day ?? null,
      target: session.target ?? CHALLENGE_TARGET,
    }
    runToken = session.token ?? null
    clock.start(session.now ?? now())
    bird.reset()
    obstacles.reset()
    powerups.reset()
    hud.setLives(lives)
    hud.hideRespawn()
    spawnAhead()
    if (challenge()) {
      hud.setExtract(0, challengeMeta.target)
      const pb = loadChallengeBest(challengeMeta.day)
      hud.setBest(pb ? formatTime(pb) : '—')
    } else {
      hud.setScore(0)
      hud.setBest(best)
    }
    applySpeed()
    hud.showPlaying()
    hud.hideLesson()
    pause('begin')
    if (nextMode === 'run') {
      runToken = null
      api
        .startRun('run')
        .then((data) => {
          runToken = data?.token ?? null
        })
        .catch(() => {})
    }
  }

  function loadChallengeBest(day) {
    if (!day) return 0
    const n = Number(localStorage.getItem(challengeBestKey(day)) || '0')
    return Number.isFinite(n) && n > 0 ? n : 0
  }

  function saveChallengeBest(day, ms) {
    const prev = loadChallengeBest(day)
    if (!prev || ms < prev) localStorage.setItem(challengeBestKey(day), String(ms))
  }

  function scoresView() {
    if (scoresKind === 'challenge') {
      return { kind: 'challenge', day: challengeMeta.day, board: challengeBoard }
    }
    return { kind: 'run', day: null, board }
  }

  function paintScores(rank = -1, status = '') {
    const view = scoresView()
    hud.showScores(view.board, rank, status, { kind: view.kind, day: view.day })
  }

  function refreshBoard() {
    api
      .fetchBoard('run')
      .then((data) => {
        board = data.board
        if (state === 'scores' && scoresKind === 'run') paintScores()
      })
      .catch(() => {})
    api
      .fetchBoard('challenge')
      .then((data) => {
        challengeBoard = data.board
        if (data.day) challengeMeta = { ...challengeMeta, day: data.day }
        if (state === 'scores' && scoresKind === 'challenge') paintScores()
      })
      .catch(() => {})
  }

  function openScores(kind = 'run') {
    scoresKind = kind === 'challenge' ? 'challenge' : 'run'
    state = 'scores'
    paintScores()
    refreshBoard()
  }

  function applyEntry(action) {
    if (state !== 'entry' || !entry) return
    const next = entryAction(entry, action)
    entry = next.entry
    hud.renderEntry(entry)
    if (next.done) commit()
  }

  function skipEntry() {
    state = 'dead'
    entry = null
    hud.hideEntry()
    showReboot()
  }

  function showReboot() {
    if (challenge()) {
      hud.showDead(cleared, false, {
        challenge: true,
        extracted,
        time: extractTime,
        target: challengeMeta.target,
      })
      return
    }
    hud.showDead(score, deathNewBest)
  }

  function commit() {
    if (state !== 'entry') return
    const initials = initialsOf(entry)
    const token = runToken
    const saved = extracted ? extractTime : score
    // The board clocks challenge runs from the token; it needs the held time to take it back off.
    const pausedMs = Math.round(clock.pausedMs)
    runToken = null
    entry = null
    state = 'scores'
    scoresKind = extracted ? 'challenge' : 'run'
    hud.hideEntry()
    paintScores(-1, 'SAVING')
    api
      .submitScore({ initials, score: saved, token, pausedMs })
      .then((res) => {
        if (scoresKind === 'challenge') {
          challengeBoard = res.board
          if (res.day) challengeMeta = { ...challengeMeta, day: res.day }
        } else {
          board = res.board
        }
        if (state === 'scores') paintScores(res.rank)
      })
      .catch(() => {
        if (state === 'scores') paintScores(-1, 'BOARD OFFLINE')
      })
  }

  function die() {
    if (state !== 'playing') return
    state = 'dead'
    paused = false
    pauseReason = null
    lesson = null
    extracted = false
    hud.hidePaused()
    hud.hideLesson()
    hud.hideRespawn()
    bird.kill()
    audio.crash()
    fx.explode(bird.x, bird.y, 0)
    postfx.flash(0xffffff, 1)
    postfx.glitch(1)
    shake = reduceMotion ? 0 : 0.5
    hitStop = 0.09
    if (tutorial() || challenge()) {
      hud.showDead(challenge() ? cleared : score, false, {
        challenge: challenge(),
        extracted: false,
        target: challengeMeta.target,
      })
      return
    }
    const newBest = score > best
    if (newBest) {
      best = score
      saveBest(best)
      hud.setBest(best, true)
    }
    deathNewBest = newBest && score > 0
    const eligible = score > 0 && runToken && qualifies(board, score)
    if (eligible) {
      state = 'entry'
      entry = createEntry()
      hud.showEntry(score, placement(board, score), entry)
    } else {
      hud.showDead(score, deathNewBest)
    }
  }

  function extract() {
    if (state !== 'playing') return
    state = 'dead'
    paused = false
    pauseReason = null
    lesson = null
    extracted = true
    extractTime = clock.elapsed()
    hud.hidePaused()
    hud.hideLesson()
    hud.hideRespawn()
    audio.milestone()
    postfx.flash(THEME.ice, 0.35)
    SHARED.uKick.value = 1.4
    saveChallengeBest(challengeMeta.day, extractTime)
    hud.setBest(formatTime(loadChallengeBest(challengeMeta.day)), true)
    const eligible = runToken && qualifiesTime(challengeBoard, extractTime)
    if (eligible) {
      state = 'entry'
      entry = createEntry()
      hud.showEntry(extractTime, placementTime(challengeBoard, extractTime), entry, {
        challenge: true,
        time: extractTime,
      })
    } else {
      showReboot()
    }
  }

  function toMenu() {
    armGen += 1
    state = 'menu'
    mode = 'run'
    paused = false
    pauseReason = null
    lesson = null
    extracted = false
    course = null
    hud.setGameMode(mode)
    hud.hidePaused()
    hud.hideLesson()
    hud.hideRespawn()
    bird.reset()
    obstacles.reset()
    powerups.reset()
    tunnel.reset()
    slow = 0
    speed = BASE_SPEED
    lives = 1
    shuntLeft = 0
    gatesSpawned = 0
    lifeSlot = -1
    rewindLeft = 0
    rewindTotal = 0
    shake = 0
    fovPunch = 0
    cleared = 0
    hud.setScore(0)
    hud.setBest(best)
    hud.setLives(1)
    hud.setSpeed(BASE_SPEED)
    hud.hideEntry()
    hud.showMenu()
    audio.title()
    refreshBoard()
  }

  function choose(item) {
    if (screen.needsRotate) return
    if (item === 'new') arm('run')
    else if (item === 'tutorial') arm('tutorial')
    else if (item === 'challenge') void beginChallenge()
    else if (item === 'help') hud.showHelp()
    else if (item === 'scores') openScores(scoresKind)
    else if (item === 'credits') {
      state = 'credits'
      hud.showCredits()
    }
  }

  async function beginChallenge() {
    const gen = ++armGen
    try {
      const data = await api.startRun('challenge')
      if (gen !== armGen || state !== 'menu') return
      const seed = Number(data.seed)
      const target = Number(data.target) || CHALLENGE_TARGET
      if (!Number.isFinite(seed) || !data.token || !data.day) throw new Error('bad course')
      arm('challenge', {
        token: data.token,
        day: data.day,
        target,
        now: Number(data.now) || Date.now(),
        course: generateCourse(createRng(seed >>> 0), target),
      })
    } catch {
      if (state === 'menu' && gen === armGen) hud.toast('BOARD OFFLINE', 'mag')
    }
  }

  function onGate(obs) {
    cleared += 1
    score += 1
    // Shunt overdrive: each gate scores double until the charge runs out.
    // The bonus itself feeds difficulty(), which is the price of the ride.
    let shuntSpent = false
    if (!tutorial() && shuntLeft > 0) {
      score += 1
      shuntLeft -= 1
      shuntSpent = shuntLeft === 0
    }
    const margin = passMargin(bird.pos, BIRD_RADIUS, obs)
    const close = margin < NEAR_MISS
    const milestone = !tutorial() && !challenge() && score % SECTOR === 0

    if (challenge()) hud.setExtract(cleared, challengeMeta.target, true)
    else hud.setScore(score, true)
    obstacles.celebrate(obs, bird.x, bird.y)
    obstacles.burstShape(obs, bird.x, bird.y, burst)
    fx.gateBurst(burst.x, burst.y, obs.z, burst.hw, burst.hh, burst.color, close ? 70 : 42)
    fx.kick(close ? 1 : 0.6)
    postfx.kick(close ? 1.1 : 0.55)
    SHARED.uKick.value = Math.max(SHARED.uKick.value, close ? 1 : 0.55)
    fovPunch = Math.max(fovPunch, close ? 6 : 3.2)
    audio.gate(score)

    if (close) {
      hud.toast('CLOSE CALL', 'mag')
      hud.hot()
      audio.nearMiss()
      postfx.flash(THEME.ice, 0.12)
    }
    if (milestone) {
      hud.toast(`SECTOR ${score / SECTOR}`, 'sodium')
      audio.milestone()
      postfx.flash(THEME.sodium, 0.22)
      SHARED.uKick.value = 1.4
    } else if (shuntSpent) {
      hud.toast('SHUNT SPENT', 'ice')
    } else if (!tutorial() && !challenge() && score === best + 1 && best > 0) {
      hud.toast('NEW BEST', 'ice')
      hud.setBest(score, true)
    }
    if (!tutorial() && !challenge() && score > best) hud.setBest(score, true)

    applySpeed()
    if (challenge() && cleared >= challengeMeta.target) extract()
  }

  function onOrb(orb) {
    if (orb.type === 'shunt') {
      // Tutorials never drop shunts; ignore one defensively if it arrives.
      if (tutorial()) return
      shuntLeft = SHUNT_GATES
      applySpeed()
      hud.toast('SHUNT ENGAGED', 'ice')
      fx.orbBurst(orb.x, orb.y, orb.z, THEME.ice)
      audio.shunt()
      postfx.flash(THEME.ice, 0.14)
      SHARED.uKick.value = Math.max(SHARED.uKick.value, 0.4)
      fx.kick(0.4)
      return
    }
    if (orb.type === 'life') {
      lives += 1
      hud.setLives(lives, true)
      hud.toast('SPARE +1', 'green')
      fx.orbBurst(orb.x, orb.y, orb.z, THEME.green)
      audio.life()
      postfx.flash(THEME.green, 0.14)
      SHARED.uKick.value = Math.max(SHARED.uKick.value, 0.4)
      fx.kick(0.4)
      teach('life')
      return
    }
    slow += tutorial() ? TUTORIAL_DAMPER : 0.5 * stageDelta(score)
    applySpeed()
    hud.toast('DAMPERS', 'gold')
    fx.orbBurst(orb.x, orb.y, orb.z)
    audio.orb()
    postfx.flash(THEME.gold, 0.1)
    SHARED.uKick.value = Math.max(SHARED.uKick.value, 0.4)
    fx.kick(0.4)
    teach('damper')
  }

  function spare(hitObs) {
    lives -= 1
    hud.setLives(lives)
    const anchor = hitObs ?? obstacles.nearestAhead()
    const back = anchor ? rewindDistance(anchor.z, anchor.gap) : 0
    powerups.cullBehind(anchor ? anchor.z : 0)
    bird.reset()
    // A hit burns the shunt charge. Speed is recomputed by hand: applySpeed()
    // would re-assert the drone hum that crash() just silenced.
    shuntLeft = 0
    speed = tutorial() ? tutorialSpeed(slow) : Math.max(BASE_SPEED, difficulty(score).speed - slow)
    hud.setSpeed(speed)
    audio.crash()
    fx.orbBurst(bird.x, bird.y, 0, THEME.green)
    postfx.flash(THEME.green, 0.5)
    postfx.glitch(0.5)
    shake = reduceMotion ? 0 : 0.25
    hitStop = 0.06
    state = 'respawn'
    rewindLeft = rewindTotal = back
    if (rewindLeft === 0) hud.showRespawn()
  }

  function resumeFromSpare() {
    state = 'playing'
    hud.hideRespawn()
    launchBird()
    audio.setSpeed(speed)
    onResume?.()
  }

  function updateCamera(dt) {
    const follow = state === 'menu' || state === 'credits' || state === 'scores' ? 0 : 0.32
    const tx = bird.x * follow
    const ty = 0.6 + bird.y * follow
    camBase.x = THREE.MathUtils.damp(camBase.x, tx, 6, dt)
    camBase.y = THREE.MathUtils.damp(camBase.y, ty, 6, dt)
    camBase.z = 6.4
    camera.position.copy(camBase)
    if (shake > 0) {
      shake = Math.max(0, shake - dt)
      const mag = shake * 0.6
      camera.position.x += (Math.random() - 0.5) * mag
      camera.position.y += (Math.random() - 0.5) * mag
    }
    look.set(bird.x * 0.18, bird.y * 0.18 + 0.15, 0)
    camera.lookAt(look)

    const targetRoll = state === 'playing' && !reduceMotion ? bird.bank * 0.35 : 0
    roll = THREE.MathUtils.damp(roll, targetRoll, 8, dt)
    camera.rotateZ(roll)

    if (fovPunch > 0 || camera.fov !== BASE_FOV) {
      fovPunch = Math.max(0, fovPunch - dt * 14)
      camera.fov = BASE_FOV + (reduceMotion ? 0 : fovPunch)
      camera.updateProjectionMatrix()
    }
  }

  function update(realDt) {
    if (input.muteEdge && state !== 'entry') {
      audio.toggleMute()
      hud.setMuted(audio.muted)
    }
    if (input.debugEdge && state !== 'entry') bird.toggleCollider()
    if (state === 'menu' || state === 'dead') {
      if (input.helpEdge) hud.toggleHelp()
      else if (input.backEdge && hud.helpOpen) hud.hideHelp()
    }

    let dt = realDt
    if (hitStop > 0) {
      hitStop -= realDt
      dt = 0
    }
    if (paused) dt = 0

    SHARED.uTime.value += dt
    SHARED.uKick.value = Math.max(0, SHARED.uKick.value - dt * 2.6)

    const tapped = input.flapEdge || input.restartEdge || input.tapEdge
    // While the manual is open, flaps must not start or reset a run.
    const blocked = screen.needsRotate || hud.helpOpen

    if (state === 'menu' || state === 'credits' || state === 'scores') {
      const dz = 2.2 * dt
      bird.updateIdle(dt, dz)
      scrollWorld(dz, dt)
      if (state === 'menu') {
        if (!blocked) {
          if (input.navEdge) hud.moveMenu(input.navEdge)
          if (input.selectEdge) choose(hud.menuItem)
        }
      } else if (state === 'scores') {
        if (input.hEdge) openScores(input.hEdge < 0 ? 'run' : 'challenge')
        else if (input.navEdge) openScores(input.navEdge < 0 ? 'run' : 'challenge')
        else if (tapped || input.backEdge || input.selectEdge) toMenu()
      } else if (tapped || input.backEdge || input.selectEdge) {
        toMenu()
      }
    } else if (state === 'playing') {
      // Esc leaves a tutorial; everywhere else it is the keyboard pause key alongside P.
      const pauseKey = input.pauseEdge || (!tutorial() && input.backEdge)
      if (tutorial() && input.backEdge) {
        toMenu()
      } else if (paused) {
        audio.clearHazard()
        if (pauseReason === 'countdown') {
          if (pauseKey) pause('menu')
          else tickCountdown(realDt)
        } else if (pauseKey && pauseReason === 'menu') continueRun()
        else if (tapped) tryResume()
      } else if (pauseKey) {
        holdMenu()
      } else {
        if (input.flapEdge) {
          bird.flap()
          audio.flap()
          fx.puff(bird.x, bird.y, 0, 9)
        }
        const dz = speed * dt
        bird.updatePlay(dt, input, dz)
        scrollWorld(dz, dt)
        const hitObs = obstacles.hits(bird.pos, BIRD_RADIUS)
        if (!god && (hitTunnel(bird.pos, BIRD_RADIUS) || hitObs)) {
          if (lives > 1) spare(hitObs)
          else die()
        } else {
          if (obstacles.collectScores(passed)) {
            for (const obs of passed) {
              onGate(obs)
              if (state !== 'playing') break
            }
          }
          if (state === 'playing') {
            spawnAhead()
            if (powerups.collect(bird.pos, BIRD_RADIUS, collected)) {
              for (const orb of collected) onOrb(orb)
            }
            const next = obstacles.nearestAhead()
            if (next) {
              const prox = next.z < 0 ? Math.max(0, Math.min(1, 1 + next.z / 38)) : 1
              audio.hazard(next.type, prox * prox)
            } else {
              audio.clearHazard()
            }
          }
        }
      }
    } else if (state === 'respawn') {
      if (tutorial() && input.backEdge) {
        toMenu()
      } else if (rewindLeft > 0) {
        const rate = rewindTotal / REWIND_TIME
        const step = Math.min(rewindLeft, rate * dt)
        scrollWorld(-step, dt)
        rewindLeft -= step
        if (rewindLeft === 0) hud.showRespawn()
        bird.updateIdle(dt, 0)
      } else if (tapped && !screen.needsRotate) {
        resumeFromSpare()
      } else {
        bird.updateIdle(dt, 0)
      }
    } else if (state === 'dead') {
      if (!extracted) bird.updateDead(dt)
      if (tapped && !blocked) toMenu()
    } else if (state === 'entry') {
      bird.updateDead(dt)
      if (input.charEdge) applyEntry({ char: input.charEdge })
      else if (input.navEdge) applyEntry(input.navEdge < 0 ? 'up' : 'down')
      else if (input.hEdge) applyEntry(input.hEdge < 0 ? 'left' : 'right')
      else if (input.eraseEdge) applyEntry('erase')
      else if (input.selectEdge) applyEntry('select')
      else if (input.backEdge && !input.eraseEdge) skipEntry()
    }

    hud.updateTouch(input)
    fx.update(dt, state === 'playing' && !paused ? speed : 2.2)
    postfx.update(paused ? 0 : realDt)
    updateCamera(paused ? 0 : realDt)
  }

  return {
    update,
    hud,
    syncScreen,
    setInputMode(next) {
      hud.setInputMode(next)
    },
    get state() {
      return state
    },
    get mode() {
      return mode
    },
    get lesson() {
      return lesson
    },
    get paused() {
      return paused
    },
    get pauseReason() {
      return pauseReason
    },
    get countdown() {
      return countdown
    },
    get score() {
      return score
    },
    get cleared() {
      return cleared
    },
    get extracted() {
      return extracted
    },
    get extractTime() {
      return extractTime
    },
    get pausedMs() {
      return clock.pausedMs
    },
    get lives() {
      return lives
    },
    get speed() {
      return speed
    },
    get shuntLeft() {
      return shuntLeft
    },
  }
}

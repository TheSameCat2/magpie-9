import * as THREE from 'three'
import { BIRD_RADIUS, BEST_KEY, SHARED, THEME } from './theme.js'
import { hitTunnel, passMargin } from './collision.js'
import { createHud } from './hud.js'

const NEAR_MISS = 0.34
const MILESTONE = 10
const BASE_FOV = 68
const BASE_SPEED = 12
const ORB_CHANCE = 0.5
const REWIND_TIME = 0.45
// How far past the last cleared gate the bird sits after a spare (z of that gate).
// Must clear the plate + collider so resume does not instantly re-hit it.
const RESPAWN_INSIDE = 1.2

export function rewindDistance(anchorZ, gap) {
  return Math.max(0, anchorZ + gap - RESPAWN_INSIDE)
}

export function pickLifeSlot(sectorStart, rand = Math.random) {
  return sectorStart + Math.floor(rand() * MILESTONE)
}

export function loadBest() {
  const n = Number(localStorage.getItem(BEST_KEY) || '0')
  return Number.isFinite(n) ? n : 0
}

export function saveBest(n) {
  localStorage.setItem(BEST_KEY, String(n))
}

export function difficulty(score) {
  const speed = Math.min(BASE_SPEED * Math.pow(1.03, score), 22)
  const spacing = Math.max(28 - score * 0.45, 18)
  const offset = Math.min(0.8 + score * 0.12, 1.8)
  return { speed, spacing, offset }
}

export function stageDelta(score) {
  return difficulty(score).speed - difficulty(Math.max(0, score - 1)).speed
}

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
}) {
  const hud = createHud()
  let state = 'title'
  let score = 0
  let best = loadBest()
  let speed = BASE_SPEED
  let slow = 0
  let lives = 1
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
  hud.showTitle()
  hud.bindSys({
    onMute() {
      audio.toggleMute()
      hud.setMuted(audio.muted)
    },
    onFullscreen() {
      screen.toggleFullscreen()
    },
  })

  function scrollWorld(dz, dt) {
    tunnel.scroll(dz)
    obstacles.scroll(dz, dt)
    powerups.scroll(dz, dt)
    SHARED.uScroll.value += dz
  }

  function applySpeed() {
    speed = Math.max(BASE_SPEED, difficulty(score).speed - slow)
    hud.setSpeed(speed)
    audio.setSpeed(speed)
  }

  function maybeDropOrbs(gates, diff) {
    for (const obs of gates) {
      const idx = gatesSpawned++
      if (idx % MILESTONE === 0) lifeSlot = pickLifeSlot(idx)
      const z = obs.z - diff.spacing * 0.5
      if (idx === lifeSlot) powerups.spawn(z, 'life')
      else if (Math.random() < ORB_CHANCE) powerups.spawn(z)
    }
  }

  function pause(reason) {
    pauseReason = reason
    if (state !== 'playing') {
      hud.showPaused(reason)
      return
    }
    if (!paused) {
      paused = true
      audio.title()
    }
    hud.showPaused(reason)
  }

  function tryResume() {
    if (!paused) return false
    if (screen.needsRotate || screen.hidden) return false
    paused = false
    pauseReason = null
    hud.hidePaused()
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
      hud.showPaused('resume')
    }
    if (screen.hidden) audio.suspend()
    else audio.resume()
  }

  function arm() {
    state = 'playing'
    paused = false
    pauseReason = null
    hud.hidePaused()
    score = 0
    slow = 0
    speed = BASE_SPEED
    lives = Math.max(1, startLives)
    gatesSpawned = 0
    lifeSlot = -1
    rewindLeft = 0
    rewindTotal = 0
    bird.reset()
    obstacles.reset()
    powerups.reset()
    hud.setLives(lives)
    hud.hideRespawn()
    const startDiff = difficulty(0)
    obstacles.ensureAhead(0, startDiff, spawned)
    maybeDropOrbs(spawned, startDiff)
    hud.setScore(0)
    hud.setSpeed(BASE_SPEED)
    hud.showPlaying()
    bird.flap()
    fx.puff(bird.x, bird.y, 0, 14)
    audio.arm()
    audio.flap()
    postfx.kick(0.5)
    SHARED.uKick.value = 0.6
  }

  function die() {
    if (state !== 'playing') return
    state = 'dead'
    paused = false
    pauseReason = null
    hud.hidePaused()
    hud.hideRespawn()
    bird.kill()
    audio.crash()
    fx.explode(bird.x, bird.y, 0)
    postfx.flash(0xffffff, 1)
    postfx.glitch(1)
    shake = reduceMotion ? 0 : 0.5
    hitStop = 0.09
    const newBest = score > best
    if (newBest) {
      best = score
      saveBest(best)
      hud.setBest(best, true)
    }
    hud.showDead(score, newBest && score > 0)
  }

  function toTitle() {
    state = 'title'
    paused = false
    pauseReason = null
    hud.hidePaused()
    hud.hideRespawn()
    bird.reset()
    obstacles.reset()
    powerups.reset()
    tunnel.reset()
    slow = 0
    speed = BASE_SPEED
    lives = 1
    gatesSpawned = 0
    lifeSlot = -1
    rewindLeft = 0
    rewindTotal = 0
    shake = 0
    fovPunch = 0
    hud.setScore(0)
    hud.setLives(1)
    hud.setSpeed(BASE_SPEED)
    hud.showTitle()
    audio.title()
  }

  function onGate(obs) {
    score += 1
    const margin = passMargin(bird.pos, BIRD_RADIUS, obs)
    const close = margin < NEAR_MISS
    const milestone = score % MILESTONE === 0

    hud.setScore(score, true)
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
      hud.toast(`SECTOR ${score / MILESTONE}`, 'sodium')
      audio.milestone()
      postfx.flash(THEME.sodium, 0.22)
      SHARED.uKick.value = 1.4
    } else if (score === best + 1 && best > 0) {
      hud.toast('NEW BEST', 'ice')
      hud.setBest(score, true)
    }
    if (score > best) hud.setBest(score, true)

    applySpeed()
  }

  function onOrb(orb) {
    if (orb.type === 'life') {
      lives += 1
      hud.setLives(lives, true)
      hud.toast('SPARE +1', 'green')
      fx.orbBurst(orb.x, orb.y, orb.z, THEME.green)
      audio.life()
      postfx.flash(THEME.green, 0.14)
      SHARED.uKick.value = Math.max(SHARED.uKick.value, 0.4)
      fx.kick(0.4)
      return
    }
    slow += 0.5 * stageDelta(score)
    applySpeed()
    hud.toast('DAMPERS', 'gold')
    fx.orbBurst(orb.x, orb.y, orb.z)
    audio.orb()
    postfx.flash(THEME.gold, 0.1)
    SHARED.uKick.value = Math.max(SHARED.uKick.value, 0.4)
    fx.kick(0.4)
  }

  function spare(hitObs) {
    lives -= 1
    hud.setLives(lives)
    const anchor = hitObs ?? obstacles.nearestAhead()
    const back = anchor ? rewindDistance(anchor.z, anchor.gap) : 0
    powerups.cullBehind(anchor ? anchor.z : 0)
    bird.reset()
    audio.crash()
    fx.orbBurst(bird.x, bird.y, 0, THEME.green)
    postfx.flash(THEME.green, 0.5)
    postfx.glitch(0.5)
    shake = reduceMotion ? 0 : 0.25
    hitStop = 0.06
    state = 'respawn'
    rewindLeft = rewindTotal = back
    if (reduceMotion && back > 0) {
      scrollWorld(-back, 0)
      rewindLeft = 0
    }
    if (rewindLeft === 0) hud.showRespawn()
  }

  function resumeFromSpare() {
    state = 'playing'
    hud.hideRespawn()
    bird.flap()
    audio.flap()
    fx.puff(bird.x, bird.y, 0, 9)
    audio.setSpeed(speed)
    onResume?.()
  }

  function updateCamera(dt) {
    const follow = state === 'title' ? 0 : 0.32
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
    if (input.muteEdge) {
      audio.toggleMute()
      hud.setMuted(audio.muted)
    }
    if (input.debugEdge) bird.toggleCollider()

    let dt = realDt
    if (hitStop > 0) {
      hitStop -= realDt
      dt = 0
    }
    if (paused) dt = 0

    SHARED.uTime.value += dt
    SHARED.uKick.value = Math.max(0, SHARED.uKick.value - dt * 2.6)

    const tapped = input.flapEdge || input.restartEdge || input.tapEdge

    if (state === 'title') {
      if (tapped && !screen.needsRotate) {
        arm()
      } else {
        const dz = 2.2 * dt
        bird.updateIdle(dt, dz)
        scrollWorld(dz, dt)
      }
    } else if (state === 'playing') {
      if (paused) {
        if (tapped) tryResume()
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
            for (const obs of passed) onGate(obs)
          }
          const diff = difficulty(score)
          obstacles.ensureAhead(score, diff, spawned)
          maybeDropOrbs(spawned, diff)
          if (powerups.collect(bird.pos, BIRD_RADIUS, collected)) {
            for (const orb of collected) onOrb(orb)
          }
        }
      }
    } else if (state === 'respawn') {
      if (rewindLeft > 0) {
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
      bird.updateDead(dt)
      if (tapped && !screen.needsRotate) toTitle()
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
    get paused() {
      return paused
    },
    get pauseReason() {
      return pauseReason
    },
    get score() {
      return score
    },
    get lives() {
      return lives
    },
    get speed() {
      return speed
    },
  }
}

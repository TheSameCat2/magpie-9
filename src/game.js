import * as THREE from 'three'
import { BIRD_RADIUS, BEST_KEY, SHARED, THEME } from './theme.js'
import { hitTunnel, passMargin } from './collision.js'
import { createHud } from './hud.js'

const NEAR_MISS = 0.34
const MILESTONE = 10
const BASE_FOV = 68

export function loadBest() {
  const n = Number(localStorage.getItem(BEST_KEY) || '0')
  return Number.isFinite(n) ? n : 0
}

export function saveBest(n) {
  localStorage.setItem(BEST_KEY, String(n))
}

export function difficulty(score) {
  const speed = Math.min(12 * Math.pow(1.03, score), 22)
  const spacing = Math.max(28 - score * 0.45, 18)
  const offset = Math.min(score * 0.14, 1.4)
  return { speed, spacing, offset }
}

export function createGame({ bird, tunnel, obstacles, input, camera, audio, fx, postfx, reduceMotion, god = false }) {
  const hud = createHud()
  let state = 'title'
  let score = 0
  let best = loadBest()
  let speed = 12
  let shake = 0
  let fovPunch = 0
  let hitStop = 0
  let roll = 0
  const camBase = new THREE.Vector3(0, 0.55, 6.4)
  const look = new THREE.Vector3()
  const passed = []
  const burst = { x: 0, y: 0, hw: 0, hh: 0, color: 0 }

  hud.setBest(best)
  hud.setScore(0)
  hud.setSpeed(12)
  hud.showTitle()

  function scrollWorld(dz, dt) {
    tunnel.scroll(dz)
    obstacles.scroll(dz, dt)
    SHARED.uScroll.value += dz
  }

  function arm() {
    state = 'playing'
    score = 0
    speed = 12
    bird.reset()
    obstacles.reset()
    obstacles.ensureAhead(0, difficulty(0))
    hud.setScore(0)
    hud.setSpeed(12)
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
    bird.reset()
    obstacles.reset()
    tunnel.reset()
    speed = 12
    shake = 0
    fovPunch = 0
    hud.setScore(0)
    hud.setSpeed(12)
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

    const diff = difficulty(score)
    speed = diff.speed
    hud.setSpeed(speed)
    audio.setSpeed(speed)
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
    if (input.muteEdge) audio.toggleMute()
    if (input.debugEdge) bird.toggleCollider()

    let dt = realDt
    if (hitStop > 0) {
      hitStop -= realDt
      dt = 0
    }

    SHARED.uTime.value += dt
    SHARED.uKick.value = Math.max(0, SHARED.uKick.value - dt * 2.6)

    if (state === 'title') {
      if (input.flapEdge) {
        arm()
      } else {
        const dz = 2.2 * dt
        bird.updateIdle(dt, dz)
        scrollWorld(dz, dt)
      }
    } else if (state === 'playing') {
      if (input.flapEdge) {
        bird.flap()
        audio.flap()
        fx.puff(bird.x, bird.y, 0, 9)
      }
      const dz = speed * dt
      bird.updatePlay(dt, input, dz)
      scrollWorld(dz, dt)
      if (obstacles.collectScores(passed)) {
        for (const obs of passed) onGate(obs)
      }
      obstacles.ensureAhead(score, difficulty(score))
      if (!god && (hitTunnel(bird.pos, BIRD_RADIUS) || obstacles.hits(bird.pos, BIRD_RADIUS))) {
        die()
      }
    } else if (state === 'dead') {
      bird.updateDead(dt)
      if (input.flapEdge || input.restartEdge) toTitle()
    }

    fx.update(dt, state === 'playing' ? speed : 2.2)
    postfx.update(realDt)
    updateCamera(realDt)
  }

  return {
    update,
    get state() {
      return state
    },
    get score() {
      return score
    },
    get speed() {
      return speed
    },
  }
}

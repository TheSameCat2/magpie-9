// Per-session numbers and the scoring rules that change them. No DOM, no
// Three.js: this is the part of a run that could be replayed on a server.

import {
  BASE_SPEED,
  CHALLENGE_TARGET,
  SHUNT_GATES,
  SHUNT_SPEED,
  difficulty,
  stageDelta,
} from '../config/rules.js'
import { TUTORIAL_DAMPER, tutorialSpeed } from '../config/tutorial.js'

// How far past the last cleared gate the bird sits after a spare (z of that gate).
// Must clear the plate + collider so resume does not instantly re-hit it.
const RESPAWN_INSIDE = 1.2

export function rewindDistance(anchorZ, gap) {
  return Math.max(0, anchorZ + gap - RESPAWN_INSIDE)
}

/**
 * @param startLives lives a fresh run begins with (debug knob)
 */
export function createRun({ startLives = 1 } = {}) {
  // run | tutorial | challenge — which rules the current (or next) session uses.
  let mode = 'run'
  let score = 0
  let gatesCleared = 0
  let gatesSpawned = 0
  let speed = BASE_SPEED
  /** Cumulative speed knocked off by damper orbs. */
  let damperTrim = 0
  let lives = 1
  let shuntLeft = 0
  let extracted = false
  let extractTime = 0
  let course = null
  let day = null
  let target = CHALLENGE_TARGET
  let token = null

  const run = {
    get mode() {
      return mode
    },
    get tutorial() {
      return mode === 'tutorial'
    },
    get challenge() {
      return mode === 'challenge'
    },
    /** A plain run: the only mode that counts toward the all-time board and personal best. */
    get scored() {
      return mode === 'run'
    },
    get score() {
      return score
    },
    get gatesCleared() {
      return gatesCleared
    },
    get speed() {
      return speed
    },
    get lives() {
      return lives
    },
    get shuntLeft() {
      return shuntLeft
    },
    get extracted() {
      return extracted
    },
    get extractTime() {
      return extractTime
    },
    get course() {
      return course
    },
    get day() {
      return day
    },
    get target() {
      return target
    },
    get token() {
      return token
    },
    set token(value) {
      token = value
    },

    /** Start a session; `session` carries the challenge course/token/day/target. */
    begin(nextMode = 'run', session = {}) {
      mode = nextMode
      score = 0
      gatesCleared = 0
      gatesSpawned = 0
      damperTrim = 0
      lives = Math.max(1, startLives)
      shuntLeft = 0
      extracted = false
      extractTime = 0
      course = session.course ?? null
      day = session.day ?? null
      target = session.target ?? CHALLENGE_TARGET
      token = session.token ?? null
      run.recomputeSpeed()
    },

    /** Back to the attract loop: plain run rules, base speed, nothing in flight. */
    end() {
      mode = 'run'
      score = 0
      gatesCleared = 0
      gatesSpawned = 0
      damperTrim = 0
      speed = BASE_SPEED
      lives = 1
      shuntLeft = 0
      extracted = false
      course = null
      token = null
    },

    /** Index of the next gate to spawn, for orb placement. */
    nextGateIndex() {
      return gatesSpawned++
    },

    /**
     * Cruise speed from the rules: difficulty for the score, minus dampers,
     * plus the shunt overdrive while it is charged. `withShunt = false` lets
     * a spare recompute without the (now burnt) charge.
     */
    recomputeSpeed({ withShunt = true } = {}) {
      if (run.tutorial) {
        const shunt = withShunt && shuntLeft > 0 ? SHUNT_SPEED : 0
        speed = tutorialSpeed(damperTrim) + shunt
      } else {
        const shunt = withShunt && shuntLeft > 0 ? SHUNT_SPEED : 0
        speed = Math.max(BASE_SPEED, difficulty(score).speed - damperTrim + shunt)
      }
      return speed
    },

    /**
     * Score a cleared gate. Shunt overdrive doubles the gate until the charge
     * runs out; the bonus feeds difficulty(), which is the price of the ride.
     */
    clearGate() {
      gatesCleared += 1
      score += 1
      let shuntSpent = false
      if (shuntLeft > 0) {
        score += 1
        shuntLeft -= 1
        shuntSpent = shuntLeft === 0
      }
      run.recomputeSpeed()
      return { shuntSpent, extract: run.challenge && gatesCleared >= target }
    },

    engageShunt() {
      shuntLeft = SHUNT_GATES
      run.recomputeSpeed()
    },

    addDamper() {
      damperTrim += run.tutorial ? TUTORIAL_DAMPER : 0.5 * stageDelta(score)
      run.recomputeSpeed()
    },

    addLife() {
      lives += 1
      return lives
    },

    /** Burn a spare: one life and the whole shunt charge. */
    spendLife() {
      lives -= 1
      shuntLeft = 0
      run.recomputeSpeed({ withShunt: false })
      return lives
    },

    markExtracted(ms) {
      extracted = true
      extractTime = ms
    },
  }

  return run
}

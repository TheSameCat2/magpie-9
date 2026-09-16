import { BASE_SPEED } from '../config/rules.js'
import { loadMuted, saveMuted } from '../lib/storage.js'
import { createAudioGraph } from './graph.js'
import { createOneShots } from './oneshots.js'
import { createDrone } from './drone.js'
import { createHazardHum } from './hum.js'

export { HAZARD_MAX_GAIN, hazardGain } from './hum.js'

// Pentatonic run the gate chime walks up; wraps an octave higher every lap.
const SCALE = [0, 2, 4, 7, 9]
const ROOT_HZ = 329.63 // E4

function noteHz(index) {
  const lap = Math.floor(index / SCALE.length)
  const step = SCALE[index % SCALE.length]
  return ROOT_HZ * Math.pow(2, (step + 12 * (lap % 2)) / 12)
}

/** Every sound the game makes. Procedural WebAudio; nothing is loaded. */
export function createAudio() {
  const graph = createAudioGraph({ muted: loadMuted() })
  const { tone, noise } = createOneShots(graph)
  const drone = createDrone(graph)
  const hum = createHazardHum(graph)

  return {
    get muted() {
      return graph.muted
    },
    /** Call from a user gesture so the context is allowed to start. */
    start() {
      graph.ensure()
    },
    suspend: graph.suspend,
    resume: graph.resume,
    toggleMute() {
      graph.setMuted(!graph.muted)
      saveMuted(graph.muted)
      return graph.muted
    },

    flap() {
      noise(0.14, 0.16, { from: 1400, to: 380, q: 1.1 })
      tone(520, 0.09, 'sine', 0.05, { endFreq: 720 })
    },
    gate(score) {
      const f = noteHz(score - 1)
      tone(f, 0.28, 'triangle', 0.16, { toWet: 0.9 })
      tone(f * 2, 0.16, 'sine', 0.06, { toWet: 0.6, when: 0.04 })
      tone(f * 0.5, 0.2, 'square', 0.03)
      noise(0.09, 0.08, { type: 'highpass', from: 3000, to: 6000 })
    },
    orb() {
      tone(880, 0.18, 'sine', 0.12, { endFreq: 1320, toWet: 0.9 })
      tone(1760, 0.3, 'triangle', 0.06, { toWet: 1, when: 0.06 })
      noise(0.12, 0.08, { type: 'highpass', from: 4000, to: 8000 })
    },
    life() {
      tone(784, 0.16, 'sine', 0.13, { endFreq: 1176, toWet: 0.95 })
      tone(1568, 0.32, 'triangle', 0.07, { toWet: 1, when: 0.08 })
      noise(0.1, 0.06, { type: 'highpass', from: 3500, to: 7000 })
    },
    shunt() {
      tone(1200, 0.14, 'sine', 0.11, { endFreq: 2400, toWet: 0.9 })
      tone(2400, 0.22, 'triangle', 0.06, { toWet: 1, when: 0.07 })
      noise(0.14, 0.07, { type: 'highpass', from: 4500, to: 9000 })
    },
    nearMiss() {
      noise(0.32, 0.22, { from: 2600, to: 500, q: 2.5 })
      tone(1800, 0.22, 'sine', 0.07, { endFreq: 900, toWet: 0.8, when: 0.02 })
    },
    milestone() {
      const f = noteHz(0) * 2
      tone(f, 0.22, 'triangle', 0.14, { toWet: 0.9 })
      tone(f * 1.5, 0.22, 'triangle', 0.14, { toWet: 0.9, when: 0.11 })
      tone(f * 2, 0.5, 'triangle', 0.16, { toWet: 1.0, when: 0.22 })
      tone(f * 4, 0.5, 'sine', 0.05, { toWet: 1.0, when: 0.22 })
    },
    crash() {
      noise(0.5, 0.5, { type: 'lowpass', from: 3500, to: 120, q: 0.7 })
      tone(110, 0.6, 'sine', 0.5, { endFreq: 28 })
      tone(70, 0.45, 'sawtooth', 0.14, { endFreq: 22 })
      for (let i = 0; i < 7; i++) {
        tone(200 + Math.random() * 1800, 0.05, 'square', 0.045, { when: 0.05 + i * 0.045 })
      }
      drone.crash()
      hum.silence()
    },
    /** One blip per resume-countdown digit. */
    tick() {
      tone(880, 0.07, 'square', 0.04, { toWet: 0.4 })
      tone(1760, 0.05, 'sine', 0.03, { when: 0.01 })
    },

    /** Proximity telegraph for the nearest gate ahead. */
    hazard: hum.set,
    clearHazard: hum.silence,

    /** Run start: bring the drone up and play the arm sting. */
    arm() {
      graph.ensure()
      drone.resetPitch()
      drone.set(1, BASE_SPEED)
      tone(180, 0.35, 'sawtooth', 0.06, { endFreq: 420 })
      tone(660, 0.12, 'sine', 0.05, { toWet: 0.6, when: 0.12 })
    },
    setSpeed(speed) {
      drone.set(1, speed)
    },
    /** Menu bed: drone at a quarter, hazard hum off. */
    title() {
      if (!graph.ready) return
      drone.resetPitch()
      drone.set(0.25, BASE_SPEED)
      hum.silence()
    },
  }
}

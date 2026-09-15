import { MUTE_KEY } from './theme.js'

// Pentatonic run the gate chime walks up; wraps an octave higher every lap.
const SCALE = [0, 2, 4, 7, 9]
const ROOT = 329.63 // E4

export const HAZARD_MAX_GAIN = 0.09

// Proximity hum level for the nearest gate ahead. `prox` is 0 far away, 1 at
// the bird. Squared so the hum stays bed-level until the gate commits.
export function hazardGain(prox) {
  const p = Math.max(0, Math.min(1, prox))
  return p * p * HAZARD_MAX_GAIN
}

function noteHz(index) {
  const lap = Math.floor(index / SCALE.length)
  const step = SCALE[index % SCALE.length]
  return ROOT * Math.pow(2, (step + 12 * (lap % 2)) / 12)
}

export function createAudio() {
  let muted = localStorage.getItem(MUTE_KEY) === '1'
  let ctx = null
  let master = null
  let wet = null
  let drone = null
  let noiseBuf = null
  let hum = null

  function ensure() {
    if (!ctx) {
      ctx = new AudioContext()
      build()
    }
    if (ctx.state === 'suspended' || ctx.state === 'interrupted') ctx.resume()
    return ctx
  }

  function build() {
    master = ctx.createGain()
    master.gain.value = muted ? 0 : 0.9
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -14
    comp.knee.value = 18
    comp.ratio.value = 6
    comp.attack.value = 0.004
    comp.release.value = 0.18
    master.connect(comp)
    comp.connect(ctx.destination)

    // Feedback delay shared by the melodic hits for a sense of space.
    wet = ctx.createGain()
    wet.gain.value = 0.32
    const delay = ctx.createDelay(1)
    delay.delayTime.value = 0.21
    const fb = ctx.createGain()
    fb.gain.value = 0.36
    const dampF = ctx.createBiquadFilter()
    dampF.type = 'lowpass'
    dampF.frequency.value = 2400
    wet.connect(delay)
    delay.connect(dampF)
    dampF.connect(fb)
    fb.connect(delay)
    dampF.connect(master)

    const n = ctx.sampleRate * 2
    noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate)
    const d = noiseBuf.getChannelData(0)
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1

    buildDrone()
  }

  function buildDrone() {
    const out = ctx.createGain()
    out.gain.value = 0
    const filt = ctx.createBiquadFilter()
    filt.type = 'lowpass'
    filt.frequency.value = 240
    filt.Q.value = 3
    filt.connect(out)
    out.connect(master)

    const oscs = []
    for (const [freq, type, g] of [
      [41.2, 'sawtooth', 0.35],
      [41.5, 'sawtooth', 0.3],
      [82.4, 'triangle', 0.25],
      [123.6, 'sine', 0.12],
    ]) {
      const o = ctx.createOscillator()
      o.type = type
      o.frequency.value = freq
      const og = ctx.createGain()
      og.gain.value = g
      o.connect(og)
      og.connect(filt)
      o.start()
      oscs.push({ o, base: freq })
    }

    const lfo = ctx.createOscillator()
    lfo.type = 'sine'
    lfo.frequency.value = 0.13
    const lfoG = ctx.createGain()
    lfoG.gain.value = 90
    lfo.connect(lfoG)
    lfoG.connect(filt.frequency)
    lfo.start()

    // Wind bed: bandpassed noise that opens up with speed.
    const wind = ctx.createBufferSource()
    wind.buffer = noiseBuf
    wind.loop = true
    const windF = ctx.createBiquadFilter()
    windF.type = 'bandpass'
    windF.frequency.value = 500
    windF.Q.value = 0.9
    const windG = ctx.createGain()
    windG.gain.value = 0
    wind.connect(windF)
    windF.connect(windG)
    windG.connect(master)
    wind.start()

    drone = { out, filt, oscs, windF, windG }
    buildHum()
  }

  // One persistent voice retuned per hazard type: no per-frame allocs, the
  // game just calls hazard()/clearHazard() and the gains chase.
  function buildHum() {
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.value = 55
    const filt = ctx.createBiquadFilter()
    filt.type = 'lowpass'
    filt.frequency.value = 240
    const gain = ctx.createGain()
    gain.gain.value = 0
    osc.connect(filt)
    filt.connect(gain)
    gain.connect(master)
    osc.start()

    const noise = ctx.createBufferSource()
    noise.buffer = noiseBuf
    noise.loop = true
    const noiseFilt = ctx.createBiquadFilter()
    noiseFilt.type = 'bandpass'
    noiseFilt.frequency.value = 800
    noiseFilt.Q.value = 1.1
    const noiseGain = ctx.createGain()
    noiseGain.gain.value = 0
    noise.connect(noiseFilt)
    noiseFilt.connect(noiseGain)
    noiseGain.connect(master)
    noise.start()

    hum = { osc, filt, gain, noiseFilt, noiseGain }
  }

  function silenceHum(t) {
    if (!hum) return
    hum.gain.gain.setTargetAtTime(0, t, 0.08)
    hum.noiseGain.gain.setTargetAtTime(0, t, 0.08)
  }

  function tone(freq, dur, type, gainVal, { endFreq, attack = 0.004, toWet = 0, when = 0 } = {}) {
    if (muted) return
    const ac = ensure()
    const t = ac.currentTime + when
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t)
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + dur)
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(gainVal, t + attack)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(gain)
    gain.connect(master)
    if (toWet > 0) {
      const send = ac.createGain()
      send.gain.value = toWet
      gain.connect(send)
      send.connect(wet)
    }
    osc.start(t)
    osc.stop(t + dur + 0.05)
  }

  function noise(dur, gainVal, { type = 'bandpass', from = 800, to = 300, q = 0.8, when = 0 } = {}) {
    if (muted) return
    const ac = ensure()
    const t = ac.currentTime + when
    const src = ac.createBufferSource()
    src.buffer = noiseBuf
    src.loop = true
    const f = ac.createBiquadFilter()
    f.type = type
    f.Q.value = q
    f.frequency.setValueAtTime(from, t)
    f.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur)
    const g = ac.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gainVal, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(f)
    f.connect(g)
    g.connect(master)
    src.start(t, Math.random() * 1.5)
    src.stop(t + dur + 0.05)
  }

  // Clears the crash power-down ramp so speed tracking can take over again.
  function resetPitch() {
    if (!drone) return
    const t = ctx.currentTime
    for (const { o, base } of drone.oscs) {
      o.frequency.cancelScheduledValues(t)
      o.frequency.setValueAtTime(base, t)
    }
  }

  function setDrone(level, speed) {
    if (!drone) return
    const t = ctx.currentTime
    drone.out.gain.setTargetAtTime(level * 0.55, t, 0.25)
    const s = Math.max(0, (speed - 12) / 10)
    drone.windG.gain.setTargetAtTime(level * (0.03 + s * 0.09), t, 0.4)
    drone.windF.frequency.setTargetAtTime(420 + s * 900, t, 0.4)
    drone.filt.frequency.setTargetAtTime(220 + s * 260, t, 0.5)
    for (const { o, base } of drone.oscs) o.frequency.setTargetAtTime(base * (1 + s * 0.06), t, 0.5)
  }

  return {
    get muted() {
      return muted
    },
    // Call from a user gesture so the context is allowed to start.
    start() {
      ensure()
    },
    suspend() {
      if (ctx && ctx.state === 'running') ctx.suspend()
    },
    resume() {
      if (ctx && (ctx.state === 'suspended' || ctx.state === 'interrupted')) ctx.resume()
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
      if (drone) {
        const t = ctx.currentTime
        for (const { o, base } of drone.oscs) {
          o.frequency.cancelScheduledValues(t)
          o.frequency.setValueAtTime(o.frequency.value, t)
          o.frequency.exponentialRampToValueAtTime(base * 0.3, t + 0.8)
        }
        drone.out.gain.setTargetAtTime(0, t + 0.1, 0.3)
        drone.windG.gain.setTargetAtTime(0, t, 0.1)
        silenceHum(t)
      }
    },
    shunt() {
      tone(1200, 0.14, 'sine', 0.11, { endFreq: 2400, toWet: 0.9 })
      tone(2400, 0.22, 'triangle', 0.06, { toWet: 1, when: 0.07 })
      noise(0.14, 0.07, { type: 'highpass', from: 4500, to: 9000 })
    },
    // Proximity telegraph for the nearest gate ahead. Silent until the audio
    // context exists (first user gesture) and while muted.
    hazard(type, prox) {
      if (!ctx || !hum || muted) return
      const t = ctx.currentTime
      const g = hazardGain(prox)
      if (type === 'laser-bar') {
        hum.osc.type = 'sine'
        hum.osc.frequency.setTargetAtTime(1350, t, 0.08)
        hum.filt.type = 'lowpass'
        hum.filt.frequency.setTargetAtTime(4200, t, 0.08)
        hum.gain.gain.setTargetAtTime(g * 0.8, t, 0.08)
        hum.noiseGain.gain.setTargetAtTime(0, t, 0.08)
      } else if (type === 'pylon' || type === 'sled') {
        hum.osc.type = 'sawtooth'
        hum.osc.frequency.setTargetAtTime(type === 'sled' ? 92 : 110, t, 0.08)
        hum.filt.type = 'bandpass'
        hum.filt.frequency.setTargetAtTime(type === 'sled' ? 600 : 700, t, 0.08)
        hum.gain.gain.setTargetAtTime(g * 0.5, t, 0.08)
        hum.noiseFilt.frequency.setTargetAtTime(900, t, 0.1)
        hum.noiseGain.gain.setTargetAtTime(g, t, 0.08)
      } else {
        hum.osc.type = 'sawtooth'
        hum.osc.frequency.setTargetAtTime(52, t, 0.08)
        hum.filt.type = 'lowpass'
        hum.filt.frequency.setTargetAtTime(220, t, 0.08)
        hum.gain.gain.setTargetAtTime(g, t, 0.08)
        hum.noiseFilt.frequency.setTargetAtTime(300, t, 0.1)
        hum.noiseGain.gain.setTargetAtTime(g * 0.4, t, 0.08)
      }
    },
    clearHazard() {
      if (!ctx) return
      silenceHum(ctx.currentTime)
    },
    arm() {
      ensure()
      resetPitch()
      setDrone(1, 12)
      tone(180, 0.35, 'sawtooth', 0.06, { endFreq: 420 })
      tone(660, 0.12, 'sine', 0.05, { toWet: 0.6, when: 0.12 })
    },
    setSpeed(speed) {
      if (ctx) setDrone(1, speed)
    },
    // One blip per resume-countdown digit.
    tick() {
      tone(880, 0.07, 'square', 0.04, { toWet: 0.4 })
      tone(1760, 0.05, 'sine', 0.03, { when: 0.01 })
    },
    title() {
      if (!ctx) return
      resetPitch()
      setDrone(0.25, 12)
      silenceHum(ctx.currentTime)
    },
    toggleMute() {
      muted = !muted
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
      if (master) master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.05)
      return muted
    },
  }
}

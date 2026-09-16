import { BASE_SPEED } from '../config/rules.js'

// The engine bed: detuned saws under a slow-wobbling lowpass, plus a wind
// layer that opens up with scroll speed.

const OSCILLATORS = [
  [41.2, 'sawtooth', 0.35],
  [41.5, 'sawtooth', 0.3],
  [82.4, 'triangle', 0.25],
  [123.6, 'sine', 0.12],
]

export function createDrone(graph) {
  let nodes = null

  graph.onBuild(({ ctx, master, noiseBuffer }) => {
    const out = ctx.createGain()
    out.gain.value = 0
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 240
    filter.Q.value = 3
    filter.connect(out)
    out.connect(master)

    const oscillators = OSCILLATORS.map(([freq, type, level]) => {
      const osc = ctx.createOscillator()
      osc.type = type
      osc.frequency.value = freq
      const gain = ctx.createGain()
      gain.gain.value = level
      osc.connect(gain)
      gain.connect(filter)
      osc.start()
      return { osc, base: freq }
    })

    const lfo = ctx.createOscillator()
    lfo.type = 'sine'
    lfo.frequency.value = 0.13
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = 90
    lfo.connect(lfoGain)
    lfoGain.connect(filter.frequency)
    lfo.start()

    const wind = ctx.createBufferSource()
    wind.buffer = noiseBuffer
    wind.loop = true
    const windFilter = ctx.createBiquadFilter()
    windFilter.type = 'bandpass'
    windFilter.frequency.value = 500
    windFilter.Q.value = 0.9
    const windGain = ctx.createGain()
    windGain.gain.value = 0
    wind.connect(windFilter)
    windFilter.connect(windGain)
    windGain.connect(master)
    wind.start()

    nodes = { out, filter, oscillators, windFilter, windGain }
  })

  /** Clears the crash power-down ramp so speed tracking can take over again. */
  function resetPitch() {
    if (!nodes) return
    const t = graph.now
    for (const { osc, base } of nodes.oscillators) {
      osc.frequency.cancelScheduledValues(t)
      osc.frequency.setValueAtTime(base, t)
    }
  }

  /** `level` 0..1 overall loudness; `speed` in world units/s opens the filter and wind. */
  function set(level, speed) {
    if (!nodes) return
    const t = graph.now
    const s = Math.max(0, (speed - BASE_SPEED) / 10)
    nodes.out.gain.setTargetAtTime(level * 0.55, t, 0.25)
    nodes.windGain.gain.setTargetAtTime(level * (0.03 + s * 0.09), t, 0.4)
    nodes.windFilter.frequency.setTargetAtTime(420 + s * 900, t, 0.4)
    nodes.filter.frequency.setTargetAtTime(220 + s * 260, t, 0.5)
    for (const { osc, base } of nodes.oscillators)
      osc.frequency.setTargetAtTime(base * (1 + s * 0.06), t, 0.5)
  }

  /** Power-down: pitch sags and the bed drops out. */
  function crash() {
    if (!nodes) return
    const t = graph.now
    for (const { osc, base } of nodes.oscillators) {
      osc.frequency.cancelScheduledValues(t)
      osc.frequency.setValueAtTime(osc.frequency.value, t)
      osc.frequency.exponentialRampToValueAtTime(base * 0.3, t + 0.8)
    }
    nodes.out.gain.setTargetAtTime(0, t + 0.1, 0.3)
    nodes.windGain.gain.setTargetAtTime(0, t, 0.1)
  }

  return { set, resetPitch, crash }
}

export const HAZARD_MAX_GAIN = 0.09

/**
 * Proximity hum level for the nearest gate ahead. `prox` is 0 far away, 1 at
 * the bird. Squared so the hum stays bed-level until the gate commits.
 */
export function hazardGain(prox) {
  const p = Math.max(0, Math.min(1, prox))
  return p * p * HAZARD_MAX_GAIN
}

// Per-hazard timbre: oscillator + tonal filter, and a noise layer.
const VOICES = {
  'laser-bar': {
    oscType: 'sine',
    oscHz: 1350,
    filterType: 'lowpass',
    filterHz: 4200,
    oscLevel: 0.8,
    noiseHz: null,
    noiseLevel: 0,
  },
  pylon: {
    oscType: 'sawtooth',
    oscHz: 110,
    filterType: 'bandpass',
    filterHz: 700,
    oscLevel: 0.5,
    noiseHz: 900,
    noiseLevel: 1,
  },
  sled: {
    oscType: 'sawtooth',
    oscHz: 92,
    filterType: 'bandpass',
    filterHz: 600,
    oscLevel: 0.5,
    noiseHz: 900,
    noiseLevel: 1,
  },
  bulkhead: {
    oscType: 'sawtooth',
    oscHz: 52,
    filterType: 'lowpass',
    filterHz: 220,
    oscLevel: 1,
    noiseHz: 300,
    noiseLevel: 0.4,
  },
}

/**
 * One persistent voice retuned per hazard type: no per-frame allocs, the game
 * just calls `set()` / `silence()` and the gains chase.
 */
export function createHazardHum(graph) {
  let nodes = null

  graph.onBuild(({ ctx, master, noiseBuffer }) => {
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.value = 55
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 240
    const gain = ctx.createGain()
    gain.gain.value = 0
    osc.connect(filter)
    filter.connect(gain)
    gain.connect(master)
    osc.start()

    const noise = ctx.createBufferSource()
    noise.buffer = noiseBuffer
    noise.loop = true
    const noiseFilter = ctx.createBiquadFilter()
    noiseFilter.type = 'bandpass'
    noiseFilter.frequency.value = 800
    noiseFilter.Q.value = 1.1
    const noiseGain = ctx.createGain()
    noiseGain.gain.value = 0
    noise.connect(noiseFilter)
    noiseFilter.connect(noiseGain)
    noiseGain.connect(master)
    noise.start()

    nodes = { osc, filter, gain, noiseFilter, noiseGain }
  })

  /** Retune to `type` at proximity `prox` (0..1). Silent until the context exists and while muted. */
  function set(type, prox) {
    if (!nodes || graph.muted) return
    const voice = VOICES[type] ?? VOICES.bulkhead
    const t = graph.now
    const g = hazardGain(prox)
    nodes.osc.type = voice.oscType
    nodes.osc.frequency.setTargetAtTime(voice.oscHz, t, 0.08)
    nodes.filter.type = voice.filterType
    nodes.filter.frequency.setTargetAtTime(voice.filterHz, t, 0.08)
    nodes.gain.gain.setTargetAtTime(g * voice.oscLevel, t, 0.08)
    if (voice.noiseHz !== null) nodes.noiseFilter.frequency.setTargetAtTime(voice.noiseHz, t, 0.1)
    nodes.noiseGain.gain.setTargetAtTime(g * voice.noiseLevel, t, 0.08)
  }

  function silence() {
    if (!nodes) return
    const t = graph.now
    nodes.gain.gain.setTargetAtTime(0, t, 0.08)
    nodes.noiseGain.gain.setTargetAtTime(0, t, 0.08)
  }

  return { set, silence }
}

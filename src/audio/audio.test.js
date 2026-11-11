import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hazardGain, HAZARD_MAX_GAIN } from './hum.js'
import { createAudioGraph } from './graph.js'
import { createOneShots } from './oneshots.js'

test('hazard hum is silent far away and capped at the bed level', () => {
  assert.equal(hazardGain(0), 0)
  assert.equal(hazardGain(1), HAZARD_MAX_GAIN)
})

test('hazard hum swells quadratically so it only commits late', () => {
  assert.ok(hazardGain(0.5) < HAZARD_MAX_GAIN * 0.3)
  assert.ok(hazardGain(0.9) > hazardGain(0.5))
})

test('hazard hum clamps out-of-range proximity', () => {
  assert.equal(hazardGain(-2), 0)
  assert.equal(hazardGain(99), HAZARD_MAX_GAIN)
})

test('createHazardHum skips redundant voice retuning and repeated silence calls', async () => {
  const { createHazardHum } = await import('./hum.js')
  let oscFreqCalls = 0
  let gainCalls = 0
  let buildHook = null
  const graph = {
    muted: false,
    now: 1.5,
    onBuild(fn) {
      buildHook = fn
    },
  }
  const hum = createHazardHum(graph)
  const makeNode = (onFreq, onGain) => ({
    type: 'sine',
    frequency: {
      value: 0,
      setTargetAtTime() {
        onFreq?.()
      },
    },
    gain: {
      value: 0,
      setTargetAtTime() {
        onGain?.()
      },
    },
    Q: { value: 0 },
    connect() {},
    start() {},
  })
  buildHook({
    ctx: {
      createOscillator: () => makeNode(() => oscFreqCalls++, null),
      createBiquadFilter: () => makeNode(null, null),
      createGain: () => makeNode(null, () => gainCalls++),
      createBufferSource: () => makeNode(null, null),
    },
    effects: {},
    noiseBuffer: {},
  })

  // Repeated silence while already at 0 gain is a no-op
  hum.silence()
  hum.silence()
  assert.equal(gainCalls, 0)

  // First call with bulkhead retunes oscillator once; subsequent calls with same type only update gain when prox changes
  hum.set('bulkhead', 0.5)
  assert.equal(oscFreqCalls, 1)
  assert.equal(gainCalls, 2)

  hum.set('bulkhead', 0.5)
  assert.equal(oscFreqCalls, 1)
  assert.equal(gainCalls, 2)

  hum.set('bulkhead', 0.8)
  assert.equal(oscFreqCalls, 1)
  assert.equal(gainCalls, 4)

  hum.silence()
  assert.equal(gainCalls, 6)
  hum.silence()
  assert.equal(gainCalls, 6)
})

test('createAudioGraph swallows rejected resume() and suspend() promises without unhandled rejections', async () => {
  let resumeCalls = 0
  let suspendCalls = 0
  let state = 'suspended'

  function FakeAudioContext() {
    const param = () => ({ value: 0, setTargetAtTime() {} })
    return {
      sampleRate: 8000,
      currentTime: 0,
      destination: {},
      get state() {
        return state
      },
      createGain: () => ({ gain: param(), connect() {} }),
      createDynamicsCompressor: () => ({
        threshold: param(),
        knee: param(),
        ratio: param(),
        attack: param(),
        release: param(),
        connect() {},
      }),
      createDelay: () => ({ delayTime: param(), connect() {} }),
      createBiquadFilter: () => ({ type: 'lowpass', frequency: param(), connect() {} }),
      createBuffer: (_ch, len) => ({ getChannelData: () => new Float32Array(len) }),
      resume() {
        resumeCalls += 1
        return Promise.reject(new Error('NotAllowedError'))
      },
      suspend() {
        suspendCalls += 1
        return Promise.reject(new Error('InvalidStateError'))
      },
    }
  }

  const graph = createAudioGraph({ AudioContextCtor: FakeAudioContext })
  graph.ensure()
  assert.equal(resumeCalls, 1)

  state = 'interrupted'
  graph.resume()
  assert.equal(resumeCalls, 2)

  state = 'running'
  graph.suspend()
  assert.equal(suspendCalls, 1)

  // Allow microtask/macrotask queues to flush; node:test fails if any rejection escaped unhandled.
  await new Promise((resolve) => setTimeout(resolve, 10))
})

test('createOneShots disconnects spent source, filter, gain, and wet-send nodes on ended', () => {
  const created = { oscs: [], sources: [], gains: [], filters: [] }
  const param = () => ({
    value: 0,
    setValueAtTime() {},
    exponentialRampToValueAtTime() {},
  })
  const makeTracked = (bucket) => {
    const node = {
      disconnected: 0,
      onended: null,
      type: 'sine',
      loop: false,
      buffer: null,
      frequency: param(),
      gain: param(),
      Q: param(),
      connect() {},
      start() {},
      stop() {},
      disconnect() {
        node.disconnected += 1
      },
    }
    bucket.push(node)
    return node
  }
  const ctx = {
    currentTime: 1,
    createOscillator: () => makeTracked(created.oscs),
    createBufferSource: () => makeTracked(created.sources),
    createGain: () => makeTracked(created.gains),
    createBiquadFilter: () => makeTracked(created.filters),
  }
  const graph = {
    muted: false,
    effects: {},
    wet: {},
    noiseBuffer: {},
    ensure: () => ctx,
  }

  const { tone, noise } = createOneShots(graph)

  // Tone with wet send allocates osc + voice gain + wet send gain
  tone(440, 0.2, 'triangle', 0.15, { toWet: 0.8 })
  assert.equal(created.oscs.length, 1)
  assert.equal(created.gains.length, 2)
  assert.equal(typeof created.oscs[0].onended, 'function')
  assert.equal(created.gains[0].disconnected, 0)
  assert.equal(created.gains[1].disconnected, 0)

  created.oscs[0].onended()
  assert.equal(created.oscs[0].disconnected, 1)
  assert.equal(created.gains[0].disconnected, 1)
  assert.equal(created.gains[1].disconnected, 1)

  // Noise burst allocates source + biquad filter + gain
  noise(0.14, 0.16, { from: 1400, to: 380, q: 1.1 })
  assert.equal(created.sources.length, 1)
  assert.equal(created.filters.length, 1)
  assert.equal(created.gains.length, 3)
  assert.equal(typeof created.sources[0].onended, 'function')

  created.sources[0].onended()
  assert.equal(created.sources[0].disconnected, 1)
  assert.equal(created.filters[0].disconnected, 1)
  assert.equal(created.gains[2].disconnected, 1)
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hazardGain, HAZARD_MAX_GAIN } from './hum.js'

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
    master: {},
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

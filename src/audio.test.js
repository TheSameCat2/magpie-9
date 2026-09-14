import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hazardGain, HAZARD_MAX_GAIN } from './audio.js'

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

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BASE_SPEED, FIRST_GATE_Z, SPEED_CAP, difficulty, minChallengeSeconds, minRunSeconds, rollOrbType } from './rules.js'

test('minRunSeconds(0) is zero', () => {
  assert.equal(minRunSeconds(0), 0)
  assert.equal(minRunSeconds(-3), 0)
})

test('minRunSeconds(1) is the first-gate cruise', () => {
  assert.equal(minRunSeconds(1), FIRST_GATE_Z / BASE_SPEED)
})

test('minRunSeconds is monotonic', () => {
  let prev = 0
  for (let n = 1; n <= 40; n++) {
    const t = minRunSeconds(n)
    assert.ok(t > prev, `n=${n}`)
    prev = t
  }
})

test('minRunSeconds uses the no-damper speed ramp', () => {
  const expected = FIRST_GATE_Z / BASE_SPEED + difficulty(1).spacing / difficulty(1).speed
  assert.ok(Math.abs(minRunSeconds(2) - expected) < 1e-9)
})

test('a ten-gate run is more than ten seconds', () => {
  assert.ok(minRunSeconds(10) > 10)
})

test('minChallengeSeconds uses the shunt-boosted cap', () => {
  const vmax = SPEED_CAP + 1.4
  const expected = FIRST_GATE_Z / vmax + difficulty(1).spacing / vmax
  assert.ok(Math.abs(minChallengeSeconds(2) - expected) < 1e-9)
})

test('rollOrbType splits shunts, dampers, and empty gates', () => {
  assert.equal(rollOrbType({ lifeDue: true }), 'life')
  assert.equal(rollOrbType({ rand: () => 0 }), 'shunt')
  assert.equal(rollOrbType({ rand: () => 0.14 }), 'shunt')
  assert.equal(rollOrbType({ rand: () => 0.2 }), 'damper')
  assert.equal(rollOrbType({ rand: () => 0.9 }), null)
})

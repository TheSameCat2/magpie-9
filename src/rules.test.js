import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BASE_SPEED, FIRST_GATE_Z, difficulty, minRunSeconds } from './rules.js'

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

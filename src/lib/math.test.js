import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clamp, clamp01, randomInDisc } from './math.js'

test('clamp pins a value to a closed range', () => {
  assert.equal(clamp(5, 0, 3), 3)
  assert.equal(clamp(-1, 0, 3), 0)
  assert.equal(clamp(2, 0, 3), 2)
  assert.equal(clamp01(1.5), 1)
})

test('randomInDisc stays inside the radius and is seed-driven', () => {
  const seq = [0.25, 0.81]
  const p = randomInDisc(2, () => seq.shift())
  assert.ok(Math.hypot(p.x, p.y) <= 2 + 1e-9)
  assert.ok(Math.abs(Math.hypot(p.x, p.y) - Math.sqrt(0.81) * 2) < 1e-9)
})

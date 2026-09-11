import { test } from 'node:test'
import assert from 'node:assert/strict'
import { difficulty, stageDelta, rewindDistance, pickLifeSlot } from './game.js'

test('difficulty at score 0 is the base speed', () => {
  assert.equal(difficulty(0).speed, 12)
})

test('stageDelta(0) is zero', () => {
  assert.equal(stageDelta(0), 0)
})

test('stageDelta(1) is about 0.36', () => {
  assert.ok(Math.abs(stageDelta(1) - 0.36) < 1e-9)
})

test('stageDelta is zero at the speed cap', () => {
  assert.equal(stageDelta(30), 0)
})

test('half of stageDelta(n) is 1.5% of the previous speed below the cap', () => {
  for (const n of [1, 5, 10, 15]) {
    const half = 0.5 * stageDelta(n)
    const expected = 0.015 * difficulty(n - 1).speed
    assert.ok(Math.abs(half - expected) < 1e-9, `score ${n}`)
  }
})

test('rewindDistance puts the last gate just behind the bird', () => {
  assert.equal(rewindDistance(0, 28), 26.8)
})

test('rewindDistance never moves the world forward', () => {
  assert.equal(rewindDistance(-27, 28), 0)
})

test('rewindDistance from partway through a gap', () => {
  assert.equal(rewindDistance(-5, 18), 11.8)
})

test('pickLifeSlot stays inside the sector', () => {
  assert.equal(pickLifeSlot(10, () => 0.99), 19)
  assert.equal(pickLifeSlot(10, () => 0), 10)
})

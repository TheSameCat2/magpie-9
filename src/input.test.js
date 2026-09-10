import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stickAxis, STICK_DEADZONE, STICK_RANGE } from './input.js'

test('stickAxis is zero inside the dead zone', () => {
  assert.equal(stickAxis(0), 0)
  assert.equal(stickAxis(STICK_DEADZONE), 0)
  assert.equal(stickAxis(-STICK_DEADZONE), 0)
  assert.equal(stickAxis(STICK_DEADZONE - 0.01), 0)
})

test('stickAxis is ±1 at and beyond full deflection', () => {
  assert.equal(stickAxis(STICK_DEADZONE + STICK_RANGE), 1)
  assert.equal(stickAxis(-(STICK_DEADZONE + STICK_RANGE)), -1)
  assert.equal(stickAxis(400), 1)
  assert.equal(stickAxis(-400), -1)
})

test('stickAxis is proportional between dead zone and range', () => {
  const mid = STICK_DEADZONE + STICK_RANGE * 0.5
  assert.ok(Math.abs(stickAxis(mid) - 0.5) < 1e-9)
  assert.ok(Math.abs(stickAxis(-mid) + 0.5) < 1e-9)
})

test('stickAxis accepts custom deadzone and range', () => {
  assert.equal(stickAxis(5, 10, 20), 0)
  assert.equal(stickAxis(20, 10, 20), 0.5)
  assert.equal(stickAxis(-30, 10, 20), -1)
})

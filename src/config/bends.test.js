import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BEND_LEAD,
  BEND_MAX_ANGLE,
  BEND_MAX_CURVATURE,
  BEND_MIN_ANGLE,
  BEND_START_GATE,
  BEND_TRAIL_SECONDS,
  SLIP_MAX,
  bendGap,
  bendTrail,
  rollBend,
  slipTarget,
} from './bends.js'
import { SHUNT_SPEED, SPEED_CAP } from './rules.js'
import { STRAFE_MAX } from './world.js'
import { createRng } from '../lib/rng.js'

test('the warm-up gaps never bend', () => {
  for (let i = 0; i < BEND_START_GATE; i++)
    assert.equal(
      rollBend(i, 50, () => 0),
      null,
    )
})

test('rollBend never turns harder than the clamp, at any score', () => {
  const rand = createRng(7)
  let seen = 0
  for (let score = 0; score < 400; score += 3) {
    for (let k = 0; k < 40; k++) {
      const bend = rollBend(BEND_START_GATE + k, score, rand)
      if (!bend) continue
      seen += 1
      assert.ok(Math.abs(bend.angle) <= BEND_MAX_ANGLE + 1e-12)
      assert.ok(Math.abs(bend.angle) >= BEND_MIN_ANGLE - 1e-12)
      assert.ok(Math.abs(bend.angle) / bend.length <= BEND_MAX_CURVATURE + 1e-12)
    }
  }
  assert.ok(seen > 100)
})

test('bends turn both ways', () => {
  const rand = createRng(3)
  const sides = new Set()
  for (let k = 0; k < 200; k++) {
    const bend = rollBend(10, 20, rand)
    if (bend) sides.add(Math.sign(bend.angle))
  }
  assert.deepEqual([...sides].sort(), [-1, 1])
})

test('the run-out after a late bend covers the trail time at the fastest possible speed', () => {
  const need = BEND_TRAIL_SECONDS * (SPEED_CAP + SHUNT_SPEED)
  assert.ok(bendTrail(200) >= need - 1e-9)
  const bend = rollBend(200, 200, () => 0)
  assert.ok(bend.trail >= need - 1e-9)
})

test('a bend gap holds the lead, the arc, and the trail, and never shrinks the spacing', () => {
  const bend = { lead: BEND_LEAD, length: 30, trail: 20 }
  assert.equal(bendGap(18, bend), BEND_LEAD + 30 + 20)
  assert.equal(bendGap(90, bend), 90)
  assert.equal(bendGap(18, null), 18)
})

test('slip pushes outward, away from the turn', () => {
  assert.ok(slipTarget(20, 0.01) < 0)
  assert.ok(slipTarget(20, -0.01) > 0)
  assert.ok(slipTarget(20, 0) === 0)
})

test('the sharpest bend at the fastest speed still leaves strafe to spare', () => {
  const vmax = SPEED_CAP + SHUNT_SPEED
  assert.ok(Math.abs(slipTarget(vmax, BEND_MAX_CURVATURE)) <= SLIP_MAX)
  assert.ok(SLIP_MAX < STRAFE_MAX)
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BEND_MAX_GAP, BEND_NEAR, BEND_SAMPLES, BEND_STEP } from '../config/bends.js'
import { BEND_TABLE_LENGTH, bendPoint, fillIdentity, headingOnTable } from '../lib/centreline.js'
import { createBends } from './bends.js'

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps

function table() {
  return new Float32Array(BEND_TABLE_LENGTH)
}

test('with no bends the table is the straight conduit and the map is the identity', () => {
  const bends = createBends()
  const t = bends.sample(table())
  const id = fillIdentity(table())
  for (let i = 0; i < BEND_TABLE_LENGTH; i++) assert.ok(near(t[i], id[i], 1e-4), `row ${i}`)
  const out = { x: 0, y: 0, z: 0 }
  for (const z of [5, 0, -10, -60, -200]) {
    bendPoint(t, 1.5, -2, z, out)
    assert.ok(near(out.x, 1.5, 1e-4) && out.y === -2 && near(out.z, z, 1e-3), `z ${z}`)
  }
})

test('heading after a whole arc equals its angle, and stays put in the straight beyond', () => {
  const bends = createBends()
  bends.spawn(-10, 20, 0.4)
  assert.equal(bends.headingAt(5), 0)
  assert.ok(near(bends.headingAt(20), 0.2))
  assert.ok(near(bends.headingAt(30), 0.4))
  assert.ok(near(bends.headingAt(80), 0.4))
  const t = bends.sample(table())
  assert.ok(near(headingOnTable(t, 80), 0.4, 1e-5))
})

test('curvature is only felt inside the arc', () => {
  const bends = createBends()
  bends.spawn(-10, 20, -0.3)
  assert.equal(bends.curvatureAt(0), 0)
  bends.scroll(15)
  assert.ok(near(bends.curvatureAt(0), -0.3 / 20))
  bends.scroll(20)
  assert.equal(bends.curvatureAt(0), 0)
})

test('a right turn swings the conduit ahead toward +X', () => {
  const bends = createBends()
  bends.spawn(-5, 25, 0.4)
  const t = bends.sample(table())
  const out = { x: 0, y: 0, z: 0 }
  bendPoint(t, 0, 0, -60, out)
  assert.ok(out.x > 10)
  assert.ok(out.z > -60 && out.z < -50)
})

test('bendPoint lands on the table rows and keeps the cross-section perpendicular', () => {
  const bends = createBends()
  bends.spawn(-2, 30, 0.35)
  const t = bends.sample(table())
  const out = { x: 0, y: 0, z: 0 }
  for (let i = 0; i < BEND_SAMPLES; i++) {
    const d = BEND_NEAR + i * BEND_STEP
    bendPoint(t, 0, 0, -d, out)
    assert.ok(near(out.x, t[i * 3], 1e-4) && near(out.z, t[i * 3 + 1], 1e-4), `row ${i}`)
  }
  // Two points across the conduit at the same depth stay 2·x apart.
  const a = bendPoint(t, -3, 0, -40, { x: 0, y: 0, z: 0 })
  const b = bendPoint(t, 3, 0, -40, { x: 0, y: 0, z: 0 })
  assert.ok(near(Math.hypot(a.x - b.x, a.z - b.z), 6, 1e-4))
})

test('the table keeps arc length: rows stay one step apart along the centreline', () => {
  const bends = createBends()
  bends.spawn(-1, 22, -0.43)
  const t = bends.sample(table())
  for (let i = 1; i < BEND_SAMPLES; i++) {
    const len = Math.hypot(t[i * 3] - t[i * 3 - 3], t[i * 3 + 1] - t[i * 3 - 2])
    assert.ok(near(len, BEND_STEP, 5e-3), `row ${i}: ${len}`)
  }
})

test('a bend survives the longest rewind after the camera has passed it', () => {
  const bends = createBends()
  bends.spawn(-10, 30, 0.3)
  bends.scroll(10 + 30 + BEND_MAX_GAP)
  assert.equal(bends.active().length, 1)
  bends.scroll(-BEND_MAX_GAP)
  assert.equal(bends.active().length, 1)
  bends.scroll(10_000)
  assert.equal(bends.active().length, 0)
})

test('reset clears every bend', () => {
  const bends = createBends()
  bends.spawn(-10, 30, 0.3)
  bends.reset()
  assert.equal(bends.active().length, 0)
  assert.equal(bends.curvatureAt(-20), 0)
})

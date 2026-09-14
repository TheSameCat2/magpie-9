import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hitOrb, hitObstacle, passMargin, hitRadius } from './collision.js'

test('hitOrb is true when centres are within the combined radii', () => {
  const orb = { x: 0, y: 0, z: 0, r: 0.42 }
  assert.equal(hitOrb({ x: 0, y: 0, z: 0 }, 0.5, orb), true)
  assert.equal(hitOrb({ x: 0.9, y: 0, z: 0 }, 0.5, orb), true)
})

test('hitOrb is false just outside the combined radii', () => {
  const orb = { x: 0, y: 0, z: 0, r: 0.42 }
  assert.equal(hitOrb({ x: 0.921, y: 0, z: 0 }, 0.5, orb), false)
})

test('hitOrb is false when only Z differs by more than the combined radii', () => {
  const orb = { x: 0, y: 0, z: -2, r: 0.42 }
  assert.equal(hitOrb({ x: 0, y: 0, z: 0 }, 0.5, orb), false)
})

const RADIUS = 0.5
const R = hitRadius(RADIUS)

function bulkhead(hole, z = 0, depth = 0.3) {
  return { type: 'bulkhead', z, depth, hole }
}

function laser(gapY, gapH = 3, z = 0, depth = 0.16) {
  return { type: 'laser-bar', z, depth, gapY, gapH }
}

function pylon(side, edge, z = 0, depth = 0.42) {
  return { type: 'pylon', z, depth, side, edge }
}

test('bulkhead: sphere fully inside the hole survives', () => {
  const obs = bulkhead({ x: 0, y: 0, w: 2.8, h: 3.2 })
  assert.equal(hitObstacle({ x: 0, y: 0, z: 0 }, RADIUS, obs), false)
})

test('bulkhead: sphere just touching a hole edge kills', () => {
  const obs = bulkhead({ x: 0, y: 0, w: 2.8, h: 3.2 })
  const xTouch = 1.4 - R
  assert.equal(hitObstacle({ x: xTouch - 1e-6, y: 0, z: 0 }, RADIUS, obs), false)
  assert.equal(hitObstacle({ x: xTouch, y: 0, z: 0 }, RADIUS, obs), true)
})

test('pylon kills a bird at x = 0 on both sides', () => {
  const pos = { x: 0, y: 0, z: 0 }
  assert.equal(hitObstacle(pos, RADIUS, pylon('left', 0.05)), true)
  assert.equal(hitObstacle(pos, RADIUS, pylon('right', -0.05)), true)
})

test('laser-bar kills at the sphere edge of the gap', () => {
  const obs = laser(0, 3)
  const edge = 1.5 - R
  assert.equal(hitObstacle({ x: 0, y: edge - 1e-6, z: 0 }, RADIUS, obs), false)
  assert.equal(hitObstacle({ x: 0, y: edge, z: 0 }, RADIUS, obs), true)
})

test('sled reads its live hole position like a bulkhead', () => {
  const at = (hx) => ({ type: 'sled', z: 0, depth: 0.3, hole: { x: hx, y: 0, w: 2.8, h: 3.2 } })
  assert.equal(hitObstacle({ x: 0, y: 0, z: 0 }, RADIUS, at(0)), false)
  assert.equal(hitObstacle({ x: 0, y: 0, z: 0 }, RADIUS, at(1.5)), true)
  assert.ok(passMargin({ x: 0, y: 0, z: 0 }, RADIUS, at(0)) > 0)
  assert.ok(passMargin({ x: 0, y: 0, z: 0 }, RADIUS, at(1.5)) <= 0)
})

test('passMargin is non-positive exactly when hitObstacle is true', () => {
  const cases = [
    { pos: { x: 0, y: 0, z: 0 }, obs: bulkhead({ x: 0, y: 0, w: 2.8, h: 3.2 }) },
    { pos: { x: 1.4 - R + 0.01, y: 0, z: 0 }, obs: bulkhead({ x: 0, y: 0, w: 2.8, h: 3.2 }) },
    { pos: { x: 0, y: 0, z: 0 }, obs: pylon('left', 0.05) },
    { pos: { x: 0, y: 1.5 - R - 0.01, z: 0 }, obs: laser(0, 3) },
    { pos: { x: 0, y: 1.5 - R + 0.01, z: 0 }, obs: laser(0, 3) },
  ]
  for (const { pos, obs } of cases) {
    const hit = hitObstacle(pos, RADIUS, obs)
    const margin = passMargin(pos, RADIUS, obs)
    assert.equal(margin <= 0, hit, `margin=${margin} hit=${hit}`)
  }
})

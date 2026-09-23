import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BIRD_HIT } from '../config/world.js'
import { hitOrb, hitObstacle, hitTunnel, passMargin, passContact } from './collision.js'

const HIT = BIRD_HIT
const origin = { x: 0, y: 0, z: 0 }

test('hitOrb is true when the orb overlaps the hull box', () => {
  const orb = { x: 0, y: 0, z: 0, r: 0.42 }
  assert.equal(hitOrb(origin, HIT, orb), true)
  assert.equal(hitOrb(origin, HIT, { x: HIT.x + 0.4, y: 0, z: 0, r: 0.42 }), true)
})

test('hitOrb is false just outside the hull box', () => {
  const r = 0.42
  assert.equal(hitOrb(origin, HIT, { x: HIT.x + r + 0.001, y: 0, z: 0, r }), false)
})

test('hitOrb is false when only Z differs by more than the hull plus orb', () => {
  assert.equal(hitOrb(origin, HIT, { x: 0, y: 0, z: -2, r: 0.42 }), false)
})

function bulkhead(hole, z = 0, depth = 0.3) {
  return { type: 'bulkhead', z, depth, hole }
}

function laser(gapY, gapH = 3, z = 0, depth = 0.16) {
  return { type: 'laser-bar', z, depth, gapY, gapH }
}

function pylon(side, edge, z = 0, depth = 0.42) {
  return { type: 'pylon', z, depth, side, edge }
}

test('bulkhead: hull fully inside the hole survives', () => {
  const obs = bulkhead({ x: 0, y: 0, w: 2.8, h: 3.2 })
  assert.equal(hitObstacle(origin, HIT, obs), false)
})

test('bulkhead: hull just touching a hole edge kills', () => {
  const obs = bulkhead({ x: 0, y: 0, w: 2.8, h: 3.2 })
  const xTouch = 1.4 - HIT.x
  assert.equal(hitObstacle({ x: xTouch - 1e-6, y: 0, z: 0 }, HIT, obs), false)
  assert.equal(hitObstacle({ x: xTouch, y: 0, z: 0 }, HIT, obs), true)
})

test('pylon kills a bird at x = 0 on both sides', () => {
  assert.equal(hitObstacle(origin, HIT, pylon('left', 0.05)), true)
  assert.equal(hitObstacle(origin, HIT, pylon('right', -0.05)), true)
})

test('laser-bar kills at the hull edge of the gap', () => {
  const obs = laser(0, 3)
  const edge = 1.5 - HIT.y
  assert.equal(hitObstacle({ x: 0, y: edge - 1e-6, z: 0 }, HIT, obs), false)
  assert.equal(hitObstacle({ x: 0, y: edge, z: 0 }, HIT, obs), true)
})

test('sled reads its live hole position like a bulkhead', () => {
  const at = (hx) => ({ type: 'sled', z: 0, depth: 0.3, hole: { x: hx, y: 0, w: 2.8, h: 3.2 } })
  assert.equal(hitObstacle(origin, HIT, at(0)), false)
  assert.equal(hitObstacle(origin, HIT, at(1.5)), true)
  assert.ok(passMargin(origin, HIT, at(0)) > 0)
  assert.ok(passMargin(origin, HIT, at(1.5)) <= 0)
})

test('passMargin is non-positive exactly when hitObstacle is true', () => {
  const cases = [
    { pos: origin, obs: bulkhead({ x: 0, y: 0, w: 2.8, h: 3.2 }) },
    { pos: { x: 1.4 - HIT.x + 0.01, y: 0, z: 0 }, obs: bulkhead({ x: 0, y: 0, w: 2.8, h: 3.2 }) },
    { pos: origin, obs: pylon('left', 0.05) },
    { pos: { x: 0, y: 1.5 - HIT.y - 0.01, z: 0 }, obs: laser(0, 3) },
    { pos: { x: 0, y: 1.5 - HIT.y + 0.01, z: 0 }, obs: laser(0, 3) },
  ]
  for (const { pos, obs } of cases) {
    const hit = hitObstacle(pos, HIT, obs)
    const margin = passMargin(pos, HIT, obs)
    assert.equal(margin <= 0, hit, `margin=${margin} hit=${hit}`)
  }
})

test('hitTunnel uses the hull half-extents, not a surrounding sphere', () => {
  assert.equal(hitTunnel(origin, HIT), false)
  // +Y faces a flat of the hex, so the wall is exactly R - hit.y from centre.
  assert.equal(hitTunnel({ x: 0, y: 4.2 - HIT.y + 0.01, z: 0 }, HIT), true)
  assert.equal(hitTunnel({ x: 0, y: 4.2 - HIT.y - 0.01, z: 0 }, HIT), false)
})

test('passContact calculates contact location and spray normal for near misses', () => {
  const obs = bulkhead({ x: 0, y: 0, w: 2.8, h: 3.2 })
  // Near miss on right vertical hatch edge
  const nearRightPos = { x: 1.4 - HIT.x - 0.1, y: 0, z: 0 }
  const contactRight = passContact(nearRightPos, HIT, obs)
  assert.ok(Math.abs(contactRight.margin - 0.1) < 1e-5)
  assert.ok(contactRight.x > nearRightPos.x)
  assert.equal(contactRight.nx, -1)
  assert.equal(contactRight.ny, 0)

  // Near miss on top laser edge
  const obsLaser = laser(0, 3)
  const nearTopLaserPos = { x: 0, y: 1.5 - HIT.y - 0.08, z: 0 }
  const contactLaser = passContact(nearTopLaserPos, HIT, obsLaser)
  assert.ok(Math.abs(contactLaser.margin - 0.08) < 1e-5)
  assert.equal(contactLaser.nx, 0)
  assert.equal(contactLaser.ny, -1)
})

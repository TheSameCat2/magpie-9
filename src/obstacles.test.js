import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BIRD_RADIUS, R } from './theme.js'
import { hexOutside, hitObstacle } from './collision.js'
import { difficulty } from './game.js'
import { HOLE_W, HOLE_H, layoutGate } from './obstacles.js'

function mulberry32(seed) {
  return function rand() {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function centred() {
  return { x: 0, y: 0, z: 0 }
}

test('pylons always hit a bird sitting on the conduit centre', () => {
  for (const sideRand of [0, 0.49, 0.5, 0.99]) {
    const layout = layoutGate('pylon', 1, () => sideRand)
    const obs = { type: 'pylon', z: 0, depth: 0.42, side: layout.side, edge: layout.edge }
    assert.equal(hitObstacle(centred(), BIRD_RADIUS, obs), true, `side=${layout.side}`)
  }
})

test('most post-tutorial bulkheads hit a bird that never strafes', () => {
  const rand = mulberry32(20260911)
  let hits = 0
  let n = 0
  for (let score = 2; score <= 20; score++) {
    const offset = difficulty(score).offset
    for (let i = 0; i < 40; i++) {
      const layout = layoutGate('bulkhead', offset, rand)
      const obs = { type: 'bulkhead', z: 0, depth: 0.3, hole: layout.hole }
      n += 1
      if (hitObstacle(centred(), BIRD_RADIUS, obs)) hits += 1
    }
  }
  assert.ok(hits / n >= 0.6, `centred-hit rate ${hits}/${n} = ${(hits / n).toFixed(3)}`)
})

test('every sampled bulkhead hole stays inside the hex', () => {
  const rand = mulberry32(99)
  const hw = HOLE_W * 0.5
  const hh = HOLE_H * 0.5
  for (let score = 0; score <= 20; score++) {
    const offset = score < 2 ? 0 : difficulty(score).offset
    for (let i = 0; i < 30; i++) {
      const { hole } = layoutGate('bulkhead', offset, rand)
      const corners = [
        [hole.x - hw, hole.y - hh],
        [hole.x - hw, hole.y + hh],
        [hole.x + hw, hole.y - hh],
        [hole.x + hw, hole.y + hh],
      ]
      for (const [x, y] of corners) {
        assert.equal(hexOutside(x, y, R), false, `score ${score} corner (${x.toFixed(3)}, ${y.toFixed(3)})`)
      }
    }
  }
})

test('tutorial offset 0 leaves the centre lane open', () => {
  const layout = layoutGate('bulkhead', 0, () => 0.3)
  const obs = { type: 'bulkhead', z: 0, depth: 0.3, hole: layout.hole }
  assert.equal(hitObstacle(centred(), BIRD_RADIUS, obs), false)
})

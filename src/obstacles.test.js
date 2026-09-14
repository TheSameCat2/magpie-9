import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BIRD_RADIUS, R } from './theme.js'
import { hexOutside, hitObstacle } from './collision.js'
import { difficulty } from './game.js'
import { HOLE_W, HOLE_H, layoutGate, pickType, SLED_MAX_AMP, SLED_MIN_PERIOD } from './obstacles.js'

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

test('tutorial offset 0 centres the laser band; runs still scatter it', () => {
  for (const r of [0, 0.25, 0.75, 0.99]) {
    assert.equal(layoutGate('laser-bar', 0, () => r).gapY, 0)
  }
  assert.notEqual(layoutGate('laser-bar', difficulty(3).offset, () => 0.99).gapY, 0)
})

test('sleds never appear before score 8 or inside the warm-up gates', () => {
  const lo = () => 0
  assert.equal(pickType(0, 20, lo), 'bulkhead')
  assert.equal(pickType(1, 20, lo), 'bulkhead')
  assert.equal(pickType(5, 7, lo), 'pylon')
  assert.equal(pickType(5, 8, lo), 'sled')
})

test('high rolls fall through to bulkhead at any score', () => {
  const hi = () => 0.99
  assert.equal(pickType(5, 20, hi), 'bulkhead')
})

test('sled motion stays bounded and quickens as the offset grows', () => {
  const soft = layoutGate('sled', difficulty(8).offset, mulberry32(7))
  const hard = layoutGate('sled', difficulty(20).offset, mulberry32(7))
  for (const layout of [soft, hard]) {
    assert.ok(layout.sled.amp <= SLED_MAX_AMP, `amp ${layout.sled.amp}`)
    assert.ok(layout.sled.period >= SLED_MIN_PERIOD, `period ${layout.sled.period}`)
  }
  assert.ok(hard.sled.period <= soft.sled.period)
})

test('every sled swing position stays inside the hex', () => {
  const rand = mulberry32(4242)
  const hw = HOLE_W * 0.5
  const hh = HOLE_H * 0.5
  for (let score = 8; score <= 22; score++) {
    const offset = difficulty(score).offset
    for (let i = 0; i < 20; i++) {
      const layout = layoutGate('sled', offset, rand)
      for (let k = 0; k < 8; k++) {
        const hx = layout.sled.baseX + layout.sled.amp * Math.sin((k / 8) * Math.PI * 2)
        const corners = [
          [hx - hw, layout.sled.baseY - hh],
          [hx - hw, layout.sled.baseY + hh],
          [hx + hw, layout.sled.baseY - hh],
          [hx + hw, layout.sled.baseY + hh],
        ]
        for (const [x, y] of corners) {
          assert.equal(hexOutside(x, y, R), false, `score ${score} phase ${k} corner (${x.toFixed(3)}, ${y.toFixed(3)})`)
        }
      }
    }
  }
})

test('pickType still returns sleds regardless of score once unlocked', () => {
  assert.equal(pickType(8, 8, () => 0), 'sled')
  assert.equal(pickType(20, 20, () => 0), 'sled')
})

test('a sled is never followed directly by another sled', () => {
  const lo = () => 0
  assert.equal(pickType(9, 20, lo, 'sled'), 'pylon')
  for (const prev of [null, 'bulkhead', 'laser-bar', 'pylon']) {
    assert.equal(pickType(9, 20, lo, prev), 'sled', `prev=${prev}`)
  }
})

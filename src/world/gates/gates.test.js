import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BIRD_HIT, TUNNEL_APOTHEM } from '../../config/world.js'
import { difficulty } from '../../config/rules.js'
import { createRng } from '../../lib/rng.js'
import { hexOutside, hitObstacle } from '../collision.js'
import {
  HOLE_W,
  HOLE_H,
  LASER_GAP,
  OPENING_EDGES,
  layoutGate,
  openingShape,
  pickGateType,
  SLED_MAX_AMP,
  SLED_MIN_PERIOD,
} from './layout.js'

function centred() {
  return { x: 0, y: 0, z: 0 }
}

function hatchCorners(x, y) {
  const hw = HOLE_W * 0.5
  const hh = HOLE_H * 0.5
  return [
    [x - hw, y - hh],
    [x - hw, y + hh],
    [x + hw, y - hh],
    [x + hw, y + hh],
  ]
}

test('pylons always hit a bird sitting on the conduit centre', () => {
  for (const sideRand of [0, 0.49, 0.5, 0.99]) {
    const layout = layoutGate('pylon', 1, () => sideRand)
    const gate = { type: 'pylon', z: 0, depth: 0.42, side: layout.side, edge: layout.edge }
    assert.equal(hitObstacle(centred(), BIRD_HIT, gate), true, `side=${layout.side}`)
  }
})

test('early post-tutorial bulkheads leave the hull a centre path', () => {
  const rand = createRng(20260911)
  const offset = difficulty(2).offset
  let hits = 0
  const n = 80
  for (let i = 0; i < n; i++) {
    const layout = layoutGate('bulkhead', offset, rand)
    const gate = { type: 'bulkhead', z: 0, depth: 0.3, hole: layout.hole }
    if (hitObstacle(centred(), BIRD_HIT, gate)) hits += 1
  }
  assert.equal(hits, 0, `centred-hit rate ${hits}/${n}`)
})

test('capped-offset bulkheads still punish a bird that never strafes', () => {
  const rand = createRng(20260911)
  const offset = difficulty(20).offset
  let hits = 0
  const n = 200
  for (let i = 0; i < n; i++) {
    const layout = layoutGate('bulkhead', offset, rand)
    const gate = { type: 'bulkhead', z: 0, depth: 0.3, hole: layout.hole }
    if (hitObstacle(centred(), BIRD_HIT, gate)) hits += 1
  }
  assert.ok(hits / n >= 0.4, `centred-hit rate ${hits}/${n} = ${(hits / n).toFixed(3)}`)
})

test('every sampled bulkhead hole stays inside the hex', () => {
  const rand = createRng(99)
  for (let score = 0; score <= 20; score++) {
    const offset = score < 2 ? 0 : difficulty(score).offset
    for (let i = 0; i < 30; i++) {
      const { hole } = layoutGate('bulkhead', offset, rand)
      for (const [x, y] of hatchCorners(hole.x, hole.y)) {
        assert.equal(
          hexOutside(x, y, TUNNEL_APOTHEM),
          false,
          `score ${score} corner (${x.toFixed(3)}, ${y.toFixed(3)})`,
        )
      }
    }
  }
})

test('tutorial offset 0 leaves the centre lane open', () => {
  const layout = layoutGate('bulkhead', 0, () => 0.3)
  const gate = { type: 'bulkhead', z: 0, depth: 0.3, hole: layout.hole }
  assert.equal(hitObstacle(centred(), BIRD_HIT, gate), false)
})

test('tutorial offset 0 centres the laser band; runs still scatter it', () => {
  for (const r of [0, 0.25, 0.75, 0.99]) {
    assert.equal(layoutGate('laser-bar', 0, () => r).gapY, 0)
  }
  assert.notEqual(layoutGate('laser-bar', difficulty(3).offset, () => 0.99).gapY, 0)
})

test('sleds never appear before score 8 or inside the warm-up gates', () => {
  const lo = () => 0
  assert.equal(pickGateType(0, 20, lo), 'bulkhead')
  assert.equal(pickGateType(1, 20, lo), 'bulkhead')
  assert.equal(pickGateType(5, 7, lo), 'pylon')
  assert.equal(pickGateType(5, 8, lo), 'sled')
})

test('high rolls fall through to bulkhead at any score', () => {
  const hi = () => 0.99
  assert.equal(pickGateType(5, 20, hi), 'bulkhead')
})

test('sled motion stays bounded and quickens as the offset grows', () => {
  const soft = layoutGate('sled', difficulty(8).offset, createRng(7))
  const hard = layoutGate('sled', difficulty(20).offset, createRng(7))
  for (const layout of [soft, hard]) {
    assert.ok(layout.sled.amp <= SLED_MAX_AMP, `amp ${layout.sled.amp}`)
    assert.ok(layout.sled.period >= SLED_MIN_PERIOD, `period ${layout.sled.period}`)
  }
  assert.ok(hard.sled.period <= soft.sled.period)
})

test('every sled swing position stays inside the hex', () => {
  const rand = createRng(4242)
  for (let score = 8; score <= 22; score++) {
    const offset = difficulty(score).offset
    for (let i = 0; i < 20; i++) {
      const { sled } = layoutGate('sled', offset, rand)
      for (let k = 0; k < 8; k++) {
        const hx = sled.baseX + sled.amp * Math.sin((k / 8) * Math.PI * 2)
        for (const [x, y] of hatchCorners(hx, sled.baseY)) {
          assert.equal(
            hexOutside(x, y, TUNNEL_APOTHEM),
            false,
            `score ${score} phase ${k} corner (${x.toFixed(3)}, ${y.toFixed(3)})`,
          )
        }
      }
    }
  }
})

test('pickGateType still returns sleds regardless of score once unlocked', () => {
  assert.equal(
    pickGateType(8, 8, () => 0),
    'sled',
  )
  assert.equal(
    pickGateType(20, 20, () => 0),
    'sled',
  )
})

test('opening shape traces the hatch rect and follows a sled hatch live', () => {
  const shape = {}
  const gate = { type: 'sled', hole: { x: 0.4, y: -0.3, w: HOLE_W, h: HOLE_H } }
  openingShape(gate, shape)
  assert.deepEqual(shape, {
    x: 0.4,
    y: -0.3,
    hw: HOLE_W / 2,
    hh: HOLE_H / 2,
    edges: OPENING_EDGES.all,
    nx: 0,
  })
  gate.hole.x = 1.1
  assert.equal(openingShape(gate, shape).x, 1.1)
})

test('opening shape spans the conduit for a laser band, horizontal edges only', () => {
  const shape = openingShape({ type: 'laser-bar', gapY: 0.7, gapH: LASER_GAP }, {})
  assert.equal(shape.x, 0)
  assert.equal(shape.y, 0.7)
  assert.equal(shape.hh, LASER_GAP / 2)
  assert.ok(shape.hw >= TUNNEL_APOTHEM)
  assert.equal(shape.edges, OPENING_EDGES.horizontal)
})

test('opening shape for a pylon is its open edge with the normal facing the gap', () => {
  for (const sideRand of [0, 0.99]) {
    const layout = layoutGate('pylon', 1, () => sideRand)
    const shape = openingShape({ type: 'pylon', side: layout.side, edge: layout.edge }, {})
    assert.equal(shape.x, layout.edge)
    assert.equal(shape.hw, 0)
    assert.equal(shape.edges, OPENING_EDGES.vertical)
    assert.equal(shape.nx, layout.side === 'left' ? 1 : -1, `side=${layout.side}`)
    assert.ok(hexOutside(shape.x, shape.hh, TUNNEL_APOTHEM) === false)
  }
})

test('a sled is never followed directly by another sled', () => {
  const lo = () => 0
  assert.equal(pickGateType(9, 20, lo, 'sled'), 'pylon')
  for (const prev of [null, 'bulkhead', 'laser-bar', 'pylon']) {
    assert.equal(pickGateType(9, 20, lo, prev), 'sled', `prev=${prev}`)
  }
})

test('createGateSlot allocates pooled mechanical details and configureGate positions them', async () => {
  const THREE = await import('three')
  const { createGateSlot, configureGate } = await import('./slot.js')
  const m = new THREE.MeshBasicMaterial()
  const materials = {
    plate: m,
    hatch: m,
    laserTop: m,
    laserBot: m,
    pylon: m,
    pylonEdge: m,
    metalHi: m,
    beak: m,
  }
  const slot = createGateSlot(materials)
  assert.equal(slot.pistons.length, 2, 'should have 2 hydraulic piston barrels')
  assert.equal(slot.pistonRods.length, 2, 'should have 2 chrome piston rods')
  assert.equal(slot.clamps.length, 4, 'should have 4 corner clamp dogs')
  assert.equal(slot.nozzles.length, 2, 'should have 2 laser emitter nozzles')
  assert.equal(slot.pylonBrackets.length, 2, 'should have 2 pylon wall brackets')

  // Bulkhead configuration activates pistons and clamps
  configureGate(slot, 'bulkhead', -10, 20, { hole: { x: 0.2, y: 0.4 } })
  assert.equal(slot.pistons[0].visible, true)
  assert.equal(slot.pistonRods[0].visible, true)
  assert.equal(slot.clamps[0].visible, true)
  assert.equal(slot.nozzles[0].visible, false)

  // Laser-bar configuration activates emitter nozzles and deactivates pistons
  configureGate(slot, 'laser-bar', -10, 20, { gapY: 0.5 })
  assert.equal(slot.pistons[0].visible, false)
  assert.equal(slot.nozzles[0].visible, true)
  assert.equal(slot.nozzles[1].visible, true)

  // Pylon configuration activates wall brackets
  configureGate(slot, 'pylon', -10, 20, { side: 'left', px: -1.5, edge: -0.2 })
  assert.equal(slot.nozzles[0].visible, false)
  assert.equal(slot.pylonBrackets[0].visible, true)
  assert.equal(slot.pylonBrackets[1].visible, true)
})

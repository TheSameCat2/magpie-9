import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BIRD_HIT, TUNNEL_APOTHEM } from '../../config/world.js'
import { difficulty } from '../../config/rules.js'
import { createRng } from '../../lib/rng.js'
import { hexOutside, hitObstacle } from '../collision.js'
import {
  HOLE_W,
  HOLE_H,
  LASER_COL_MAX_X,
  LASER_COL_MIN_SCORE,
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

test('vertical lasers never appear below their unlock score', () => {
  const lo = () => 0
  assert.notEqual(pickGateType(50, LASER_COL_MIN_SCORE - 1, lo), 'laser-col')
  assert.equal(pickGateType(50, LASER_COL_MIN_SCORE, lo), 'laser-col')
  assert.equal(pickGateType(1, LASER_COL_MIN_SCORE, lo), 'bulkhead')
})

test('below the unlock, pickGateType draws the same RNG sequence as before', () => {
  let draws = 0
  const counting = () => {
    draws += 1
    return 0.99
  }
  pickGateType(50, LASER_COL_MIN_SCORE - 1, counting, 'bulkhead')
  // sled, pylon, laser-bar rolls: the vertical laser must not add one.
  assert.equal(draws, 3)
})

test('a vertical laser never follows another or a pylon', () => {
  const lo = () => 0
  for (const prev of ['laser-col', 'pylon']) {
    assert.notEqual(pickGateType(120, 120, lo, prev), 'laser-col', `prev=${prev}`)
  }
  for (const prev of [null, 'bulkhead', 'laser-bar', 'sled']) {
    assert.equal(pickGateType(120, 120, lo, prev), 'laser-col', `prev=${prev}`)
  }
})

test('vertical laser bands stay bounded and scatter off-centre', () => {
  const rand = createRng(1234)
  const offset = difficulty(LASER_COL_MIN_SCORE).offset
  for (let i = 0; i < 200; i++) {
    const { gapX, gapW } = layoutGate('laser-col', offset, rand)
    assert.equal(gapW, LASER_GAP)
    assert.ok(Math.abs(gapX) <= LASER_COL_MAX_X, `gapX ${gapX}`)
    assert.equal(hexOutside(gapX + gapW / 2, 0, TUNNEL_APOTHEM), false)
    assert.equal(hexOutside(gapX - gapW / 2, 0, TUNNEL_APOTHEM), false)
  }
  assert.equal(layoutGate('laser-col', 0, () => 0.9).gapX, 0)
  assert.notEqual(layoutGate('laser-col', offset, () => 0.99).gapX, 0)
})

test('opening shape for a vertical laser spans the conduit height, side edges only', () => {
  const shape = openingShape({ type: 'laser-col', gapX: -0.9, gapW: LASER_GAP }, {})
  assert.equal(shape.x, -0.9)
  assert.equal(shape.y, 0)
  assert.equal(shape.hw, LASER_GAP / 2)
  assert.ok(shape.hh >= TUNNEL_APOTHEM)
  assert.equal(shape.edges, OPENING_EDGES.columns)
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

test('configureGate stands the laser slabs upright either side of a vertical band', async () => {
  const THREE = await import('three')
  const { createGateSlot, configureGate } = await import('./slot.js')
  const m = new THREE.MeshBasicMaterial()
  const slot = createGateSlot({
    plate: m,
    hatch: m,
    laserTop: m,
    laserBot: m,
    pylon: m,
    pylonEdge: m,
    metalHi: m,
    beak: m,
  })

  configureGate(slot, 'laser-col', -10, 20, { gapX: 0.8 })
  assert.equal(slot.gapX, 0.8)
  assert.equal(slot.gapW, LASER_GAP)
  const { laserBot: left, laserTop: right, frame } = slot
  assert.equal(left.visible, true)
  assert.equal(right.visible, true)
  assert.equal(left.rotation.z, -Math.PI / 2)
  // After the roll, scale.y is the slab's world width; its inner face is the gap edge.
  assert.ok(Math.abs(left.position.x + left.scale.y / 2 - (0.8 - LASER_GAP / 2)) < 1e-9)
  assert.ok(Math.abs(right.position.x - right.scale.y / 2 - (0.8 + LASER_GAP / 2)) < 1e-9)
  assert.equal(slot.nozzles[0].visible, true)
  assert.equal(frame.rotation.z, Math.PI / 2)

  // Reusing the slot for a horizontal laser or a bulkhead clears the roll.
  configureGate(slot, 'laser-bar', -10, 20, { gapY: 0.5 })
  assert.equal(slot.laserTop.rotation.z, 0)
  assert.equal(slot.laserBot.rotation.z, 0)
  assert.equal(frame.rotation.z, 0)
  configureGate(slot, 'laser-col', -10, 20, { gapX: 0 })
  configureGate(slot, 'bulkhead', -10, 20, { hole: { x: 0, y: 0 } })
  assert.equal(frame.rotation.z, 0)
  assert.equal(slot.laserTop.visible, false)
})

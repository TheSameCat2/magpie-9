import * as THREE from 'three'
import { THEME } from '../../config/theme.js'
import { TUNNEL_APOTHEM, TUNNEL_VERTEX_RADIUS } from '../../config/world.js'
import { createFrameMaterial, createRingMaterial } from '../../render/materials.js'
import { HOLE_H, HOLE_W, LASER_GAP, PYLON_W } from './layout.js'
import { PLATE_DEPTH, createBulkheadGeometry, unitBox, unitPlane } from './geometry.js'

// One pooled gate slot owns a mesh for every hazard type and shows only the
// set its current type needs. Rebuilding meshes per spawn would allocate in
// the hot path (PLAN.md rail 9).

export const GATE_COLOR = {
  bulkhead: THEME.ice,
  'laser-bar': THEME.mag,
  pylon: THEME.sodium,
  sled: THEME.mag,
}

const FRAME_MODE = { hatch: 0, band: 1, edge: 2 }
const LASER_DEPTH = 0.16
const PYLON_H = 8.2
const PYLON_D = 0.42
const RIM_T = 0.07
const SLAB_THICKNESS = 0.14
/** Shutters and slabs sit just ahead of the plate so they never z-fight it. */
const SLAB_LIFT = 0.16
/** Frame outline extends this far past the opening on each axis. */
const FRAME_MARGIN = 2.6

function hiddenMesh(geometry, material) {
  const mesh = new THREE.Mesh(geometry, material)
  mesh.visible = false
  return mesh
}

function hiddenMeshes(count, geometry, material) {
  return Array.from({ length: count }, () => hiddenMesh(geometry, material))
}

export function createGateSlot(materials) {
  const group = new THREE.Group()
  group.visible = false

  const bulkhead = hiddenMesh(new THREE.BufferGeometry(), materials.plate)
  const rims = hiddenMeshes(4, unitBox, materials.hatch)
  const laserTop = hiddenMesh(unitBox, materials.laserTop)
  const laserBot = hiddenMesh(unitBox, materials.laserBot)
  const pylon = hiddenMesh(unitBox, materials.pylon)
  const pylonEdge = hiddenMesh(unitBox, materials.pylonEdge)
  // Sled hatch: the plate carries a wide slot (full swing range) while two
  // shutter boxes ride with the hatch and cover the slot around it.
  const sledTop = hiddenMesh(unitBox, materials.plate)
  const sledBot = hiddenMesh(unitBox, materials.plate)
  const shutters = hiddenMeshes(2, unitBox, materials.plate)
  const frame = hiddenMesh(unitPlane, createFrameMaterial(THEME.ice))
  frame.renderOrder = 5
  const ring = hiddenMesh(unitPlane, createRingMaterial(THEME.ice))
  ring.renderOrder = 6

  group.add(
    bulkhead,
    ...rims,
    laserTop,
    laserBot,
    pylon,
    pylonEdge,
    sledTop,
    sledBot,
    ...shutters,
    frame,
    ring,
  )

  return {
    active: false,
    scored: false,
    type: 'bulkhead',
    z: 0,
    /** Distance from the previous gate; drives the spare-life rewind. */
    gap: 0,
    depth: PLATE_DEPTH,
    hole: { x: 0, y: 0, w: HOLE_W, h: HOLE_H },
    gapY: 0,
    gapH: LASER_GAP,
    side: 'left',
    edge: 0,
    /** Pass-flash intensity, decays after a thread. */
    hit: 0,
    /** Shockwave progress 0..1, or -1 when idle. */
    ringT: -1,
    sled: null,
    group,
    bulkhead,
    rims,
    laserTop,
    laserBot,
    pylon,
    pylonEdge,
    sledTop,
    sledBot,
    shutters,
    frame,
    ring,
    geometry: null,
  }
}

function hideParts(gate) {
  const parts = [
    gate.bulkhead,
    ...gate.rims,
    gate.laserTop,
    gate.laserBot,
    gate.pylon,
    gate.pylonEdge,
    gate.sledTop,
    gate.sledBot,
    ...gate.shutters,
    gate.frame,
    gate.ring,
  ]
  for (const part of parts) part.visible = false
  gate.sled = null
  gate.ringT = -1
  gate.hit = 0
}

function placeRims(gate, ox, oy) {
  const hw = HOLE_W * 0.5
  const hh = HOLE_H * 0.5
  const specs = [
    { x: ox, y: oy + hh, w: HOLE_W + RIM_T, h: RIM_T },
    { x: ox, y: oy - hh, w: HOLE_W + RIM_T, h: RIM_T },
    { x: ox - hw, y: oy, w: RIM_T, h: HOLE_H },
    { x: ox + hw, y: oy, w: RIM_T, h: HOLE_H },
  ]
  specs.forEach((s, i) => {
    const rim = gate.rims[i]
    rim.visible = true
    rim.scale.set(s.w, s.h, SLAB_THICKNESS)
    rim.position.set(s.x, s.y, 0)
  })
}

/**
 * Two full-width slabs above and below a horizontal opening centred at
 * `gapY` with height `gapH`, filling the conduit to the walls.
 */
function placeSlabs(top, bottom, gapY, gapH, z) {
  const reach = TUNNEL_APOTHEM + 0.4
  const topH = Math.max(0.4, reach - (gapY + gapH * 0.5))
  const botH = Math.max(0.4, gapY - gapH * 0.5 + reach)
  top.visible = true
  bottom.visible = true
  top.scale.set(TUNNEL_VERTEX_RADIUS * 2, topH, SLAB_THICKNESS)
  bottom.scale.set(TUNNEL_VERTEX_RADIUS * 2, botH, SLAB_THICKNESS)
  top.position.set(0, gapY + gapH * 0.5 + topH * 0.5, z)
  bottom.position.set(0, gapY - gapH * 0.5 - botH * 0.5, z)
}

// Rides the two shutter boxes with the moving hatch so the wide plate slot
// reads as a 2.8-wide hatch wherever it sits.
export function placeSledHatch(gate) {
  const hw = HOLE_W * 0.5
  const { x: ox, y: oy } = gate.hole
  const w = gate.sled.amp * 2 + 0.4
  const [left, right] = gate.shutters
  left.visible = true
  right.visible = true
  left.scale.set(w, HOLE_H, SLAB_THICKNESS)
  right.scale.set(w, HOLE_H, SLAB_THICKNESS)
  left.position.set(ox - hw - w * 0.5, oy, SLAB_LIFT)
  right.position.set(ox + hw + w * 0.5, oy, SLAB_LIFT)
  placeRims(gate, ox, oy)
}

function setFrame(gate, { mode, x, y, w, h, halfW, halfH, edgeSign = 1, color }) {
  const u = gate.frame.material.uniforms
  u.uMode.value = mode
  u.uSize.value.set(w, h)
  u.uHalf.value.set(halfW, halfH)
  u.uEdgeSign.value = edgeSign
  u.uProx.value = 0
  u.uHit.value = 0
  u.uColor.value.set(color)
  u.uSeed.value = Math.random()
  gate.frame.scale.set(w, h, 1)
  gate.frame.position.set(x, y, gate.depth * 0.5 + 0.05)
  gate.frame.visible = true
}

function swapPlateGeometry(gate, geometry) {
  if (gate.geometry) gate.geometry.dispose()
  gate.geometry = geometry
  gate.bulkhead.geometry = geometry
  gate.bulkhead.visible = true
}

function configureBulkhead(gate, layout) {
  const { x: ox, y: oy } = layout.hole
  gate.hole.x = ox
  gate.hole.y = oy
  gate.depth = PLATE_DEPTH
  swapPlateGeometry(gate, createBulkheadGeometry(ox, oy))
  placeRims(gate, ox, oy)
  setFrame(gate, {
    mode: FRAME_MODE.hatch,
    x: ox,
    y: oy,
    w: HOLE_W + FRAME_MARGIN,
    h: HOLE_H + FRAME_MARGIN,
    halfW: HOLE_W * 0.5,
    halfH: HOLE_H * 0.5,
    color: GATE_COLOR.bulkhead,
  })
}

function configureLaserBar(gate, layout) {
  gate.gapY = layout.gapY
  gate.gapH = LASER_GAP
  gate.depth = LASER_DEPTH
  placeSlabs(gate.laserTop, gate.laserBot, gate.gapY, LASER_GAP, 0)
  setFrame(gate, {
    mode: FRAME_MODE.band,
    x: 0,
    y: gate.gapY,
    w: TUNNEL_VERTEX_RADIUS * 2,
    h: LASER_GAP + 2.2,
    halfW: 0,
    halfH: LASER_GAP * 0.5,
    color: GATE_COLOR['laser-bar'],
  })
}

function configureSled(gate, layout) {
  // Wide slot in the plate covers the full swing; shutters + rims ride the
  // hatch itself. Collision reads gate.hole, same rect test as a bulkhead.
  const { baseX, baseY, amp } = layout.sled
  gate.hole.x = layout.hole.x
  gate.hole.y = layout.hole.y
  gate.sled = { ...layout.sled }
  gate.depth = PLATE_DEPTH
  swapPlateGeometry(gate, createBulkheadGeometry(baseX, baseY, HOLE_W * 0.5 + amp, HOLE_H * 0.5))
  placeSlabs(gate.sledTop, gate.sledBot, baseY, HOLE_H, SLAB_LIFT)
  placeSledHatch(gate)
  setFrame(gate, {
    mode: FRAME_MODE.hatch,
    x: baseX,
    y: baseY,
    w: HOLE_W + amp * 2 + FRAME_MARGIN,
    h: HOLE_H + FRAME_MARGIN,
    halfW: HOLE_W * 0.5,
    halfH: HOLE_H * 0.5,
    color: GATE_COLOR.sled,
  })
}

function configurePylon(gate, layout) {
  const { side, px, edge } = layout
  gate.side = side
  gate.edge = edge
  gate.depth = PYLON_D
  gate.pylon.visible = true
  gate.pylonEdge.visible = true
  // Negative X scale points local +X at the gap so the shared shader
  // can heat the open-edge bus without a per-slot uniform.
  gate.pylon.scale.set(side === 'left' ? PYLON_W : -PYLON_W, PYLON_H, PYLON_D)
  gate.pylon.position.set(px, 0, 0)
  gate.pylonEdge.scale.set(SLAB_THICKNESS, PYLON_H, PYLON_D + 0.1)
  gate.pylonEdge.position.set(edge, 0, 0)
  setFrame(gate, {
    mode: FRAME_MODE.edge,
    x: edge,
    y: 0,
    w: 2.8,
    h: PYLON_H + 1.2,
    halfW: 0,
    halfH: 0,
    edgeSign: side === 'left' ? -1 : 1,
    color: GATE_COLOR.pylon,
  })
}

const CONFIGURE = {
  bulkhead: configureBulkhead,
  'laser-bar': configureLaserBar,
  sled: configureSled,
  pylon: configurePylon,
}

/** Reset a slot to `type` at depth `z` using a precomputed `layout`. */
export function configureGate(gate, type, z, gap, layout) {
  hideParts(gate)
  gate.type = type
  gate.z = z
  gate.gap = gap
  gate.scored = false
  gate.active = true
  gate.group.visible = true
  gate.group.position.set(0, 0, z)
  CONFIGURE[type](gate, layout)
}

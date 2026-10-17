import * as THREE from 'three'
import { THEME } from '../../config/theme.js'
import { TUNNEL_APOTHEM, TUNNEL_VERTEX_RADIUS } from '../../config/world.js'
import { createFrameMaterial, createRingMaterial } from '../../render/materials.js'
import { GATE_COLOR, HOLE_H, HOLE_W, LASER_GAP, PYLON_W } from './kinds.js'
import {
  PLATE_DEPTH,
  createBulkheadGeometry,
  updateBulkheadGeometry,
  unitBox,
  unitCylinder,
  unitPlane,
} from './geometry.js'

// One pooled gate slot owns a mesh for every hazard type and shows only the
// set its current type needs. Rebuilding meshes per spawn would allocate in
// the hot path (PLAN.md rail 9).

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
  mesh.matrixAutoUpdate = false
  mesh.matrixWorldAutoUpdate = false
  return mesh
}

function hiddenMeshes(count, geometry, material) {
  return Array.from({ length: count }, () => hiddenMesh(geometry, material))
}

function showPart(gate, part) {
  part.visible = true
  part.updateMatrix()
  part.matrixWorld.copy(part.matrix)
  part.matrixWorld.elements[14] = part.matrix.elements[14] + gate.z
  gate.activeParts.push(part)
}

export function createGateSlot(materials) {
  const group = new THREE.Group()
  group.visible = false
  group.matrixAutoUpdate = false
  group.matrixWorldAutoUpdate = false

  const geometry = createBulkheadGeometry(0, 0)
  const bulkhead = hiddenMesh(geometry, materials.plate)
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

  // Heavy industrial mechanics
  const pistons = hiddenMeshes(2, unitCylinder, materials.metalHi)
  const pistonRods = hiddenMeshes(2, unitCylinder, materials.beak)
  const clamps = hiddenMeshes(4, unitBox, materials.metalHi)
  const nozzles = hiddenMeshes(2, unitBox, materials.metalHi)
  const pylonBrackets = hiddenMeshes(2, unitBox, materials.metalHi)

  const frame = hiddenMesh(unitPlane, createFrameMaterial(THEME.ice))
  frame.renderOrder = 5
  const ring = hiddenMesh(unitPlane, createRingMaterial(THEME.ice))
  ring.renderOrder = 6

  const parts = [
    bulkhead,
    ...rims,
    laserTop,
    laserBot,
    pylon,
    pylonEdge,
    sledTop,
    sledBot,
    ...shutters,
    ...pistons,
    ...pistonRods,
    ...clamps,
    ...nozzles,
    ...pylonBrackets,
    frame,
    ring,
  ]
  group.add(...parts)

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
    gapX: 0,
    gapW: LASER_GAP,
    side: 'left',
    edge: 0,
    /** Pass-flash intensity, decays after a thread. */
    hit: 0,
    /** Shockwave progress 0..1, or -1 when idle. */
    ringT: -1,
    sled: null,
    _sled: { baseX: 0, baseY: 0, amp: 0, freq: 0, period: 0, phase: 0 },
    group,
    parts,
    activeParts: [],
    bulkhead,
    rims,
    laserTop,
    laserBot,
    pylon,
    pylonEdge,
    sledTop,
    sledBot,
    shutters,
    pistons,
    pistonRods,
    clamps,
    nozzles,
    pylonBrackets,
    frame,
    ring,
    geometry,
  }
}

function hideParts(gate) {
  const active = gate.activeParts
  for (let i = 0; i < active.length; i++) {
    active[i].visible = false
  }
  active.length = 0
  gate.ring.visible = false
  gate.sled = null
  gate.ringT = -1
  gate.hit = 0
}

function placeHatchMechanics(gate, ox, oy) {
  const hw = HOLE_W * 0.5
  const hh = HOLE_H * 0.5
  const xL = ox - hw - 0.05
  const xR = ox + hw + 0.05
  const yB = oy - hh - 0.05
  const yT = oy + hh + 0.05
  const cz = SLAB_LIFT + 0.02

  // 4 corner locking clamp dogs
  const clamps = gate.clamps
  clamps[0].scale.set(0.18, 0.18, 0.22)
  clamps[0].position.set(xL, yB, cz)
  showPart(gate, clamps[0])

  clamps[1].scale.set(0.18, 0.18, 0.22)
  clamps[1].position.set(xR, yB, cz)
  showPart(gate, clamps[1])

  clamps[2].scale.set(0.18, 0.18, 0.22)
  clamps[2].position.set(xL, yT, cz)
  showPart(gate, clamps[2])

  clamps[3].scale.set(0.18, 0.18, 0.22)
  clamps[3].position.set(xR, yT, cz)
  showPart(gate, clamps[3])

  // 2 vertical hydraulic pistons (top & bottom)
  const pz = SLAB_LIFT + 0.04
  const pTop = gate.pistons[0]
  pTop.scale.set(0.13, 0.48, 0.13)
  pTop.position.set(ox, oy + hh + 0.4, pz)
  showPart(gate, pTop)

  const rodTop = gate.pistonRods[0]
  rodTop.scale.set(0.065, 0.32, 0.065)
  rodTop.position.set(ox, oy + hh + 0.16, pz)
  showPart(gate, rodTop)

  const pBot = gate.pistons[1]
  pBot.scale.set(0.13, 0.48, 0.13)
  pBot.position.set(ox, oy - hh - 0.4, pz)
  showPart(gate, pBot)

  const rodBot = gate.pistonRods[1]
  rodBot.scale.set(0.065, 0.32, 0.065)
  rodBot.position.set(ox, oy - hh - 0.16, pz)
  showPart(gate, rodBot)
}

function placeRims(gate, ox, oy) {
  const hw = HOLE_W * 0.5
  const hh = HOLE_H * 0.5
  const horizW = HOLE_W + RIM_T
  const rims = gate.rims

  rims[0].scale.set(horizW, RIM_T, SLAB_THICKNESS)
  rims[0].position.set(ox, oy + hh, 0)
  showPart(gate, rims[0])

  rims[1].scale.set(horizW, RIM_T, SLAB_THICKNESS)
  rims[1].position.set(ox, oy - hh, 0)
  showPart(gate, rims[1])

  rims[2].scale.set(RIM_T, HOLE_H, SLAB_THICKNESS)
  rims[2].position.set(ox - hw, oy, 0)
  showPart(gate, rims[2])

  rims[3].scale.set(RIM_T, HOLE_H, SLAB_THICKNESS)
  rims[3].position.set(ox + hw, oy, 0)
  showPart(gate, rims[3])

  placeHatchMechanics(gate, ox, oy)
}

/**
 * Two full-width slabs above and below a horizontal opening centred at
 * `gapY` with height `gapH`, filling the conduit to the walls.
 */
function placeSlabs(gate, top, bottom, gapY, gapH, z) {
  const reach = TUNNEL_APOTHEM + 0.4
  const topH = Math.max(0.4, reach - (gapY + gapH * 0.5))
  const botH = Math.max(0.4, gapY - gapH * 0.5 + reach)
  top.rotation.z = 0
  bottom.rotation.z = 0
  top.scale.set(TUNNEL_VERTEX_RADIUS * 2, topH, SLAB_THICKNESS)
  bottom.scale.set(TUNNEL_VERTEX_RADIUS * 2, botH, SLAB_THICKNESS)
  top.position.set(0, gapY + gapH * 0.5 + topH * 0.5, z)
  bottom.position.set(0, gapY - gapH * 0.5 - botH * 0.5, z)
  showPart(gate, top)
  showPart(gate, bottom)
}

/**
 * The laser slabs turned upright either side of a vertical opening at `gapX`.
 * Both roll -90° so local +Y points at world +X: the laserBot hot edge (local
 * +Y) then faces the gap from the left and laserTop's (local -Y) from the right.
 */
function placeColumnSlabs(gate, left, right, gapX, gapW) {
  const reach = TUNNEL_VERTEX_RADIUS + 0.4
  const span = (TUNNEL_APOTHEM + 0.4) * 2
  const leftW = Math.max(0.4, gapX - gapW * 0.5 + reach)
  const rightW = Math.max(0.4, reach - (gapX + gapW * 0.5))
  left.rotation.z = -Math.PI / 2
  right.rotation.z = -Math.PI / 2
  left.scale.set(span, leftW, SLAB_THICKNESS)
  right.scale.set(span, rightW, SLAB_THICKNESS)
  left.position.set(gapX - gapW * 0.5 - leftW * 0.5, 0, 0)
  right.position.set(gapX + gapW * 0.5 + rightW * 0.5, 0, 0)
  showPart(gate, left)
  showPart(gate, right)
}

// Rides the two shutter boxes with the moving hatch so the wide plate slot
// reads as a 2.8-wide hatch wherever it sits.
export function placeSledHatch(gate) {
  const hw = HOLE_W * 0.5
  const { x: ox, y: oy } = gate.hole
  const w = gate.sled.amp * 2 + 0.4
  const left = gate.shutters[0]
  const right = gate.shutters[1]
  left.scale.set(w, HOLE_H, SLAB_THICKNESS)
  right.scale.set(w, HOLE_H, SLAB_THICKNESS)
  left.position.set(ox - hw - w * 0.5, oy, SLAB_LIFT)
  right.position.set(ox + hw + w * 0.5, oy, SLAB_LIFT)
  showPart(gate, left)
  showPart(gate, right)
  placeRims(gate, ox, oy)
}

function movePartX(part, x) {
  part.position.x = x
  part.matrix.elements[12] = x
  part.matrixWorld.elements[12] = x
}

/** Fast per-frame X update for a sled hatch whose Y, Z, and scales are already configured. */
export function updateSledX(gate) {
  const hw = HOLE_W * 0.5
  const ox = gate.hole.x
  const halfShutter = gate.sled.amp + 0.2
  movePartX(gate.shutters[0], ox - hw - halfShutter)
  movePartX(gate.shutters[1], ox + hw + halfShutter)

  const rims = gate.rims
  movePartX(rims[0], ox)
  movePartX(rims[1], ox)
  movePartX(rims[2], ox - hw)
  movePartX(rims[3], ox + hw)

  const xL = ox - hw - 0.05
  const xR = ox + hw + 0.05
  const clamps = gate.clamps
  movePartX(clamps[0], xL)
  movePartX(clamps[1], xR)
  movePartX(clamps[2], xL)
  movePartX(clamps[3], xR)

  movePartX(gate.pistons[0], ox)
  movePartX(gate.pistons[1], ox)
  movePartX(gate.pistonRods[0], ox)
  movePartX(gate.pistonRods[1], ox)
}

function setFrame(gate, mode, x, y, w, h, halfW, halfH, edgeSign, color, roll) {
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
  gate.frame.rotation.z = roll
  gate.frame.position.set(x, y, gate.depth * 0.5 + 0.05)
  showPart(gate, gate.frame)
}

function configureBulkhead(gate, layout) {
  const { x: ox, y: oy } = layout.hole
  gate.hole.x = ox
  gate.hole.y = oy
  gate.depth = PLATE_DEPTH
  updateBulkheadGeometry(gate.geometry, ox, oy)
  showPart(gate, gate.bulkhead)
  placeRims(gate, ox, oy)
  setFrame(
    gate,
    FRAME_MODE.hatch,
    ox,
    oy,
    HOLE_W + FRAME_MARGIN,
    HOLE_H + FRAME_MARGIN,
    HOLE_W * 0.5,
    HOLE_H * 0.5,
    1,
    GATE_COLOR.bulkhead,
    0,
  )
}

function configureLaserBar(gate, layout) {
  gate.gapY = layout.gapY
  gate.gapH = LASER_GAP
  gate.depth = LASER_DEPTH
  placeSlabs(gate, gate.laserTop, gate.laserBot, gate.gapY, LASER_GAP, 0)

  // Ceramic emitter nozzle rails
  const topNozzle = gate.nozzles[0]
  topNozzle.scale.set(TUNNEL_VERTEX_RADIUS * 2, 0.12, LASER_DEPTH + 0.08)
  topNozzle.position.set(0, gate.gapY + LASER_GAP * 0.5 + 0.06, 0)
  showPart(gate, topNozzle)

  const botNozzle = gate.nozzles[1]
  botNozzle.scale.set(TUNNEL_VERTEX_RADIUS * 2, 0.12, LASER_DEPTH + 0.08)
  botNozzle.position.set(0, gate.gapY - LASER_GAP * 0.5 - 0.06, 0)
  showPart(gate, botNozzle)

  setFrame(
    gate,
    FRAME_MODE.band,
    0,
    gate.gapY,
    TUNNEL_VERTEX_RADIUS * 2,
    LASER_GAP + 2.2,
    0,
    LASER_GAP * 0.5,
    1,
    GATE_COLOR['laser-bar'],
    0,
  )
}

function configureLaserCol(gate, layout) {
  gate.gapX = layout.gapX
  gate.gapW = LASER_GAP
  gate.depth = LASER_DEPTH
  // laserBot glows on its local +Y, so it is the slab left of the gap.
  placeColumnSlabs(gate, gate.laserBot, gate.laserTop, gate.gapX, LASER_GAP)

  const railH = TUNNEL_APOTHEM * 2
  const leftNozzle = gate.nozzles[0]
  const rightNozzle = gate.nozzles[1]
  leftNozzle.scale.set(0.12, railH, LASER_DEPTH + 0.08)
  rightNozzle.scale.set(0.12, railH, LASER_DEPTH + 0.08)
  leftNozzle.position.set(gate.gapX - LASER_GAP * 0.5 - 0.06, 0, 0)
  rightNozzle.position.set(gate.gapX + LASER_GAP * 0.5 + 0.06, 0, 0)
  showPart(gate, leftNozzle)
  showPart(gate, rightNozzle)

  // The band-mode frame outlines a horizontal band; roll it upright.
  setFrame(
    gate,
    FRAME_MODE.band,
    gate.gapX,
    0,
    TUNNEL_APOTHEM * 2,
    LASER_GAP + 2.2,
    0,
    LASER_GAP * 0.5,
    1,
    GATE_COLOR['laser-col'],
    Math.PI / 2,
  )
}

function configureSled(gate, layout) {
  // Wide slot in the plate covers the full swing; shutters + rims ride the
  // hatch itself. Collision reads gate.hole, same rect test as a bulkhead.
  const { baseX, baseY, amp, freq, period, phase } = layout.sled
  gate.hole.x = layout.hole.x
  gate.hole.y = layout.hole.y
  const sled = gate._sled
  sled.baseX = baseX
  sled.baseY = baseY
  sled.amp = amp
  sled.freq = freq
  sled.period = period
  sled.phase = phase
  gate.sled = sled
  gate.depth = PLATE_DEPTH
  updateBulkheadGeometry(gate.geometry, baseX, baseY, HOLE_W * 0.5 + amp, HOLE_H * 0.5)
  showPart(gate, gate.bulkhead)
  placeSlabs(gate, gate.sledTop, gate.sledBot, baseY, HOLE_H, SLAB_LIFT)
  placeSledHatch(gate)
  setFrame(
    gate,
    FRAME_MODE.hatch,
    baseX,
    baseY,
    HOLE_W + amp * 2 + FRAME_MARGIN,
    HOLE_H + FRAME_MARGIN,
    HOLE_W * 0.5,
    HOLE_H * 0.5,
    1,
    GATE_COLOR.sled,
    0,
  )
}

function configurePylon(gate, layout) {
  const { side, px, edge } = layout
  gate.side = side
  gate.edge = edge
  gate.depth = PYLON_D

  // Wall anchor brackets
  const topBracket = gate.pylonBrackets[0]
  topBracket.scale.set(0.48, 0.22, PYLON_D + 0.06)
  topBracket.position.set(px, 3.8, 0)
  showPart(gate, topBracket)

  const botBracket = gate.pylonBrackets[1]
  botBracket.scale.set(0.48, 0.22, PYLON_D + 0.06)
  botBracket.position.set(px, -3.8, 0)
  showPart(gate, botBracket)

  // Negative X scale points local +X at the gap so the shared shader
  // can heat the open-edge bus without a per-slot uniform.
  gate.pylon.scale.set(side === 'left' ? PYLON_W : -PYLON_W, PYLON_H, PYLON_D)
  gate.pylon.position.set(px, 0, 0)
  showPart(gate, gate.pylon)

  gate.pylonEdge.scale.set(SLAB_THICKNESS, PYLON_H, PYLON_D + 0.1)
  gate.pylonEdge.position.set(edge, 0, 0)
  showPart(gate, gate.pylonEdge)

  setFrame(
    gate,
    FRAME_MODE.edge,
    edge,
    0,
    2.8,
    PYLON_H + 1.2,
    0,
    0,
    side === 'left' ? -1 : 1,
    GATE_COLOR.pylon,
    0,
  )
}

const CONFIGURE = {
  bulkhead: configureBulkhead,
  'laser-bar': configureLaserBar,
  'laser-col': configureLaserCol,
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
  gate.group.matrix.elements[14] = z
  gate.group.matrixWorld.elements[14] = z
  CONFIGURE[type](gate, layout)
}

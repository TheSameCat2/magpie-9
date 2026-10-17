// One hazard, one descriptor. Everything that used to be a string branch
// across layout, collision, sparks, and the gate pool lives here: where the
// opening sits, what it hits, and where its pass sparks erupt. Pure data and
// functions, no Three.js, so collision and course generation can share it.

import { TUNNEL_APOTHEM } from '../../config/world.js'
import { clamp } from '../../lib/math.js'
import { THEME } from '../../config/theme.js'

export const GATE_TYPES = ['bulkhead', 'laser-bar', 'laser-col', 'pylon', 'sled']

/**
 * Which sides of an opening shed sparks. `vertical` is a single edge facing
 * `nx`; `columns` is both vertical sides of a band.
 */
export const OPENING_EDGES = { all: 0, horizontal: 1, vertical: 2, columns: 3 }

export const HOLE_W = 2.8
export const HOLE_H = 3.2
export const LASER_GAP = 3.0
/** |X| bound on a vertical laser band's centre. */
export const LASER_COL_MAX_X = 1.7

// Vertical lasers are late-run variety: every difficulty() knob has capped
// long before this score, so they arrive as something new rather than a ramp.
export const LASER_COL_MIN_SCORE = 100
export const LASER_COL_CHANCE = 0.25
export const PYLON_W = 4.5
/** |X| of a pylon's centre; the open side starts at `edge`. */
export const PYLON_PX = 2.2

// Max sideways travel of a sled hatch and its motion bounds. Amplitude derives
// from the difficulty offset so difficulty() stays the single tuning source.
export const SLED_MAX_AMP = 1.1
export const SLED_MIN_PERIOD = 2.8

/** Half extents of the spark burst that erupts where the bird threaded a gate. */
const BURST_SPAN = 1.6
const BURST_EDGE = 0.05

/** Random point on a disc of radius `offset`, biased away from the centre. */
function hatchCentre(offset, rand, scale = 1) {
  const angle = rand() * Math.PI * 2
  const distance = offset * (0.55 + rand() * 0.45) * scale
  return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance }
}

// ------------------------------------------------------------------ layout

function layoutBulkhead(offset, rand) {
  const { x, y } = hatchCentre(offset, rand)
  return { hole: { x, y, w: HOLE_W, h: HOLE_H } }
}

function layoutLaserBar(offset, rand) {
  // Zero offset means a dead-centre band (tutorial); runs never reach lasers below 0.8.
  const gapY = offset > 0 ? clamp((rand() * 2 - 1) * Math.max(0.4, offset), -1.7, 1.7) : 0
  return { gapY, gapH: LASER_GAP }
}

function layoutLaserCol(offset, rand) {
  const gapX =
    offset > 0 ? clamp((rand() * 2 - 1) * Math.max(0.4, offset), -LASER_COL_MAX_X, LASER_COL_MAX_X) : 0
  return { gapX, gapW: LASER_GAP }
}

function layoutSled(offset, rand) {
  // A bulkhead hatch that slides in X. The base sits closer to centre than a
  // static hatch so the full swing stays inside the hex.
  const off = Math.max(0, offset)
  const { x: baseX, y: baseY } = hatchCentre(off, rand, 0.5)
  const amp = Math.min(SLED_MAX_AMP, off * 0.6)
  const period = Math.max(SLED_MIN_PERIOD, 4.8 - off * 0.8)
  return {
    hole: { x: baseX, y: baseY, w: HOLE_W, h: HOLE_H },
    sled: { baseX, baseY, amp, freq: (Math.PI * 2) / period, period, phase: rand() * Math.PI * 2 },
  }
}

function layoutPylon(_offset, rand) {
  const side = rand() < 0.5 ? 'left' : 'right'
  const px = side === 'left' ? -PYLON_PX : PYLON_PX
  return { side, px, edge: side === 'left' ? px + PYLON_W * 0.5 : px - PYLON_W * 0.5 }
}

// ---------------------------------------------------------------- collision

function hatchHit(pos, hit, gate) {
  const inHole =
    Math.abs(pos.x - gate.hole.x) < gate.hole.w * 0.5 - hit.x &&
    Math.abs(pos.y - gate.hole.y) < gate.hole.h * 0.5 - hit.y
  return !inHole
}

function hatchMargin(pos, hit, gate) {
  const mx = gate.hole.w * 0.5 - Math.abs(pos.x - gate.hole.x) - hit.x
  const my = gate.hole.h * 0.5 - Math.abs(pos.y - gate.hole.y) - hit.y
  return Math.min(mx, my)
}

function hatchContact(pos, hit, gate, out = {}) {
  const dx = pos.x - gate.hole.x
  const dy = pos.y - gate.hole.y
  const mx = gate.hole.w * 0.5 - Math.abs(dx) - hit.x
  const my = gate.hole.h * 0.5 - Math.abs(dy) - hit.y
  if (mx < my) {
    const signX = dx >= 0 ? 1 : -1
    out.margin = mx
    out.x = pos.x + signX * hit.x
    out.y = pos.y
    out.nx = -signX
    out.ny = 0
    return out
  }
  const signY = dy >= 0 ? 1 : -1
  out.margin = my
  out.x = pos.x
  out.y = pos.y + signY * hit.y
  out.nx = 0
  out.ny = -signY
  return out
}

function laserBarHit(pos, hit, gate) {
  return Math.abs(pos.y - gate.gapY) >= gate.gapH * 0.5 - hit.y
}

function laserBarMargin(pos, hit, gate) {
  return gate.gapH * 0.5 - Math.abs(pos.y - gate.gapY) - hit.y
}

function laserBarContact(pos, hit, gate, out = {}) {
  const dy = pos.y - gate.gapY
  const signY = dy >= 0 ? 1 : -1
  out.margin = gate.gapH * 0.5 - Math.abs(dy) - hit.y
  out.x = pos.x
  out.y = pos.y + signY * hit.y
  out.nx = 0
  out.ny = -signY
  return out
}

function laserColHit(pos, hit, gate) {
  return Math.abs(pos.x - gate.gapX) >= gate.gapW * 0.5 - hit.x
}

function laserColMargin(pos, hit, gate) {
  return gate.gapW * 0.5 - Math.abs(pos.x - gate.gapX) - hit.x
}

function laserColContact(pos, hit, gate, out = {}) {
  const dx = pos.x - gate.gapX
  const signX = dx >= 0 ? 1 : -1
  out.margin = gate.gapW * 0.5 - Math.abs(dx) - hit.x
  out.x = pos.x + signX * hit.x
  out.y = pos.y
  out.nx = -signX
  out.ny = 0
  return out
}

function pylonHit(pos, hit, gate) {
  if (gate.side === 'left') return pos.x < gate.edge + hit.x
  return pos.x > gate.edge - hit.x
}

function pylonMargin(pos, hit, gate) {
  return Math.abs(pos.x - gate.edge) - hit.x
}

function pylonContact(pos, hit, gate, out = {}) {
  const dx = pos.x - gate.edge
  const signX = dx >= 0 ? 1 : -1
  out.margin = Math.abs(dx) - hit.x
  out.x = pos.x - signX * hit.x
  out.y = pos.y
  out.nx = signX
  out.ny = 0
  return out
}

// ------------------------------------------------------------ spark shapes

/**
 * The whole perimeter of a live gate's opening, for sparks that ride the
 * edge rather than erupt where the bird threaded it. Writes into `shape`:
 * centre, half extents, which edges apply, and (for a pylon) the normal
 * pointing into the gap. Reads `hole` live so a sled's sparks ride the hatch.
 */
function hatchOpening(gate, shape) {
  shape.x = gate.hole.x
  shape.y = gate.hole.y
  shape.hw = HOLE_W * 0.5
  shape.hh = HOLE_H * 0.5
  shape.edges = OPENING_EDGES.all
  shape.nx = 0
  return shape
}

function laserBarOpening(gate, shape) {
  shape.x = 0
  shape.y = gate.gapY
  shape.hw = TUNNEL_APOTHEM
  shape.hh = gate.gapH * 0.5
  shape.edges = OPENING_EDGES.horizontal
  shape.nx = 0
  return shape
}

function laserColOpening(gate, shape) {
  shape.x = gate.gapX
  shape.y = 0
  shape.hw = gate.gapW * 0.5
  shape.hh = TUNNEL_APOTHEM
  shape.edges = OPENING_EDGES.columns
  shape.nx = 0
  return shape
}

function pylonOpening(gate, shape) {
  shape.x = gate.edge
  shape.y = 0
  shape.hw = 0
  shape.hh = TUNNEL_APOTHEM * 0.85
  shape.edges = OPENING_EDGES.vertical
  shape.nx = gate.side === 'left' ? 1 : -1
  return shape
}

/** The tight burst at the point the bird threaded a gate; writes into `shape`. */
function hatchBurst(gate, bx, by, shape) {
  shape.x = gate.hole.x
  shape.y = gate.hole.y
  shape.hw = HOLE_W * 0.5
  shape.hh = HOLE_H * 0.5
  return shape
}

function laserBarBurst(gate, bx, by, shape) {
  shape.x = bx
  shape.y = gate.gapY
  shape.hw = BURST_SPAN
  shape.hh = gate.gapH * 0.5
  return shape
}

function laserColBurst(gate, bx, by, shape) {
  shape.x = gate.gapX
  shape.y = by
  shape.hw = gate.gapW * 0.5
  shape.hh = BURST_SPAN
  return shape
}

function pylonBurst(gate, bx, by, shape) {
  shape.x = gate.edge
  shape.y = by
  shape.hw = BURST_EDGE
  shape.hh = BURST_SPAN
  return shape
}

// --------------------------------------------------------------- descriptors

// Geometric hazards (bulkhead and sled) share the hatch collider and spark
// shape; a kind only needs to override what differs.
const HATCH = {
  hatch: true,
  color: THEME.ice,
  layout: layoutBulkhead,
  hit: hatchHit,
  margin: hatchMargin,
  contact: hatchContact,
  opening: hatchOpening,
  burst: hatchBurst,
}

export const GATE_KINDS = {
  bulkhead: HATCH,
  'laser-bar': {
    hatch: false,
    color: THEME.mag,
    layout: layoutLaserBar,
    hit: laserBarHit,
    margin: laserBarMargin,
    contact: laserBarContact,
    opening: laserBarOpening,
    burst: laserBarBurst,
  },
  'laser-col': {
    hatch: false,
    color: THEME.mag,
    layout: layoutLaserCol,
    hit: laserColHit,
    margin: laserColMargin,
    contact: laserColContact,
    opening: laserColOpening,
    burst: laserColBurst,
  },
  pylon: {
    hatch: false,
    color: THEME.sodium,
    layout: layoutPylon,
    hit: pylonHit,
    margin: pylonMargin,
    contact: pylonContact,
    opening: pylonOpening,
    burst: pylonBurst,
  },
  sled: {
    ...HATCH,
    color: THEME.mag,
    layout: layoutSled,
  },
}

/** Colour per hazard, for the frame, ring, and edge sparks. */
export const GATE_COLOR = Object.fromEntries(GATE_TYPES.map((type) => [type, GATE_KINDS[type].color]))

export function isHatchGate(gate) {
  return GATE_KINDS[gate.type]?.hatch === true
}

/** Pure gate placement: which hazard spawns and where its opening sits. */
export function layoutGate(type, offset, rand = Math.random) {
  return GATE_KINDS[type].layout(offset, rand)
}

/** The full opening perimeter of `gate`, for continuous edge sparks. */
export function openingShape(gate, shape) {
  return GATE_KINDS[gate.type].opening(gate, shape)
}

/** The tight pass burst for `gate`, centred where the bird threaded it. */
export function burstShape(gate, bx, by, shape) {
  return GATE_KINDS[gate.type].burst(gate, bx, by, shape)
}

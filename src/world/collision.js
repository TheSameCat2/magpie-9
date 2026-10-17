import { TUNNEL_APOTHEM } from '../config/world.js'
import { clamp } from '../lib/math.js'
import { GATE_KINDS } from './gates/kinds.js'

// All tests take the bird's centre `pos` and its half-extents `hit` (an
// axis-aligned box). Wings stay visual-only. Per-hazard rules live in
// gates/kinds.js; this file is the dispatch and the conduit wall.

// Outward normal of the first quadrant slanted hex wall (30°); flat-topped hex
// symmetry maps all 6 walls to |y| <= apothem and |x|*cos(30°) + |y|*sin(30°) <= apothem.
const HEX_NX = Math.cos(Math.PI / 6)
const HEX_NY = 0.5
const _contact = { margin: Infinity, x: 0, y: 0, nx: 0, ny: 0 }

export function hexOutside(x, y, apothem) {
  const ay = Math.abs(y)
  return ay > apothem || Math.abs(x) * HEX_NX + ay * HEX_NY > apothem
}

export function hitTunnel(pos, hit) {
  const ay = Math.abs(pos.y) + hit.y
  return ay > TUNNEL_APOTHEM || (Math.abs(pos.x) + hit.x) * HEX_NX + ay * HEX_NY > TUNNEL_APOTHEM
}

export function hitObstacle(pos, hit, gate) {
  const halfDepth = gate.depth * 0.5 + hit.z
  if (Math.abs(pos.z - gate.z) > halfDepth) return false
  const kind = GATE_KINDS[gate.type]
  return kind ? kind.hit(pos, hit, gate) : false
}

/**
 * Clearance between the hull and the nearest killing edge of `gate` at the
 * moment it is threaded. Small values are near misses.
 */
export function passMargin(pos, hit, gate) {
  const kind = GATE_KINDS[gate.type]
  return kind ? kind.margin(pos, hit, gate) : Infinity
}

/** Exact contact location and spray normal for a near miss. */
export function passContact(pos, hit, gate, out = _contact) {
  const kind = GATE_KINDS[gate.type]
  if (kind) return kind.contact(pos, hit, gate, out)
  out.margin = Infinity
  out.x = pos.x
  out.y = pos.y
  out.nx = 0
  out.ny = 0
  return out
}

/** Sphere (orb) vs the bird's box. */
export function hitOrb(pos, hit, orb) {
  const dx = orb.x - clamp(orb.x, pos.x - hit.x, pos.x + hit.x)
  const dy = orb.y - clamp(orb.y, pos.y - hit.y, pos.y + hit.y)
  const dz = orb.z - clamp(orb.z, pos.z - hit.z, pos.z + hit.z)
  return dx * dx + dy * dy + dz * dz <= orb.r * orb.r
}

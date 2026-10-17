import { TUNNEL_APOTHEM } from '../config/world.js'
import { clamp } from '../lib/math.js'
import { GATE_KINDS } from './gates/kinds.js'

// All tests take the bird's centre `pos` and its half-extents `hit` (an
// axis-aligned box). Wings stay visual-only. Per-hazard rules live in
// gates/kinds.js; this file is the dispatch and the conduit wall.

// Outward normals of the flat-topped hex walls (30° + 60°·i), precomputed so
// the per-frame wall test does not allocate.
const HEX_WALL_NORMALS = []
for (let i = 0; i < 6; i++) {
  const t = i * (Math.PI / 3) + Math.PI / 6
  HEX_WALL_NORMALS.push(Math.cos(t), Math.sin(t))
}

export function hexOutside(x, y, apothem) {
  for (let i = 0; i < HEX_WALL_NORMALS.length; i += 2) {
    if (x * HEX_WALL_NORMALS[i] + y * HEX_WALL_NORMALS[i + 1] > apothem) return true
  }
  return false
}

export function hitTunnel(pos, hit) {
  for (let i = 0; i < HEX_WALL_NORMALS.length; i += 2) {
    const nx = HEX_WALL_NORMALS[i]
    const ny = HEX_WALL_NORMALS[i + 1]
    if (pos.x * nx + pos.y * ny + hit.x * Math.abs(nx) + hit.y * Math.abs(ny) > TUNNEL_APOTHEM) return true
  }
  return false
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
export function passContact(pos, hit, gate) {
  const kind = GATE_KINDS[gate.type]
  return kind ? kind.contact(pos, hit, gate) : { margin: Infinity, x: pos.x, y: pos.y, nx: 0, ny: 0 }
}

/** Sphere (orb) vs the bird's box. */
export function hitOrb(pos, hit, orb) {
  const dx = orb.x - clamp(orb.x, pos.x - hit.x, pos.x + hit.x)
  const dy = orb.y - clamp(orb.y, pos.y - hit.y, pos.y + hit.y)
  const dz = orb.z - clamp(orb.z, pos.z - hit.z, pos.z + hit.z)
  return dx * dx + dy * dy + dz * dz <= orb.r * orb.r
}

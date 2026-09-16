import { TUNNEL_APOTHEM } from '../config/world.js'
import { clamp } from '../lib/math.js'

// All tests take the bird's centre `pos` and its half-extents `hit` (an
// axis-aligned box). Wings stay visual-only.

/** Outward normal of hex wall `i` (flat-topped hex, walls at 30° + 60°·i). */
function wallNormal(i) {
  const t = i * (Math.PI / 3) + Math.PI / 6
  return [Math.cos(t), Math.sin(t)]
}

export function hexOutside(x, y, apothem) {
  for (let i = 0; i < 6; i++) {
    const [nx, ny] = wallNormal(i)
    if (x * nx + y * ny > apothem) return true
  }
  return false
}

export function hitTunnel(pos, hit) {
  for (let i = 0; i < 6; i++) {
    const [nx, ny] = wallNormal(i)
    if (pos.x * nx + pos.y * ny + hit.x * Math.abs(nx) + hit.y * Math.abs(ny) > TUNNEL_APOTHEM) return true
  }
  return false
}

function hasHatch(gate) {
  return gate.type === 'bulkhead' || gate.type === 'sled'
}

export function hitObstacle(pos, hit, gate) {
  const halfDepth = gate.depth * 0.5 + hit.z
  if (Math.abs(pos.z - gate.z) > halfDepth) return false

  if (hasHatch(gate)) {
    const inHole =
      Math.abs(pos.x - gate.hole.x) < gate.hole.w * 0.5 - hit.x &&
      Math.abs(pos.y - gate.hole.y) < gate.hole.h * 0.5 - hit.y
    return !inHole
  }
  if (gate.type === 'laser-bar') {
    return Math.abs(pos.y - gate.gapY) >= gate.gapH * 0.5 - hit.y
  }
  if (gate.type === 'pylon') {
    if (gate.side === 'left') return pos.x < gate.edge + hit.x
    return pos.x > gate.edge - hit.x
  }
  return false
}

/**
 * Clearance between the hull and the nearest killing edge of `gate` at the
 * moment it is threaded. Small values are near misses.
 */
export function passMargin(pos, hit, gate) {
  if (hasHatch(gate)) {
    const mx = gate.hole.w * 0.5 - Math.abs(pos.x - gate.hole.x) - hit.x
    const my = gate.hole.h * 0.5 - Math.abs(pos.y - gate.hole.y) - hit.y
    return Math.min(mx, my)
  }
  if (gate.type === 'laser-bar') {
    return gate.gapH * 0.5 - Math.abs(pos.y - gate.gapY) - hit.y
  }
  if (gate.type === 'pylon') {
    return Math.abs(pos.x - gate.edge) - hit.x
  }
  return Infinity
}

/** Sphere (orb) vs the bird's box. */
export function hitOrb(pos, hit, orb) {
  const dx = orb.x - clamp(orb.x, pos.x - hit.x, pos.x + hit.x)
  const dy = orb.y - clamp(orb.y, pos.y - hit.y, pos.y + hit.y)
  const dz = orb.z - clamp(orb.z, pos.z - hit.z, pos.z + hit.z)
  return dx * dx + dy * dy + dz * dz <= orb.r * orb.r
}

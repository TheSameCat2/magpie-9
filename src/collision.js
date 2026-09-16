import { R } from './theme.js'

export function hexOutside(x, y, apothem) {
  for (let i = 0; i < 6; i++) {
    const t = i * (Math.PI / 3) + Math.PI / 6
    if (x * Math.cos(t) + y * Math.sin(t) > apothem) return true
  }
  return false
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v))
}

// Axis-aligned hull vs the hexagonal conduit. Wings stay visual-only.
export function hitTunnel(pos, hit) {
  for (let i = 0; i < 6; i++) {
    const t = i * (Math.PI / 3) + Math.PI / 6
    const nx = Math.cos(t)
    const ny = Math.sin(t)
    if (pos.x * nx + pos.y * ny + hit.x * Math.abs(nx) + hit.y * Math.abs(ny) > R) return true
  }
  return false
}

export function hitObstacle(pos, hit, obs) {
  const half = obs.depth * 0.5 + hit.z
  if (Math.abs(pos.z - obs.z) > half) return false

  if (obs.type === 'bulkhead' || obs.type === 'sled') {
    const inHole =
      Math.abs(pos.x - obs.hole.x) < obs.hole.w * 0.5 - hit.x &&
      Math.abs(pos.y - obs.hole.y) < obs.hole.h * 0.5 - hit.y
    return !inHole
  }

  if (obs.type === 'laser-bar') {
    return Math.abs(pos.y - obs.gapY) >= obs.gapH * 0.5 - hit.y
  }

  if (obs.type === 'pylon') {
    if (obs.side === 'left') return pos.x < obs.edge + hit.x
    return pos.x > obs.edge - hit.x
  }

  return false
}

// Clearance between the hull and the nearest killing edge of `obs`
// at the moment it is threaded. Small values are near misses.
export function passMargin(pos, hit, obs) {
  if (obs.type === 'bulkhead' || obs.type === 'sled') {
    const mx = obs.hole.w * 0.5 - Math.abs(pos.x - obs.hole.x) - hit.x
    const my = obs.hole.h * 0.5 - Math.abs(pos.y - obs.hole.y) - hit.y
    return Math.min(mx, my)
  }
  if (obs.type === 'laser-bar') {
    return obs.gapH * 0.5 - Math.abs(pos.y - obs.gapY) - hit.y
  }
  if (obs.type === 'pylon') {
    return Math.abs(pos.x - obs.edge) - hit.x
  }
  return Infinity
}

export function hitOrb(pos, hit, orb) {
  const dx = orb.x - clamp(orb.x, pos.x - hit.x, pos.x + hit.x)
  const dy = orb.y - clamp(orb.y, pos.y - hit.y, pos.y + hit.y)
  const dz = orb.z - clamp(orb.z, pos.z - hit.z, pos.z + hit.z)
  return dx * dx + dy * dy + dz * dz <= orb.r * orb.r
}

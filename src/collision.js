import { R } from './theme.js'

export function hexOutside(x, y, apothem) {
  for (let i = 0; i < 6; i++) {
    const t = i * (Math.PI / 3) + Math.PI / 6
    if (x * Math.cos(t) + y * Math.sin(t) > apothem) return true
  }
  return false
}

export function hitTunnel(pos, radius) {
  return hexOutside(pos.x, pos.y, R - radius)
}

// Wing tips are visual only; the body sphere is what kills. Same scale is used
// by hitObstacle and passMargin so near-miss and death stay consistent.
export const HIT_RADIUS_SCALE = 0.9

export function hitRadius(radius) {
  return radius * HIT_RADIUS_SCALE
}

export function hitObstacle(pos, radius, obs) {
  const r = hitRadius(radius)
  const half = obs.depth * 0.5 + r
  if (Math.abs(pos.z - obs.z) > half) return false

  if (obs.type === 'bulkhead') {
    const inHole =
      Math.abs(pos.x - obs.hole.x) < obs.hole.w * 0.5 - r &&
      Math.abs(pos.y - obs.hole.y) < obs.hole.h * 0.5 - r
    return !inHole
  }

  if (obs.type === 'laser-bar') {
    return Math.abs(pos.y - obs.gapY) >= obs.gapH * 0.5 - r
  }

  if (obs.type === 'pylon') {
    if (obs.side === 'left') return pos.x < obs.edge + r
    return pos.x > obs.edge - r
  }

  return false
}

// Clearance between the bird's sphere and the nearest killing edge of `obs`
// at the moment it is threaded. Small values are near misses.
export function passMargin(pos, radius, obs) {
  const r = hitRadius(radius)
  if (obs.type === 'bulkhead') {
    const mx = obs.hole.w * 0.5 - Math.abs(pos.x - obs.hole.x)
    const my = obs.hole.h * 0.5 - Math.abs(pos.y - obs.hole.y)
    return Math.min(mx, my) - r
  }
  if (obs.type === 'laser-bar') {
    return obs.gapH * 0.5 - Math.abs(pos.y - obs.gapY) - r
  }
  if (obs.type === 'pylon') {
    return Math.abs(pos.x - obs.edge) - r
  }
  return Infinity
}

export function hitOrb(pos, radius, orb) {
  const dx = pos.x - orb.x
  const dy = pos.y - orb.y
  const dz = pos.z - orb.z
  const r = radius + orb.r
  return dx * dx + dy * dy + dz * dz <= r * r
}

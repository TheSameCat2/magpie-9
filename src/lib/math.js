export function clamp(value, lo, hi) {
  return Math.min(hi, Math.max(lo, value))
}

export function clamp01(value) {
  return clamp(value, 0, 1)
}

/** Uniform random point in a disc of `radius`, written into `out`. */
export function randomInDisc(radius, rand = Math.random, out = { x: 0, y: 0 }) {
  const angle = rand() * Math.PI * 2
  const r = Math.sqrt(rand()) * radius
  out.x = Math.cos(angle) * r
  out.y = Math.sin(angle) * r
  return out
}

/** Uniform random direction on the unit sphere, scaled by `speed`, written into `out`. */
export function randomOnSphere(speed, out = { x: 0, y: 0, z: 0 }) {
  const theta = Math.random() * Math.PI * 2
  const phi = Math.acos(Math.random() * 2 - 1)
  out.x = Math.sin(phi) * Math.cos(theta) * speed
  out.y = Math.sin(phi) * Math.sin(theta) * speed
  out.z = Math.cos(phi) * speed
  return out
}

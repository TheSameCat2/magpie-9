export const BOARD_SIZE = 10
export const MAX_SCORE = 9999
export const FIRST_GATE_Z = 32
export const BASE_SPEED = 12

export function difficulty(score) {
  const speed = Math.min(BASE_SPEED * Math.pow(1.03, score), 22)
  const spacing = Math.max(28 - score * 0.45, 18)
  const offset = Math.min(0.8 + score * 0.12, 1.8)
  return { speed, spacing, offset }
}

export function stageDelta(score) {
  return difficulty(score).speed - difficulty(Math.max(0, score - 1)).speed
}

/** Lower bound on real seconds to clear `gates` with no dampers (max speed). */
export function minRunSeconds(gates) {
  const n = Math.max(0, Math.floor(gates))
  if (n <= 0) return 0
  let t = FIRST_GATE_Z / BASE_SPEED
  for (let k = 1; k < n; k++) {
    const { speed, spacing } = difficulty(k)
    t += spacing / speed
  }
  return t
}

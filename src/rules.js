export const BOARD_SIZE = 10
export const MAX_SCORE = 9999
export const FIRST_GATE_Z = 32
export const BASE_SPEED = 12
export const SPEED_CAP = 22
export const SECTOR = 10
export const ORB_CHANCE = 0.5
export const SHUNT_CHANCE = 0.15
export const SHUNT_GATES = 5
export const SHUNT_SPEED = 1.4
export const CHALLENGE_TARGET = 40
export const ORB_SPREAD = 2.2
export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

export function difficulty(score) {
  const speed = Math.min(BASE_SPEED * Math.pow(1.021, score), SPEED_CAP)
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

/** Lower bound for a challenge extract: every gate at the shunt-boosted cap. */
export function minChallengeSeconds(gates, shuntBoost = SHUNT_SPEED) {
  const n = Math.max(0, Math.floor(gates))
  if (n <= 0) return 0
  const vmax = SPEED_CAP + shuntBoost
  let t = FIRST_GATE_Z / vmax
  for (let k = 1; k < n; k++) t += difficulty(k).spacing / vmax
  return t
}

export function pickLifeSlot(sectorStart, rand = Math.random) {
  return sectorStart + Math.floor(rand() * SECTOR)
}

export function rollOrbType({ lifeDue = false, rand = Math.random } = {}) {
  if (lifeDue) return 'life'
  const r = rand()
  if (r < SHUNT_CHANCE) return 'shunt'
  if (r < SHUNT_CHANCE + ORB_CHANCE) return 'damper'
  return null
}

export function createRng(seed) {
  let t = seed | 0
  return function rand() {
    t = (t + 0x6d2b79f5) | 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

export function utcDay(ms = Date.now()) {
  return new Date(ms).toISOString().slice(0, 10)
}

export function formatTime(ms) {
  const t = Math.max(0, Math.floor(Number(ms) || 0))
  const m = Math.floor(t / 60000)
  const s = Math.floor((t % 60000) / 1000)
  const tenths = Math.floor((t % 1000) / 100)
  return `${m}:${String(s).padStart(2, '0')}.${tenths}`
}

export function challengeBestKey(day) {
  return `magpie9.challenge.${day}`
}

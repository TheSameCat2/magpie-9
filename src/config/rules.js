// Gameplay tuning shared by the client and the score API (which uses the same
// numbers to reject impossible times). Keep every difficulty knob here.

export const BOARD_SIZE = 10
export const MAX_SCORE = 9999
/** Distance from the bird to the first gate of a run. */
export const FIRST_GATE_Z = 32
export const BASE_SPEED = 12
export const SPEED_CAP = 22
/** Gates per sector; one spare life spawns somewhere in every sector. */
export const SECTOR = 10
export const ORB_CHANCE = 0.5
export const SHUNT_CHANCE = 0.15
/** Gates the shunt overdrive lasts for. */
export const SHUNT_GATES = 5
/** Extra scroll speed while the shunt is live. */
export const SHUNT_SPEED = 1.4
export const CHALLENGE_TARGET = 40
/** Radius of the disc orbs spawn in, centred on the conduit axis. */
export const ORB_SPREAD = 2.2

export function difficulty(score) {
  const speed = Math.min(BASE_SPEED * Math.pow(1.021, score), SPEED_CAP)
  const spacing = Math.max(28 - score * 0.45, 18)
  const offset = Math.min(0.8 + score * 0.12, 1.8)
  return { speed, spacing, offset }
}

/** Speed added by clearing gate `score`. */
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

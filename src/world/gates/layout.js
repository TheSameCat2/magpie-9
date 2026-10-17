// Spawn policy for the gate pool: which hazard appears next. Per-hazard
// layout, collision, and spark shapes live in kinds.js; this file keeps the
// RNG-order rules that decide when each kind is allowed to appear.

import { LASER_COL_CHANCE, LASER_COL_MIN_SCORE } from './kinds.js'

export * from './kinds.js'

/**
 * Which hazard spawns at `spawnIndex` for the current `score`. `prevType` is
 * the gate spawned just before: two moving hatches in a row ramp difficulty
 * too sharply, so a sled must be followed by a static gate. A vertical laser
 * never follows another or a pylon, so the strafe it demands is always fair.
 * Its score check comes before the roll so courses below the unlock (every
 * daily challenge) draw the same RNG sequence as before it existed.
 */
export function pickGateType(spawnIndex, score, rand = Math.random, prevType = null) {
  if (spawnIndex < 2) return 'bulkhead'
  if (
    score >= LASER_COL_MIN_SCORE &&
    prevType !== 'laser-col' &&
    prevType !== 'pylon' &&
    rand() < LASER_COL_CHANCE
  ) {
    return 'laser-col'
  }
  if (score >= 8 && prevType !== 'sled' && rand() < 0.22) return 'sled'
  if (score >= 5 && rand() < 0.3) return 'pylon'
  if (score >= 3 && rand() < 0.38) return 'laser-bar'
  return 'bulkhead'
}

// Effect tuning that follows the run: spark colour per sector and the
// afterburner threshold. Pure numbers and helpers; no Three.js, no DOM.

import { SECTOR } from './rules.js'
import { THEME } from './theme.js'

/**
 * Gate-edge spark colour, one stop per 10-gate sector. Sector 0 is green and
 * the ramp reaches red at sector 5; later sectors hold the last stop.
 */
export const SPARK_RAMP = [THEME.green, 0xa8ff4a, THEME.gold, THEME.sodium, 0xff6a3a, 0xff3030]

/** Spark density and size stop growing past this phase so the budget stays bounded. */
export const SPARK_PHASE_CAP = 8

/** Depth over which a gate's edge sparks fade in as it approaches. */
export const EDGE_RANGE = 54
/** Gates this far past the bird stop sparking (the frame fades over the same distance). */
export const EDGE_PASS_Z = 4.2

/** Hard ceiling on the edge-spark density/size/speed multiplier vs phase 0. */
export const SPARK_GAIN_CAP = 1.6
/** Concave growth rate toward the cap; phase 1 stays visibly hotter than phase 0. */
export const SPARK_GAIN_K = 0.22

/** Score at which the magpie's afterburner lights (the SECTOR 5 toast). */
export const AFTERBURNER_SCORE = 50

/** Phase index for a score: steps once per sector, clamped to the cap. */
export function sparkPhase(score) {
  const phase = Math.floor(Math.max(0, score) / SECTOR)
  return Math.min(phase, SPARK_PHASE_CAP)
}

/** The ramp stop a phase paints with (later phases hold the hottest stop). */
export function sparkColor(phase) {
  return SPARK_RAMP[Math.min(Math.max(0, phase), SPARK_RAMP.length - 1)]
}

/**
 * Edge-spark density/size/speed multiplier vs phase 0. Concave and hard-capped
 * so late sectors read hotter in colour, not in particle count.
 */
export function sparkGain(phase) {
  return Math.min(SPARK_GAIN_CAP, 1 + SPARK_GAIN_K * Math.sqrt(Math.max(0, phase)))
}

/** Proximity fade for a gate's plate-face z: 0 far away or fully passed, 1 at the bird. */
export function edgeProx(z) {
  const t = z < 0 ? 1 + z / EDGE_RANGE : 1 - z / EDGE_PASS_Z
  return t <= 0 ? 0 : t >= 1 ? 1 : t
}

export function afterburnerOn(score) {
  return score >= AFTERBURNER_SCORE
}

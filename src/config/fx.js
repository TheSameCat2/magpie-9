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

export function afterburnerOn(score) {
  return score >= AFTERBURNER_SCORE
}

// BENDS mode tuning. The conduit makes discrete yaw turns between gates.
// Gameplay stays in straight path space (z = distance along the centreline);
// a bend only adds outward slip while the bird is inside the arc, and the
// renderer maps path space onto the bent centreline (render/bend.js).

import { SHUNT_GATES, SHUNT_SPEED, difficulty } from './rules.js'
import { STRAFE_MAX } from './world.js'

const DEG = Math.PI / 180

/** Hard clamp on a single turn, either side. */
export const BEND_MAX_ANGLE = 25 * DEG
export const BEND_MIN_ANGLE = 10 * DEG
/** Angle cap for the first bends of a run; it grows toward BEND_MAX_ANGLE with score. */
export const BEND_EARLY_ANGLE = 14 * DEG
/** Arc length range. The shortest arc at the largest angle sets the sharpest curvature. */
export const BEND_LENGTH_MIN = 22
export const BEND_LENGTH_MAX = 36
/** No bend in the gaps before this gate index: the warm-up stays straight. */
export const BEND_START_GATE = 3
export const BEND_CHANCE_MIN = 0.3
export const BEND_CHANCE_MAX = 0.6
/** Straight from the previous gate to the start of the arc. Keeps a respawn out of the arc. */
export const BEND_LEAD = 8
/** Seconds of straight after the arc before the next gate, at the fastest speed that gate can be met at. */
export const BEND_TRAIL_SECONDS = 1.1
export const BEND_TRAIL_MIN = 16
/** BENDS spawns deeper than other modes so a bend is known before it comes out of the fog. */
export const BEND_SPAWN_HORIZON_Z = -80
/** The sharpest curvature any bend can have. */
export const BEND_MAX_CURVATURE = BEND_MAX_ANGLE / BEND_LENGTH_MIN

/** Outward slip per unit of v²·κ. */
export const SLIP_GAIN = 0.45
/** Slip never exceeds this share of strafe, so the player can always hold the line. */
export const SLIP_MAX = 0.75 * STRAFE_MAX
/** Damping rate (1/s) of slip toward its target as the bird enters and leaves an arc. */
export const SLIP_RESPONSE = 6

// Shape of the centreline table the renderer interpolates, as distance ahead
// of the bird (negative is behind, toward the camera).
export const BEND_SAMPLES = 48
export const BEND_NEAR = -16
export const BEND_STEP = 2.5

/** Fastest a gate can be met at when a run reaches it at `score`: shunt score bonus and boost included. */
export function worstSpeed(score) {
  return difficulty(score + SHUNT_GATES).speed + SHUNT_SPEED
}

/** Straight run-out after an arc: time-based so it stays fair at the speed cap. */
export function bendTrail(score) {
  return Math.max(BEND_TRAIL_MIN, BEND_TRAIL_SECONDS * worstSpeed(score))
}

/** The longest gap a bend can force; bends must outlive a rewind this long. */
export const BEND_MAX_GAP = BEND_LEAD + BEND_LENGTH_MAX + bendTrail(1e6)

export function bendDifficulty(score) {
  const chance = Math.min(BEND_CHANCE_MIN + score * 0.01, BEND_CHANCE_MAX)
  const maxAngle = Math.min(BEND_EARLY_ANGLE + score * 0.4 * DEG, BEND_MAX_ANGLE)
  const minLength = Math.max(BEND_LENGTH_MAX - score * 0.5, BEND_LENGTH_MIN)
  return { chance, maxAngle, minLength }
}

/**
 * Roll the bend (if any) for the gap that ends at gate `index`. Returns
 * `{ angle, length, lead, trail }` with `angle` signed (+ turns right, toward +X),
 * or null for a straight gap.
 */
export function rollBend(index, score, rand = Math.random) {
  if (index < BEND_START_GATE) return null
  const { chance, maxAngle, minLength } = bendDifficulty(score)
  if (rand() >= chance) return null
  const magnitude = Math.min(BEND_MIN_ANGLE + rand() * (maxAngle - BEND_MIN_ANGLE), BEND_MAX_ANGLE)
  const side = rand() < 0.5 ? -1 : 1
  const length = minLength + rand() * (BEND_LENGTH_MAX - minLength)
  return { angle: side * magnitude, length, lead: BEND_LEAD, trail: bendTrail(Math.max(score, index)) }
}

/** Gate spacing for a gap holding `bend`: never shorter than the arc plus both straights. */
export function bendGap(spacing, bend) {
  return bend ? Math.max(spacing, bend.lead + bend.length + bend.trail) : spacing
}

/** Lateral slip speed inside an arc of signed `curvature`: outward, so opposite the turn. */
export function slipTarget(speed, curvature) {
  const slip = -SLIP_GAIN * speed * speed * curvature
  return Math.max(-SLIP_MAX, Math.min(SLIP_MAX, slip))
}

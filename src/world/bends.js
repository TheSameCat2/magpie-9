// The conduit's bends as pure data: no meshes. Each bend is a constant-
// curvature arc stored like a gate, by the world z of its near end, and
// scrolls with the world. Gameplay reads `curvatureAt` for slip; `sample`
// writes the centreline table (lib/centreline.js) the renderer bends by.

import { BEND_MAX_GAP, BEND_NEAR, BEND_SAMPLES, BEND_STEP } from '../config/bends.js'
import { RECYCLE_Z } from '../config/world.js'

const POOL_SIZE = 8
/** Bends outlive a spare-life rewind: one only goes once it is a whole max gap behind the camera. */
const BEND_RECYCLE_Z = RECYCLE_Z + BEND_MAX_GAP

export function createBends() {
  const pool = []
  for (let i = 0; i < POOL_SIZE; i++) pool.push({ active: false, z: 0, length: 0, angle: 0, curvature: 0 })

  function reset() {
    for (const bend of pool) bend.active = false
  }

  /** Add an arc whose near end is at world `z`, running `length` deeper and turning by signed `angle`. */
  function spawn(z, length, angle) {
    const bend = pool.find((b) => !b.active)
    if (!bend) return null
    bend.active = true
    bend.z = z
    bend.length = length
    bend.angle = angle
    bend.curvature = angle / length
    return bend
  }

  function scroll(dz) {
    for (const bend of pool) {
      if (!bend.active) continue
      bend.z += dz
      if (bend.z - bend.length > BEND_RECYCLE_Z) bend.active = false
    }
  }

  /** Signed curvature (radians per unit, + turning right) at world `z`. */
  function curvatureAt(z) {
    const d = -z
    let k = 0
    for (const bend of pool) {
      if (!bend.active) continue
      const near = -bend.z
      if (d >= near && d < near + bend.length) k += bend.curvature
    }
    return k
  }

  /** Conduit heading at distance `d` ahead relative to the heading at the bird. */
  function headingAt(d) {
    let psi = 0
    for (const bend of pool) {
      if (!bend.active) continue
      const near = -bend.z
      const far = near + bend.length
      const to = Math.min(Math.max(d, near), far)
      const from = Math.min(Math.max(0, near), far)
      psi += bend.curvature * (to - from)
    }
    return psi
  }

  /** Integrate the centreline out from the bird both ways into `out` (BEND_TABLE_LENGTH floats). */
  function sample(out) {
    const first = Math.ceil(-BEND_NEAR / BEND_STEP)
    let x = 0
    let z = 0
    let prev = 0
    for (let i = first; i < BEND_SAMPLES; i++) {
      const d = BEND_NEAR + i * BEND_STEP
      const psi = headingAt((prev + d) * 0.5)
      x += Math.sin(psi) * (d - prev)
      z -= Math.cos(psi) * (d - prev)
      out[i * 3] = x
      out[i * 3 + 1] = z
      out[i * 3 + 2] = headingAt(d)
      prev = d
    }
    x = 0
    z = 0
    prev = 0
    for (let i = first - 1; i >= 0; i--) {
      const d = BEND_NEAR + i * BEND_STEP
      const psi = headingAt((prev + d) * 0.5)
      x += Math.sin(psi) * (d - prev)
      z -= Math.cos(psi) * (d - prev)
      out[i * 3] = x
      out[i * 3 + 1] = z
      out[i * 3 + 2] = headingAt(d)
      prev = d
    }
    return out
  }

  return {
    reset,
    spawn,
    scroll,
    curvatureAt,
    headingAt,
    sample,
    /** Live bends, for tests and debug. Allocates; not for the hot path. */
    active() {
      return pool.filter((b) => b.active)
    },
  }
}

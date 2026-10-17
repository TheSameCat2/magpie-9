// The conduit's bends as pure data: no meshes. Each bend is a constant-
// curvature arc stored like a gate, by the world z of its near end, and
// scrolls with the world. Gameplay reads `curvatureAt` for slip; `sample`
// writes the centreline table (lib/centreline.js) the renderer bends by.

import { BEND_MAX_GAP, BEND_NEAR, BEND_SAMPLES, BEND_STEP } from '../config/bends.js'
import { RECYCLE_Z } from '../config/world.js'
import { fillIdentity } from '../lib/centreline.js'

const POOL_SIZE = 8
/** Bends outlive a spare-life rewind: one only goes once it is a whole max gap behind the camera. */
const BEND_RECYCLE_Z = RECYCLE_Z + BEND_MAX_GAP
const FIRST_SAMPLE = Math.ceil(-BEND_NEAR / BEND_STEP)

export function createBends() {
  const pool = []
  for (let i = 0; i < POOL_SIZE; i++) pool.push({ active: false, z: 0, length: 0, angle: 0, curvature: 0 })

  const _near = new Float64Array(POOL_SIZE)
  const _far = new Float64Array(POOL_SIZE)
  const _from = new Float64Array(POOL_SIZE)
  const _curv = new Float64Array(POOL_SIZE)

  function reset() {
    for (let i = 0; i < POOL_SIZE; i++) pool[i].active = false
  }

  /** Add an arc whose near end is at world `z`, running `length` deeper and turning by signed `angle`. */
  function spawn(z, length, angle) {
    let bend = null
    for (let i = 0; i < POOL_SIZE; i++) {
      if (!pool[i].active) {
        bend = pool[i]
        break
      }
    }
    if (!bend) return null
    bend.active = true
    bend.z = z
    bend.length = length
    bend.angle = angle
    bend.curvature = angle / length
    return bend
  }

  function scroll(dz) {
    for (let i = 0; i < POOL_SIZE; i++) {
      const bend = pool[i]
      if (!bend.active) continue
      bend.z += dz
      if (bend.z - bend.length > BEND_RECYCLE_Z) bend.active = false
    }
  }

  /** Signed curvature (radians per unit, + turning right) at world `z`. */
  function curvatureAt(z) {
    const d = -z
    let k = 0
    for (let i = 0; i < POOL_SIZE; i++) {
      const bend = pool[i]
      if (!bend.active) continue
      const near = -bend.z
      if (d >= near && d < near + bend.length) k += bend.curvature
    }
    return k
  }

  /** Conduit heading at distance `d` ahead relative to the heading at the bird. */
  function headingAt(d) {
    let psi = 0
    for (let i = 0; i < POOL_SIZE; i++) {
      const bend = pool[i]
      if (!bend.active) continue
      const near = -bend.z
      const far = near + bend.length
      const to = d < near ? near : d > far ? far : d
      const from = 0 < near ? near : 0 > far ? far : 0
      psi += bend.curvature * (to - from)
    }
    return psi
  }

  /** Integrate the centreline out from the bird both ways into `out` (BEND_TABLE_LENGTH floats). */
  function sample(out) {
    let activeCount = 0
    for (let i = 0; i < POOL_SIZE; i++) {
      const bend = pool[i]
      if (!bend.active) continue
      const near = -bend.z
      const far = near + bend.length
      _near[activeCount] = near
      _far[activeCount] = far
      _from[activeCount] = 0 < near ? near : 0 > far ? far : 0
      _curv[activeCount] = bend.curvature
      activeCount += 1
    }

    if (activeCount === 0) {
      return fillIdentity(out)
    }

    function activeHeading(d) {
      let psi = 0
      for (let j = 0; j < activeCount; j++) {
        const near = _near[j]
        const far = _far[j]
        const to = d < near ? near : d > far ? far : d
        psi += _curv[j] * (to - _from[j])
      }
      return psi
    }

    let x = 0
    let z = 0
    let prev = 0
    for (let i = FIRST_SAMPLE; i < BEND_SAMPLES; i++) {
      const d = BEND_NEAR + i * BEND_STEP
      const psi = activeHeading((prev + d) * 0.5)
      const step = d - prev
      x += Math.sin(psi) * step
      z -= Math.cos(psi) * step
      const i3 = i * 3
      out[i3] = x
      out[i3 + 1] = z
      out[i3 + 2] = activeHeading(d)
      prev = d
    }
    x = 0
    z = 0
    prev = 0
    for (let i = FIRST_SAMPLE - 1; i >= 0; i--) {
      const d = BEND_NEAR + i * BEND_STEP
      const psi = activeHeading((prev + d) * 0.5)
      const step = d - prev
      x += Math.sin(psi) * step
      z -= Math.cos(psi) * step
      const i3 = i * 3
      out[i3] = x
      out[i3 + 1] = z
      out[i3 + 2] = activeHeading(d)
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

// Camera rig: follows the bird with damping, banks with it, and takes
// shake / FOV punch impulses from gameplay events.

import * as THREE from 'three'
import { CAMERA, CAMERA_TURN_LEAD, CAMERA_TURN_LOOK } from '../config/world.js'
import { bendPoint } from '../lib/centreline.js'
import { UNIFORMS } from '../render/uniforms.js'

const FOLLOW = 0.32
const FOLLOW_DAMPING = 6
const ROLL_DAMPING = 8
const BANK_ROLL = 0.35
const LOOK_LEAD = 0.18
const SHAKE_SCALE = 0.6
const FOV_DECAY = 14

export function createCameraRig({ camera, bird, reduceMotion = false }) {
  const base = new THREE.Vector3(CAMERA.rest.x, CAMERA.rest.y, CAMERA.rest.z)
  const look = new THREE.Vector3()
  const ahead = { x: 0, y: 0, z: 0 }
  const turnLead = reduceMotion ? 0 : CAMERA_TURN_LEAD
  let shake = 0
  let fovPunch = 0
  let roll = 0

  /** Camera shake for `seconds`; skipped entirely under reduced motion. */
  function jolt(seconds) {
    shake = reduceMotion ? 0 : seconds
  }

  /** Widen the FOV by up to `degrees` and let it decay back. */
  function punch(degrees) {
    fovPunch = Math.max(fovPunch, degrees)
  }

  function reset() {
    shake = 0
    fovPunch = 0
  }

  /**
   * @param dt      real seconds this frame (0 while paused)
   * @param follow  whether to track the bird (false on menu screens)
   * @param banking whether to roll with the bird (only while playing)
   */
  function update(dt, { follow, banking }) {
    const f = follow ? FOLLOW : 0
    base.x = THREE.MathUtils.damp(base.x, bird.x * f, FOLLOW_DAMPING, dt)
    base.y = THREE.MathUtils.damp(base.y, 0.6 + bird.y * f, FOLLOW_DAMPING, dt)
    base.z = CAMERA.rest.z
    camera.position.copy(base)
    if (shake > 0) {
      shake = Math.max(0, shake - dt)
      const mag = shake * SHAKE_SCALE
      camera.position.x += (Math.random() - 0.5) * mag
      camera.position.y += (Math.random() - 0.5) * mag
    }
    // Lean the view toward where the conduit goes; a straight conduit leaves this at 0.
    bendPoint(UNIFORMS.uBend.value, 0, 0, -CAMERA_TURN_LOOK, ahead)
    look.set(bird.x * LOOK_LEAD + ahead.x * turnLead, bird.y * LOOK_LEAD + 0.15, 0)
    camera.lookAt(look)

    const targetRoll = banking && !reduceMotion ? bird.bank * BANK_ROLL : 0
    roll = THREE.MathUtils.damp(roll, targetRoll, ROLL_DAMPING, dt)
    camera.rotateZ(roll)

    if (fovPunch > 0 || camera.fov !== CAMERA.fov) {
      fovPunch = Math.max(0, fovPunch - dt * FOV_DECAY)
      camera.fov = CAMERA.fov + (reduceMotion ? 0 : fovPunch)
      camera.updateProjectionMatrix()
    }
  }

  return { update, jolt, punch, reset }
}

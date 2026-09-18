// The run-following particle streams: sparks popping off every live gate
// opening in the current sector's colour, and the afterburner behind the
// magpie once the score passes the ignition threshold.

import { afterburnerOn, sparkPhase } from '../config/fx.js'

/** Seconds for the afterburner to reach full burn after ignition, and to die after a spare. */
const IGNITION_TIME = 1

export function createSparks({ fx, gates, bird, run }) {
  const shape = { x: 0, y: 0, hw: 0, hh: 0, edges: 0, nx: 0 }
  let level = 0

  function sparkGates(dt, phase) {
    for (const gate of gates.slots) {
      if (!gate.active) continue
      gates.edgeShape(gate, shape)
      fx.edgeSparks(
        shape.x,
        shape.y,
        gate.z + gate.depth * 0.5,
        shape.hw,
        shape.hh,
        shape.edges,
        shape.nx,
        phase,
        dt,
      )
    }
  }

  function burn(dt, live, phase) {
    const target = live && afterburnerOn(run.score) ? 1 : 0
    const step = dt / IGNITION_TIME
    level = target > level ? Math.min(target, level + step) : Math.max(target, level - step)
    // Re-asserted every frame: bird.reset() (spare, new run) cools the cone on its own.
    bird.setAfterburner(level)
    if (level > 0 && live) {
      const { x, y, z } = bird.exhaust
      fx.afterburner(x, y, z, bird.vx, level, bird.thrustPulse, phase, dt)
    }
  }

  /**
   * @param dt frame step, 0 while held
   * @param live true only while the run is playing and not held
   */
  function update(dt, live) {
    const phase = sparkPhase(run.score)
    if (dt > 0) sparkGates(dt, phase)
    burn(dt, live, phase)
  }

  function reset() {
    level = 0
    bird.setAfterburner(0)
  }

  return {
    update,
    reset,
    get afterburner() {
      return level
    },
  }
}

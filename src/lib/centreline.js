// The bent-conduit centreline table shared by gameplay (world/bends.js fills
// it), the renderer (UNIFORMS.uBend, BEND_GLSL in render/bend.js), and CPU
// placement (bendPoint). Row i is the centreline at distance
// d = BEND_NEAR + i·BEND_STEP ahead of the bird: (x, z, heading), with heading
// 0 at the bird, measured from −Z toward +X. A path-space point (x, y, −d)
// maps to centre(d) + x·(cos ψ, 0, sin ψ) + y·up. bendPoint and BEND_GLSL
// implement the same map and must stay in step.

import { BEND_NEAR, BEND_SAMPLES, BEND_STEP } from '../config/bends.js'

export const BEND_TABLE_LENGTH = BEND_SAMPLES * 3

/** Straight conduit: row i sits on the axis at z = −d with heading 0. */
export function fillIdentity(out) {
  for (let i = 0; i < BEND_SAMPLES; i++) {
    out[i * 3] = 0
    out[i * 3 + 1] = -(BEND_NEAR + i * BEND_STEP)
    out[i * 3 + 2] = 0
  }
  return out
}

/** Centreline (x, z, heading) at distance `d` ahead, from the table. Extends straight past either end. */
function frameAt(table, d, out) {
  const f = (d - BEND_NEAR) / BEND_STEP
  const last = BEND_SAMPLES - 1
  if (f <= 0 || f >= last) {
    const row = f <= 0 ? 0 : last
    const s = f <= 0 ? f * BEND_STEP : (f - last) * BEND_STEP
    const psi = table[row * 3 + 2]
    out.x = table[row * 3] + Math.sin(psi) * s
    out.z = table[row * 3 + 1] - Math.cos(psi) * s
    out.psi = psi
    return out
  }
  const i = Math.floor(f)
  const t = f - i
  const a = i * 3
  const b = a + 3
  out.x = table[a] + (table[b] - table[a]) * t
  out.z = table[a + 1] + (table[b + 1] - table[a + 1]) * t
  out.psi = table[a + 2] + (table[b + 2] - table[a + 2]) * t
  return out
}

const _frame = { x: 0, z: 0, psi: 0 }

/** CPU mirror of the shader's bend: path-space (x, y, z) to the bent world position in `out`. */
export function bendPoint(table, x, y, z, out) {
  const f = frameAt(table, -z, _frame)
  out.x = f.x + x * Math.cos(f.psi)
  out.y = y
  out.z = f.z + x * Math.sin(f.psi)
  return out
}

/** Heading of the conduit at distance `d` ahead, from the table. */
export function headingOnTable(table, d) {
  return frameAt(table, d, _frame).psi
}

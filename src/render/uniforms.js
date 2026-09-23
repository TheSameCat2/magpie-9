import { FOG_DENSITY } from '../config/world.js'

// Uniform objects shared by reference across every shader material so a
// single write per frame drives all of them. The game loop owns the writes.
export const UNIFORMS = {
  uTime: { value: 0 },
  uScroll: { value: 0 },
  /** Screen-wide pulse on gate pass / pickup; decays every frame. */
  uKick: { value: 0 },
  /** Approaching hazard proximity (0..1) driving environmental warning strobes. */
  uHazard: { value: 0 },
  /** Shunt overdrive active state (0..1) driving environmental surges and supersonic effects. */
  uOverdrive: { value: 0 },
  uFogDensity: { value: FOG_DENSITY },
  uPixelRatio: { value: 1 },
}

/** Raise the shared kick pulse without ever lowering it mid-frame. */
export function kickUniform(strength) {
  UNIFORMS.uKick.value = Math.max(UNIFORMS.uKick.value, strength)
}

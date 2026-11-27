import { clamp, clamp01, damp } from '../lib/math.js'

// Wing stroke dynamics shared by the procedural bird and the rigged magpie.
//
// The shoulder is an underdamped spring that a flap kicks with angular
// velocity, so one flap traces a full beat with no keyframes: a snappy
// downstroke, an overshoot that reads as the recovery upstroke, then settle.
// Repeated flaps re-arm the velocity instead of stacking it, so mashing
// becomes sustained flapping, not a wing wound past its stop.
//
// The elbow and wrist are springs on their parent segment's angle, driven by
// two loads a real wing feels:
//   inertia - when the parent's angular velocity jumps, the child's own mass
//             resists it, so it lags and then whips past (velocity -= k * dv);
//   air     - lift on the outer wing pushes against the motion, so its rest
//             bend shifts opposite to the parent's velocity (upward on the
//             downstroke, downward on the upstroke).
// Each spring is advanced with its closed-form solution, so it's exact and
// stable at any dt, unlike an Euler step at these stiffnesses.

/** Joint angles in radians, velocities in rad/s. Positive = tip down. */
export const WING_FLEX = {
  /** Downstroke depth of one flap at the shoulder. */
  strokeDepth: 0.85,
  /** Time from the flap to the bottom of the downstroke, seconds. */
  strokePeak: 0.07,
  /** Shoulder damping ratio; the overshoot (the upstroke) is exp(-ζπ/√(1-ζ²)): 0.5 => ~16%, a swoop with no second bounce. */
  shoulderZeta: 0.5,

  elbowOmega: 26,
  elbowZeta: 0.68,
  /** Share of a shoulder velocity jump the forearm resists. */
  elbowInertia: 0.24,
  /** Forearm bend per rad/s of shoulder velocity, against the motion. */
  elbowAero: 0.013,

  wristOmega: 32,
  wristZeta: 0.62,
  wristInertia: 0.3,
  wristAero: 0.017,
  /** Hard limits on the relative bends, so a frame hitch can't fold the mesh. */
  elbowLimit: 0.55,
  wristLimit: 0.7,

  /** Shoulder speed (rad/s) treated as a full stroke for pitch and fold. */
  strokeSpeed: 13,
  /** Sweep-back on the upstroke, forearm and hand, at full fold. */
  elbowFold: 0.22,
  wristFold: 0.32,
  /** Hand sweeps forward a touch on the downstroke. */
  wristReach: 0.08,
  /** How fast the fold follows the stroke, per second. */
  foldRate: 14,
}

/**
 * Advance a damped spring x'' = -ω²(x - rest) - 2ζωx' by dt, in place, exactly.
 * Handles under-, critically and over-damped ζ.
 * @param {{ x: number, v: number }} s
 * @param {number} dt @param {number} omega @param {number} zeta @param {number} [rest]
 */
export function springStep(s, dt, omega, zeta, rest = 0) {
  if (dt <= 0) return s
  const x0 = s.x - rest
  const v0 = s.v
  const a = zeta * omega
  const decay = Math.exp(-a * dt)
  if (zeta < 1 - 1e-6) {
    const wd = omega * Math.sqrt(1 - zeta * zeta)
    const c = Math.cos(wd * dt)
    const sn = Math.sin(wd * dt)
    s.x = rest + decay * (x0 * c + ((v0 + a * x0) / wd) * sn)
    s.v = decay * (v0 * c - ((a * v0 + omega * omega * x0) / wd) * sn)
  } else if (zeta > 1 + 1e-6) {
    const k = omega * Math.sqrt(zeta * zeta - 1)
    const ch = Math.cosh(k * dt)
    const sh = Math.sinh(k * dt)
    s.x = rest + decay * (x0 * ch + ((v0 + a * x0) / k) * sh)
    s.v = decay * (v0 * ch - ((a * v0 + omega * omega * x0) / k) * sh)
  } else {
    const b = v0 + omega * x0
    s.x = rest + decay * (x0 + b * dt)
    s.v = decay * (v0 - omega * b * dt)
  }
  return s
}

/**
 * Shoulder spring constants that put the bottom of the downstroke at `peak`
 * seconds and `depth` radians after a flap from rest.
 * For x(t) = (v/ωd)e^(-ζωt)sin(ωd t) the first peak is at ωd·t = atan(√(1-ζ²)/ζ).
 * @returns {{ omega: number, impulse: number }} ω and the flap's kick in rad/s
 */
export function shoulderTuning(depth, peak, zeta) {
  const root = Math.sqrt(1 - zeta * zeta)
  const phase = Math.atan2(root, zeta)
  const wd = phase / peak
  const omega = wd / root
  const gain = Math.exp(-zeta * omega * peak) * Math.sin(phase) // x_peak per (v/ωd)
  return { omega, impulse: (depth * wd) / gain }
}

/** @param {typeof WING_FLEX} [p] */
export function createWingFlex(p = WING_FLEX) {
  const { omega: shoulderOmega, impulse } = shoulderTuning(p.strokeDepth, p.strokePeak, p.shoulderZeta)
  const shoulder = { x: 0, v: 0 }
  const elbow = { x: 0, v: 0 }
  const wrist = { x: 0, v: 0 }
  let kicked = false
  let lastShoulderV = 0
  let lastForearmV = 0
  let fold = 0

  const out = {
    /** Shoulder stroke offset, rad. */
    shoulder: 0,
    /** Elbow and wrist bend relative to the parent segment, rad. */
    elbow: 0,
    wrist: 0,
    /** -1 full upstroke .. 1 full downstroke, from shoulder speed. */
    stroke: 0,
    /** Sweep forward (+) or back (-) about the vertical, rad. */
    elbowSweep: 0,
    wristSweep: 0,
    /** 0..1 how deep into the downstroke the shoulder sits. */
    depth: 0,
  }

  function flap() {
    kicked = true
  }

  function reset() {
    shoulder.x = shoulder.v = 0
    elbow.x = elbow.v = 0
    wrist.x = wrist.v = 0
    kicked = false
    lastShoulderV = lastForearmV = 0
    fold = 0
    publish()
  }

  function publish() {
    out.shoulder = shoulder.x
    out.elbow = elbow.x
    out.wrist = wrist.x
    out.stroke = clamp(shoulder.v / p.strokeSpeed, -1, 1)
    out.depth = clamp01(shoulder.x / p.strokeDepth)
    out.elbowSweep = -fold * p.elbowFold
    out.wristSweep = Math.max(0, out.stroke) * p.wristReach - fold * p.wristFold
  }

  /** @param {number} dt seconds */
  function step(dt) {
    // Re-arm rather than add, and only by the headroom left in the stroke:
    // from level a flap gets the full kick, from the bottom it gets none.
    if (kicked) {
      shoulder.v = Math.max(shoulder.v, impulse * clamp01(1 - shoulder.x / p.strokeDepth))
      kicked = false
    }
    springStep(shoulder, dt, shoulderOmega, p.shoulderZeta)

    // The velocity jump includes this frame's flap kick, so the forearm lags it.
    const dvShoulder = shoulder.v - lastShoulderV
    lastShoulderV = shoulder.v
    elbow.v -= p.elbowInertia * dvShoulder
    springStep(elbow, dt, p.elbowOmega, p.elbowZeta, -p.elbowAero * shoulder.v)
    elbow.x = clamp(elbow.x, -p.elbowLimit, p.elbowLimit)

    const forearmV = shoulder.v + elbow.v
    const dvForearm = forearmV - lastForearmV
    lastForearmV = forearmV
    wrist.v -= p.wristInertia * dvForearm
    springStep(wrist, dt, p.wristOmega, p.wristZeta, -p.wristAero * forearmV)
    wrist.x = clamp(wrist.x, -p.wristLimit, p.wristLimit)

    // Fold the wing on the way up to cut drag, open it for the power stroke.
    fold = damp(fold, clamp01(-shoulder.v / p.strokeSpeed), p.foldRate, dt)
    publish()
  }

  publish()
  return { flap, step, reset, pose: out }
}

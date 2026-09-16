import { clamp } from '../../lib/math.js'

// Pure gate placement: which hazard spawns and where its opening sits. No
// Three.js here so the challenge generator and the tests can share it.

export const GATE_TYPES = ['bulkhead', 'laser-bar', 'pylon', 'sled']

export const HOLE_W = 2.8
export const HOLE_H = 3.2
export const LASER_GAP = 3.0
export const PYLON_W = 4.5
/** |X| of a pylon's centre; the open side starts at `edge`. */
export const PYLON_PX = 2.2

// Max sideways travel of a sled hatch and its motion bounds. Amplitude derives
// from the difficulty offset so difficulty() stays the single tuning source.
export const SLED_MAX_AMP = 1.1
export const SLED_MIN_PERIOD = 2.8

/**
 * Which hazard spawns at `spawnIndex` for the current `score`. `prevType` is
 * the gate spawned just before: two moving hatches in a row ramp difficulty
 * too sharply, so a sled must be followed by a static gate.
 */
export function pickGateType(spawnIndex, score, rand = Math.random, prevType = null) {
  if (spawnIndex < 2) return 'bulkhead'
  if (score >= 8 && prevType !== 'sled' && rand() < 0.22) return 'sled'
  if (score >= 5 && rand() < 0.3) return 'pylon'
  if (score >= 3 && rand() < 0.38) return 'laser-bar'
  return 'bulkhead'
}

/** Random point on a disc of radius `offset`, biased away from the centre. */
function hatchCentre(offset, rand, scale = 1) {
  const angle = rand() * Math.PI * 2
  const distance = offset * (0.55 + rand() * 0.45) * scale
  return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance }
}

function layoutBulkhead(offset, rand) {
  const { x, y } = hatchCentre(offset, rand)
  return { hole: { x, y, w: HOLE_W, h: HOLE_H } }
}

function layoutLaserBar(offset, rand) {
  // Zero offset means a dead-centre band (tutorial); runs never reach lasers below 0.8.
  const gapY = offset > 0 ? clamp((rand() * 2 - 1) * Math.max(0.4, offset), -1.7, 1.7) : 0
  return { gapY, gapH: LASER_GAP }
}

function layoutSled(offset, rand) {
  // A bulkhead hatch that slides in X. The base sits closer to centre than a
  // static hatch so the full swing stays inside the hex.
  const off = Math.max(0, offset)
  const { x: baseX, y: baseY } = hatchCentre(off, rand, 0.5)
  const amp = Math.min(SLED_MAX_AMP, off * 0.6)
  const period = Math.max(SLED_MIN_PERIOD, 4.8 - off * 0.8)
  return {
    hole: { x: baseX, y: baseY, w: HOLE_W, h: HOLE_H },
    sled: { baseX, baseY, amp, freq: (Math.PI * 2) / period, period, phase: rand() * Math.PI * 2 },
  }
}

function layoutPylon(rand) {
  const side = rand() < 0.5 ? 'left' : 'right'
  const px = side === 'left' ? -PYLON_PX : PYLON_PX
  return { side, px, edge: side === 'left' ? px + PYLON_W * 0.5 : px - PYLON_W * 0.5 }
}

/** X/Y placement for a gate of `type`. Injectable RNG so layout is unit-testable. */
export function layoutGate(type, offset, rand = Math.random) {
  if (type === 'bulkhead') return layoutBulkhead(offset, rand)
  if (type === 'laser-bar') return layoutLaserBar(offset, rand)
  if (type === 'sled') return layoutSled(offset, rand)
  return layoutPylon(rand)
}

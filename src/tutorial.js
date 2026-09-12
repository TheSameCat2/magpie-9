// Tutorial mode tuning. Slower than a fresh run, no ramp, every hazard centered
// where geometry allows, and an orb after every single gate.
export const TUTORIAL_SPEED = 9
export const TUTORIAL_FLOOR = 7
export const TUTORIAL_SPACING = 34
export const TUTORIAL_DAMPER = 0.5
export const TUTORIAL_ORB_SPREAD = 0.8

// Hazards arrive in a fixed sequence so each type is met a few times before the
// next one shows up; after one lap the sequence simply repeats.
const GATE_ORDER = ['bulkhead', 'bulkhead', 'bulkhead', 'laser-bar', 'laser-bar', 'pylon', 'pylon']

export const LESSONS = ['damper', 'life']

export function tutorialDifficulty() {
  return { speed: TUTORIAL_SPEED, spacing: TUTORIAL_SPACING, offset: 0 }
}

export function tutorialGateType(spawnIndex) {
  return GATE_ORDER[spawnIndex % GATE_ORDER.length]
}

export function tutorialOrbType(spawnIndex) {
  return spawnIndex % 2 === 0 ? 'damper' : 'life'
}

export function tutorialSpeed(slow) {
  return Math.max(TUTORIAL_FLOOR, TUTORIAL_SPEED - slow)
}

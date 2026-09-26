// Tutorial mode tuning. Slower than a fresh run, no ramp, every hazard centered
// where geometry allows, and an orb after every single gate.
export const TUTORIAL_SPEED = 9
export const TUTORIAL_FLOOR = 7
export const TUTORIAL_SPACING = 34
export const TUTORIAL_DAMPER = 0.5
export const TUTORIAL_ORB_SPREAD = 0.5

// Hazards arrive in a fixed sequence so each type is met a few times before the
// next one shows up; after one lap the sequence simply repeats.
const GATE_ORDER = ['bulkhead', 'bulkhead', 'bulkhead', 'laser-bar', 'laser-bar', 'pylon', 'pylon']

// Orbs rotate through every type so the tutorial meets each one; the first
// pickup of each pauses under an explainer card.
const ORB_ORDER = ['damper', 'life', 'shunt']

export const LESSONS = ['flight', 'damper', 'life', 'shunt']

export function tutorialDifficulty() {
  return { speed: TUTORIAL_SPEED, spacing: TUTORIAL_SPACING, offset: 0 }
}

export function tutorialGateType(spawnIndex) {
  return GATE_ORDER[spawnIndex % GATE_ORDER.length]
}

export function tutorialOrbType(spawnIndex) {
  return ORB_ORDER[spawnIndex % ORB_ORDER.length]
}

export function tutorialSpeed(slow) {
  return Math.max(TUTORIAL_FLOOR, TUTORIAL_SPEED - slow)
}

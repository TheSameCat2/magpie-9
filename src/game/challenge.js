import { layoutGate, pickGateType } from '../world/gates/layout.js'
import {
  CHALLENGE_TARGET,
  ORB_SPREAD,
  SECTOR,
  difficulty,
  pickLifeSlot,
  rollOrbType,
} from '../config/rules.js'
import { randomInDisc } from '../lib/math.js'

/**
 * The daily course: every gate's type, layout, spacing, and orb, generated
 * from a seeded RNG so all players fly the same conduit. Gate `i` is tuned as
 * though the player had a score of `i`, matching an endless run with no shunt.
 */
export function generateCourse(rand, target = CHALLENGE_TARGET) {
  const count = Math.max(0, Math.floor(target))
  const gates = []
  let lifeSlot = -1
  for (let i = 0; i < count; i++) {
    if (i % SECTOR === 0) lifeSlot = pickLifeSlot(i, rand)
    const type = pickGateType(i, i, rand, gates[i - 1]?.type ?? null)
    const offset = i < 2 ? 0 : difficulty(i).offset
    const layout = layoutGate(type, offset, rand)
    const orbType = rollOrbType({ lifeDue: i === lifeSlot, rand })
    const orb = orbType ? { type: orbType, ...randomInDisc(ORB_SPREAD, rand) } : null
    gates.push({ type, layout, orb, offset, spacing: difficulty(i).spacing })
  }
  return gates
}

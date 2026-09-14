import { layoutGate, pickType } from './obstacles.js'
import {
  CHALLENGE_TARGET,
  ORB_SPREAD,
  SECTOR,
  difficulty,
  pickLifeSlot,
  rollOrbType,
} from './rules.js'

export function generateCourse(rand, target = CHALLENGE_TARGET) {
  const n = Math.max(0, Math.floor(target))
  const gates = []
  let lifeSlot = -1
  for (let i = 0; i < n; i++) {
    if (i % SECTOR === 0) lifeSlot = pickLifeSlot(i, rand)
    const type = pickType(i, i, rand)
    const offset = i < 2 ? 0 : difficulty(i).offset
    const layout = layoutGate(type, offset, rand)
    const orbType = rollOrbType({ lifeDue: i === lifeSlot, rand })
    let orb = null
    if (orbType) {
      const ang = rand() * Math.PI * 2
      const r = Math.sqrt(rand()) * ORB_SPREAD
      orb = { type: orbType, x: Math.cos(ang) * r, y: Math.sin(ang) * r }
    }
    gates.push({ type, layout, orb, offset, spacing: difficulty(i).spacing })
  }
  return gates
}

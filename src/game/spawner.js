// Keeps the conduit populated: asks the gate pool to fill the horizon and
// drops an orb between gates according to the active mode's rules.

import { SECTOR, difficulty, pickLifeSlot, rollOrbType } from '../config/rules.js'
import {
  TUTORIAL_ORB_SPREAD,
  tutorialDifficulty,
  tutorialGateType,
  tutorialOrbType,
} from '../config/tutorial.js'

export function createSpawner({ gates, powerups, run }) {
  const spawned = []
  /** Gate index in the current sector that carries the spare life. */
  let lifeSlot = -1

  function reset() {
    lifeSlot = -1
  }

  function currentDifficulty() {
    return run.tutorial ? tutorialDifficulty() : difficulty(run.score)
  }

  function dropOrb(gate, spacing) {
    const index = run.nextGateIndex()
    const z = gate.z - spacing * 0.5
    if (run.tutorial) {
      powerups.spawn(z, tutorialOrbType(index), TUTORIAL_ORB_SPREAD)
      return
    }
    if (run.challenge) {
      const spec = run.course?.[index]
      if (spec?.orb) powerups.spawn(z, spec.orb.type, undefined, spec.orb)
      return
    }
    if (index % SECTOR === 0) lifeSlot = pickLifeSlot(index)
    const type = rollOrbType({ lifeDue: index === lifeSlot })
    if (type) powerups.spawn(z, type)
  }

  function spawnAhead() {
    const diff = currentDifficulty()
    gates.ensureAhead(
      run.score,
      diff,
      spawned,
      run.tutorial ? tutorialGateType : undefined,
      run.challenge ? run.course : undefined,
    )
    for (const gate of spawned) dropOrb(gate, diff.spacing)
  }

  return { reset, spawnAhead, currentDifficulty }
}

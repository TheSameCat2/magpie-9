// Keeps the conduit populated: asks the gate pool to fill the horizon and
// drops an orb between gates according to the active mode's rules. In BENDS
// the gap behind a new gate may also hold one bend, laid out as
// lead straight → arc → trail straight so no gate sits in or just past a turn.

import { SECTOR, difficulty, pickLifeSlot, rollOrbType } from '../config/rules.js'
import { BEND_SPAWN_HORIZON_Z, bendGap, rollBend } from '../config/bends.js'
import {
  TUTORIAL_ORB_SPREAD,
  tutorialDifficulty,
  tutorialGateType,
  tutorialOrbType,
} from '../config/tutorial.js'

export function createSpawner({ gates, powerups, bends, run, rand = Math.random }) {
  const spawned = []
  /** Bends rolled for a gap, keyed by the index of the gate that closes it, until that gate spawns. */
  const pendingBends = new Map()
  /** Gate index in the current sector that carries the spare life. */
  let lifeSlot = -1

  function reset() {
    lifeSlot = -1
    pendingBends.clear()
  }

  function currentDifficulty() {
    return run.tutorial ? tutorialDifficulty() : difficulty(run.score)
  }

  function rollRunOrb(index) {
    if (index % SECTOR === 0) lifeSlot = pickLifeSlot(index, rand)
    return rollOrbType({ lifeDue: index === lifeSlot, rand })
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
    const type = rollRunOrb(index)
    if (type) powerups.spawn(z, type)
  }

  function gapFor(index, diff) {
    const bend = rollBend(index, run.score, rand)
    if (bend) pendingBends.set(index, bend)
    else pendingBends.delete(index)
    return bendGap(diff.spacing, bend)
  }

  /** BENDS: lay the gap behind `gate` (its bend, then its orb). Orbs never sit in an arc. */
  function fillBendGap(gate) {
    const index = run.nextGateIndex()
    const bend = pendingBends.get(index)
    pendingBends.delete(index)
    const previousZ = gate.z + gate.gap
    if (bend) bends.spawn(previousZ - bend.lead, bend.length, bend.angle)
    const type = rollRunOrb(index)
    if (type) powerups.spawn(bend ? previousZ - bend.lead * 0.5 : gate.z + gate.gap * 0.5, type)
  }

  function spawnAhead() {
    const diff = currentDifficulty()
    if (run.bends) {
      gates.ensureAhead(run.score, diff, spawned, { gapFor, horizon: BEND_SPAWN_HORIZON_Z })
      for (const gate of spawned) fillBendGap(gate)
      return
    }
    gates.ensureAhead(run.score, diff, spawned, {
      typeFor: run.tutorial ? tutorialGateType : undefined,
      course: run.challenge ? run.course : undefined,
    })
    for (const gate of spawned) dropOrb(gate, diff.spacing)
  }

  return { reset, spawnAhead, currentDifficulty }
}

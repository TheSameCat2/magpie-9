import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { BEND_LEAD, BEND_START_GATE, bendTrail } from '../config/bends.js'
import { BIRD_HIT } from '../config/world.js'
import { createRng } from '../lib/rng.js'
import { createBends } from '../world/bends.js'
import { createGates } from '../world/gates/index.js'
import { createSpawner } from './spawner.js'
import { createRun, rewindDistance } from './run.js'

const EPS = 1e-6

/**
 * A BENDS world on the real gate pool and bend pool. Everything spawned is
 * logged at its course position `at` (z minus distance flown), which never
 * changes as the world scrolls.
 */
function world(seed, score = 0) {
  const material = new THREE.MeshBasicMaterial()
  const gates = createGates(new THREE.Scene(), new Proxy({}, { get: () => material }))
  const bends = createBends()
  const run = createRun()
  run.begin('bends')
  for (let s = 0; s < score; s++) run.clearGate()
  const log = { gates: [], bends: [], orbs: [] }
  let flown = 0

  const ensureAhead = gates.ensureAhead
  gates.ensureAhead = (...args) => {
    ensureAhead(...args)
    for (const gate of args[2]) log.gates.push({ at: gate.z - flown, gap: gate.gap, index: log.gates.length })
  }
  const spawnBend = bends.spawn
  bends.spawn = (z, length, angle) => {
    log.bends.push({ at: z - flown, length, angle, score: run.score })
    return spawnBend(z, length, angle)
  }
  const powerups = {
    spawn(z, type) {
      log.orbs.push({ at: z - flown, type })
    },
  }
  const spawner = createSpawner({ gates, powerups, bends, run, rand: createRng(seed) })

  function scroll(dz) {
    gates.scroll(dz, 0)
    bends.scroll(dz)
    flown += dz
  }

  function fly(distance, step = 1.5) {
    spawner.spawnAhead()
    for (let d = 0; d < distance; d += step) {
      scroll(step)
      spawner.spawnAhead()
    }
  }

  return { gates, bends, run, log, fly, scroll }
}

/** The logged gates either side of a bend's arc, nearest first. */
function flanks(log, bend) {
  const before = log.gates.filter((g) => g.at > bend.at - EPS).sort((a, b) => a.at - b.at)[0]
  const after = log.gates.filter((g) => g.at < bend.at - bend.length + EPS).sort((a, b) => b.at - a.at)[0]
  return { before, after }
}

for (const score of [0, 60]) {
  test(`BENDS keeps a lead before and a speed-scaled trail after every arc (score ${score})`, () => {
    let checked = 0
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const w = world(seed, score)
      w.fly(3000)
      for (const bend of w.log.bends) {
        const { before, after } = flanks(w.log, bend)
        if (!before || !after) continue
        checked += 1
        assert.ok(before.at - bend.at >= BEND_LEAD - EPS, `lead ${before.at - bend.at}`)
        const trail = bend.at - bend.length - after.at
        assert.ok(trail >= bendTrail(bend.score) - EPS, `trail ${trail} < ${bendTrail(bend.score)}`)
        // One bend per gap: no other arc between the same two gates.
        const shared = w.log.bends.filter((b) => b !== bend && b.at < before.at && b.at > after.at)
        assert.equal(shared.length, 0)
      }
    }
    assert.ok(checked > 20, `only ${checked} bends checked`)
  })
}

test('BENDS never bends the warm-up gaps', () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const w = world(seed)
    w.fly(600)
    const warmupEnd = w.log.gates[BEND_START_GATE - 1].at
    assert.ok(w.log.bends.every((b) => b.at < warmupEnd))
  }
})

test('BENDS orbs never sit inside an arc', () => {
  for (const seed of [11, 12, 13, 14]) {
    const w = world(seed, 30)
    w.fly(3000)
    assert.ok(w.log.orbs.length > 20)
    for (const orb of w.log.orbs) {
      for (const bend of w.log.bends) {
        assert.ok(!(orb.at < bend.at && orb.at > bend.at - bend.length), 'orb in arc')
      }
    }
  }
})

test('a spare from inside a trail rewinds the bird to the straight before the bend', () => {
  let rewound = 0
  for (const seed of [21, 22, 23, 24, 25, 26]) {
    const w = world(seed, 40)
    w.fly(200)
    // Fly on until the bird has just left an arc and is in its trail.
    let justLeft = false
    for (let d = 0; d < 4000 && !justLeft; d += 0.5) {
      const inArc = w.bends.curvatureAt(0) !== 0
      w.scroll(0.5)
      justLeft = inArc && w.bends.curvatureAt(0) === 0
    }
    if (!justLeft) continue
    const anchor = w.gates.nearestAhead()
    w.scroll(-rewindDistance(anchor.z, anchor.gap))
    assert.equal(w.bends.curvatureAt(0), 0)
    const ahead = w.bends
      .active()
      .filter((b) => b.z < 0)
      .sort((a, b) => b.z - a.z)[0]
    assert.ok(ahead, 'the bend just flown is ahead again')
    assert.ok(-ahead.z > BIRD_HIT.z, 'the bird respawns clear of the arc')
    rewound += 1
  }
  assert.ok(rewound >= 4)
})

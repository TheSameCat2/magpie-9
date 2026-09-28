import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AFTERBURNER_SCORE, edgeProx, sparkPhase } from '../config/fx.js'
import { SECTOR } from '../config/rules.js'
import { openingShape } from '../world/gates/layout.js'
import { createSparks } from './sparks.js'

function harness({ score = 0, slots = [] } = {}) {
  const calls = { edge: [], burner: [], level: [] }
  const fx = {
    edgeSparks: (...args) => calls.edge.push(args),
    afterburner: (...args) => calls.burner.push(args),
  }
  const gates = {
    slots,
    edgeShape: openingShape,
  }
  const bird = {
    vx: 0.5,
    thrustPulse: 0.25,
    exhaust: { x: 1, y: -0.2, z: 0.97 },
    setAfterburner: (v) => calls.level.push(v),
  }
  const run = { score }
  const sparks = createSparks({ fx, gates, bird, run })
  return { sparks, calls, run }
}

function hatch(z, active = true) {
  return { type: 'bulkhead', active, z, depth: 0.3, hole: { x: 0.5, y: -0.4, w: 2.8, h: 3.2 } }
}

test('edge sparks fire once per active gate on the plate face, in the sector colour', () => {
  const { sparks, calls } = harness({
    score: SECTOR * 2 + 3,
    slots: [
      hatch(-20),
      hatch(-40, false),
      { type: 'pylon', active: true, z: -8, depth: 0.42, side: 'left', edge: 0.05 },
    ],
  })
  sparks.update(1 / 60, true)
  assert.equal(calls.edge.length, 2)
  const [x, y, z, hw, hh, , , phase, dt] = calls.edge[0]
  assert.equal(x, 0.5)
  assert.equal(y, -0.4)
  assert.equal(z, -20 + 0.15)
  assert.equal(hw, 1.4)
  assert.equal(hh, 1.6)
  assert.equal(phase, 2)
  // Both gates overlap in range, so the frame budget is normalised across them.
  const proxSum = edgeProx(-20 + 0.15) + edgeProx(-8 + 0.21)
  assert.ok(proxSum > 1)
  assert.ok(Math.abs(dt - 1 / 60 / proxSum) < 1e-12)
  assert.equal(calls.edge[1][7], sparkPhase(SECTOR * 2 + 3))
  assert.equal(calls.edge[1][8], dt)
})

test('a held frame (dt = 0) emits nothing', () => {
  const { sparks, calls } = harness({ score: AFTERBURNER_SCORE, slots: [hatch(-10)] })
  sparks.update(0, true)
  assert.equal(calls.edge.length, 0)
  assert.equal(calls.burner.length, 0)
  assert.equal(sparks.afterburner, 0)
})

test('afterburner stays cold below the ignition score', () => {
  const { sparks, calls } = harness({ score: AFTERBURNER_SCORE - 1 })
  for (let i = 0; i < 120; i++) sparks.update(1 / 60, true)
  assert.equal(sparks.afterburner, 0)
  assert.equal(calls.burner.length, 0)
  assert.ok(calls.level.every((v) => v === 0))
})

test('afterburner ramps in over about a second once the score is reached, then streams', () => {
  const { sparks, calls } = harness({ score: AFTERBURNER_SCORE })
  sparks.update(0.25, true)
  assert.ok(Math.abs(sparks.afterburner - 0.25) < 1e-9)
  assert.equal(calls.burner.length, 1)
  for (let i = 0; i < 4; i++) sparks.update(0.25, true)
  assert.equal(sparks.afterburner, 1)
  assert.equal(calls.level.at(-1), 1)
  const [x, y, z, vx, level, pulse, phase, dt] = calls.burner.at(-1)
  assert.deepEqual([x, y, z], [1, -0.2, 0.97])
  assert.equal(vx, 0.5)
  assert.equal(level, 1)
  assert.equal(pulse, 0.25)
  assert.equal(phase, sparkPhase(AFTERBURNER_SCORE))
  assert.equal(dt, 0.25)
})

test('afterburner only streams while live and cools when the run is not', () => {
  const { sparks, calls } = harness({ score: AFTERBURNER_SCORE })
  for (let i = 0; i < 5; i++) sparks.update(0.25, true)
  const streamed = calls.burner.length
  sparks.update(0.5, false)
  assert.equal(calls.burner.length, streamed)
  assert.ok(Math.abs(sparks.afterburner - 0.5) < 1e-9)
  sparks.update(0.5, false)
  assert.equal(sparks.afterburner, 0)
})

test('reset cools the burner immediately', () => {
  const { sparks, calls } = harness({ score: AFTERBURNER_SCORE })
  for (let i = 0; i < 5; i++) sparks.update(0.25, true)
  sparks.reset()
  assert.equal(sparks.afterburner, 0)
  assert.equal(calls.level.at(-1), 0)
})

test('a lone gate keeps the full frame budget', () => {
  const { sparks, calls } = harness({ slots: [hatch(-10)] })
  sparks.update(1 / 60, true)
  assert.equal(calls.edge.length, 1)
  assert.equal(calls.edge[0][8], 1 / 60)
})

test('stacked gates share one gate worth of proximity-weighted budget', () => {
  const dt = 1 / 60
  const { sparks, calls } = harness({ slots: [hatch(-2), hatch(-4), hatch(-6)] })
  sparks.update(dt, true)
  assert.equal(calls.edge.length, 3)
  const faces = [-2 + 0.15, -4 + 0.15, -6 + 0.15]
  const sum = faces.reduce((acc, z) => acc + edgeProx(z), 0)
  assert.ok(sum > 1)
  for (const args of calls.edge) assert.ok(Math.abs(args[8] - dt / sum) < 1e-12)
  const weighted = calls.edge.reduce((acc, args) => acc + edgeProx(args[2]) * args[8], 0)
  assert.ok(Math.abs(weighted - dt) < 1e-12)
})

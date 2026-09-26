import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  LESSONS,
  TUTORIAL_SPEED,
  TUTORIAL_FLOOR,
  tutorialDifficulty,
  tutorialGateType,
  tutorialOrbType,
  tutorialSpeed,
} from './tutorial.js'
import { difficulty } from './rules.js'

test('tutorial is slower than a fresh run and never offsets the hatch', () => {
  const t = tutorialDifficulty()
  const run = difficulty(0)
  assert.ok(t.speed < run.speed)
  assert.ok(t.spacing > run.spacing)
  assert.equal(t.offset, 0)
})

test('tutorial gates introduce every hazard in order, then repeat', () => {
  const first = Array.from({ length: 7 }, (_, i) => tutorialGateType(i))
  assert.deepEqual(first, ['bulkhead', 'bulkhead', 'bulkhead', 'laser-bar', 'laser-bar', 'pylon', 'pylon'])
  assert.equal(tutorialGateType(7), 'bulkhead')
  assert.equal(tutorialGateType(10), 'laser-bar')
  assert.equal(tutorialGateType(13), 'pylon')
})

test('tutorial orbs rotate through damper, spare life, and shunt on every gate', () => {
  assert.equal(tutorialOrbType(0), 'damper')
  assert.equal(tutorialOrbType(1), 'life')
  assert.equal(tutorialOrbType(2), 'shunt')
  assert.equal(tutorialOrbType(3), 'damper')
  assert.equal(tutorialOrbType(5), 'shunt')
  assert.equal(tutorialOrbType(9), 'damper')
})

test('tutorial lessons start with flight, then each orb', () => {
  assert.deepEqual(LESSONS, ['flight', 'damper', 'life', 'shunt'])
})

test('tutorial dampers trim speed down to a floor', () => {
  assert.equal(tutorialSpeed(0), TUTORIAL_SPEED)
  assert.equal(tutorialSpeed(0.5), TUTORIAL_SPEED - 0.5)
  assert.equal(tutorialSpeed(50), TUTORIAL_FLOOR)
})

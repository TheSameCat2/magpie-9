import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SECTOR } from './rules.js'
import { THEME } from './theme.js'
import {
  AFTERBURNER_SCORE,
  SPARK_PHASE_CAP,
  SPARK_RAMP,
  afterburnerOn,
  sparkColor,
  sparkPhase,
} from './fx.js'

test('spark phase steps once per sector and never below zero', () => {
  assert.equal(sparkPhase(0), 0)
  assert.equal(sparkPhase(SECTOR - 1), 0)
  assert.equal(sparkPhase(SECTOR), 1)
  assert.equal(sparkPhase(SECTOR * 5), 5)
  assert.equal(sparkPhase(-3), 0)
})

test('spark phase clamps at the cap', () => {
  assert.equal(sparkPhase(SECTOR * (SPARK_PHASE_CAP + 4)), SPARK_PHASE_CAP)
})

test('spark colour starts green, ends red, and holds the last stop', () => {
  assert.equal(sparkColor(0), THEME.green)
  assert.equal(sparkColor(SPARK_RAMP.length - 1), 0xff3030)
  assert.equal(sparkColor(SPARK_PHASE_CAP), SPARK_RAMP.at(-1))
  assert.equal(sparkColor(-1), THEME.green)
})

test('the ramp turns red on the same sector the afterburner lights', () => {
  assert.equal(sparkPhase(AFTERBURNER_SCORE), SPARK_RAMP.length - 1)
  assert.equal(afterburnerOn(AFTERBURNER_SCORE - 1), false)
  assert.equal(afterburnerOn(AFTERBURNER_SCORE), true)
})

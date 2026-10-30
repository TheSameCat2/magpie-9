import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clampVolume, formatVolume, stepVolume } from './audio.js'

test('clampVolume keeps a channel inside 0..1 and treats junk as full', () => {
  assert.equal(clampVolume(0), 0)
  assert.equal(clampVolume(1), 1)
  assert.equal(clampVolume(1.4), 1)
  assert.equal(clampVolume(-0.2), 0)
  assert.equal(clampVolume(Number.NaN), 1)
})

test('stepVolume moves one click and stops at the ends', () => {
  assert.equal(stepVolume(1, -1), 0.9)
  assert.equal(stepVolume(0.9, 1), 1)
  assert.equal(stepVolume(1, 1), 1)
  assert.equal(stepVolume(0, -1), 0)
  assert.equal(formatVolume(0.9), '90')
  assert.equal(formatVolume(0), '0')
})

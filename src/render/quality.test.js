import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createQualityGovernor, stepQualityMode } from './quality.js'

test('stepQualityMode walks AUTO to HIGH and holds at both ends', () => {
  assert.equal(stepQualityMode('auto', -1), 'auto')
  assert.equal(stepQualityMode('auto', 1), '0')
  assert.equal(stepQualityMode('0', 1), '1')
  assert.equal(stepQualityMode('1', -1), '0')
  assert.equal(stepQualityMode('2', 1), '2')
})

test('apply pins a rung, clamps it, and can hand control back', () => {
  const seen = []
  const gov = createQualityGovernor({ level: 2, pinned: false, onChange: (n) => seen.push(n) })
  gov.apply(9, true)
  assert.equal(gov.level, 2)
  assert.equal(gov.pinned, true)
  gov.apply(0, true)
  assert.equal(gov.level, 0)
  gov.apply(0, false)
  assert.equal(gov.pinned, false)
  assert.deepEqual(seen, [2, 0, 0])
})

test('a pinned rung stays put through slow frames, and an open one steps down', () => {
  const pinned = createQualityGovernor({ level: 2, pinned: true, onChange() {} })
  pinned.observe(40, 3)
  pinned.observe(40, 2)
  assert.equal(pinned.level, 2)

  const open = createQualityGovernor({ level: 2, pinned: false, onChange() {} })
  open.observe(40, 3)
  open.observe(40, 2)
  assert.equal(open.level, 1)
})

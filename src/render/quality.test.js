import { test } from 'node:test'
import assert from 'node:assert/strict'
import { QUALITY, createQualityGovernor, msaaSamples, stepQualityMode } from './quality.js'

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

test('msaaSamples uses the rung count, capped at 2 on dense screens', () => {
  assert.equal(msaaSamples(QUALITY[2], 1), QUALITY[2].msaa)
  assert.equal(msaaSamples(QUALITY[2], 1.5), QUALITY[2].msaa)
  assert.equal(msaaSamples(QUALITY[2], 2), 2)
  assert.equal(msaaSamples({ msaa: 0 }, 2), 0)
})

test('observe ignores > 250 ms resume spikes without stepping AUTO quality down', () => {
  const seen = []
  const gov = createQualityGovernor({ level: 2, pinned: false, onChange: (n) => seen.push(n) })
  // Burn initial 3 s warm-up at 60 fps.
  gov.observe(16, 3.1)
  assert.equal(gov.level, 2)

  // Simulate repeated tab-resume / shader-compile spikes (> 250 ms).
  gov.observe(800, 0.05)
  gov.observe(2_500, 0.05)
  gov.observe(400)
  // Even a brief slow frame inside the post-spike 1 s grace window must not drop quality.
  gov.observe(35, 0.5)
  assert.equal(gov.level, 2)
  assert.deepEqual(seen, [])
})

test('resetWarmup restores warm-up grace and clears accumulated slow state', () => {
  const seen = []
  const gov = createQualityGovernor({ level: 2, pinned: false, onChange: (n) => seen.push(n) })
  gov.observe(40, 3.1)
  // Accumulate 1.2 s of slow frames (just below the 1.5 s downgrade threshold).
  gov.observe(40, 1.2)
  assert.equal(gov.level, 2)

  gov.resetWarmup()
  // Slow shader-recompile frames during the fresh 3 s warm-up grace do not step down.
  gov.observe(45, 1.5)
  gov.observe(45, 1.4)
  assert.equal(gov.level, 2)
  assert.deepEqual(seen, [])

  // Once warm-up expires and > 1.5 s of slow frames accumulate, governor steps down as usual.
  gov.observe(45, 0.2)
  gov.observe(45, 1.6)
  assert.equal(gov.level, 1)
  assert.deepEqual(seen, [1])
})

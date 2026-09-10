import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hitOrb } from './collision.js'

test('hitOrb is true when centres are within the combined radii', () => {
  const orb = { x: 0, y: 0, z: 0, r: 0.42 }
  assert.equal(hitOrb({ x: 0, y: 0, z: 0 }, 0.5, orb), true)
  assert.equal(hitOrb({ x: 0.9, y: 0, z: 0 }, 0.5, orb), true)
})

test('hitOrb is false just outside the combined radii', () => {
  const orb = { x: 0, y: 0, z: 0, r: 0.42 }
  assert.equal(hitOrb({ x: 0.921, y: 0, z: 0 }, 0.5, orb), false)
})

test('hitOrb is false when only Z differs by more than the combined radii', () => {
  const orb = { x: 0, y: 0, z: -2, r: 0.42 }
  assert.equal(hitOrb({ x: 0, y: 0, z: 0 }, 0.5, orb), false)
})

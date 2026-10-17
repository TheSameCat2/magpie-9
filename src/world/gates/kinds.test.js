import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GATE_COLOR, GATE_KINDS, GATE_TYPES, isHatchGate, layoutGate } from './kinds.js'

const BEHAVIOUR = ['layout', 'hit', 'margin', 'contact', 'opening', 'burst']

test('every hazard type has a complete kind descriptor', () => {
  assert.deepEqual(Object.keys(GATE_KINDS), GATE_TYPES)
  for (const type of GATE_TYPES) {
    const kind = GATE_KINDS[type]
    assert.ok(kind, `${type} has a descriptor`)
    for (const name of BEHAVIOUR) {
      assert.equal(typeof kind[name], 'function', `${type}.${name} is a function`)
    }
    assert.equal(GATE_COLOR[type], kind.color, `${type} has a colour`)
  }
})

test('hatch kinds are exactly the ones sharing the hatch collider', () => {
  for (const type of GATE_TYPES) {
    assert.equal(isHatchGate({ type }), type === 'bulkhead' || type === 'sled', type)
  }
})

test('every kind lays out a gate its own spark shapes can read', () => {
  for (const type of GATE_TYPES) {
    const gate = { z: 0, depth: 0.3, type, ...layoutGate(type, 1, () => 0.3) }
    for (const shape of [GATE_KINDS[type].opening(gate, {}), GATE_KINDS[type].burst(gate, 0.1, -0.2, {})]) {
      for (const field of ['x', 'y', 'hw', 'hh']) {
        assert.equal(typeof shape[field], 'number', `${type}.${field}`)
      }
    }
    assert.equal(
      typeof GATE_KINDS[type].margin({ x: 99, y: 99, z: 0 }, { x: 0.1, y: 0.1, z: 0.1 }, gate),
      'number',
    )
  }
})

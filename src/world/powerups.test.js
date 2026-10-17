import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createPowerups, ORB_TYPES } from './powerups.js'
import { BIRD_HIT } from '../config/world.js'

if (typeof globalThis.document === 'undefined') {
  const dummyCtx = new Proxy(
    {},
    {
      get: () => () => {},
      set: () => true,
    },
  )
  globalThis.document = {
    createElement: (tag) => {
      if (tag === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => dummyCtx,
        }
      }
      return {}
    },
  }
}

test('createPowerups initializes 10 pooled slots with 3D crystal cores and gimbal rings', () => {
  const scene = new THREE.Scene()
  const powerups = createPowerups(scene)

  assert.equal(powerups.pool.length, 10)
  for (const slot of powerups.pool) {
    assert.equal(slot.active, false)
    assert.equal(slot.group.visible, false)
    assert.ok(slot.crystal, 'slot should have crystal mesh')
    assert.ok(slot.crystal.geometry instanceof THREE.OctahedronGeometry, 'crystal is faceted octahedron')
    assert.ok(slot.ringOuter, 'slot should have outer gimbal ring')
    assert.ok(slot.ringOuter.geometry instanceof THREE.TorusGeometry, 'outer ring is torus')
    assert.ok(slot.ringInner, 'slot should have inner gimbal ring')
    assert.ok(slot.ringInner.geometry instanceof THREE.TorusGeometry, 'inner ring is torus')
    assert.ok(slot.icon, 'slot should have icon mesh')
    assert.ok(slot.shell, 'slot should have outer containment shell')
    assert.ok(slot.halo, 'slot should have billboard halo')
  }
})

test('spawn configures type, visibility, and resets rotations', () => {
  const scene = new THREE.Scene()
  const powerups = createPowerups(scene)

  for (const type of ORB_TYPES) {
    const orb = powerups.spawn(-15, type, 0, { x: 0.5, y: -0.2 })
    assert.ok(orb)
    assert.equal(orb.active, true)
    assert.equal(orb.type, type)
    assert.equal(orb.x, 0.5)
    assert.equal(orb.y, -0.2)
    assert.equal(orb.z, -15)
    assert.equal(orb.group.visible, true)
    assert.equal(orb.crystal.rotation.x, 0)
    assert.equal(orb.ringOuter.rotation.x, 0)
    assert.equal(orb.ringInner.rotation.y, 0)
    powerups.reset()
  }
})

test('scroll rotates gimbal rings and crystal core', () => {
  const scene = new THREE.Scene()
  const powerups = createPowerups(scene)

  const orb = powerups.spawn(-20, 'shunt', 0, { x: 0, y: 0 })
  assert.ok(orb)

  powerups.scroll(1.0, 0.05)
  assert.equal(orb.z, -19)
  assert.ok(orb.ringOuter.rotation.x !== 0, 'outer ring rotates on X')
  assert.ok(orb.ringOuter.rotation.z !== 0, 'outer ring rotates on Z')
  assert.ok(orb.ringInner.rotation.y !== 0, 'inner ring rotates counter on Y')
  assert.ok(orb.crystal.rotation.x !== 0, 'crystal core tumbles on X')
  assert.ok(orb.crystal.rotation.y !== 0, 'crystal core tumbles on Y')
})

test('collect deactivates touched orb and populates out array', () => {
  const scene = new THREE.Scene()
  const powerups = createPowerups(scene)

  const orb = powerups.spawn(0, 'damper', 0, { x: 0, y: 0 })
  assert.ok(orb)

  const out = []
  const count = powerups.collect({ x: 0, y: 0, z: 0 }, BIRD_HIT, out)
  assert.equal(count, 1)
  assert.equal(out[0], orb)
  assert.equal(orb.active, false)
  assert.equal(orb.group.visible, false)
})

test('spawn counts orbs dropped when the pool is full', () => {
  const scene = new THREE.Scene()
  const powerups = createPowerups(scene)

  for (let i = 0; i < powerups.pool.length; i++) {
    assert.ok(powerups.spawn(-10 - i, 'damper', 0, { x: 0, y: 0 }))
  }
  assert.equal(powerups.dropped, 0)
  assert.equal(powerups.spawn(-40, 'life', 0, { x: 0, y: 0 }), null)
  assert.equal(powerups.dropped, 1)

  // Reset recycles the pool but keeps the lifetime diagnostic.
  powerups.reset()
  assert.ok(powerups.spawn(-40, 'life', 0, { x: 0, y: 0 }))
  assert.equal(powerups.dropped, 1)
})

test('orb child matrices survive a forced scene update', () => {
  const scene = new THREE.Scene()
  const powerups = createPowerups(scene)
  const orb = powerups.spawn(-20, 'shunt', 0, { x: 0.3, y: -0.2 })
  assert.ok(orb)

  powerups.scroll(1.0, 0.05)
  const before = orb.children.map((child) => child.matrixWorld.elements.slice())
  scene.updateMatrixWorld(true)

  for (let i = 0; i < orb.children.length; i++) {
    const after = orb.children[i].matrixWorld.elements
    for (let e = 0; e < 16; e++) {
      assert.ok(Math.abs(after[e] - before[i][e]) < 1e-6, `child ${i} element ${e} stays stable`)
    }
  }
})

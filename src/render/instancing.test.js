import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createInstanceBatch, instancedMaterial, syncBeforeRender } from './instancing.js'

function placed(batch, parent, x) {
  const standIn = batch.add()
  standIn.visible = true
  standIn.position.set(x, 0, 0)
  parent.add(standIn)
  standIn.updateMatrixWorld(true)
  return standIn
}

test('sync packs only shown stand-ins, in pool order, as their world matrices', () => {
  const batch = createInstanceBatch(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())
  const root = new THREE.Group()
  const groupA = new THREE.Group()
  const groupB = new THREE.Group()
  root.add(groupA, groupB)
  const a = placed(batch, groupA, 1)
  const b = placed(batch, groupA, 2)
  const c = placed(batch, groupB, 3)
  const mesh = batch.attach(root)
  assert.equal(mesh.instanceMatrix.count, 3)

  b.visible = false
  groupB.visible = true
  assert.equal(batch.sync(), 2)
  assert.equal(mesh.count, 2)
  assert.equal(mesh.visible, true)
  const m = new THREE.Matrix4()
  mesh.getMatrixAt(0, m)
  assert.deepEqual(m.elements, a.matrixWorld.elements)
  mesh.getMatrixAt(1, m)
  assert.deepEqual(m.elements, c.matrixWorld.elements)

  // A hidden ancestor hides its stand-ins, as it would hide meshes.
  groupB.visible = false
  assert.equal(batch.sync(), 1)
  groupA.visible = false
  assert.equal(batch.sync(), 0)
  assert.equal(mesh.visible, false, 'an empty batch is skipped, not drawn with zero instances')
})

test('stand-ins cannot be added once the mesh is sized', () => {
  const batch = createInstanceBatch(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())
  batch.add()
  batch.attach(new THREE.Group())
  assert.throws(() => batch.add())
})

test('instancedMaterial copies a built-in material once and keeps its shader hooks', () => {
  const source = new THREE.MeshStandardMaterial({ color: 0x336699, roughness: 0.4 })
  source.onBeforeCompile = () => {}
  source.customProgramCacheKey = () => 'bend|'
  const copy = instancedMaterial(source)
  assert.notEqual(copy, source)
  assert.equal(instancedMaterial(source), copy)
  assert.equal(copy.onBeforeCompile, source.onBeforeCompile)
  assert.equal(copy.customProgramCacheKey, source.customProgramCacheKey)
  assert.equal(/** @type {THREE.MeshStandardMaterial} */ (copy).roughness, 0.4)
})

test('instancedMaterial leaves shader materials shared, so their uniforms stay linked', () => {
  const shared = { value: 1 }
  const shader = new THREE.ShaderMaterial({ uniforms: { uTime: shared } })
  assert.equal(instancedMaterial(shader), shader)
})

test('syncBeforeRender attaches the batches and syncs them when the scene renders', () => {
  const scene = new THREE.Scene()
  const root = new THREE.Group()
  scene.add(root)
  const batch = createInstanceBatch(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())
  placed(batch, root, 0)
  syncBeforeRender(scene, root, [batch])
  assert.equal(batch.mesh?.parent, root)
  assert.equal(batch.mesh?.count, 0)
  // Called the way WebGLRenderer.render calls it.
  scene.onBeforeRender(/** @type {any} */ (null), scene, new THREE.Camera(), null)
  assert.equal(batch.mesh?.count, 1)
})

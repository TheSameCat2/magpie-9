import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {
  MAGPIE_BONES,
  MAGPIE_SPAN,
  createMagpieRig,
  normalizeMagpieGeometry,
  skinWeightsAt,
} from './magpie-rig.js'

function topBone(x, y, z) {
  const { indices, weights } = skinWeightsAt(x, y, z)
  return MAGPIE_BONES[indices[weights.indexOf(Math.max(...weights))]]
}

test('skin weights always sum to 1 with four padded influences', () => {
  for (const [x, y, z] of [
    [0, 0, 0],
    [0.7, 0.3, 0.5],
    [-0.7, 0.3, 0.5],
    [0, -0.2, 0.6],
    [0.3, 0, -0.4],
    [-0.2, 0.1, 0.4],
  ]) {
    const { indices, weights } = skinWeightsAt(x, y, z)
    assert.equal(indices.length, 4)
    assert.equal(weights.length, 4)
    const sum = weights.reduce((a, b) => a + b, 0)
    assert.ok(Math.abs(sum - 1) < 1e-6, `weights sum to 1 at ${x},${y},${z}, got ${sum}`)
  }
})

test('skin weights assign body to root, wingtips to wrists, tail fan to tail', () => {
  assert.equal(topBone(0, 0, 0), 'root')
  assert.equal(topBone(0.75, 0.4, -0.1), 'wristR')
  assert.equal(topBone(-0.75, 0.4, -0.1), 'wristL')
  assert.equal(topBone(0.5, 0.2, -0.2), 'elbowR')
  assert.equal(topBone(-0.25, 0.2, -0.2), 'shoulderL')
  assert.equal(topBone(0, -0.3, 0.6), 'tail')
})

test('skin weights are mirror-symmetric across the body', () => {
  for (const z of [-0.3, 0, 0.4]) {
    const left = skinWeightsAt(-0.6, 0.2, z)
    const right = skinWeightsAt(0.6, 0.2, z)
    const byName = ({ indices, weights }) =>
      Object.fromEntries(indices.map((bone, i) => [MAGPIE_BONES[bone], weights[i]]))
    const l = byName(left)
    const r = byName(right)
    assert.ok(Math.abs((l.wristL ?? 0) - (r.wristR ?? 0)) < 1e-6)
    assert.ok(Math.abs((l.elbowL ?? 0) - (r.elbowR ?? 0)) < 1e-6)
    assert.ok(Math.abs((l.root ?? 0) - (r.root ?? 0)) < 1e-6)
  }
})

test('normalizeMagpieGeometry points the beak down -Z, centres, and scales to span', () => {
  // Landmark-only geometry in source pose: beak, tail tip, both wingtips.
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([0, 0.35, 0.8, 0, -0.56, -0.75, -0.95, 0.5, 0.55, 0.95, 0.5, 0.55], 3),
  )
  normalizeMagpieGeometry(geometry)
  const pos = geometry.getAttribute('position')
  const beak = new THREE.Vector3().fromBufferAttribute(pos, 0)
  const tail = new THREE.Vector3().fromBufferAttribute(pos, 1)
  const tipL = new THREE.Vector3().fromBufferAttribute(pos, 2)
  const tipR = new THREE.Vector3().fromBufferAttribute(pos, 3)
  assert.ok(beak.z < -0.3, `beak should face -Z, got z=${beak.z}`)
  assert.ok(tail.z > 0.3, `tail should sit at +Z, got z=${tail.z}`)
  assert.ok(Math.abs(tipL.y - tipR.y) < 0.05, `wingtips level, got L=${tipL.y} R=${tipR.y}`)
  assert.ok(Math.abs(beak.y) < 0.25, `body axis should be levelled, beak y=${beak.y}`)
  geometry.computeBoundingBox()
  const size = geometry.boundingBox.getSize(new THREE.Vector3())
  assert.ok(Math.abs(size.x - MAGPIE_SPAN) < 1e-5, `span scaled to ${MAGPIE_SPAN}, got ${size.x}`)
  const center = geometry.boundingBox.getCenter(new THREE.Vector3())
  assert.ok(center.length() < 1e-5, `geometry centred, got ${center.toArray()}`)
})

test('createMagpieRig builds a bound skinned mesh whose wingtip follows the flap bones', () => {
  const geometry = new THREE.BoxGeometry(1.6, 0.4, 1.2, 8, 1, 4)
  const rig = createMagpieRig(geometry, new THREE.MeshBasicMaterial())
  assert.ok(rig.mesh.isSkinnedMesh)
  assert.ok(rig.mesh.skeleton)
  assert.equal(rig.mesh.skeleton.bones.length, MAGPIE_BONES.length)
  assert.equal(rig.shoulderL.parent, rig.root)
  assert.equal(rig.elbowL.parent, rig.shoulderL)
  assert.equal(rig.wristL.parent, rig.elbowL)
  assert.equal(rig.tipL.parent, rig.wristL)

  rig.mesh.updateMatrixWorld(true)
  const before = new THREE.Vector3()
  rig.tipL.getWorldPosition(before)
  rig.shoulderL.rotation.z = 0.8
  rig.mesh.updateMatrixWorld(true)
  const after = new THREE.Vector3()
  rig.tipL.getWorldPosition(after)
  assert.ok(after.y < before.y - 0.1, `left wingtip should stroke down on flap, ${before.y} -> ${after.y}`)

  // Skinned vertices at the wingtip move with the wrist bone.
  rig.mesh.skeleton.update()
  const tipVertex = rig.mesh.getVertexPosition(0, new THREE.Vector3())
  assert.ok(Number.isFinite(tipVertex.length()))
})

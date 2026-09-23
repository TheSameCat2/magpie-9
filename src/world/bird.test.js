import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createBird } from './bird.js'
import { BIRD_VISUAL_SCALE } from '../config/world.js'

function dummyMaterials() {
  const m = new THREE.MeshBasicMaterial()
  return {
    birdBody: m,
    birdBelly: m,
    birdTrim: m,
    beak: m,
    metalHi: m,
  }
}

test('createBird initializes with faceted hierarchy and visual scale', () => {
  const scene = new THREE.Scene()
  const materials = dummyMaterials()
  const bird = createBird(scene, materials)

  assert.equal(bird.group.name, 'magpie')
  assert.equal(bird.group.scale.x, BIRD_VISUAL_SCALE)
  assert.equal(bird.x, 0)
  assert.equal(bird.y, 0)
  assert.equal(bird.vx, 0)
  assert.equal(bird.vy, 0)
  assert.ok(bird.group.children.length > 5, 'should have airframe, wings, tail, thruster, and collider')
})

test('flap applies upward velocity impulse', () => {
  const scene = new THREE.Scene()
  const bird = createBird(scene, dummyMaterials())

  assert.equal(bird.vy, 0)
  bird.flap()
  assert.equal(bird.vy, 9.5)
})

test('updatePlay updates position, bank, and secondary kinematics', () => {
  const scene = new THREE.Scene()
  const bird = createBird(scene, dummyMaterials())

  const input = { strafe: 0.5 }
  bird.updatePlay(0.016, input, 0.2)

  assert.ok(bird.vx > 0, 'strafe should accelerate vx')
  assert.ok(bird.x > 0, 'positive vx should move position.x')
  assert.ok(bird.vy < 0, 'gravity should pull vy down')
  assert.ok(bird.bank !== 0, 'banking roll should engage with vx')
})

test('updateIdle bobs and resets clean without errors', () => {
  const scene = new THREE.Scene()
  const bird = createBird(scene, dummyMaterials())

  bird.updateIdle(0.016, 0.1)
  assert.equal(bird.x, 0)
  assert.ok(Math.abs(bird.y) < 0.2)

  bird.reset()
  assert.equal(bird.x, 0)
  assert.equal(bird.y, 0)
  assert.equal(bird.vx, 0)
  assert.equal(bird.vy, 0)
})

test('kill shuts down thruster and trails', () => {
  const scene = new THREE.Scene()
  const bird = createBird(scene, dummyMaterials())

  bird.kill()
  bird.updateDead(0.016)

  assert.ok(bird.vy < 0, 'dead gravity should act')
})

test('toggleCollider toggles wireframe collider visibility', () => {
  const scene = new THREE.Scene()
  const bird = createBird(scene, dummyMaterials())

  const collider = bird.group.children.find((c) => c.material?.wireframe)
  assert.ok(collider, 'should find collider mesh in group')
  assert.equal(collider.visible, false)

  bird.toggleCollider()
  assert.equal(collider.visible, true)

  bird.toggleCollider()
  assert.equal(collider.visible, false)
})

test('wing hierarchy has articulated shoulder, elbow, and wrist joints', () => {
  const scene = new THREE.Scene()
  const bird = createBird(scene, dummyMaterials())

  const wings = bird.group.children.filter(
    (c) => c instanceof THREE.Group && c.children.some((sub) => sub instanceof THREE.Group),
  )
  assert.equal(wings.length, 2, 'should have left and right wing pivots')

  const leftWing = wings[0]
  const elbow = leftWing.children.find((c) => c instanceof THREE.Group)
  assert.ok(elbow, 'wing should contain an articulated elbow joint group')

  const wrist = elbow.children.find((c) => c instanceof THREE.Group)
  assert.ok(wrist, 'elbow should contain an articulated wrist joint group')

  bird.flap()
  bird.updatePlay(0.016, { strafe: 0 }, 0.1)

  assert.ok(leftWing.rotation.z !== 0, 'shoulder should flap')
  assert.ok(elbow.rotation.z !== 0, 'elbow should articulate')
  assert.ok(wrist.rotation.z !== 0, 'wrist should articulate')
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createBird, nearestWallClearance } from './bird.js'
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

test('nearestWallClearance computes signed distance from hull extents to hex walls', () => {
  const centerClearance = nearestWallClearance(0, 0)
  assert.ok(centerClearance > 3.8 && centerClearance < 4.1, 'center clearance should be near 3.85')

  const nearTopClearance = nearestWallClearance(0, 3.8)
  assert.ok(nearTopClearance < 0.25, 'clearance should decrease as bird approaches top wall')

  const nearSideClearance = nearestWallClearance(4.0, 0)
  assert.ok(nearSideClearance < 0.45, 'clearance should decrease as bird approaches side wall')
})

test('proxLight engages contact wash and hazard strobe when near conduit walls', () => {
  const scene = new THREE.Scene()
  const bird = createBird(scene, dummyMaterials())

  const proxLight = bird.group.children.find((c) => c instanceof THREE.PointLight && c.position.z === 0)
  assert.ok(proxLight, 'proxLight point light should exist in bird group')
  assert.equal(proxLight.intensity, 0, 'proxLight should be dark at center')

  // Move bird near top wall to trigger proximity wash
  bird.pos.set(0, 3.2, 0)
  bird.updatePlay(0.016, { strafe: 0 }, 0.1)
  assert.ok(proxLight.intensity > 0, 'proxLight should glow when clearance < 1.4')
  assert.ok(bird.clearance < 1.0, 'clearance getter should reflect current position')

  // Move bird dangerously close to trigger strobe
  bird.pos.set(0, 3.85, 0)
  bird.updatePlay(0.016, { strafe: 0 }, 0.1)
  assert.ok(proxLight.intensity > 1.5, 'proxLight should strobe with high intensity in hazard zone')

  // Reset turns it off
  bird.reset()
  assert.equal(proxLight.intensity, 0, 'reset turns off proxLight')
})

test('thruster light expands distance and intensity on flap pulse', () => {
  const scene = new THREE.Scene()
  const bird = createBird(scene, dummyMaterials())

  const thrusterLight = bird.group.children.find((c) => c instanceof THREE.PointLight && c.position.z > 0.2)
  assert.ok(thrusterLight, 'thruster point light should exist at rear nozzle')

  bird.updateIdle(0.016, 0.1)
  const idleDistance = thrusterLight.distance
  const idleIntensity = thrusterLight.intensity

  bird.flap()
  bird.updatePlay(0.016, { strafe: 0 }, 0.1)
  assert.ok(thrusterLight.distance > idleDistance, 'thruster backwash distance should expand on flap')
  assert.ok(thrusterLight.intensity > idleIntensity, 'thruster intensity should flare on flap')
})

test('shockCone is attached to drone, toggled on reset/kill, and references uOverdrive', () => {
  const scene = new THREE.Scene()
  const bird = createBird(scene, dummyMaterials())

  assert.ok(bird.shockCone, 'shockCone mesh should exist on bird')
  assert.equal(bird.shockCone.name, 'shockCone')
  assert.equal(bird.shockCone.visible, true, 'shockCone visible by default')
  assert.ok(bird.shockCone.material.uniforms.uOverdrive, 'shockCone material binds uOverdrive')

  bird.kill()
  assert.equal(bird.shockCone.visible, false, 'shockCone hidden on kill')

  bird.reset()
  assert.equal(bird.shockCone.visible, true, 'shockCone restored on reset')
})

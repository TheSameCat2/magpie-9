import * as THREE from 'three'
import { THEME } from '../config/theme.js'
import { SPARK_RAMP } from '../config/fx.js'
import { BIRD_BODY_D, BIRD_BODY_H, BIRD_BODY_W, BIRD_VISUAL_SCALE, TUNNEL_APOTHEM } from '../config/world.js'
import { UNIFORMS } from '../render/uniforms.js'
import { FRAME_VERT, THRUST_FRAG, TRAIL_VERT, TRAIL_FRAG } from '../render/shaders.js'

// Flight feel (PLAN.md "Feel"). Units per second / per second squared.
const GRAVITY = -28
const FLAP_VY = 9.5
const VY_MIN = -16
const VY_MAX = 11
const STRAFE_MAX = 7
const STRAFE_ACCEL = 55
const STRAFE_DAMPING = 10
const DEAD_GRAVITY = -12

const TRAIL_N = 16
const DEAD_WALL = TUNNEL_APOTHEM - 0.65
const DEAD_FLOOR = -DEAD_WALL
/** How much longer the thruster cone burns at full afterburner. */
const BURNER_STRETCH = 0.9
const _tip = new THREE.Vector3()

function box(w, h, d, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
  mesh.castShadow = false
  mesh.receiveShadow = false
  return mesh
}

/** Non-indexed faceted geometry with sharp, flat per-polygon normals. Built once at boot. */
function facetedMesh(positions, indices, material) {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3))
  if (indices) geo.setIndex(indices)
  const flat = indices ? geo.toNonIndexed() : geo
  flat.computeVertexNormals()
  if (indices) geo.dispose()
  const mesh = new THREE.Mesh(flat, material)
  mesh.castShadow = false
  mesh.receiveShadow = false
  return mesh
}

// Ribbon of TRAIL_N samples streaming back from a wingtip. Samples live in
// world space and recede with the conduit scroll.
function createTrail(scene, color) {
  const geo = new THREE.BufferGeometry()
  const pos = new Float32Array(TRAIL_N * 2 * 3)
  const t = new Float32Array(TRAIL_N * 2)
  const idx = []
  for (let i = 0; i < TRAIL_N; i++) {
    t[i * 2] = i / (TRAIL_N - 1)
    t[i * 2 + 1] = i / (TRAIL_N - 1)
    if (i < TRAIL_N - 1) {
      const a = i * 2
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  }
  const aPos = new THREE.BufferAttribute(pos, 3)
  aPos.setUsage(THREE.DynamicDrawUsage)
  geo.setAttribute('position', aPos)
  geo.setAttribute('aT', new THREE.BufferAttribute(t, 1))
  geo.setIndex(idx)
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 30)
  const material = new THREE.ShaderMaterial({
    vertexShader: TRAIL_VERT,
    fragmentShader: TRAIL_FRAG,
    uniforms: {
      uTime: UNIFORMS.uTime,
      uFogDensity: UNIFORMS.uFogDensity,
      uColor: { value: new THREE.Color(color) },
      uIntensity: { value: 0.6 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.Mesh(geo, material)
  mesh.frustumCulled = false
  mesh.name = 'trail'
  scene.add(mesh)

  const sx = new Float32Array(TRAIL_N)
  const sy = new Float32Array(TRAIL_N)
  const sz = new Float32Array(TRAIL_N)

  function write() {
    for (let i = 0; i < TRAIL_N; i++) {
      const w = 0.035 * (1 - i / TRAIL_N) + 0.006
      const o = i * 6
      pos[o] = sx[i]
      pos[o + 1] = sy[i] + w
      pos[o + 2] = sz[i]
      pos[o + 3] = sx[i]
      pos[o + 4] = sy[i] - w
      pos[o + 5] = sz[i]
    }
    aPos.needsUpdate = true
  }

  function reset(x, y, z) {
    sx.fill(x)
    sy.fill(y)
    sz.fill(z)
    write()
  }

  function push(x, y, z, dz) {
    for (let i = TRAIL_N - 1; i > 0; i--) {
      sx[i] = sx[i - 1]
      sy[i] = sy[i - 1]
      sz[i] = sz[i - 1] + dz
    }
    sx[0] = x
    sy[0] = y
    sz[0] = z
    write()
  }

  function setIntensity(value) {
    material.uniforms.uIntensity.value = value
  }

  function setVisible(visible) {
    mesh.visible = visible
  }

  return { reset, push, setIntensity, setVisible }
}

/** Faceted dorsal stealth fuselage and chine armor. */
function createDorsalHull(material) {
  // Coordinates: +X right, +Y up, +Z toward camera (bird faces -Z into the tunnel)
  const vertices = [
    // 0: Nose apex
    0, 0.05, -0.46,
    // 1: Forehead / Canopy crest
    0, 0.14, -0.28,
    // 2: Mid dorsal spine
    0, 0.13, 0.02,
    // 3: Aft dorsal spine
    0, 0.1, 0.28,
    // 4: Tail base top
    0, 0.05, 0.38,

    // Right Shoulder
    // 5: R Shoulder Fwd
    0.12, 0.09, -0.26,
    // 6: R Shoulder Mid
    0.17, 0.08, 0.0,
    // 7: R Shoulder Aft
    0.13, 0.06, 0.26,

    // Left Shoulder
    // 8: L Shoulder Fwd
    -0.12, 0.09, -0.26,
    // 9: L Shoulder Mid
    -0.17, 0.08, 0.0,
    // 10: L Shoulder Aft
    -0.13, 0.06, 0.26,

    // Right Chine (outer flank boundary)
    // 11: R Chine Fwd
    0.08, 0.02, -0.4,
    // 12: R Chine Mid-Fwd
    0.2, 0.01, -0.12,
    // 13: R Chine Mid-Aft
    0.19, -0.01, 0.14,
    // 14: R Chine Aft
    0.1, 0.01, 0.36,

    // Left Chine
    // 15: L Chine Fwd
    -0.08, 0.02, -0.4,
    // 16: L Chine Mid-Fwd
    -0.2, 0.01, -0.12,
    // 17: L Chine Mid-Aft
    -0.19, -0.01, 0.14,
    // 18: L Chine Aft
    -0.1, 0.01, 0.36,

    // 19: Tail base bottom
    0, -0.03, 0.38,
  ]

  const indices = [
    // Right dorsal deck
    0, 1, 5, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 4, 7, 0, 5, 11, 5, 6, 12, 5, 12, 11, 6, 7, 13, 6, 13, 12,
    7, 14, 13, 7, 4, 14, 4, 19, 14,

    // Left dorsal deck (counter-wound for outward normals)
    0, 8, 1, 1, 9, 2, 1, 8, 9, 2, 10, 3, 2, 9, 10, 3, 10, 4, 0, 15, 8, 8, 16, 9, 8, 15, 16, 9, 17, 10, 9, 16,
    17, 10, 17, 18, 10, 18, 4, 4, 18, 19,
  ]

  return facetedMesh(vertices, indices, material)
}

/** Faceted ventral V-keel breast and underbelly armor plates. */
function createVentralBelly(material) {
  const vertices = [
    // 0: Throat
    0, -0.02, -0.38,
    // 1: Chest / Breast keel
    0, -0.13, -0.16,
    // 2: Mid belly keel
    0, -0.14, 0.06,
    // 3: Aft belly keel
    0, -0.08, 0.26,
    // 4: Rear underside
    0, -0.03, 0.38,

    // Right Chine
    // 5: R Chine Fwd
    0.08, 0.02, -0.4,
    // 6: R Chine Mid-Fwd
    0.2, 0.01, -0.12,
    // 7: R Chine Mid-Aft
    0.19, -0.01, 0.14,
    // 8: R Chine Aft
    0.1, 0.01, 0.36,

    // Left Chine
    // 9: L Chine Fwd
    -0.08, 0.02, -0.4,
    // 10: L Chine Mid-Fwd
    -0.2, 0.01, -0.12,
    // 11: L Chine Mid-Aft
    -0.19, -0.01, 0.14,
    // 12: L Chine Aft
    -0.1, 0.01, 0.36,

    // 13: Forward nose apex
    0, 0.05, -0.46,
  ]

  const indices = [
    // Right ventral keel
    0, 1, 5, 1, 6, 5, 1, 2, 6, 2, 7, 6, 2, 3, 7, 3, 8, 7, 3, 4, 8,

    // Left ventral keel
    0, 9, 1, 1, 9, 10, 1, 10, 2, 2, 10, 11, 2, 11, 3, 3, 11, 12, 3, 12, 4,

    // Throat closure to nose apex
    0, 5, 13, 0, 13, 9,
  ]

  return facetedMesh(vertices, indices, material)
}

/** Chiseled 4-sided diamond pyramid beak in polished titanium/chrome. */
function createBeak(material) {
  const vertices = [
    // 0: Tip
    0, 0.005, -0.72,
    // 1: Top base
    0, 0.045, -0.5,
    // 2: Bottom base
    0, -0.035, -0.5,
    // 3: Right base
    0.045, 0.005, -0.5,
    // 4: Left base
    -0.045, 0.005, -0.5,
  ]
  const indices = [0, 3, 1, 0, 1, 4, 0, 2, 3, 0, 4, 2, 1, 3, 2, 1, 2, 4]
  return facetedMesh(vertices, indices, material)
}

/** Stepped diamond wedge tail: magpie's signature aerodynamic empennage. */
function createTail(materials) {
  const group = new THREE.Group()
  group.position.set(0, 0.04, 0.34)

  // Central primary wedge feather (longest, signature magpie diamond)
  const centerBody = box(0.11, 0.018, 0.44, materials.birdBody)
  centerBody.position.set(0, 0, 0.22)
  const centerSpine = box(0.025, 0.012, 0.42, materials.birdTrim)
  centerSpine.position.set(0, 0.011, 0.22)
  const centerTip = box(0.075, 0.014, 0.06, materials.birdTrim)
  centerTip.position.set(0, 0, 0.43)

  // Intermediate stepped feathers (left and right)
  const midL = box(0.075, 0.015, 0.32, materials.birdBody)
  midL.position.set(-0.065, -0.002, 0.16)
  midL.rotation.y = -0.12
  const midLTip = box(0.055, 0.012, 0.04, materials.birdTrim)
  midLTip.position.set(-0.084, -0.002, 0.31)
  midLTip.rotation.y = -0.12

  const midR = box(0.075, 0.015, 0.32, materials.birdBody)
  midR.position.set(0.065, -0.002, 0.16)
  midR.rotation.y = 0.12
  const midRTip = box(0.055, 0.012, 0.04, materials.birdTrim)
  midRTip.position.set(0.084, -0.002, 0.31)
  midRTip.rotation.y = 0.12

  // Lateral outer vanes
  const outerL = box(0.055, 0.012, 0.22, materials.birdBody)
  outerL.position.set(-0.11, -0.004, 0.11)
  outerL.rotation.y = -0.24

  const outerR = box(0.055, 0.012, 0.22, materials.birdBody)
  outerR.position.set(0.11, -0.004, 0.11)
  outerR.rotation.y = 0.24

  group.add(centerBody, centerSpine, centerTip, midL, midLTip, midR, midRTip, outerL, outerR)
  group.rotation.x = 0.2
  return group
}

function cylinder(rTop, rBot, height, segments, material) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, height, segments), material)
  mesh.castShadow = false
  mesh.receiveShadow = false
  return mesh
}

/**
 * Articulated 3-segment feathered wing:
 * Shoulder (humerus) -> Elbow joint -> Forearm (radius/ulna) -> Wrist joint -> Outer flight pinion.
 * Each joint has a visible mechanical hinge knuckle and articulates with aerodynamic phase lag.
 */
function createWing(materials, sign) {
  // 1. SHOULDER / INNER ARM (Humerus)
  const pivot = new THREE.Group()
  pivot.position.set(0.16 * sign, 0.04, -0.04)

  // Shoulder mechanical actuator hub
  const shoulderHub = cylinder(0.036, 0.036, 0.07, 8, materials.metalHi)
  shoulderHub.rotation.z = Math.PI / 2
  const shoulderAccent = box(0.025, 0.025, 0.08, materials.birdTrim)
  shoulderAccent.position.set(0, 0.005, 0)

  // Inner arm structural spar
  const innerSpar = box(0.22, 0.032, 0.08, materials.birdBody)
  innerSpar.position.set(0.11 * sign, 0.002, -0.015)

  // Inner arm leading edge trim
  const innerLead = box(0.2, 0.018, 0.03, materials.birdTrim)
  innerLead.position.set(0.11 * sign, 0.006, -0.07)

  // Inner secondary feather vane (broad root chord)
  const innerFeather = box(0.22, 0.015, 0.16, materials.birdBody)
  innerFeather.position.set(0.12 * sign, -0.005, 0.08)
  innerFeather.rotation.y = sign * 0.04

  pivot.add(shoulderHub, shoulderAccent, innerSpar, innerLead, innerFeather)

  // 2. ELBOW JOINT & FOREARM (Radius / Ulna)
  const elbow = new THREE.Group()
  elbow.position.set(0.21 * sign, 0.004, -0.015)

  // Visible mechanical elbow hinge knuckle
  const elbowHinge = cylinder(0.028, 0.028, 0.055, 8, materials.metalHi)
  elbowHinge.rotation.x = Math.PI / 2
  const elbowCap = box(0.018, 0.035, 0.035, materials.birdTrim)

  // Forearm aerofoil blade (swept back)
  const foreBlade = box(0.22, 0.026, 0.15, materials.birdBody)
  foreBlade.position.set(0.11 * sign, 0.003, -0.025)
  foreBlade.rotation.y = sign * 0.12

  // Forearm leading edge armor strip
  const foreLead = box(0.23, 0.02, 0.032, materials.birdTrim)
  foreLead.position.set(0.11 * sign, 0.006, -0.11)
  foreLead.rotation.y = sign * 0.12

  // Mid primary feather vane
  const midFeather = box(0.24, 0.015, 0.14, materials.birdBody)
  midFeather.position.set(0.12 * sign, -0.003, 0.06)
  midFeather.rotation.y = sign * 0.16

  elbow.add(elbowHinge, elbowCap, foreBlade, foreLead, midFeather)
  pivot.add(elbow)

  // 3. WRIST JOINT & OUTER FLIGHT PINION (Hand / Carpus)
  const wrist = new THREE.Group()
  wrist.position.set(0.21 * sign, 0.003, -0.025)

  // Visible mechanical wrist knuckle
  const wristHinge = cylinder(0.022, 0.022, 0.045, 8, materials.metalHi)
  wristHinge.rotation.x = Math.PI / 2

  // Outer primary flight blade (longest aerodynamic vane, swept back to wingtip)
  const outerBlade = box(0.26, 0.018, 0.11, materials.birdBody)
  outerBlade.position.set(0.13 * sign, 0.002, -0.02)
  outerBlade.rotation.y = sign * 0.22

  // Outer leading edge armor
  const outerLead = box(0.26, 0.016, 0.026, materials.birdTrim)
  outerLead.position.set(0.13 * sign, 0.005, -0.08)
  outerLead.rotation.y = sign * 0.22

  // Upturned aerodynamic winglet tip
  const winglet = box(0.05, 0.028, 0.03, materials.birdTrim)
  winglet.position.set(0.25 * sign, 0.014, -0.04)
  winglet.rotation.z = sign * 0.35

  // Primary trailing feather vane
  const outerFeather = box(0.24, 0.013, 0.1, materials.birdBody)
  outerFeather.position.set(0.13 * sign, -0.003, 0.04)
  outerFeather.rotation.y = sign * 0.28

  // Wingtip contrail emitter marker
  const tip = new THREE.Object3D()
  tip.position.set(0.26 * sign, 0.014, -0.04)

  wrist.add(wristHinge, outerBlade, outerLead, winglet, outerFeather, tip)
  elbow.add(wrist)

  return { pivot, elbow, wrist, tip }
}

function createEye(sign) {
  const eye = new THREE.Mesh(
    new THREE.SphereGeometry(0.036, 6, 6),
    new THREE.MeshBasicMaterial({ color: THEME.mag }),
  )
  eye.position.set(0.072 * sign, 0.082, -0.51)
  const light = new THREE.PointLight(THEME.mag, 1.4, 6.5, 2)
  light.position.set(0.072 * sign, 0.08, -0.49)
  return [eye, light]
}

function createSensorCluster(materials) {
  const headCowl = box(0.18, 0.14, 0.2, materials.birdBody)
  headCowl.position.set(0, 0.075, -0.38)

  const canopyCrest = box(0.1, 0.035, 0.16, materials.birdTrim)
  canopyCrest.position.set(0, 0.148, -0.37)

  const visorBrow = box(0.18, 0.035, 0.04, materials.birdTrim)
  visorBrow.position.set(0, 0.082, -0.5)

  const spineStripe = box(0.04, 0.02, 0.44, materials.birdTrim)
  spineStripe.position.set(0, 0.138, 0.02)

  return [headCowl, canopyCrest, visorBrow, spineStripe, ...createEye(-1), ...createEye(1)]
}

function createThruster(materials) {
  const material = new THREE.ShaderMaterial({
    vertexShader: FRAME_VERT,
    fragmentShader: THRUST_FRAG,
    uniforms: {
      uTime: UNIFORMS.uTime,
      uFogDensity: UNIFORMS.uFogDensity,
      uColor: { value: new THREE.Color(THEME.ice) },
      uIntensity: { value: 1 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  })

  // Exhaust vectoring collar
  const collarGeo = new THREE.CylinderGeometry(0.09, 0.115, 0.1, 8, 1, true)
  collarGeo.rotateX(Math.PI / 2)
  const collar = new THREE.Mesh(collarGeo, materials.metalHi)
  collar.position.set(0, -0.04, 0.36)

  // Supersonic exhaust plume with Mach shock diamonds
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.72, 16, 1, true), material)
  cone.rotation.x = Math.PI / 2
  cone.position.set(0, -0.04, 0.74)

  const light = new THREE.PointLight(THEME.ice, 1.2, 5.5, 2)
  light.position.set(0, -0.04, 0.44)
  return { collar, cone, light, material }
}

export function createBird(scene, materials) {
  const group = new THREE.Group()
  group.name = 'magpie'
  group.scale.setScalar(BIRD_VISUAL_SCALE)

  // Airframe components
  group.add(createDorsalHull(materials.birdBody))
  group.add(createVentralBelly(materials.birdBelly))
  group.add(createBeak(materials.beak))
  group.add(...createSensorCluster(materials))

  const tail = createTail(materials)
  group.add(tail)

  const leftWing = createWing(materials, -1)
  const rightWing = createWing(materials, 1)
  group.add(leftWing.pivot, rightWing.pivot)

  const thruster = createThruster(materials)
  group.add(thruster.collar, thruster.cone, thruster.light)

  // Physical hit-box reference wireframe (PLAN.md rail 91: KeyB toggles)
  const collider = new THREE.Mesh(
    new THREE.BoxGeometry(BIRD_BODY_W, BIRD_BODY_H, BIRD_BODY_D),
    new THREE.MeshBasicMaterial({ color: THEME.ice, wireframe: true, transparent: true, opacity: 0.7 }),
  )
  collider.visible = false
  group.add(collider)

  scene.add(group)

  const trailL = createTrail(scene, THEME.mag)
  const trailR = createTrail(scene, THEME.mag)

  const pos = new THREE.Vector3()
  /** World position of the thruster, refreshed with the trails; the afterburner streams from here. */
  const exhaust = new THREE.Vector3()
  const thrustCold = new THREE.Color(THEME.ice)
  const thrustHot = new THREE.Color(SPARK_RAMP[SPARK_RAMP.length - 1])
  let vx = 0
  let vy = 0
  let wingPulse = 0
  let thrustPulse = 0
  let afterburner = 0
  let t = 0
  const deadSpin = new THREE.Vector3()

  function tipWorld(wing) {
    wing.tip.getWorldPosition(_tip)
    return _tip
  }

  function syncTrails(dz, intensity) {
    group.updateMatrixWorld()
    thruster.cone.getWorldPosition(exhaust)
    let tip = tipWorld(leftWing)
    trailL.push(tip.x, tip.y, tip.z, dz)
    tip = tipWorld(rightWing)
    trailR.push(tip.x, tip.y, tip.z, dz)
    trailL.setIntensity(intensity)
    trailR.setIntensity(intensity)
  }

  function reset() {
    pos.set(0, 0, 0)
    vx = 0
    vy = 0
    wingPulse = 0
    thrustPulse = 0
    afterburner = 0
    t = 0
    group.position.set(0, 0, 0)
    group.rotation.set(0, 0, 0)
    deadSpin.set(0, 0, 0)
    tail.rotation.set(0.2, 0, 0)
    leftWing.pivot.rotation.set(0, 0, 0)
    leftWing.elbow.rotation.set(0, 0, 0)
    leftWing.wrist.rotation.set(0, 0, 0)
    rightWing.pivot.rotation.set(0, 0, 0)
    rightWing.elbow.rotation.set(0, 0, 0)
    rightWing.wrist.rotation.set(0, 0, 0)
    group.updateMatrixWorld()
    thruster.cone.getWorldPosition(exhaust)
    let tip = tipWorld(leftWing)
    trailL.reset(tip.x, tip.y, tip.z)
    tip = tipWorld(rightWing)
    trailR.reset(tip.x, tip.y, tip.z)
    trailL.setVisible(true)
    trailR.setVisible(true)
  }

  function flap() {
    vy = FLAP_VY
    wingPulse = 1
    thrustPulse = 1
  }

  function kill() {
    deadSpin.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 6)
    afterburner = 0
    thruster.material.uniforms.uIntensity.value = 0
    thruster.light.intensity = 0
    thruster.cone.visible = false
    trailL.setVisible(false)
    trailR.setVisible(false)
  }

  function animateWings(dt) {
    t += dt
    if (wingPulse > 0) wingPulse = Math.max(0, wingPulse - dt / 0.12)
    if (thrustPulse > 0) thrustPulse = Math.max(0, thrustPulse - dt / 0.35)

    // 1. Primary shoulder stroke (idle breathing + powerful flap pulse)
    const idleShoulder = 0.15 + Math.sin(t * 9) * 0.08
    const shoulderAngle = idleShoulder + wingPulse * 0.85
    leftWing.pivot.rotation.z = shoulderAngle
    rightWing.pivot.rotation.z = -shoulderAngle

    // Spanwise aerodynamic pitch twist at shoulder
    const shoulderPitch = -wingPulse * 0.14 + (vy / VY_MAX) * 0.03
    leftWing.pivot.rotation.x = shoulderPitch
    rightWing.pivot.rotation.x = shoulderPitch

    // 2. Elbow joint articulation: flexes and folds with phase lead
    const idleElbow = 0.08 + Math.sin(t * 9 + 0.5) * 0.06
    const elbowFlexZ = idleElbow + wingPulse * 0.36
    leftWing.elbow.rotation.z = elbowFlexZ
    rightWing.elbow.rotation.z = -elbowFlexZ
    leftWing.elbow.rotation.x = -wingPulse * 0.07
    rightWing.elbow.rotation.x = -wingPulse * 0.07

    // 3. Wrist joint articulation: aerodynamic whip and secondary flexion
    const idleWrist = 0.06 + Math.sin(t * 9 + 1.0) * 0.07
    const wristFlexZ = idleWrist + Math.sin(wingPulse * Math.PI) * 0.42
    leftWing.wrist.rotation.z = wristFlexZ
    rightWing.wrist.rotation.z = -wristFlexZ
    leftWing.wrist.rotation.y = -wingPulse * 0.08
    rightWing.wrist.rotation.y = wingPulse * 0.08

    // Dynamic tail deflection: pitch flare on climb, rudder yaw/roll on strafe
    tail.rotation.x = 0.2 + wingPulse * 0.12 - (vy / VY_MAX) * 0.06
    tail.rotation.y = -vx * 0.035
    tail.rotation.z = -vx * 0.025

    // Thruster flare & Mach diamonds
    const glow = 0.65 + thrustPulse * 1.6 + Math.sin(t * 23) * 0.05 + afterburner * 0.5
    thruster.cone.visible = true
    const girth = 1 + thrustPulse * 0.35 + afterburner * 0.25
    thruster.cone.scale.set(girth, 1 + thrustPulse * 1.4 + afterburner * BURNER_STRETCH, girth)
    thruster.material.uniforms.uIntensity.value = glow * 1.7
    thruster.material.uniforms.uColor.value.copy(thrustCold).lerp(thrustHot, afterburner)
    thruster.light.color.copy(thruster.material.uniforms.uColor.value)
    thruster.light.intensity = 0.9 + thrustPulse * 2.8 + afterburner * 1.5
  }

  /** 0..1 ignition level; the game ramps it once the run passes the afterburner score. */
  function setAfterburner(level) {
    afterburner = THREE.MathUtils.clamp(level, 0, 1)
  }

  /** Menu / held bob: gravity off, gentle sine. */
  function updateIdle(dt, dz) {
    animateWings(dt)
    const bob = Math.sin(t * 2.2) * 0.12
    group.position.set(0, bob, 0)
    pos.set(0, bob, 0)
    group.rotation.set(0, 0, 0)
    syncTrails(dz, 0.2)
  }

  function updatePlay(dt, input, dz) {
    const strafe = input.strafe
    if (Math.abs(strafe) > 0.001) {
      const target = STRAFE_MAX * strafe
      const step = STRAFE_ACCEL * dt
      vx = Math.abs(target - vx) <= step ? target : vx + Math.sign(target - vx) * step
    } else {
      vx -= vx * Math.min(1, STRAFE_DAMPING * dt)
    }
    vx = THREE.MathUtils.clamp(vx, -STRAFE_MAX, STRAFE_MAX)

    vy += GRAVITY * dt
    vy = THREE.MathUtils.clamp(vy, VY_MIN, VY_MAX)

    pos.x += vx * dt
    pos.y += vy * dt

    group.position.copy(pos)
    group.rotation.z = THREE.MathUtils.damp(group.rotation.z, -vx * 0.09, 12, dt)
    group.rotation.x = THREE.MathUtils.damp(group.rotation.x, -vy * 0.035, 10, dt)
    animateWings(dt)
    syncTrails(dz, 0.35 + wingPulse * 1.4 + Math.abs(vx) * 0.06)
  }

  /** Tumbling wreck after a crash. */
  function updateDead(dt) {
    group.rotation.x += deadSpin.x * dt
    group.rotation.y += deadSpin.y * dt
    group.rotation.z += deadSpin.z * dt
    pos.y += vy * dt
    vy += DEAD_GRAVITY * dt
    // Wreck settles on the conduit floor rather than dragging the camera out of the tunnel.
    if (pos.y < DEAD_FLOOR) {
      pos.y = DEAD_FLOOR
      vy = vy < -1.5 ? -vy * 0.3 : 0
      deadSpin.multiplyScalar(Math.max(0, 1 - dt * 4))
    }
    pos.x = THREE.MathUtils.clamp(pos.x, -DEAD_WALL, DEAD_WALL)
    group.position.copy(pos)
  }

  reset()

  return {
    group,
    pos,
    get x() {
      return pos.x
    },
    get y() {
      return pos.y
    },
    get vx() {
      return vx
    },
    get vy() {
      return vy
    },
    /** Z-roll in radians; the camera rig leans with it. */
    get bank() {
      return group.rotation.z
    },
    /** Flap thrust pulse, 1 on the flap frame decaying to 0. */
    get thrustPulse() {
      return thrustPulse
    },
    exhaust,
    reset,
    flap,
    kill,
    setAfterburner,
    updateIdle,
    updatePlay,
    updateDead,
    toggleCollider() {
      collider.visible = !collider.visible
    },
  }
}

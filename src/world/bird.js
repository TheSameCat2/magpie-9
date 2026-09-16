import * as THREE from 'three'
import { THEME } from '../config/theme.js'
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
const _tip = new THREE.Vector3()

function box(w, h, d, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
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

/** Wing on one side (`sign` -1 left, +1 right): pivot group, wing plate, magenta leading edge, tip marker. */
function createWing(materials, sign) {
  const pivot = new THREE.Group()
  pivot.position.set(0.2 * sign, 0.04, -0.02)
  const plate = box(0.78, 0.05, 0.36, materials.birdBody)
  plate.position.x = 0.36 * sign
  const edge = box(0.78, 0.02, 0.05, materials.birdTrim)
  edge.position.set(0.36 * sign, 0.03, -0.16)
  const tip = new THREE.Object3D()
  tip.position.set(0.76 * sign, 0.03, -0.1)
  pivot.add(plate, edge, tip)
  return { pivot, tip }
}

function createEye(sign) {
  const eye = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 8, 8),
    new THREE.MeshBasicMaterial({ color: THEME.mag }),
  )
  eye.position.set(0.08 * sign, 0.12, -0.58)
  const light = new THREE.PointLight(THEME.mag, 1.4, 6.5, 2)
  light.position.set(0.08 * sign, 0.1, -0.56)
  return [eye, light]
}

function createHull(materials) {
  const parts = []
  parts.push(box(BIRD_BODY_W, BIRD_BODY_H, BIRD_BODY_D, materials.birdBody))

  const belly = box(0.32, 0.14, 0.52, materials.birdBelly)
  belly.position.set(0, -0.12, 0.02)
  const head = box(0.3, 0.26, 0.3, materials.birdBody)
  head.position.set(0, 0.08, -0.44)
  const beak = box(0.08, 0.07, 0.22, materials.beak)
  beak.position.set(0, 0.0, -0.64)
  const stripe = box(0.44, 0.04, 0.5, materials.birdTrim)
  stripe.position.set(0, 0.1, -0.04)
  const tail = box(0.26, 0.04, 0.3, materials.birdBody)
  tail.position.set(0, 0.06, 0.48)
  tail.rotation.x = 0.25
  const tailTrim = box(0.28, 0.015, 0.06, materials.birdTrim)
  tailTrim.position.set(0, 0.1, 0.61)
  parts.push(belly, head, beak, stripe, tail, tailTrim, ...createEye(-1), ...createEye(1))
  return parts
}

function createThruster() {
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
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.7, 12, 1, true), material)
  cone.rotation.x = Math.PI / 2
  cone.position.set(0, -0.06, 0.72)
  const light = new THREE.PointLight(THEME.ice, 1.2, 5, 2)
  light.position.set(0, -0.05, 0.6)
  return { cone, light, material }
}

export function createBird(scene, materials) {
  const group = new THREE.Group()
  group.name = 'magpie'
  group.scale.setScalar(BIRD_VISUAL_SCALE)
  group.add(...createHull(materials))

  const leftWing = createWing(materials, -1)
  const rightWing = createWing(materials, 1)
  group.add(leftWing.pivot, rightWing.pivot)

  const thruster = createThruster()
  group.add(thruster.cone, thruster.light)

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
  let vx = 0
  let vy = 0
  let wingPulse = 0
  let thrustPulse = 0
  let t = 0
  const deadSpin = new THREE.Vector3()

  function tipWorld(wing) {
    wing.tip.getWorldPosition(_tip)
    return _tip
  }

  function syncTrails(dz, intensity) {
    group.updateMatrixWorld()
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
    t = 0
    group.position.set(0, 0, 0)
    group.rotation.set(0, 0, 0)
    deadSpin.set(0, 0, 0)
    group.updateMatrixWorld()
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
    const idle = 0.22 + Math.sin(t * 9) * 0.12
    const angle = idle + wingPulse * 1.05
    leftWing.pivot.rotation.z = angle
    rightWing.pivot.rotation.z = -angle

    const glow = 0.55 + thrustPulse * 1.4 + Math.sin(t * 23) * 0.05
    thruster.cone.visible = true
    thruster.cone.scale.set(1 + thrustPulse * 0.3, 1 + thrustPulse * 1.3, 1 + thrustPulse * 0.3)
    thruster.material.uniforms.uIntensity.value = glow * 1.6
    thruster.light.intensity = 0.8 + thrustPulse * 2.4
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
    reset,
    flap,
    kill,
    updateIdle,
    updatePlay,
    updateDead,
    toggleCollider() {
      collider.visible = !collider.visible
    },
  }
}

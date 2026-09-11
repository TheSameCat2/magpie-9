import * as THREE from 'three'
import { BIRD_RADIUS, R, SHARED, THEME } from './theme.js'
import { FRAME_VERT, THRUST_FRAG, TRAIL_VERT, TRAIL_FRAG } from './shaders.js'

const TRAIL_N = 16
const DEAD_WALL = R - 0.65
const DEAD_FLOOR = -DEAD_WALL
const _tip = new THREE.Vector3()

function box(w, h, d, mat) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
  mesh.castShadow = false
  mesh.receiveShadow = false
  return mesh
}

// Ribbon of TRAIL_N samples streaming back from a wingtip. Samples live in
// world space and recede with the conduit scroll.
function makeTrail(scene, color) {
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
  const mat = new THREE.ShaderMaterial({
    vertexShader: TRAIL_VERT,
    fragmentShader: TRAIL_FRAG,
    uniforms: {
      uTime: SHARED.uTime,
      uFogDensity: SHARED.uFogDensity,
      uColor: { value: new THREE.Color(color) },
      uIntensity: { value: 0.6 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.frustumCulled = false
  mesh.name = 'trail'
  scene.add(mesh)

  const sx = new Float32Array(TRAIL_N)
  const sy = new Float32Array(TRAIL_N)
  const sz = new Float32Array(TRAIL_N)

  function reset(x, y, z) {
    sx.fill(x)
    sy.fill(y)
    sz.fill(z)
    write()
  }

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

  return { mesh, reset, push, mat }
}

export function createBird(scene, materials) {
  const group = new THREE.Group()
  group.name = 'magpie'
  const visualScale = 1.35
  group.scale.setScalar(visualScale)

  const body = box(0.42, 0.3, 0.74, materials.birdBody)
  group.add(body)

  const belly = box(0.32, 0.14, 0.52, materials.birdBelly)
  belly.position.set(0, -0.12, 0.02)
  group.add(belly)

  const head = box(0.3, 0.26, 0.3, materials.birdBody)
  head.position.set(0, 0.08, -0.44)
  group.add(head)

  const beak = box(0.08, 0.07, 0.22, materials.beak)
  beak.position.set(0, 0.0, -0.64)
  group.add(beak)

  const stripe = box(0.44, 0.04, 0.5, materials.birdTrim)
  stripe.position.set(0, 0.1, -0.04)
  group.add(stripe)

  const tail = box(0.26, 0.04, 0.3, materials.birdBody)
  tail.position.set(0, 0.06, 0.48)
  tail.rotation.x = 0.25
  group.add(tail)
  const tailTrim = box(0.28, 0.015, 0.06, materials.birdTrim)
  tailTrim.position.set(0, 0.1, 0.61)
  group.add(tailTrim)

  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2a6d })
  const eyeGeo = new THREE.SphereGeometry(0.045, 8, 8)
  const leftEye = new THREE.Mesh(eyeGeo, eyeMat)
  leftEye.position.set(-0.08, 0.12, -0.58)
  const rightEye = new THREE.Mesh(eyeGeo, eyeMat)
  rightEye.position.set(0.08, 0.12, -0.58)
  group.add(leftEye, rightEye)

  const leftPivot = new THREE.Group()
  leftPivot.position.set(-0.2, 0.04, -0.02)
  const leftWing = box(0.78, 0.05, 0.36, materials.birdBody)
  leftWing.position.x = -0.36
  const leftEdge = box(0.78, 0.02, 0.05, materials.birdTrim)
  leftEdge.position.set(-0.36, 0.03, -0.16)
  const leftTip = new THREE.Object3D()
  leftTip.position.set(-0.76, 0.03, -0.1)
  leftPivot.add(leftWing, leftEdge, leftTip)
  group.add(leftPivot)

  const rightPivot = new THREE.Group()
  rightPivot.position.set(0.2, 0.04, -0.02)
  const rightWing = box(0.78, 0.05, 0.36, materials.birdBody)
  rightWing.position.x = 0.36
  const rightEdge = box(0.78, 0.02, 0.05, materials.birdTrim)
  rightEdge.position.set(0.36, 0.03, -0.16)
  const rightTip = new THREE.Object3D()
  rightTip.position.set(0.76, 0.03, -0.1)
  rightPivot.add(rightWing, rightEdge, rightTip)
  group.add(rightPivot)

  const leftLight = new THREE.PointLight(0xff2a6d, 1.4, 6.5, 2)
  leftLight.position.set(-0.08, 0.1, -0.56)
  const rightLight = new THREE.PointLight(0xff2a6d, 1.4, 6.5, 2)
  rightLight.position.set(0.08, 0.1, -0.56)
  group.add(leftLight, rightLight)

  const thrustMat = new THREE.ShaderMaterial({
    vertexShader: FRAME_VERT,
    fragmentShader: THRUST_FRAG,
    uniforms: {
      uTime: SHARED.uTime,
      uFogDensity: SHARED.uFogDensity,
      uColor: { value: new THREE.Color(THEME.ice) },
      uIntensity: { value: 1 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  })
  const thrust = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.7, 12, 1, true), thrustMat)
  thrust.rotation.x = Math.PI / 2
  thrust.position.set(0, -0.06, 0.72)
  group.add(thrust)

  const thrustLight = new THREE.PointLight(THEME.ice, 1.2, 5, 2)
  thrustLight.position.set(0, -0.05, 0.6)
  group.add(thrustLight)

  const collider = new THREE.Mesh(
    new THREE.SphereGeometry(BIRD_RADIUS / visualScale, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0x3de0ff, wireframe: true, transparent: true, opacity: 0.7 }),
  )
  collider.visible = false
  group.add(collider)

  scene.add(group)

  const trailL = makeTrail(scene, THEME.mag)
  const trailR = makeTrail(scene, THEME.mag)

  const pos = new THREE.Vector3()
  let vx = 0
  let vy = 0
  let wingPulse = 0
  let thrustPulse = 0
  let t = 0
  const deadSpin = new THREE.Vector3()

  function syncTrails(dz, intensity) {
    group.updateMatrixWorld()
    leftTip.getWorldPosition(_tip)
    trailL.push(_tip.x, _tip.y, _tip.z, dz)
    rightTip.getWorldPosition(_tip)
    trailR.push(_tip.x, _tip.y, _tip.z, dz)
    trailL.mat.uniforms.uIntensity.value = intensity
    trailR.mat.uniforms.uIntensity.value = intensity
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
    leftTip.getWorldPosition(_tip)
    trailL.reset(_tip.x, _tip.y, _tip.z)
    rightTip.getWorldPosition(_tip)
    trailR.reset(_tip.x, _tip.y, _tip.z)
    trailL.mesh.visible = true
    trailR.mesh.visible = true
  }

  function flap() {
    vy = 9.5
    wingPulse = 1
    thrustPulse = 1
  }

  function kill() {
    deadSpin.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 6)
    thrustMat.uniforms.uIntensity.value = 0
    thrustLight.intensity = 0
    thrust.visible = false
    trailL.mesh.visible = false
    trailR.mesh.visible = false
  }

  function applyWings(dt) {
    t += dt
    if (wingPulse > 0) wingPulse = Math.max(0, wingPulse - dt / 0.12)
    if (thrustPulse > 0) thrustPulse = Math.max(0, thrustPulse - dt / 0.35)
    const idle = 0.22 + Math.sin(t * 9) * 0.12
    const angle = idle + wingPulse * 1.05
    leftPivot.rotation.z = angle
    rightPivot.rotation.z = -angle

    const th = 0.55 + thrustPulse * 1.4 + Math.sin(t * 23) * 0.05
    thrust.visible = true
    thrust.scale.set(1 + thrustPulse * 0.3, 1 + thrustPulse * 1.3, 1 + thrustPulse * 0.3)
    thrustMat.uniforms.uIntensity.value = th * 1.6
    thrustLight.intensity = 0.8 + thrustPulse * 2.4
  }

  function updateIdle(dt, dz) {
    applyWings(dt)
    const bob = Math.sin(t * 2.2) * 0.12
    group.position.set(0, bob, 0)
    pos.set(0, bob, 0)
    group.rotation.set(0, 0, 0)
    syncTrails(dz, 0.2)
  }

  function updatePlay(dt, input, dz) {
    const s = input.strafe
    if (Math.abs(s) > 0.001) {
      const target = 7 * s
      const step = 55 * dt
      vx = Math.abs(target - vx) <= step ? target : vx + Math.sign(target - vx) * step
    } else {
      vx -= vx * Math.min(1, 10 * dt)
    }
    vx = THREE.MathUtils.clamp(vx, -7, 7)

    vy += -28 * dt
    vy = THREE.MathUtils.clamp(vy, -16, 11)

    pos.x += vx * dt
    pos.y += vy * dt

    group.position.copy(pos)
    const bank = THREE.MathUtils.damp(group.rotation.z, -vx * 0.09, 12, dt)
    const pitch = THREE.MathUtils.damp(group.rotation.x, -vy * 0.035, 10, dt)
    group.rotation.z = bank
    group.rotation.x = pitch
    applyWings(dt)
    syncTrails(dz, 0.35 + wingPulse * 1.4 + Math.abs(vx) * 0.06)
  }

  function updateDead(dt) {
    group.rotation.x += deadSpin.x * dt
    group.rotation.y += deadSpin.y * dt
    group.rotation.z += deadSpin.z * dt
    pos.y += vy * dt
    vy += -12 * dt
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

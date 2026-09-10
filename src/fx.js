import * as THREE from 'three'
import { SHARED, THEME } from './theme.js'
import { PARTICLE_VERT, PARTICLE_FRAG, DUST_VERT, DUST_FRAG } from './shaders.js'

const MAX_PARTICLES = 1024
const STREAKS = 140
const DUST = 360
const DUST_NEAR = 8
const DUST_SPAN = 78

const _c = new THREE.Color()

function createParticles(scene) {
  const geo = new THREE.BufferGeometry()
  const pos = new Float32Array(MAX_PARTICLES * 3)
  const vel = new Float32Array(MAX_PARTICLES * 3)
  const col = new Float32Array(MAX_PARTICLES * 3)
  const birth = new Float32Array(MAX_PARTICLES).fill(-1e9)
  const scroll0 = new Float32Array(MAX_PARTICLES)
  const life = new Float32Array(MAX_PARTICLES).fill(1)
  const size = new Float32Array(MAX_PARTICLES)
  const grav = new Float32Array(MAX_PARTICLES)

  const aPos = new THREE.BufferAttribute(pos, 3)
  const aVel = new THREE.BufferAttribute(vel, 3)
  const aCol = new THREE.BufferAttribute(col, 3)
  const aBirth = new THREE.BufferAttribute(birth, 1)
  const aScroll0 = new THREE.BufferAttribute(scroll0, 1)
  const aLife = new THREE.BufferAttribute(life, 1)
  const aSize = new THREE.BufferAttribute(size, 1)
  const aGrav = new THREE.BufferAttribute(grav, 1)
  for (const a of [aPos, aVel, aCol, aBirth, aScroll0, aLife, aSize, aGrav]) {
    a.setUsage(THREE.DynamicDrawUsage)
  }
  geo.setAttribute('position', aPos)
  geo.setAttribute('aVel', aVel)
  geo.setAttribute('aColor', aCol)
  geo.setAttribute('aBirth', aBirth)
  geo.setAttribute('aScroll0', aScroll0)
  geo.setAttribute('aLife', aLife)
  geo.setAttribute('aSize', aSize)
  geo.setAttribute('aGravity', aGrav)
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, -30), 200)

  const mat = new THREE.ShaderMaterial({
    vertexShader: PARTICLE_VERT,
    fragmentShader: PARTICLE_FRAG,
    uniforms: {
      uTime: SHARED.uTime,
      uScroll: SHARED.uScroll,
      uPixelRatio: SHARED.uPixelRatio,
      uFogDensity: SHARED.uFogDensity,
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const points = new THREE.Points(geo, mat)
  points.frustumCulled = false
  points.name = 'particles'
  scene.add(points)

  let head = 0
  const attrs = [aPos, aVel, aCol, aBirth, aScroll0, aLife, aSize, aGrav]

  function emit(x, y, z, vx, vy, vz, color, lifeS, sizeU, g) {
    const i = head
    head = (head + 1) % MAX_PARTICLES
    pos[i * 3] = x
    pos[i * 3 + 1] = y
    pos[i * 3 + 2] = z
    vel[i * 3] = vx
    vel[i * 3 + 1] = vy
    vel[i * 3 + 2] = vz
    col[i * 3] = color.r
    col[i * 3 + 1] = color.g
    col[i * 3 + 2] = color.b
    birth[i] = SHARED.uTime.value
    scroll0[i] = SHARED.uScroll.value
    life[i] = lifeS
    size[i] = sizeU
    grav[i] = g
  }

  function flush() {
    for (const a of attrs) a.needsUpdate = true
  }

  return { emit, flush }
}

function createStreaks(scene) {
  const geo = new THREE.BufferGeometry()
  const pos = new Float32Array(STREAKS * 2 * 3)
  const col = new Float32Array(STREAKS * 2 * 3)
  const sx = new Float32Array(STREAKS)
  const sy = new Float32Array(STREAKS)
  const sz = new Float32Array(STREAKS)
  const tint = new THREE.Color(THEME.ice).lerp(new THREE.Color(THEME.ink), 0.55)

  function place(i) {
    const a = Math.random() * Math.PI * 2
    const r = 1.9 + Math.random() * 1.85
    sx[i] = Math.cos(a) * r
    sy[i] = Math.sin(a) * r
  }
  for (let i = 0; i < STREAKS; i++) {
    place(i)
    sz[i] = 8 - Math.random() * 70
    const b = 0.5 + Math.random() * 0.5
    col[i * 6] = tint.r * b
    col[i * 6 + 1] = tint.g * b
    col[i * 6 + 2] = tint.b * b
    col[i * 6 + 3] = 0
    col[i * 6 + 4] = 0
    col[i * 6 + 5] = 0
  }
  const aPos = new THREE.BufferAttribute(pos, 3)
  aPos.setUsage(THREE.DynamicDrawUsage)
  geo.setAttribute('position', aPos)
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, -30), 100)

  const mat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.3,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: true,
  })
  const lines = new THREE.LineSegments(geo, mat)
  lines.frustumCulled = false
  lines.name = 'streaks'
  scene.add(lines)

  function update(dt, speed, kick) {
    const dz = speed * 1.6 * dt
    const len = 0.5 + speed * 0.13 + kick * 3.5
    for (let i = 0; i < STREAKS; i++) {
      sz[i] += dz
      if (sz[i] > 8) {
        sz[i] -= 70
        place(i)
      }
      const o = i * 6
      pos[o] = sx[i]
      pos[o + 1] = sy[i]
      pos[o + 2] = sz[i]
      pos[o + 3] = sx[i]
      pos[o + 4] = sy[i]
      pos[o + 5] = sz[i] - len
    }
    aPos.needsUpdate = true
    mat.opacity = THREE.MathUtils.clamp((speed - 6) / 16, 0.08, 0.6) + kick * 0.5
  }

  return { update }
}

function createDust(scene) {
  const geo = new THREE.BufferGeometry()
  const pos = new Float32Array(DUST * 3)
  const seed = new Float32Array(DUST)
  for (let i = 0; i < DUST; i++) {
    const a = Math.random() * Math.PI * 2
    const r = Math.sqrt(Math.random()) * 3.6
    pos[i * 3] = Math.cos(a) * r
    pos[i * 3 + 1] = Math.sin(a) * r
    pos[i * 3 + 2] = Math.random() * DUST_SPAN
    seed[i] = Math.random()
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, -30), 100)
  const mat = new THREE.ShaderMaterial({
    vertexShader: DUST_VERT,
    fragmentShader: DUST_FRAG,
    uniforms: {
      uTime: SHARED.uTime,
      uScroll: SHARED.uScroll,
      uPixelRatio: SHARED.uPixelRatio,
      uFogDensity: SHARED.uFogDensity,
      uNear: { value: DUST_NEAR },
      uSpan: { value: DUST_SPAN },
      uColor: { value: new THREE.Color(0x9fd8e8) },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const points = new THREE.Points(geo, mat)
  points.frustumCulled = false
  points.name = 'dust'
  scene.add(points)
}

export function createFx(scene) {
  const particles = createParticles(scene)
  const streaks = createStreaks(scene)
  createDust(scene)

  const ice = new THREE.Color(THEME.ice)
  const white = new THREE.Color(0xffffff)
  const mag = new THREE.Color(THEME.mag)
  const sodium = new THREE.Color(THEME.sodium)

  let kick = 0

  // Sparks fly off the perimeter of the opening and stream toward the camera.
  function gateBurst(x, y, z, hw, hh, color, count) {
    for (let i = 0; i < count; i++) {
      const side = Math.random()
      let px
      let py
      let nx
      let ny
      if (side < 0.25) {
        px = x + (Math.random() * 2 - 1) * hw
        py = y + hh
        nx = 0
        ny = 1
      } else if (side < 0.5) {
        px = x + (Math.random() * 2 - 1) * hw
        py = y - hh
        nx = 0
        ny = -1
      } else if (side < 0.75) {
        px = x - hw
        py = y + (Math.random() * 2 - 1) * hh
        nx = -1
        ny = 0
      } else {
        px = x + hw
        py = y + (Math.random() * 2 - 1) * hh
        nx = 1
        ny = 0
      }
      const sp = 1.5 + Math.random() * 4
      const jitter = (Math.random() - 0.5) * 3
      _c.set(color).lerp(white, Math.random() * 0.5)
      particles.emit(
        px,
        py,
        z,
        nx * sp + ny * jitter,
        ny * sp + nx * jitter,
        6 + Math.random() * 14,
        _c,
        0.35 + Math.random() * 0.45,
        0.09 + Math.random() * 0.09,
        3,
      )
    }
    particles.flush()
  }

  function puff(x, y, z, count) {
    for (let i = 0; i < count; i++) {
      _c.copy(ice).lerp(white, Math.random() * 0.7)
      particles.emit(
        x + (Math.random() - 0.5) * 0.9,
        y - 0.15,
        z + (Math.random() - 0.5) * 0.4,
        (Math.random() - 0.5) * 3,
        -2 - Math.random() * 3,
        1 + Math.random() * 3,
        _c,
        0.25 + Math.random() * 0.25,
        0.05 + Math.random() * 0.05,
        -4,
      )
    }
    particles.flush()
  }

  function explode(x, y, z) {
    for (let i = 0; i < 160; i++) {
      const th = Math.random() * Math.PI * 2
      const ph = Math.acos(Math.random() * 2 - 1)
      const sp = 3 + Math.random() * 11
      const r = Math.random()
      _c.copy(r < 0.4 ? mag : r < 0.75 ? sodium : white)
      particles.emit(
        x,
        y,
        z,
        Math.sin(ph) * Math.cos(th) * sp,
        Math.sin(ph) * Math.sin(th) * sp,
        Math.cos(ph) * sp + 2,
        _c,
        0.6 + Math.random() * 1.1,
        0.08 + Math.random() * 0.16,
        9,
      )
    }
    particles.flush()
  }

  function update(dt, speed) {
    kick = Math.max(0, kick - dt * 3)
    streaks.update(dt, speed, kick)
  }

  return {
    gateBurst,
    puff,
    explode,
    update,
    kick(v) {
      kick = Math.max(kick, v)
    },
  }
}

import * as THREE from 'three'
import { THEME } from '../config/theme.js'
import { SPARK_RAMP } from '../config/fx.js'
import { UNIFORMS } from '../render/uniforms.js'
import { PARTICLE_VERT, PARTICLE_FRAG, DUST_VERT, DUST_FRAG } from '../render/shaders.js'
import { clamp01, randomOnSphere } from '../lib/math.js'
import { OPENING_EDGES } from './gates/layout.js'

// Three GPU-resident systems: a ring buffer of sparks (one-shot bursts plus
// the continuous edge and afterburner streams), speed streaks hugging the
// walls, and ambient dust. Nothing here allocates per frame.

// Sized so the continuous streams cannot lap a live crash burst in the ring.
const MAX_PARTICLES = 4096
const STREAKS = 140
const DUST = 360
const DUST_NEAR = 8
const DUST_SPAN = 78

/** Edge spark pops per second from a gate right in front of the bird at phase 0. */
const EDGE_RATE = 110
/** Rate, size, and speed growth of edge sparks per phase. */
const EDGE_PHASE_GAIN = 0.35
/** Depth over which a gate's edge sparks fade in as it approaches. */
const EDGE_RANGE = 54
/** World-unit point size at phase 0; the shader still shrinks this with distance. */
const EDGE_SIZE = 0.18
/** Gates this far past the bird stop sparking (the frame fades over the same distance). */
const EDGE_PASS_Z = 4.2
/** Share of rectangular-opening sparks that fly outward across the plate rather than into the hole. */
const EDGE_OUTWARD = 0.7
/** Afterburner particles per second at full level between flaps. */
const BURNER_RATE = 140
/** Extra afterburner density at the peak of a flap pulse. */
const BURNER_PULSE_GAIN = 1.6
/**
 * Exhaust cancels this much of the scroll so the plume hangs behind the
 * bird instead of streaking straight into the lens with the conduit.
 */
const BURNER_DRAG = 0.65

const _c = new THREE.Color()
const _tint = new THREE.Color()
const _v = { x: 0, y: 0, z: 0 }

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
      uTime: UNIFORMS.uTime,
      uScroll: UNIFORMS.uScroll,
      uPixelRatio: UNIFORMS.uPixelRatio,
      uFogDensity: UNIFORMS.uFogDensity,
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
  let dirty = false
  const attrs = [aPos, aVel, aCol, aBirth, aScroll0, aLife, aSize, aGrav]

  function emit(x, y, z, vx, vy, vz, color, lifeS, sizeU, g) {
    const i = head
    head = (head + 1) % MAX_PARTICLES
    dirty = true
    pos[i * 3] = x
    pos[i * 3 + 1] = y
    pos[i * 3 + 2] = z
    vel[i * 3] = vx
    vel[i * 3 + 1] = vy
    vel[i * 3 + 2] = vz
    col[i * 3] = color.r
    col[i * 3 + 1] = color.g
    col[i * 3 + 2] = color.b
    birth[i] = UNIFORMS.uTime.value
    scroll0[i] = UNIFORMS.uScroll.value
    life[i] = lifeS
    size[i] = sizeU
    grav[i] = g
  }

  // Uploads the whole ring, so streams that emitted nothing this frame skip it.
  function flush() {
    if (!dirty) return
    dirty = false
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
    const overdrive = UNIFORMS.uOverdrive.value
    const len = 0.5 + speed * 0.13 + kick * 3.5 + overdrive * 2.2
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
    mat.opacity = THREE.MathUtils.clamp((speed - 6) / 16, 0.08, 0.6) + kick * 0.5 + overdrive * 0.35
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
      uTime: UNIFORMS.uTime,
      uScroll: UNIFORMS.uScroll,
      uPixelRatio: UNIFORMS.uPixelRatio,
      uFogDensity: UNIFORMS.uFogDensity,
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
  const ramp = SPARK_RAMP.map((hex) => new THREE.Color(hex))
  const gold = new THREE.Color(THEME.gold)
  const green = new THREE.Color(THEME.green)

  let kick = 0
  /** Quality-ladder multiplier on the continuous streams. */
  let density = 1
  /** Scroll speed seen by the last update; the afterburner leans on it. */
  let scrollSpeed = 0

  function rampColor(phase) {
    return ramp[Math.min(Math.max(0, phase), ramp.length - 1)]
  }

  /** Whole-number emission for a fractional per-frame budget without drift. */
  function rollCount(expected) {
    const whole = Math.floor(expected)
    return whole + (Math.random() < expected - whole ? 1 : 0)
  }

  /**
   * Continuous sparks popping off a gate opening's perimeter. `edges` and
   * `nx` come from `openingShape`; `phase` (sector) picks the ramp colour
   * and scales density, size, and speed. Call once per live gate per frame.
   */
  function edgeSparks(x, y, z, hw, hh, edges, nx, phase, dt) {
    const prox = z < 0 ? clamp01(1 + z / EDGE_RANGE) : clamp01(1 - z / EDGE_PASS_Z)
    if (prox <= 0 || dt <= 0) return
    const gain = 1 + phase * EDGE_PHASE_GAIN
    const pops = rollCount(EDGE_RATE * gain * density * prox * dt)
    if (pops === 0) return
    const tint = rampColor(phase)
    const popSize = phase >= 3 ? 5 : 4
    for (let p = 0; p < pops; p++) {
      let px, py, dx, dy
      if (edges === OPENING_EDGES.vertical) {
        px = x
        py = y + (Math.random() * 2 - 1) * hh
        dx = nx
        dy = 0
      } else {
        const edge = Math.floor(Math.random() * (edges === OPENING_EDGES.horizontal ? 2 : 4))
        const along = Math.random() * 2 - 1
        const horizontal = edge < 2
        const sign = edge % 2 === 0 ? 1 : -1
        const outward = Math.random() < EDGE_OUTWARD ? 1 : -1
        px = horizontal ? x + along * hw : x + sign * hw
        py = horizontal ? y + sign * hh : y + along * hh
        dx = horizontal ? 0 : sign * outward
        dy = horizontal ? sign * outward : 0
      }
      const n = 1 + Math.floor(Math.random() * popSize)
      for (let i = 0; i < n; i++) {
        const speed = (0.8 + Math.random() * 2.2) * (1 + phase * 0.15)
        const slide = (Math.random() - 0.5) * 1.6
        _c.copy(tint).lerp(white, Math.random() * 0.14)
        particles.emit(
          px,
          py,
          z,
          dx * speed + dy * slide,
          dy * speed + dx * slide,
          0.5 + Math.random() * 2.0,
          _c,
          0.4 + Math.random() * 0.45,
          (EDGE_SIZE + Math.random() * 0.16) * (1 + phase * 0.14),
          1.6,
        )
      }
    }
    particles.flush()
  }

  /**
   * Exhaust streaming back from the thruster toward the camera. `level` is
   * the 0..1 ignition ramp, `pulse` the bird's flap thrust pulse, and `vx`
   * leans the plume against the strafe.
   */
  function afterburner(x, y, z, vx, level, pulse, phase, dt) {
    if (level <= 0 || dt <= 0) return
    const count = rollCount(BURNER_RATE * density * level * (1 + pulse * BURNER_PULSE_GAIN) * dt)
    if (count === 0) return
    const tint = rampColor(phase)
    const drag = -scrollSpeed * BURNER_DRAG
    for (let i = 0; i < count; i++) {
      const core = Math.random()
      _c.copy(tint).lerp(white, 0.15 + core * 0.55)
      particles.emit(
        x + (Math.random() - 0.5) * 0.16,
        y + (Math.random() - 0.5) * 0.16,
        z + Math.random() * 0.2,
        -vx * 0.25 + (Math.random() - 0.5) * 1.6,
        (Math.random() - 0.5) * 1.6 - 0.4,
        drag * (0.7 + Math.random() * 0.5) + 1.5,
        _c,
        0.28 + Math.random() * 0.32,
        (0.1 + core * 0.1) * (0.7 + level * 0.3),
        0,
      )
    }
    particles.flush()
  }

  // Sparks fly off the perimeter of the opening and stream toward the camera.
  function gateBurst(x, y, z, hw, hh, color, count) {
    for (let i = 0; i < count; i++) {
      // Pick one of the four edges; sparks leave along that edge's outward normal.
      const edge = Math.floor(Math.random() * 4)
      const along = Math.random() * 2 - 1
      const horizontal = edge < 2
      const sign = edge % 2 === 0 ? 1 : -1
      const px = horizontal ? x + along * hw : x + sign * hw
      const py = horizontal ? y + sign * hh : y + along * hh
      const nx = horizontal ? 0 : sign
      const ny = horizontal ? sign : 0
      const speed = 1.5 + Math.random() * 4
      const jitter = (Math.random() - 0.5) * 3
      _c.set(color).lerp(white, Math.random() * 0.5)
      particles.emit(
        px,
        py,
        z,
        nx * speed + ny * jitter,
        ny * speed + nx * jitter,
        6 + Math.random() * 14,
        _c,
        0.35 + Math.random() * 0.45,
        0.09 + Math.random() * 0.09,
        3,
      )
    }
    particles.flush()
  }

  // Violent shower of friction sparks along the exact edge scraped during a close call.
  function scrapeSparks(x, y, z, nx, ny, count = 38) {
    for (let i = 0; i < count; i++) {
      const speed = 4 + Math.random() * 8
      const perpX = -ny
      const perpY = nx
      const jitter = (Math.random() - 0.5) * 6
      const tangent = (Math.random() - 0.5) * 4
      _c.copy(sodium).lerp(white, 0.4 + Math.random() * 0.6)
      particles.emit(
        x + (Math.random() - 0.5) * 0.15,
        y + (Math.random() - 0.5) * 0.15,
        z + (Math.random() - 0.5) * 0.2,
        nx * speed + perpX * tangent,
        ny * speed + perpY * tangent + jitter,
        8 + Math.random() * 18,
        _c,
        0.2 + Math.random() * 0.35,
        0.1 + Math.random() * 0.12,
        6,
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

  /** Damper pickup: chronological deceleration ring on the XY plane with gold-white embers. */
  function damperBurst(x, y, z) {
    for (let i = 0; i < 56; i++) {
      const angle = (i / 56) * Math.PI * 2 + (Math.random() - 0.5) * 0.12
      const speed = 3.5 + Math.random() * 4.5
      _c.copy(gold).lerp(white, Math.random() * 0.45)
      particles.emit(
        x + Math.cos(angle) * 0.08,
        y + Math.sin(angle) * 0.08,
        z,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        2 + Math.random() * 4,
        _c,
        0.4 + Math.random() * 0.35,
        0.1 + Math.random() * 0.08,
        -7,
      )
    }
    particles.flush()
  }

  /** Spare Life pickup: bio-digital matrix streaming columns rising upward in green and matrix white. */
  function lifeBurst(x, y, z) {
    for (let i = 0; i < 54; i++) {
      const colX = (Math.random() - 0.5) * 1.5
      const colZ = (Math.random() - 0.5) * 1.0
      const riseSpeed = 3.2 + Math.random() * 5.0
      _c.copy(green).lerp(white, Math.random() < 0.35 ? 0.8 : 0.1)
      particles.emit(
        x + colX,
        y - 0.3 + Math.random() * 0.6,
        z + colZ,
        (Math.random() - 0.5) * 0.5,
        riseSpeed,
        1 + Math.random() * 3,
        _c,
        0.45 + Math.random() * 0.35,
        0.08 + Math.random() * 0.08,
        -3,
      )
    }
    particles.flush()
  }

  /** Shunt pickup: erratic high-voltage lightning tendrils discharging toward conduit walls. */
  function shuntBurst(x, y, z) {
    for (let i = 0; i < 68; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = 6.5 + Math.random() * 8.5
      const arcSpread = (Math.random() - 0.5) * 2.8
      _c.copy(ice).lerp(white, Math.random() * 0.85)
      particles.emit(
        x,
        y,
        z,
        Math.cos(angle) * speed - Math.sin(angle) * arcSpread,
        Math.sin(angle) * speed + Math.cos(angle) * arcSpread,
        3 + Math.random() * 8,
        _c,
        0.28 + Math.random() * 0.28,
        0.11 + Math.random() * 0.1,
        1,
      )
    }
    particles.flush()
  }

  /** Pickup sparkle: dispatches to tailored burst if type is given, or default spray. */
  function orbBurst(x, y, z, color = THEME.gold, type) {
    if (type === 'damper') return damperBurst(x, y, z)
    if (type === 'life') return lifeBurst(x, y, z)
    if (type === 'shunt') return shuntBurst(x, y, z)
    _tint.set(color)
    for (let i = 0; i < 48; i++) {
      randomOnSphere(2 + Math.random() * 6, _v)
      _c.copy(_tint).lerp(white, Math.random() * 0.6)
      particles.emit(
        x,
        y,
        z,
        _v.x,
        _v.y,
        _v.z + 4 + Math.random() * 6,
        _c,
        0.3 + Math.random() * 0.3,
        0.07 + Math.random() * 0.1,
        2,
      )
    }
    particles.flush()
  }

  /** Crash debris: heavy, long-lived, magenta / sodium / white. */
  function explode(x, y, z) {
    for (let i = 0; i < 160; i++) {
      randomOnSphere(3 + Math.random() * 11, _v)
      const r = Math.random()
      _c.copy(r < 0.4 ? mag : r < 0.75 ? sodium : white)
      particles.emit(
        x,
        y,
        z,
        _v.x,
        _v.y,
        _v.z + 2,
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
    scrollSpeed = speed
    streaks.update(dt, speed, kick)
  }

  return {
    gateBurst,
    edgeSparks,
    afterburner,
    scrapeSparks,
    puff,
    orbBurst,
    damperBurst,
    lifeBurst,
    shuntBurst,
    explode,
    update,
    kick(v) {
      kick = Math.max(kick, v)
    },
    /** Scales the continuous streams for the quality ladder; bursts stay untouched. */
    setDensity(scale) {
      density = Math.max(0, scale)
    },
  }
}

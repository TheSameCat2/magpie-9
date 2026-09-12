import * as THREE from 'three'
import { R, VERTEX_R, THEME, makeFrameMaterial, makeRingMaterial } from './theme.js'
import { hitObstacle } from './collision.js'

const POOL = 12
export const HOLE_W = 2.8
export const HOLE_H = 3.2
export const LASER_GAP = 3.0
const DEPTH = 0.3
export const PYLON_W = 4.5
const PYLON_H = 8.2
const PYLON_D = 0.42
export const PYLON_PX = 2.2
const RING_EXPAND = 3.2
const PROX_RANGE = 38
const PASS_FADE_Z = 4.2
const RING_FADE_Z = 3.4

const COLOR = {
  bulkhead: THEME.ice,
  'laser-bar': THEME.mag,
  pylon: THEME.sodium,
}

const unitPlane = new THREE.PlaneGeometry(1, 1)
const unitBox = new THREE.BoxGeometry(1, 1, 1)

function hexShape() {
  const shape = new THREE.Shape()
  for (let i = 0; i < 6; i++) {
    const a = i * (Math.PI / 3)
    const x = Math.cos(a) * VERTEX_R
    const y = Math.sin(a) * VERTEX_R
    if (i === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  }
  shape.closePath()
  return shape
}

function bulkheadGeometry(ox, oy) {
  const shape = hexShape()
  const hole = new THREE.Path()
  const hw = HOLE_W * 0.5
  const hh = HOLE_H * 0.5
  hole.moveTo(ox - hw, oy - hh)
  hole.lineTo(ox - hw, oy + hh)
  hole.lineTo(ox + hw, oy + hh)
  hole.lineTo(ox + hw, oy - hh)
  hole.closePath()
  shape.holes.push(hole)
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: DEPTH,
    bevelEnabled: false,
    curveSegments: 1,
  })
  geo.translate(0, 0, -DEPTH * 0.5)
  return geo
}

function pickType(spawnIndex, score) {
  if (spawnIndex < 2) return 'bulkhead'
  if (score >= 5 && Math.random() < 0.3) return 'pylon'
  if (score >= 3 && Math.random() < 0.38) return 'laser-bar'
  return 'bulkhead'
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v))
}

// Pure X/Y placement for a gate. Injectable RNG so layout can be unit-tested
// without constructing Three.js meshes.
export function layoutGate(type, offset, rand = Math.random) {
  if (type === 'bulkhead') {
    const ang = rand() * Math.PI * 2
    const mag = offset * (0.55 + rand() * 0.45)
    return {
      hole: {
        x: Math.cos(ang) * mag,
        y: Math.sin(ang) * mag,
        w: HOLE_W,
        h: HOLE_H,
      },
    }
  }

  if (type === 'laser-bar') {
    // Zero offset means a dead-centre band (tutorial); runs never reach lasers below 0.8.
    return {
      gapY: offset > 0 ? clamp((rand() * 2 - 1) * Math.max(0.4, offset), -1.7, 1.7) : 0,
      gapH: LASER_GAP,
    }
  }

  const side = rand() < 0.5 ? 'left' : 'right'
  const px = side === 'left' ? -PYLON_PX : PYLON_PX
  return {
    side,
    px,
    edge: side === 'left' ? px + PYLON_W * 0.5 : px - PYLON_W * 0.5,
  }
}

function makeSlot(materials) {
  const group = new THREE.Group()
  group.visible = false

  const bulkhead = new THREE.Mesh(new THREE.BufferGeometry(), materials.plate)
  group.add(bulkhead)

  const rims = []
  for (let i = 0; i < 4; i++) {
    const rim = new THREE.Mesh(unitBox, materials.hatch)
    rim.visible = false
    rims.push(rim)
    group.add(rim)
  }

  const laserTop = new THREE.Mesh(unitBox, materials.laserTop)
  const laserBot = new THREE.Mesh(unitBox, materials.laserBot)
  laserTop.visible = false
  laserBot.visible = false
  group.add(laserTop, laserBot)

  const pylon = new THREE.Mesh(unitBox, materials.pylon)
  const pylonEdge = new THREE.Mesh(unitBox, materials.pylonEdge)
  pylon.visible = false
  pylonEdge.visible = false
  group.add(pylon, pylonEdge)

  const frame = new THREE.Mesh(unitPlane, makeFrameMaterial(THEME.ice))
  frame.visible = false
  frame.renderOrder = 5
  group.add(frame)

  const ring = new THREE.Mesh(unitPlane, makeRingMaterial(THEME.ice))
  ring.visible = false
  ring.renderOrder = 6
  group.add(ring)

  return {
    active: false,
    scored: false,
    type: 'bulkhead',
    z: 0,
    gap: 0,
    depth: DEPTH,
    hole: { x: 0, y: 0, w: HOLE_W, h: HOLE_H },
    gapY: 0,
    gapH: LASER_GAP,
    side: 'left',
    edge: 0,
    hit: 0,
    ringT: -1,
    group,
    bulkhead,
    rims,
    laserTop,
    laserBot,
    pylon,
    pylonEdge,
    frame,
    ring,
    geo: null,
  }
}

function hideAll(obs) {
  obs.bulkhead.visible = false
  for (const r of obs.rims) r.visible = false
  obs.laserTop.visible = false
  obs.laserBot.visible = false
  obs.pylon.visible = false
  obs.pylonEdge.visible = false
  obs.frame.visible = false
  obs.ring.visible = false
  obs.ringT = -1
  obs.hit = 0
}

function placeRims(obs, ox, oy) {
  const hw = HOLE_W * 0.5
  const hh = HOLE_H * 0.5
  const t = 0.07
  const specs = [
    { x: ox, y: oy + hh, w: HOLE_W + t, h: t },
    { x: ox, y: oy - hh, w: HOLE_W + t, h: t },
    { x: ox - hw, y: oy, w: t, h: HOLE_H },
    { x: ox + hw, y: oy, w: t, h: HOLE_H },
  ]
  specs.forEach((s, i) => {
    const rim = obs.rims[i]
    rim.visible = true
    rim.scale.set(s.w, s.h, 0.14)
    rim.position.set(s.x, s.y, 0)
  })
}

function setFrame(obs, mode, x, y, w, h, halfW, halfH, edgeSign, color) {
  const u = obs.frame.material.uniforms
  u.uMode.value = mode
  u.uSize.value.set(w, h)
  u.uHalf.value.set(halfW, halfH)
  u.uEdgeSign.value = edgeSign
  u.uProx.value = 0
  u.uHit.value = 0
  u.uColor.value.set(color)
  u.uSeed.value = Math.random()
  obs.frame.scale.set(w, h, 1)
  obs.frame.position.set(x, y, obs.depth * 0.5 + 0.05)
  obs.frame.visible = true
}

function configure(obs, type, z, offset, gap) {
  hideAll(obs)
  obs.type = type
  obs.z = z
  obs.gap = gap
  obs.scored = false
  obs.active = true
  obs.group.visible = true
  obs.group.position.set(0, 0, z)

  const layout = layoutGate(type, offset)

  if (type === 'bulkhead') {
    const ox = layout.hole.x
    const oy = layout.hole.y
    obs.hole.x = ox
    obs.hole.y = oy
    obs.depth = DEPTH
    if (obs.geo) obs.geo.dispose()
    obs.geo = bulkheadGeometry(ox, oy)
    obs.bulkhead.geometry = obs.geo
    obs.bulkhead.visible = true
    placeRims(obs, ox, oy)
    setFrame(obs, 0, ox, oy, HOLE_W + 2.6, HOLE_H + 2.6, HOLE_W * 0.5, HOLE_H * 0.5, 1, COLOR.bulkhead)
    return
  }

  if (type === 'laser-bar') {
    const gapY = layout.gapY
    obs.gapY = gapY
    obs.gapH = LASER_GAP
    obs.depth = 0.16
    const topH = Math.max(0.4, R + 0.4 - (gapY + LASER_GAP * 0.5))
    const botH = Math.max(0.4, gapY - LASER_GAP * 0.5 + R + 0.4)
    obs.laserTop.visible = true
    obs.laserBot.visible = true
    obs.laserTop.scale.set(VERTEX_R * 2, topH, 0.14)
    obs.laserBot.scale.set(VERTEX_R * 2, botH, 0.14)
    obs.laserTop.position.set(0, gapY + LASER_GAP * 0.5 + topH * 0.5, 0)
    obs.laserBot.position.set(0, gapY - LASER_GAP * 0.5 - botH * 0.5, 0)
    setFrame(obs, 1, 0, gapY, VERTEX_R * 2, LASER_GAP + 2.2, 0, LASER_GAP * 0.5, 1, COLOR['laser-bar'])
    return
  }

  const { side, px, edge } = layout
  obs.side = side
  obs.edge = edge
  obs.depth = PYLON_D
  obs.pylon.visible = true
  obs.pylonEdge.visible = true
  // Negative X scale points local +X at the gap so the shared shader
  // can heat the open-edge bus without a per-slot uniform.
  obs.pylon.scale.set(side === 'left' ? PYLON_W : -PYLON_W, PYLON_H, PYLON_D)
  obs.pylon.position.set(px, 0, 0)
  obs.pylonEdge.scale.set(0.14, PYLON_H, PYLON_D + 0.1)
  obs.pylonEdge.position.set(edge, 0, 0)
  setFrame(obs, 2, edge, 0, 2.8, PYLON_H + 1.2, 0, 0, side === 'left' ? -1 : 1, COLOR.pylon)
}

export function createObstacles(scene, materials) {
  const root = new THREE.Group()
  root.name = 'obstacles'
  scene.add(root)

  const pool = []
  for (let i = 0; i < POOL; i++) {
    const slot = makeSlot(materials)
    root.add(slot.group)
    pool.push(slot)
  }

  let spawnIndex = 0

  function deactivate(obs) {
    obs.active = false
    obs.group.visible = false
    obs.ringT = -1
    obs.ring.visible = false
  }

  function reset() {
    spawnIndex = 0
    for (const obs of pool) deactivate(obs)
  }

  function spawn(score, diff, z, gap, typeFor) {
    const obs = pool.find((o) => !o.active)
    if (!obs) return
    const type = typeFor ? typeFor(spawnIndex) : pickType(spawnIndex, score)
    const offset = spawnIndex < 2 ? 0 : diff.offset
    configure(obs, type, z, offset, gap)
    spawnIndex += 1
    return obs
  }

  function minActiveZ() {
    let m = Infinity
    let n = 0
    for (const obs of pool) {
      if (!obs.active) continue
      n += 1
      if (obs.z < m) m = obs.z
    }
    return n ? m : null
  }

  // `typeFor(spawnIndex)` overrides the random hazard pick (tutorial's fixed order).
  function ensureAhead(score, diff, out, typeFor) {
    if (out) out.length = 0
    let guard = 0
    while (guard++ < 8) {
      const mz = minActiveZ()
      if (mz !== null && mz <= -48) break
      const gap = mz === null ? 32 : diff.spacing
      const z = mz === null ? -32 : mz - diff.spacing
      const obs = spawn(score, diff, z, gap, typeFor)
      if (obs && out) out.push(obs)
    }
  }

  function animate(obs, dt) {
    const u = obs.frame.material.uniforms
    const prox = obs.z < 0 ? THREE.MathUtils.clamp(1 + obs.z / PROX_RANGE, 0, 1) : 1
    u.uProx.value = prox * prox
    if (obs.hit > 0) obs.hit = Math.max(0, obs.hit - dt * 3.2)
    u.uHit.value = obs.hit
    // Fade the frame out once threaded so it never sits on the lens as it passes the camera.
    u.uFade.value = obs.z > 0 ? THREE.MathUtils.clamp(1 - obs.z / PASS_FADE_Z, 0, 1) : 1
    obs.frame.visible = u.uFade.value > 0.001
    if (obs.ringT >= 0) {
      obs.ringT += dt * 2.1
      const fade = THREE.MathUtils.clamp(1 - obs.z / RING_FADE_Z, 0, 1)
      if (obs.ringT >= 1 || fade <= 0) {
        obs.ringT = -1
        obs.ring.visible = false
      } else {
        obs.ring.material.uniforms.uT.value = obs.ringT
        obs.ring.material.uniforms.uFade.value = fade
      }
    }
  }

  function scroll(dz, dt) {
    for (const obs of pool) {
      if (!obs.active) continue
      obs.z += dz
      obs.group.position.z = obs.z
      if (obs.z > 14) {
        deactivate(obs)
        continue
      }
      animate(obs, dt)
    }
  }

  // Fires the pass flash + shockwave on a gate that was just threaded at (bx, by).
  function celebrate(obs, bx, by) {
    obs.hit = 1
    obs.ringT = 0
    const ring = obs.ring
    const u = ring.material.uniforms
    u.uT.value = 0
    u.uFade.value = 1
    u.uColor.value.set(COLOR[obs.type])
    if (obs.type === 'bulkhead') {
      const w = HOLE_W + RING_EXPAND * 2 + 1
      const h = HOLE_H + RING_EXPAND * 2 + 1
      u.uSize.value.set(w, h)
      u.uHalf.value.set(HOLE_W * 0.5, HOLE_H * 0.5)
      ring.scale.set(w, h, 1)
      ring.position.set(obs.hole.x, obs.hole.y, obs.depth * 0.5 + 0.08)
    } else {
      const s = RING_EXPAND * 2 + 1
      u.uSize.value.set(s, s)
      u.uHalf.value.set(0, 0)
      ring.scale.set(s, s, 1)
      ring.position.set(bx, by, obs.depth * 0.5 + 0.08)
    }
    u.uExpand.value = RING_EXPAND
    ring.visible = true
  }

  // Marks gates the bird has passed this frame and pushes them into `out`.
  function collectScores(out) {
    out.length = 0
    for (const obs of pool) {
      if (obs.active && !obs.scored && obs.z >= 0) {
        obs.scored = true
        out.push(obs)
      }
    }
    return out.length
  }

  function hits(pos, radius) {
    for (const obs of pool) {
      if (!obs.active) continue
      if (hitObstacle(pos, radius, obs)) return obs
    }
    return null
  }

  function nearestAhead() {
    let best = null
    for (const obs of pool) {
      if (!obs.active || obs.scored) continue
      if (!best || obs.z > best.z) best = obs
    }
    return best
  }

  // Where sparks should erupt from for a given gate.
  function burstShape(obs, bx, by, shape) {
    if (obs.type === 'bulkhead') {
      shape.x = obs.hole.x
      shape.y = obs.hole.y
      shape.hw = HOLE_W * 0.5
      shape.hh = HOLE_H * 0.5
    } else if (obs.type === 'laser-bar') {
      shape.x = bx
      shape.y = obs.gapY
      shape.hw = 1.6
      shape.hh = obs.gapH * 0.5
    } else {
      shape.x = obs.edge
      shape.y = by
      shape.hw = 0.05
      shape.hh = 1.6
    }
    shape.color = COLOR[obs.type]
    return shape
  }

  return {
    reset,
    ensureAhead,
    scroll,
    collectScores,
    celebrate,
    burstShape,
    hits,
    nearestAhead,
  }
}

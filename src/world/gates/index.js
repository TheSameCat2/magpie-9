import * as THREE from 'three'
import { FIRST_GATE_Z } from '../../config/rules.js'
import { RECYCLE_Z } from '../../config/world.js'
import { clamp01 } from '../../lib/math.js'
import { hitObstacle } from '../collision.js'
import { GATE_COLOR, configureGate, createGateSlot, placeSledHatch } from './slot.js'
import { HOLE_H, HOLE_W, layoutGate, pickGateType } from './layout.js'

export { GATE_COLOR } from './slot.js'
export * from './layout.js'

const POOL_SIZE = 12
/** Gates deeper than this are far enough ahead; stop spawning. */
const SPAWN_HORIZON_Z = -48
const RING_EXPAND = 3.2
/** Distance over which the frame's proximity glow ramps up. */
const PROX_RANGE = 38
const PASS_FADE_Z = 4.2
const RING_FADE_Z = 3.4

function hasHatch(gate) {
  return gate.type === 'bulkhead' || gate.type === 'sled'
}

/**
 * The pooled hazard gates. Spawning is driven by `ensureAhead`, which fills
 * the conduit to the horizon using either random picks (`pickGateType`),
 * a fixed order (`typeFor`, tutorial), or a precomputed `course` (challenge).
 */
export function createGates(scene, materials) {
  const root = new THREE.Group()
  root.name = 'gates'
  scene.add(root)

  const pool = []
  for (let i = 0; i < POOL_SIZE; i++) {
    const slot = createGateSlot(materials)
    root.add(slot.group)
    pool.push(slot)
  }

  let spawnIndex = 0
  let lastType = null

  function deactivate(gate) {
    gate.active = false
    gate.group.visible = false
    gate.ringT = -1
    gate.ring.visible = false
  }

  function reset() {
    spawnIndex = 0
    lastType = null
    for (const gate of pool) deactivate(gate)
  }

  function spawn(score, diff, z, gap, typeFor, spec) {
    const gate = pool.find((g) => !g.active)
    if (!gate) return null
    const type =
      spec?.type ?? (typeFor ? typeFor(spawnIndex) : pickGateType(spawnIndex, score, Math.random, lastType))
    // The first two gates of any run are centred warm-ups.
    const offset = spec ? spec.offset : spawnIndex < 2 ? 0 : diff.offset
    configureGate(gate, type, z, gap, spec?.layout ?? layoutGate(type, offset))
    lastType = type
    spawnIndex += 1
    return gate
  }

  /** Z of the deepest live gate, or null when none is active. */
  function farthestZ() {
    let z = null
    for (const gate of pool) {
      if (gate.active && (z === null || gate.z < z)) z = gate.z
    }
    return z
  }

  /**
   * Spawn until the conduit is filled to the horizon. New gates are pushed
   * into `out` so the caller can drop orbs behind them.
   */
  function ensureAhead(score, diff, out, typeFor, course) {
    if (out) out.length = 0
    for (let guard = 0; guard < 8; guard++) {
      if (course && spawnIndex >= course.length) break
      const spec = course?.[spawnIndex]
      const deepest = farthestZ()
      if (deepest !== null && deepest <= SPAWN_HORIZON_Z) break
      const spacing = spec?.spacing ?? diff.spacing
      const gap = deepest === null ? FIRST_GATE_Z : spacing
      const z = deepest === null ? -FIRST_GATE_Z : deepest - spacing
      const gate = spawn(score, diff, z, gap, typeFor, spec)
      if (gate && out) out.push(gate)
    }
  }

  function animateFrame(gate, dt) {
    const u = gate.frame.material.uniforms
    const prox = gate.z < 0 ? clamp01(1 + gate.z / PROX_RANGE) : 1
    u.uProx.value = prox * prox
    if (gate.hit > 0) gate.hit = Math.max(0, gate.hit - dt * 3.2)
    u.uHit.value = gate.hit
    // Fade the frame out once threaded so it never sits on the lens as it passes the camera.
    u.uFade.value = gate.z > 0 ? clamp01(1 - gate.z / PASS_FADE_Z) : 1
    gate.frame.visible = u.uFade.value > 0.001
  }

  function animateRing(gate, dt) {
    if (gate.ringT < 0) return
    gate.ringT += dt * 2.1
    const fade = clamp01(1 - gate.z / RING_FADE_Z)
    if (gate.ringT >= 1 || fade <= 0) {
      gate.ringT = -1
      gate.ring.visible = false
      return
    }
    gate.ring.material.uniforms.uT.value = gate.ringT
    gate.ring.material.uniforms.uFade.value = fade
  }

  function animateSled(gate, dt) {
    // The hatch rides its sine; collision reads gate.hole live. Frozen while
    // paused (dt = 0) so a resume never meets a jumped hatch.
    gate.sled.phase += dt * gate.sled.freq
    gate.hole.x = gate.sled.baseX + gate.sled.amp * Math.sin(gate.sled.phase)
    placeSledHatch(gate)
  }

  function scroll(dz, dt) {
    for (const gate of pool) {
      if (!gate.active) continue
      gate.z += dz
      gate.group.position.z = gate.z
      if (gate.z > RECYCLE_Z) {
        deactivate(gate)
        continue
      }
      if (gate.sled) animateSled(gate, dt)
      animateFrame(gate, dt)
      animateRing(gate, dt)
    }
  }

  /** Fires the pass flash + shockwave on a gate that was just threaded at (bx, by). */
  function celebrate(gate, bx, by) {
    gate.hit = 1
    gate.ringT = 0
    const ring = gate.ring
    const u = ring.material.uniforms
    u.uT.value = 0
    u.uFade.value = 1
    u.uColor.value.set(GATE_COLOR[gate.type])
    if (hasHatch(gate)) {
      const w = HOLE_W + RING_EXPAND * 2 + 1
      const h = HOLE_H + RING_EXPAND * 2 + 1
      u.uSize.value.set(w, h)
      u.uHalf.value.set(HOLE_W * 0.5, HOLE_H * 0.5)
      ring.scale.set(w, h, 1)
      ring.position.set(gate.hole.x, gate.hole.y, gate.depth * 0.5 + 0.08)
    } else {
      const s = RING_EXPAND * 2 + 1
      u.uSize.value.set(s, s)
      u.uHalf.value.set(0, 0)
      ring.scale.set(s, s, 1)
      ring.position.set(bx, by, gate.depth * 0.5 + 0.08)
    }
    u.uExpand.value = RING_EXPAND
    ring.visible = true
  }

  /** Marks gates the bird has passed this frame and pushes them into `out`. */
  function collectPassed(out) {
    out.length = 0
    for (const gate of pool) {
      if (gate.active && !gate.scored && gate.z >= 0) {
        gate.scored = true
        out.push(gate)
      }
    }
    return out.length
  }

  function hits(pos, hit) {
    for (const gate of pool) {
      if (gate.active && hitObstacle(pos, hit, gate)) return gate
    }
    return null
  }

  /** The closest gate the bird has not yet passed. */
  function nearestAhead() {
    let nearest = null
    for (const gate of pool) {
      if (!gate.active || gate.scored) continue
      if (!nearest || gate.z > nearest.z) nearest = gate
    }
    return nearest
  }

  /** Where sparks should erupt from for a gate threaded at (bx, by); writes into `shape`. */
  function burstShape(gate, bx, by, shape) {
    if (hasHatch(gate)) {
      shape.x = gate.hole.x
      shape.y = gate.hole.y
      shape.hw = HOLE_W * 0.5
      shape.hh = HOLE_H * 0.5
    } else if (gate.type === 'laser-bar') {
      shape.x = bx
      shape.y = gate.gapY
      shape.hw = 1.6
      shape.hh = gate.gapH * 0.5
    } else {
      shape.x = gate.edge
      shape.y = by
      shape.hw = 0.05
      shape.hh = 1.6
    }
    shape.color = GATE_COLOR[gate.type]
    return shape
  }

  return { reset, ensureAhead, scroll, collectPassed, celebrate, burstShape, hits, nearestAhead }
}

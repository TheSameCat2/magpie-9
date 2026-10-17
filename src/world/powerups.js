import * as THREE from 'three'
import { THEME } from '../config/theme.js'
import { RECYCLE_Z } from '../config/world.js'
import { ORB_SPREAD } from '../config/rules.js'
import { randomInDisc } from '../lib/math.js'
import { UNIFORMS } from '../render/uniforms.js'
import { createOrbMaterial, createHaloMaterial } from '../render/materials.js'
import { bendMaterial } from '../render/bend.js'
import { createBoltTexture, createChevronTexture, createPlusTexture } from '../render/textures.js'
import { hitOrb } from './collision.js'

// Sized for BENDS, which spawns deeper: a full pool silently drops an orb, spare lives included.
const POOL_SIZE = 10
const ORB_R = 0.42
const HALO_SCALE = 1.9
const unitPlane = new THREE.PlaneGeometry(1, 1)
const shellGeometry = new THREE.SphereGeometry(ORB_R, 24, 16)
const coreGeometry = new THREE.OctahedronGeometry(0.18, 0)
const ringOuterGeometry = new THREE.TorusGeometry(0.28, 0.013, 6, 24)
const ringInnerGeometry = new THREE.TorusGeometry(0.22, 0.011, 6, 24)
const iconGeometry = new THREE.PlaneGeometry(0.38, 0.38)

export const ORB_TYPES = ['damper', 'life', 'shunt']

function createIconMaterial(map) {
  return bendMaterial(
    new THREE.MeshBasicMaterial({
      map,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  )
}

function createCrystalMaterial(color) {
  return bendMaterial(
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.85,
      roughness: 0.15,
      metalness: 0.8,
      flatShading: true,
      transparent: true,
      opacity: 0.92,
    }),
  )
}

function createRingMaterial(color) {
  return bendMaterial(
    new THREE.MeshStandardMaterial({
      color: 0xdce8f0,
      emissive: color,
      emissiveIntensity: 0.45,
      roughness: 0.22,
      metalness: 0.9,
    }),
  )
}

/** Shell + halo + crystal + gimbal rings + rune materials for one orb type. */
function createLook(color, iconTexture) {
  return {
    shell: createOrbMaterial(color),
    halo: createHaloMaterial(color),
    icon: createIconMaterial(iconTexture),
    crystal: createCrystalMaterial(color),
    ring: createRingMaterial(color),
  }
}

function createOrbSlot(look) {
  const group = new THREE.Group()
  group.visible = false
  group.matrixAutoUpdate = false
  group.matrixWorldAutoUpdate = false

  const shell = new THREE.Mesh(shellGeometry, look.shell)
  const halo = new THREE.Mesh(unitPlane, look.halo)
  halo.scale.setScalar(HALO_SCALE)
  halo.renderOrder = 7

  const ringOuter = new THREE.Mesh(ringOuterGeometry, look.ring)
  ringOuter.renderOrder = 8
  const ringInner = new THREE.Mesh(ringInnerGeometry, look.ring)
  ringInner.renderOrder = 8

  const crystal = new THREE.Mesh(coreGeometry, look.crystal)
  crystal.renderOrder = 9

  const icon = new THREE.Mesh(iconGeometry, look.icon)
  icon.renderOrder = 10

  const children = [shell, halo, ringOuter, ringInner, crystal, icon]
  for (let i = 0; i < children.length; i++) {
    children[i].updateMatrix()
    children[i].matrixAutoUpdate = false
    children[i].matrixWorldAutoUpdate = false
  }
  group.add(...children)

  return {
    active: false,
    type: 'damper',
    x: 0,
    y: 0,
    z: 0,
    r: ORB_R,
    seed: 0,
    group,
    children,
    shell,
    halo,
    ringOuter,
    ringInner,
    crystal,
    icon,
  }
}

export function createPowerups(scene) {
  const root = new THREE.Group()
  root.name = 'powerups'
  root.matrixAutoUpdate = false
  root.matrixWorldAutoUpdate = false
  scene.add(root)

  const looks = {
    damper: createLook(THEME.gold, createChevronTexture()),
    life: createLook(THEME.green, createPlusTexture()),
    shunt: createLook(THEME.ice, createBoltTexture()),
  }

  const pool = []
  for (let i = 0; i < POOL_SIZE; i++) {
    const slot = createOrbSlot(looks.damper)
    root.add(slot.group)
    pool.push(slot)
  }
  // A full pool silently loses an orb; count it so `?debug=1` can tell a
  // tuning problem from a spawn-rule problem. Lifetime counter, not reset.
  let dropped = 0
  // Culling reads straight-conduit bounds, which a bend moves the mesh away from.
  root.traverse((o) => {
    o.frustumCulled = false
  })

  function deactivate(orb) {
    orb.active = false
    orb.group.visible = false
  }

  function reset() {
    for (let i = 0; i < POOL_SIZE; i++) deactivate(pool[i])
  }

  function applyLook(orb, type) {
    const look = looks[type] || looks.damper
    orb.type = type
    orb.shell.material = look.shell
    orb.halo.material = look.halo
    orb.icon.material = look.icon
    orb.crystal.material = look.crystal
    orb.ringOuter.material = look.ring
    orb.ringInner.material = look.ring
  }

  function writeScalePos(elements, s, px, py, pz) {
    elements[0] = s
    elements[5] = s
    elements[10] = s
    elements[12] = px
    elements[13] = py
    elements[14] = pz
  }

  function writeRotXYScalePos(elements, rx, ry, p, px, py, pz) {
    const a = Math.cos(rx)
    const b = Math.sin(rx)
    const c = Math.cos(ry)
    const d = Math.sin(ry)
    const ap = a * p
    const bp = b * p
    elements[0] = c * p
    elements[1] = bp * d
    elements[2] = -ap * d
    elements[4] = 0
    elements[5] = ap
    elements[6] = bp
    elements[8] = d * p
    elements[9] = -bp * c
    elements[10] = ap * c
    elements[12] = px
    elements[13] = py
    elements[14] = pz
  }

  function syncOrbMatrices(orb, px, py, pz, p) {
    writeScalePos(orb.group.matrix.elements, p, px, py, pz)
    writeScalePos(orb.group.matrixWorld.elements, p, px, py, pz)
    writeScalePos(orb.shell.matrixWorld.elements, p, px, py, pz)
    writeScalePos(orb.halo.matrixWorld.elements, p * HALO_SCALE, px, py, pz)

    // ringOuter: Euler(rx, 0, rz)
    const rxO = orb.ringOuter.rotation._x
    const rzO = orb.ringOuter.rotation._z
    const aO = Math.cos(rxO) * p
    const bO = Math.sin(rxO) * p
    const eO = Math.cos(rzO)
    const fO = Math.sin(rzO)
    const oe = orb.ringOuter.matrixWorld.elements
    oe[0] = eO * p
    oe[1] = aO * fO
    oe[2] = bO * fO
    oe[4] = -fO * p
    oe[5] = aO * eO
    oe[6] = bO * eO
    oe[8] = 0
    oe[9] = -bO
    oe[10] = aO
    oe[12] = px
    oe[13] = py
    oe[14] = pz

    // ringInner & crystal: Euler(rx, ry, 0)
    writeRotXYScalePos(
      orb.ringInner.matrixWorld.elements,
      orb.ringInner.rotation._x,
      orb.ringInner.rotation._y,
      p,
      px,
      py,
      pz,
    )
    writeRotXYScalePos(
      orb.crystal.matrixWorld.elements,
      orb.crystal.rotation._x,
      orb.crystal.rotation._y,
      p,
      px,
      py,
      pz,
    )

    // icon: Euler(0, ry, 0)
    const ryI = orb.icon.rotation._y
    const cI = Math.cos(ryI) * p
    const dI = Math.sin(ryI) * p
    const ie = orb.icon.matrixWorld.elements
    ie[0] = cI
    ie[1] = 0
    ie[2] = -dI
    ie[4] = 0
    ie[5] = p
    ie[6] = 0
    ie[8] = dI
    ie[9] = 0
    ie[10] = cI
    ie[12] = px
    ie[13] = py
    ie[14] = pz
  }

  /**
   * Drop an orb at depth `z`. Position is random within `spread` of the axis
   * unless `at` pins it (challenge courses are precomputed).
   */
  function spawn(z, type = 'damper', spread = ORB_SPREAD, at) {
    let orb = null
    for (let i = 0; i < POOL_SIZE; i++) {
      if (!pool[i].active) {
        orb = pool[i]
        break
      }
    }
    if (!orb) {
      dropped += 1
      return null
    }
    if (at) {
      orb.x = at.x
      orb.y = at.y
    } else {
      randomInDisc(spread, Math.random, orb)
    }
    orb.z = z
    orb.seed = Math.random() * Math.PI * 2
    orb.active = true
    applyLook(orb, type)
    orb.group.visible = true
    orb.group.position.set(orb.x, orb.y, orb.z)
    orb.group.scale.setScalar(1)
    orb.ringOuter.rotation._x = 0
    orb.ringOuter.rotation._y = 0
    orb.ringOuter.rotation._z = 0
    orb.ringInner.rotation._x = 0
    orb.ringInner.rotation._y = 0
    orb.ringInner.rotation._z = 0
    orb.crystal.rotation._x = 0
    orb.crystal.rotation._y = 0
    orb.crystal.rotation._z = 0
    orb.icon.rotation._x = 0
    orb.icon.rotation._y = 0
    orb.icon.rotation._z = 0
    syncOrbMatrices(orb, orb.x, orb.y, orb.z, 1)
    return orb
  }

  function scroll(dz, dt) {
    const t = UNIFORMS.uTime.value
    for (let i = 0; i < POOL_SIZE; i++) {
      const orb = pool[i]
      if (!orb.active) continue
      orb.z += dz
      if (orb.z > RECYCLE_Z) {
        deactivate(orb)
        continue
      }
      const py = orb.y + Math.sin(t * 2.2 + orb.seed) * 0.12
      const pulse = 1 + 0.06 * Math.sin(t * 3.1 + orb.seed)
      orb.group.position.set(orb.x, py, orb.z)
      orb.group.scale.setScalar(pulse)

      // Gyroscopic gimbal counter-rotations
      orb.ringOuter.rotation._x += dt * 1.9
      orb.ringOuter.rotation._z += dt * 1.3
      orb.ringInner.rotation._y -= dt * 2.4
      orb.ringInner.rotation._x += dt * 0.9

      // Faceted crystal tumble
      orb.crystal.rotation._x += dt * 1.4
      orb.crystal.rotation._y += dt * 2.1

      // Central rune glyph
      orb.icon.rotation._y += dt * 3.2

      syncOrbMatrices(orb, orb.x, py, orb.z, pulse)
    }
  }

  /** Deactivates every orb the bird touches this frame and pushes them into `out`. */
  function collect(pos, hit, out) {
    out.length = 0
    for (let i = 0; i < POOL_SIZE; i++) {
      const orb = pool[i]
      if (orb.active && hitOrb(pos, hit, orb)) {
        deactivate(orb)
        out.push(orb)
      }
    }
    return out.length
  }

  /** Remove orbs the world has rewound past so a spare-life rewind never re-offers them. */
  function cullBehind(zLimit) {
    for (let i = 0; i < POOL_SIZE; i++) {
      const orb = pool[i]
      if (orb.active && orb.z > zLimit) deactivate(orb)
    }
  }

  return {
    reset,
    spawn,
    scroll,
    collect,
    cullBehind,
    pool,
    /** Spawns refused because the pool was full, for the debug overlay. */
    get dropped() {
      return dropped
    },
  }
}

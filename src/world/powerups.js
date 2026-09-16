import * as THREE from 'three'
import { THEME } from '../config/theme.js'
import { RECYCLE_Z } from '../config/world.js'
import { ORB_SPREAD } from '../config/rules.js'
import { randomInDisc } from '../lib/math.js'
import { UNIFORMS } from '../render/uniforms.js'
import { createOrbMaterial, createHaloMaterial } from '../render/materials.js'
import { createBoltTexture, createChevronTexture, createPlusTexture } from '../render/textures.js'
import { hitOrb } from './collision.js'

const POOL_SIZE = 6
const ORB_R = 0.42
const HALO_SCALE = 1.9
const unitPlane = new THREE.PlaneGeometry(1, 1)
const shellGeometry = new THREE.SphereGeometry(ORB_R, 24, 16)
const iconGeometry = new THREE.PlaneGeometry(0.5, 0.5)

export const ORB_TYPES = ['damper', 'life', 'shunt']

function createIconMaterial(map) {
  return new THREE.MeshBasicMaterial({
    map,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
}

/** Shell + halo + spinning icon materials for one orb type. */
function createLook(color, iconTexture) {
  return {
    shell: createOrbMaterial(color),
    halo: createHaloMaterial(color),
    icon: createIconMaterial(iconTexture),
  }
}

function createOrbSlot(look) {
  const group = new THREE.Group()
  group.visible = false

  const shell = new THREE.Mesh(shellGeometry, look.shell)
  const halo = new THREE.Mesh(unitPlane, look.halo)
  halo.scale.setScalar(HALO_SCALE)
  halo.renderOrder = 7
  const icon = new THREE.Mesh(iconGeometry, look.icon)
  icon.renderOrder = 8
  group.add(shell, halo, icon)

  return { active: false, type: 'damper', x: 0, y: 0, z: 0, r: ORB_R, seed: 0, group, shell, halo, icon }
}

export function createPowerups(scene) {
  const root = new THREE.Group()
  root.name = 'powerups'
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

  function deactivate(orb) {
    orb.active = false
    orb.group.visible = false
  }

  function reset() {
    for (const orb of pool) deactivate(orb)
  }

  function applyLook(orb, type) {
    const look = looks[type] || looks.damper
    orb.type = type
    orb.shell.material = look.shell
    orb.halo.material = look.halo
    orb.icon.material = look.icon
  }

  /**
   * Drop an orb at depth `z`. Position is random within `spread` of the axis
   * unless `at` pins it (challenge courses are precomputed).
   */
  function spawn(z, type = 'damper', spread = ORB_SPREAD, at) {
    const orb = pool.find((o) => !o.active)
    if (!orb) return null
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
    orb.icon.rotation.y = 0
    return orb
  }

  function scroll(dz, dt) {
    const t = UNIFORMS.uTime.value
    for (const orb of pool) {
      if (!orb.active) continue
      orb.z += dz
      if (orb.z > RECYCLE_Z) {
        deactivate(orb)
        continue
      }
      const bob = Math.sin(t * 2.2 + orb.seed) * 0.12
      const pulse = 1 + 0.06 * Math.sin(t * 3.1 + orb.seed)
      orb.group.position.set(orb.x, orb.y + bob, orb.z)
      orb.group.scale.setScalar(pulse)
      orb.icon.rotation.y += dt * 3.2
    }
  }

  /** Deactivates every orb the bird touches this frame and pushes them into `out`. */
  function collect(pos, hit, out) {
    out.length = 0
    for (const orb of pool) {
      if (orb.active && hitOrb(pos, hit, orb)) {
        deactivate(orb)
        out.push(orb)
      }
    }
    return out.length
  }

  /** Remove orbs the world has rewound past so a spare-life rewind never re-offers them. */
  function cullBehind(zLimit) {
    for (const orb of pool) {
      if (orb.active && orb.z > zLimit) deactivate(orb)
    }
  }

  return { reset, spawn, scroll, collect, cullBehind }
}

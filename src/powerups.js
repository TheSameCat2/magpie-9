import * as THREE from 'three'
import { SHARED, THEME, makeOrbMaterial, makeHaloMaterial, chevronMap, plusMap } from './theme.js'
import { hitOrb } from './collision.js'

const POOL = 6
const ORB_R = 0.42
const ORB_SPREAD = 2.2
const HALO_SCALE = 1.9
const unitPlane = new THREE.PlaneGeometry(1, 1)
const shellGeo = new THREE.SphereGeometry(ORB_R, 24, 16)
const iconGeo = new THREE.PlaneGeometry(0.5, 0.5)

function makeIconMaterial(map) {
  return new THREE.MeshBasicMaterial({
    map,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
}

function makeSlot(look) {
  const group = new THREE.Group()
  group.visible = false

  const shell = new THREE.Mesh(shellGeo, look.orb)
  group.add(shell)

  const halo = new THREE.Mesh(unitPlane, look.halo)
  halo.scale.setScalar(HALO_SCALE)
  halo.renderOrder = 7
  group.add(halo)

  const icon = new THREE.Mesh(iconGeo, look.icon)
  icon.renderOrder = 8
  group.add(icon)

  return {
    active: false,
    type: 'damper',
    x: 0,
    y: 0,
    z: 0,
    r: ORB_R,
    seed: 0,
    group,
    shell,
    halo,
    icon,
  }
}

export function createPowerups(scene) {
  const root = new THREE.Group()
  root.name = 'powerups'
  scene.add(root)

  const materials = {
    damper: {
      orb: makeOrbMaterial(THEME.gold),
      halo: makeHaloMaterial(THEME.gold),
      icon: makeIconMaterial(chevronMap()),
    },
    life: {
      orb: makeOrbMaterial(THEME.green),
      halo: makeHaloMaterial(THEME.green),
      icon: makeIconMaterial(plusMap()),
    },
  }

  const pool = []
  for (let i = 0; i < POOL; i++) {
    const slot = makeSlot(materials.damper)
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
    const look = materials[type] || materials.damper
    orb.type = type
    orb.shell.material = look.orb
    orb.halo.material = look.halo
    orb.icon.material = look.icon
  }

  function spawn(z, type = 'damper', spread = ORB_SPREAD) {
    const orb = pool.find((o) => !o.active)
    if (!orb) return
    const ang = Math.random() * Math.PI * 2
    const r = Math.sqrt(Math.random()) * spread
    orb.x = Math.cos(ang) * r
    orb.y = Math.sin(ang) * r
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
    const t = SHARED.uTime.value
    for (const orb of pool) {
      if (!orb.active) continue
      orb.z += dz
      if (orb.z > 14) {
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

  function collect(pos, radius, out) {
    out.length = 0
    for (const orb of pool) {
      if (!orb.active) continue
      if (hitOrb(pos, radius, orb)) {
        deactivate(orb)
        out.push(orb)
      }
    }
    return out.length
  }

  function cullBehind(zLimit) {
    for (const orb of pool) {
      if (orb.active && orb.z > zLimit) deactivate(orb)
    }
  }

  return {
    reset,
    spawn,
    scroll,
    collect,
    cullBehind,
  }
}

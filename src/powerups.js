import * as THREE from 'three'
import { SHARED, THEME, makeOrbMaterial, makeHaloMaterial, chevronMap } from './theme.js'
import { hitOrb } from './collision.js'

const POOL = 6
const ORB_R = 0.42
const ORB_SPREAD = 2.2
const HALO_SCALE = 1.9
const unitPlane = new THREE.PlaneGeometry(1, 1)
const shellGeo = new THREE.SphereGeometry(ORB_R, 24, 16)
const chevronGeo = new THREE.PlaneGeometry(0.5, 0.5)

function makeSlot(materials) {
  const group = new THREE.Group()
  group.visible = false

  const shell = new THREE.Mesh(shellGeo, materials.orb)
  group.add(shell)

  const halo = new THREE.Mesh(unitPlane, materials.halo)
  halo.scale.setScalar(HALO_SCALE)
  halo.renderOrder = 7
  group.add(halo)

  const chevron = new THREE.Mesh(chevronGeo, materials.chevron)
  chevron.renderOrder = 8
  group.add(chevron)

  return {
    active: false,
    x: 0,
    y: 0,
    z: 0,
    r: ORB_R,
    seed: 0,
    group,
    shell,
    halo,
    chevron,
  }
}

export function createPowerups(scene) {
  const root = new THREE.Group()
  root.name = 'powerups'
  scene.add(root)

  const materials = {
    orb: makeOrbMaterial(THEME.gold),
    halo: makeHaloMaterial(THEME.gold),
    chevron: new THREE.MeshBasicMaterial({
      map: chevronMap(),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  }

  const pool = []
  for (let i = 0; i < POOL; i++) {
    const slot = makeSlot(materials)
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

  function spawn(z) {
    const orb = pool.find((o) => !o.active)
    if (!orb) return
    const ang = Math.random() * Math.PI * 2
    const r = Math.sqrt(Math.random()) * ORB_SPREAD
    orb.x = Math.cos(ang) * r
    orb.y = Math.sin(ang) * r
    orb.z = z
    orb.seed = Math.random() * Math.PI * 2
    orb.active = true
    orb.group.visible = true
    orb.group.position.set(orb.x, orb.y, orb.z)
    orb.group.scale.setScalar(1)
    orb.chevron.rotation.y = 0
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
      orb.chevron.rotation.y += dt * 3.2
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

  return {
    reset,
    spawn,
    scroll,
    collect,
  }
}

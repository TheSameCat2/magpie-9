import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { R, SEG_LEN, SEG_COUNT, VERTEX_R } from './theme.js'

const SIDE = 2 * R * Math.tan(Math.PI / 6)
const THICK = 0.2
const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _p = new THREE.Vector3()
const _s = new THREE.Vector3(1, 1, 1)
const _axis = new THREE.Vector3(0, 0, 1)

function placed(geo, x, y, z, rotZ) {
  const g = geo.clone()
  _q.setFromAxisAngle(_axis, rotZ)
  _p.set(x, y, z)
  _m.compose(_p, _q, _s)
  g.applyMatrix4(_m)
  return g
}

// Six copies of `geo` around the hex, one per face (offset 30deg) or vertex.
function hexRing(geo, radius, z, atVertices) {
  const parts = []
  for (let i = 0; i < 6; i++) {
    const theta = i * (Math.PI / 3) + (atVertices ? 0 : Math.PI / 6)
    parts.push(placed(geo, Math.cos(theta) * radius, Math.sin(theta) * radius, z, theta - Math.PI / 2))
  }
  const merged = mergeGeometries(parts)
  for (const p of parts) p.dispose()
  return merged
}

let plateGeo
let ribGeo
let stripGeo
let gantryGeo

function makeSegment(materials, index) {
  const group = new THREE.Group()

  if (!plateGeo) {
    const box = new THREE.BoxGeometry(SIDE, THICK, SEG_LEN)
    plateGeo = hexRing(box, R + THICK * 0.5, 0, false)
    box.dispose()

    const rib = new THREE.BoxGeometry(SIDE * 0.97, 0.08, 0.08)
    ribGeo = hexRing(rib, R - 0.05, SEG_LEN * 0.5 - 0.05, false)
    rib.dispose()

    const strip = new THREE.BoxGeometry(0.055, 0.055, SEG_LEN)
    stripGeo = hexRing(strip, VERTEX_R - 0.09, 0, true)
    strip.dispose()

    const gantry = new THREE.BoxGeometry(SIDE * 0.9, 0.3, 0.34)
    gantryGeo = hexRing(gantry, R - 0.14, SEG_LEN * 0.5 - 0.3, false)
    gantry.dispose()
  }

  group.add(new THREE.Mesh(plateGeo, materials.metal))
  group.add(new THREE.Mesh(ribGeo, index % 2 === 0 ? materials.ribIce : materials.ribSodium))
  group.add(new THREE.Mesh(stripGeo, materials.stripIce))

  const gantry = new THREE.Mesh(gantryGeo, materials.metalHi)
  gantry.visible = index % 2 === 0
  gantry.name = 'gantry'
  group.add(gantry)

  const cable = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, SEG_LEN * 0.85), materials.metalHi)
  const cableTheta = (index % 6) * (Math.PI / 3) + Math.PI / 6
  cable.position.set(Math.cos(cableTheta) * (R - 0.12), Math.sin(cableTheta) * (R - 0.12), 0)
  cable.visible = index % 3 !== 0
  cable.name = 'cable'
  group.add(cable)

  const panel = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 0.06), materials.plate)
  const pTheta = ((index + 2) % 6) * (Math.PI / 3) + Math.PI / 6
  panel.position.set(Math.cos(pTheta) * (R - 0.08), Math.sin(pTheta) * (R - 0.08), index % 2 === 0 ? -1.5 : 1.2)
  panel.lookAt(0, 0, panel.position.z)
  panel.visible = index % 2 === 0
  panel.name = 'panel'
  group.add(panel)

  return group
}

export function createTunnel(scene, materials) {
  const root = new THREE.Group()
  root.name = 'tunnel'
  const segments = []
  const poolLen = SEG_LEN * SEG_COUNT

  for (let i = 0; i < SEG_COUNT; i++) {
    const seg = makeSegment(materials, i)
    seg.position.z = 10 - i * SEG_LEN
    root.add(seg)
    segments.push(seg)
  }

  scene.add(root)

  function layout() {
    for (let i = 0; i < SEG_COUNT; i++) {
      segments[i].position.z = 10 - i * SEG_LEN
    }
  }

  function scroll(dz) {
    for (const seg of segments) {
      seg.position.z += dz
      if (seg.position.z > 12) {
        seg.position.z -= poolLen
        const cable = seg.getObjectByName('cable')
        const panel = seg.getObjectByName('panel')
        const gantry = seg.getObjectByName('gantry')
        if (cable) cable.visible = Math.random() > 0.35
        if (gantry) gantry.visible = Math.random() > 0.5
        if (panel) {
          panel.visible = Math.random() > 0.45
          panel.position.z = (Math.random() - 0.5) * 4
        }
      } else if (seg.position.z <= 12 - poolLen) {
        seg.position.z += poolLen
      }
    }
  }

  return {
    root,
    scroll,
    reset: layout,
    get vertexR() {
      return VERTEX_R
    },
  }
}

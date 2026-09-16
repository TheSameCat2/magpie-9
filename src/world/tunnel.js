import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { SEGMENT_COUNT, SEGMENT_LENGTH, TUNNEL_APOTHEM, TUNNEL_VERTEX_RADIUS } from '../config/world.js'

const WALL_WIDTH = 2 * TUNNEL_APOTHEM * Math.tan(Math.PI / 6)
const WALL_THICKNESS = 0.2
/** Z of the segment nearest the camera at rest. */
const HEAD_Z = 10
/** A segment past this Z is behind the camera and wraps to the back of the pool. */
const WRAP_Z = 12
const POOL_LENGTH = SEGMENT_LENGTH * SEGMENT_COUNT

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

/** Six copies of `geo` around the hex, one per face (offset 30°) or per vertex. */
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

/** Merged ring geometry from a box, disposing the source. */
function ringOf(w, h, d, radius, z, atVertices = false) {
  const box = new THREE.BoxGeometry(w, h, d)
  const ring = hexRing(box, radius, z, atVertices)
  box.dispose()
  return ring
}

let sharedGeometry = null

/** Geometry every segment shares: plates, rib, vertex strips, gantry. Built once. */
function segmentGeometry() {
  if (!sharedGeometry) {
    sharedGeometry = {
      plate: ringOf(WALL_WIDTH, WALL_THICKNESS, SEGMENT_LENGTH, TUNNEL_APOTHEM + WALL_THICKNESS * 0.5, 0),
      rib: ringOf(WALL_WIDTH * 0.97, 0.08, 0.08, TUNNEL_APOTHEM - 0.05, SEGMENT_LENGTH * 0.5 - 0.05),
      strip: ringOf(0.055, 0.055, SEGMENT_LENGTH, TUNNEL_VERTEX_RADIUS - 0.09, 0, true),
      gantry: ringOf(WALL_WIDTH * 0.9, 0.3, 0.34, TUNNEL_APOTHEM - 0.14, SEGMENT_LENGTH * 0.5 - 0.3),
    }
  }
  return sharedGeometry
}

/** Angle of hex face `i`. */
function faceAngle(i) {
  return (i % 6) * (Math.PI / 3) + Math.PI / 6
}

function createSegment(materials, index) {
  const geo = segmentGeometry()
  const group = new THREE.Group()
  const even = index % 2 === 0

  group.add(new THREE.Mesh(geo.plate, materials.metal))
  group.add(new THREE.Mesh(geo.rib, even ? materials.ribIce : materials.ribSodium))
  group.add(new THREE.Mesh(geo.strip, materials.stripIce))

  // Detail props are toggled at random on each recycle so the loop never reads as a loop.
  const gantry = new THREE.Mesh(geo.gantry, materials.metalHi)
  gantry.visible = even
  group.add(gantry)

  const cable = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, SEGMENT_LENGTH * 0.85), materials.metalHi)
  const cableTheta = faceAngle(index)
  cable.position.set(
    Math.cos(cableTheta) * (TUNNEL_APOTHEM - 0.12),
    Math.sin(cableTheta) * (TUNNEL_APOTHEM - 0.12),
    0,
  )
  cable.visible = index % 3 !== 0
  group.add(cable)

  const panel = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 0.06), materials.plate)
  const panelTheta = faceAngle(index + 2)
  panel.position.set(
    Math.cos(panelTheta) * (TUNNEL_APOTHEM - 0.08),
    Math.sin(panelTheta) * (TUNNEL_APOTHEM - 0.08),
    even ? -1.5 : 1.2,
  )
  panel.lookAt(0, 0, panel.position.z)
  panel.visible = even
  group.add(panel)

  return { group, gantry, cable, panel }
}

/** Randomise the detail props when a segment wraps to the back. */
function rerollDetails(segment) {
  segment.cable.visible = Math.random() > 0.35
  segment.gantry.visible = Math.random() > 0.5
  segment.panel.visible = Math.random() > 0.45
  segment.panel.position.z = (Math.random() - 0.5) * 4
}

export function createTunnel(scene, materials) {
  const root = new THREE.Group()
  root.name = 'tunnel'
  const segments = []

  for (let i = 0; i < SEGMENT_COUNT; i++) {
    const segment = createSegment(materials, i)
    root.add(segment.group)
    segments.push(segment)
  }
  scene.add(root)

  function reset() {
    segments.forEach((segment, i) => {
      segment.group.position.z = HEAD_Z - i * SEGMENT_LENGTH
    })
  }

  function scroll(dz) {
    for (const segment of segments) {
      const p = segment.group.position
      p.z += dz
      if (p.z > WRAP_Z) {
        p.z -= POOL_LENGTH
        rerollDetails(segment)
      } else if (p.z <= WRAP_Z - POOL_LENGTH) {
        // Rewinding (spare life) can pull a segment off the far end; bring it round to the front.
        p.z += POOL_LENGTH
      }
    }
  }

  reset()

  return { root, scroll, reset }
}

import * as THREE from 'three'
import { TUNNEL_VERTEX_RADIUS } from '../../config/world.js'
import { HOLE_H, HOLE_W } from './layout.js'

export const PLATE_DEPTH = 0.3

export const unitPlane = new THREE.PlaneGeometry(1, 1)
export const unitBox = new THREE.BoxGeometry(1, 1, 1)
export const unitCylinder = new THREE.CylinderGeometry(0.5, 0.5, 1, 10, 1)

const HALF_DEPTH = PLATE_DEPTH * 0.5

// Outer hex vertices H0..H5 (counter-clockwise starting at +X)
const HEX_X = new Float32Array(6)
const HEX_Y = new Float32Array(6)
for (let i = 0; i < 6; i++) {
  const a = i * (Math.PI / 3)
  HEX_X[i] = Math.cos(a) * TUNNEL_VERTEX_RADIUS
  HEX_Y[i] = Math.sin(a) * TUNNEL_VERTEX_RADIUS
}

// Star-convex 10-triangle sector partition of hex minus inner hole rectangle.
// Positive indices 0..5 reference outer hex vertices H0..H5;
// negative indices -1..-4 reference inner hole corners C0..C3:
//   C0 (-1): (ox + halfW, oy - halfH)
//   C1 (-2): (ox + halfW, oy + halfH)
//   C2 (-3): (ox - halfW, oy + halfH)
//   C3 (-4): (ox - halfW, oy - halfH)
const FACE_TRIS = [
  [-1, 5, 0],
  [-1, 0, -2],
  [-2, 0, 1],
  [-2, 1, 2],
  [-2, 2, -3],
  [-3, 2, 3],
  [-3, 3, -4],
  [-4, 3, 4],
  [-4, 4, 5],
  [-4, 5, -1],
]

// 4 inner hole wall segments [cornerA, cornerB, nx, ny, uvUsesY]
const HOLE_WALLS = [
  [2, 1, 0, -1, 0], // top inner wall (y = y1, normal -Y)
  [1, 0, -1, 0, 1], // right inner wall (x = x1, normal -X)
  [0, 3, 0, 1, 0], // bottom inner wall (y = y0, normal +Y)
  [3, 2, 1, 0, 1], // left inner wall (x = x0, normal +X)
]

// Pre-build static template arrays (120 vertices: 30 front, 30 back, 36 outer walls, 24 inner walls)
// and record the 52 dynamic hole-corner vertex slots for zero-allocation in-place updates.
const VERT_COUNT = 120
const TEMPLATE_POS = new Float32Array(VERT_COUNT * 3)
const TEMPLATE_NORM = new Float32Array(VERT_COUNT * 3)
const TEMPLATE_UV = new Float32Array(VERT_COUNT * 2)

// Dynamic vertex table: [vertexIndex, cornerIndex (0..3), uvMode (0=xy, 1=xOnly, 2=yOnly)]
const DYNAMIC_VERTS = new Uint8Array(52 * 3)
let dynCount = 0

function initTemplate() {
  let v = 0
  function emitVertex(x, y, z, nx, ny, nz, u, uvV, corner = -1, uvMode = 0) {
    const i3 = v * 3
    const i2 = v * 2
    TEMPLATE_POS[i3] = x
    TEMPLATE_POS[i3 + 1] = y
    TEMPLATE_POS[i3 + 2] = z
    TEMPLATE_NORM[i3] = nx
    TEMPLATE_NORM[i3 + 1] = ny
    TEMPLATE_NORM[i3 + 2] = nz
    TEMPLATE_UV[i2] = u
    TEMPLATE_UV[i2 + 1] = uvV
    if (corner >= 0) {
      const d3 = dynCount * 3
      DYNAMIC_VERTS[d3] = v
      DYNAMIC_VERTS[d3 + 1] = corner
      DYNAMIC_VERTS[d3 + 2] = uvMode
      dynCount += 1
    }
    v += 1
  }

  function emitFaceNode(id, z, nz) {
    if (id >= 0) {
      const x = HEX_X[id]
      const y = HEX_Y[id]
      emitVertex(x, y, z, 0, 0, nz, x, y, -1, 0)
    } else {
      const corner = -id - 1
      emitVertex(0, 0, z, 0, 0, nz, 0, 0, corner, 0)
    }
  }

  // 1. Front face (z = -HALF_DEPTH, normal -Z, reversed winding)
  for (let i = 0; i < FACE_TRIS.length; i++) {
    const [a, b, c] = FACE_TRIS[i]
    emitFaceNode(a, -HALF_DEPTH, -1)
    emitFaceNode(c, -HALF_DEPTH, -1)
    emitFaceNode(b, -HALF_DEPTH, -1)
  }

  // 2. Back face (z = +HALF_DEPTH, normal +Z, CCW winding)
  for (let i = 0; i < FACE_TRIS.length; i++) {
    const [a, b, c] = FACE_TRIS[i]
    emitFaceNode(a, HALF_DEPTH, 1)
    emitFaceNode(b, HALF_DEPTH, 1)
    emitFaceNode(c, HALF_DEPTH, 1)
  }

  // 3. Outer 6 hex walls (100% static)
  for (let i = 0; i < 6; i++) {
    const j = (i + 1) % 6
    const ax = HEX_X[i]
    const ay = HEX_Y[i]
    const bx = HEX_X[j]
    const by = HEX_Y[j]
    const dx = bx - ax
    const dy = by - ay
    const len = Math.hypot(dx, dy)
    const nx = dy / len
    const ny = -dx / len
    const horiz = Math.abs(ay - by) < 0.01
    const ua = horiz ? ax : ay
    const ub = horiz ? bx : by
    emitVertex(ax, ay, -HALF_DEPTH, nx, ny, 0, ua, 1, -1, 0)
    emitVertex(bx, by, -HALF_DEPTH, nx, ny, 0, ub, 1, -1, 0)
    emitVertex(ax, ay, HALF_DEPTH, nx, ny, 0, ua, 1 + PLATE_DEPTH, -1, 0)
    emitVertex(bx, by, -HALF_DEPTH, nx, ny, 0, ub, 1, -1, 0)
    emitVertex(bx, by, HALF_DEPTH, nx, ny, 0, ub, 1 + PLATE_DEPTH, -1, 0)
    emitVertex(ax, ay, HALF_DEPTH, nx, ny, 0, ua, 1 + PLATE_DEPTH, -1, 0)
  }

  // 4. Inner 4 hole walls (positions and UVs move with the hole corners; normals are static)
  for (let i = 0; i < HOLE_WALLS.length; i++) {
    const [ca, cb, nx, ny, uvUsesY] = HOLE_WALLS[i]
    const uvMode = uvUsesY ? 2 : 1
    emitVertex(0, 0, -HALF_DEPTH, nx, ny, 0, 0, 1, ca, uvMode)
    emitVertex(0, 0, -HALF_DEPTH, nx, ny, 0, 0, 1, cb, uvMode)
    emitVertex(0, 0, HALF_DEPTH, nx, ny, 0, 0, 1 + PLATE_DEPTH, ca, uvMode)
    emitVertex(0, 0, -HALF_DEPTH, nx, ny, 0, 0, 1, cb, uvMode)
    emitVertex(0, 0, HALF_DEPTH, nx, ny, 0, 0, 1 + PLATE_DEPTH, cb, uvMode)
    emitVertex(0, 0, HALF_DEPTH, nx, ny, 0, 0, 1 + PLATE_DEPTH, ca, uvMode)
  }
}

initTemplate()

const _cx = new Float32Array(4)
const _cy = new Float32Array(4)

/** Update an existing bulkhead BufferGeometry's inner hole in-place without allocating. */
export function updateBulkheadGeometry(geometry, ox, oy, halfW = HOLE_W * 0.5, halfH = HOLE_H * 0.5) {
  const x0 = ox - halfW
  const x1 = ox + halfW
  const y0 = oy - halfH
  const y1 = oy + halfH
  _cx[0] = x1
  _cy[0] = y0
  _cx[1] = x1
  _cy[1] = y1
  _cx[2] = x0
  _cy[2] = y1
  _cx[3] = x0
  _cy[3] = y0

  const posAttr = geometry.attributes.position
  const uvAttr = geometry.attributes.uv
  const pos = posAttr.array
  const uv = uvAttr.array

  for (let i = 0; i < DYNAMIC_VERTS.length; i += 3) {
    const v = DYNAMIC_VERTS[i]
    const c = DYNAMIC_VERTS[i + 1]
    const uvMode = DYNAMIC_VERTS[i + 2]
    const x = _cx[c]
    const y = _cy[c]
    const i3 = v * 3
    const i2 = v * 2
    pos[i3] = x
    pos[i3 + 1] = y
    if (uvMode === 0) {
      uv[i2] = x
      uv[i2 + 1] = y
    } else if (uvMode === 1) {
      uv[i2] = x
    } else {
      uv[i2] = y
    }
  }

  posAttr.needsUpdate = true
  uvAttr.needsUpdate = true
  return geometry
}

/** Hex plate filling the conduit with a rectangular hatch cut at (ox, oy). */
export function createBulkheadGeometry(ox = 0, oy = 0, halfW = HOLE_W * 0.5, halfH = HOLE_H * 0.5) {
  const geometry = new THREE.BufferGeometry()
  const posAttr = new THREE.BufferAttribute(new Float32Array(TEMPLATE_POS), 3)
  const normAttr = new THREE.BufferAttribute(new Float32Array(TEMPLATE_NORM), 3)
  const uvAttr = new THREE.BufferAttribute(new Float32Array(TEMPLATE_UV), 2)
  posAttr.setUsage(THREE.DynamicDrawUsage)
  uvAttr.setUsage(THREE.DynamicDrawUsage)
  geometry.setAttribute('position', posAttr)
  geometry.setAttribute('normal', normAttr)
  geometry.setAttribute('uv', uvAttr)
  return updateBulkheadGeometry(geometry, ox, oy, halfW, halfH)
}

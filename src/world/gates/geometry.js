import * as THREE from 'three'
import { TUNNEL_VERTEX_RADIUS } from '../../config/world.js'
import { HOLE_H, HOLE_W } from './layout.js'

export const PLATE_DEPTH = 0.3

export const unitPlane = new THREE.PlaneGeometry(1, 1)
export const unitBox = new THREE.BoxGeometry(1, 1, 1)

function hexShape() {
  const shape = new THREE.Shape()
  for (let i = 0; i < 6; i++) {
    const a = i * (Math.PI / 3)
    const x = Math.cos(a) * TUNNEL_VERTEX_RADIUS
    const y = Math.sin(a) * TUNNEL_VERTEX_RADIUS
    if (i === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  }
  shape.closePath()
  return shape
}

/** Hex plate filling the conduit with a rectangular hatch cut at (ox, oy). */
export function createBulkheadGeometry(ox, oy, halfW = HOLE_W * 0.5, halfH = HOLE_H * 0.5) {
  const shape = hexShape()
  const hole = new THREE.Path()
  hole.moveTo(ox - halfW, oy - halfH)
  hole.lineTo(ox - halfW, oy + halfH)
  hole.lineTo(ox + halfW, oy + halfH)
  hole.lineTo(ox + halfW, oy - halfH)
  hole.closePath()
  shape.holes.push(hole)
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: PLATE_DEPTH,
    bevelEnabled: false,
    curveSegments: 1,
  })
  geometry.translate(0, 0, -PLATE_DEPTH * 0.5)
  return geometry
}

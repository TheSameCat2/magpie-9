// World-space dimensions shared by geometry, collision, and the camera.
// Axes: +X right, +Y up, +Z toward the camera. The bird sits at the origin
// and the conduit scrolls toward +Z. See PLAN.md "Coordinates".

/** Inner apothem of the hexagonal conduit (centre to the middle of a wall). */
export const TUNNEL_APOTHEM = 4.2
/** Centre to a hex vertex. */
export const TUNNEL_VERTEX_RADIUS = TUNNEL_APOTHEM / Math.cos(Math.PI / 6)
export const SEGMENT_LENGTH = 10
export const SEGMENT_COUNT = 8

export const FOG_DENSITY = 0.03

// Hull box in mesh-local units. World hit extents are half these after scale.
export const BIRD_VISUAL_SCALE = 1.35
export const BIRD_BODY_W = 0.42
export const BIRD_BODY_H = 0.3
export const BIRD_BODY_D = 0.74
/** Half-extents of the bird's axis-aligned hit box in world units. */
export const BIRD_HIT = {
  x: (BIRD_BODY_W * BIRD_VISUAL_SCALE) / 2,
  y: (BIRD_BODY_H * BIRD_VISUAL_SCALE) / 2,
  z: (BIRD_BODY_D * BIRD_VISUAL_SCALE) / 2,
}

export const CAMERA = {
  fov: 68,
  near: 0.1,
  far: 180,
  /** Rest position; the rig damps X/Y toward the bird from here. */
  rest: { x: 0, y: 0.55, z: 6.4 },
}

/** Objects past this Z are behind the camera and can be recycled. */
export const RECYCLE_Z = 14

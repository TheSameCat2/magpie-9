import * as THREE from 'three'
import { clamp01 } from '../lib/math.js'
import { bendMaterial } from '../render/bend.js'

// Procedural rig for the generated cyberpunk magpie (public/models/cyber-magpie.glb).
// The GLB arrives as one static, unrigged mesh posed nose-up with the beak at
// +Z. This module normalises it into bird-local space (beak -Z, tail +Z, wings
// on X, centred, scaled to MAGPIE_SPAN) and skins it to a small skeleton that
// mirrors the procedural bird's shoulder/elbow/wrist/tail articulation, so
// world/bird.js can drive both birds with the same animation numbers.

// Landmarks measured on the source GLB: beak tip and tail tip in model space.
const SRC_BEAK = new THREE.Vector3(0, 0.35, 0.8)
const SRC_TAIL = new THREE.Vector3(0, -0.52, -0.72)
/** Wingspan in bird-local units after normalisation (the bird group scales it). */
export const MAGPIE_SPAN = 1.68
/** The generated pose is long in the body axis; squash it to game proportions. */
export const MAGPIE_Z_SQUASH = 0.62

/** Bone indices in the skin attributes, in skeleton order. */
export const MAGPIE_BONES = ['root', 'tail', 'shoulderL', 'elbowL', 'wristL', 'shoulderR', 'elbowR', 'wristR']
const BONE_INDEX = Object.fromEntries(MAGPIE_BONES.map((name, i) => [name, i]))

function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

/**
 * Skin weights for one vertex in normalised bird-local space.
 * Wings blend shoulder -> elbow -> wrist as |x| grows (and fade out over the
 * tail fan), the tail fan blends to the tail bone, everything else is root.
 * @param {number} x @param {number} y @param {number} z
 * @returns {{ indices: number[], weights: number[] }} four influences, weights sum to 1
 */
export function skinWeightsAt(x, y, z) {
  void y
  const ax = Math.abs(x)
  const side = x < 0 ? 'L' : 'R'

  let wing = smoothstep(0.12, 0.2, ax) * (1 - smoothstep(0.18, 0.32, z))
  const tail = smoothstep(0.22, 0.4, z) * (1 - wing)
  const root = Math.max(0, 1 - wing - tail)

  // Spanwise split of the wing influence across the three joints.
  const shoulderShare = 1 - smoothstep(0.34, 0.44, ax)
  const wristShare = smoothstep(0.54, 0.64, ax)
  const elbowShare = Math.max(0, 1 - shoulderShare - wristShare)

  /** @type {Map<number, number>} */
  const byBone = new Map()
  const add = (name, w) => {
    if (w > 0) byBone.set(BONE_INDEX[name], (byBone.get(BONE_INDEX[name]) ?? 0) + w)
  }
  add('root', root)
  add('tail', tail)
  if (wing > 0) {
    add(`shoulder${side}`, wing * shoulderShare)
    add(`elbow${side}`, wing * elbowShare)
    add(`wrist${side}`, wing * wristShare)
  }

  const sorted = [...byBone.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
  const total = sorted.reduce((sum, [, w]) => sum + w, 0) || 1
  const indices = [0, 0, 0, 0]
  const weights = [0, 0, 0, 0]
  sorted.forEach(([bone, w], i) => {
    indices[i] = bone
    weights[i] = w / total
  })
  return { indices, weights }
}

/**
 * Reorient (beak to -Z), centre, and scale a cloned GLB geometry in place.
 * @param {THREE.BufferGeometry} geometry
 * @param {number} [targetSpan]
 * @returns {THREE.BufferGeometry} the same geometry, for chaining
 */
export function normalizeMagpieGeometry(geometry, targetSpan = MAGPIE_SPAN) {
  // No-roll alignment: build the source body basis (right / up / back from
  // the tail->beak axis against world up) and rotate by its inverse, so the
  // wings end up level instead of rolled by a shortest-arc quaternion.
  const back = SRC_TAIL.clone().sub(SRC_BEAK).normalize()
  const right = new THREE.Vector3(0, 1, 0).cross(back).normalize()
  const up = back.clone().cross(right).normalize()
  const sourceBasis = new THREE.Matrix4().makeBasis(right, up, back)
  const quat = new THREE.Quaternion().setFromRotationMatrix(sourceBasis).invert()
  geometry.applyQuaternion(quat)
  geometry.computeBoundingBox()
  const box = geometry.boundingBox
  if (!box) return geometry
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const scale = size.x > 0 ? targetSpan / size.x : 1
  // applyMatrix4 (not scale) so normals get the inverse-transpose treatment.
  const fit = new THREE.Matrix4().makeScale(scale, scale, scale * MAGPIE_Z_SQUASH)
  fit.setPosition(-center.x * scale, -center.y * scale, -center.z * scale * MAGPIE_Z_SQUASH)
  geometry.applyMatrix4(fit)
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}

/**
 * Build the skinned magpie from a normalised geometry and its GLB material.
 * @param {THREE.BufferGeometry} geometry normalised by normalizeMagpieGeometry
 * @param {THREE.Material} material
 */
export function createMagpieRig(geometry, material) {
  const position = geometry.getAttribute('position')
  const count = position.count
  const skinIndices = new Uint16Array(count * 4)
  const skinWeights = new Float32Array(count * 4)
  for (let i = 0; i < count; i++) {
    const { indices, weights } = skinWeightsAt(position.getX(i), position.getY(i), position.getZ(i))
    skinIndices.set(indices, i * 4)
    skinWeights.set(weights, i * 4)
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4))
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4))

  const bone = (name, parent, x, y, z) => {
    const b = new THREE.Bone()
    b.name = name
    b.position.set(x, y, z)
    if (parent) parent.add(b)
    return b
  }
  const root = bone('root', null, 0, 0, 0.15)
  const tail = bone('tail', root, 0, 0, 0.18)
  const shoulderL = bone('shoulderL', root, -0.12, 0.03, -0.18)
  const elbowL = bone('elbowL', shoulderL, -0.26, 0, 0.02)
  const wristL = bone('wristL', elbowL, -0.2, 0, 0.02)
  const shoulderR = bone('shoulderR', root, 0.12, 0.03, -0.18)
  const elbowR = bone('elbowR', shoulderR, 0.26, 0, 0.02)
  const wristR = bone('wristR', elbowR, 0.2, 0, 0.02)

  const tipL = new THREE.Object3D()
  tipL.name = 'tipL'
  tipL.position.set(-0.2, 0, 0)
  wristL.add(tipL)
  const tipR = new THREE.Object3D()
  tipR.name = 'tipR'
  tipR.position.set(0.2, 0, 0)
  wristR.add(tipR)

  const bones = [root, tail, shoulderL, elbowL, wristL, shoulderR, elbowR, wristR]
  const mesh = new THREE.SkinnedMesh(geometry, material)
  mesh.name = 'cyber-magpie'
  mesh.castShadow = false
  mesh.receiveShadow = false
  mesh.frustumCulled = false
  mesh.add(root)
  mesh.updateMatrixWorld(true)
  mesh.bind(new THREE.Skeleton(bones), mesh.matrixWorld)

  return { mesh, root, tail, shoulderL, elbowL, wristL, shoulderR, elbowR, wristR, tipL, tipR }
}

/**
 * Prepare a loaded GLTF as a rigged magpie, or null when it has no mesh.
 * The material is relit like the orb heroes (powerups.js) so the neon texture
 * reads in the dark conduit, and bent with the world.
 * @param {{ scene: THREE.Object3D }} gltf
 */
export function prepareMagpieTemplate(gltf) {
  /** @type {THREE.Mesh | null} */
  let source = null
  gltf.scene.traverse((o) => {
    if (!source && /** @type {THREE.Mesh} */ (o).isMesh) source = /** @type {THREE.Mesh} */ (o)
  })
  if (!source) return null
  const mesh = /** @type {THREE.Mesh} */ (source)
  const rawMaterial = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
  if (!rawMaterial) return null
  const material = rawMaterial.clone()
  if (/** @type {THREE.MeshStandardMaterial} */ (material).isMeshStandardMaterial) {
    const standard = /** @type {THREE.MeshStandardMaterial} */ (material)
    standard.metalness = 0.35
    standard.roughness = 0.45
    // Self-lit from its own texture so the neon circuits read before the
    // headlamp reaches the bird; kept low so the chrome still shades.
    if (standard.map) {
      standard.emissiveMap = standard.map
      standard.emissive = new THREE.Color(0xffffff)
      standard.emissiveIntensity = 0.55
    }
    bendMaterial(standard)
  }
  const geometry = normalizeMagpieGeometry(mesh.geometry.clone())
  return createMagpieRig(geometry, material)
}

import * as THREE from 'three'

// Instanced drawing for pooled props that share a geometry and a material
// (tunnel plates, gate clamps and rims). The pools keep placing plain
// Object3D stand-ins exactly as they used to place meshes: position, scale,
// visible, and the hand-written matrixWorld updates. Right before the scene
// renders, each batch packs the matrixWorld of its visible stand-ins into one
// InstancedMesh, so a pool of N props costs one draw instead of N.
//
// The instanced mesh itself sits at the identity, so the instance matrix is
// the stand-in's whole world matrix and the bend shaders (bend.js BEND_MODEL)
// see the same model transform a plain mesh would have had.

/** @type {WeakMap<THREE.Material, THREE.Material>} */
const instancedCopies = new WeakMap()

/**
 * The material an instanced batch draws with. Built-in materials are copied
 * once per source: three keeps separate programs for instanced and plain
 * meshes and re-resolves the program every time one material alternates
 * between them, so a material shared with plain meshes (the bird's metal,
 * the bulkhead plates) gets an instanced twin. The copy keeps the source's
 * shader hooks, so it bends the same way. Shader materials are returned as
 * they are, because cloning would detach their shared uniforms (UNIFORMS);
 * keep a shader material on instanced batches only.
 *
 * @param {THREE.Material} material
 * @returns {THREE.Material}
 */
export function instancedMaterial(material) {
  if (/** @type {THREE.Material & { isShaderMaterial?: true }} */ (material).isShaderMaterial) return material
  let copy = instancedCopies.get(material)
  if (!copy) {
    copy = material.clone()
    copy.onBeforeCompile = material.onBeforeCompile
    copy.customProgramCacheKey = material.customProgramCacheKey
    instancedCopies.set(material, copy)
  }
  return copy
}

/** True when `object` and every ancestor are visible. */
function shown(object) {
  for (let o = object; o; o = o.parent) {
    if (!o.visible) return false
  }
  return true
}

/**
 * One geometry + material drawn as a single InstancedMesh.
 *
 * Call `add` for every stand-in the pool will ever need, then `attach` once
 * to build the mesh sized to them. `sync` runs every frame before render
 * (see `syncBeforeRender`).
 *
 * @param {THREE.BufferGeometry} geometry
 * @param {THREE.Material} material
 * @param {{ name?: string, renderOrder?: number }} [opts]
 */
export function createInstanceBatch(geometry, material, opts = {}) {
  /** @type {THREE.Object3D[]} */
  const standIns = []
  /** @type {THREE.InstancedMesh | null} */
  let mesh = null

  /**
   * A new stand-in, hidden until the pool shows it. Matrix updates are left
   * at three's defaults; the pool turns them off as it would for a mesh.
   */
  function add() {
    if (mesh) throw new Error(`instance batch ${opts.name ?? ''}: add every stand-in before attach`)
    const standIn = new THREE.Object3D()
    standIn.visible = false
    standIns.push(standIn)
    return standIn
  }

  /** Build the instanced mesh under `parent`, with room for every stand-in. */
  function attach(parent) {
    mesh = new THREE.InstancedMesh(geometry, instancedMaterial(material), Math.max(1, standIns.length))
    mesh.name = opts.name ?? ''
    mesh.renderOrder = opts.renderOrder ?? 0
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.count = 0
    mesh.visible = false
    // Culling reads straight-conduit bounds, which a bend moves the mesh away from.
    mesh.frustumCulled = false
    mesh.matrixAutoUpdate = false
    mesh.matrixWorldAutoUpdate = false
    parent.add(mesh)
    return mesh
  }

  /** Pack the visible stand-ins into the instance buffer. Returns how many drew. */
  function sync() {
    if (!mesh) return 0
    const out = mesh.instanceMatrix.array
    let n = 0
    for (let i = 0; i < standIns.length; i++) {
      const standIn = standIns[i]
      if (!shown(standIn)) continue
      out.set(standIn.matrixWorld.elements, n * 16)
      n += 1
    }
    mesh.count = n
    mesh.visible = n > 0
    if (n > 0) {
      const attr = mesh.instanceMatrix
      attr.clearUpdateRanges()
      attr.addUpdateRange(0, n * 16)
      attr.needsUpdate = true
    }
    return n
  }

  return {
    add,
    attach,
    sync,
    get mesh() {
      return mesh
    },
    get standIns() {
      return standIns
    },
  }
}

/**
 * Attach `batches` under `parent` and sync them every time `scene` renders.
 * The sync runs in the scene's onBeforeRender, after the game has placed
 * everything for the frame and before three builds its render list, so a
 * batch that ends up empty is skipped outright.
 *
 * @param {THREE.Scene} scene
 * @param {THREE.Object3D} parent
 * @param {Iterable<ReturnType<typeof createInstanceBatch>>} batches
 */
export function syncBeforeRender(scene, parent, batches) {
  /** @type {Array<ReturnType<typeof createInstanceBatch>>} */
  let list = scene.userData.instanceBatches
  if (!list) {
    list = []
    scene.userData.instanceBatches = list
    const previous = scene.onBeforeRender
    scene.onBeforeRender = function (renderer, s, camera, target) {
      previous.call(this, renderer, s, camera, target)
      for (let i = 0; i < list.length; i++) list[i].sync()
    }
  }
  for (const batch of batches) {
    batch.attach(parent)
    list.push(batch)
  }
}

import * as THREE from 'three'
import { THEME } from '../config/theme.js'
import { CAMERA, FOG_DENSITY } from '../config/world.js'
import { bendPoint } from '../lib/centreline.js'
import { UNIFORMS } from './uniforms.js'

/** Depth of the fixed ice shaft light ahead of the bird. */
const SHAFT_Z = -14

export function createRenderer() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(window.innerWidth, window.innerHeight, false)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.setClearColor(THEME.void, 1)
  renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault())
  return renderer
}

export function createCamera() {
  const camera = new THREE.PerspectiveCamera(
    CAMERA.fov,
    window.innerWidth / window.innerHeight,
    CAMERA.near,
    CAMERA.far,
  )
  camera.position.set(CAMERA.rest.x, CAMERA.rest.y, CAMERA.rest.z)
  return camera
}

/** Scene with fog, background, and the fixed lighting rig. The camera is added so lights can ride it. */
export function createScene(camera) {
  const scene = new THREE.Scene()
  scene.matrixAutoUpdate = false
  scene.fog = new THREE.FogExp2(THEME.void, FOG_DENSITY)
  scene.background = new THREE.Color(THEME.void)
  scene.add(camera)

  const hemi = new THREE.HemisphereLight(0xa8b4c8, 0x141820, 1.15)
  hemi.updateMatrix()
  hemi.updateMatrixWorld()
  hemi.matrixAutoUpdate = false
  hemi.matrixWorldAutoUpdate = false
  scene.add(hemi)

  const key = new THREE.DirectionalLight(0xffe0c0, 0.8)
  key.position.set(2.2, 3.4, 7)
  key.updateMatrix()
  key.updateMatrixWorld()
  key.matrixAutoUpdate = false
  key.matrixWorldAutoUpdate = false
  scene.add(key)

  // Sits well ahead of the lens so plates sweeping past the camera don't blow out.
  const headlamp = new THREE.PointLight(0xd7e4ff, 6, 32, 1.15)
  headlamp.position.set(0, 0.2, -2.8)
  headlamp.updateMatrix()
  headlamp.matrixAutoUpdate = false
  camera.add(headlamp)

  const shaft = new THREE.PointLight(THEME.ice, 2.2, 40, 1.5)
  shaft.position.set(0, 0, SHAFT_Z)
  shaft.updateMatrix()
  shaft.updateMatrixWorld()
  shaft.matrixAutoUpdate = false
  shaft.matrixWorldAutoUpdate = false
  scene.add(shaft)
  scene.userData.shaft = shaft

  scene.updateMatrixWorld = function (force) {
    if (force) {
      THREE.Scene.prototype.updateMatrixWorld.call(this, true)
      return
    }
    camera.updateMatrixWorld()
  }

  return scene
}

const _bent = { x: 0, y: 0, z: 0 }

/** Keep the fixed lights on the conduit centreline when it bends. */
export function placeLights(scene) {
  bendPoint(UNIFORMS.uBend.value, 0, 0, SHAFT_Z, _bent)
  const shaft = scene.userData.shaft
  const pos = shaft.position
  if (pos.x !== _bent.x || pos.y !== _bent.y || pos.z !== _bent.z) {
    pos.set(_bent.x, _bent.y, _bent.z)
    shaft.matrix.elements[12] = _bent.x
    shaft.matrix.elements[13] = _bent.y
    shaft.matrix.elements[14] = _bent.z
    shaft.matrixWorld.elements[12] = _bent.x
    shaft.matrixWorld.elements[13] = _bent.y
    shaft.matrixWorld.elements[14] = _bent.z
  }
}

import * as THREE from 'three'
import { THEME } from '../config/theme.js'
import { CAMERA, FOG_DENSITY } from '../config/world.js'

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
  scene.fog = new THREE.FogExp2(THEME.void, FOG_DENSITY)
  scene.background = new THREE.Color(THEME.void)
  scene.add(camera)

  scene.add(new THREE.HemisphereLight(0xa8b4c8, 0x141820, 1.15))

  const key = new THREE.DirectionalLight(0xffe0c0, 0.8)
  key.position.set(2.2, 3.4, 7)
  scene.add(key)

  // Sits well ahead of the lens so plates sweeping past the camera don't blow out.
  const headlamp = new THREE.PointLight(0xd7e4ff, 6, 32, 1.15)
  headlamp.position.set(0, 0.2, -2.8)
  camera.add(headlamp)

  const shaft = new THREE.PointLight(THEME.ice, 2.2, 40, 1.5)
  shaft.position.set(0, 0, -14)
  scene.add(shaft)

  return scene
}

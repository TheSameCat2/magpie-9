import * as THREE from 'three'
import { THEME, SHARED, createFog, createMaterials } from './theme.js'
import { createInput } from './input.js'
import { createBird } from './bird.js'
import { createTunnel } from './tunnel.js'
import { createObstacles } from './obstacles.js'
import { createPowerups } from './powerups.js'
import { createAudio } from './audio.js'
import { createFx } from './fx.js'
import { createPostFx, QUALITY } from './postfx.js'
import { createScreen } from './screen.js'
import { createGame } from './game.js'

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const coarse =
  window.matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints || 0) > 0
const params = new URLSearchParams(location.search)

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight, false)
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.05
renderer.setClearColor(THEME.void, 1)
document.body.appendChild(renderer.domElement)
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault())

const scene = new THREE.Scene()
scene.fog = createFog()
scene.background = new THREE.Color(THEME.void)

const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 180)
camera.position.set(0, 0.55, 6.4)
scene.add(camera)

const hemi = new THREE.HemisphereLight(0xa8b4c8, 0x141820, 1.15)
scene.add(hemi)

const key = new THREE.DirectionalLight(0xffe0c0, 0.8)
key.position.set(2.2, 3.4, 7)
scene.add(key)

// Sits well ahead of the lens so plates sweeping past the camera don't blow out.
const lamp = new THREE.PointLight(0xd7e4ff, 6, 32, 1.15)
lamp.position.set(0, 0.2, -2.8)
camera.add(lamp)

const shaft = new THREE.PointLight(0x3de0ff, 2.2, 40, 1.5)
shaft.position.set(0, 0, -14)
scene.add(shaft)

const materials = createMaterials()
const audio = createAudio()
const screen = createScreen()
let game
const input = createInput({
  onGesture() {
    audio.start()
    screen.maybeReenterFullscreen()
  },
  onModeChange(mode) {
    game?.setInputMode(mode)
  },
})
const bird = createBird(scene, materials)
const tunnel = createTunnel(scene, materials)
const obstacles = createObstacles(scene, materials)
const powerups = createPowerups(scene)
const fx = createFx(scene)
const postfx = createPostFx(renderer, scene, camera, { reduceMotion })

// ?q=0|1|2 pins a quality level; coarse pointers start one rung down.
let quality = params.has('q') ? Number(params.get('q')) : coarse ? 1 : QUALITY.length - 1
if (!Number.isFinite(quality)) quality = QUALITY.length - 1
quality = THREE.MathUtils.clamp(quality, 0, QUALITY.length - 1)
postfx.applyQuality(quality)
SHARED.uPixelRatio.value = renderer.getPixelRatio()

game = createGame({
  bird,
  tunnel,
  obstacles,
  powerups,
  input,
  camera,
  audio,
  fx,
  postfx,
  screen,
  reduceMotion,
  onResume() {
    last = performance.now()
  },
  god: params.get('god') === '1',
  startLives: Math.max(1, Number(params.get('lives')) || 1),
})
screen.onChange = () => game.syncScreen()
game.syncScreen()

if (params.has('god') || params.has('debug')) window.__magpie = { game, bird, input, screen, powerups }

function applySize() {
  const canvas = renderer.domElement
  const w = canvas.clientWidth || window.innerWidth
  const h = canvas.clientHeight || window.innerHeight
  if (w < 1 || h < 1) return
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY[quality].dpr))
  renderer.setSize(w, h, false)
  postfx.setSize(w, h)
  SHARED.uPixelRatio.value = renderer.getPixelRatio()
}

new ResizeObserver(applySize).observe(renderer.domElement)
applySize()

let last = performance.now()
let frameAvg = 16
let slowFor = 0
let warmup = 3

function adapt(frameMs, dt) {
  frameAvg += (Math.min(frameMs, 100) - frameAvg) * 0.08
  if (warmup > 0) {
    warmup -= dt
    return
  }
  if (frameAvg > 19.5) slowFor += dt
  else slowFor = 0
  if (slowFor > 1.5 && quality > 0 && !params.has('q')) {
    quality -= 1
    slowFor = 0
    warmup = 2
    postfx.applyQuality(quality)
    applySize()
  }
}

function frame(now) {
  const frameMs = now - last
  const dt = Math.min(frameMs / 1000, 0.05)
  last = now
  game.update(dt)
  postfx.render()
  input.endFrame()
  adapt(frameMs, dt)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

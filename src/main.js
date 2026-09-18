// Bootstrap: build the renderer and world, wire platform services into the
// game, and run the frame loop. Everything interesting lives in the modules.

import { createInput } from './platform/input.js'
import { createScreen } from './platform/screen.js'
import { createRenderer, createCamera, createScene } from './render/scene.js'
import { createMaterials } from './render/materials.js'
import { createPostFx } from './render/postfx.js'
import { QUALITY, createQualityGovernor, initialQuality } from './render/quality.js'
import { UNIFORMS } from './render/uniforms.js'
import { createBird } from './world/bird.js'
import { createTunnel } from './world/tunnel.js'
import { createGates } from './world/gates/index.js'
import { createPowerups } from './world/powerups.js'
import { createFx } from './world/fx.js'
import { createAudio } from './audio/index.js'
import { createGame } from './game/index.js'

/** Frame dt is clamped so a hitch or a backgrounded tab never teleports the world. */
const MAX_FRAME_DT = 0.05

const params = new URLSearchParams(location.search)
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const coarse = window.matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints || 0) > 0

const renderer = createRenderer()
document.body.appendChild(renderer.domElement)
const camera = createCamera()
const scene = createScene(camera)
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
const gates = createGates(scene, materials)
const powerups = createPowerups(scene)
const fx = createFx(scene)
const postfx = createPostFx(renderer, scene, camera, { reduceMotion })

const quality = createQualityGovernor({
  level: initialQuality(params, coarse),
  pinned: params.has('q'),
  onChange(level) {
    postfx.applyQuality(level)
    fx.setDensity(QUALITY[level].particles)
    applySize()
  },
})
postfx.applyQuality(quality.level)
fx.setDensity(QUALITY[quality.level].particles)
UNIFORMS.uPixelRatio.value = renderer.getPixelRatio()

let last = performance.now()

game = createGame({
  bird,
  tunnel,
  gates,
  powerups,
  input,
  camera,
  audio,
  fx,
  postfx,
  screen,
  reduceMotion,
  // Skip the frozen interval so the first live frame is not one giant step.
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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY[quality.level].dpr))
  renderer.setSize(w, h, false)
  postfx.setSize(w, h)
  UNIFORMS.uPixelRatio.value = renderer.getPixelRatio()
}

new ResizeObserver(applySize).observe(renderer.domElement)
applySize()

function frame(now) {
  const frameMs = now - last
  const dt = Math.min(frameMs / 1000, MAX_FRAME_DT)
  last = now
  game.update(dt)
  postfx.render()
  input.endFrame()
  quality.observe(frameMs, dt)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

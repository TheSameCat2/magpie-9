// Bootstrap: build the renderer and world, wire platform services into the
// game, and run the frame loop. Everything interesting lives in the modules.

import { loadQualityChoice, saveQualityChoice } from './lib/storage.js'
import { createInput } from './platform/input.js'
import { createScreen } from './platform/screen.js'
import { createRenderer, createCamera, createScene, placeLights } from './render/scene.js'
import { createMaterials } from './render/materials.js'
import { createPostFx } from './render/postfx.js'
import { QUALITY, createQualityGovernor, initialQuality } from './render/quality.js'
import { UNIFORMS } from './render/uniforms.js'
import { createBird } from './world/bird.js'
import { createTunnel } from './world/tunnel.js'
import { createGates } from './world/gates/index.js'
import { createPowerups } from './world/powerups.js'
import { createBends } from './world/bends.js'
import { createFx } from './world/fx.js'
import { createAudio } from './audio/index.js'
import { createGame } from './game/index.js'

/** Frame dt is clamped so a hitch or a backgrounded tab never teleports the world. */
const MAX_FRAME_DT = 0.05

const params = new URLSearchParams(location.search)
const reducedMotionMq = window.matchMedia('(prefers-reduced-motion: reduce)')
const reduceMotion = reducedMotionMq.matches
UNIFORMS.uReduceMotion.value = reduceMotion ? 1 : 0
const coarse = window.matchMedia('(pointer: coarse)').matches

let contextLost = false
let onRestored = () => {}
let renderer = null
try {
  renderer = createRenderer({
    onContextLost() {
      contextLost = true
    },
    onContextRestored() {
      contextLost = false
      onRestored()
    },
  })
} catch {
  for (const id of ['menu', 'sys', 'sub']) document.getElementById(id)?.classList.add('hidden')
  const blurb = document.getElementById('blurb')
  if (blurb) {
    blurb.setAttribute('role', 'alert')
    blurb.textContent = 'WEBGL2 REQUIRED'
  }
}

if (renderer) {
  const glRenderer = renderer
  document.body.appendChild(glRenderer.domElement)
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
  const bends = createBends()
  const fx = createFx(scene)
  const postfx = createPostFx(glRenderer, scene, camera, { reduceMotion })

  const savedQuality = loadQualityChoice()
  const queryPin = params.has('q')
  const bootFromDevice = queryPin || savedQuality === 'auto'
  const bootLevel = bootFromDevice ? initialQuality(params, coarse) : Number(savedQuality)
  const bootPinned = queryPin || savedQuality !== 'auto'
  const bootChoice = queryPin ? String(bootLevel) : savedQuality

  let lastW = 0
  let lastH = 0
  let lastDpr = 0
  let last = performance.now()

  const quality = createQualityGovernor({
    level: bootLevel,
    pinned: bootPinned,
    onChange(level) {
      postfx.applyQuality(level)
      fx.setDensity(QUALITY[level].particles)
      applySize()
    },
  })

  const applySize = () => {
    const canvas = glRenderer.domElement
    const w = canvas.clientWidth || window.innerWidth
    const h = canvas.clientHeight || window.innerHeight
    if (w < 1 || h < 1) return
    const dpr = Math.min(window.devicePixelRatio || 1, QUALITY[quality.level].dpr)
    if (w === lastW && h === lastH && dpr === lastDpr) return
    lastW = w
    lastH = h
    lastDpr = dpr
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    glRenderer.setPixelRatio(dpr)
    glRenderer.setSize(w, h, false)
    postfx.setSize(w, h)
    UNIFORMS.uPixelRatio.value = glRenderer.getPixelRatio()
  }

  onRestored = () => {
    last = performance.now()
    lastW = 0
    quality.resetWarmup()
    applySize()
  }

  postfx.applyQuality(quality.level)
  fx.setDensity(QUALITY[quality.level].particles)
  UNIFORMS.uPixelRatio.value = glRenderer.getPixelRatio()

  game = createGame({
    bird,
    tunnel,
    gates,
    powerups,
    bends,
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
    qualityChoice: bootChoice,
    onQuality(choice) {
      saveQualityChoice(choice)
      if (choice === 'auto') quality.apply(quality.level, false)
      else quality.apply(Number(choice), true)
    },
  })

  reducedMotionMq.addEventListener('change', (m) => {
    UNIFORMS.uReduceMotion.value = m.matches ? 1 : 0
    postfx.setReduceMotion(m.matches)
    game.setReduceMotion(m.matches)
  })

  if (params.has('god') || params.has('debug'))
    window.__magpie = { game, bird, input, screen, gates, powerups, bends }

  new ResizeObserver(applySize).observe(glRenderer.domElement)
  applySize()

  const watchDpr = () => {
    window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`).addEventListener(
      'change',
      () => {
        applySize()
        watchDpr()
      },
      { once: true },
    )
  }
  watchDpr()

  let rafId = 0
  let wasHidden = screen.hidden

  const frame = (now) => {
    if (document.visibilityState === 'hidden') {
      rafId = 0
      return
    }
    const frameMs = Math.max(0, now - last)
    const dt = Math.min(frameMs / 1000, MAX_FRAME_DT)
    last = now
    game.update(contextLost ? 0 : dt)
    if (!contextLost) {
      placeLights(scene)
      postfx.render()
    }
    input.endFrame()
    if (!screen.hidden && !contextLost) quality.observe(frameMs, dt)
    rafId = requestAnimationFrame(frame)
  }

  screen.onChange = () => {
    game.syncScreen()
    const hidden = screen.hidden
    if (document.visibilityState === 'hidden') {
      if (rafId) cancelAnimationFrame(rafId)
      rafId = 0
    } else {
      if ((wasHidden && !hidden) || !rafId) {
        last = performance.now()
        quality.resetWarmup()
      }
      if (!rafId) rafId = requestAnimationFrame(frame)
    }
    wasHidden = hidden
  }
  game.syncScreen()

  if (document.visibilityState !== 'hidden') rafId = requestAnimationFrame(frame)
}

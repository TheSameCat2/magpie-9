import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { SCREEN_VERT, SCREEN_FRAG } from './shaders.js'
import { QUALITY } from './quality.js'

// Bloom + full-screen grade (aberration, zoom, flash, glitch, vignette, grain).
export function createPostFx(renderer, scene, camera, { reduceMotion }) {
  const composer = new EffectComposer(renderer)
  composer.renderTarget2.depthBuffer = false
  const renderPass = new RenderPass(scene, camera)
  const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.4, 0.45, 0.84)
  bloom.renderTargetBright.depthBuffer = false
  for (let i = 0; i < bloom.renderTargetsHorizontal.length; i++) {
    bloom.renderTargetsHorizontal[i].depthBuffer = false
    bloom.renderTargetsVertical[i].depthBuffer = false
  }
  const output = new OutputPass()
  const screen = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uTime: { value: 0 },
      uAberration: { value: 0 },
      uZoom: { value: 0 },
      uFlash: { value: 0 },
      uFlashColor: { value: new THREE.Color(1, 1, 1) },
      uGlitch: { value: 0 },
      uVignette: { value: 0.55 },
      uGrain: { value: 0.028 },
      uWarp: { value: 0 },
      uWarpCenter: { value: new THREE.Vector2(0.5, 0.5) },
      uFlare: { value: 1 },
      uCurvature: { value: 0.025 },
      uScanlines: { value: 0.03 },
      uRes: { value: new THREE.Vector2(1, 1) },
    },
    vertexShader: SCREEN_VERT,
    fragmentShader: SCREEN_FRAG,
  })

  composer.addPass(renderPass)
  composer.addPass(bloom)
  composer.addPass(output)
  composer.addPass(screen)

  let kick = 0
  let flash = 0
  let glitch = 0
  let warp = 0
  let bloomScale = 0.5
  const initial = renderer.getSize(new THREE.Vector2())
  let width = initial.x
  let height = initial.y
  let lastComposerW = -1
  let lastComposerH = -1
  let lastComposerPr = -1
  let lastBloomW = -1
  let lastBloomH = -1

  function setSize(w, h) {
    width = w
    height = h
    const pr = renderer.getPixelRatio()
    if (w !== lastComposerW || h !== lastComposerH || pr !== lastComposerPr) {
      lastComposerW = w
      lastComposerH = h
      lastComposerPr = pr
      composer.setPixelRatio(pr)
      composer.setSize(w, h)
      screen.uniforms.uRes.value.set(w * pr, h * pr)
    }
    const bw = Math.max(64, Math.round(w * pr * bloomScale))
    const bh = Math.max(64, Math.round(h * pr * bloomScale))
    if (bw !== lastBloomW || bh !== lastBloomH) {
      lastBloomW = bw
      lastBloomH = bh
      bloom.setSize(bw, bh)
    }
  }

  function applyQuality(level) {
    const q = QUALITY[THREE.MathUtils.clamp(level, 0, QUALITY.length - 1)]
    bloom.enabled = q.bloom && !reduceMotion
    bloomScale = q.bloomScale
    screen.uniforms.uFlare.value = q.flare && !reduceMotion ? 1.0 : 0.0
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1
    renderer.setPixelRatio(Math.min(dpr, q.dpr))
    renderer.setSize(width, height, false)
    setSize(width, height)
  }

  const motion = reduceMotion ? 0 : 1
  screen.uniforms.uCurvature.value = 0.025 * motion
  screen.uniforms.uScanlines.value = 0.03 * motion

  function update(dt) {
    const u = screen.uniforms
    u.uTime.value += dt
    if (kick > 0 || flash > 0 || glitch > 0 || warp > 0) {
      kick = Math.max(0, kick - dt * 3.4)
      flash = Math.max(0, flash - dt * 2.6)
      glitch = Math.max(0, glitch - dt * 1.7)
      warp = Math.max(0, warp - dt * 2.8)
      u.uAberration.value = kick * motion
      u.uZoom.value = kick * kick * motion
      u.uFlash.value = flash * (reduceMotion ? 0.35 : 1)
      u.uGlitch.value = glitch * glitch * motion
      u.uWarp.value = warp * motion
    }
  }

  return {
    composer,
    render() {
      composer.render(0)
    },
    update,
    setSize,
    applyQuality,
    kick(strength) {
      kick = Math.min(1.2, Math.max(kick, strength))
    },
    flash(color, amount) {
      screen.uniforms.uFlashColor.value.set(color)
      flash = Math.max(flash, amount)
    },
    glitch(amount) {
      glitch = Math.max(glitch, amount)
    },
    warp(cx = 0.5, cy = 0.5, strength = 1.0) {
      if (reduceMotion) return
      screen.uniforms.uWarpCenter.value.set(cx, cy)
      warp = Math.min(1.2, Math.max(warp, strength))
    },
    setBloomStrength(v) {
      bloom.strength = v
    },
    get bloomEnabled() {
      return bloom.enabled
    },
    get flareEnabled() {
      return screen.uniforms.uFlare.value > 0
    },
    get screen() {
      return screen
    },
  }
}

import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { SCREEN_VERT, SCREEN_FRAG } from './shaders.js'

// Quality ladder. main.js walks down it if frames run long.
export const QUALITY = [
  { dpr: 1, bloom: false, bloomScale: 0.5 },
  { dpr: 1.25, bloom: true, bloomScale: 0.35 },
  { dpr: 2, bloom: true, bloomScale: 0.5 },
]

export function createPostFx(renderer, scene, camera, { reduceMotion }) {
  const composer = new EffectComposer(renderer)
  const renderPass = new RenderPass(scene, camera)
  const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.4, 0.45, 0.84)
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
  let bloomScale = 0.5
  const initial = renderer.getSize(new THREE.Vector2())
  let width = initial.x
  let height = initial.y

  function setSize(w, h) {
    width = w
    height = h
    const pr = renderer.getPixelRatio()
    composer.setPixelRatio(pr)
    composer.setSize(w, h)
    bloom.setSize(Math.max(64, Math.round(w * pr * bloomScale)), Math.max(64, Math.round(h * pr * bloomScale)))
    screen.uniforms.uRes.value.set(w * pr, h * pr)
  }

  function applyQuality(level) {
    const q = QUALITY[THREE.MathUtils.clamp(level, 0, QUALITY.length - 1)]
    bloom.enabled = q.bloom && !reduceMotion
    bloomScale = q.bloomScale
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.dpr))
    renderer.setSize(width, height)
    setSize(width, height)
  }

  function update(dt) {
    screen.uniforms.uTime.value += dt
    kick = Math.max(0, kick - dt * 3.4)
    flash = Math.max(0, flash - dt * 2.6)
    glitch = Math.max(0, glitch - dt * 1.7)
    const motion = reduceMotion ? 0 : 1
    screen.uniforms.uAberration.value = kick * motion
    screen.uniforms.uZoom.value = kick * kick * motion
    screen.uniforms.uFlash.value = flash * (reduceMotion ? 0.35 : 1)
    screen.uniforms.uGlitch.value = glitch * glitch * motion
  }

  return {
    composer,
    render() {
      composer.render()
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
    setBloomStrength(v) {
      bloom.strength = v
    },
    get bloomEnabled() {
      return bloom.enabled
    },
  }
}

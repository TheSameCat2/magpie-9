import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { QUALITY } from './quality.js'
import { createPostFx } from './postfx.js'

function dummyRenderer() {
  const size = new THREE.Vector2(800, 600)
  return {
    getSize: (target) => target.copy(size),
    getPixelRatio: () => 1,
    setPixelRatio: () => {},
    setSize: () => {},
    getRenderTarget: () => null,
    setRenderTarget: () => {},
    clear: () => {},
    render: () => {},
  }
}

test('QUALITY ladder defines flare property across all rungs', () => {
  assert.equal(QUALITY.length, 3)
  assert.equal(QUALITY[0].flare, false, 'low rung disables flare')
  assert.equal(QUALITY[1].flare, true, 'medium rung enables flare')
  assert.equal(QUALITY[2].flare, true, 'high rung enables flare')
})

test('createPostFx initializes with uFlare, uCurvature, and uScanlines uniforms', () => {
  const renderer = dummyRenderer()
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera()
  const postfx = createPostFx(renderer, scene, camera, { reduceMotion: false })

  const uniforms = postfx.screen.uniforms
  assert.ok(uniforms.uFlare, 'uFlare uniform exists')
  assert.ok(uniforms.uCurvature, 'uCurvature uniform exists')
  assert.ok(uniforms.uScanlines, 'uScanlines uniform exists')
  assert.equal(uniforms.uCurvature.value, 0.025)
  assert.equal(uniforms.uScanlines.value, 0.03)
  assert.equal(postfx.flareEnabled, true)
  // The scene renders into its own multisampled target; the ping-pong buffers hold only post passes.
  assert.equal(postfx.composer.renderTarget1.depthBuffer, false, 'renderTarget1 needs no depth')
  assert.equal(postfx.composer.renderTarget2.depthBuffer, false, 'renderTarget2 needs no depth')
})

test('applyQuality sets the scene MSAA from the rung and the pixel ratio', () => {
  let pixelRatio = 1
  const renderer = {
    ...dummyRenderer(),
    getPixelRatio: () => pixelRatio,
    setPixelRatio: (r) => (pixelRatio = r),
  }
  const postfx = createPostFx(renderer, new THREE.Scene(), new THREE.PerspectiveCamera(), {
    reduceMotion: false,
  })
  const dpr = globalThis.window
  globalThis.window = /** @type {any} */ ({ devicePixelRatio: 1 })
  try {
    postfx.applyQuality(0)
    assert.equal(postfx.samples, QUALITY[0].msaa)
    postfx.applyQuality(2)
    assert.equal(postfx.samples, QUALITY[2].msaa)
    globalThis.window = /** @type {any} */ ({ devicePixelRatio: 3 })
    postfx.applyQuality(2)
    assert.equal(pixelRatio, 2)
    assert.equal(postfx.samples, 2, 'dense screens drop to 2 samples')
  } finally {
    globalThis.window = dpr
  }
})

test('applyQuality updates flareEnabled according to quality rung', () => {
  const renderer = dummyRenderer()
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera()
  const postfx = createPostFx(renderer, scene, camera, { reduceMotion: false })

  postfx.applyQuality(0)
  assert.equal(postfx.flareEnabled, false, 'low quality disables flare')
  assert.equal(postfx.screen.uniforms.uFlare.value, 0)

  postfx.applyQuality(2)
  assert.equal(postfx.flareEnabled, true, 'high quality enables flare')
  assert.equal(postfx.screen.uniforms.uFlare.value, 1)
})

test('reduceMotion disables flare, curvature, and scanlines', () => {
  const renderer = dummyRenderer()
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera()
  const postfx = createPostFx(renderer, scene, camera, { reduceMotion: true })

  postfx.applyQuality(2)
  assert.equal(postfx.flareEnabled, false, 'reduceMotion disables flare even on high quality')
  assert.equal(postfx.screen.uniforms.uFlare.value, 0)

  postfx.update(0.016)
  assert.equal(postfx.screen.uniforms.uCurvature.value, 0, 'reduceMotion zeroes curvature')
  assert.equal(postfx.screen.uniforms.uScanlines.value, 0, 'reduceMotion zeroes scanlines')
})

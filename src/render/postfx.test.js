import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { QUALITY } from './quality.js'
import { createPostFx } from './postfx.js'
import { createRenderer } from './scene.js'
import { createRibMaterial } from './materials.js'
import { RIB_FRAG } from './shaders.js'
import { UNIFORMS } from './uniforms.js'

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
  try {
    const postfx = createPostFx(renderer, scene, camera, { reduceMotion: true })

    postfx.applyQuality(2)
    assert.equal(postfx.flareEnabled, false, 'reduceMotion disables flare even on high quality')
    assert.equal(postfx.screen.uniforms.uFlare.value, 0)

    postfx.update(0.016)
    assert.equal(postfx.screen.uniforms.uCurvature.value, 0, 'reduceMotion zeroes curvature')
    assert.equal(postfx.screen.uniforms.uScanlines.value, 0, 'reduceMotion zeroes scanlines')
  } finally {
    UNIFORMS.uReduceMotion.value = 0
  }
})

test('setReduceMotion toggles bloom, grade uniforms, uReduceMotion, and persists across applyQuality', () => {
  const renderer = dummyRenderer()
  const postfx = createPostFx(renderer, new THREE.Scene(), new THREE.PerspectiveCamera(), {
    reduceMotion: false,
  })
  try {
    postfx.applyQuality(2)
    assert.equal(postfx.bloomEnabled, true)
    assert.equal(postfx.flareEnabled, true)
    assert.equal(UNIFORMS.uReduceMotion.value, 0)

    // Seed active transient effects, then toggle reduced motion live.
    postfx.kick(1)
    postfx.flash(0xffffff, 1)
    postfx.glitch(0.8)
    postfx.warp(0.5, 0.5, 0.9)
    postfx.update(0.016)
    assert.ok(postfx.screen.uniforms.uAberration.value > 0)
    assert.ok(postfx.screen.uniforms.uWarp.value > 0)

    postfx.setReduceMotion(true)
    assert.equal(UNIFORMS.uReduceMotion.value, 1)
    assert.equal(postfx.bloomEnabled, false)
    assert.equal(postfx.flareEnabled, false)
    assert.equal(postfx.screen.uniforms.uCurvature.value, 0)
    assert.equal(postfx.screen.uniforms.uScanlines.value, 0)
    assert.equal(postfx.screen.uniforms.uAberration.value, 0)
    assert.equal(postfx.screen.uniforms.uZoom.value, 0)
    assert.equal(postfx.screen.uniforms.uGlitch.value, 0)
    assert.equal(postfx.screen.uniforms.uWarp.value, 0)

    // Subsequent quality changes preserve reduced-motion overrides.
    postfx.applyQuality(1)
    assert.equal(postfx.bloomEnabled, false)
    assert.equal(postfx.flareEnabled, false)

    // Turning reduced motion off restores bloom/flare for the active rung (1),
    // while rung 0 keeps bloom and flare disabled.
    postfx.setReduceMotion(false)
    assert.equal(UNIFORMS.uReduceMotion.value, 0)
    assert.equal(postfx.bloomEnabled, true)
    assert.equal(postfx.flareEnabled, true)
    assert.equal(postfx.screen.uniforms.uCurvature.value, 0.025)
    assert.equal(postfx.screen.uniforms.uScanlines.value, 0.03)

    postfx.applyQuality(0)
    postfx.setReduceMotion(false)
    assert.equal(postfx.bloomEnabled, false)
    assert.equal(postfx.flareEnabled, false)
  } finally {
    UNIFORMS.uReduceMotion.value = 0
    UNIFORMS.uPixelRatio.value = 1
  }
})

test('applyQuality syncs UNIFORMS.uPixelRatio and safely guards missing devicePixelRatio', () => {
  let pixelRatio = 1
  const renderer = {
    ...dummyRenderer(),
    getPixelRatio: () => pixelRatio,
    setPixelRatio: (r) => (pixelRatio = r),
  }
  const postfx = createPostFx(renderer, new THREE.Scene(), new THREE.PerspectiveCamera(), {
    reduceMotion: false,
  })
  const prevWin = globalThis.window
  try {
    globalThis.window = /** @type {any} */ ({ devicePixelRatio: 2 })
    postfx.applyQuality(2)
    assert.equal(pixelRatio, 2)
    assert.equal(UNIFORMS.uPixelRatio.value, 2)

    postfx.applyQuality(0)
    assert.equal(pixelRatio, 1)
    assert.equal(UNIFORMS.uPixelRatio.value, 1)

    // Partial window mock with undefined / 0 devicePixelRatio must fall back to 1 (never NaN).
    globalThis.window = /** @type {any} */ ({})
    postfx.applyQuality(2)
    assert.equal(pixelRatio, 1)
    assert.equal(UNIFORMS.uPixelRatio.value, 1)

    globalThis.window = /** @type {any} */ ({ devicePixelRatio: 0 })
    postfx.applyQuality(2)
    assert.equal(pixelRatio, 1)
    assert.equal(UNIFORMS.uPixelRatio.value, 1)
  } finally {
    globalThis.window = prevWin
    UNIFORMS.uPixelRatio.value = 1
  }
})

function mockWebGL2Context(width = 800, height = 600) {
  let nextEnum = 0x10000
  const enums = new Map()
  const enumFor = (name) => {
    if (!enums.has(name)) enums.set(name, nextEnum++)
    return enums.get(name)
  }
  const base = {
    drawingBufferWidth: width,
    drawingBufferHeight: height,
    getContextAttributes: () => ({ alpha: false, antialias: false, depth: false, stencil: false }),
    isContextLost: () => false,
    getExtension: () => null,
    getSupportedExtensions: () => [],
    getParameter(p) {
      if (p === enumFor('VERSION')) return 'WebGL 2.0'
      if (p === enumFor('SHADING_LANGUAGE_VERSION')) return 'WebGL GLSL ES 3.00'
      if (p === enumFor('VIEWPORT') || p === enumFor('SCISSOR_BOX'))
        return new Int32Array([0, 0, width, height])
      return 16384
    },
    getShaderPrecisionFormat: () => ({ precision: 23, rangeMin: 127, rangeMax: 127 }),
    createTexture: () => ({}),
    createBuffer: () => ({}),
    createFramebuffer: () => ({}),
    createRenderbuffer: () => ({}),
    createVertexArray: () => ({}),
    createProgram: () => ({}),
    createShader: () => ({}),
  }
  return new Proxy(base, {
    get(target, key) {
      if (typeof key !== 'string') return undefined
      if (key in target) return target[key]
      if (/^[A-Z0-9_]+$/.test(key)) return enumFor(key)
      return () => 0
    },
  })
}

test('createRenderer handles webglcontextlost and webglcontextrestored on domElement', () => {
  /** @type {Map<string, Function[]>} */
  const listeners = new Map()
  const gl = mockWebGL2Context()
  const canvas = /** @type {any} */ ({
    width: 800,
    height: 600,
    style: {},
    addEventListener(type, fn) {
      const list = listeners.get(type) ?? []
      list.push(fn)
      listeners.set(type, list)
    },
    removeEventListener() {},
    getContext: () => gl,
  })
  let lostCount = 0
  let restoredCount = 0
  const prevWin = globalThis.window
  globalThis.window = /** @type {any} */ ({ innerWidth: 800, innerHeight: 600, devicePixelRatio: 1.5 })
  try {
    createRenderer({
      canvas,
      context: gl,
      onContextLost: () => {
        lostCount += 1
      },
      onContextRestored: () => {
        restoredCount += 1
      },
    })

    const lostHandlers = listeners.get('webglcontextlost') ?? []
    const restoredHandlers = listeners.get('webglcontextrestored') ?? []
    assert.ok(lostHandlers.length >= 2, 'registers app webglcontextlost listener alongside Three.js')
    assert.ok(restoredHandlers.length >= 2, 'registers app webglcontextrestored listener alongside Three.js')

    // Invoke our registered handler (appended after Three.js's constructor listener).
    let prevented = false
    lostHandlers[lostHandlers.length - 1]({
      preventDefault() {
        prevented = true
      },
    })
    assert.equal(prevented, true, 'webglcontextlost calls e.preventDefault()')
    assert.equal(lostCount, 1)

    restoredHandlers[restoredHandlers.length - 1]({})
    assert.equal(restoredCount, 1)

    // Optional callbacks may be omitted cleanly.
    assert.doesNotThrow(() => {
      createRenderer({ canvas, context: gl })
      const latestLost = listeners.get('webglcontextlost')
      latestLost[latestLost.length - 1]({ preventDefault() {} })
      const latestRestored = listeners.get('webglcontextrestored')
      latestRestored[latestRestored.length - 1]({})
    })
  } finally {
    globalThis.window = prevWin
  }
})

test('createRibMaterial wires UNIFORMS.uReduceMotion and RIB_FRAG caps temporal pulses below 3 Hz', () => {
  const mat = createRibMaterial(0x3de0ff, 0.5, 0.09)
  assert.equal(
    mat.uniforms.uReduceMotion,
    UNIFORMS.uReduceMotion,
    'rib material shares UNIFORMS.uReduceMotion by reference',
  )
  assert.match(RIB_FRAG, /uniform\s+float\s+uReduceMotion\s*;/)
  assert.match(RIB_FRAG, /uTime\s*\*\s*\(8\.0\s*\+\s*uHazard\s*\*\s*7\.5\)/)
  assert.match(RIB_FRAG, /uTime\s*\*\s*2\.2/)
})

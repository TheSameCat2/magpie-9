// Headless frame benchmark: the real world modules, camera rig, game state
// machine, materials, and post chain, driven for a few thousand frames in
// Node with the HUD, audio, and score API stubbed out.
//
// WebGL is a no-op context (createMockGL) that answers just enough for
// three's WebGLRenderer to run its full JavaScript path: render lists, state
// tracking, uniform uploads. GPU and driver time are therefore zero. What it
// measures is the CPU side of a frame:
//
//   update   game.update() — rules, spawner, pools, particles, camera rig
//   render   postfx.render() — three's per-frame work for the scene + passes
//   draws    draw calls per frame (scene and post passes)
//   gl       WebGL calls per frame; each one costs real time in a browser
//
// Use it to compare before/after on the same machine, not as an absolute
// frame time. Fill rate, shader cost, and bloom resolution need a real GPU:
// profile those in the browser (DevTools Performance, Spector.js).
//
//   npm run bench                      # 3000 frames of an open run
//   npm run bench -- --frames 6000 --mode bends

import path from 'node:path'
import { parseArgs } from 'node:util'
import { PerformanceObserver, performance } from 'node:perf_hooks'
import * as THREE from 'three'

const { values: opts } = parseArgs({
  options: {
    frames: { type: 'string', default: '3000' },
    mode: { type: 'string', default: 'new' },
    width: { type: 'string', default: '1280' },
    height: { type: 'string', default: '800' },
    dpr: { type: 'string', default: '2' },
    quality: { type: 'string', default: '2' },
  },
})
const FRAMES = Math.max(100, Number(opts.frames))
const WARMUP = 600
const CSS_W = Number(opts.width)
const CSS_H = Number(opts.height)
const DPR = Number(opts.dpr)

// ------------------------------------------------------- browser stand-ins

const ctx2d = new Proxy(
  {},
  {
    get(target, key) {
      if (key in target) return target[key]
      if (key === 'createLinearGradient' || key === 'createRadialGradient' || key === 'createPattern')
        return () => ({ addColorStop() {} })
      if (key === 'getImageData' || key === 'createImageData')
        return (_x, _y, w = 1, h = 1) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h })
      if (key === 'measureText') return () => ({ width: 0 })
      return () => {}
    },
    set(target, key, value) {
      target[key] = value
      return true
    },
  },
)
globalThis.document ??= {
  createElement: () => ({ width: 1, height: 1, style: {}, getContext: () => ctx2d }),
}
globalThis.window ??= { innerWidth: CSS_W, innerHeight: CSS_H, devicePixelRatio: DPR }
globalThis.localStorage ??= (() => {
  const store = new Map()
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  }
})()

/** GLSL type → the WebGL enum three's uniform setters switch on. */
const UNIFORM_TYPE = {
  float: 0x1406,
  int: 0x1404,
  bool: 0x8b56,
  vec2: 0x8b50,
  vec3: 0x8b51,
  vec4: 0x8b52,
  mat3: 0x8b5b,
  mat4: 0x8b5c,
  sampler2D: 0x8b5e,
  samplerCube: 0x8b60,
}

/**
 * A WebGL2 context that does nothing and counts calls. Programs report the
 * plain uniforms their source declares so three builds a realistic upload
 * list; struct uniforms (the light arrays) are left out, so light uploads
 * are slightly under-counted.
 */
function createMockGL(width, height) {
  let nextId = 1
  const enums = new Map()
  const counts = { calls: 0, draws: 0 }
  const enumFor = (name) => {
    if (!enums.has(name)) enums.set(name, 0x10000 + nextId++)
    return enums.get(name)
  }
  const object = () => ({ id: nextId++ })
  const impl = {
    drawingBufferWidth: width,
    drawingBufferHeight: height,
    getContextAttributes: () => ({ alpha: false, antialias: false, depth: false, stencil: false }),
    isContextLost: () => false,
    // Desktop browsers don't expose multisampled render-to-texture; three then
    // takes the renderbuffer + blit path for MSAA targets, which is what we measure.
    getExtension: (name) => (name === 'WEBGL_multisampled_render_to_texture' ? null : { name }),
    getSupportedExtensions: () => [],
    getParameter(p) {
      if (p === enumFor('VERSION')) return 'WebGL 2.0'
      if (p === enumFor('SHADING_LANGUAGE_VERSION')) return 'WebGL GLSL ES 3.00'
      if (p === enumFor('RENDERER') || p === enumFor('VENDOR')) return 'bench'
      if (p === enumFor('VIEWPORT') || p === enumFor('SCISSOR_BOX'))
        return new Int32Array([0, 0, width, height])
      if (p === enumFor('MAX_TEXTURE_IMAGE_UNITS') || p === enumFor('MAX_COMBINED_TEXTURE_IMAGE_UNITS'))
        return 32
      if (p === enumFor('MAX_SAMPLES')) return 4
      return 16384
    },
    getShaderPrecisionFormat: () => ({ precision: 23, rangeMin: 127, rangeMax: 127 }),
    createShader: object,
    createProgram: () => ({ id: nextId++, shaders: [], uniforms: [] }),
    shaderSource(shader, source) {
      shader.source = source
    },
    attachShader(program, shader) {
      program.shaders.push(shader)
    },
    linkProgram(program) {
      const seen = new Set()
      for (const shader of program.shaders) {
        for (const m of shader.source.matchAll(
          /uniform\s+(?:(?:high|medium|low)p\s+)?(\w+)\s+(\w+)(\[[^\]]+\])?\s*;/g,
        )) {
          const [, type, name, array] = m
          // Built-in arrays (shadow matrices, morph weights) sit in disabled
          // #ifdef blocks here; only our own u* arrays are live.
          if (!(type in UNIFORM_TYPE) || seen.has(name) || (array && !name.startsWith('u'))) continue
          seen.add(name)
          program.uniforms.push({
            name: array ? `${name}[0]` : name,
            size: array ? 4 : 1,
            type: UNIFORM_TYPE[type],
          })
        }
      }
    },
    getProgramParameter: (program, p) =>
      p === enumFor('ACTIVE_UNIFORMS')
        ? program.uniforms.length
        : p === enumFor('ACTIVE_ATTRIBUTES')
          ? 0
          : true,
    getShaderParameter: () => true,
    getActiveUniform: (program, i) => program.uniforms[i],
    getActiveAttrib: () => null,
    getUniformLocation: (_program, name) => ({ name }),
    getAttribLocation: () => -1,
    getProgramInfoLog: () => '',
    getShaderInfoLog: () => '',
    getShaderSource: (shader) => shader.source,
    createBuffer: object,
    createTexture: object,
    createFramebuffer: object,
    createRenderbuffer: object,
    createVertexArray: object,
    checkFramebufferStatus: () => enumFor('FRAMEBUFFER_COMPLETE'),
    getError: () => 0,
  }
  const DRAWS = new Set(['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced'])
  // One counting wrapper per method, made once, so the mock itself does not
  // allocate per call and pollute the GC numbers.
  const wrapped = new Map()
  function wrap(key) {
    const value = impl[key]
    if (typeof value === 'function') {
      return function () {
        counts.calls += 1
        return value.apply(impl, arguments)
      }
    }
    const draw = DRAWS.has(key)
    return () => {
      counts.calls += 1
      if (draw) counts.draws += 1
      return 0
    }
  }
  const gl = new Proxy(impl, {
    get(target, key) {
      if (typeof key !== 'string') return undefined
      if (key in target && typeof target[key] !== 'function') return target[key]
      if (!(key in target) && /^[A-Z0-9_]+$/.test(key)) return enumFor(key)
      let fn = wrapped.get(key)
      if (!fn) wrapped.set(key, (fn = wrap(key)))
      return fn
    },
  })
  return { gl, counts }
}

function stub() {
  return new Proxy(
    {},
    {
      get: (target, key) => (key in target ? target[key] : key === 'then' ? undefined : () => {}),
      set: (target, key, value) => {
        target[key] = value
        return true
      },
    },
  )
}

// ------------------------------------------------------------ build world

const src = (p) => import(path.join(import.meta.dirname, '..', 'src', p))
const { createCamera, createScene, placeLights } = await src('render/scene.js')
const { createMaterials } = await src('render/materials.js')
const { createPostFx } = await src('render/postfx.js')
const { createBird } = await src('world/bird.js')
const { createTunnel } = await src('world/tunnel.js')
const { createGates } = await src('world/gates/index.js')
const { createPowerups } = await src('world/powerups.js')
const { createBends } = await src('world/bends.js')
const { createFx } = await src('world/fx.js')
const { QUALITY } = await src('render/quality.js')
const { createGame } = await src('game/index.js')

const { gl, counts } = createMockGL(CSS_W * DPR, CSS_H * DPR)
const canvas = {
  width: CSS_W * DPR,
  height: CSS_H * DPR,
  style: {},
  addEventListener() {},
  removeEventListener() {},
  getContext: () => gl,
}
const renderer = new THREE.WebGLRenderer({ canvas, context: gl })
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.setPixelRatio(DPR)
renderer.setSize(CSS_W, CSS_H, false)

const camera = createCamera()
const scene = createScene(camera)
const materials = createMaterials()
const bird = createBird(scene, materials)
const tunnel = createTunnel(scene, materials)
const gates = createGates(scene, materials)
const powerups = createPowerups(scene)
const bends = createBends()
const fx = createFx(scene)
const postfx = createPostFx(renderer, scene, camera, { reduceMotion: false })
const level = Math.min(QUALITY.length - 1, Math.max(0, Number(opts.quality)))
postfx.applyQuality(level)
fx.setDensity(QUALITY[level].particles)
postfx.setSize(CSS_W, CSS_H)

const input = {
  flapEdge: false,
  tapEdge: false,
  restartEdge: false,
  selectEdge: false,
  pauseEdge: false,
  backEdge: false,
  helpEdge: false,
  muteEdge: false,
  debugEdge: false,
  navEdge: 0,
  strafeEdge: 0,
  strafe: 0,
  mode: 'keys',
  stick: { active: false, originX: 0, originY: 0, dx: 0 },
  lastTap: { x: 0, y: 0, at: 0 },
}
const hud = stub()
hud.helpOpen = false
hud.menuItem = opts.mode
let clockMs = 1_000
const game = createGame({
  bird,
  tunnel,
  gates,
  powerups,
  bends,
  input,
  camera,
  audio: stub(),
  fx,
  postfx,
  screen: { needsRotate: false, hidden: false },
  reduceMotion: false,
  // God mode keeps the run alive so every frame is a live, scrolling frame.
  god: true,
  hud,
  api: {
    startRun: async () => ({ token: 'bench', seed: 42, day: '2026-11-02', target: 3, now: 1_000 }),
    fetchBoard: async () => ({ board: [] }),
    submitScore: async () => ({ board: [], rank: 1 }),
  },
  now: () => clockMs,
})

// ---------------------------------------------------------------- run

const DT = 1 / 60
let frameNo = 0
function frame(timings) {
  clockMs += 1000 * DT
  // Flap on a steady beat and weave so the bird crosses the conduit.
  input.flapEdge = input.tapEdge = frameNo % 24 === 0
  input.strafe = Math.sin(frameNo / 90)
  const t0 = performance.now()
  game.update(DT)
  const t1 = performance.now()
  placeLights(scene)
  postfx.render()
  const t2 = performance.now()
  input.flapEdge = input.tapEdge = false
  frameNo += 1
  if (timings) {
    timings.update[timings.n] = t1 - t0
    timings.render[timings.n] = t2 - t1
    timings.n += 1
  }
}

input.selectEdge = true
frame()
input.selectEdge = false
// Let the run token promise settle so challenge mode can start.
await new Promise((resolve) => setTimeout(resolve, 0))
for (let i = 0; i < WARMUP; i++) frame()

let gcCount = 0
let gcMs = 0
const gcObserver = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    gcCount += 1
    gcMs += entry.duration
  }
})
gcObserver.observe({ entryTypes: ['gc'] })

const timings = { n: 0, update: new Float64Array(FRAMES), render: new Float64Array(FRAMES) }
counts.calls = 0
counts.draws = 0
for (let i = 0; i < FRAMES; i++) frame(timings)
const calls = counts.calls / FRAMES
const draws = counts.draws / FRAMES
// Let pending GC entries arrive before reporting.
await new Promise((resolve) => setTimeout(resolve, 50))
gcObserver.disconnect()

function stats(samples) {
  const sorted = Float64Array.from(samples).sort()
  const at = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] * 1000
  return `p50 ${at(0.5).toFixed(0).padStart(5)} µs   p95 ${at(0.95).toFixed(0).padStart(5)} µs`
}

console.log(
  `MAGPIE-9 frame bench · ${opts.mode} · ${FRAMES} frames · ${CSS_W}×${CSS_H} @${DPR}x · quality ${level}`,
)
console.log(`  state    ${game.state}${game.paused ? ' (held)' : ''}`)
console.log(`  update   ${stats(timings.update)}`)
console.log(`  render   ${stats(timings.render)}`)
console.log(`  draws    ${draws.toFixed(1)} per frame`)
console.log(`  gl       ${calls.toFixed(0)} calls per frame`)
console.log(`  gc       ${gcCount} collections, ${gcMs.toFixed(1)} ms total`)
process.exit(0)

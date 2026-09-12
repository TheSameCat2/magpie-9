import * as THREE from 'three'
import {
  FRAME_VERT,
  FRAME_FRAG,
  RIB_VERT,
  RIB_FRAG,
  LASER_VERT,
  LASER_FRAG,
  PYLON_VERT,
  PYLON_FRAG,
  RING_FRAG,
  ORB_VERT,
  ORB_FRAG,
  HALO_FRAG,
} from './shaders.js'

export const THEME = {
  void: 0x07080c,
  metal: 0x161a22,
  metalHi: 0x2a3140,
  sodium: 0xe8a030,
  gold: 0xffd166,
  green: 0x3dff8a,
  mag: 0xff2a6d,
  ice: 0x3de0ff,
  ink: 0xdce8f0,
  graphite: 0x1c222c,
  belly: 0xd6dde6,
}

export const R = 4.2
export const SEG_LEN = 10
export const SEG_COUNT = 8
export const BIRD_RADIUS = 0.5
export const VERTEX_R = R / Math.cos(Math.PI / 6)
export const BEST_KEY = 'magpie9.best'
export const MUTE_KEY = 'magpie9.mute'
export const FULLSCREEN_KEY = 'magpie9.fullscreen'
export const FOG_DENSITY = 0.03

// Uniform objects shared by reference across every shader material so a single
// write per frame drives all of them.
export const SHARED = {
  uTime: { value: 0 },
  uScroll: { value: 0 },
  uKick: { value: 0 },
  uFogDensity: { value: FOG_DENSITY },
  uPixelRatio: { value: 1 },
}

export function createFog() {
  return new THREE.FogExp2(THEME.void, FOG_DENSITY)
}

function canvas(w, h) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d')]
}

function texture(c, srgb) {
  const tex = new THREE.CanvasTexture(c)
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 8
  return tex
}

function grime(g, w, h, n, alpha) {
  for (let i = 0; i < n; i++) {
    const x = Math.random() * w
    const y = Math.random() * h
    const r = 4 + Math.random() * 26
    const grad = g.createRadialGradient(x, y, 0, x, y, r)
    grad.addColorStop(0, `rgba(0,0,0,${alpha})`)
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = grad
    g.fillRect(x - r, y - r, r * 2, r * 2)
  }
}

// One plate = 256 x 512 texels, wrapped along the wall so the seams/bolts tile.
function conduitMaps() {
  const W = 256
  const H = 512
  const [c, g] = canvas(W, H)
  const [bc, bg] = canvas(W, H)
  const [ec, eg] = canvas(W, H)

  g.fillStyle = '#3a4252'
  g.fillRect(0, 0, W, H)
  bg.fillStyle = '#808080'
  bg.fillRect(0, 0, W, H)
  eg.fillStyle = '#000'
  eg.fillRect(0, 0, W, H)

  // brushed streaks
  for (let i = 0; i < 900; i++) {
    const y = Math.random() * H
    const l = 20 + Math.random() * 140
    g.fillStyle = `rgba(255,255,255,${0.015 + Math.random() * 0.03})`
    g.fillRect(Math.random() * W, y, l, 1)
  }
  grime(g, W, H, 60, 0.18)

  // recessed side channels
  g.fillStyle = '#232a35'
  g.fillRect(0, 0, 20, H)
  g.fillRect(W - 20, 0, 20, H)
  bg.fillStyle = '#404040'
  bg.fillRect(0, 0, 20, H)
  bg.fillRect(W - 20, 0, 20, H)
  g.fillStyle = 'rgba(0,0,0,0.5)'
  g.fillRect(20, 0, 2, H)
  g.fillRect(W - 22, 0, 2, H)
  g.fillStyle = 'rgba(255,255,255,0.08)'
  g.fillRect(23, 0, 1, H)
  g.fillRect(W - 24, 0, 1, H)

  // ice trim lines running the length
  g.fillStyle = 'rgba(61,224,255,0.22)'
  g.fillRect(26, 0, 2, H)
  g.fillRect(W - 28, 0, 2, H)
  eg.fillStyle = 'rgba(61,224,255,0.55)'
  eg.fillRect(26, 0, 2, H)
  eg.fillRect(W - 28, 0, 2, H)

  for (let y = 0; y < H; y += 64) {
    // panel seam
    g.fillStyle = 'rgba(0,0,0,0.45)'
    g.fillRect(30, y + 50, W - 60, 3)
    g.fillStyle = 'rgba(255,255,255,0.07)'
    g.fillRect(30, y + 53, W - 60, 1)
    bg.fillStyle = '#303030'
    bg.fillRect(30, y + 49, W - 60, 4)

    // bolts
    for (const bx of [40, W - 50]) {
      g.fillStyle = '#5a6574'
      g.fillRect(bx, y + 12, 10, 10)
      g.fillStyle = '#1a1f28'
      g.fillRect(bx + 3, y + 15, 4, 4)
      bg.fillStyle = '#c0c0c0'
      bg.fillRect(bx, y + 12, 10, 10)
      bg.fillStyle = '#303030'
      bg.fillRect(bx + 3, y + 15, 4, 4)
    }

    // sodium indicator slit
    const lit = (y / 64) % 3 !== 1
    g.fillStyle = lit ? '#e8a030' : '#3a2a14'
    g.fillRect(124, y + 8, 3, 40)
    if (lit) {
      eg.fillStyle = 'rgba(232,160,48,0.9)'
      eg.fillRect(124, y + 8, 3, 40)
    }

    // vent grille
    if ((y / 64) % 2 === 0) {
      for (let k = 0; k < 6; k++) {
        g.fillStyle = 'rgba(0,0,0,0.55)'
        g.fillRect(70, y + 18 + k * 5, 40, 2)
        bg.fillStyle = '#404040'
        bg.fillRect(70, y + 18 + k * 5, 40, 2)
      }
      g.fillStyle = 'rgba(0,0,0,0.55)'
      for (let k = 0; k < 6; k++) g.fillRect(W - 110, y + 18 + k * 5, 40, 2)
    }

    // tiny status LEDs
    const ledOn = Math.random() > 0.3
    g.fillStyle = ledOn ? '#3de0ff' : '#1a3a44'
    g.fillRect(W - 62, y + 40, 4, 4)
    if (ledOn) {
      eg.fillStyle = '#3de0ff'
      eg.fillRect(W - 62, y + 40, 4, 4)
    }
  }

  const map = texture(c, true)
  const bump = texture(bc, false)
  const emissive = texture(ec, true)
  return { map, bump, emissive }
}

// Square plate used on bulkheads / pylons. 1 tile = 2 world units.
function plateMap() {
  const S = 256
  const [c, g] = canvas(S, S)
  const [bc, bg] = canvas(S, S)
  g.fillStyle = '#4a5364'
  g.fillRect(0, 0, S, S)
  bg.fillStyle = '#808080'
  bg.fillRect(0, 0, S, S)
  for (let i = 0; i < 500; i++) {
    g.fillStyle = `rgba(255,255,255,${0.01 + Math.random() * 0.03})`
    g.fillRect(Math.random() * S, Math.random() * S, 1, 10 + Math.random() * 40)
  }
  grime(g, S, S, 40, 0.16)

  // seams into 2x2 sub-plates
  g.fillStyle = 'rgba(0,0,0,0.5)'
  g.fillRect(0, S / 2 - 2, S, 4)
  g.fillRect(S / 2 - 2, 0, 4, S)
  bg.fillStyle = '#303030'
  bg.fillRect(0, S / 2 - 2, S, 4)
  bg.fillRect(S / 2 - 2, 0, 4, S)

  // hazard chevrons in one sub-plate
  g.save()
  g.beginPath()
  g.rect(8, 8, S / 2 - 16, S / 2 - 16)
  g.clip()
  for (let k = -S; k < S; k += 28) {
    g.fillStyle = '#c98a26'
    g.beginPath()
    g.moveTo(k, 0)
    g.lineTo(k + 14, 0)
    g.lineTo(k + 14 + S, S)
    g.lineTo(k + S, S)
    g.closePath()
    g.fill()
  }
  grime(g, S / 2, S / 2, 20, 0.3)
  g.restore()

  // rivets
  for (const [x, y] of [
    [12, 12],
    [S / 2 - 12, 12],
    [12, S / 2 - 12],
    [S / 2 - 12, S / 2 - 12],
    [S / 2 + 12, S / 2 + 12],
    [S - 12, S / 2 + 12],
    [S / 2 + 12, S - 12],
    [S - 12, S - 12],
  ]) {
    g.fillStyle = '#6a7585'
    g.beginPath()
    g.arc(x, y, 4, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#20262f'
    g.beginPath()
    g.arc(x + 1, y + 1, 1.6, 0, Math.PI * 2)
    g.fill()
    bg.fillStyle = '#d0d0d0'
    bg.beginPath()
    bg.arc(x, y, 4, 0, Math.PI * 2)
    bg.fill()
  }
  const map = texture(c, true)
  const bump = texture(bc, false)
  map.repeat.set(0.5, 0.5)
  bump.repeat.set(0.5, 0.5)
  return { map, bump }
}

export function makeFrameMaterial(color) {
  return new THREE.ShaderMaterial({
    vertexShader: FRAME_VERT,
    fragmentShader: FRAME_FRAG,
    uniforms: {
      uTime: SHARED.uTime,
      uFogDensity: SHARED.uFogDensity,
      uColor: { value: new THREE.Color(color) },
      uSize: { value: new THREE.Vector2(1, 1) },
      uHalf: { value: new THREE.Vector2(0.5, 0.5) },
      uMode: { value: 0 },
      uEdgeSign: { value: 1 },
      uProx: { value: 0 },
      uHit: { value: 0 },
      uFade: { value: 1 },
      uSeed: { value: Math.random() },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  })
}

export function makeRingMaterial(color) {
  return new THREE.ShaderMaterial({
    vertexShader: FRAME_VERT,
    fragmentShader: RING_FRAG,
    uniforms: {
      uFogDensity: SHARED.uFogDensity,
      uColor: { value: new THREE.Color(color) },
      uSize: { value: new THREE.Vector2(1, 1) },
      uHalf: { value: new THREE.Vector2(0, 0) },
      uExpand: { value: 3 },
      uT: { value: 0 },
      uFade: { value: 1 },
    },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  })
}

export function makeOrbMaterial(color) {
  return new THREE.ShaderMaterial({
    vertexShader: ORB_VERT,
    fragmentShader: ORB_FRAG,
    uniforms: {
      uTime: SHARED.uTime,
      uFogDensity: SHARED.uFogDensity,
      uColor: { value: new THREE.Color(color) },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
}

export function makeHaloMaterial(color) {
  return new THREE.ShaderMaterial({
    vertexShader: FRAME_VERT,
    fragmentShader: HALO_FRAG,
    uniforms: {
      uTime: SHARED.uTime,
      uFogDensity: SHARED.uFogDensity,
      uColor: { value: new THREE.Color(color) },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  })
}

export function chevronMap() {
  const S = 128
  const [c, g] = canvas(S, S)
  g.clearRect(0, 0, S, S)
  g.lineJoin = 'round'
  g.lineCap = 'round'
  g.shadowColor = 'rgba(255, 209, 102, 0.95)'
  g.shadowBlur = 14

  function chevron(ox) {
    g.beginPath()
    g.moveTo(ox - 18, 28)
    g.lineTo(ox + 14, 64)
    g.lineTo(ox - 18, 100)
  }

  g.strokeStyle = '#ffd166'
  g.lineWidth = 14
  chevron(52)
  g.stroke()
  chevron(84)
  g.stroke()

  g.shadowBlur = 0
  g.strokeStyle = '#fff6d8'
  g.lineWidth = 6
  chevron(52)
  g.stroke()
  chevron(84)
  g.stroke()

  const tex = texture(c, true)
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.needsUpdate = true
  return tex
}

export function plusMap() {
  const S = 128
  const [c, g] = canvas(S, S)
  g.clearRect(0, 0, S, S)
  g.lineJoin = 'round'
  g.lineCap = 'round'
  g.shadowColor = 'rgba(61, 255, 138, 0.95)'
  g.shadowBlur = 14

  function plus() {
    g.beginPath()
    g.moveTo(64, 22)
    g.lineTo(64, 106)
    g.moveTo(22, 64)
    g.lineTo(106, 64)
  }

  g.strokeStyle = '#3dff8a'
  g.lineWidth = 18
  plus()
  g.stroke()

  g.shadowBlur = 0
  g.strokeStyle = '#e8fff0'
  g.lineWidth = 8
  plus()
  g.stroke()

  const tex = texture(c, true)
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.needsUpdate = true
  return tex
}

export function makeRibMaterial(color, base, pulseScale) {
  return new THREE.ShaderMaterial({
    vertexShader: RIB_VERT,
    fragmentShader: RIB_FRAG,
    uniforms: {
      uTime: SHARED.uTime,
      uKick: SHARED.uKick,
      uFogDensity: SHARED.uFogDensity,
      uColor: { value: new THREE.Color(color) },
      uBase: { value: base },
      uPulseScale: { value: pulseScale },
    },
  })
}

export function makeLaserMaterial(color, edgeSign) {
  return new THREE.ShaderMaterial({
    vertexShader: LASER_VERT,
    fragmentShader: LASER_FRAG,
    uniforms: {
      uTime: SHARED.uTime,
      uFogDensity: SHARED.uFogDensity,
      uColor: { value: new THREE.Color(color) },
      uEdgeSign: { value: edgeSign },
    },
  })
}

export function makePylonMaterial(color) {
  return new THREE.ShaderMaterial({
    vertexShader: PYLON_VERT,
    fragmentShader: PYLON_FRAG,
    uniforms: {
      uTime: SHARED.uTime,
      uFogDensity: SHARED.uFogDensity,
      uColor: { value: new THREE.Color(color) },
    },
    depthWrite: true,
    side: THREE.DoubleSide,
  })
}

export function createMaterials() {
  const wall = conduitMaps()
  const plate = plateMap()

  const metal = new THREE.MeshStandardMaterial({
    color: 0xaab4c2,
    map: wall.map,
    bumpMap: wall.bump,
    bumpScale: 0.035,
    emissiveMap: wall.emissive,
    emissive: 0xffffff,
    emissiveIntensity: 0.9,
    roughness: 0.58,
    metalness: 0.3,
  })
  const metalHi = new THREE.MeshStandardMaterial({
    color: 0x7a8494,
    roughness: 0.42,
    metalness: 0.6,
    emissive: 0x10141c,
    emissiveIntensity: 0.4,
  })
  const plateMat = new THREE.MeshStandardMaterial({
    color: 0x9aa4b4,
    map: plate.map,
    bumpMap: plate.bump,
    bumpScale: 0.03,
    roughness: 0.5,
    metalness: 0.35,
  })
  const ribIce = makeRibMaterial(THEME.ice, 0.5, 0.09)
  const ribSodium = makeRibMaterial(THEME.sodium, 0.45, 0.09)
  const stripIce = makeRibMaterial(THEME.ice, 0.18, 0.05)
  const laserTop = makeLaserMaterial(THEME.mag, -1)
  const laserBot = makeLaserMaterial(THEME.mag, 1)
  const laser = new THREE.MeshStandardMaterial({
    color: THEME.mag,
    emissive: THEME.mag,
    emissiveIntensity: 2.4,
    roughness: 0.3,
    metalness: 0.1,
  })
  const hatch = new THREE.MeshStandardMaterial({
    color: THEME.ice,
    emissive: THEME.ice,
    emissiveIntensity: 0.65,
    roughness: 0.35,
    metalness: 0.15,
  })
  const pylon = makePylonMaterial(THEME.sodium)
  const pylonEdge = new THREE.MeshStandardMaterial({
    color: THEME.sodium,
    emissive: THEME.sodium,
    emissiveIntensity: 1.8,
    roughness: 0.28,
    metalness: 0.12,
  })
  const birdBody = new THREE.MeshStandardMaterial({
    color: THEME.graphite,
    roughness: 0.5,
    metalness: 0.7,
  })
  const birdBelly = new THREE.MeshStandardMaterial({
    color: THEME.belly,
    roughness: 0.4,
    metalness: 0.25,
  })
  const birdTrim = new THREE.MeshStandardMaterial({
    color: THEME.mag,
    emissive: THEME.mag,
    emissiveIntensity: 1.6,
    roughness: 0.4,
    metalness: 0.3,
  })
  const beak = new THREE.MeshStandardMaterial({
    color: 0xb8c0c8,
    roughness: 0.35,
    metalness: 0.75,
  })
  return {
    metal,
    metalHi,
    plate: plateMat,
    ribIce,
    ribSodium,
    stripIce,
    laser,
    laserTop,
    laserBot,
    hatch,
    pylon,
    pylonEdge,
    birdBody,
    birdBelly,
    birdTrim,
    beak,
  }
}

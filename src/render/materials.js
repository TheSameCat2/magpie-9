import * as THREE from 'three'
import { THEME } from '../config/theme.js'
import { UNIFORMS } from './uniforms.js'
import { createConduitTextures, createPlateTextures } from './textures.js'
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
  SHAFT_VERT,
  SHAFT_FRAG,
  SHOCK_CONE_VERT,
  SHOCK_CONE_FRAG,
} from './shaders.js'

/** Additive, non-depth-writing glow material: the default look for every emissive overlay. */
function glowMaterial(vertexShader, fragmentShader, uniforms, extra = {}) {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    ...extra,
  })
}

function colorUniform(color) {
  return { value: new THREE.Color(color) }
}

/** Gate outline. `uMode` picks hatch / band / edge; see FRAME_FRAG. */
export function createFrameMaterial(color) {
  return glowMaterial(FRAME_VERT, FRAME_FRAG, {
    uTime: UNIFORMS.uTime,
    uFogDensity: UNIFORMS.uFogDensity,
    uColor: colorUniform(color),
    uSize: { value: new THREE.Vector2(1, 1) },
    uHalf: { value: new THREE.Vector2(0.5, 0.5) },
    uMode: { value: 0 },
    uEdgeSign: { value: 1 },
    uProx: { value: 0 },
    uHit: { value: 0 },
    uFade: { value: 1 },
    uSeed: { value: Math.random() },
  })
}

/** Expanding shockwave fired when a gate is threaded. */
export function createRingMaterial(color) {
  return glowMaterial(
    FRAME_VERT,
    RING_FRAG,
    {
      uFogDensity: UNIFORMS.uFogDensity,
      uColor: colorUniform(color),
      uSize: { value: new THREE.Vector2(1, 1) },
      uHalf: { value: new THREE.Vector2(0, 0) },
      uExpand: { value: 3 },
      uT: { value: 0 },
      uFade: { value: 1 },
    },
    { depthTest: false },
  )
}

export function createOrbMaterial(color) {
  return glowMaterial(
    ORB_VERT,
    ORB_FRAG,
    {
      uTime: UNIFORMS.uTime,
      uFogDensity: UNIFORMS.uFogDensity,
      uColor: colorUniform(color),
    },
    { side: THREE.FrontSide },
  )
}

export function createHaloMaterial(color) {
  return glowMaterial(FRAME_VERT, HALO_FRAG, {
    uTime: UNIFORMS.uTime,
    uFogDensity: UNIFORMS.uFogDensity,
    uColor: colorUniform(color),
  })
}

export function createRibMaterial(color, base, pulseScale) {
  return new THREE.ShaderMaterial({
    vertexShader: RIB_VERT,
    fragmentShader: RIB_FRAG,
    uniforms: {
      uTime: UNIFORMS.uTime,
      uKick: UNIFORMS.uKick,
      uHazard: UNIFORMS.uHazard,
      uOverdrive: UNIFORMS.uOverdrive,
      uFogDensity: UNIFORMS.uFogDensity,
      uColor: colorUniform(color),
      uBase: { value: base },
      uPulseScale: { value: pulseScale },
    },
  })
}

export function createShockConeMaterial(color = THEME.ice) {
  return glowMaterial(
    SHOCK_CONE_VERT,
    SHOCK_CONE_FRAG,
    {
      uTime: UNIFORMS.uTime,
      uOverdrive: UNIFORMS.uOverdrive,
      uFogDensity: UNIFORMS.uFogDensity,
      uColor: colorUniform(color),
    },
    { side: THREE.DoubleSide },
  )
}

export function createShaftMaterial(color = THEME.ice, intensity = 0.28) {
  return glowMaterial(
    SHAFT_VERT,
    SHAFT_FRAG,
    {
      uTime: UNIFORMS.uTime,
      uFogDensity: UNIFORMS.uFogDensity,
      uColor: colorUniform(color),
      uIntensity: { value: intensity },
    },
    { side: THREE.DoubleSide },
  )
}

export function createLaserMaterial(color, edgeSign) {
  return new THREE.ShaderMaterial({
    vertexShader: LASER_VERT,
    fragmentShader: LASER_FRAG,
    uniforms: {
      uTime: UNIFORMS.uTime,
      uFogDensity: UNIFORMS.uFogDensity,
      uColor: colorUniform(color),
      uEdgeSign: { value: edgeSign },
    },
  })
}

export function createPylonMaterial(color) {
  return new THREE.ShaderMaterial({
    vertexShader: PYLON_VERT,
    fragmentShader: PYLON_FRAG,
    uniforms: {
      uTime: UNIFORMS.uTime,
      uFogDensity: UNIFORMS.uFogDensity,
      uColor: colorUniform(color),
    },
    depthWrite: true,
    side: THREE.DoubleSide,
  })
}

/** Self-lit MeshStandardMaterial in one colour. */
function emissiveMetal(color, emissiveIntensity, roughness, metalness) {
  return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity, roughness, metalness })
}

/** Every shared, non-per-instance material, built once at boot. */
export function createMaterials() {
  const wall = createConduitTextures()
  const plate = createPlateTextures()

  return {
    metal: new THREE.MeshStandardMaterial({
      color: 0xaab4c2,
      map: wall.map,
      bumpMap: wall.bump,
      bumpScale: 0.035,
      roughnessMap: wall.roughness,
      emissiveMap: wall.emissive,
      emissive: 0xffffff,
      emissiveIntensity: 0.9,
      roughness: 0.85,
      metalness: 0.35,
    }),
    metalHi: new THREE.MeshStandardMaterial({
      color: 0x7a8494,
      roughness: 0.42,
      metalness: 0.6,
      emissive: 0x10141c,
      emissiveIntensity: 0.4,
    }),
    plate: new THREE.MeshStandardMaterial({
      color: 0x9aa4b4,
      map: plate.map,
      bumpMap: plate.bump,
      bumpScale: 0.03,
      roughness: 0.5,
      metalness: 0.35,
    }),
    ribIce: createRibMaterial(THEME.ice, 0.5, 0.09),
    ribSodium: createRibMaterial(THEME.sodium, 0.45, 0.09),
    stripIce: createRibMaterial(THEME.ice, 0.18, 0.05),
    volumetricShaft: createShaftMaterial(THEME.ice, 0.26),
    laserTop: createLaserMaterial(THEME.mag, -1),
    laserBot: createLaserMaterial(THEME.mag, 1),
    hatch: emissiveMetal(THEME.ice, 0.65, 0.35, 0.15),
    pylon: createPylonMaterial(THEME.sodium),
    pylonEdge: emissiveMetal(THEME.sodium, 1.8, 0.28, 0.12),
    birdBody: new THREE.MeshStandardMaterial({ color: THEME.graphite, roughness: 0.5, metalness: 0.7 }),
    birdBelly: new THREE.MeshStandardMaterial({ color: THEME.belly, roughness: 0.4, metalness: 0.25 }),
    birdTrim: emissiveMetal(THEME.mag, 1.6, 0.4, 0.3),
    beak: new THREE.MeshStandardMaterial({ color: 0xb8c0c8, roughness: 0.35, metalness: 0.75 }),
  }
}

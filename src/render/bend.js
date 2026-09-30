// Vertex-side conduit bend. Gameplay and geometry stay in straight path
// space; world vertex shaders pass their world position through bendWorld,
// which reads the centreline table in UNIFORMS.uBend (see lib/centreline.js
// for the layout and the CPU twin, bendPoint). A straight table is the
// identity, so every mode shares the same shaders.

import { BEND_NEAR, BEND_SAMPLES, BEND_STEP } from '../config/bends.js'
import { UNIFORMS } from './uniforms.js'

const f = (n) => (Number.isInteger(n) ? `${n}.0` : String(n))

export const BEND_GLSL = /* glsl */ `
uniform vec3 uBend[${BEND_SAMPLES}];

// Centreline (x, z, heading) at distance d ahead; straight past either end of the table.
vec3 bendFrame(float d) {
  float f = (d - ${f(BEND_NEAR)}) / ${f(BEND_STEP)};
  float last = ${f(BEND_SAMPLES - 1)};
  if (f <= 0.0 || f >= last) {
    vec3 row = f <= 0.0 ? uBend[0] : uBend[${BEND_SAMPLES - 1}];
    float s = (f <= 0.0 ? f : f - last) * ${f(BEND_STEP)};
    return vec3(row.x + sin(row.z) * s, row.y - cos(row.z) * s, row.z);
  }
  int i = int(floor(f));
  return mix(uBend[i], uBend[i + 1], f - float(i));
}

vec3 bendWorld(vec3 w) {
  vec3 c = bendFrame(-w.z);
  return vec3(c.x + w.x * cos(c.z), w.y, c.y + w.x * sin(c.z));
}

// A world-space direction at path depth z, turned with the conduit.
vec3 bendDirection(vec3 n, float z) {
  float psi = bendFrame(-z).z;
  float c = cos(psi);
  float s = sin(psi);
  return vec3(n.x * c - n.z * s, n.y, n.x * s + n.z * c);
}

vec4 bendModelView(vec3 p) {
  vec4 w = modelMatrix * vec4(p, 1.0);
  return viewMatrix * vec4(bendWorld(w.xyz), 1.0);
}

vec3 bendViewNormal(vec3 n, vec3 p) {
  float z = (modelMatrix * vec4(p, 1.0)).z;
  return normalize(mat3(viewMatrix) * bendDirection(normalize(mat3(modelMatrix) * n), z));
}
`

const PROJECT = /* glsl */ `
vec4 mvPosition = bendModelView(transformed);
gl_Position = projectionMatrix * mvPosition;
`

const NORMAL = /* glsl */ `
#include <defaultnormal_vertex>
transformedNormal = bendViewNormal(objectNormal, position);
`

/**
 * Bend a built-in material (standard, basic, line). Returns the material.
 * Instancing and skinning are not used on bent meshes, so project_vertex
 * can be replaced outright.
 */
export function bendMaterial(material) {
  const previous = material.onBeforeCompile
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer)
    shader.uniforms.uBend = UNIFORMS.uBend
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', `${BEND_GLSL}\nvoid main() {`)
      .replace('#include <project_vertex>', PROJECT)
    if (shader.vertexShader.includes('#include <defaultnormal_vertex>')) {
      shader.vertexShader = shader.vertexShader.replace('#include <defaultnormal_vertex>', NORMAL)
    }
  }
  const key = material.customProgramCacheKey?.bind(material)
  material.customProgramCacheKey = () => `bend|${key ? key() : ''}`
  return material
}

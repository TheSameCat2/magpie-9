import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { bendMaterial } from './bend.js'

/** Run the bend hook against a shader source, without needing a WebGL renderer. */
function compile(material, source) {
  const shader = {
    uniforms: {},
    vertexShader: source.vertexShader,
    fragmentShader: source.fragmentShader,
  }
  bendMaterial(material)
  material.onBeforeCompile(shader)
  return shader
}

test('basic and line bent shaders do not reference the normal-only bent model-view', () => {
  for (const material of [new THREE.MeshBasicMaterial(), new THREE.LineBasicMaterial()]) {
    const shader = compile(material, THREE.ShaderLib.basic)
    assert.ok(
      !shader.vertexShader.includes('_bendMv'),
      'defaultnormal_vertex is conditional in the basic shader; _bendMv must not be used there',
    )
    assert.ok(
      shader.vertexShader.includes('bendModelView(transformed)'),
      'basic/line materials use the position-only project path',
    )
  }
})

test('lit bent shaders reuse the bent model-view and normal', () => {
  const shader = compile(new THREE.MeshStandardMaterial(), THREE.ShaderLib.physical)
  assert.ok(shader.vertexShader.includes('vec4 _bendMv;'))
  assert.ok(
    shader.vertexShader.includes(
      'bendModelViewAndNormal(position, objectNormal, _bendMv, transformedNormal);',
    ),
  )
  assert.ok(shader.vertexShader.includes('vec4 mvPosition = _bendMv;'))
})

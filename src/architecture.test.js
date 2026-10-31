// Architecture tests: the layer rules in AGENTS.md are only real if someone
// checks them. This walks the import graph rather than trusting review.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'src')

// Higher number = lower layer. main.js is the composition root (0).
const LAYERS = { game: 1, hud: 2, world: 2, audio: 2, render: 3, platform: 4, config: 5, lib: 5 }

const IMPORT_RE = /^\s*(?:import|export)\s+(?:[^'"\n]*?\s+from\s+)?['"]([^'"]+)['"]/gm

function jsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return jsFiles(full)
    return entry.name.endsWith('.js') && !entry.name.endsWith('.test.js') ? [full] : []
  })
}

function importsOf(file) {
  const source = fs.readFileSync(file, 'utf8')
  const out = []
  for (const match of source.matchAll(IMPORT_RE)) {
    const spec = match[1]
    if (!spec.startsWith('.')) continue
    let target = path.resolve(path.dirname(file), spec)
    if (!fs.existsSync(target)) target = `${target}.js`
    if (fs.existsSync(target)) out.push(target)
  }
  return out
}

function layerOf(file) {
  const [top] = path.relative(SRC, file).split(path.sep)
  return LAYERS[top] ?? 0
}

function srcGraph() {
  const files = jsFiles(SRC)
  const edges = new Map(
    files.map((file) => [file, importsOf(file).filter((target) => target.startsWith(SRC))]),
  )
  return { files, edges }
}

test('src imports only point down the layer stack', () => {
  const { edges } = srcGraph()
  const violations = []
  for (const [file, targets] of edges) {
    for (const target of targets) {
      if (layerOf(target) < layerOf(file)) {
        const from = path.relative(ROOT, file)
        const to = path.relative(ROOT, target)
        violations.push(`${from} (layer ${layerOf(file)}) -> ${to} (layer ${layerOf(target)})`)
      }
    }
  }
  assert.deepEqual(violations, [], `upward imports:\n${violations.join('\n')}`)
})

test('src has no import cycles', () => {
  const { files, edges } = srcGraph()
  const state = new Map()
  const stack = []
  const cycles = []

  function visit(file) {
    if (state.get(file) === 'done') return
    if (state.get(file) === 'active') {
      cycles.push([...stack.slice(stack.indexOf(file)), file].map((f) => path.relative(ROOT, f)).join(' -> '))
      return
    }
    state.set(file, 'active')
    stack.push(file)
    for (const next of edges.get(file) ?? []) visit(next)
    stack.pop()
    state.set(file, 'done')
  }

  for (const file of files) visit(file)
  assert.deepEqual(cycles, [], `cycles:\n${cycles.join('\n')}`)
})

test('api imports only config/ and lib/ from src', () => {
  const violations = []
  for (const file of jsFiles(path.join(ROOT, 'api'))) {
    for (const target of importsOf(file)) {
      if (!target.startsWith(SRC)) continue
      const rel = path.relative(SRC, target).split(path.sep)[0]
      if (rel !== 'config' && rel !== 'lib') {
        violations.push(`${path.relative(ROOT, file)} -> ${path.relative(ROOT, target)}`)
      }
    }
  }
  assert.deepEqual(violations, [], `API may not import game/render/world:\n${violations.join('\n')}`)
})

test('desktop never imports the game', () => {
  const violations = []
  for (const file of jsFiles(path.join(ROOT, 'desktop', 'src'))) {
    for (const target of importsOf(file)) {
      if (target.startsWith(SRC)) {
        violations.push(`${path.relative(ROOT, file)} -> ${path.relative(ROOT, target)}`)
      }
    }
  }
  assert.deepEqual(violations, [], `desktop must not import src/:\n${violations.join('\n')}`)
})

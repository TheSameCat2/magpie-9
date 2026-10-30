// The HUD reads the single index.html by id and throws at boot when an id is
// missing. This test keeps that contract honest without needing a browser.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SETTINGS_ROWS } from './copy.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const HUD = path.join(ROOT, 'src', 'hud')

function hudFiles(dir = HUD) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return hudFiles(full)
    return entry.name.endsWith('.js') && !entry.name.endsWith('.test.js') ? [full] : []
  })
}

test('every HUD id lookup exists in index.html', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]))
  const missing = []

  for (const file of hudFiles()) {
    const source = fs.readFileSync(file, 'utf8')
    for (const match of source.matchAll(/\b(?:byId|getElementById)\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      if (!ids.has(match[1])) missing.push(`${path.relative(ROOT, file)}: #${match[1]}`)
    }
    // Selector helpers can take an id too: query('#x .y') / queryAll('#x .y').
    for (const match of source.matchAll(/\bquery(?:All)?\(\s*['"]([^'"]+)['"]/g)) {
      for (const idMatch of match[1].matchAll(/#([\w-]+)/g)) {
        if (!ids.has(idMatch[1])) missing.push(`${path.relative(ROOT, file)}: ${match[1]}`)
      }
    }
  }

  assert.deepEqual(missing, [], `HUD ids missing from index.html:\n${missing.join('\n')}`)
})

test('settings rows follow the copy order', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
  const rows = [...html.matchAll(/data-setting="([^"]+)"/g)].map((match) => match[1])
  assert.deepEqual(rows, [...SETTINGS_ROWS])
})

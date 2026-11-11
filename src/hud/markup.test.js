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

test('index.html and manifest declare dark color-scheme, persistent main landmark, referrer policy, and no audio preload', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
  assert.match(html, /<meta\s+name="color-scheme"\s+content="dark"\s*\/>/)
  assert.doesNotMatch(html, /rel="preload"[^>]*magpie-melody\.mp3/)
  assert.match(
    html,
    /<link[\s\S]*?href="https:\/\/fonts\.googleapis\.com\/css2\?[^"]+"[\s\S]*?referrerpolicy="no-referrer"[\s\S]*?\/>/,
  )
  assert.match(html, /<main id="hud">[\s\S]*<\/main>/)

  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'manifest.webmanifest'), 'utf8'))
  assert.equal(manifest.id, '/')
  assert.equal(typeof manifest.description, 'string')
  assert.ok(manifest.description.length > 0)
})

test('index.html uses semantic headings, list roles, tabpanel, grouped settings, and non-live entry slots', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')

  assert.doesNotMatch(html, /<div[^>]*class="[^"]*\b(?:overlay-title|settings-h|help-orb-name)\b/)
  assert.equal([...html.matchAll(/<h2\b[^>]*class="overlay-title"/g)].length, 11)
  assert.equal([...html.matchAll(/<h3\b[^>]*class="settings-h"/g)].length, 2)
  assert.equal([...html.matchAll(/<h4\b[^>]*class="help-orb-name"/g)].length, 3)

  assert.match(html, /<div id="lives"[^>]*\brole="img"/)
  assert.match(html, /<ol id="scoresList"[^>]*\brole="list"/)
  assert.equal([...html.matchAll(/<ul class="help-list" role="list">/g)].length, 4)

  assert.match(html, /<div id="scoresPanel" role="tabpanel" aria-labelledby="scoreTabRun" tabindex="0">/)
  for (const id of ['scoreTabRun', 'scoreTabBends', 'scoreTabChallenge']) {
    assert.match(html, new RegExp(`id="${id}"`))
  }

  assert.doesNotMatch(html, /class="settings-row[^"]*"[^>]*aria-current/)
  assert.equal([...html.matchAll(/class="settings-row[^"]*"[^>]*role="group"/g)].length, 4)
  assert.equal(
    [...html.matchAll(/data-quality="[^"]+"[\s\S]*?aria-describedby="settingsQualityCaption"/g)].length,
    4,
  )
  assert.match(html, /<output id="settingsLive" class="sr-only" aria-live="polite"><\/output>/)

  assert.doesNotMatch(html, /class="entry-slots"[^>]*aria-live/)
  for (const slot of [0, 1, 2]) {
    assert.match(html, new RegExp(`<b id="entrySlot${slot}">A<\\/b>`))
    assert.equal([...html.matchAll(new RegExp(`aria-describedby="entrySlot${slot}"`, 'g'))].length, 2)
  }
  for (const n of [1, 2, 3]) {
    assert.match(html, new RegExp(`aria-label="Letter ${n} up"`))
    assert.match(html, new RegExp(`aria-label="Letter ${n} down"`))
  }
  assert.match(html, /<output id="entryLive" class="sr-only" aria-live="polite"><\/output>/)

  assert.match(html, /<div id="paused" class="overlay hidden" role="status"/)
  assert.doesNotMatch(html, /<div id="paused"[^>]*aria-modal/)
  assert.match(html, /<div id="respawn" class="overlay hidden" role="status"/)
  assert.doesNotMatch(html, /<div id="respawn"[^>]*aria-modal/)
  assert.match(html, /<div[\s\S]*?id="rotate"[\s\S]*?tabindex="-1"/)
})

test('HUD modules contain zero HTML string sinks', () => {
  const htmlSink = new RegExp(`\\b(?:inner${'HTML'}|outer${'HTML'}|insertAdjacent${'HTML'})\\b`)
  for (const file of hudFiles()) {
    const source = fs.readFileSync(file, 'utf8')
    assert.doesNotMatch(source, htmlSink, `${path.relative(ROOT, file)} uses an HTML sink`)
  }
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  UPDATE_LABEL,
  UPDATE_LATER,
  UPDATE_LATER_CHANNEL,
  UPDATE_READY,
  UPDATE_RESTART,
  UPDATE_RESTART_CHANNEL,
  isPortableEnv,
  shouldCheckForUpdates,
} from './updates.js'

const here = path.dirname(fileURLToPath(import.meta.url))

test('updates are checked only for a packaged non-portable install', () => {
  assert.equal(shouldCheckForUpdates({ packaged: false, portable: false }), false)
  assert.equal(shouldCheckForUpdates({ packaged: false, portable: true }), false)
  assert.equal(shouldCheckForUpdates({ packaged: true, portable: true }), false)
  assert.equal(shouldCheckForUpdates({ packaged: true, portable: false }), true)
  assert.equal(isPortableEnv({}), false)
  assert.equal(isPortableEnv({ PORTABLE_EXECUTABLE_FILE: 'C:\\game.exe' }), true)
  assert.equal(isPortableEnv({ PORTABLE_EXECUTABLE_DIR: 'C:\\tmp' }), true)
})

test('the preload banner uses the same prompt copy and channels as the shell', () => {
  const preload = fs.readFileSync(path.join(here, 'preload.cjs'), 'utf8')
  const main = fs.readFileSync(path.join(here, 'main.js'), 'utf8')
  for (const text of [
    UPDATE_LABEL,
    UPDATE_RESTART,
    UPDATE_LATER,
    UPDATE_READY,
    UPDATE_RESTART_CHANNEL,
    UPDATE_LATER_CHANNEL,
  ]) {
    assert.ok(preload.includes(text), `preload missing ${text}`)
  }
  assert.match(main, /checkForUpdates\(/)
  assert.match(main, /quitAndInstall\(false, true\)/)
  assert.match(main, /autoDownload = true/)
  assert.doesNotMatch(main, /publisherName/)
  assert.doesNotMatch(preload, /contextBridge\.exposeInMainWorld\(\s*'magpieDesktop'[\s\S]*update/i)
})

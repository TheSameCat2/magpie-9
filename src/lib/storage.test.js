import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { loadBest, loadChallengeBest, loadMuted, saveBest, saveChallengeBest, saveMuted } from './storage.js'

beforeEach(() => {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  }
})

test('best defaults to zero and round-trips', () => {
  assert.equal(loadBest(), 0)
  saveBest(17)
  assert.equal(loadBest(), 17)
})

test('challenge best only improves', () => {
  assert.equal(loadChallengeBest('2026-09-14'), 0)
  assert.equal(saveChallengeBest('2026-09-14', 60_000), 60_000)
  assert.equal(saveChallengeBest('2026-09-14', 70_000), 60_000)
  assert.equal(saveChallengeBest('2026-09-14', 50_000), 50_000)
  assert.equal(loadChallengeBest(null), 0)
})

test('mute flag round-trips', () => {
  assert.equal(loadMuted(), false)
  saveMuted(true)
  assert.equal(loadMuted(), true)
})

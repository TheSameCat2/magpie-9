import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  loadBest,
  loadChallengeBest,
  loadMuted,
  loadQualityChoice,
  loadVolumes,
  saveBest,
  saveChallengeBest,
  saveMuted,
  saveQualityChoice,
  saveVolume,
} from './storage.js'

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

test('the BENDS best is kept apart from the plain run best', () => {
  saveBest(17)
  saveBest(9, 'bends')
  assert.equal(loadBest(), 17)
  assert.equal(loadBest('run'), 17)
  assert.equal(loadBest('bends'), 9)
  assert.equal(localStorage.getItem('magpie9.bends.best'), '9')
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

test('volume channels default to full, and zero is a real setting', () => {
  assert.deepEqual(loadVolumes(), { master: 1, music: 1, effects: 1 })
  saveVolume('music', 0)
  saveVolume('effects', 0.4)
  saveVolume('nope', 0.2)
  assert.deepEqual(loadVolumes(), { master: 1, music: 0, effects: 0.4 })
  assert.equal(localStorage.getItem('magpie9.volume.music'), '0')
})

test('graphics quality remembers a rung and forgets AUTO', () => {
  assert.equal(loadQualityChoice(), 'auto')
  saveQualityChoice('2')
  assert.equal(loadQualityChoice(), '2')
  assert.equal(localStorage.getItem('magpie9.quality'), '2')
  saveQualityChoice('auto')
  assert.equal(loadQualityChoice(), 'auto')
  assert.equal(localStorage.getItem('magpie9.quality'), null)
  localStorage.setItem('magpie9.quality', 'loud')
  assert.equal(loadQualityChoice(), 'auto')
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MUSIC_CRASH_DIP_S, MUSIC_CRASH_GAIN, MUSIC_CRASH_RECOVER_S, MUSIC_GAIN } from '../config/audio.js'
import { MUSIC_TRACKS, createMusic, shuffleTracks } from './music.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

test('shuffleTracks copies and permutes without touching the source list', () => {
  const tracks = ['a', 'b', 'c']
  assert.deepEqual(
    shuffleTracks(tracks, () => 0),
    ['b', 'c', 'a'],
  )
  assert.deepEqual(
    shuffleTracks(tracks, () => 0.999),
    ['a', 'b', 'c'],
  )
  assert.deepEqual(tracks, ['a', 'b', 'c'])
})

test('the shipped soundtrack file is the session playlist', () => {
  assert.equal(MUSIC_TRACKS.length, 1)
  const name = MUSIC_TRACKS[0].split('/').pop()
  const file = path.join(ROOT, 'public', 'audio', name)
  assert.equal(fs.existsSync(file), true)
  assert.ok(fs.statSync(file).size > 100_000)
})

function harness({ tracks, rand, play } = {}) {
  const elements = []
  function AudioCtor() {
    const listeners = new Map()
    const el = {
      preload: '',
      loop: false,
      src: '',
      paused: true,
      currentTime: 0,
      plays: 0,
      play() {
        this.plays += 1
        this.paused = false
        return play ? play() : Promise.resolve()
      },
      pause() {
        this.paused = true
      },
      addEventListener(type, fn) {
        listeners.set(type, fn)
      },
      emit(type) {
        listeners.get(type)?.()
      },
    }
    elements.push(el)
    return el
  }

  const master = {}
  const gainParam = {
    value: 0,
    calls: [],
    cancelScheduledValues(t) {
      this.calls.push(['cancel', t])
    },
    setValueAtTime(v, t) {
      this.value = v
      this.calls.push(['set', v, t])
    },
    linearRampToValueAtTime(v, t) {
      this.calls.push(['ramp', v, t])
    },
  }
  const gain = {
    gain: gainParam,
    connected: null,
    connect(node) {
      this.connected = node
    },
  }
  let sourceEl = null
  const source = {
    connected: null,
    connect(node) {
      this.connected = node
    },
  }
  const ctx = {
    createGain: () => gain,
    createMediaElementSource(el) {
      sourceEl = el
      return source
    },
  }
  let hook = null
  let built = false
  const graph = {
    now: 5,
    onBuild(fn) {
      hook = fn
    },
    ensure() {
      if (built) return
      built = true
      hook({ ctx, master })
    },
  }
  const music = createMusic(graph, { tracks, rand, AudioCtor })
  return {
    music,
    elements,
    gainParam,
    master,
    gain,
    source,
    sourceEl: () => sourceEl,
  }
}

test('a single track loops on the master bus and survives a second start', () => {
  const { music, elements, gain, source, master, sourceEl } = harness({ tracks: ['/audio/one.mp3'] })
  music.start()
  music.start()
  const el = elements[0]
  assert.equal(elements.length, 1)
  assert.equal(el.src, '/audio/one.mp3')
  assert.equal(el.loop, true)
  assert.equal(el.preload, 'auto')
  assert.equal(el.plays, 1)
  assert.equal(sourceEl(), el)
  assert.equal(source.connected, gain)
  assert.equal(gain.connected, master)
  assert.equal(gain.gain.value, MUSIC_GAIN)
  el.currentTime = 12
  el.emit('ended')
  assert.equal(el.src, '/audio/one.mp3')
  assert.equal(el.currentTime, 12)
  assert.equal(el.plays, 1)
})

test('a playlist shuffles once, preloads the next song, and advances on ended', () => {
  const { music, elements } = harness({ tracks: ['/a.mp3', '/b.mp3'], rand: () => 0 })
  music.start()
  assert.equal(elements[0].loop, false)
  assert.equal(elements[0].src, '/b.mp3')
  assert.equal(elements[1].src, '/a.mp3')
  assert.equal(elements[1].preload, 'auto')
  elements[0].emit('ended')
  assert.equal(elements[0].src, '/a.mp3')
  assert.equal(elements[0].plays, 2)
  assert.equal(elements[2].src, '/b.mp3')
})

test('suspend pauses the element and resume continues only after it has started', () => {
  const { music, elements } = harness({ tracks: ['/audio/one.mp3'] })
  music.resume()
  assert.equal(elements.length, 0)
  music.start()
  music.suspend()
  assert.equal(elements[0].paused, true)
  music.resume()
  assert.equal(elements[0].paused, false)
  assert.equal(elements[0].plays, 2)
  music.resume()
  assert.equal(elements[0].plays, 2)
})

test('a crash ducks the song and schedules the return to the session level', () => {
  const { music, gainParam } = harness({ tracks: ['/audio/one.mp3'] })
  music.crash()
  assert.deepEqual(gainParam.calls, [])
  music.start()
  music.crash()
  assert.deepEqual(gainParam.calls, [
    ['cancel', 5],
    ['set', MUSIC_GAIN, 5],
    ['ramp', MUSIC_CRASH_GAIN, 5 + MUSIC_CRASH_DIP_S],
    ['ramp', MUSIC_GAIN, 5 + MUSIC_CRASH_DIP_S + MUSIC_CRASH_RECOVER_S],
  ])
})

test('a rejected play() does not escape the gesture start', async () => {
  const { music } = harness({
    tracks: ['/audio/one.mp3'],
    play: () => Promise.reject(new Error('blocked')),
  })
  music.start()
  await new Promise((resolve) => setImmediate(resolve))
})

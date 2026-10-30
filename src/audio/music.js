// Session soundtrack. One audio element streams the current song into the
// master bus, so mute and the gameplay compressor still apply. The order is
// shuffled once per page load and kept across the menu, a crash, and the next
// run. A single track loops; further tracks advance when the element ends.
// Scroll speed does not retune it. The element is paused with the context,
// because suspending the context leaves a media element running.

import {
  clampVolume,
  MUSIC_CRASH_DIP_S,
  MUSIC_CRASH_GAIN,
  MUSIC_CRASH_RECOVER_S,
  MUSIC_GAIN,
} from '../config/audio.js'

function publicUrl(file) {
  const base = import.meta.env?.BASE_URL ?? '/'
  return `${base}audio/${file}`
}

/** Append a file in public/audio to grow the playlist. */
export const MUSIC_TRACKS = [publicUrl('magpie-melody.mp3')]

/** Fisher-Yates copy. `rand` returns a number in [0, 1). */
export function shuffleTracks(tracks, rand = Math.random) {
  const order = tracks.slice()
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const swap = order[i]
    order[i] = order[j]
    order[j] = swap
  }
  return order
}

function playElement(el) {
  const pending = el.play?.()
  if (pending && typeof pending.then === 'function') pending.then(null, () => {})
}

export function createMusic(graph, { tracks = MUSIC_TRACKS, rand = Math.random, AudioCtor, level = 1 } = {}) {
  const order = shuffleTracks(tracks, rand)
  let index = 0
  let el = null
  let gain = null
  let started = false
  let nextSrc = ''
  let channel = clampVolume(level)
  const Ctor = AudioCtor ?? globalThis.Audio

  function restingGain() {
    return MUSIC_GAIN * channel
  }

  graph.onBuild(({ ctx, master }) => {
    if (typeof Ctor !== 'function' || order.length === 0) return
    el = new Ctor()
    el.preload = 'auto'
    el.loop = order.length === 1
    el.src = order[0]
    const source = ctx.createMediaElementSource(el)
    gain = ctx.createGain()
    gain.gain.value = restingGain()
    source.connect(gain)
    gain.connect(master)
    el.addEventListener('ended', advance)
    preloadUpcoming()
  })

  function preloadUpcoming() {
    if (typeof Ctor !== 'function' || order.length < 2) return
    const src = order[(index + 1) % order.length]
    if (src === nextSrc) return
    nextSrc = src
    const upcoming = new Ctor()
    upcoming.preload = 'auto'
    upcoming.src = src
  }

  function advance() {
    if (!el || order.length < 2) return
    index = (index + 1) % order.length
    el.src = order[index]
    preloadUpcoming()
    if (started) playElement(el)
  }

  /** First gesture: build the graph if needed and start the shuffled song. */
  function start() {
    graph.ensure()
    if (!el || (started && !el.paused)) return
    started = true
    playElement(el)
  }

  function suspend() {
    el?.pause()
  }

  function resume() {
    if (!started || !el || !el.paused) return
    playElement(el)
  }

  /** Player music channel. Cancels a crash ramp so the slider wins immediately. */
  function setLevel(next) {
    channel = clampVolume(next)
    if (!gain) return
    const param = gain.gain
    const t = graph.now
    param.cancelScheduledValues(t)
    param.setValueAtTime(restingGain(), t)
  }

  /** Duck under the crash noise, then return to the current music level. */
  function crash() {
    if (!gain) return
    const t = graph.now
    const param = gain.gain
    param.cancelScheduledValues(t)
    param.setValueAtTime(param.value, t)
    param.linearRampToValueAtTime(MUSIC_CRASH_GAIN * channel, t + MUSIC_CRASH_DIP_S)
    param.linearRampToValueAtTime(restingGain(), t + MUSIC_CRASH_DIP_S + MUSIC_CRASH_RECOVER_S)
  }

  return {
    start,
    suspend,
    resume,
    crash,
    setLevel,
    get level() {
      return channel
    },
  }
}

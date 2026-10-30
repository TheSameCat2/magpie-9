// Every localStorage key the game writes lives here so a rename or a reset
// is a one-file change. Browser storage can throw (private mode, quota); the
// readers fall back to defaults and the writers swallow the failure.

const KEYS = {
  best: 'magpie9.best',
  bendsBest: 'magpie9.bends.best',
  mute: 'magpie9.mute',
  fullscreen: 'magpie9.fullscreen',
  quality: 'magpie9.quality',
  volumeMaster: 'magpie9.volume.master',
  volumeMusic: 'magpie9.volume.music',
  volumeEffects: 'magpie9.volume.effects',
  challengeBest: (day) => `magpie9.challenge.${day}`,
}

function read(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* storage unavailable */
  }
}

function remove(key) {
  try {
    localStorage.removeItem(key)
  } catch {
    /* storage unavailable */
  }
}

function readPositiveNumber(key) {
  const n = Number(read(key) || '0')
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** Personal best gates for an endless mode: `run` (NEW GAME) or `bends`. */
export function loadBest(mode = 'run') {
  return readPositiveNumber(mode === 'bends' ? KEYS.bendsBest : KEYS.best)
}

export function saveBest(gates, mode = 'run') {
  write(mode === 'bends' ? KEYS.bendsBest : KEYS.best, String(gates))
}

/** Personal best extract time for a challenge day, or 0 when none is stored. */
export function loadChallengeBest(day) {
  return day ? readPositiveNumber(KEYS.challengeBest(day)) : 0
}

/** Stores `ms` only if it beats the saved time; returns the resulting best. */
export function saveChallengeBest(day, ms) {
  const previous = loadChallengeBest(day)
  if (previous && ms >= previous) return previous
  write(KEYS.challengeBest(day), String(ms))
  return ms
}

export function loadMuted() {
  return read(KEYS.mute) === '1'
}

export function saveMuted(muted) {
  write(KEYS.mute, muted ? '1' : '0')
}

/** A stored 0..1 channel. Missing or unreadable values stay at full. */
function readUnit(key) {
  const raw = read(key)
  if (raw == null || raw === '') return 1
  const n = Number(raw)
  if (!Number.isFinite(n)) return 1
  return Math.min(1, Math.max(0, n))
}

/** Master, music, and effects levels. Each defaults to full. */
export function loadVolumes() {
  return {
    master: readUnit(KEYS.volumeMaster),
    music: readUnit(KEYS.volumeMusic),
    effects: readUnit(KEYS.volumeEffects),
  }
}

const VOLUME_KEYS = {
  master: KEYS.volumeMaster,
  music: KEYS.volumeMusic,
  effects: KEYS.volumeEffects,
}

export function saveVolume(channel, value) {
  const key = VOLUME_KEYS[channel]
  if (!key) return
  write(key, String(value))
}

/** `'auto'` or a pinned rung `'0' | '1' | '2'`. */
export function loadQualityChoice() {
  const raw = read(KEYS.quality)
  return raw === '0' || raw === '1' || raw === '2' ? raw : 'auto'
}

export function saveQualityChoice(choice) {
  if (choice === '0' || choice === '1' || choice === '2') write(KEYS.quality, choice)
  else remove(KEYS.quality)
}

export function loadFullscreenPreference() {
  return read(KEYS.fullscreen) === '1'
}

export function saveFullscreenPreference(wanted) {
  if (wanted) write(KEYS.fullscreen, '1')
  else remove(KEYS.fullscreen)
}

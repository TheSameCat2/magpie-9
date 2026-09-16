// Every localStorage key the game writes lives here so a rename or a reset
// is a one-file change. Browser storage can throw (private mode, quota); the
// readers fall back to defaults and the writers swallow the failure.

const KEYS = {
  best: 'magpie9.best',
  mute: 'magpie9.mute',
  fullscreen: 'magpie9.fullscreen',
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

export function loadBest() {
  return readPositiveNumber(KEYS.best)
}

export function saveBest(gates) {
  write(KEYS.best, String(gates))
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

export function loadFullscreenPreference() {
  return read(KEYS.fullscreen) === '1'
}

export function saveFullscreenPreference(wanted) {
  if (wanted) write(KEYS.fullscreen, '1')
  else remove(KEYS.fullscreen)
}

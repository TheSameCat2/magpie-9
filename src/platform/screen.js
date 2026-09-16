// Display state: fullscreen, orientation, visibility, and whether we are
// running as an installed PWA. Emits a single onChange for any of them.

import { loadFullscreenPreference, saveFullscreenPreference } from '../lib/storage.js'

function fullscreenElement(doc = document) {
  return doc.fullscreenElement || doc.webkitFullscreenElement || null
}

function canRequestFullscreen() {
  const el = document.documentElement
  return !!(el.requestFullscreen || el.webkitRequestFullscreen)
}

/** Installed PWA / Home Screen — already chrome-less, no extra FS button. */
export function isStandaloneDisplay(win = window, nav = navigator, doc = document) {
  if (nav.standalone === true) return true
  if (win.matchMedia('(display-mode: standalone)').matches) return true
  // Manifest display:fullscreen is chrome-less. Element fullscreen also
  // matches this query, so ignore it while the Fullscreen API is active.
  return win.matchMedia('(display-mode: fullscreen)').matches && !fullscreenElement(doc)
}

/** What the portrait overlay should offer for going chrome-less. */
export function rotateFsAction({ supportsFullscreen, standalone }) {
  if (standalone) return 'none'
  if (supportsFullscreen) return 'button'
  return 'hint'
}

async function lockLandscape() {
  try {
    await screen.orientation?.lock?.('landscape')
  } catch {
    /* Android-only while fullscreen; iOS and desktop no-op. */
  }
}

function unlockOrientation() {
  try {
    screen.orientation?.unlock?.()
  } catch {
    /* ignore */
  }
}

export function createScreen() {
  const coarse = window.matchMedia('(pointer: coarse)')
  const portrait = window.matchMedia('(orientation: portrait)')
  const forceRotate = new URLSearchParams(location.search).has('rotate')
  let onChange = () => {}

  function notify() {
    onChange()
  }

  function isFullscreen() {
    return !!fullscreenElement()
  }

  async function enterFullscreen() {
    const el = document.documentElement
    try {
      if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' })
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen()
      saveFullscreenPreference(true)
      await lockLandscape()
    } catch {
      /* user gesture expired or the browser denied fullscreen */
    }
    notify()
  }

  async function exitFullscreen() {
    unlockOrientation()
    try {
      if (document.exitFullscreen) await document.exitFullscreen()
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen()
    } catch {
      /* already exited */
    }
    notify()
  }

  function toggleFullscreen() {
    if (isFullscreen()) exitFullscreen()
    else enterFullscreen()
  }

  /** On a fresh gesture, go back to fullscreen if the player had it on last time. */
  function maybeReenterFullscreen() {
    if (!canRequestFullscreen() || isFullscreen()) return
    if (!loadFullscreenPreference()) return
    enterFullscreen()
  }

  function onFullscreenChange() {
    if (!isFullscreen()) {
      saveFullscreenPreference(false)
      unlockOrientation()
    }
    notify()
  }

  coarse.addEventListener('change', notify)
  portrait.addEventListener('change', notify)
  document.addEventListener('visibilitychange', notify)
  document.addEventListener('fullscreenchange', onFullscreenChange)
  document.addEventListener('webkitfullscreenchange', onFullscreenChange)

  return {
    set onChange(fn) {
      onChange = typeof fn === 'function' ? fn : () => {}
    },
    get supportsFullscreen() {
      return canRequestFullscreen()
    },
    get isStandalone() {
      return isStandaloneDisplay()
    },
    get isFullscreen() {
      return isFullscreen()
    },
    get needsRotate() {
      return forceRotate || (coarse.matches && portrait.matches)
    },
    get hidden() {
      return document.visibilityState === 'hidden'
    },
    enterFullscreen,
    exitFullscreen,
    toggleFullscreen,
    maybeReenterFullscreen,
  }
}

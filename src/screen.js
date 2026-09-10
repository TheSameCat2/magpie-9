import { FULLSCREEN_KEY } from './theme.js'

function fullscreenEl() {
  return document.fullscreenElement || document.webkitFullscreenElement || null
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
  const elementFs = !!(doc.fullscreenElement || doc.webkitFullscreenElement)
  return win.matchMedia('(display-mode: fullscreen)').matches && !elementFs
}

/** What the portrait overlay should offer for going chrome-less. */
export function rotateFsAction({ supportsFullscreen, standalone }) {
  if (standalone) return 'none'
  if (supportsFullscreen) return 'button'
  return 'hint'
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
    return !!fullscreenEl()
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

  async function enterFullscreen() {
    const el = document.documentElement
    try {
      if (el.requestFullscreen) {
        await el.requestFullscreen({ navigationUI: 'hide' })
      } else if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen()
      }
      localStorage.setItem(FULLSCREEN_KEY, '1')
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

  function maybeReenterFullscreen() {
    if (!canRequestFullscreen() || isFullscreen()) return
    if (localStorage.getItem(FULLSCREEN_KEY) !== '1') return
    enterFullscreen()
  }

  function onFsChange() {
    if (!isFullscreen()) {
      localStorage.removeItem(FULLSCREEN_KEY)
      unlockOrientation()
    }
    notify()
  }

  coarse.addEventListener('change', notify)
  portrait.addEventListener('change', notify)
  document.addEventListener('visibilitychange', notify)
  document.addEventListener('fullscreenchange', onFsChange)
  document.addEventListener('webkitfullscreenchange', onFsChange)

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

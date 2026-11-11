// Display state: fullscreen, orientation, visibility, and whether we are
// running as an installed PWA. Emits a single onChange for any of them.

import { loadFullscreenPreference, saveFullscreenPreference } from '../lib/storage.js'
import { displayHidden, watchShellFocus } from './shell.js'

function fullscreenElement(doc = globalThis.document) {
  return doc?.fullscreenElement || doc?.webkitFullscreenElement || null
}

/**
 * True when the document exposes Fullscreen API methods and fullscreen is not
 * blocked by policy (`fullscreenEnabled === false` in iframes / WebViews).
 */
export function canRequestFullscreen(doc = globalThis.document) {
  if (!doc) return false
  if (doc.fullscreenEnabled === false || (!doc.fullscreenEnabled && doc.webkitFullscreenEnabled === false)) {
    return false
  }
  const el = doc.documentElement
  if (!el) return false
  return !!(el.requestFullscreen || el.webkitRequestFullscreen)
}

/** Installed PWA / Home Screen — already chrome-less, no extra FS button. */
export function isStandaloneDisplay(
  win = globalThis.window,
  nav = globalThis.navigator,
  doc = globalThis.document,
) {
  if (nav?.standalone === true) return true
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

async function lockLandscape(scr = globalThis.screen) {
  try {
    await scr?.orientation?.lock?.('landscape')
  } catch {
    /* Android-only while fullscreen; iOS and desktop no-op. */
  }
}

function unlockOrientation(scr = globalThis.screen) {
  try {
    scr?.orientation?.unlock?.()
  } catch {
    /* ignore */
  }
}

/**
 * @param {{
 *   signal?: AbortSignal,
 *   win?: Window & typeof globalThis,
 *   nav?: Navigator,
 *   doc?: Document,
 *   loc?: Location | { search?: string },
 *   scr?: Screen,
 *   bridge?: Window['magpieDesktop'],
 * }} [opts]
 */
export function createScreen({
  signal,
  win = globalThis.window,
  nav = globalThis.navigator,
  doc = globalThis.document,
  loc = globalThis.location,
  scr = globalThis.screen,
  bridge = globalThis.magpieDesktop,
} = {}) {
  const coarse = win.matchMedia('(pointer: coarse)')
  const portrait = win.matchMedia('(orientation: portrait)')
  const standaloneMq = win.matchMedia('(display-mode: standalone)')
  const fullscreenMq = win.matchMedia('(display-mode: fullscreen)')
  const forceRotate = new URLSearchParams(loc?.search ?? '').has('rotate')
  let onChange = () => {}

  function notify() {
    onChange()
  }

  function isFullscreen() {
    return !!fullscreenElement(doc)
  }

  function isStandalone() {
    if (nav?.standalone === true) return true
    if (standaloneMq.matches) return true
    return fullscreenMq.matches && !fullscreenElement(doc)
  }

  async function enterFullscreen() {
    const el = doc.documentElement
    try {
      if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' })
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen()
      saveFullscreenPreference(true)
      await lockLandscape(scr)
    } catch {
      /* user gesture expired or the browser denied fullscreen */
    }
    notify()
  }

  async function exitFullscreen() {
    unlockOrientation(scr)
    try {
      if (doc.exitFullscreen) await doc.exitFullscreen()
      else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen()
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
    if (!canRequestFullscreen(doc) || isFullscreen()) return
    if (!loadFullscreenPreference()) return
    enterFullscreen()
  }

  function onFullscreenChange() {
    if (!isFullscreen()) {
      saveFullscreenPreference(false)
      unlockOrientation(scr)
    }
    notify()
  }

  const ctl = new AbortController()
  const mqOpts = { signal: ctl.signal }
  const passiveOpts = { passive: true, signal: ctl.signal }
  const mqs = [coarse, portrait, standaloneMq, fullscreenMq]
  for (const mq of mqs) mq.addEventListener('change', notify, mqOpts)
  /** @type {Array<[string, () => void]>} */
  const docEvents = [
    ['visibilitychange', notify],
    ['fullscreenchange', onFullscreenChange],
    ['webkitfullscreenchange', onFullscreenChange],
  ]
  for (const [type, fn] of docEvents) doc.addEventListener(type, fn, passiveOpts)

  // Cmd-Tab leaves the Electron window visible, so visibilityState stays
  // 'visible'. Treat shell blur as the same hold the hidden tab already uses.
  let shellFocused = true
  const stopShellFocus = watchShellFocus((focused) => {
    shellFocused = focused
    notify()
  }, bridge)

  let disposed = false
  function dispose() {
    if (disposed) return
    disposed = true
    ctl.abort()
    for (const mq of mqs) mq.removeEventListener?.('change', notify)
    for (const [type, fn] of docEvents) doc.removeEventListener?.(type, fn)
    stopShellFocus()
  }

  if (signal) {
    if (signal.aborted) dispose()
    else signal.addEventListener('abort', dispose, { once: true })
  }

  return {
    set onChange(fn) {
      onChange = typeof fn === 'function' ? fn : () => {}
    },
    get supportsFullscreen() {
      return canRequestFullscreen(doc)
    },
    get isStandalone() {
      return isStandalone()
    },
    get isFullscreen() {
      return isFullscreen()
    },
    get needsRotate() {
      return forceRotate || (coarse.matches && portrait.matches)
    },
    get hidden() {
      return displayHidden({ visibility: doc.visibilityState, shellFocused })
    },
    enterFullscreen,
    exitFullscreen,
    toggleFullscreen,
    maybeReenterFullscreen,
    dispose,
  }
}

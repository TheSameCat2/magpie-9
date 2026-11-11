// Keyboard + pointer input, flattened into per-frame "edges" (true for one
// frame after a press) plus continuous strafe state. The game reads the edges
// during update() and calls endFrame() to clear them.

import { clamp } from '../lib/math.js'

export const STICK_DEADZONE = 6
export const STICK_RANGE = 48
/** VK_PROCESSKEY — reported during IME composition, including Safari's confirming Enter. */
const IME_KEYCODE = 229

const FLAP_KEYS = new Set(['space', 'w', 'arrowup'])
const LEFT_KEYS = new Set(['a', 'arrowleft'])
const RIGHT_KEYS = new Set(['d', 'arrowright'])
const UP_KEYS = new Set(['w', 'arrowup'])
const DOWN_KEYS = new Set(['s', 'arrowdown'])
const SELECT_KEYS = new Set(['space', 'enter'])
const BACK_KEYS = new Set(['escape', 'backspace'])
const MODIFIER_KEYS = new Set(['meta', 'control', 'alt'])
/** Keys that do not trigger user activation per WHATWG HTML §6.4.2. */
const NON_ACTIVATING_KEYS = new Set([
  'escape',
  'meta',
  'control',
  'alt',
  'altgraph',
  'shift',
  'capslock',
  'os',
  'fn',
  'fnlock',
  'numlock',
  'scrolllock',
])

/** Single-key edges, keyed by the normalised key name. */
const KEY_EDGES = {
  r: 'restartEdge',
  m: 'muteEdge',
  b: 'debugEdge',
  h: 'helpEdge',
  p: 'pauseEdge',
}

const EDGE_DEFAULTS = {
  flapEdge: false,
  restartEdge: false,
  tapEdge: false,
  muteEdge: false,
  debugEdge: false,
  selectEdge: false,
  backEdge: false,
  helpEdge: false,
  pauseEdge: false,
  eraseEdge: false,
  /** -1 up / +1 down for menu rows and initials. */
  navEdge: 0,
  /** -1 left / +1 right for tabs and the initials cursor. */
  strafeEdge: 0,
  /** Typed A-Z / 0-9 for initials entry. */
  charEdge: '',
}

function normalizeKey(key) {
  if (key === ' ') return 'space'
  return key.toLowerCase()
}

/** Map a horizontal drag in CSS pixels to a strafe axis in [-1, 1]. */
export function stickAxis(dx, deadzone = STICK_DEADZONE, range = STICK_RANGE) {
  const abs = Math.abs(dx)
  if (abs <= deadzone) return 0
  const signed = dx < 0 ? -1 : 1
  return clamp(signed * ((abs - deadzone) / range), -1, 1)
}

export function preferTouch(win = globalThis.window) {
  return !!win?.matchMedia?.('(pointer: coarse)')?.matches
}

function fromButton(el) {
  return !!el?.closest?.('button')
}

function isHelpOpen(e, doc) {
  return (
    !!doc?.body?.classList?.contains?.('help-open') ||
    doc?.body?.dataset?.scene === 'help-open' ||
    !!e.target?.closest?.('#help')
  )
}

/**
 * Enter/Space on a focused button belong to that button. The game must not
 * preventDefault them or they never activate CONTINUE, BACK, or a menu row.
 */
export function keyActivatesButton(target, key) {
  const name = normalizeKey(String(key ?? ''))
  return (name === 'enter' || name === 'space') && fromButton(target)
}

const CHAR_RE = /^[A-Z0-9]$/

/**
 * @param {{
 *   onGesture?: () => void,
 *   onModeChange?: (mode: 'keys' | 'touch') => void,
 *   signal?: AbortSignal,
 *   win?: Window & typeof globalThis,
 *   doc?: Document,
 * }} [hooks]
 *   `onGesture` fires on any activating key or primary pointer press (the audio unlock hook);
 *   `onModeChange` fires when the player switches between 'keys' and 'touch'.
 */
export function createInput({
  onGesture,
  onModeChange,
  signal,
  win = globalThis.window,
  doc = globalThis.document,
} = {}) {
  const held = { left: false, right: false }
  const stick = { active: false, originX: 0, originY: 0, dx: 0 }
  const lastTap = { x: 0, y: 0, at: 0 }
  let dirtyEdges = false
  let stickId = null
  let axis = 0
  /** @type {'keys' | 'touch'} */
  let mode = preferTouch(win) ? 'touch' : 'keys'

  function setMode(next) {
    if (mode === next) return
    mode = next
    onModeChange?.(mode)
  }

  function clearStrafeHeld() {
    held.left = false
    held.right = false
  }

  function onKeyDown(e) {
    if (e.repeat || e.isComposing || e.keyCode === IME_KEYCODE) return
    if (typeof e.key !== 'string' || !e.key) return
    if (e.ctrlKey || e.metaKey || e.altKey) {
      // macOS suppresses letter keyup while Meta is held; drop latched strafe
      // when a modifier chord starts so Cmd+A / Cmd+Tab cannot leave it stuck.
      clearStrafeHeld()
      return
    }
    const k = normalizeKey(e.key)
    if (!NON_ACTIVATING_KEYS.has(k)) onGesture?.()
    if (MODIFIER_KEYS.has(k)) {
      clearStrafeHeld()
      return
    }
    setMode('keys')
    if (keyActivatesButton(e.target, e.key)) return
    const helpOpen = isHelpOpen(e, doc)
    if (!helpOpen) {
      if (FLAP_KEYS.has(k)) {
        e.preventDefault()
        api.flapEdge = true
        api.restartEdge = true
        dirtyEdges = true
      }
      if (LEFT_KEYS.has(k)) {
        held.left = true
        api.strafeEdge = -1
        dirtyEdges = true
      }
      if (RIGHT_KEYS.has(k)) {
        held.right = true
        api.strafeEdge = 1
        dirtyEdges = true
      }
      if (UP_KEYS.has(k)) {
        api.navEdge = -1
        dirtyEdges = true
      }
      if (DOWN_KEYS.has(k)) {
        api.navEdge = 1
        dirtyEdges = true
      }
      if (SELECT_KEYS.has(k)) {
        e.preventDefault()
        api.selectEdge = true
        dirtyEdges = true
      }
    }
    if (BACK_KEYS.has(k)) {
      if (k !== 'escape') e.preventDefault()
      api.backEdge = true
      dirtyEdges = true
    }
    if (!helpOpen && k === 'backspace') {
      api.eraseEdge = true
      dirtyEdges = true
    }
    if (!helpOpen && e.key.length === 1) {
      const ch = e.key.toUpperCase()
      if (CHAR_RE.test(ch)) {
        api.charEdge = ch
        dirtyEdges = true
      }
    }
    const single = KEY_EDGES[k]
    if (single) {
      api[single] = true
      dirtyEdges = true
    }
  }

  function onKeyUp(e) {
    if (typeof e.key !== 'string' || !e.key) return
    const k = normalizeKey(e.key)
    if (MODIFIER_KEYS.has(k)) {
      clearStrafeHeld()
      return
    }
    if (LEFT_KEYS.has(k)) held.left = false
    if (RIGHT_KEYS.has(k)) held.right = false
  }

  function clearStick() {
    stickId = null
    axis = 0
    stick.active = false
    stick.dx = 0
  }

  function onPointerDown(e) {
    if ((e.button ?? 0) !== 0) return
    // Buttons handle themselves, but they still count as the gesture that is
    // allowed to start audio (a menu click may be the very first interaction).
    onGesture?.()
    if (fromButton(e.target)) return
    if (e.pointerType !== 'mouse') {
      e.preventDefault?.()
      setMode('touch')
    }

    api.restartEdge = true
    api.tapEdge = true
    dirtyEdges = true

    if (e.pointerType === 'mouse') {
      api.flapEdge = true
      return
    }

    // Touch: left half of the screen is the strafe stick, right half flaps.
    const leftHalf = e.clientX < win.innerWidth / 2
    if (leftHalf) {
      if (stickId != null) return
      stickId = e.pointerId
      stick.active = true
      stick.originX = e.clientX
      stick.originY = e.clientY
      stick.dx = 0
      axis = 0
      const captureEl = typeof e.target?.setPointerCapture === 'function' ? e.target : doc?.documentElement
      try {
        captureEl?.setPointerCapture?.(e.pointerId)
      } catch {
        /* capture is optional; window listeners still track the pointer */
      }
    } else {
      api.flapEdge = true
      lastTap.x = e.clientX
      lastTap.y = e.clientY
      lastTap.at = performance.now()
    }
  }

  function onPointerMove(e) {
    if (e.pointerId !== stickId) return
    stick.dx = e.clientX - stick.originX
    axis = stickAxis(stick.dx)
  }

  function onPointerEnd(e) {
    if (e.pointerId === stickId) clearStick()
  }

  function resetHeld() {
    clearStrafeHeld()
    clearStick()
  }

  const ctl = new AbortController()
  const activeOpts = { signal: ctl.signal }
  const passiveOpts = { passive: true, signal: ctl.signal }
  /** @type {Array<[string, (e: any) => void, AddEventListenerOptions]>} */
  const listeners = [
    ['keydown', onKeyDown, activeOpts],
    ['pointerdown', onPointerDown, activeOpts],
    ['keyup', onKeyUp, passiveOpts],
    ['pointermove', onPointerMove, passiveOpts],
    ['pointerup', onPointerEnd, passiveOpts],
    ['pointercancel', onPointerEnd, passiveOpts],
    ['lostpointercapture', onPointerEnd, passiveOpts],
    ['blur', resetHeld, passiveOpts],
  ]
  for (const [type, fn, opts] of listeners) win.addEventListener(type, fn, opts)

  let disposed = false
  function dispose() {
    if (disposed) return
    disposed = true
    ctl.abort()
    for (const [type, fn] of listeners) win.removeEventListener?.(type, fn)
    resetHeld()
  }

  if (signal) {
    if (signal.aborted) dispose()
    else signal.addEventListener('abort', dispose, { once: true })
  }

  const api = {
    ...EDGE_DEFAULTS,
    get left() {
      return held.left || axis < 0
    },
    get right() {
      return held.right || axis > 0
    },
    get strafe() {
      return clamp((held.right ? 1 : 0) - (held.left ? 1 : 0) + axis, -1, 1)
    },
    get mode() {
      return mode
    },
    get stick() {
      return stick
    },
    get lastTap() {
      return lastTap
    },
    endFrame() {
      if (!dirtyEdges) return
      dirtyEdges = false
      api.flapEdge = false
      api.restartEdge = false
      api.tapEdge = false
      api.muteEdge = false
      api.debugEdge = false
      api.selectEdge = false
      api.backEdge = false
      api.helpEdge = false
      api.pauseEdge = false
      api.eraseEdge = false
      api.navEdge = 0
      api.strafeEdge = 0
      api.charEdge = ''
    },
    dispose,
  }
  return api
}

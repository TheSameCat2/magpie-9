// Keyboard + pointer input, flattened into per-frame "edges" (true for one
// frame after a press) plus continuous strafe state. The game reads the edges
// during update() and calls endFrame() to clear them.

import { clamp } from '../lib/math.js'

export const STICK_DEADZONE = 6
export const STICK_RANGE = 48

const FLAP_KEYS = new Set(['space', 'w', 'arrowup'])
const LEFT_KEYS = new Set(['a', 'arrowleft'])
const RIGHT_KEYS = new Set(['d', 'arrowright'])
const UP_KEYS = new Set(['w', 'arrowup'])
const DOWN_KEYS = new Set(['s', 'arrowdown'])
const SELECT_KEYS = new Set(['space', 'enter'])
const BACK_KEYS = new Set(['escape', 'backspace'])

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

function preferTouch() {
  return window.matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints || 0) > 0
}

function fromButton(el) {
  return !!el?.closest?.('button')
}

/**
 * Enter/Space on a focused button belong to that button. The game must not
 * preventDefault them or they never activate CONTINUE, BACK, or a menu row.
 */
export function keyActivatesButton(target, key) {
  const name = normalizeKey(String(key ?? ''))
  return (name === 'enter' || name === 'space') && fromButton(target)
}

/**
 * @param onGesture   fired on any key or pointer press; the audio unlock hook
 * @param onModeChange fired when the player switches between 'keys' and 'touch'
 */
export function createInput({ onGesture, onModeChange } = {}) {
  const held = { left: false, right: false }
  const stick = { active: false, originX: 0, originY: 0, dx: 0 }
  const lastTap = { x: 0, y: 0, at: 0 }
  const edges = { ...EDGE_DEFAULTS }
  let stickId = null
  let axis = 0
  let mode = preferTouch() ? 'touch' : 'keys'

  function setMode(next) {
    if (mode === next) return
    mode = next
    onModeChange?.(mode)
  }

  function onKeyDown(e) {
    if (e.repeat) return
    onGesture?.()
    setMode('keys')
    if (keyActivatesButton(e.target, e.key)) return
    const k = normalizeKey(e.key)
    if (FLAP_KEYS.has(k)) {
      e.preventDefault()
      edges.flapEdge = true
      edges.restartEdge = true
    }
    if (LEFT_KEYS.has(k)) {
      held.left = true
      edges.strafeEdge = -1
    }
    if (RIGHT_KEYS.has(k)) {
      held.right = true
      edges.strafeEdge = 1
    }
    if (UP_KEYS.has(k)) edges.navEdge = -1
    if (DOWN_KEYS.has(k)) edges.navEdge = 1
    if (SELECT_KEYS.has(k)) {
      e.preventDefault()
      edges.selectEdge = true
    }
    if (BACK_KEYS.has(k)) {
      e.preventDefault()
      edges.backEdge = true
    }
    if (k === 'backspace') edges.eraseEdge = true
    if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1) {
      const ch = e.key.toUpperCase()
      if (/^[A-Z0-9]$/.test(ch)) edges.charEdge = ch
    }
    const single = KEY_EDGES[k]
    if (single) edges[single] = true
  }

  function onKeyUp(e) {
    const k = normalizeKey(e.key)
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
    // Buttons handle themselves, but they still count as the gesture that is
    // allowed to start audio (a menu click may be the very first interaction).
    onGesture?.()
    if (fromButton(e.target)) return
    if (e.pointerType !== 'mouse') {
      e.preventDefault()
      setMode('touch')
    }

    edges.restartEdge = true
    edges.tapEdge = true

    const captureEl = e.target instanceof Element ? e.target : document.documentElement
    try {
      captureEl.setPointerCapture?.(e.pointerId)
    } catch {
      /* capture is optional; window listeners still track the pointer */
    }

    if (e.pointerType === 'mouse') {
      edges.flapEdge = true
      return
    }

    // Touch: left half of the screen is the strafe stick, right half flaps.
    const leftHalf = e.clientX < window.innerWidth / 2
    if (leftHalf) {
      if (stickId != null) return
      stickId = e.pointerId
      stick.active = true
      stick.originX = e.clientX
      stick.originY = e.clientY
      stick.dx = 0
      axis = 0
    } else {
      edges.flapEdge = true
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
    held.left = false
    held.right = false
    clearStick()
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerEnd)
  window.addEventListener('pointercancel', onPointerEnd)
  window.addEventListener('lostpointercapture', onPointerEnd)
  window.addEventListener('blur', resetHeld)

  const api = {
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
      Object.assign(edges, EDGE_DEFAULTS)
    },
  }
  for (const name of Object.keys(EDGE_DEFAULTS)) {
    Object.defineProperty(api, name, { get: () => edges[name], enumerable: true })
  }
  return api
}

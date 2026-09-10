export const STICK_DEADZONE = 6
export const STICK_RANGE = 48

const FLAP_KEYS = new Set(['space', ' ', 'w', 'arrowup'])
const LEFT_KEYS = new Set(['a', 'arrowleft'])
const RIGHT_KEYS = new Set(['d', 'arrowright'])

function norm(key) {
  if (key === ' ') return 'space'
  return key.toLowerCase()
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n))
}

/** Map a horizontal drag in CSS pixels to a strafe axis in [-1, 1]. */
export function stickAxis(dx, deadzone = STICK_DEADZONE, range = STICK_RANGE) {
  const abs = Math.abs(dx)
  if (abs <= deadzone) return 0
  const signed = dx < 0 ? -1 : 1
  return clamp(signed * ((abs - deadzone) / range), -1, 1)
}

function isCoarse() {
  return window.matchMedia('(pointer: coarse)').matches
}

function fromButton(el) {
  return !!el?.closest?.('button')
}

export function createInput({ onGesture, onModeChange } = {}) {
  const held = { left: false, right: false }
  const stick = { active: false, originX: 0, originY: 0, dx: 0 }
  const lastTap = { x: 0, y: 0, at: 0 }
  let stickId = null
  let axis = 0
  let flapEdge = false
  let restartEdge = false
  let tapEdge = false
  let muteEdge = false
  let debugEdge = false
  let mode = isCoarse() ? 'touch' : 'keys'

  function setMode(next) {
    if (mode === next) return
    mode = next
    onModeChange?.(mode)
  }

  function gesture() {
    onGesture?.()
  }

  function onDown(e) {
    if (e.repeat) return
    gesture()
    setMode('keys')
    const k = norm(e.key)
    if (FLAP_KEYS.has(k) || FLAP_KEYS.has(e.key.toLowerCase())) {
      e.preventDefault()
      flapEdge = true
      restartEdge = true
    }
    if (LEFT_KEYS.has(k)) held.left = true
    if (RIGHT_KEYS.has(k)) held.right = true
    if (k === 'r') restartEdge = true
    if (k === 'm') muteEdge = true
    if (k === 'b') debugEdge = true
  }

  function onUp(e) {
    const k = norm(e.key)
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
    if (fromButton(e.target)) return
    if (e.pointerType !== 'mouse') e.preventDefault()
    gesture()
    if (e.pointerType !== 'mouse') setMode('touch')

    restartEdge = true
    tapEdge = true

    const captureEl = e.target instanceof Element ? e.target : document.documentElement
    try {
      captureEl.setPointerCapture?.(e.pointerId)
    } catch {
      /* capture is optional; window listeners still track the pointer */
    }

    if (e.pointerType === 'mouse') {
      flapEdge = true
      return
    }

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
      flapEdge = true
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

  window.addEventListener('keydown', onDown)
  window.addEventListener('keyup', onUp)
  window.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerEnd)
  window.addEventListener('pointercancel', onPointerEnd)
  window.addEventListener('lostpointercapture', onPointerEnd)
  window.addEventListener('blur', resetHeld)

  return {
    get left() {
      return held.left || axis < 0
    },
    get right() {
      return held.right || axis > 0
    },
    get strafe() {
      return clamp((held.right ? 1 : 0) - (held.left ? 1 : 0) + axis, -1, 1)
    },
    get flapEdge() {
      return flapEdge
    },
    get restartEdge() {
      return restartEdge
    },
    get tapEdge() {
      return tapEdge
    },
    get muteEdge() {
      return muteEdge
    },
    get debugEdge() {
      return debugEdge
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
      flapEdge = false
      restartEdge = false
      tapEdge = false
      muteEdge = false
      debugEdge = false
    },
  }
}

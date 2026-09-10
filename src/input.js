const FLAP_KEYS = new Set(['space', ' ', 'w', 'arrowup'])
const LEFT_KEYS = new Set(['a', 'arrowleft'])
const RIGHT_KEYS = new Set(['d', 'arrowright'])

function norm(key) {
  if (key === ' ') return 'space'
  return key.toLowerCase()
}

export function createInput() {
  const held = { left: false, right: false }
  let flapEdge = false
  let restartEdge = false
  let muteEdge = false
  let debugEdge = false

  function onDown(e) {
    if (e.repeat) return
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

  function onPointerDown() {
    flapEdge = true
    restartEdge = true
  }

  window.addEventListener('keydown', onDown)
  window.addEventListener('keyup', onUp)
  window.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('blur', () => {
    held.left = false
    held.right = false
  })

  return {
    get left() {
      return held.left
    },
    get right() {
      return held.right
    },
    get flapEdge() {
      return flapEdge
    },
    get restartEdge() {
      return restartEdge
    },
    get muteEdge() {
      return muteEdge
    },
    get debugEdge() {
      return debugEdge
    },
    endFrame() {
      flapEdge = false
      restartEdge = false
      muteEdge = false
      debugEdge = false
    },
  }
}

// Visual feedback for touch input: the virtual stick and the tap ring.

import { STICK_RANGE } from '../platform/input.js'
import { clamp } from '../lib/math.js'
import { hide, prefersReducedMotion, query, show } from './dom.js'

const TAP_RING_MS = 280

export function createTouchGizmos(state) {
  const stickEl = query('#touch .stick')
  const nubEl = query('#touch .stick-nub')
  const tapEl = query('#touch .tapring')
  const reduceMotion = prefersReducedMotion()

  let stickShown = true
  let tapShown = true
  let lastOx = NaN
  let lastOy = NaN
  let lastDx = NaN
  let lastTapAt = 0

  function update(input) {
    const touch = state.inputMode === 'touch'
    if (!touch && !stickShown && !tapShown) return

    const stick = input.stick
    if (touch && stick.active) {
      if (!stickShown) {
        stickShown = true
        show(stickEl)
      }
      if (stick.originX !== lastOx || stick.originY !== lastOy) {
        lastOx = stick.originX
        lastOy = stick.originY
        stickEl.style.transform = `translate(${lastOx}px, ${lastOy}px)`
      }
      const dx = clamp(stick.dx, -STICK_RANGE, STICK_RANGE)
      if (dx !== lastDx) {
        lastDx = dx
        nubEl.style.transform = `translate(calc(-50% + ${dx}px), -50%)`
      }
    } else if (stickShown) {
      stickShown = false
      hide(stickEl)
    }

    const tap = input.lastTap
    if (touch && tap.at > 0) {
      const age = performance.now() - tap.at
      if (age < TAP_RING_MS) {
        if (!tapShown) {
          tapShown = true
          show(tapEl)
        }
        if (tap.at !== lastTapAt) {
          lastTapAt = tap.at
          tapEl.style.transform = `translate(${tap.x}px, ${tap.y}px)`
          if (reduceMotion) tapEl.style.opacity = '1'
        }
        if (!reduceMotion) tapEl.style.opacity = String(1 - age / TAP_RING_MS)
        return
      }
    }
    if (tapShown) {
      tapShown = false
      hide(tapEl)
    }
  }

  return { update }
}

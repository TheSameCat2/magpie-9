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

  function update(input) {
    const touch = state.inputMode === 'touch'
    const stick = input.stick
    if (touch && stick.active) {
      show(stickEl)
      stickEl.style.transform = `translate(${stick.originX}px, ${stick.originY}px)`
      const dx = clamp(stick.dx, -STICK_RANGE, STICK_RANGE)
      nubEl.style.transform = `translate(calc(-50% + ${dx}px), -50%)`
    } else {
      hide(stickEl)
    }

    const tap = input.lastTap
    const age = tap.at ? performance.now() - tap.at : TAP_RING_MS + 1
    if (touch && age < TAP_RING_MS) {
      show(tapEl)
      tapEl.style.transform = `translate(${tap.x}px, ${tap.y}px)`
      tapEl.style.opacity = reduceMotion ? '1' : String(1 - age / TAP_RING_MS)
    } else {
      hide(tapEl)
    }
  }

  return { update }
}

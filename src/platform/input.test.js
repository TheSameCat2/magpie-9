import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createInput,
  keyActivatesButton,
  preferTouch,
  stickAxis,
  STICK_DEADZONE,
  STICK_RANGE,
} from './input.js'

function createHarness({ coarse = false, width = 800 } = {}) {
  const listeners = new Map()
  const registrations = []
  const bodyClasses = new Set()
  const captured = []
  const win = {
    innerWidth: width,
    matchMedia: (query) => ({ matches: query === '(pointer: coarse)' ? coarse : false }),
    addEventListener(type, fn, opts) {
      registrations.push({ type, fn, opts })
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type).add(fn)
    },
    removeEventListener(type, fn) {
      listeners.get(type)?.delete(fn)
    },
    emit(type, event = {}) {
      let prevented = false
      const e = {
        preventDefault() {
          prevented = true
        },
        ...event,
      }
      for (const fn of listeners.get(type) ?? []) fn(e)
      return prevented
    },
  }
  const doc = {
    body: {
      dataset: {},
      classList: {
        add: (c) => bodyClasses.add(c),
        remove: (c) => bodyClasses.delete(c),
        contains: (c) => bodyClasses.has(c),
      },
    },
    documentElement: {
      setPointerCapture(id) {
        captured.push({ target: 'documentElement', id })
      },
    },
  }
  return { win, doc, listeners, registrations, captured }
}

test('stickAxis is zero inside the dead zone', () => {
  assert.equal(stickAxis(0), 0)
  assert.equal(stickAxis(STICK_DEADZONE), 0)
  assert.equal(stickAxis(-STICK_DEADZONE), 0)
  assert.equal(stickAxis(STICK_DEADZONE - 0.01), 0)
})

test('stickAxis is ±1 at and beyond full deflection', () => {
  assert.equal(stickAxis(STICK_DEADZONE + STICK_RANGE), 1)
  assert.equal(stickAxis(-(STICK_DEADZONE + STICK_RANGE)), -1)
  assert.equal(stickAxis(400), 1)
  assert.equal(stickAxis(-400), -1)
})

test('stickAxis is proportional between dead zone and range', () => {
  const mid = STICK_DEADZONE + STICK_RANGE * 0.5
  assert.ok(Math.abs(stickAxis(mid) - 0.5) < 1e-9)
  assert.ok(Math.abs(stickAxis(-mid) + 0.5) < 1e-9)
})

test('Enter and Space on a button are left for that button to activate', () => {
  const button = { closest: (sel) => (sel === 'button' ? button : null) }
  const elsewhere = { closest: () => null }
  assert.equal(keyActivatesButton(button, 'Enter'), true)
  assert.equal(keyActivatesButton(button, ' '), true)
  assert.equal(keyActivatesButton(button, 'Escape'), false)
  assert.equal(keyActivatesButton(button, 'p'), false)
  assert.equal(keyActivatesButton(elsewhere, 'Enter'), false)
  assert.equal(keyActivatesButton(null, ' '), false)
})

test('stickAxis accepts custom deadzone and range', () => {
  assert.equal(stickAxis(5, 10, 20), 0)
  assert.equal(stickAxis(20, 10, 20), 0.5)
  assert.equal(stickAxis(-30, 10, 20), -1)
})

test('preferTouch uses (pointer: coarse) without maxTouchPoints false positives', () => {
  const prevDesc = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { maxTouchPoints: 10 },
  })
  try {
    const fineTouchLaptop = createHarness({ coarse: false })
    assert.equal(preferTouch(fineTouchLaptop.win), false)
    const input = createInput({ win: fineTouchLaptop.win, doc: fineTouchLaptop.doc })
    assert.equal(input.mode, 'keys')
    input.dispose()

    const coarsePhone = createHarness({ coarse: true })
    assert.equal(preferTouch(coarsePhone.win), true)
    const touchInput = createInput({ win: coarsePhone.win, doc: coarsePhone.doc })
    assert.equal(touchInput.mode, 'touch')
    touchInput.dispose()
  } finally {
    if (prevDesc) Object.defineProperty(globalThis, 'navigator', prevDesc)
  }
})

test('Cmd, Ctrl, and Alt shortcuts pass through without preventDefault, edges, or gesture', () => {
  const { win, doc } = createHarness()
  let gestures = 0
  const input = createInput({ win, doc, onGesture: () => gestures++ })

  for (const chord of [
    { key: 'w', metaKey: true },
    { key: 'w', ctrlKey: true },
    { key: 'r', metaKey: true },
    { key: 'r', ctrlKey: true },
    { key: 'm', metaKey: true },
    { key: 'h', metaKey: true },
    { key: 'p', ctrlKey: true },
    { key: 'a', metaKey: true },
    { key: 'd', altKey: true },
  ]) {
    const prevented = win.emit('keydown', chord)
    assert.equal(prevented, false, `chord ${JSON.stringify(chord)} should not preventDefault`)
  }

  assert.equal(gestures, 0)
  assert.equal(input.flapEdge, false)
  assert.equal(input.restartEdge, false)
  assert.equal(input.muteEdge, false)
  assert.equal(input.helpEdge, false)
  assert.equal(input.pauseEdge, false)
  assert.equal(input.strafeEdge, 0)
  assert.equal(input.charEdge, '')
  assert.equal(input.left, false)
  assert.equal(input.right, false)
  assert.equal(input.strafe, 0)
  input.dispose()
})

test('modifier chords, modifier keyup, and window blur clear held strafe keys', () => {
  const { win, doc } = createHarness()
  const input = createInput({ win, doc })

  // Hold A, then release Meta without an A keyup (macOS Cmd+A suppression)
  win.emit('keydown', { key: 'a' })
  assert.equal(input.left, true)
  assert.equal(input.strafe, -1)
  win.emit('keyup', { key: 'Meta' })
  assert.equal(input.left, false)
  assert.equal(input.strafe, 0)

  // Hold D, then start a Ctrl chord
  win.emit('keydown', { key: 'd' })
  assert.equal(input.right, true)
  win.emit('keydown', { key: 'r', ctrlKey: true })
  assert.equal(input.right, false)

  // Hold A, then release Alt
  win.emit('keydown', { key: 'a' })
  assert.equal(input.left, true)
  win.emit('keyup', { key: 'Alt' })
  assert.equal(input.left, false)

  // Hold D, then window blur
  win.emit('keydown', { key: 'd' })
  assert.equal(input.right, true)
  win.emit('blur')
  assert.equal(input.right, false)
  input.dispose()
})

test('IME composition events (isComposing and Safari keyCode 229) are ignored', () => {
  const { win, doc } = createHarness()
  let gestures = 0
  const input = createInput({ win, doc, onGesture: () => gestures++ })

  assert.equal(win.emit('keydown', { key: 'Enter', isComposing: true }), false)
  assert.equal(win.emit('keydown', { key: 'Enter', isComposing: false, keyCode: 229 }), false)
  assert.equal(win.emit('keydown', { key: 'Backspace', isComposing: true }), false)
  assert.equal(win.emit('keydown', { key: 'Backspace', keyCode: 229 }), false)
  assert.equal(win.emit('keydown', { key: 'a', keyCode: 229 }), false)

  assert.equal(gestures, 0)
  assert.equal(input.selectEdge, false)
  assert.equal(input.backEdge, false)
  assert.equal(input.eraseEdge, false)
  assert.equal(input.charEdge, '')
  assert.equal(input.strafeEdge, 0)
  input.dispose()
})

test('Escape sets backEdge without preventDefault or onGesture; bare modifiers skip onGesture', () => {
  const { win, doc } = createHarness()
  let gestures = 0
  const input = createInput({ win, doc, onGesture: () => gestures++ })

  for (const mod of ['Meta', 'Control', 'Alt', 'Shift', 'CapsLock']) {
    win.emit('keydown', { key: mod })
  }
  assert.equal(gestures, 0)

  const escPrevented = win.emit('keydown', { key: 'Escape' })
  assert.equal(escPrevented, false)
  assert.equal(input.backEdge, true)
  assert.equal(gestures, 0)
  input.endFrame()

  const bsPrevented = win.emit('keydown', { key: 'Backspace' })
  assert.equal(bsPrevented, true)
  assert.equal(input.backEdge, true)
  assert.equal(input.eraseEdge, true)
  assert.equal(gestures, 1)
  input.dispose()
})

test('ArrowUp and Space scroll natively while help modal is open, while H and Escape still close it', () => {
  const { win, doc } = createHarness()
  const input = createInput({ win, doc })

  doc.body.classList.add('help-open')
  assert.equal(win.emit('keydown', { key: 'ArrowUp' }), false)
  assert.equal(win.emit('keydown', { key: ' ' }), false)
  assert.equal(input.flapEdge, false)
  assert.equal(input.restartEdge, false)
  assert.equal(input.selectEdge, false)
  assert.equal(input.navEdge, 0)

  assert.equal(win.emit('keydown', { key: 'Escape' }), false)
  assert.equal(input.backEdge, true)
  input.endFrame()

  win.emit('keydown', { key: 'h' })
  assert.equal(input.helpEdge, true)
  input.endFrame()

  doc.body.classList.remove('help-open')
  const insideHelp = { closest: (sel) => (sel === '#help' ? {} : null) }
  assert.equal(win.emit('keydown', { key: 'ArrowUp', target: insideHelp }), false)
  assert.equal(input.flapEdge, false)

  assert.equal(win.emit('keydown', { key: 'ArrowUp' }), true)
  assert.equal(input.flapEdge, true)
  input.dispose()
})

test('pointerdown ignores non-primary buttons and restricts setPointerCapture to touch stick drags', () => {
  const { win, doc, captured } = createHarness({ width: 800 })
  let gestures = 0
  const input = createInput({ win, doc, onGesture: () => gestures++ })

  for (const button of [1, 2, 3, 4]) {
    win.emit('pointerdown', { pointerType: 'mouse', button, pointerId: 1, clientX: 100, clientY: 100 })
  }
  assert.equal(gestures, 0)
  assert.equal(input.flapEdge, false)
  assert.equal(input.tapEdge, false)
  assert.equal(captured.length, 0)

  // Primary mouse click flaps without capturing the pointer
  win.emit('pointerdown', { pointerType: 'mouse', button: 0, pointerId: 2, clientX: 100, clientY: 100 })
  assert.equal(gestures, 1)
  assert.equal(input.flapEdge, true)
  assert.equal(captured.length, 0)
  input.endFrame()

  // Right-half touch tap flaps without capturing the pointer
  win.emit('pointerdown', { pointerType: 'touch', button: 0, pointerId: 3, clientX: 600, clientY: 200 })
  assert.equal(input.mode, 'touch')
  assert.equal(input.flapEdge, true)
  assert.equal(captured.length, 0)
  input.endFrame()

  // Left-half touch drag captures the pointer on the target element and drives strafe
  const targetCaptured = []
  const stickTarget = {
    closest: () => null,
    setPointerCapture(id) {
      targetCaptured.push(id)
    },
  }
  win.emit('pointerdown', {
    pointerType: 'touch',
    button: 0,
    pointerId: 7,
    clientX: 120,
    clientY: 200,
    target: stickTarget,
  })
  assert.deepEqual(targetCaptured, [7])
  assert.equal(input.stick.active, true)

  win.emit('pointermove', { pointerId: 7, clientX: 120 + STICK_DEADZONE + STICK_RANGE })
  assert.equal(input.strafe, 1)

  win.emit('lostpointercapture', { pointerId: 7 })
  assert.equal(input.stick.active, false)
  assert.equal(input.strafe, 0)
  input.dispose()
})

test('non-preventing window listeners use { passive: true, signal } and clean up on abort', () => {
  const { win, doc, registrations, listeners } = createHarness()
  const ctl = new AbortController()
  const input = createInput({ win, doc, signal: ctl.signal })

  const byType = new Map(registrations.map((r) => [r.type, r.opts]))
  for (const active of ['keydown', 'pointerdown']) {
    assert.equal(byType.get(active)?.passive, undefined)
    assert.ok(byType.get(active)?.signal instanceof AbortSignal)
  }
  for (const passive of [
    'keyup',
    'pointermove',
    'pointerup',
    'pointercancel',
    'lostpointercapture',
    'blur',
  ]) {
    assert.equal(byType.get(passive)?.passive, true, `${passive} should be passive`)
    assert.ok(byType.get(passive)?.signal instanceof AbortSignal)
  }

  ctl.abort()
  for (const set of listeners.values()) assert.equal(set.size, 0)
  win.emit('keydown', { key: ' ' })
  assert.equal(input.flapEdge, false)
})

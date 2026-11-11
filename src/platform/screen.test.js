import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canRequestFullscreen, createScreen, isStandaloneDisplay, rotateFsAction } from './screen.js'

function createMediaQuery(initial = false) {
  const listeners = new Set()
  return {
    matches: initial,
    addEventListener(type, fn) {
      if (type === 'change') listeners.add(fn)
    },
    removeEventListener(type, fn) {
      if (type === 'change') listeners.delete(fn)
    },
    setMatches(next) {
      this.matches = next
      for (const fn of listeners) fn({ matches: next })
    },
    get listenerCount() {
      return listeners.size
    },
  }
}

test('rotateFsAction offers a button when the Fullscreen API exists', () => {
  assert.equal(rotateFsAction({ supportsFullscreen: true, standalone: false }), 'button')
})

test('rotateFsAction hints when the browser cannot request fullscreen', () => {
  assert.equal(rotateFsAction({ supportsFullscreen: false, standalone: false }), 'hint')
})

test('rotateFsAction hides chrome in an installed PWA', () => {
  assert.equal(rotateFsAction({ supportsFullscreen: true, standalone: true }), 'none')
  assert.equal(rotateFsAction({ supportsFullscreen: false, standalone: true }), 'none')
})

test('isStandaloneDisplay reads display-mode and iOS navigator.standalone', () => {
  const modes = new Map([
    ['(display-mode: standalone)', false],
    ['(display-mode: fullscreen)', false],
  ])
  const win = {
    matchMedia: (query) => ({ matches: modes.get(query) === true }),
  }
  const doc = {}

  assert.equal(isStandaloneDisplay(win, {}, doc), false)
  assert.equal(isStandaloneDisplay(win, { standalone: true }, doc), true)

  modes.set('(display-mode: standalone)', true)
  assert.equal(isStandaloneDisplay(win, {}, doc), true)

  modes.set('(display-mode: standalone)', false)
  modes.set('(display-mode: fullscreen)', true)
  assert.equal(isStandaloneDisplay(win, {}, doc), true)
})

test('isStandaloneDisplay does not treat element fullscreen as an installed PWA', () => {
  const win = {
    matchMedia: (query) => ({ matches: query === '(display-mode: fullscreen)' }),
  }
  assert.equal(isStandaloneDisplay(win, {}, { fullscreenElement: {} }), false)
  assert.equal(isStandaloneDisplay(win, {}, { webkitFullscreenElement: {} }), false)
  assert.equal(isStandaloneDisplay(win, {}, {}), true)
})

test('canRequestFullscreen honors fullscreenEnabled and webkitFullscreenEnabled policy gates', () => {
  assert.equal(canRequestFullscreen(null), false)
  assert.equal(canRequestFullscreen({ documentElement: {} }), false)
  assert.equal(canRequestFullscreen({ documentElement: { requestFullscreen() {} } }), true)
  assert.equal(
    canRequestFullscreen({ fullscreenEnabled: true, documentElement: { requestFullscreen() {} } }),
    true,
  )
  assert.equal(
    canRequestFullscreen({ fullscreenEnabled: false, documentElement: { requestFullscreen() {} } }),
    false,
  )
  assert.equal(
    canRequestFullscreen({
      webkitFullscreenEnabled: true,
      documentElement: { webkitRequestFullscreen() {} },
    }),
    true,
  )
  assert.equal(
    canRequestFullscreen({
      webkitFullscreenEnabled: false,
      documentElement: { webkitRequestFullscreen() {} },
    }),
    false,
  )
})

test('createScreen caches display-mode queries, fires onChange on PWA transitions, and cleans up on dispose', () => {
  const queries = new Map([
    ['(pointer: coarse)', createMediaQuery(false)],
    ['(orientation: portrait)', createMediaQuery(false)],
    ['(display-mode: standalone)', createMediaQuery(false)],
    ['(display-mode: fullscreen)', createMediaQuery(false)],
  ])
  let matchMediaCalls = 0
  const win = {
    matchMedia(query) {
      matchMediaCalls += 1
      return queries.get(query)
    },
  }
  const docListeners = new Map()
  const doc = {
    visibilityState: 'visible',
    fullscreenEnabled: false,
    documentElement: { requestFullscreen() {} },
    addEventListener(type, fn) {
      if (!docListeners.has(type)) docListeners.set(type, new Set())
      docListeners.get(type).add(fn)
    },
    removeEventListener(type, fn) {
      docListeners.get(type)?.delete(fn)
    },
  }
  let shellUnsubscribed = false
  const bridge = {
    onFocus(cb) {
      cb(true)
      return () => {
        shellUnsubscribed = true
      }
    },
  }

  const screen = createScreen({ win, nav: {}, doc, loc: { search: '' }, scr: {}, bridge })
  assert.equal(matchMediaCalls, 4)
  assert.equal(screen.supportsFullscreen, false)
  assert.equal(screen.isStandalone, false)
  assert.equal(screen.isStandalone, false)
  // Reading isStandalone uses cached MediaQueryLists rather than re-allocating
  assert.equal(matchMediaCalls, 4)

  let changes = 0
  screen.onChange = () => {
    changes += 1
  }

  queries.get('(display-mode: standalone)').setMatches(true)
  assert.equal(screen.isStandalone, true)
  assert.equal(changes, 1)

  queries.get('(display-mode: standalone)').setMatches(false)
  queries.get('(display-mode: fullscreen)').setMatches(true)
  assert.equal(screen.isStandalone, true)
  assert.equal(changes, 3)

  screen.dispose()
  assert.equal(shellUnsubscribed, true)
  for (const mq of queries.values()) assert.equal(mq.listenerCount, 0)
  for (const set of docListeners.values()) assert.equal(set.size, 0)

  queries.get('(display-mode: standalone)').setMatches(true)
  assert.equal(changes, 3)
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isStandaloneDisplay, rotateFsAction } from './screen.js'

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

  assert.equal(isStandaloneDisplay(win, {}), false)
  assert.equal(isStandaloneDisplay(win, { standalone: true }), true)

  modes.set('(display-mode: standalone)', true)
  assert.equal(isStandaloneDisplay(win, {}), true)

  modes.set('(display-mode: standalone)', false)
  modes.set('(display-mode: fullscreen)', true)
  assert.equal(isStandaloneDisplay(win, {}), true)
})

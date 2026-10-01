import { test } from 'node:test'
import assert from 'node:assert/strict'
import { displayHidden, watchShellFocus } from './shell.js'

test('displayHidden is the tab or an unfocused native window', () => {
  assert.equal(displayHidden({ visibility: 'visible' }), false)
  assert.equal(displayHidden({ visibility: 'hidden' }), true)
  assert.equal(displayHidden({ visibility: 'visible', shellFocused: false }), true)
  assert.equal(displayHidden({ visibility: 'hidden', shellFocused: true }), true)
})

test('watchShellFocus is a no-op without a bridge', () => {
  assert.equal(typeof watchShellFocus(() => {}, null), 'function')
  assert.equal(typeof watchShellFocus(() => {}, {}), 'function')
})

test('watchShellFocus forwards a boolean and can unsubscribe', () => {
  let listener = null
  const seen = []
  const bridge = {
    onFocus(callback) {
      listener = callback
      callback(true)
      return () => {
        listener = null
      }
    },
  }
  const stop = watchShellFocus((focused) => seen.push(focused), bridge)
  listener(false)
  listener('nope')
  stop()
  assert.equal(listener, null)
  assert.deepEqual(seen, [true, false, false])
})

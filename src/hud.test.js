import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MENU_ITEMS, pauseCopy, stepMenu } from './hud.js'

test('menu lists the five entries in order', () => {
  assert.deepEqual(MENU_ITEMS, ['new', 'tutorial', 'scores', 'help', 'credits'])
})

test('stepMenu moves one row and wraps at both ends', () => {
  assert.equal(stepMenu(0, 1, 5), 1)
  assert.equal(stepMenu(4, 1, 5), 0)
  assert.equal(stepMenu(0, -1, 5), 4)
  assert.equal(stepMenu(2, 0, 5), 2)
})

test('stepMenu clamps an out-of-range index back into the list', () => {
  assert.equal(stepMenu(7, 0, 5), 2)
  assert.equal(stepMenu(-1, 0, 5), 4)
  assert.equal(stepMenu(0, 1, 0), 0)
})

test('pauseCopy prompts a jump to begin a fresh run', () => {
  assert.deepEqual(pauseCopy('begin'), { title: 'JUMP TO BEGIN', sub: '' })
})

test('pauseCopy prompts a jump to resume after an interrupt', () => {
  assert.deepEqual(pauseCopy('resume'), { title: 'PAUSED', sub: 'JUMP TO RESUME' })
})

test('pauseCopy hides the hold overlay for lessons and screen blocks', () => {
  assert.equal(pauseCopy('lesson'), null)
  assert.equal(pauseCopy('rotate'), null)
  assert.equal(pauseCopy('hidden'), null)
})

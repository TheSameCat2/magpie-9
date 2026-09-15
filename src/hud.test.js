import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MENU_ITEMS, pauseCopy, stepMenu } from './hud.js'

test('menu lists the six entries in order', () => {
  assert.deepEqual(MENU_ITEMS, ['new', 'challenge', 'tutorial', 'scores', 'help', 'credits'])
})

test('stepMenu moves one row and wraps at both ends', () => {
  assert.equal(stepMenu(0, 1, 6), 1)
  assert.equal(stepMenu(5, 1, 6), 0)
  assert.equal(stepMenu(0, -1, 6), 5)
  assert.equal(stepMenu(2, 0, 6), 2)
})

test('stepMenu clamps an out-of-range index back into the list', () => {
  assert.equal(stepMenu(7, 0, 6), 1)
  assert.equal(stepMenu(-1, 0, 6), 5)
  assert.equal(stepMenu(0, 1, 0), 0)
})

test('pauseCopy prompts a jump to begin a fresh run', () => {
  assert.deepEqual(pauseCopy('begin'), { title: 'JUMP TO BEGIN', sub: '' })
})

test('pauseCopy prompts a jump to resume after an interrupt', () => {
  assert.deepEqual(pauseCopy('resume'), { title: 'PAUSED', sub: 'JUMP TO RESUME' })
})

test('pauseCopy shows a bare PAUSED for the pause menu, leaving the prompt to CONTINUE', () => {
  assert.deepEqual(pauseCopy('menu'), { title: 'PAUSED', sub: '' })
})

test('pauseCopy counts whole seconds down to 1 while a resume is pending', () => {
  assert.deepEqual(pauseCopy('countdown', 3), { title: '3', sub: 'RESUMING' })
  assert.deepEqual(pauseCopy('countdown', 2.4), { title: '3', sub: 'RESUMING' })
  assert.deepEqual(pauseCopy('countdown', 1.01), { title: '2', sub: 'RESUMING' })
  assert.deepEqual(pauseCopy('countdown', 0.2), { title: '1', sub: 'RESUMING' })
  assert.equal(pauseCopy('countdown', 0).title, '1', 'never flashes a 0')
})

test('pauseCopy hides the hold overlay for lessons and screen blocks', () => {
  assert.equal(pauseCopy('lesson'), null)
  assert.equal(pauseCopy('rotate'), null)
  assert.equal(pauseCopy('hidden'), null)
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MENU_BLURBS,
  MENU_ITEMS,
  endCopy,
  entryCopy,
  keysHint,
  lessonHint,
  pauseCopy,
  sceneHint,
  screenHint,
  stepMenu,
} from './copy.js'

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

test('pauseCopy prompts a jump to begin a fresh run, naming the device', () => {
  assert.deepEqual(pauseCopy('begin'), { title: 'JUMP TO BEGIN', sub: 'SPACE · CLICK · ↑' })
  assert.deepEqual(pauseCopy('begin', 0, 'touch'), { title: 'JUMP TO BEGIN', sub: 'TAP THE RIGHT HALF' })
})

test('lesson, screen, and key hints follow the input device', () => {
  assert.equal(lessonHint('keys'), 'SPACE TO CONTINUE')
  assert.equal(lessonHint('touch'), 'TAP TO CONTINUE')
  assert.equal(screenHint('credits', 'keys'), 'ESC TO RETURN')
  assert.equal(screenHint('credits', 'touch'), 'TAP TO RETURN')
  assert.equal(screenHint('scores', 'keys'), '← → BOARD · ESC RETURN')
  assert.equal(screenHint('scores', 'touch'), 'TAP TO RETURN')
  assert.equal(screenHint('menu', 'keys'), null)
  assert.equal(keysHint('menu'), 'H HELP · M MUTE')
  assert.equal(keysHint('playing'), 'P PAUSE · M MUTE')
  assert.equal(keysHint('respawn'), 'P PAUSE · M MUTE')
  assert.equal(MENU_BLURBS.challenge, "TODAY'S 40-GATE COURSE · RANKED BY TIME")
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

test('endCopy picks the card for a run, a new best, a tutorial, and both challenge outcomes', () => {
  assert.deepEqual(endCopy({ gameMode: 'run', score: 12 }), { title: 'REBOOT', prompt: 'RUN 12' })
  assert.deepEqual(endCopy({ gameMode: 'run', score: 12, newBest: true }), {
    title: 'REBOOT',
    prompt: 'NEW BEST 12',
  })
  assert.deepEqual(endCopy({ gameMode: 'tutorial', score: 3 }), {
    title: 'TUTORIAL',
    prompt: 'SESSION ENDED',
  })
  assert.deepEqual(endCopy({ gameMode: 'challenge', challenge: true, extracted: true, time: 61500 }), {
    title: 'EXTRACT',
    prompt: '1:01.5',
  })
  assert.deepEqual(endCopy({ gameMode: 'challenge', challenge: true, score: 17, target: 40 }), {
    title: 'EXTRACT FAILED',
    prompt: '17 / 40',
  })
})

test('entryCopy shows the rank with gates for a run and a time for a challenge', () => {
  assert.deepEqual(entryCopy({ score: 9, rank: 3 }), { title: 'REBOOT', prompt: 'RUN 9 · RANK #3' })
  assert.deepEqual(entryCopy({ score: 0, rank: 1, challenge: true, time: 90000 }), {
    title: 'EXTRACT',
    prompt: '1:30.0 · RANK #1',
  })
})

test('sceneHint swaps key names for taps on touch and stays quiet mid-run', () => {
  assert.equal(sceneHint('menu', 'keys'), '↑ ↓ SELECT · ENTER · H HELP')
  assert.equal(sceneHint('menu', 'touch'), 'TAP TO SELECT')
  assert.equal(sceneHint('dead', 'touch'), 'TAP FOR MENU')
  assert.equal(sceneHint('entry', 'keys'), 'TYPE OR ↑ ↓ · ENTER · ESC SKIP')
  assert.equal(sceneHint('entry', 'touch'), 'TAP ARROWS · ENTER OR SKIP')
  assert.equal(sceneHint('playing', 'keys'), null)
})

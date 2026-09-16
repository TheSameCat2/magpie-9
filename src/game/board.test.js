import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CHARS,
  createEntry,
  entryAction,
  initialsOf,
  placement,
  placementTime,
  qualifies,
  qualifiesTime,
  stepChar,
} from './board.js'

const full = [
  { initials: 'AAA', score: 20 },
  { initials: 'BBB', score: 18 },
  { initials: 'CCC', score: 16 },
  { initials: 'DDD', score: 14 },
  { initials: 'EEE', score: 12 },
  { initials: 'FFF', score: 10 },
  { initials: 'GGG', score: 8 },
  { initials: 'HHH', score: 6 },
  { initials: 'III', score: 4 },
  { initials: 'JJJ', score: 2 },
]

test('qualifies is false when the board is unknown', () => {
  assert.equal(qualifies(null, 99), false)
})

test('qualifies when the board is short', () => {
  assert.equal(qualifies([], 1), true)
  assert.equal(qualifies([{ initials: 'AAA', score: 5 }], 1), true)
})

test('qualifies only when beating the tenth score', () => {
  assert.equal(qualifies(full, 3), true)
  assert.equal(qualifies(full, 2), false)
  assert.equal(qualifies(full, 1), false)
})

test('placement is 1-based and later ties lose', () => {
  assert.equal(placement([], 7), 1)
  assert.equal(placement(full, 21), 1)
  assert.equal(placement(full, 18), 3)
  assert.equal(placement(full, 3), 10)
  assert.equal(placement(full, 2), 11)
})

const times = [
  { initials: 'AAA', score: 40000 },
  { initials: 'BBB', score: 45000 },
  { initials: 'CCC', score: 50000 },
  { initials: 'DDD', score: 55000 },
  { initials: 'EEE', score: 60000 },
  { initials: 'FFF', score: 65000 },
  { initials: 'GGG', score: 70000 },
  { initials: 'HHH', score: 75000 },
  { initials: 'III', score: 80000 },
  { initials: 'JJJ', score: 90000 },
]

test('qualifiesTime beats a slower tenth place', () => {
  assert.equal(qualifiesTime(null, 1), false)
  assert.equal(qualifiesTime([], 90000), true)
  assert.equal(qualifiesTime(times, 89999), true)
  assert.equal(qualifiesTime(times, 90000), false)
  assert.equal(qualifiesTime(times, 90001), false)
})

test('placementTime ranks lower times first and later ties lose', () => {
  assert.equal(placementTime([], 7), 1)
  assert.equal(placementTime(times, 39999), 1)
  assert.equal(placementTime(times, 45000), 3)
  assert.equal(placementTime(times, 89999), 10)
  assert.equal(placementTime(times, 90000), 11)
})

test('createEntry starts on AAA', () => {
  assert.deepEqual(createEntry(), { chars: ['A', 'A', 'A'], cursor: 0 })
  assert.equal(initialsOf(createEntry()), 'AAA')
})

test('stepChar wraps the alphabet and digits', () => {
  assert.equal(stepChar('A', 1), 'B')
  assert.equal(stepChar('A', -1), '9')
  assert.equal(stepChar('9', 1), 'A')
  assert.equal(stepChar('Z', 1), '0')
  assert.equal(CHARS.length, 36)
})

test('entryAction types a letter and advances', () => {
  const next = entryAction(createEntry(), { char: 'N' })
  assert.deepEqual(next.entry, { chars: ['N', 'A', 'A'], cursor: 1 })
  assert.equal(next.done, false)
})

test('entryAction select on the last slot finishes', () => {
  let cur = { entry: createEntry(), done: false }
  cur = entryAction(cur.entry, { char: 'N' })
  cur = entryAction(cur.entry, { char: 'R' })
  cur = entryAction(cur.entry, { char: 'D' })
  assert.deepEqual(cur.entry, { chars: ['N', 'R', 'D'], cursor: 2 })
  cur = entryAction(cur.entry, 'select')
  assert.equal(cur.done, true)
  assert.equal(initialsOf(cur.entry), 'NRD')
})

test('entryAction arrows move the cursor and spin a slot', () => {
  let cur = entryAction(createEntry(), 'right')
  cur = entryAction(cur.entry, 'up')
  assert.deepEqual(cur.entry, { chars: ['A', 'B', 'A'], cursor: 1 })
  cur = entryAction(cur.entry, { slot: 2, dir: -1 })
  assert.deepEqual(cur.entry, { chars: ['A', 'B', '9'], cursor: 2 })
  cur = entryAction(cur.entry, 'erase')
  assert.equal(cur.entry.cursor, 1)
})

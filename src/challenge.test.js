import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateCourse } from './challenge.js'
import { createRng, CHALLENGE_TARGET, formatTime, minChallengeSeconds, utcDay } from './rules.js'

test('generateCourse is deterministic for a seed', () => {
  const a = generateCourse(createRng(42), 12)
  const b = generateCourse(createRng(42), 12)
  assert.equal(a.length, 12)
  assert.deepEqual(
    a.map((g) => ({ type: g.type, offset: g.offset, orb: g.orb, hole: g.layout.hole, gapY: g.layout.gapY, side: g.layout.side })),
    b.map((g) => ({ type: g.type, offset: g.offset, orb: g.orb, hole: g.layout.hole, gapY: g.layout.gapY, side: g.layout.side })),
  )
})

test('a different seed yields a different course', () => {
  const a = generateCourse(createRng(1), 16)
  const b = generateCourse(createRng(2), 16)
  const sig = (g) => `${g.type}:${g.layout.hole?.x ?? g.layout.gapY ?? g.layout.side}:${g.orb?.type ?? ''}`
  assert.notEqual(a.map(sig).join('|'), b.map(sig).join('|'))
})

test('challenge courses still warm up with two centred bulkheads', () => {
  const course = generateCourse(createRng(99), CHALLENGE_TARGET)
  assert.equal(course.length, CHALLENGE_TARGET)
  assert.equal(course[0].type, 'bulkhead')
  assert.equal(course[1].type, 'bulkhead')
  assert.equal(course[0].offset, 0)
  assert.equal(course[1].offset, 0)
  assert.ok(course.some((g) => g.type === 'sled'), 'expected a sled somewhere in 40 gates')
})

test('formatTime is m:ss.t without rounding up', () => {
  assert.equal(formatTime(0), '0:00.0')
  assert.equal(formatTime(83247), '1:23.2')
  assert.equal(formatTime(999), '0:00.9')
})

test('utcDay is the UTC calendar date', () => {
  assert.equal(utcDay(Date.UTC(2026, 8, 14, 23, 30)), '2026-09-14')
  assert.equal(utcDay(Date.UTC(2026, 8, 15, 0, 0)), '2026-09-15')
})

test('minChallengeSeconds is faster than a no-shunt run', () => {
  assert.ok(minChallengeSeconds(40) < 40)
  assert.ok(minChallengeSeconds(40) > 10)
})

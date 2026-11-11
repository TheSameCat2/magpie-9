import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRunClock } from './clock.js'

function fakeNow(start = 1_000) {
  let t = start
  const now = () => t
  now.advance = (ms) => {
    t += ms
  }
  return now
}

test('run clock counts wall-clock time while running', () => {
  const now = fakeNow()
  const clock = createRunClock(now)
  clock.start()
  now.advance(4_000)
  assert.equal(clock.elapsed(), 4_000)
  assert.equal(clock.pausedMs, 0)
})

test('run clock excludes held intervals from elapsed time', () => {
  const now = fakeNow()
  const clock = createRunClock(now)
  clock.start()
  now.advance(2_000)
  clock.hold()
  now.advance(30_000)
  clock.release()
  now.advance(3_000)
  assert.equal(clock.elapsed(), 5_000)
  assert.equal(clock.pausedMs, 30_000)
  assert.equal(clock.held, false)
})

test('run clock reports an open hold without releasing it', () => {
  const now = fakeNow()
  const clock = createRunClock(now)
  clock.start()
  now.advance(1_000)
  clock.hold()
  now.advance(7_000)
  assert.equal(clock.held, true)
  assert.equal(clock.elapsed(), 1_000)
  assert.equal(clock.pausedMs, 7_000)
})

test('run clock holds are idempotent and do not double count', () => {
  const now = fakeNow()
  const clock = createRunClock(now)
  clock.start()
  clock.hold()
  now.advance(5_000)
  clock.hold()
  now.advance(5_000)
  clock.release()
  clock.release()
  assert.equal(clock.pausedMs, 10_000)
  assert.equal(clock.elapsed(), 0)
})

test('run clock starts from a supplied server timestamp and resets holds', () => {
  const now = fakeNow(50_000)
  const clock = createRunClock(now)
  clock.start()
  clock.hold()
  now.advance(1_000)
  clock.start(49_000)
  assert.equal(clock.held, false)
  assert.equal(clock.pausedMs, 0)
  assert.equal(clock.elapsed(), 2_000)
})

test('run clock defaults to monotonic performance.now and ignores Date.now jumps', () => {
  const origDateNow = Date.now
  const origPerfNow = performance.now
  let mono = 10_000.25
  let wall = 1_700_000_000_000
  Date.now = () => wall
  performance.now = () => mono
  try {
    const clock = createRunClock()
    clock.start()
    mono += 1_500.5
    wall -= 60_000
    clock.hold()
    mono += 4_000
    wall += 120_000
    clock.release()
    mono += 2_250.25
    assert.equal(clock.pausedMs, 4_000)
    assert.equal(clock.elapsed(), 3_750.75)
  } finally {
    Date.now = origDateNow
    performance.now = origPerfNow
  }
})

import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.BOARD_SECRET = process.env.BOARD_SECRET || 'test-secret'

const { EXTRACT_SKEW_MS, validateSubmission } = await import('./scores.js')
const { issueToken, verify } = await import('./_lib/token.js')
const { minChallengeSeconds } = await import('../src/config/rules.js')

function challengeBody(overrides = {}) {
  const token = overrides.token ?? issueToken({ mode: 'challenge', day: '2026-09-14', target: 40 })
  return {
    initials: 'AAA',
    token,
    score: 50_000,
    pausedMs: 12_000,
    ...overrides,
  }
}

function submitAt(body, extraMs) {
  const parsed = verify(body.token)
  return validateSubmission(body, parsed.t0 + extraMs)
}

test('challenge rank is the claimed extract, not the token clock at POST', () => {
  const extract = 50_000
  const paused = 12_000
  const entryMs = 8_000
  const body = challengeBody({ score: extract, pausedMs: paused })
  const result = submitAt(body, extract + paused + entryMs)
  assert.equal(result.error, undefined)
  assert.equal(result.timeMs, extract)
})

test('typing initials after extract does not change the ranked time', () => {
  const extract = 61_500
  const paused = 3_000
  const body = challengeBody({ score: extract, pausedMs: paused })
  const quick = submitAt(body, extract + paused + 200)
  const slow = submitAt(body, extract + paused + 15_000)
  assert.equal(quick.timeMs, extract)
  assert.equal(slow.timeMs, extract)
  assert.equal(quick.timeMs, slow.timeMs)
})

test('challenge still rejects an extract faster than the physics floor', () => {
  const floorMs = minChallengeSeconds(40) * 0.9 * 1000
  const body = challengeBody({ score: Math.floor(floorMs) - 1, pausedMs: 0 })
  const result = submitAt(body, 90_000)
  assert.equal(result.error, 'TOO FAST')
  assert.equal(result.status, 400)
})

test('challenge rejects a claimed extract that beats the token clock past skew', () => {
  const extract = 50_000
  const paused = 5_000
  const body = challengeBody({ score: extract, pausedMs: paused })
  const wall = extract + paused
  const result = submitAt(body, wall - EXTRACT_SKEW_MS - 1)
  assert.equal(result.error, 'BAD TIME')
})

test('challenge allows a claimed extract slightly ahead of the token clock', () => {
  const extract = 50_000
  const paused = 5_000
  const body = challengeBody({ score: extract, pausedMs: paused })
  const wall = extract + paused
  const result = submitAt(body, wall - 1_000)
  assert.equal(result.error, undefined)
  assert.equal(result.timeMs, extract)
})

test('challenge rejects a missing or impossible extract time', () => {
  const token = issueToken({ mode: 'challenge', day: '2026-09-14', target: 40 })
  const parsed = verify(token)
  const nowMs = parsed.t0 + 90_000
  assert.equal(validateSubmission({ initials: 'AAA', token, pausedMs: 0 }, nowMs).error, 'BAD SCORE')
  assert.equal(
    validateSubmission({ initials: 'AAA', token, score: -1, pausedMs: 0 }, nowMs).error,
    'BAD SCORE',
  )
  assert.equal(
    validateSubmission({ initials: 'AAA', token, score: 50_000.4, pausedMs: 0 }, nowMs).error,
    undefined,
  )
  assert.equal(
    validateSubmission({ initials: 'AAA', token, score: 50_000.4, pausedMs: 0 }, nowMs).timeMs,
    50_000,
  )
})

test('challenge still rejects a pause that cannot be real', () => {
  const body = challengeBody({ score: 50_000, pausedMs: 200_000 })
  const result = submitAt(body, 90_000)
  assert.equal(result.error, 'BAD PAUSE')
})

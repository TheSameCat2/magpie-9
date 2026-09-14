import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.BOARD_SECRET = process.env.BOARD_SECRET || 'test-secret'

const {
  challengeBoardKey,
  challengeSeed,
  issueToken,
  rankTime,
  timeFromRank,
  toBoard,
  verify,
} = await import('./board.js')

test('endless tokens still verify as run mode', () => {
  const token = issueToken()
  const parsed = verify(token)
  assert.equal(parsed.mode, 'run')
  assert.equal(typeof parsed.t0, 'number')
  assert.equal(parsed.day, undefined)
})

test('challenge tokens bind day and target', () => {
  const token = issueToken({ mode: 'challenge', day: '2026-09-14', target: 40 })
  const parsed = verify(token)
  assert.equal(parsed.mode, 'challenge')
  assert.equal(parsed.day, '2026-09-14')
  assert.equal(parsed.target, 40)
})

test('tampering with the day fails verify', () => {
  const token = issueToken({ mode: 'challenge', day: '2026-09-14', target: 40 })
  const parts = token.split('.')
  parts[3] = '2026-09-15'
  assert.equal(verify(parts.join('.')), null)
})

test('challengeSeed is stable for a day', () => {
  assert.equal(challengeSeed('2026-09-14'), challengeSeed('2026-09-14'))
  assert.notEqual(challengeSeed('2026-09-14'), challengeSeed('2026-09-15'))
})

test('challengeBoardKey is per UTC day', () => {
  assert.equal(challengeBoardKey('2026-09-14'), 'magpie9:board:challenge:2026-09-14')
})

test('rankTime inverts milliseconds so faster ranks higher', () => {
  const fast = rankTime(40000, 1)
  const slow = rankTime(50000, 1)
  assert.ok(fast > slow)
  assert.equal(timeFromRank(fast), 40000)
  assert.equal(timeFromRank(slow), 50000)
})

test('toBoard maps challenge zset scores back to milliseconds', () => {
  const t0 = 1_700_000_000_000
  const pairs = [
    { member: 'AAA:deadbeef', score: rankTime(83247, t0) },
    { member: 'BBB:cafebabe', score: rankTime(90000, t0) },
  ]
  assert.deepEqual(toBoard(pairs, 'challenge'), [
    { initials: 'AAA', score: 83247 },
    { initials: 'BBB', score: 90000 },
  ])
})

// Leaderboards are Redis sorted sets. Members are `INITIALS:nonce` so the
// same initials can hold several rows; the zset score encodes rank order
// with the token time as a tiebreak (earlier wins).

import { BOARD_SIZE } from '../../src/config/rules.js'
import { getRedis } from './redis.js'

export const BOARD_KEY = 'magpie9:board'
/** Challenge boards live a week past their day so late viewers can still see them. */
export const CHALLENGE_TTL = 8 * 86400

export function challengeBoardKey(day) {
  return `magpie9:board:challenge:${day}`
}

export function memberOf(initials, nonce) {
  return `${initials}:${nonce}`
}

export function initialsOfMember(member) {
  return String(member).slice(0, 3)
}

/** Run rank: gates, earlier token breaks ties. */
export function rankScore(gates, t0) {
  return gates + (1 - t0 / 1e13)
}

/** Challenge rank: negative elapsed so a faster extract is a higher zset score. */
export function rankTime(ms, t0) {
  return -ms + (1 - t0 / 1e13) * 1e-6
}

export function timeFromRank(z) {
  return Math.max(0, Math.round(-Number(z)))
}

/**
 * Token-clock ceiling for a challenge extract: wall-clock since the token
 * minus the time the client held the run. The ranked time is the client's
 * frozen extract; this bound is what keeps a forged (too-fast) claim from
 * beating a clock that has not existed long enough. Returns null when the
 * pause claim cannot be a real hold.
 */
export function playedMs(elapsedMs, pausedMs = 0) {
  const paused = pausedMs === undefined || pausedMs === null ? 0 : Number(pausedMs)
  if (!Number.isSafeInteger(paused) || paused < 0 || paused > elapsedMs) return null
  return elapsedMs - paused
}

/** Upstash returns either `[{member, score}]` or a flat `[member, score, ...]` list. */
export function parseRows(rows) {
  if (!rows) return []
  if (
    Array.isArray(rows) &&
    rows.length &&
    typeof rows[0] === 'object' &&
    rows[0] !== null &&
    'member' in rows[0]
  ) {
    return rows.map((row) => ({ member: String(row.member), score: Number(row.score) }))
  }
  const pairs = []
  for (let i = 0; i < rows.length; i += 2) {
    pairs.push({ member: String(rows[i]), score: Number(rows[i + 1]) })
  }
  return pairs
}

export function toBoard(pairs, kind = 'run') {
  return pairs.map((row) => ({
    initials: initialsOfMember(row.member),
    score: kind === 'challenge' ? timeFromRank(row.score) : Math.floor(row.score),
  }))
}

export function rankOfMember(pairs, member) {
  const i = pairs.findIndex((row) => row.member === member)
  return i >= 0 ? i + 1 : -1
}

function topRows(target, key) {
  return target.zrange(key, 0, BOARD_SIZE - 1, { rev: true, withScores: true })
}

export async function readBoard(client = getRedis(), key = BOARD_KEY, kind = 'run') {
  return toBoard(parseRows(await topRows(client, key)), kind)
}

/**
 * Insert a row, trim the set to BOARD_SIZE, and return the resulting top rows
 * as `{ board, rank }`. `ttl` (seconds) is applied to dated challenge keys.
 */
export async function writeScore(client, { key, member, rank, kind = 'run', ttl = 0 }) {
  const pipeline = client.multi()
  pipeline.zadd(key, { score: rank, member })
  if (ttl > 0) pipeline.expire(key, ttl)
  pipeline.zremrangebyrank(key, 0, -(BOARD_SIZE + 1))
  topRows(pipeline, key)
  const results = await pipeline.exec()
  const pairs = parseRows(results[results.length - 1])
  return { board: toBoard(pairs, kind), rank: rankOfMember(pairs, member) }
}

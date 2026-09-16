import { MAX_SCORE, minChallengeSeconds, minRunSeconds } from '../src/config/rules.js'
import { DAY_RE, utcDay } from '../src/lib/time.js'
import {
  BOARD_KEY,
  CHALLENGE_TTL,
  challengeBoardKey,
  memberOf,
  playedMs,
  rankScore,
  rankTime,
  readBoard,
  writeScore,
} from './_lib/board.js'
import { clientIp, fail, json } from './_lib/http.js'
import { acceptableInitials, normalizeInitials } from './_lib/initials.js'
import { getRedis, scoreRatelimit, takeNonce } from './_lib/redis.js'
import { secret, verify } from './_lib/token.js'

/** Tolerance on the physics floor, for clock skew and a generous frame clamp. */
const MIN_FACTOR = 0.9
/** Tokens older than this can no longer post. */
const MAX_RUN_SECONDS = 86400

export async function GET(request) {
  const url = new URL(request.url)
  const challenge = url.searchParams.get('mode') === 'challenge'
  try {
    if (!challenge) return json({ board: await readBoard() })
    const day = url.searchParams.get('day') || utcDay()
    if (!DAY_RE.test(day)) return fail('BAD DAY', 400)
    const board = await readBoard(getRedis(), challengeBoardKey(day), 'challenge')
    return json({ board, day, now: Date.now() })
  } catch {
    return fail('BOARD OFFLINE', 503)
  }
}

/**
 * Validate a submission without touching Redis. Returns `{ error, status }`
 * or `{ initials, parsed, score, timeMs }` ready to write.
 */
function validateSubmission(body, nowMs = Date.now()) {
  const initials = normalizeInitials(body?.initials)
  if (!acceptableInitials(initials)) return { error: 'BAD INITIALS', status: 400 }

  const parsed = verify(body?.token)
  if (!parsed) return { error: 'BAD TOKEN', status: 400 }

  const elapsedMs = nowMs - parsed.t0
  if (elapsedMs / 1000 > MAX_RUN_SECONDS) return { error: 'EXPIRED', status: 400 }

  if (parsed.mode === 'challenge') {
    // Challenge rank is the time played, not the time since the token was
    // issued: the client reports how long it held the run so pauses stop the clock.
    const timeMs = playedMs(elapsedMs, body?.pausedMs ?? 0)
    if (timeMs === null) return { error: 'BAD PAUSE', status: 400 }
    if (timeMs / 1000 < minChallengeSeconds(parsed.target) * MIN_FACTOR)
      return { error: 'TOO FAST', status: 400 }
    return { initials, parsed, timeMs }
  }

  // Endless runs rank by gates, so their pauses do not matter here.
  const score = Number(body?.score)
  if (!Number.isInteger(score) || score < 1 || score > MAX_SCORE) return { error: 'BAD SCORE', status: 400 }
  if (elapsedMs / 1000 < minRunSeconds(score) * MIN_FACTOR) return { error: 'TOO FAST', status: 400 }
  return { initials, parsed, score }
}

export async function POST(request) {
  if (!secret()) return fail('BOARD OFFLINE', 503)

  try {
    const { success } = await scoreRatelimit().limit(clientIp(request))
    if (!success) return fail('SLOW DOWN', 429)
  } catch {
    return fail('BOARD OFFLINE', 503)
  }

  let body
  try {
    body = await request.json()
  } catch {
    return fail('BAD REQUEST', 400)
  }

  const submission = validateSubmission(body)
  if (submission.error) return fail(submission.error, submission.status)
  const { initials, parsed, score, timeMs } = submission

  let redis
  try {
    redis = getRedis()
  } catch {
    return fail('BOARD OFFLINE', 503)
  }

  if (!(await takeNonce(parsed.nonce, redis))) return fail('REPLAY', 409)

  const member = memberOf(initials, parsed.nonce)
  if (parsed.mode === 'challenge') {
    const result = await writeScore(redis, {
      key: challengeBoardKey(parsed.day),
      member,
      rank: rankTime(timeMs, parsed.t0),
      kind: 'challenge',
      ttl: CHALLENGE_TTL,
    })
    return json({ ...result, day: parsed.day, time: timeMs })
  }

  return json(await writeScore(redis, { key: BOARD_KEY, member, rank: rankScore(score, parsed.t0) }))
}

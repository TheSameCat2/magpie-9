import { BOARD_SIZE, MAX_SCORE, minRunSeconds } from '../src/rules.js'
import {
  BLOCKLIST,
  BOARD_KEY,
  clientIp,
  getRedis,
  json,
  memberOf,
  parseRows,
  rankOfMember,
  rankScore,
  readBoard,
  scoreRatelimit,
  secret,
  takeNonce,
  toBoard,
  verify,
} from './_lib/board.js'

const INITIALS_RE = /^[A-Z0-9]{3}$/
const MIN_FACTOR = 0.9

export async function GET() {
  try {
    return json({ board: await readBoard() })
  } catch {
    return json({ error: 'BOARD OFFLINE' }, 503)
  }
}

export async function POST(request) {
  if (!secret()) return json({ error: 'BOARD OFFLINE' }, 503)

  try {
    const { success } = await scoreRatelimit().limit(clientIp(request))
    if (!success) return json({ error: 'SLOW DOWN' }, 429)
  } catch {
    return json({ error: 'BOARD OFFLINE' }, 503)
  }

  let body
  try {
    body = await request.json()
  } catch {
    return json({ error: 'BAD REQUEST' }, 400)
  }

  const initials = String(body?.initials || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 3)
  const score = Number(body?.score)
  const token = body?.token

  if (!INITIALS_RE.test(initials)) return json({ error: 'BAD INITIALS' }, 400)
  if (BLOCKLIST.has(initials)) return json({ error: 'BAD INITIALS' }, 400)
  if (!Number.isInteger(score) || score < 1 || score > MAX_SCORE) return json({ error: 'BAD SCORE' }, 400)

  const parsed = verify(token)
  if (!parsed) return json({ error: 'BAD TOKEN' }, 400)

  const elapsed = (Date.now() - parsed.t0) / 1000
  if (elapsed > 86400) return json({ error: 'EXPIRED' }, 400)
  if (elapsed < minRunSeconds(score) * MIN_FACTOR) return json({ error: 'TOO FAST' }, 400)

  let redis
  try {
    redis = getRedis()
  } catch {
    return json({ error: 'BOARD OFFLINE' }, 503)
  }

  const claimed = await takeNonce(parsed.nonce, redis)
  if (!claimed) return json({ error: 'REPLAY' }, 409)

  const member = memberOf(initials, parsed.nonce)
  const pipeline = redis.multi()
  pipeline.zadd(BOARD_KEY, { score: rankScore(score, parsed.t0), member })
  pipeline.zremrangebyrank(BOARD_KEY, 0, -(BOARD_SIZE + 1))
  pipeline.zrange(BOARD_KEY, 0, BOARD_SIZE - 1, { rev: true, withScores: true })
  const results = await pipeline.exec()
  const pairs = parseRows(results[results.length - 1])
  return json({ board: toBoard(pairs), rank: rankOfMember(pairs, member) })
}

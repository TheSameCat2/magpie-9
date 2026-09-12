import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { BOARD_SIZE } from '../../src/rules.js'

export const BOARD_KEY = 'magpie9:board'
export const RUN_TTL = 86400

export const BLOCKLIST = new Set([
  'ASS',
  'CUM',
  'DIK',
  'FAG',
  'FUK',
  'FUC',
  'KKK',
  'NIG',
  'SEX',
  'TIT',
])

let redis
let runLimit
let scoreLimit

export function getRedis() {
  if (!redis) redis = Redis.fromEnv()
  return redis
}

function limiter(window) {
  return new Ratelimit({
    redis: getRedis(),
    limiter: Ratelimit.slidingWindow(window, '1 m'),
    prefix: 'magpie9:rl',
  })
}

export function runRatelimit() {
  if (!runLimit) runLimit = limiter(30)
  return runLimit
}

export function scoreRatelimit() {
  if (!scoreLimit) scoreLimit = limiter(10)
  return scoreLimit
}

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  })
}

export function clientIp(request) {
  const fwd = request.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return request.headers.get('x-real-ip') || 'local'
}

export function secret() {
  return process.env.BOARD_SECRET || ''
}

export function issueToken() {
  const nonce = randomBytes(16).toString('hex')
  const t0 = Date.now()
  return sign(nonce, t0)
}

export function sign(nonce, t0) {
  const sig = createHmac('sha256', secret()).update(`${nonce}.${t0}`).digest('hex')
  return `${nonce}.${t0}.${sig}`
}

export function verify(token) {
  if (typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [nonce, t0s, sig] = parts
  if (!/^[a-f0-9]{32}$/.test(nonce)) return null
  if (!/^\d+$/.test(t0s)) return null
  if (!/^[a-f0-9]{64}$/.test(sig)) return null
  const expected = createHmac('sha256', secret()).update(`${nonce}.${t0s}`).digest('hex')
  const a = Buffer.from(sig, 'hex')
  const b = Buffer.from(expected, 'hex')
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  return { nonce, t0: Number(t0s) }
}

export function memberOf(initials, nonce) {
  return `${initials}:${nonce}`
}

export function initialsOfMember(member) {
  return String(member).slice(0, 3)
}

export function rankScore(gates, t0) {
  return gates + (1 - t0 / 1e13)
}

export function parseRows(rows) {
  if (!rows) return []
  if (Array.isArray(rows) && rows.length && typeof rows[0] === 'object' && rows[0] !== null && 'member' in rows[0]) {
    return rows.map((row) => ({ member: String(row.member), score: Number(row.score) }))
  }
  const pairs = []
  for (let i = 0; i < rows.length; i += 2) {
    pairs.push({ member: String(rows[i]), score: Number(rows[i + 1]) })
  }
  return pairs
}

export function toBoard(pairs) {
  return pairs.map((row) => ({ initials: initialsOfMember(row.member), score: Math.floor(row.score) }))
}

export async function readBoard(client = getRedis()) {
  const rows = await client.zrange(BOARD_KEY, 0, BOARD_SIZE - 1, { rev: true, withScores: true })
  return toBoard(parseRows(rows))
}

export function rankOfMember(pairs, member) {
  const i = pairs.findIndex((row) => row.member === member)
  return i >= 0 ? i + 1 : -1
}

export async function takeNonce(nonce, client = getRedis()) {
  const ok = await client.set(`magpie9:run:${nonce}`, '1', { nx: true, ex: RUN_TTL })
  return ok !== null
}

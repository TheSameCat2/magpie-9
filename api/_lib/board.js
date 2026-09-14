import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { BOARD_SIZE, CHALLENGE_TARGET, DAY_RE, utcDay } from '../../src/rules.js'

export const BOARD_KEY = 'magpie9:board'
export const RUN_TTL = 86400
export const CHALLENGE_TTL = 8 * 86400

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

export function challengeBoardKey(day) {
  return `magpie9:board:challenge:${day}`
}

export function challengeSeed(day, sec = secret()) {
  return createHmac('sha256', sec).update(`challenge:${day}`).digest().readUInt32BE(0)
}

function hmacHex(payload) {
  return createHmac('sha256', secret()).update(payload).digest('hex')
}

function matchSig(sig, expected) {
  const a = Buffer.from(sig, 'hex')
  const b = Buffer.from(expected, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

export function issueToken(opts = {}) {
  const nonce = randomBytes(16).toString('hex')
  const t0 = Date.now()
  if (opts.mode === 'challenge') {
    const day = opts.day || utcDay(t0)
    const target = opts.target || CHALLENGE_TARGET
    return signChallenge(nonce, t0, day, target)
  }
  return sign(nonce, t0)
}

export function sign(nonce, t0) {
  return `${nonce}.${t0}.${hmacHex(`${nonce}.${t0}`)}`
}

export function signChallenge(nonce, t0, day, target) {
  const payload = `${nonce}.${t0}.challenge.${day}.${target}`
  return `${payload}.${hmacHex(payload)}`
}

export function verify(token) {
  if (typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length === 3) {
    const [nonce, t0s, sig] = parts
    if (!/^[a-f0-9]{32}$/.test(nonce)) return null
    if (!/^\d+$/.test(t0s)) return null
    if (!/^[a-f0-9]{64}$/.test(sig)) return null
    if (!matchSig(sig, hmacHex(`${nonce}.${t0s}`))) return null
    return { nonce, t0: Number(t0s), mode: 'run' }
  }
  if (parts.length === 6) {
    const [nonce, t0s, mode, day, targetS, sig] = parts
    if (mode !== 'challenge') return null
    if (!/^[a-f0-9]{32}$/.test(nonce)) return null
    if (!/^\d+$/.test(t0s)) return null
    if (!DAY_RE.test(day)) return null
    if (!/^\d+$/.test(targetS)) return null
    if (!/^[a-f0-9]{64}$/.test(sig)) return null
    const target = Number(targetS)
    if (target < 1 || target > 9999) return null
    if (!matchSig(sig, hmacHex(`${nonce}.${t0s}.challenge.${day}.${targetS}`))) return null
    return { nonce, t0: Number(t0s), mode: 'challenge', day, target }
  }
  return null
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

export function rankTime(ms, t0) {
  // Negative elapsed so a faster extract is a higher zset score.
  return -ms + (1 - t0 / 1e13) * 1e-6
}

export function timeFromRank(z) {
  return Math.max(0, Math.round(-Number(z)))
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

export function toBoard(pairs, kind = 'run') {
  return pairs.map((row) => ({
    initials: initialsOfMember(row.member),
    score: kind === 'challenge' ? timeFromRank(row.score) : Math.floor(row.score),
  }))
}

export async function readBoard(client = getRedis(), key = BOARD_KEY, kind = 'run') {
  const rows = await client.zrange(key, 0, BOARD_SIZE - 1, { rev: true, withScores: true })
  return toBoard(parseRows(rows), kind)
}

export function rankOfMember(pairs, member) {
  const i = pairs.findIndex((row) => row.member === member)
  return i >= 0 ? i + 1 : -1
}

export async function takeNonce(nonce, client = getRedis()) {
  const ok = await client.set(`magpie9:run:${nonce}`, '1', { nx: true, ex: RUN_TTL })
  return ok !== null
}

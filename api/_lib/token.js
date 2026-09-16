// Run tokens: an HMAC-signed nonce + issue time handed out when a run starts
// and required to post a score. Challenge tokens also bind the day and target.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { CHALLENGE_TARGET, MAX_SCORE } from '../../src/config/rules.js'
import { DAY_RE, utcDay } from '../../src/lib/time.js'

const NONCE_RE = /^[a-f0-9]{32}$/
const DIGITS_RE = /^\d+$/
const SIG_RE = /^[a-f0-9]{64}$/

export function secret() {
  return process.env.BOARD_SECRET || ''
}

/** Deterministic per-day seed for the challenge course, derived from the secret. */
export function challengeSeed(day, sec = secret()) {
  return createHmac('sha256', sec).update(`challenge:${day}`).digest().readUInt32BE(0)
}

function hmacHex(payload) {
  return createHmac('sha256', secret()).update(payload).digest('hex')
}

function signatureMatches(sig, expected) {
  const a = Buffer.from(sig, 'hex')
  const b = Buffer.from(expected, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

function signed(payload) {
  return `${payload}.${hmacHex(payload)}`
}

export function sign(nonce, t0) {
  return signed(`${nonce}.${t0}`)
}

export function signChallenge(nonce, t0, day, target) {
  return signed(`${nonce}.${t0}.challenge.${day}.${target}`)
}

export function issueToken({ mode = 'run', day, target } = {}) {
  const nonce = randomBytes(16).toString('hex')
  const t0 = Date.now()
  if (mode === 'challenge') return signChallenge(nonce, t0, day || utcDay(t0), target || CHALLENGE_TARGET)
  return sign(nonce, t0)
}

/**
 * Parse and authenticate a token. Returns `{ nonce, t0, mode }` plus
 * `{ day, target }` for challenges, or null for anything malformed or forged.
 */
export function verify(token) {
  if (typeof token !== 'string') return null
  const parts = token.split('.')

  if (parts.length === 3) {
    const [nonce, t0s, sig] = parts
    if (!NONCE_RE.test(nonce) || !DIGITS_RE.test(t0s) || !SIG_RE.test(sig)) return null
    if (!signatureMatches(sig, hmacHex(`${nonce}.${t0s}`))) return null
    return { nonce, t0: Number(t0s), mode: 'run' }
  }

  if (parts.length === 6) {
    const [nonce, t0s, mode, day, targetS, sig] = parts
    if (mode !== 'challenge') return null
    if (!NONCE_RE.test(nonce) || !DIGITS_RE.test(t0s) || !SIG_RE.test(sig)) return null
    if (!DAY_RE.test(day) || !DIGITS_RE.test(targetS)) return null
    const target = Number(targetS)
    if (target < 1 || target > MAX_SCORE) return null
    if (!signatureMatches(sig, hmacHex(`${nonce}.${t0s}.challenge.${day}.${targetS}`))) return null
    return { nonce, t0: Number(t0s), mode: 'challenge', day, target }
  }

  return null
}

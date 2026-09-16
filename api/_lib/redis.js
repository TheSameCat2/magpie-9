// Upstash Redis client + rate limiters, created lazily so importing this
// module in tests never touches the network or the environment.

import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

/** Seconds a run token's nonce stays claimed; also the token's lifetime. */
export const RUN_TTL = 86400

let redis
let runLimit
let scoreLimit

export function getRedis() {
  if (!redis) redis = Redis.fromEnv()
  return redis
}

function slidingWindow(perMinute) {
  return new Ratelimit({
    redis: getRedis(),
    limiter: Ratelimit.slidingWindow(perMinute, '1 m'),
    prefix: 'magpie9:rl',
  })
}

/** Token issue: 30 / minute / IP. */
export function runRatelimit() {
  if (!runLimit) runLimit = slidingWindow(30)
  return runLimit
}

/** Score submit: 10 / minute / IP. */
export function scoreRatelimit() {
  if (!scoreLimit) scoreLimit = slidingWindow(10)
  return scoreLimit
}

/** Claim a token nonce exactly once; false means it was already spent. */
export async function takeNonce(nonce, client = getRedis()) {
  const ok = await client.set(`magpie9:run:${nonce}`, '1', { nx: true, ex: RUN_TTL })
  return ok !== null
}

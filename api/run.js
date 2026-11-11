import { CHALLENGE_TARGET } from '../src/config/rules.js'
import { utcDay } from '../src/lib/time.js'
import { clientIp, fail, isCrossSitePost, json, readJsonBody } from './_lib/http.js'
import { runRatelimit } from './_lib/redis.js'
import { challengeSeed, issueToken, secret } from './_lib/token.js'

export function createRunPost({
  getSecret = secret,
  ratelimit = runRatelimit,
  issue = issueToken,
  seed = challengeSeed,
  now = Date.now,
} = {}) {
  return async function POST(request) {
    if (isCrossSitePost(request)) return fail('FORBIDDEN', 403)
    if (!getSecret()) return fail('BOARD OFFLINE', 503)

    const parsedBody = await readJsonBody(request)
    if (!parsedBody.ok) return fail(parsedBody.error, parsedBody.status)

    try {
      const { success } = await ratelimit().limit(clientIp(request))
      if (!success) return fail('SLOW DOWN', 429)
    } catch {
      return fail('BOARD OFFLINE', 503)
    }

    const { mode } = parsedBody.body
    if (mode === 'bends') return json({ token: issue({ mode: 'bends' }) })

    if (mode === 'challenge') {
      const nowMs = now()
      const day = utcDay(nowMs)
      const target = CHALLENGE_TARGET
      return json({
        token: issue({ mode: 'challenge', day, target }),
        day,
        seed: seed(day),
        target,
        now: nowMs,
      })
    }

    return json({ token: issue() })
  }
}

export const POST = createRunPost()

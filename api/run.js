import { CHALLENGE_TARGET } from '../src/config/rules.js'
import { utcDay } from '../src/lib/time.js'
import { clientIp, fail, json } from './_lib/http.js'
import { runRatelimit } from './_lib/redis.js'
import { challengeSeed, issueToken, secret } from './_lib/token.js'

export async function POST(request) {
  if (!secret()) return fail('BOARD OFFLINE', 503)
  try {
    const { success } = await runRatelimit().limit(clientIp(request))
    if (!success) return fail('SLOW DOWN', 429)
  } catch {
    return fail('BOARD OFFLINE', 503)
  }

  let mode = 'run'
  try {
    const body = await request.json()
    if (body?.mode === 'challenge') mode = 'challenge'
  } catch {
    // Empty or non-JSON body is an endless run.
  }

  if (mode === 'challenge') {
    const now = Date.now()
    const day = utcDay(now)
    const target = CHALLENGE_TARGET
    return json({
      token: issueToken({ mode: 'challenge', day, target }),
      day,
      seed: challengeSeed(day),
      target,
      now,
    })
  }

  return json({ token: issueToken() })
}

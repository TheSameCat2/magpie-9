import { CHALLENGE_TARGET, utcDay } from '../src/rules.js'
import { challengeSeed, clientIp, issueToken, json, runRatelimit, secret } from './_lib/board.js'

export async function POST(request) {
  if (!secret()) return json({ error: 'BOARD OFFLINE' }, 503)
  try {
    const { success } = await runRatelimit().limit(clientIp(request))
    if (!success) return json({ error: 'SLOW DOWN' }, 429)
  } catch {
    return json({ error: 'BOARD OFFLINE' }, 503)
  }

  let mode = 'run'
  try {
    const body = await request.json()
    if (body?.mode === 'challenge') mode = 'challenge'
  } catch {
    // Empty or non-JSON body is an endless run, matching the original POST.
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

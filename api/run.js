import { clientIp, issueToken, json, runRatelimit, secret } from './_lib/board.js'

export async function POST(request) {
  if (!secret()) return json({ error: 'BOARD OFFLINE' }, 503)
  try {
    const { success } = await runRatelimit().limit(clientIp(request))
    if (!success) return json({ error: 'SLOW DOWN' }, 429)
  } catch {
    return json({ error: 'BOARD OFFLINE' }, 503)
  }
  return json({ token: issueToken() })
}

import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.BOARD_SECRET = process.env.BOARD_SECRET || 'test-secret'

const {
  ENDLESS_CACHE_CONTROL,
  EXTRACT_SKEW_MS,
  POST: defaultScoresPost,
  createScoresHandlers,
  endlessBoardKey,
  validateSubmission,
} = await import('./scores.js')
const { BENDS_BOARD_KEY, BOARD_KEY, rankScore } = await import('./_lib/board.js')
const { MAX_JSON_BYTES } = await import('./_lib/http.js')
const { issueToken, verify } = await import('./_lib/token.js')
const { minChallengeSeconds, minRunSeconds } = await import('../src/config/rules.js')

function challengeBody(overrides = {}) {
  const token = overrides.token ?? issueToken({ mode: 'challenge', day: '2026-09-14', target: 40 })
  return {
    initials: 'AAA',
    token,
    score: 50_000,
    pausedMs: 12_000,
    ...overrides,
  }
}

function submitAt(body, extraMs) {
  const parsed = verify(body.token)
  return validateSubmission(body, parsed.t0 + extraMs)
}

function fakeRedis() {
  const store = new Map()
  return {
    async zrange(key) {
      return store.get(key) ?? []
    },
    multi() {
      const ops = []
      let targetKey = BOARD_KEY
      return {
        zadd(key, { score, member }) {
          targetKey = key
          ops.push(() => {
            const list = [...(store.get(key) ?? []), { member, score }]
            list.sort((a, b) => b.score - a.score)
            store.set(key, list)
          })
        },
        expire() {},
        zremrangebyrank() {},
        zrange(key) {
          targetKey = key
        },
        async exec() {
          for (const op of ops) op()
          return [null, store.get(targetKey) ?? []]
        },
      }
    },
    seed(key, rows) {
      store.set(key, rows)
    },
  }
}

test('challenge rank is the claimed extract, not the token clock at POST', () => {
  const extract = 50_000
  const paused = 12_000
  const entryMs = 8_000
  const body = challengeBody({ score: extract, pausedMs: paused })
  const result = submitAt(body, extract + paused + entryMs)
  assert.equal(result.error, undefined)
  assert.equal(result.timeMs, extract)
})

test('typing initials after extract does not change the ranked time', () => {
  const extract = 61_500
  const paused = 3_000
  const body = challengeBody({ score: extract, pausedMs: paused })
  const quick = submitAt(body, extract + paused + 200)
  const slow = submitAt(body, extract + paused + 15_000)
  assert.equal(quick.timeMs, extract)
  assert.equal(slow.timeMs, extract)
  assert.equal(quick.timeMs, slow.timeMs)
})

test('challenge still rejects an extract faster than the physics floor', () => {
  const floorMs = minChallengeSeconds(40) * 0.9 * 1000
  const body = challengeBody({ score: Math.floor(floorMs) - 1, pausedMs: 0 })
  const result = submitAt(body, 90_000)
  assert.equal(result.error, 'TOO FAST')
  assert.equal(result.status, 400)
})

test('challenge rejects a claimed extract that beats the token clock past skew', () => {
  const extract = 50_000
  const paused = 5_000
  const body = challengeBody({ score: extract, pausedMs: paused })
  const wall = extract + paused
  const result = submitAt(body, wall - EXTRACT_SKEW_MS - 1)
  assert.equal(result.error, 'BAD TIME')
})

test('challenge allows a claimed extract slightly ahead of the token clock', () => {
  const extract = 50_000
  const paused = 5_000
  const body = challengeBody({ score: extract, pausedMs: paused })
  const wall = extract + paused
  const result = submitAt(body, wall - 1_000)
  assert.equal(result.error, undefined)
  assert.equal(result.timeMs, extract)
})

test('challenge rejects a missing or impossible extract time', () => {
  const token = issueToken({ mode: 'challenge', day: '2026-09-14', target: 40 })
  const parsed = verify(token)
  const nowMs = parsed.t0 + 90_000
  assert.equal(validateSubmission({ initials: 'AAA', token, pausedMs: 0 }, nowMs).error, 'BAD SCORE')
  assert.equal(
    validateSubmission({ initials: 'AAA', token, score: -1, pausedMs: 0 }, nowMs).error,
    'BAD SCORE',
  )
  assert.equal(
    validateSubmission({ initials: 'AAA', token, score: 50_000.4, pausedMs: 0 }, nowMs).error,
    undefined,
  )
  assert.equal(
    validateSubmission({ initials: 'AAA', token, score: 50_000.4, pausedMs: 0 }, nowMs).timeMs,
    50_000,
  )
})

test('challenge still rejects a pause that cannot be real', () => {
  const body = challengeBody({ score: 50_000, pausedMs: 200_000 })
  const result = submitAt(body, 90_000)
  assert.equal(result.error, 'BAD PAUSE')
})

test('a BENDS score validates like a run and is routed to the BENDS board', () => {
  const body = { initials: 'AAA', token: issueToken({ mode: 'bends' }), score: 12 }
  const result = submitAt(body, minRunSeconds(12) * 1000 + 1)
  assert.equal(result.error, undefined)
  assert.equal(result.parsed.mode, 'bends')
  assert.equal(endlessBoardKey(result.parsed.mode), BENDS_BOARD_KEY)
  assert.equal(endlessBoardKey('run'), BOARD_KEY)
})

test('a BENDS score faster than the gate floor is rejected', () => {
  const body = { initials: 'AAA', token: issueToken({ mode: 'bends' }), score: 30 }
  assert.equal(submitAt(body, 1_000).error, 'TOO FAST')
})

test('GET /api/scores short-caches endless boards and keeps challenge no-store', async () => {
  const client = fakeRedis()
  client.seed(BOARD_KEY, [{ member: 'AAA:deadbeef', score: rankScore(25, 1_700_000_000_000) }])
  const { GET } = createScoresHandlers({ redis: () => client, now: () => 1_700_000_050_000 })

  const runRes = await GET(new Request('https://magpie.nradavies.com/api/scores'))
  assert.equal(runRes.status, 200)
  assert.equal(runRes.headers.get('cache-control'), ENDLESS_CACHE_CONTROL)
  assert.equal(runRes.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(runRes.headers.get('cross-origin-resource-policy'), 'same-origin')
  assert.equal(runRes.headers.get('vary'), 'Sec-Fetch-Dest, Sec-Fetch-Mode, Sec-Fetch-Site')
  assert.deepEqual(await runRes.json(), { board: [{ initials: 'AAA', score: 25 }] })

  const bendsRes = await GET(new Request('https://magpie.nradavies.com/api/scores?mode=bends'))
  assert.equal(bendsRes.status, 200)
  assert.equal(bendsRes.headers.get('cache-control'), ENDLESS_CACHE_CONTROL)

  const challengeRes = await GET(
    new Request('https://magpie.nradavies.com/api/scores?mode=challenge&day=2026-09-14'),
  )
  assert.equal(challengeRes.status, 200)
  assert.equal(challengeRes.headers.get('cache-control'), 'no-store')

  const badDayRes = await GET(new Request('https://magpie.nradavies.com/api/scores?mode=challenge&day=nope'))
  assert.equal(badDayRes.status, 400)
  assert.equal(badDayRes.headers.get('cache-control'), 'no-store')
})

test('POST /api/scores rejects cross-site, wrong Content-Type, and >4 kB bodies before ratelimit', async () => {
  const client = fakeRedis()
  let ratelimitCalls = 0
  let seenIp = null
  const token = issueToken({ mode: 'run' })
  const parsed = verify(token)
  const nowMs = parsed.t0 + Math.ceil(minRunSeconds(10) * 1000) + 1_000

  const { POST } = createScoresHandlers({
    redis: () => client,
    claimNonce: async () => true,
    now: () => nowMs,
    ratelimit: () => ({
      async limit(ip) {
        ratelimitCalls += 1
        seenIp = ip
        return { success: true }
      },
    }),
  })

  // Direct default export also rejects cross-site with 403 before touching Redis.
  const directCross = await defaultScoresPost(
    new Request('https://magpie.nradavies.com/api/scores', {
      method: 'POST',
      headers: {
        'sec-fetch-site': 'cross-site',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ initials: 'AAA', token, score: 10 }),
    }),
  )
  assert.equal(directCross.status, 403)

  for (const headers of [
    { 'sec-fetch-site': 'cross-site', 'content-type': 'application/json' },
    { 'sec-fetch-site': 'same-site', 'content-type': 'application/json' },
    { origin: 'https://evil.example', 'content-type': 'application/json' },
    { origin: 'null', 'content-type': 'application/json' },
  ]) {
    const res = await POST(
      new Request('https://magpie.nradavies.com/api/scores', {
        method: 'POST',
        headers,
        body: JSON.stringify({ initials: 'AAA', token, score: 10 }),
      }),
    )
    assert.equal(res.status, 403)
    assert.equal(ratelimitCalls, 0)
  }

  const wrongType = await POST(
    new Request('https://magpie.nradavies.com/api/scores', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'initials=AAA&score=10',
    }),
  )
  assert.equal(wrongType.status, 415)
  assert.equal(ratelimitCalls, 0)

  const oversized = await POST(
    new Request('https://magpie.nradavies.com/api/scores', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ initials: 'AAA', token, score: 10, pad: 'x'.repeat(MAX_JSON_BYTES) }),
    }),
  )
  assert.equal(oversized.status, 413)
  assert.equal(ratelimitCalls, 0)

  // Absent Sec-Fetch-Site & Origin (Electron proxy compatibility) succeeds and uses x-vercel-forwarded-for.
  const ok = await POST(
    new Request('https://magpie.nradavies.com/api/scores', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-vercel-forwarded-for': '198.51.100.99',
        'x-forwarded-for': '10.0.0.5',
      },
      body: JSON.stringify({ initials: 'AAA', token, score: 10 }),
    }),
  )
  assert.equal(ok.status, 200)
  assert.equal(ratelimitCalls, 1)
  assert.equal(seenIp, '198.51.100.99')
  assert.equal(ok.headers.get('cache-control'), 'no-store')
  assert.equal(ok.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(ok.headers.get('cross-origin-resource-policy'), 'same-origin')
  assert.deepEqual(await ok.json(), { board: [{ initials: 'AAA', score: 10 }], rank: 1 })
})

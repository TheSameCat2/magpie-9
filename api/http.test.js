import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

process.env.BOARD_SECRET = process.env.BOARD_SECRET || 'test-secret'

const { MAX_JSON_BYTES, clientIp, fail, isCrossSitePost, json, readJsonBody } = await import('./_lib/http.js')
const { POST: defaultRunPost, createRunPost } = await import('./run.js')
const { verify } = await import('./_lib/token.js')

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('json and fail attach nosniff, CORP, Vary, and default no-store Cache-Control', async () => {
  const ok = json({ ok: true })
  assert.equal(ok.status, 200)
  assert.equal(ok.headers.get('content-type'), 'application/json')
  assert.equal(ok.headers.get('cache-control'), 'no-store')
  assert.equal(ok.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(ok.headers.get('cross-origin-resource-policy'), 'same-origin')
  assert.equal(ok.headers.get('vary'), 'Sec-Fetch-Dest, Sec-Fetch-Mode, Sec-Fetch-Site')
  assert.deepEqual(await ok.json(), { ok: true })

  const cached = json({ board: [] }, 200, {
    'Cache-Control': 'public, max-age=0, s-maxage=5, stale-while-revalidate=15',
  })
  assert.equal(
    cached.headers.get('cache-control'),
    'public, max-age=0, s-maxage=5, stale-while-revalidate=15',
  )
  assert.equal(cached.headers.get('x-content-type-options'), 'nosniff')

  const err = fail('FORBIDDEN', 403)
  assert.equal(err.status, 403)
  assert.equal(err.headers.get('cache-control'), 'no-store')
  assert.equal(err.headers.get('x-content-type-options'), 'nosniff')
  assert.deepEqual(await err.json(), { error: 'FORBIDDEN' })
})

test('isCrossSitePost enforces Sec-Fetch-Site and Origin while allowing absent headers', () => {
  const url = 'https://magpie.nradavies.com/api/run'

  // Electron proxy & Node unit tests omit Sec-Fetch-Site and Origin.
  assert.equal(isCrossSitePost(new Request(url, { method: 'POST' })), false)

  // Browser same-origin and direct ('none') pass when Origin matches or is absent.
  assert.equal(
    isCrossSitePost(
      new Request(url, {
        method: 'POST',
        headers: {
          'sec-fetch-site': 'same-origin',
          origin: 'https://magpie.nradavies.com',
        },
      }),
    ),
    false,
  )
  assert.equal(
    isCrossSitePost(
      new Request(url, {
        method: 'POST',
        headers: {
          'sec-fetch-site': 'same-origin',
          origin: 'https://magpie.nradavies.com:443',
        },
      }),
    ),
    false,
  )
  assert.equal(
    isCrossSitePost(new Request(url, { method: 'POST', headers: { 'sec-fetch-site': 'none' } })),
    false,
  )

  // Cross-site and sibling-subdomain ('same-site') Fetch Metadata are rejected.
  assert.equal(
    isCrossSitePost(new Request(url, { method: 'POST', headers: { 'sec-fetch-site': 'cross-site' } })),
    true,
  )
  assert.equal(
    isCrossSitePost(new Request(url, { method: 'POST', headers: { 'sec-fetch-site': 'same-site' } })),
    true,
  )

  // Mismatched, scheme-downgraded, opaque ('null' / data:), or malformed Origin headers are rejected.
  assert.equal(
    isCrossSitePost(new Request(url, { method: 'POST', headers: { origin: 'https://evil.example' } })),
    true,
  )
  assert.equal(
    isCrossSitePost(new Request(url, { method: 'POST', headers: { origin: 'http://magpie.nradavies.com' } })),
    true,
  )
  assert.equal(isCrossSitePost(new Request(url, { method: 'POST', headers: { origin: 'null' } })), true)
  assert.equal(
    isCrossSitePost(new Request(url, { method: 'POST', headers: { origin: 'data:text/html,hi' } })),
    true,
  )
  assert.equal(isCrossSitePost(new Request(url, { method: 'POST', headers: { origin: ':::bad' } })), true)
})

test('readJsonBody enforces application/json Content-Type (415)', async () => {
  const missing = await readJsonBody(new Request('https://magpie.example/api/run', { method: 'POST' }))
  assert.equal(missing.ok, false)
  assert.equal(missing.status, 415)

  const textPlain = await readJsonBody(
    new Request('https://magpie.example/api/run', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: '{"mode":"run"}',
    }),
  )
  assert.equal(textPlain.status, 415)

  const jsonp = await readJsonBody(
    new Request('https://magpie.example/api/run', {
      method: 'POST',
      headers: { 'content-type': 'application/jsonp' },
      body: '{"mode":"run"}',
    }),
  )
  assert.equal(jsonp.status, 415)

  const charset = await readJsonBody(
    new Request('https://magpie.example/api/run', {
      method: 'POST',
      headers: { 'content-type': 'Application/JSON; charset=utf-8' },
      body: '{"mode":"bends"}',
    }),
  )
  assert.equal(charset.ok, true)
  assert.deepEqual(charset.body, { mode: 'bends' })
})

test('readJsonBody enforces 4 kB ceiling via Content-Length and streaming chunks (413)', async () => {
  // Exact 4096-byte JSON plain object succeeds.
  const prefix = '{"pad":"'
  const suffix = '"}'
  const exactPayload = prefix + 'a'.repeat(MAX_JSON_BYTES - prefix.length - suffix.length) + suffix
  assert.equal(Buffer.byteLength(exactPayload), MAX_JSON_BYTES)
  const exactRes = await readJsonBody(
    new Request('https://magpie.example/api/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: exactPayload,
    }),
  )
  assert.equal(exactRes.ok, true)

  // Declared Content-Length > 4096 rejects before reading.
  let pulled = 0
  const declaredTooBig = new Request('https://magpie.example/api/run', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'content-length': String(MAX_JSON_BYTES + 1) },
    body: new ReadableStream({
      pull(controller) {
        pulled += 1
        controller.enqueue(new TextEncoder().encode('{}'))
        controller.close()
      },
    }),
    duplex: 'half',
  })
  const declaredRes = await readJsonBody(declaredTooBig)
  assert.equal(declaredRes.ok, false)
  assert.equal(declaredRes.status, 413)
  assert.equal(pulled, 0)

  // Chunked stream without Content-Length exceeding 4096 bytes aborts mid-stream with 413.
  let chunksPulled = 0
  const encoder = new TextEncoder()
  const chunkedTooBig = new Request('https://magpie.example/api/run', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: new ReadableStream({
      pull(controller) {
        chunksPulled += 1
        controller.enqueue(encoder.encode('x'.repeat(2048)))
        if (chunksPulled >= 5) controller.close()
      },
    }),
    duplex: 'half',
  })
  const streamedRes = await readJsonBody(chunkedTooBig)
  assert.equal(streamedRes.ok, false)
  assert.equal(streamedRes.status, 413)
  assert.equal(chunksPulled, 3)
})

test('readJsonBody rejects malformed JSON and non-plain-object payloads with 400', async () => {
  for (const raw of ['', '{bad', 'null', '[]', '[1,2]', '"str"', '42', 'true']) {
    const res = await readJsonBody(
      new Request('https://magpie.example/api/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: raw,
      }),
    )
    assert.equal(res.ok, false, `expected ${raw} to fail`)
    assert.equal(res.status, 400, `expected ${raw} to return 400`)
  }
})

test('clientIp prefers x-vercel-forwarded-for, then x-real-ip, then x-forwarded-for', () => {
  const url = 'https://magpie.example/api/run'

  assert.equal(
    clientIp(
      new Request(url, {
        headers: {
          'x-vercel-forwarded-for': '203.0.113.9',
          'x-real-ip': '198.51.100.7',
          'x-forwarded-for': '1.2.3.4, 5.6.7.8',
        },
      }),
    ),
    '203.0.113.9',
  )

  assert.equal(
    clientIp(
      new Request(url, {
        headers: {
          'x-vercel-forwarded-for': '   ',
          'x-real-ip': '198.51.100.7',
          'x-forwarded-for': '1.2.3.4',
        },
      }),
    ),
    '198.51.100.7',
  )

  assert.equal(
    clientIp(
      new Request(url, {
        headers: {
          'x-forwarded-for': ' 192.0.2.11 , 10.0.0.1 ',
        },
      }),
    ),
    '192.0.2.11',
  )

  assert.equal(clientIp(new Request(url)), 'local')
})

test('POST /api/run rejects cross-site, wrong Content-Type, and >4 kB bodies before ratelimit', async () => {
  let ratelimitCalls = 0
  let seenIp = null
  const post = createRunPost({
    ratelimit: () => ({
      async limit(ip) {
        ratelimitCalls += 1
        seenIp = ip
        return { success: true }
      },
    }),
  })

  // Direct default export also rejects cross-site with 403 without needing Redis env vars.
  const directCross = await defaultRunPost(
    new Request('https://magpie.nradavies.com/api/run', {
      method: 'POST',
      headers: {
        'sec-fetch-site': 'cross-site',
        'content-type': 'application/json',
      },
      body: '{"mode":"run"}',
    }),
  )
  assert.equal(directCross.status, 403)

  const crossOrigin = await post(
    new Request('https://magpie.nradavies.com/api/run', {
      method: 'POST',
      headers: {
        origin: 'https://attacker.example',
        'content-type': 'application/json',
      },
      body: '{"mode":"run"}',
    }),
  )
  assert.equal(crossOrigin.status, 403)
  assert.equal(ratelimitCalls, 0)

  const wrongType = await post(
    new Request('https://magpie.nradavies.com/api/run', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: '{"mode":"run"}',
    }),
  )
  assert.equal(wrongType.status, 415)
  assert.equal(ratelimitCalls, 0)

  const oversized = await post(
    new Request('https://magpie.nradavies.com/api/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'run', junk: 'x'.repeat(MAX_JSON_BYTES) }),
    }),
  )
  assert.equal(oversized.status, 413)
  assert.equal(ratelimitCalls, 0)

  // Absent Sec-Fetch-Site & Origin (Electron proxy / Node tests) passes through and issues tokens.
  const ok = await post(
    new Request('https://magpie.nradavies.com/api/run', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-vercel-forwarded-for': '203.0.113.42',
        'x-forwarded-for': '10.9.8.7',
      },
      body: JSON.stringify({ mode: 'bends' }),
    }),
  )
  assert.equal(ok.status, 200)
  assert.equal(ratelimitCalls, 1)
  assert.equal(seenIp, '203.0.113.42')
  assert.equal(ok.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(ok.headers.get('cross-origin-resource-policy'), 'same-origin')
  assert.equal(ok.headers.get('cache-control'), 'no-store')
  const payload = await ok.json()
  assert.equal(verify(payload.token)?.mode, 'bends')
})

test('vercel.json configures strict security headers, Trusted Types CSP, and immutable asset caching', () => {
  const raw = fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8')
  const config = JSON.parse(raw)
  assert.ok(Array.isArray(config.headers))

  const globalRule = config.headers.find((entry) => entry.source === '/(.*)')
  assert.ok(globalRule, 'expected /(.*) header rule')
  const globalHeaders = Object.fromEntries(globalRule.headers.map((h) => [h.key, h.value]))

  assert.equal(
    globalHeaders['Content-Security-Policy'],
    "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; media-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; upgrade-insecure-requests; require-trusted-types-for 'script'",
  )
  assert.equal(globalHeaders['X-Frame-Options'], 'DENY')
  assert.equal(globalHeaders['X-Content-Type-Options'], 'nosniff')
  assert.equal(globalHeaders['Referrer-Policy'], 'strict-origin-when-cross-origin')
  assert.equal(
    globalHeaders['Permissions-Policy'],
    'camera=(), geolocation=(), microphone=(), fullscreen=(self)',
  )
  assert.equal(globalHeaders['Permissions-Policy'].includes('focus-without-user-activation'), false)
  assert.equal(globalHeaders['Cross-Origin-Opener-Policy'], 'same-origin-allow-popups')

  const assetsRule = config.headers.find((entry) => entry.source === '/assets/(.*)')
  assert.ok(assetsRule, 'expected /assets/(.*) header rule')
  const assetsHeaders = Object.fromEntries(assetsRule.headers.map((h) => [h.key, h.value]))
  assert.equal(assetsHeaders['Cache-Control'], 'public, max-age=31536000, immutable')
})

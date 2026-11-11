import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { register } from 'node:module'
import os from 'node:os'
import path from 'node:path'

register(
  `data:text/javascript,${encodeURIComponent(`
    export function resolve(specifier, context, nextResolve) {
      if (specifier === 'electron') {
        return {
          shortCircuit: true,
          url: 'data:text/javascript,' + encodeURIComponent(
            'export const app = { isPackaged: false };' +
            'export const net = { fetch: (...args) => globalThis.fetch(...args) };' +
            'export const protocol = { registerSchemesAsPrivileged() {}, handle() {} };'
          ),
        }
      }
      return nextResolve(specifier, context)
    }
  `)}`,
)

const { CSP, PERMISSIONS_POLICY, PROXY_TIMEOUT_MS, proxyApi, route, serveFile } =
  await import('./protocol.js')

test('CSP enforces Trusted Types, blocks framing and objects, and forbids inline styles/scripts', () => {
  assert.match(CSP, /\bdefault-src 'self'/)
  assert.match(CSP, /\bscript-src 'self'/)
  assert.match(CSP, /\bstyle-src 'self' https:\/\/fonts\.googleapis\.com/)
  assert.match(CSP, /\bbase-uri 'none'/)
  assert.match(CSP, /\bform-action 'none'/)
  assert.match(CSP, /\bframe-ancestors 'none'/)
  assert.match(CSP, /\bobject-src 'none'/)
  assert.match(CSP, /\brequire-trusted-types-for 'script'/)
  assert.doesNotMatch(CSP, /unsafe-inline|unsafe-eval/)
})

test('serveFile attaches CSP, nosniff, referrer-policy, permissions-policy, and no-store', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'magpie-protocol-'))
  try {
    const htmlPath = path.join(dir, 'index.html')
    const jsPath = path.join(dir, 'index-abc.js')
    await fs.writeFile(htmlPath, '<!doctype html><title>MAGPIE-9</title>')
    await fs.writeFile(jsPath, 'console.log(1)')

    const htmlRes = await serveFile(
      htmlPath,
      async () =>
        new Response('<!doctype html><title>MAGPIE-9</title>', { headers: { 'content-type': 'text/html' } }),
    )
    assert.equal(htmlRes.status, 200)
    assert.equal(htmlRes.headers.get('content-type'), 'text/html')
    assert.equal(htmlRes.headers.get('cache-control'), 'no-store')
    assert.equal(htmlRes.headers.get('content-security-policy'), CSP)
    assert.equal(htmlRes.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(htmlRes.headers.get('referrer-policy'), 'no-referrer')
    assert.equal(htmlRes.headers.get('permissions-policy'), PERMISSIONS_POLICY)
    assert.equal(PERMISSIONS_POLICY, 'camera=(), geolocation=(), microphone=()')

    const jsRes = await serveFile(jsPath, async () => new Response('console.log(1)'))
    assert.equal(jsRes.status, 200)
    assert.match(jsRes.headers.get('content-type') ?? '', /^text\/javascript/)
    assert.equal(jsRes.headers.get('cache-control'), 'no-store')
    assert.equal(jsRes.headers.get('content-security-policy'), CSP)
    assert.equal(jsRes.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(jsRes.headers.get('referrer-policy'), 'no-referrer')
    assert.equal(jsRes.headers.get('permissions-policy'), PERMISSIONS_POLICY)

    const missingRes = await serveFile(path.join(dir, 'missing.html'), async () => {
      throw new Error('unreachable')
    })
    assert.equal(missingRes.status, 404)
    assert.equal(missingRes.headers.get('x-content-type-options'), 'nosniff')
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
})

test('proxyApi strips cookie, origin, referer, and set-cookie, and sets nosniff and timeout', async () => {
  assert.equal(PROXY_TIMEOUT_MS, 10_000)

  let seenUrl = null
  let seenInit = null
  const request = new Request('magpie://app/api/scores?mode=run', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: 'session=secret',
      origin: 'magpie://app',
      referer: 'magpie://app/index.html',
    },
    body: JSON.stringify({ initials: 'AAA', score: 10, token: 'tok', pausedMs: 0 }),
  })

  const res = await proxyApi(request, 'https://magpie.nradavies.com', async (target, init) => {
    seenUrl = String(target)
    seenInit = init
    return new Response(JSON.stringify({ board: [], rank: 1 }), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'set-cookie': 'sid=upstream; Path=/; HttpOnly',
        'content-encoding': 'br',
        'content-length': '999',
      },
    })
  })

  assert.equal(seenUrl, 'https://magpie.nradavies.com/api/scores?mode=run')
  assert.equal(seenInit.method, 'POST')
  assert.equal(seenInit.headers.get('cookie'), null)
  assert.equal(seenInit.headers.get('origin'), null)
  assert.equal(seenInit.headers.get('referer'), null)
  assert.equal(seenInit.headers.get('content-type'), 'application/json')
  assert.equal(seenInit.signal instanceof AbortSignal, true)
  assert.equal(seenInit.signal.aborted, false)

  assert.equal(res.status, 200)
  assert.equal(res.headers.get('set-cookie'), null)
  assert.equal(res.headers.get('content-encoding'), null)
  assert.equal(res.headers.get('content-length'), null)
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
  assert.deepEqual(await res.json(), { board: [], rank: 1 })
})

test('proxyApi handles upstream timeouts and network errors with 503 BOARD OFFLINE + nosniff', async () => {
  const getReq = () => new Request('magpie://app/api/scores')

  const timedOut = await proxyApi(
    getReq(),
    'https://magpie.nradavies.com',
    (_target, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true })
      }),
    20,
  )
  assert.equal(timedOut.status, 503)
  assert.equal(timedOut.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(timedOut.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await timedOut.json(), { error: 'BOARD OFFLINE' })

  const networkErr = await proxyApi(getReq(), 'https://magpie.nradavies.com', async () => {
    throw new TypeError('fetch failed')
  })
  assert.equal(networkErr.status, 503)
  assert.equal(networkErr.headers.get('x-content-type-options'), 'nosniff')
  assert.deepEqual(await networkErr.json(), { error: 'BOARD OFFLINE' })

  const badPath = await proxyApi(
    new Request('magpie://app/api/%2e%2e/secret'),
    'https://magpie.nradavies.com',
    async () => {
      throw new Error('unreachable')
    },
  )
  assert.equal(badPath.status, 400)
  assert.equal(badPath.headers.get('x-content-type-options'), 'nosniff')
})

test('route rejects unknown hosts and traversal paths and serves offline /api when unconfigured', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'magpie-route-'))
  try {
    await fs.writeFile(path.join(dir, 'index.html'), '<!doctype html>')

    const unknownHost = await route(new Request('magpie://evil/index.html'), dir, '')
    assert.equal(unknownHost.status, 404)
    assert.equal(unknownHost.headers.get('x-content-type-options'), 'nosniff')

    const offline = await route(new Request('magpie://app/api/scores'), dir, '')
    assert.equal(offline.status, 503)
    assert.equal(offline.headers.get('x-content-type-options'), 'nosniff')
    assert.deepEqual(await offline.json(), { error: 'BOARD OFFLINE' })

    const badFile = await route(new Request('magpie://app/foo%2f..%2f..%2fsecret'), dir, '')
    assert.equal(badFile.status, 400)
    assert.equal(badFile.headers.get('x-content-type-options'), 'nosniff')

    const indexRes = await route(
      new Request('magpie://app/'),
      dir,
      '',
      async () => new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } }),
    )
    assert.equal(indexRes.status, 200)
    assert.equal(indexRes.headers.get('content-security-policy'), CSP)
    assert.equal(indexRes.headers.get('x-content-type-options'), 'nosniff')
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
})

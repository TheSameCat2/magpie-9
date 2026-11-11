import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fetchBoard, startRun, submitScore } from './api.js'

async function withFetch(handler, fn) {
  const orig = globalThis.fetch
  globalThis.fetch = typeof handler === 'function' ? handler : async () => handler
  try {
    await fn()
  } finally {
    globalThis.fetch = orig
  }
}

test('fetchBoard rejects a non-JSON 200', async () => {
  await withFetch(new Response('import { x } from "./nope.js"', { status: 200 }), async () => {
    await assert.rejects(() => fetchBoard('run'), /HTTP 200/)
  })
})

test('fetchBoard surfaces the server error message', async () => {
  await withFetch(new Response(JSON.stringify({ error: 'BOARD OFFLINE' }), { status: 503 }), async () => {
    await assert.rejects(() => fetchBoard('challenge'), /BOARD OFFLINE/)
  })
})

test('fetchBoard returns a JSON board', async () => {
  const body = { board: [], day: '2026-09-26' }
  await withFetch(new Response(JSON.stringify(body), { status: 200 }), async () => {
    assert.deepEqual(await fetchBoard('challenge'), body)
  })
})

test('fetchBoard, startRun, and submitScore attach an 8s timeout signal and optional priority', async () => {
  const timeouts = []
  const origTimeout = AbortSignal.timeout
  AbortSignal.timeout = (ms) => {
    timeouts.push(ms)
    return origTimeout.call(AbortSignal, ms)
  }
  const calls = []
  try {
    await withFetch(
      async (url, init) => {
        calls.push({ url, init })
        return new Response(JSON.stringify({ board: [], token: 'tok', rank: 1 }), { status: 200 })
      },
      async () => {
        await fetchBoard('run', { priority: 'low' })
        await fetchBoard('bends', { priority: 'auto' })
        await startRun('challenge')
        await submitScore({ initials: 'ACE', score: 12, token: 'tok', pausedMs: 500 })
      },
    )
  } finally {
    AbortSignal.timeout = origTimeout
  }

  assert.deepEqual(timeouts, [8_000, 8_000, 8_000, 8_000])
  assert.equal(calls[0].url, '/api/scores')
  assert.equal(calls[0].init.priority, 'low')
  assert.ok(calls[0].init.signal instanceof AbortSignal)

  assert.equal(calls[1].url, '/api/scores?mode=bends')
  assert.equal(calls[1].init.priority, 'auto')
  assert.ok(calls[1].init.signal instanceof AbortSignal)

  assert.equal(calls[2].url, '/api/run')
  assert.equal(calls[2].init.method, 'POST')
  assert.equal(calls[2].init.priority, undefined)
  assert.ok(calls[2].init.signal instanceof AbortSignal)

  assert.equal(calls[3].url, '/api/scores')
  assert.equal(calls[3].init.method, 'POST')
  assert.ok(calls[3].init.signal instanceof AbortSignal)
})

test('caller AbortSignal aborts fetch via AbortSignal.any and via the fallback path', async () => {
  // 1. Native AbortSignal.any path
  const ctl1 = new AbortController()
  await withFetch(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true })
        ctl1.abort(new DOMException('superseded', 'AbortError'))
      }),
    async () => {
      await assert.rejects(
        () => fetchBoard('run', { priority: 'low', signal: ctl1.signal }),
        (err) => err?.name === 'AbortError',
      )
    },
  )

  // 2. Fallback path when AbortSignal.any is unavailable
  const desc = Object.getOwnPropertyDescriptor(AbortSignal, 'any')
  delete AbortSignal.any
  try {
    const ctl2 = new AbortController()
    await withFetch(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true })
          ctl2.abort(new DOMException('fallback-abort', 'AbortError'))
        }),
      async () => {
        await assert.rejects(
          () => fetchBoard('challenge', { signal: ctl2.signal }),
          (err) => err?.name === 'AbortError',
        )
      },
    )

    // Pre-aborted caller signal in fallback path
    const ctl3 = new AbortController()
    ctl3.abort(new DOMException('already-aborted', 'AbortError'))
    await withFetch(
      async (_url, init) => {
        assert.equal(init.signal.aborted, true)
        throw init.signal.reason
      },
      async () => {
        await assert.rejects(
          () => fetchBoard('bends', { signal: ctl3.signal }),
          (err) => err?.name === 'AbortError',
        )
      },
    )
  } finally {
    if (desc) Object.defineProperty(AbortSignal, 'any', desc)
  }
})

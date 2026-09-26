import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fetchBoard } from './api.js'

async function withFetch(response, fn) {
  const orig = globalThis.fetch
  globalThis.fetch = async () => response
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

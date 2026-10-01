import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { isAppUrl, resolveApiPath, resolveRendererFile, sanitizeApiOrigin } from './files.js'

const root = path.resolve('/game/renderer')

test('resolveRendererFile maps the app origin onto the renderer root', () => {
  assert.equal(resolveRendererFile(root, 'magpie://app/index.html'), path.join(root, 'index.html'))
  assert.equal(resolveRendererFile(root, 'magpie://app/'), path.join(root, 'index.html'))
  assert.equal(
    resolveRendererFile(root, 'magpie://app/assets/index-abc.js?t=1'),
    path.join(root, 'assets', 'index-abc.js'),
  )
})

test('resolveRendererFile rejects encoded traversal and other origins', () => {
  // The URL parser collapses raw and percent-encoded dot segments, so these
  // stay inside the renderer root. They are not escapes.
  assert.equal(resolveRendererFile(root, 'magpie://app/../../.env.local'), path.join(root, '.env.local'))
  assert.equal(
    resolveRendererFile(root, 'magpie://app/%2e%2e/%2e%2e/.env.local'),
    path.join(root, '.env.local'),
  )
  // An encoded slash survives the URL parser. Decoding it must not walk out.
  assert.equal(resolveRendererFile(root, 'magpie://app/foo%2f..%2f..%2f.env.local'), null)
  assert.equal(resolveRendererFile(root, 'magpie://app/index.html%00.png'), null)
  assert.equal(resolveRendererFile(root, 'magpie://app/%'), null)
  assert.equal(resolveRendererFile(root, 'file:///etc/passwd'), null)
  assert.equal(resolveRendererFile(root, 'magpie://other/index.html'), null)
})

test('isAppUrl accepts only the app origin', () => {
  assert.equal(isAppUrl('magpie://app/index.html'), true)
  assert.equal(isAppUrl('magpie://app/'), true)
  assert.equal(isAppUrl('https://example.com'), false)
  assert.equal(isAppUrl('not a url'), false)
})

test('resolveApiPath stays under /api', () => {
  assert.equal(resolveApiPath('magpie://app/api/scores?mode=challenge'), '/api/scores?mode=challenge')
  assert.equal(resolveApiPath('magpie://app/api/foo%2f..%2f..%2fsecret'), null)
  assert.equal(resolveApiPath('magpie://app/api/%2e%2e/secret'), null)
  assert.equal(resolveApiPath('magpie://app/%'), null)
  assert.equal(resolveApiPath('magpie://app/index.html'), null)
})

test('sanitizeApiOrigin keeps https and loopback http, drops the rest', () => {
  assert.equal(sanitizeApiOrigin(''), '')
  assert.equal(sanitizeApiOrigin('https://magpie.example'), 'https://magpie.example')
  assert.equal(sanitizeApiOrigin('https://magpie.example/'), 'https://magpie.example')
  assert.equal(sanitizeApiOrigin('http://127.0.0.1:3000'), 'http://127.0.0.1:3000')
  assert.equal(sanitizeApiOrigin('http://localhost:3000/'), 'http://localhost:3000')
  assert.equal(sanitizeApiOrigin('http://example.com'), '')
  assert.equal(sanitizeApiOrigin('https://user:pass@magpie.example'), '')
  assert.equal(sanitizeApiOrigin('https://magpie.example/api'), '')
  assert.equal(sanitizeApiOrigin('not-a-url'), '')
})

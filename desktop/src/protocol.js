// Serves the Vite build on magpie://app. /api/* is proxied to the origin the
// shell resolved (packaged default, or MAGPIE_API_ORIGIN) so the game can keep
// fetching relative /api paths (no CORS, no game change). With no origin, /api
// answers BOARD OFFLINE instead of a file 404.

import { app, net, protocol } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { HOST, SCHEME, resolveApiPath, resolveRendererFile } from './files.js'

export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  "img-src 'self' data: blob:",
  "connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "require-trusted-types-for 'script'",
].join('; ')

export const PERMISSIONS_POLICY = 'camera=(), geolocation=(), microphone=()'
export const PROXY_TIMEOUT_MS = 10_000

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
}

export function registerScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ])
}

export function rendererRoot() {
  if (app.isPackaged) return path.join(process.resourcesPath, 'renderer')
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../renderer')
}

function textError(body, status) {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  })
}

function offlineApi() {
  return new Response(JSON.stringify({ error: 'BOARD OFFLINE' }), {
    status: 503,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  })
}

export async function proxyApi(request, origin, fetchImpl = net.fetch, timeoutMs = PROXY_TIMEOUT_MS) {
  const apiPath = resolveApiPath(request.url)
  if (!apiPath) return textError('Bad path', 400)
  try {
    const target = new URL(apiPath, origin)
    if (target.origin !== origin) return offlineApi()
    const headers = new Headers(request.headers)
    headers.delete('origin')
    headers.delete('referer')
    headers.delete('cookie')
    const init = {
      method: request.method,
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      init.body = request.body
      init.duplex = 'half'
    }
    const upstream = await fetchImpl(target, init)
    const responseHeaders = new Headers(upstream.headers)
    responseHeaders.delete('set-cookie')
    // fetchImpl already decoded any transport compression on upstream.body.
    if (responseHeaders.has('content-encoding')) {
      responseHeaders.delete('content-encoding')
      responseHeaders.delete('content-length')
    }
    responseHeaders.set('x-content-type-options', 'nosniff')
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    })
  } catch {
    return offlineApi()
  }
}

export async function serveFile(filePath, fetchImpl = net.fetch) {
  try {
    await fs.access(filePath)
  } catch {
    return textError('Not found', 404)
  }
  const response = await fetchImpl(pathToFileURL(filePath).toString())
  const headers = new Headers(response.headers)
  const mime = MIME_TYPES[path.extname(filePath).toLowerCase()]
  if (mime && (!headers.has('content-type') || headers.get('content-type')?.startsWith('text/plain'))) {
    headers.set('content-type', mime)
  }
  if (!headers.has('cache-control')) {
    headers.set('cache-control', 'no-store')
  }
  headers.set('content-security-policy', CSP)
  headers.set('x-content-type-options', 'nosniff')
  headers.set('referrer-policy', 'no-referrer')
  headers.set('permissions-policy', PERMISSIONS_POLICY)
  return new Response(response.body, { status: response.status, headers })
}

export function handleScheme(root, apiOrigin) {
  protocol.handle(SCHEME, (request) => {
    try {
      return route(request, root, apiOrigin)
    } catch {
      return textError('Bad request', 400)
    }
  })
}

export function route(request, root, apiOrigin, fetchImpl = net.fetch) {
  const url = new URL(request.url)
  if (url.host !== HOST) return textError('Unknown host', 404)
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    if (!apiOrigin) return offlineApi()
    return proxyApi(request, apiOrigin, fetchImpl)
  }
  const filePath = resolveRendererFile(root, request.url)
  if (!filePath) return textError('Bad path', 400)
  return serveFile(filePath, fetchImpl)
}

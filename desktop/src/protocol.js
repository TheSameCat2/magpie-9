// Serves the Vite build on magpie://app. /api/* is proxied to MAGPIE_API_ORIGIN
// so the game can keep fetching relative /api paths (no CORS, no game change).
// With no origin configured, /api answers BOARD OFFLINE instead of a file 404.

import { app, net, protocol } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { HOST, SCHEME, resolveApiPath, resolveRendererFile } from './files.js'

const CSP = [
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
].join('; ')

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

function offlineApi() {
  return new Response(JSON.stringify({ error: 'BOARD OFFLINE' }), {
    status: 503,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}

async function proxyApi(request, origin) {
  const apiPath = resolveApiPath(request.url)
  if (!apiPath) {
    return new Response('Bad path', { status: 400, headers: { 'content-type': 'text/plain' } })
  }
  try {
    const target = new URL(apiPath, origin)
    if (target.origin !== origin) return offlineApi()
    const headers = new Headers(request.headers)
    headers.delete('origin')
    headers.delete('referer')
    const init = { method: request.method, headers }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      init.body = request.body
      init.duplex = 'half'
    }
    return await net.fetch(target, init)
  } catch {
    return offlineApi()
  }
}

async function serveFile(filePath) {
  try {
    await fs.access(filePath)
  } catch {
    return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } })
  }
  const response = await net.fetch(pathToFileURL(filePath).toString())
  if (!filePath.endsWith('.html')) return response
  const headers = new Headers(response.headers)
  headers.set('Content-Security-Policy', CSP)
  return new Response(response.body, { status: response.status, headers })
}

export function handleScheme(root, apiOrigin) {
  protocol.handle(SCHEME, (request) => {
    try {
      return route(request, root, apiOrigin)
    } catch {
      return new Response('Bad request', { status: 400, headers: { 'content-type': 'text/plain' } })
    }
  })
}

function route(request, root, apiOrigin) {
  const url = new URL(request.url)
  if (url.host !== HOST) {
    return new Response('Unknown host', { status: 404, headers: { 'content-type': 'text/plain' } })
  }
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    if (!apiOrigin) return offlineApi()
    return proxyApi(request, apiOrigin)
  }
  const filePath = resolveRendererFile(root, request.url)
  if (!filePath) {
    return new Response('Bad path', { status: 400, headers: { 'content-type': 'text/plain' } })
  }
  return serveFile(filePath)
}

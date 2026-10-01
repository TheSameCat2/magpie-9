// Map a magpie://app URL onto a file inside the renderer root.
// Rejects anything that would escape that directory.

import path from 'node:path'

const NUL = String.fromCharCode(0)
const BACKSLASH = String.fromCharCode(92)

export const SCHEME = 'magpie'
export const HOST = 'app'
export const APP_ORIGIN = `${SCHEME}://${HOST}`

export function isAppUrl(raw) {
  try {
    const url = new URL(raw)
    return url.protocol === `${SCHEME}:` && url.host === HOST
  } catch {
    return false
  }
}

/**
 * Absolute file path for a request, or null when the URL is not ours or
 * would leave `root`. `root` must already be absolute.
 */
export function resolveRendererFile(root, requestUrl) {
  const url = new URL(requestUrl)
  if (url.protocol !== `${SCHEME}:` || url.host !== HOST) return null

  let pathname
  try {
    pathname = decodeURIComponent(url.pathname)
  } catch {
    return null
  }
  if (pathname.includes(NUL)) return null
  if (pathname === '/' || pathname === '') pathname = '/index.html'

  const filePath = path.resolve(root, pathname.replace(/^\/+/, ''))
  const relative = path.relative(root, filePath)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null
  return filePath
}

/** https origin, or http only for loopback (local `vercel dev`). Anything else is empty. */
export function sanitizeApiOrigin(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return ''
  let url
  try {
    url = new URL(raw)
  } catch {
    return ''
  }
  if (url.username || url.password || url.search || url.hash) return ''
  if (url.pathname !== '/' && url.pathname !== '') return ''
  const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (url.protocol === 'https:') return url.origin
  if (url.protocol === 'http:' && loopback) return url.origin
  return ''
}

/** Path under /api for a proxy, or null if it would leave that prefix. */
export function resolveApiPath(requestUrl) {
  let url
  try {
    url = new URL(requestUrl)
  } catch {
    return null
  }
  if (url.protocol !== `${SCHEME}:` || url.host !== HOST) return null
  let pathname
  try {
    pathname = decodeURIComponent(url.pathname)
  } catch {
    return null
  }
  if (pathname.includes(NUL) || pathname.includes(BACKSLASH)) return null
  if (pathname !== '/api' && !pathname.startsWith('/api/')) return null
  if (pathname.split('/').some((part) => part === '..' || part === '.')) return null
  return pathname + url.search
}

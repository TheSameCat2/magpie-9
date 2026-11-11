export const MAX_JSON_BYTES = 4096

const BASE_JSON_HEADERS = {
  'content-type': 'application/json',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'cross-origin-resource-policy': 'same-origin',
  vary: 'Sec-Fetch-Dest, Sec-Fetch-Mode, Sec-Fetch-Site',
}

export function json(body, status = 200, headers) {
  const resHeaders = new Headers(BASE_JSON_HEADERS)
  if (headers) {
    for (const [key, value] of new Headers(headers)) {
      resHeaders.set(key, value)
    }
  }
  return new Response(JSON.stringify(body), { status, headers: resHeaders })
}

/** Error responses share one shape so the client can surface `error` as a toast. */
export function fail(error, status) {
  return json({ error }, status)
}

/**
 * Reject cross-site POSTs before touching Redis rate limits. Absent headers are
 * allowed so the Electron `net.fetch` proxy and Node unit tests keep working.
 */
export function isCrossSitePost(request) {
  const rawSite = request.headers.get('sec-fetch-site')
  if (rawSite !== null) {
    const site = rawSite.trim().toLowerCase()
    if (site !== 'same-origin' && site !== 'none') return true
  }

  const rawOrigin = request.headers.get('origin')
  if (rawOrigin !== null) {
    try {
      const candidateOrigin = new URL(rawOrigin.trim()).origin
      const targetOrigin = new URL(request.url).origin
      if (candidateOrigin === 'null' || candidateOrigin !== targetOrigin) return true
    } catch {
      return true
    }
  }

  return false
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

async function cancelBody(request) {
  if (request.body) {
    await request.body.cancel().catch(() => {})
  }
}

/**
 * Read and parse a bounded JSON plain-object request body. Enforces
 * `application/json` (`415`), a byte ceiling on `Content-Length` and the stream
 * (`413`), and valid JSON plain-object syntax (`400`).
 */
export async function readJsonBody(request, maxBytes = MAX_JSON_BYTES) {
  const contentType = (request.headers.get('content-type') || '').trim().toLowerCase()
  const mediaType = contentType.split(';')[0].trim()
  if (mediaType !== 'application/json') {
    await cancelBody(request)
    return { ok: false, error: 'UNSUPPORTED MEDIA TYPE', status: 415 }
  }

  const rawLength = request.headers.get('content-length')
  if (rawLength !== null && rawLength.trim() !== '') {
    const trimmedLength = rawLength.trim()
    if (!/^\d+$/.test(trimmedLength)) {
      await cancelBody(request)
      return { ok: false, error: 'BAD REQUEST', status: 400 }
    }
    if (Number(trimmedLength) > maxBytes) {
      await cancelBody(request)
      return { ok: false, error: 'PAYLOAD TOO LARGE', status: 413 }
    }
  }

  const chunks = []
  let total = 0
  if (request.body) {
    const reader = request.body.getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = value instanceof Uint8Array ? value : new TextEncoder().encode(String(value))
        total += chunk.byteLength
        if (total > maxBytes) {
          await reader.cancel().catch(() => {})
          return { ok: false, error: 'PAYLOAD TOO LARGE', status: 413 }
        }
        chunks.push(chunk)
      }
    } catch {
      return { ok: false, error: 'BAD REQUEST', status: 400 }
    }
  }

  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }

  let parsed
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return { ok: false, error: 'BAD REQUEST', status: 400 }
  }

  if (!isPlainObject(parsed)) {
    return { ok: false, error: 'BAD REQUEST', status: 400 }
  }

  return { ok: true, body: parsed }
}

function firstHeaderIp(value) {
  if (!value) return ''
  return value.split(',')[0].trim()
}

export function clientIp(request) {
  return (
    firstHeaderIp(request.headers.get('x-vercel-forwarded-for')) ||
    firstHeaderIp(request.headers.get('x-real-ip')) ||
    firstHeaderIp(request.headers.get('x-forwarded-for')) ||
    'local'
  )
}

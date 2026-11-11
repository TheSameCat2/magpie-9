// Thin client for the score API in /api. Every call resolves to parsed JSON
// or rejects with the server's error message.

const FETCH_TIMEOUT_MS = 8_000

/**
 * Combine an optional caller AbortSignal with the per-request timeout.
 * @param {AbortSignal} [signal]
 */
function requestSignal(signal) {
  const timeout = AbortSignal.timeout(FETCH_TIMEOUT_MS)
  if (!signal) return timeout
  if ('any' in AbortSignal) return AbortSignal.any([signal, timeout])
  const ctl = new AbortController()
  const abort = () => ctl.abort(signal.aborted ? signal.reason : timeout.reason)
  if (signal.aborted) abort()
  else {
    signal.addEventListener('abort', abort, { once: true })
    timeout.addEventListener('abort', abort, { once: true })
  }
  return ctl.signal
}

async function readJson(res) {
  // A 200 that is not JSON (the dev server serving the function source, an
  // HTML error page) is a failure. Swallowing the parse used to look like a
  // board that was still loading.
  const data = await res.json().catch(() => null)
  if (!res.ok || data == null || typeof data !== 'object') {
    throw new Error(data?.error || `HTTP ${res.status}`)
  }
  return data
}

/**
 * @param {string} url
 * @param {{ priority?: RequestPriority, signal?: AbortSignal }} [opts]
 * @param {unknown} [body]
 */
async function requestJson(url, { priority, signal } = {}, body) {
  /** @type {RequestInit} */
  const req = body
    ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
    : {}
  req.signal = requestSignal(signal)
  if (priority) req.priority = priority
  return readJson(await fetch(url, req))
}

/**
 * @param {string} [mode]
 * @param {{ priority?: RequestPriority, signal?: AbortSignal }} [opts]
 */
export function fetchBoard(mode = 'run', opts) {
  const q = mode === 'challenge' || mode === 'bends' ? `?mode=${mode}` : ''
  return requestJson(`/api/scores${q}`, opts)
}

/**
 * Ask for a run token for `run`, `bends`, or `challenge` (which also returns today's seed and target).
 * @param {string} [mode]
 * @param {{ priority?: RequestPriority, signal?: AbortSignal }} [opts]
 */
export function startRun(mode = 'run', opts) {
  return requestJson('/api/run', opts, { mode })
}

/**
 * @param {{ initials: string, score: number, token: string, pausedMs?: number }} payload
 * @param {{ priority?: RequestPriority, signal?: AbortSignal }} [opts]
 */
export function submitScore({ initials, score, token, pausedMs = 0 }, opts) {
  return requestJson('/api/scores', opts, { initials, score, token, pausedMs })
}

export const scoreApi = { fetchBoard, startRun, submitScore }

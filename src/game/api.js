// Thin client for the score API in /api. Every call resolves to parsed JSON
// or rejects with the server's error message.

async function readJson(res) {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

function postJson(url, body) {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function fetchBoard(mode = 'run') {
  const q = mode === 'challenge' ? '?mode=challenge' : ''
  return readJson(await fetch(`/api/scores${q}`))
}

/** Ask for a run token (and, for challenges, today's seed and target). */
export async function startRun(mode = 'run') {
  return readJson(await postJson('/api/run', { mode }))
}

export async function submitScore({ initials, score, token, pausedMs = 0 }) {
  return readJson(await postJson('/api/scores', { initials, score, token, pausedMs }))
}

export const scoreApi = { fetchBoard, startRun, submitScore }

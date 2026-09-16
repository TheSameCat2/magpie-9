export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

/** Calendar day in UTC as `YYYY-MM-DD`; the daily challenge rolls over at UTC midnight. */
export function utcDay(ms = Date.now()) {
  return new Date(ms).toISOString().slice(0, 10)
}

/** `m:ss.t` for a duration in milliseconds. */
export function formatTime(ms) {
  const t = Math.max(0, Math.floor(Number(ms) || 0))
  const minutes = Math.floor(t / 60000)
  const seconds = Math.floor((t % 60000) / 1000)
  const tenths = Math.floor((t % 1000) / 100)
  return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths}`
}

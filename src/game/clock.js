/**
 * Wall-clock run timer that excludes held intervals. The sim freezes with
 * dt = 0 while paused, but frame time is clamped and rAF stops in hidden
 * tabs, so summing frame dt would drift; instead subtract the holds.
 */
export function createRunClock(now = Date.now) {
  let t0 = 0
  let pausedMs = 0
  let holdAt = null

  function openHold(at = now()) {
    return holdAt === null ? 0 : Math.max(0, at - holdAt)
  }

  return {
    start(at = now()) {
      t0 = at
      pausedMs = 0
      holdAt = null
    },
    hold() {
      if (holdAt === null) holdAt = now()
    },
    release() {
      if (holdAt === null) return
      pausedMs += openHold()
      holdAt = null
    },
    get held() {
      return holdAt !== null
    },
    /** Total held time so far, including a hold that is still open. */
    get pausedMs() {
      return pausedMs + openHold()
    },
    /** Played time: wall-clock since start minus every hold. */
    elapsed() {
      return Math.max(0, now() - t0 - pausedMs - openHold())
    },
  }
}

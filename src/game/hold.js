// The "hold": every way a live run can be frozen. Jump-to-begin, the pause
// menu and its resume countdown, a tutorial lesson card, a rotated phone, or a
// hidden tab. One reason is active at a time; the pure helpers below decide
// how reasons combine and what a flap does under each.

// Seconds between CONTINUE and the run going live. The release itself never
// flaps, so the first jump after a pause is always the player's own.
export const RESUME_COUNTDOWN = 3

/**
 * What a flap/tap does while the run is held. A lesson dismiss stays paused;
 * the pause menu (and the countdown out of it) only releases through
 * CONTINUE, never a stray flap.
 */
export function pauseTapAction({ paused, lesson, blocked, menu = false }) {
  if (!paused || blocked || menu) return 'ignore'
  if (lesson) return 'hold'
  return 'resume'
}

/**
 * Keep "jump to begin" and the pause menu through rotate/hide; a lesson still
 * takes the overlay. An interrupted countdown falls back to the pause menu so
 * the run never goes live while the screen is unusable.
 */
export function heldPauseReason(current, next) {
  if (current === 'countdown') return 'menu'
  if ((current === 'begin' || current === 'menu') && next !== 'lesson' && next !== current) return current
  return next
}

/**
 * @param clock   run clock to hold/release
 * @param hud     showPaused / hidePaused / showLesson / hideLesson
 * @param audio   title / clearHazard / tick
 * @param now     wall clock in ms
 * @param isLive  () => true while the game is in the playing state
 * @param isBlocked () => true while the screen is rotated or hidden
 * @param onRelease called when the resume countdown runs out (tap() reports its own release)
 */
export function createHold({ clock, hud, audio, now, isLive, isBlocked, onRelease }) {
  let paused = false
  let reason = null
  let lesson = null
  // Wall-clock end of the resume countdown. Frame dt is clamped and rAF can
  // crawl on weak GPUs, so summing it would stretch the count; read the clock.
  let countdownEnd = 0
  let countdownDigit = 0
  // A lesson opened over JUMP TO BEGIN should return there, not to JUMP TO RESUME.
  let afterLesson = 'resume'

  function pause(next) {
    reason = heldPauseReason(reason, next)
    if (isLive() && !paused) {
      paused = true
      clock.hold()
      audio.title()
      audio.clearHazard()
    }
    hud.showPaused(reason)
  }

  function release() {
    paused = false
    reason = null
    lesson = null
    afterLesson = 'resume'
    clock.release()
    hud.hidePaused()
    hud.hideLesson()
  }

  /** Drop every hold without notifying anyone; used when the run ends or leaves for the menu. */
  function clear() {
    paused = false
    reason = null
    lesson = null
    afterLesson = 'resume'
    hud.hidePaused()
    hud.hideLesson()
  }

  /** PAUSE button / P / Esc: hold a live run behind the pause menu. */
  function openMenu() {
    if (!isLive() || paused) return false
    pause('menu')
    return true
  }

  /**
   * CONTINUE: the only way out of the pause menu. Flaps and taps never release
   * it. Starts the countdown rather than going live; see `tickCountdown`.
   */
  function continueFromMenu() {
    if (!isLive() || !paused || reason !== 'menu') return false
    if (isBlocked()) return false
    reason = 'countdown'
    countdownEnd = now() + RESUME_COUNTDOWN * 1000
    countdownDigit = RESUME_COUNTDOWN
    audio.tick()
    hud.showPaused('countdown', RESUME_COUNTDOWN)
    return true
  }

  /** Seconds left on the resume countdown, 0 once it has run out or is not running. */
  function countdownLeft() {
    if (reason !== 'countdown') return 0
    return Math.max(0, (countdownEnd - now()) / 1000)
  }

  /** Deliberately never flaps: the bird keeps its held velocity until the player does. */
  function tickCountdown() {
    const left = countdownLeft()
    if (left === 0) {
      release()
      onRelease?.()
      return
    }
    const digit = Math.ceil(left)
    if (digit !== countdownDigit) {
      countdownDigit = digit
      audio.tick()
      hud.showPaused('countdown', left)
    }
  }

  /** Freeze the run under a tutorial explainer card. */
  function showLesson(type) {
    afterLesson = reason === 'begin' ? 'begin' : 'resume'
    lesson = type
    pause('lesson')
    hud.showLesson(type)
  }

  /** The overlay to show for the current hold once the screen is usable again. */
  function heldOverlay() {
    if (lesson) return 'lesson'
    if (reason === 'begin' || reason === 'menu') return reason
    return 'resume'
  }

  /**
   * A flap while held. Returns 'ignore', 'hold' (lesson dismissed, still
   * waiting for a jump), or 'begin' / 'resume' when the run went live.
   */
  function tap() {
    const action = pauseTapAction({
      paused,
      lesson,
      blocked: isBlocked(),
      menu: reason === 'menu' || reason === 'countdown',
    })
    if (action === 'ignore') return 'ignore'
    if (action === 'hold') {
      lesson = null
      hud.hideLesson()
      pause(afterLesson)
      return 'hold'
    }
    const was = reason
    release()
    return was === 'begin' ? 'begin' : 'resume'
  }

  return {
    pause,
    release,
    clear,
    openMenu,
    continueFromMenu,
    countdownLeft,
    tickCountdown,
    showLesson,
    heldOverlay,
    tap,
    get paused() {
      return paused
    },
    get reason() {
      return reason
    },
    get lesson() {
      return lesson
    },
    get inMenu() {
      return reason === 'menu' || reason === 'countdown'
    },
  }
}

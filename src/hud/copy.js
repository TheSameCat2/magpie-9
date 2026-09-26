// Pure text/state helpers for the HUD. No DOM, so everything here is unit-testable.

import { formatTime } from '../lib/time.js'

export const MENU_ITEMS = ['new', 'challenge', 'tutorial', 'scores', 'help', 'credits']

/** One line under the menu for the highlighted entry. */
export const MENU_BLURBS = {
  new: 'AN OPEN RUN · EVERY GATE COUNTS',
  challenge: "TODAY'S 40-GATE COURSE · RANKED BY TIME",
  tutorial: 'A SLOW RUN THAT TEACHES EACH HAZARD AND ORB',
  scores: "ALL-TIME GATES · TODAY'S FASTEST EXTRACTS",
  help: 'CONTROLS, ORBS, AND HOW A CHALLENGE WORKS',
  credits: 'THE PEOPLE BEHIND MAGPIE-9',
}

/**
 * Copy for the hold overlay. `begin` is a fresh run; `resume` is after an
 * interrupt; `menu` is the player's own pause, released only by CONTINUE;
 * `countdown` is the seconds left (`left`) before that release goes live.
 * `inputMode` only changes the begin hint.
 */
export function pauseCopy(reason, left = 0, inputMode = 'keys') {
  if (reason === 'begin') {
    const sub = inputMode === 'touch' ? 'TAP THE RIGHT HALF' : 'SPACE · CLICK · ↑'
    return { title: 'JUMP TO BEGIN', sub }
  }
  if (reason === 'resume') return { title: 'PAUSED', sub: 'JUMP TO RESUME' }
  if (reason === 'menu') return { title: 'PAUSED', sub: '' }
  if (reason === 'countdown') return { title: String(Math.max(1, Math.ceil(left))), sub: 'RESUMING' }
  return null
}

/** The line under a tutorial explainer card. */
export function lessonHint(inputMode) {
  return inputMode === 'touch' ? 'TAP TO CONTINUE' : 'SPACE TO CONTINUE'
}

/** Return hint on the credits and scores screens. */
export function screenHint(scene, inputMode) {
  const touch = inputMode === 'touch'
  if (scene === 'credits') return touch ? 'TAP TO RETURN' : 'ESC TO RETURN'
  if (scene === 'scores') return touch ? 'TAP TO RETURN' : '← → BOARD · ESC RETURN'
  return null
}

/** Corner hint. Collider debug stays in the field manual. */
export function keysHint(scene) {
  if (scene === 'playing' || scene === 'respawn') return 'P PAUSE · M MUTE'
  if (
    scene === 'menu' ||
    scene === 'dead' ||
    scene === 'credits' ||
    scene === 'scores' ||
    scene === 'entry'
  ) {
    return 'H HELP · M MUTE'
  }
  return ''
}

/** Move a menu highlight by `dir` rows, wrapping at both ends. */
export function stepMenu(index, dir, n = MENU_ITEMS.length) {
  if (n <= 0) return 0
  return (((index + dir) % n) + n) % n
}

/** Title + prompt for the end-of-run card. */
export function endCopy({ gameMode, score, newBest, challenge, extracted, time, target }) {
  if (gameMode === 'tutorial') return { title: 'TUTORIAL', prompt: 'SESSION ENDED' }
  if (challenge) {
    return extracted
      ? { title: 'EXTRACT', prompt: formatTime(time) }
      : { title: 'EXTRACT FAILED', prompt: `${score} / ${target}` }
  }
  return { title: 'REBOOT', prompt: newBest ? `NEW BEST ${score}` : `RUN ${score}` }
}

/** Title + prompt while the player types initials for a leaderboard slot. */
export function entryCopy({ score, rank, challenge, time }) {
  if (challenge) return { title: 'EXTRACT', prompt: `${formatTime(time ?? score)} · RANK #${rank}` }
  return { title: 'REBOOT', prompt: `RUN ${score} · RANK #${rank}` }
}

/** The one-line control hint under the centre card, per scene and input device. */
export function sceneHint(scene, inputMode) {
  const touch = inputMode === 'touch'
  if (scene === 'menu') return touch ? 'TAP TO SELECT' : '↑ ↓ SELECT · ENTER · H HELP'
  if (scene === 'dead') return touch ? 'TAP FOR MENU' : 'SPACE FOR MENU'
  if (scene === 'entry') return touch ? 'TAP ARROWS · ENTER OR SKIP' : 'TYPE OR ↑ ↓ · ENTER · ESC SKIP'
  return null
}

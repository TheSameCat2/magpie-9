// Pure leaderboard rules and the initials-entry state machine. The fetch
// calls that talk to /api live in api.js.

import { BOARD_SIZE } from '../config/rules.js'

export const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
export const INITIALS = 3

/** Run boards rank by gates, highest first. */
export function qualifies(board, score) {
  if (!board) return false
  return board.length < BOARD_SIZE || score > board[BOARD_SIZE - 1].score
}

export function placement(board, score) {
  if (!board) return 1
  let i = 0
  while (i < board.length && board[i].score >= score) i++
  return i + 1
}

/** Challenge boards rank by extract time in ms, lowest first. */
export function qualifiesTime(board, ms) {
  if (!board) return false
  return board.length < BOARD_SIZE || ms < board[BOARD_SIZE - 1].score
}

export function placementTime(board, ms) {
  if (!board) return 1
  let i = 0
  while (i < board.length && board[i].score <= ms) i++
  return i + 1
}

export function createEntry() {
  return { chars: Array.from({ length: INITIALS }, () => 'A'), cursor: 0 }
}

export function initialsOf(entry) {
  return entry.chars.join('')
}

export function stepChar(ch, dir) {
  const i = CHARS.indexOf(ch)
  const n = CHARS.length
  const from = i < 0 ? 0 : i
  return CHARS[(((from + dir) % n) + n) % n]
}

/**
 * Apply one edit to an initials entry. `action` is a direction string, a
 * `{ char }` from the keyboard, or a `{ slot, dir }` from the on-screen
 * arrows. `done` is set when ENTER confirms the last letter.
 */
export function entryAction(entry, action) {
  const chars = entry.chars.slice()
  let cursor = entry.cursor
  let done = false

  if (action && typeof action === 'object' && action.char) {
    chars[cursor] = action.char
    if (cursor < INITIALS - 1) cursor += 1
  } else if (action && typeof action === 'object' && 'slot' in action) {
    const slot = Math.max(0, Math.min(INITIALS - 1, Number(action.slot) || 0))
    chars[slot] = stepChar(chars[slot], action.dir)
    cursor = slot
  } else if (action === 'up') {
    chars[cursor] = stepChar(chars[cursor], 1)
  } else if (action === 'down') {
    chars[cursor] = stepChar(chars[cursor], -1)
  } else if (action === 'left') {
    cursor = Math.max(0, cursor - 1)
  } else if (action === 'right') {
    cursor = Math.min(INITIALS - 1, cursor + 1)
  } else if (action === 'erase') {
    if (cursor > 0) cursor -= 1
    else chars[0] = 'A'
  } else if (action === 'select') {
    if (cursor < INITIALS - 1) cursor += 1
    else done = true
  }

  return { entry: { chars, cursor }, done }
}

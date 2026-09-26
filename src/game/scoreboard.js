// Leaderboards and initials entry. Caches both boards, paints the SCORES
// screen, and drives the three-letter entry through to submission. The game
// owns the scene state; `isShowing()` tells us whether a repaint is visible.

import {
  createEntry,
  entryAction,
  initialsOf,
  placement,
  placementTime,
  qualifies,
  qualifiesTime,
} from './board.js'

export function createScoreboard({ api, hud, isShowing }) {
  const boards = { run: null, challenge: null }
  const failed = { run: false, challenge: false }
  let challengeDay = null
  /** Which tab the SCORES screen is on. */
  let tab = 'run'
  let entry = null

  function labelFor(kind, status) {
    if (status) return status
    const board = boards[kind]
    if (board == null) return failed[kind] ? 'BOARD OFFLINE' : 'LOADING'
    if (board.length === 0) return 'NO ENTRIES YET'
    return ''
  }

  function paint(rank = -1, status = '') {
    const day = tab === 'challenge' ? challengeDay : null
    hud.showScores(boards[tab], rank, labelFor(tab, status), { kind: tab, day })
  }

  function absorb(kind, data) {
    boards[kind] = data.board
    failed[kind] = false
    if (kind === 'challenge' && data.day) challengeDay = data.day
  }

  /** Re-fetch both boards; repaint if the matching tab is on screen. */
  function refresh() {
    for (const kind of ['run', 'challenge']) {
      api
        .fetchBoard(kind)
        .then((data) => {
          absorb(kind, data)
          if (isShowing() && tab === kind) paint()
        })
        .catch(() => {
          if (boards[kind] == null) failed[kind] = true
          if (isShowing() && tab === kind) paint()
        })
    }
  }

  function open(kind = 'run') {
    tab = kind === 'challenge' ? 'challenge' : 'run'
    paint()
    refresh()
  }

  /** Would `value` (gates for a run, ms for a challenge) make the board? */
  function qualifiesFor(kind, value) {
    return kind === 'challenge' ? qualifiesTime(boards.challenge, value) : qualifies(boards.run, value)
  }

  function rankFor(kind, value) {
    return kind === 'challenge' ? placementTime(boards.challenge, value) : placement(boards.run, value)
  }

  function beginEntry() {
    entry = createEntry()
    return entry
  }

  /** Apply an edit; returns true when ENTER confirmed the last letter. */
  function editEntry(action) {
    if (!entry) return false
    const next = entryAction(entry, action)
    entry = next.entry
    hud.renderEntry(entry)
    return next.done
  }

  function cancelEntry() {
    entry = null
    hud.hideEntry()
  }

  /**
   * Send the entered initials with the run token. Switches the SCORES tab to
   * the board being written and paints SAVING until the server answers.
   */
  function submit({ kind, score, token, pausedMs }) {
    const initials = initialsOf(entry)
    entry = null
    tab = kind
    hud.hideEntry()
    paint(-1, 'SAVING')
    api
      .submitScore({ initials, score, token, pausedMs })
      .then((res) => {
        absorb(kind, res)
        if (isShowing()) paint(res.rank)
      })
      .catch(() => {
        if (isShowing()) paint(-1, 'BOARD OFFLINE')
      })
  }

  return {
    refresh,
    open,
    qualifiesFor,
    rankFor,
    beginEntry,
    editEntry,
    cancelEntry,
    submit,
    get tab() {
      return tab
    },
    get entry() {
      return entry
    },
    get challengeDay() {
      return challengeDay
    },
    set challengeDay(day) {
      if (day) challengeDay = day
    },
  }
}

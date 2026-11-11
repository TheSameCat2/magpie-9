// Leaderboards and initials entry. Caches every board, paints the SCORES
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
  /** run and bends rank gates; challenge ranks extract time. */
  const boards = { run: null, bends: null, challenge: null }
  const failed = { run: false, bends: false, challenge: false }
  let challengeDay = null
  /** Which tab the SCORES screen is on. */
  let tab = 'run'
  let entry = null
  /** @type {AbortController | null} */
  let refreshCtl = null
  /** Active in-flight score submission, so background refreshes never clobber SAVING. */
  let saving = null

  function labelFor(kind, status) {
    if (status) return status
    const board = boards[kind]
    if (board == null) return failed[kind] ? 'BOARD OFFLINE' : 'LOADING'
    if (board.length === 0) return 'NO ENTRIES YET'
    return ''
  }

  function paint(rank = -1, status = '') {
    const day = tab === 'challenge' ? challengeDay : null
    const effective = status || (saving?.kind === tab ? 'SAVING' : '')
    hud.showScores(boards[tab], rank, labelFor(tab, effective), { kind: tab, day })
  }

  function absorb(kind, data) {
    boards[kind] = data.board
    failed[kind] = false
    if (kind === 'challenge' && data.day) challengeDay = data.day
  }

  /** Re-fetch every board; repaint if the matching tab is on screen. */
  function refresh() {
    refreshCtl?.abort()
    const ctl = new AbortController()
    refreshCtl = ctl
    const priority = isShowing() ? 'auto' : 'low'
    for (const kind of Object.keys(boards)) {
      api
        .fetchBoard(kind, { priority, signal: ctl.signal })
        .then((data) => {
          if (ctl.signal.aborted || saving?.kind === kind) return
          absorb(kind, data)
          if (isShowing() && tab === kind) paint()
        })
        .catch((err) => {
          if (ctl.signal.aborted || err?.name === 'AbortError' || saving?.kind === kind) return
          if (boards[kind] == null) failed[kind] = true
          if (isShowing() && tab === kind) paint()
        })
    }
  }

  function open(kind = 'run') {
    tab = kind in boards ? kind : 'run'
    paint()
    refresh()
  }

  /** Would `value` (gates for run/bends, ms for a challenge) make the board? */
  function qualifiesFor(kind, value) {
    return kind === 'challenge' ? qualifiesTime(boards.challenge, value) : qualifies(boards[kind], value)
  }

  function rankFor(kind, value) {
    return kind === 'challenge' ? placementTime(boards.challenge, value) : placement(boards[kind], value)
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
    const cur = { kind }
    entry = null
    tab = kind
    saving = cur
    refreshCtl?.abort()
    hud.hideEntry()
    paint(-1, 'SAVING')
    api
      .submitScore({ initials, score, token, pausedMs })
      .then((res) => {
        absorb(kind, res)
        if (saving !== cur) return
        saving = null
        if (isShowing() && tab === kind) paint(res.rank)
      })
      .catch(() => {
        if (saving !== cur) return
        saving = null
        if (isShowing() && tab === kind) paint(-1, 'BOARD OFFLINE')
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

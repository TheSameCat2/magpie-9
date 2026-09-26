// Full-screen scenes: the centre card (menu / end-of-run / initials entry),
// the credits and scores panels, and the tutorial lesson cards.

import { BOARD_SIZE } from '../config/rules.js'
import { formatTime } from '../lib/time.js'
import { byId, hide, onPress, queryAll, retrigger, setVisible, show } from './dom.js'
import { MENU_BLURBS, MENU_ITEMS, endCopy, entryCopy, stepMenu } from './copy.js'

/**
 * `state` is the HUD's shared scene/mode record; `refresh` re-applies the
 * chrome (which buttons/hints are visible) after a scene change; `help` is
 * closed whenever a scene is swapped so the modal never lingers.
 */
export function createScreens(state, { refresh, help }) {
  const center = byId('center')
  const title = byId('title')
  const prompt = byId('prompt')
  const menuEl = byId('menu')
  const menuBtns = queryAll('button', menuEl)
  const creditsEl = byId('credits')
  const scoresEl = byId('scores')
  const scoresList = byId('scoresList')
  const scoresStatus = byId('scoresStatus')
  const scoresDay = document.getElementById('scoresDay')
  const scoresTabs = queryAll('#scoresTabs button')
  const entryEl = byId('entry')
  const entrySlots = queryAll('.slot', entryEl)
  const lessonEl = byId('lesson')
  const lessonBlocks = queryAll('.lesson', lessonEl)
  const backBtns = queryAll('.screen .back')
  const blurb = byId('blurb')

  let menuIndex = 0

  function hidePanels() {
    help.hideHelp()
    hide(creditsEl)
    hide(scoresEl)
  }

  function hideEntry() {
    hide(entryEl)
  }

  function hideLesson() {
    hide(lessonEl)
  }

  /** Bring the centre card up with the given title/prompt and end-state styling. */
  function raiseCard({ title: heading, prompt: line, dead, extract }) {
    show(center)
    center.classList.toggle('dead', dead)
    center.classList.toggle('extract', extract)
    retrigger(center, 'rise')
    title.innerHTML = heading
    if (line == null) hide(prompt)
    else {
      prompt.textContent = line
      show(prompt)
    }
  }

  function setMenuIndex(i, { focus = false } = {}) {
    menuIndex = stepMenu(i, 0, menuBtns.length)
    menuBtns.forEach((b, k) => {
      const on = k === menuIndex
      b.classList.toggle('sel', on)
      b.tabIndex = on ? 0 : -1
      if (on) b.setAttribute('aria-current', 'true')
      else b.removeAttribute('aria-current')
    })
    const item = menuBtns[menuIndex]?.dataset.item
    blurb.textContent = MENU_BLURBS[item] ?? ''
    if (focus && state.inputMode !== 'touch') menuBtns[menuIndex]?.focus({ preventScroll: true })
  }

  function showMenu() {
    state.scene = 'menu'
    hidePanels()
    hideLesson()
    hideEntry()
    raiseCard({ title: 'MAGPIE<span>-9</span>', prompt: null, dead: false, extract: false })
    show(menuEl)
    setMenuIndex(menuIndex)
    refresh()
  }

  function showPlaying() {
    state.scene = 'playing'
    hide(center)
    hidePanels()
    hideEntry()
    refresh()
  }

  function showDead(score, newBest, extra = {}) {
    state.scene = 'dead'
    hideEntry()
    hide(menuEl)
    raiseCard({
      ...endCopy({ gameMode: state.gameMode, score, newBest, ...extra }),
      dead: true,
      extract: !!extra.extracted,
    })
    refresh()
  }

  function renderEntry(entry) {
    entrySlots.forEach((slot, i) => {
      slot.classList.toggle('sel', i === entry.cursor)
      slot.querySelector('b').textContent = entry.chars[i]
    })
  }

  function showEntry(score, rank, entry, extra = {}) {
    state.scene = 'entry'
    hidePanels()
    hide(menuEl)
    raiseCard({ ...entryCopy({ score, rank, ...extra }), dead: true, extract: !!extra.challenge })
    show(entryEl)
    renderEntry(entry)
    refresh()
  }

  function showCredits() {
    state.scene = 'credits'
    hidePanels()
    hideEntry()
    hide(center)
    show(creditsEl)
    creditsEl.querySelector('.back')?.focus({ preventScroll: true })
    refresh()
  }

  function renderScoreRows(board, rank, kind) {
    scoresList.replaceChildren()
    const asTime = kind === 'challenge'
    for (let i = 0; i < BOARD_SIZE; i++) {
      const item = board?.[i]
      const row = document.createElement('li')
      row.classList.toggle('you', rank === i + 1)
      const place = document.createElement('span')
      place.className = 'rank'
      place.textContent = String(i + 1).padStart(2, '0')
      const name = document.createElement('span')
      name.className = 'initials'
      if (rank === i + 1) {
        const mark = document.createElement('span')
        mark.className = 'you-mark'
        mark.setAttribute('aria-hidden', 'true')
        mark.textContent = '▸'
        name.append(mark, document.createTextNode(` ${item ? item.initials : '---'}`))
        const you = document.createElement('span')
        you.className = 'sr-only'
        you.textContent = ', your score'
        name.append(you)
      } else {
        name.textContent = item ? item.initials : '---'
      }
      const pts = document.createElement('span')
      pts.className = 'pts'
      pts.textContent = item ? (asTime ? formatTime(item.score) : String(item.score)) : '---'
      row.append(place, name, pts)
      scoresList.appendChild(row)
    }
  }

  function showScores(board, rank, status, view = {}) {
    const opening = scoresEl.classList.contains('hidden')
    state.scene = 'scores'
    hidePanels()
    hideEntry()
    hide(center)
    show(scoresEl)
    const kind = view.kind === 'challenge' ? 'challenge' : 'run'
    const label = status || ''
    scoresStatus.textContent = label
    setVisible(scoresStatus, !!label)
    if (scoresDay) {
      const day = kind === 'challenge' && view.day ? view.day : ''
      scoresDay.textContent = day
      setVisible(scoresDay, !!day)
    }
    scoresTabs.forEach((btn) => {
      const on = btn.dataset.board === kind
      btn.classList.toggle('sel', on)
      btn.setAttribute('aria-selected', on ? 'true' : 'false')
    })
    renderScoreRows(board, rank, kind)
    if (opening) scoresTabs.find((btn) => btn.classList.contains('sel'))?.focus({ preventScroll: true })
    refresh()
  }

  function showLesson(type) {
    for (const block of lessonBlocks) {
      const on = block.dataset.lesson === type
      setVisible(block, on)
      if (on) {
        const title = block.querySelector('.overlay-title')
        if (title?.id) lessonEl.setAttribute('aria-labelledby', title.id)
      }
    }
    show(lessonEl)
    lessonEl.tabIndex = -1
    lessonEl.focus({ preventScroll: true })
  }

  // Menu / screen buttons do not stop propagation: the input layer already
  // ignores pointerdown on buttons, and letting it through unlocks audio.
  // onPress also fires for a keyboard click (detail 0) once Enter/Space is
  // allowed to reach a focused button.
  function bindMenu({ onSelect, onBack, onExit, onBoard }) {
    menuBtns.forEach((btn, i) => {
      onPress(btn, () => {
        setMenuIndex(i)
        onSelect?.(btn.dataset.item)
      })
    })
    for (const btn of backBtns) onPress(btn, () => onBack?.())
    onPress(byId('exit'), () => onExit?.())
    scoresTabs.forEach((btn) => {
      onPress(btn, () => onBoard?.(btn.dataset.board), { stopPropagation: true })
    })
  }

  function bindEntry({ onAction }) {
    for (const btn of queryAll('[data-entry]', entryEl)) {
      onPress(
        btn,
        () => {
          if (btn.dataset.entry === 'select') onAction?.('select')
          else if (btn.dataset.entry === 'skip') onAction?.('skip')
          else onAction?.({ slot: Number(btn.dataset.slot), dir: Number(btn.dataset.dir) })
        },
        { stopPropagation: true },
      )
    }
  }

  return {
    showMenu,
    showPlaying,
    showDead,
    showEntry,
    hideEntry,
    renderEntry,
    showCredits,
    showScores,
    showLesson,
    hideLesson,
    bindMenu,
    bindEntry,
    moveMenu(dir) {
      setMenuIndex(stepMenu(menuIndex, dir, menuBtns.length), { focus: true })
    },
    get menuItem() {
      return menuBtns[menuIndex]?.dataset.item ?? MENU_ITEMS[0]
    },
  }
}

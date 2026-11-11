// The field manual: a modal over whatever scene is showing, not a scene itself.

import { byId, hide, isInert, onPress, query, retrigger, show } from './dom.js'

export function createHelp() {
  const helpEl = byId('help')
  const helpBtn = byId('btnHelp')
  const closeBtn = byId('btnHelpClose')
  const closeLabel = query('.label', closeBtn)
  const card = query('.help-card', helpEl)

  let open = false
  /** @type {HTMLElement | null} */
  let triggerEl = null
  /** @type {HTMLElement | null} */
  let pendingTrigger = null
  /** @type {(() => void) | null} */
  let changeListener = null

  /** @param {HTMLElement | null} el */
  function canFocus(el) {
    return !!(el && el.isConnected && !el.closest('.hidden') && !el.closest('.playing') && !isInert(el))
  }

  function showHelp() {
    if (open) return
    const active = /** @type {HTMLElement | null} */ (document.activeElement)
    triggerEl =
      pendingTrigger ||
      (active && active !== document.body && active !== document.documentElement ? active : null)
    pendingTrigger = null
    open = true
    document.body.classList.add('help-open')
    show(helpEl)
    retrigger(helpEl, 'rise')
    helpEl.scrollTop = 0
    card.scrollTop = 0
    helpBtn.setAttribute('aria-expanded', 'true')
    changeListener?.()
    closeBtn.focus({ preventScroll: true })
  }

  function hideHelp() {
    if (!open) return
    open = false
    document.body.classList.remove('help-open')
    hide(helpEl)
    helpBtn.setAttribute('aria-expanded', 'false')
    changeListener?.()
    const target = canFocus(triggerEl) ? triggerEl : canFocus(helpBtn) ? helpBtn : null
    triggerEl = null
    target?.focus({ preventScroll: true })
  }

  function toggleHelp() {
    if (open) hideHelp()
    else showHelp()
  }

  function setInputMode(inputMode) {
    closeLabel.textContent = inputMode === 'touch' ? 'CLOSE' : 'CLOSE · ESC'
  }

  /** @param {() => void} fn */
  function onChange(fn) {
    changeListener = fn
  }

  function bind({ onToggle }) {
    onPress(
      helpBtn,
      () => {
        if (!open) pendingTrigger = helpBtn
        onToggle?.()
      },
      { stopPropagation: true },
    )
    onPress(closeBtn, onToggle, { stopPropagation: true })
    // Pointers inside the manual must never reach the game's window listeners
    // (a tap there would arm a run). A tap on the dimmed backdrop closes it;
    // taps on the card are swallowed so the card can scroll.
    helpEl.addEventListener('pointerdown', (e) => {
      e.stopPropagation()
      if (e.target === helpEl) onToggle?.()
    })
  }

  return {
    showHelp,
    hideHelp,
    toggleHelp,
    setInputMode,
    onChange,
    bind,
    get open() {
      return open
    },
  }
}

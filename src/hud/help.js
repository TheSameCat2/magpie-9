// The field manual: a modal over whatever scene is showing, not a scene itself.

import { byId, hide, onPress, query, retrigger, show } from './dom.js'

export function createHelp() {
  const helpEl = byId('help')
  const helpBtn = byId('btnHelp')
  const closeBtn = byId('btnHelpClose')
  const closeLabel = query('.label', closeBtn)
  const card = query('.help-card', helpEl)

  let open = false

  function showHelp() {
    if (open) return
    open = true
    document.body.classList.add('help-open')
    show(helpEl)
    retrigger(helpEl, 'rise')
    helpEl.scrollTop = 0
    card.scrollTop = 0
    helpBtn.setAttribute('aria-expanded', 'true')
    closeBtn.focus({ preventScroll: true })
  }

  function hideHelp() {
    if (!open) return
    open = false
    document.body.classList.remove('help-open')
    hide(helpEl)
    helpBtn.setAttribute('aria-expanded', 'false')
    if (document.activeElement === closeBtn) helpBtn.focus({ preventScroll: true })
  }

  function toggleHelp() {
    if (open) hideHelp()
    else showHelp()
  }

  function setInputMode(inputMode) {
    closeLabel.textContent = inputMode === 'touch' ? 'CLOSE' : 'CLOSE · ESC'
  }

  function bind({ onToggle }) {
    onPress(helpBtn, onToggle, { stopPropagation: true })
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
    bind,
    get open() {
      return open
    },
  }
}

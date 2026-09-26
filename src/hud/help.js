// The field manual: a modal over whatever scene is showing, not a scene itself.

import { byId, hide, onPress, query, queryAll, retrigger, show } from './dom.js'

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

  function focusables() {
    return queryAll('button, [href], [tabindex]:not([tabindex="-1"])', card).filter(
      (el) => !el.disabled && !el.classList.contains('hidden'),
    )
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
    // Keep Tab inside the card. The manual is long, but the only control is CLOSE
    // until more buttons land here; wrapping still stops focus escaping to the HUD.
    card.addEventListener('keydown', (e) => {
      if (!open || e.key !== 'Tab') return
      const items = focusables()
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || !card.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || !card.contains(active))) {
        e.preventDefault()
        first.focus()
      }
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

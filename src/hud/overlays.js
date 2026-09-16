// Overlays that sit on top of a running scene: the hold/pause card, the
// respawn flash, and the rotate-your-phone blocker.

import { byId, hide, onPress, query, retrigger, setVisible, show } from './dom.js'
import { pauseCopy } from './copy.js'

export function createOverlays(state, { refresh }) {
  const pausedEl = byId('paused')
  const pausedTitle = query('.overlay-title', pausedEl)
  const pausedSub = query('.overlay-sub', pausedEl)
  const continueBtn = byId('btnContinue')
  const pauseBtn = byId('pause')
  const respawnEl = byId('respawn')
  const rotateEl = byId('rotate')

  function blurContinue() {
    if (document.activeElement === continueBtn) continueBtn.blur()
  }

  function showPaused(reason, left = 0) {
    state.held = true
    refresh()
    const copy = pauseCopy(reason, left)
    if (!copy) {
      hide(pausedEl)
      pausedEl.classList.remove('countdown')
      return
    }
    const menu = reason === 'menu'
    const counting = reason === 'countdown'
    if (counting && pausedTitle.textContent !== copy.title) retrigger(pausedTitle, 'pop')
    else if (!counting) pausedTitle.classList.remove('pop')
    pausedTitle.textContent = copy.title
    pausedSub.textContent = copy.sub
    setVisible(pausedSub, !!copy.sub)
    pausedEl.classList.toggle('countdown', counting)
    setVisible(continueBtn, menu)
    show(pausedEl)
    if (menu) continueBtn.focus({ preventScroll: true })
    else blurContinue()
  }

  function hidePaused() {
    state.held = false
    refresh()
    hide(pausedEl)
    pausedEl.classList.remove('countdown')
    pausedTitle.classList.remove('pop')
    hide(continueBtn)
    blurContinue()
  }

  function showRespawn() {
    state.scene = 'respawn'
    show(respawnEl)
    refresh()
  }

  function hideRespawn() {
    hide(respawnEl)
    if (state.scene === 'respawn') {
      state.scene = 'playing'
      refresh()
    }
  }

  function setRotate(blocked) {
    setVisible(rotateEl, blocked)
  }

  // No stopPropagation: the tap still unlocks audio while the input layer
  // skips it as a flap / stick origin because it landed on a button.
  function bindPause({ onPause, onContinue }) {
    onPress(pauseBtn, onPause)
    onPress(continueBtn, onContinue)
  }

  return { showPaused, hidePaused, showRespawn, hideRespawn, setRotate, bindPause }
}

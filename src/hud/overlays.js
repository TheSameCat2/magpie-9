// Overlays that sit on top of a running scene: the hold/pause card, the
// respawn flash, and the rotate-your-phone blocker.

import { byId, hide, isInert, onPress, query, retrigger, setVisible, show } from './dom.js'
import { pauseCopy } from './copy.js'

export function createOverlays(state, { refresh }) {
  const pausedEl = byId('paused')
  const pausedTitle = query('.overlay-title', pausedEl)
  const pausedSub = query('.overlay-sub', pausedEl)
  const continueBtn = byId('btnContinue')
  const quitBtn = byId('btnQuit')
  const pauseBtn = byId('pause')
  const respawnEl = byId('respawn')
  const rotateEl = byId('rotate')
  const rotateFsBtn = byId('btnRotateFs')

  /** @type {HTMLElement | null} */
  let rotateTrigger = null

  function blurContinue() {
    if (document.activeElement === continueBtn) continueBtn.blur()
  }

  function setPausedModal(modal) {
    if (modal) {
      pausedEl.setAttribute('role', 'dialog')
      pausedEl.setAttribute('aria-modal', 'true')
    } else {
      pausedEl.setAttribute('role', 'status')
      pausedEl.removeAttribute('aria-modal')
    }
  }

  function showPaused(reason, left = 0) {
    state.held = true
    pausedEl.dataset.reason = reason
    const copy = pauseCopy(reason, left, state.inputMode)
    if (!copy) {
      setPausedModal(false)
      hide(pausedEl)
      pausedEl.classList.remove('countdown')
      hide(continueBtn)
      hide(quitBtn)
      blurContinue()
      if (document.activeElement === quitBtn) quitBtn.blur()
      refresh()
      return
    }
    const menu = reason === 'menu'
    const counting = reason === 'countdown'
    setPausedModal(menu)
    if (counting && pausedTitle.textContent !== copy.title) retrigger(pausedTitle, 'pop')
    else if (!counting) pausedTitle.classList.remove('pop')
    pausedTitle.textContent = copy.title
    pausedSub.textContent = copy.sub
    setVisible(pausedSub, !!copy.sub)
    pausedEl.classList.toggle('countdown', counting)
    setVisible(continueBtn, menu)
    setVisible(quitBtn, menu)
    show(pausedEl)
    refresh()
    if (menu) continueBtn.focus({ preventScroll: true })
    else {
      blurContinue()
      if (document.activeElement === quitBtn) quitBtn.blur()
    }
  }

  function hidePaused() {
    state.held = false
    setPausedModal(false)
    hide(pausedEl)
    pausedEl.classList.remove('countdown')
    pausedTitle.classList.remove('pop')
    hide(continueBtn)
    hide(quitBtn)
    blurContinue()
    if (document.activeElement === quitBtn) quitBtn.blur()
    delete pausedEl.dataset.reason
    refresh()
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
    const wasBlocked = !rotateEl.classList.contains('hidden')
    if (!wasBlocked && blocked) {
      const active = /** @type {HTMLElement | null} */ (document.activeElement)
      rotateTrigger =
        active && active !== document.body && active !== document.documentElement ? active : null
    }
    setVisible(rotateEl, blocked)
    refresh()
    if (!wasBlocked && blocked) {
      const target = !rotateFsBtn.classList.contains('hidden') ? rotateFsBtn : rotateEl
      target.focus({ preventScroll: true })
    } else if (wasBlocked && !blocked) {
      if (
        rotateTrigger &&
        rotateTrigger.isConnected &&
        !rotateTrigger.closest('.hidden') &&
        !rotateTrigger.closest('.playing') &&
        !isInert(rotateTrigger)
      ) {
        rotateTrigger.focus({ preventScroll: true })
      }
      rotateTrigger = null
    }
  }

  // No stopPropagation: the tap still unlocks audio while the input layer
  // skips it as a flap / stick origin because it landed on a button.
  function bindPause({ onPause, onContinue, onQuit }) {
    onPress(pauseBtn, onPause)
    onPress(continueBtn, onContinue)
    onPress(quitBtn, onQuit)
  }

  return { showPaused, hidePaused, showRespawn, hideRespawn, setRotate, bindPause }
}

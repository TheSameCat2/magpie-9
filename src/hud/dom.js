// Tiny DOM helpers shared by every HUD panel. Nothing here knows about the game.

export function byId(id) {
  const el = document.getElementById(id)
  if (!el) throw new Error(`HUD: missing #${id} in index.html`)
  return el
}

export function query(selector, root = document) {
  const el = root.querySelector(selector)
  if (!el) throw new Error(`HUD: missing ${selector} in index.html`)
  return el
}

export function queryAll(selector, root = document) {
  return Array.from(root.querySelectorAll(selector))
}

export function show(el) {
  el.classList.remove('hidden')
}

export function hide(el) {
  el.classList.add('hidden')
}

export function setVisible(el, visible) {
  el.classList.toggle('hidden', !visible)
}

/** Remove and re-add a class so its CSS animation plays again from the start. */
export function retrigger(el, cls) {
  el.classList.remove(cls)
  void el.offsetWidth
  el.classList.add(cls)
}

/**
 * Fire `fn` on pointerdown and on keyboard activation. Keyboard Enter/Space on
 * a focused button arrives as a `click` with `detail === 0`; pointer clicks are
 * already handled by pointerdown, so they are ignored here to avoid doubling.
 *
 * `stopPropagation` keeps the press away from the window-level input listener.
 * Leave it false when the press should still count as the audio-unlock gesture.
 */
export function onPress(btn, fn, { stopPropagation = false } = {}) {
  btn.addEventListener('pointerdown', (e) => {
    if (stopPropagation) e.stopPropagation()
    e.preventDefault()
    fn?.()
  })
  btn.addEventListener('click', (e) => {
    if (e.detail === 0) fn?.()
  })
}

/** Update an aria-pressed toggle button's state, label, and visible text in one go. */
export function setToggleButton(btn, { pressed, ariaLabel, text }) {
  btn.setAttribute('aria-pressed', pressed ? 'true' : 'false')
  btn.setAttribute('aria-label', ariaLabel)
  btn.classList.toggle('on', !!pressed)
  const label = btn.querySelector('.label')
  if (label && text != null) label.textContent = text
}

export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

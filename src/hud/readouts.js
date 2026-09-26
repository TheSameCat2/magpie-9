// In-run numbers: gate count, best, spare lives, velocity, and the toast line.

import { BASE_SPEED, SPEED_CAP } from '../config/rules.js'
import { byId, query, retrigger, setVisible } from './dom.js'

const TOAST_MS = 1200
const HOT_MS = 450

export function createReadouts() {
  const scoreEl = byId('score')
  const scoreLabel = byId('scoreLabel')
  const bestEl = byId('best')
  const livesEl = byId('lives')
  const velEl = query('#vel b')
  const velBar = query('#velBar i')
  const toastEl = byId('toast')

  let toastTimer = 0
  let hotTimer = 0

  function setScore(gates, animate) {
    scoreEl.textContent = String(gates)
    scoreLabel.textContent = 'GATES'
    if (animate) retrigger(scoreEl, 'pop')
  }

  function setExtract(cleared, target, animate) {
    scoreEl.textContent = `${cleared}/${target}`
    scoreLabel.textContent = 'EXTRACT'
    if (animate) retrigger(scoreEl, 'pop')
  }

  function setBest(gates, beat) {
    bestEl.textContent = `BEST ${gates}`
    bestEl.classList.toggle('beat', !!beat)
  }

  function clearBeat() {
    bestEl.classList.remove('beat')
  }

  function setLives(lives, animate) {
    const spares = Math.max(0, lives - 1)
    livesEl.replaceChildren()
    for (let i = 0; i < spares; i++) {
      const glyph = document.createElement('span')
      glyph.textContent = '+'
      livesEl.appendChild(glyph)
    }
    const noun = spares === 1 ? 'life' : 'lives'
    livesEl.setAttribute('aria-label', `${spares} spare ${noun}`)
    setVisible(livesEl, spares > 0)
    if (animate && spares > 0) retrigger(livesEl, 'pop')
  }

  function setSpeed(speed) {
    velEl.textContent = speed.toFixed(1)
    const fill = (speed - BASE_SPEED) / (SPEED_CAP - BASE_SPEED)
    velBar.style.width = `${Math.max(0, Math.round(fill * 100))}%`
  }

  function toast(text, tone) {
    toastEl.textContent = text
    toastEl.className = tone
    retrigger(toastEl, 'show')
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), TOAST_MS)
  }

  /** Brief white-hot score colour on a near miss. */
  function hot() {
    scoreEl.classList.add('hot')
    clearTimeout(hotTimer)
    hotTimer = setTimeout(() => scoreEl.classList.remove('hot'), HOT_MS)
  }

  return { setScore, setExtract, setBest, clearBeat, setLives, setSpeed, toast, hot }
}

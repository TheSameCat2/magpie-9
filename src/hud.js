export function createHud() {
  const scoreEl = document.getElementById('score')
  const bestEl = document.getElementById('best')
  const center = document.getElementById('center')
  const title = document.getElementById('title')
  const prompt = document.getElementById('prompt')
  const sub = document.getElementById('sub')
  const velEl = document.querySelector('#vel b')
  const velBar = document.querySelector('#velBar i')
  const toastEl = document.getElementById('toast')

  let toastTimer = 0
  let hotTimer = 0

  function retrigger(el, cls) {
    el.classList.remove(cls)
    void el.offsetWidth
    el.classList.add(cls)
  }

  function setScore(n, animate) {
    scoreEl.textContent = String(n)
    if (animate) retrigger(scoreEl, 'pop')
  }

  function setBest(n, beat) {
    bestEl.textContent = `BEST ${n}`
    bestEl.classList.toggle('beat', !!beat)
  }

  function setSpeed(speed) {
    velEl.textContent = speed.toFixed(1)
    velBar.style.width = `${Math.round(((speed - 12) / 10) * 100)}%`
  }

  function toast(text, tone) {
    toastEl.textContent = text
    toastEl.className = tone
    retrigger(toastEl, 'show')
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1200)
  }

  // Brief white-hot score colour on a near miss.
  function hot() {
    scoreEl.classList.add('hot')
    clearTimeout(hotTimer)
    hotTimer = setTimeout(() => scoreEl.classList.remove('hot'), 450)
  }

  function showTitle() {
    center.classList.remove('hidden')
    center.classList.remove('dead')
    retrigger(center, 'rise')
    title.innerHTML = 'MAGPIE<span>-9</span>'
    prompt.textContent = 'FLAP TO ARM'
    sub.textContent = 'SPACE / CLICK · A D STRAFE'
  }

  function showPlaying() {
    center.classList.add('hidden')
    bestEl.classList.remove('beat')
  }

  function showDead(score, newBest) {
    center.classList.remove('hidden')
    center.classList.add('dead')
    retrigger(center, 'rise')
    title.innerHTML = 'REBOOT'
    prompt.textContent = newBest ? `NEW BEST ${score}` : `RUN ${score}`
    sub.textContent = 'SPACE TO RESET'
  }

  return { setScore, setBest, setSpeed, toast, hot, showTitle, showPlaying, showDead }
}

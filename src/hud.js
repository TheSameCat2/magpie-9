import { STICK_RANGE } from './input.js'
import { rotateFsAction } from './screen.js'

const TAP_MS = 280

export function createHud() {
  const scoreEl = document.getElementById('score')
  const bestEl = document.getElementById('best')
  const livesEl = document.getElementById('lives')
  const center = document.getElementById('center')
  const title = document.getElementById('title')
  const prompt = document.getElementById('prompt')
  const sub = document.getElementById('sub')
  const velEl = document.querySelector('#vel b')
  const velBar = document.querySelector('#velBar i')
  const toastEl = document.getElementById('toast')
  const keysEl = document.getElementById('keys')
  const zonesEl = document.getElementById('zones')
  const sysEl = document.getElementById('sys')
  const stickEl = document.querySelector('#touch .stick')
  const nubEl = document.querySelector('#touch .stick-nub')
  const tapEl = document.querySelector('#touch .tapring')
  const rotateEl = document.getElementById('rotate')
  const pausedEl = document.getElementById('paused')
  const respawnEl = document.getElementById('respawn')
  const muteBtn = document.getElementById('btnMute')
  const fsBtn = document.getElementById('btnFs')
  const rotateFsBtn = document.getElementById('btnRotateFs')
  const rotateFsHint = document.getElementById('rotateFsHint')

  let toastTimer = 0
  let hotTimer = 0
  let mode = 'keys'
  let scene = 'title'
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  function retrigger(el, cls) {
    el.classList.remove(cls)
    void el.offsetWidth
    el.classList.add(cls)
  }

  function applyChrome() {
    document.body.dataset.input = mode
    keysEl.classList.toggle('hidden', mode === 'touch')
    zonesEl.classList.toggle('hidden', mode !== 'touch' || scene !== 'title')
    sysEl.classList.toggle('playing', scene === 'playing' || scene === 'respawn')
    if (scene === 'title') {
      sub.textContent = mode === 'touch' ? 'TAP RIGHT · FLAP   DRAG LEFT · STRAFE' : 'SPACE / CLICK · A D STRAFE'
    } else if (scene === 'dead') {
      sub.textContent = mode === 'touch' ? 'TAP TO RESET' : 'SPACE TO RESET'
    }
  }

  function setScore(n, animate) {
    scoreEl.textContent = String(n)
    if (animate) retrigger(scoreEl, 'pop')
  }

  function setBest(n, beat) {
    bestEl.textContent = `BEST ${n}`
    bestEl.classList.toggle('beat', !!beat)
  }

  function setLives(n, animate) {
    const extras = Math.max(0, n - 1)
    livesEl.replaceChildren()
    for (let i = 0; i < extras; i++) {
      const glyph = document.createElement('span')
      glyph.textContent = '+'
      livesEl.appendChild(glyph)
    }
    livesEl.classList.toggle('hidden', extras <= 0)
    if (animate && extras > 0) retrigger(livesEl, 'pop')
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
    scene = 'title'
    center.classList.remove('hidden')
    center.classList.remove('dead')
    retrigger(center, 'rise')
    title.innerHTML = 'MAGPIE<span>-9</span>'
    prompt.textContent = 'FLAP TO ARM'
    applyChrome()
  }

  function showPlaying() {
    scene = 'playing'
    center.classList.add('hidden')
    bestEl.classList.remove('beat')
    applyChrome()
  }

  function showDead(score, newBest) {
    scene = 'dead'
    center.classList.remove('hidden')
    center.classList.add('dead')
    retrigger(center, 'rise')
    title.innerHTML = 'REBOOT'
    prompt.textContent = newBest ? `NEW BEST ${score}` : `RUN ${score}`
    applyChrome()
  }

  function setInputMode(next) {
    mode = next
    applyChrome()
  }

  function updateTouch(input) {
    const s = input.stick
    if (mode === 'touch' && s.active) {
      stickEl.classList.remove('hidden')
      stickEl.style.transform = `translate(${s.originX}px, ${s.originY}px)`
      const dx = Math.max(-STICK_RANGE, Math.min(STICK_RANGE, s.dx))
      nubEl.style.transform = `translate(calc(-50% + ${dx}px), -50%)`
    } else {
      stickEl.classList.add('hidden')
    }

    const tap = input.lastTap
    const age = tap.at ? performance.now() - tap.at : TAP_MS + 1
    if (mode === 'touch' && age < TAP_MS) {
      tapEl.classList.remove('hidden')
      tapEl.style.transform = `translate(${tap.x}px, ${tap.y}px)`
      tapEl.style.opacity = reduceMotion ? '1' : String(1 - age / TAP_MS)
    } else {
      tapEl.classList.add('hidden')
    }
  }

  function setRotate(show) {
    rotateEl.classList.toggle('hidden', !show)
  }

  function showPaused(reason) {
    pausedEl.classList.toggle('hidden', reason !== 'resume')
  }

  function hidePaused() {
    pausedEl.classList.add('hidden')
  }

  function showRespawn() {
    scene = 'respawn'
    respawnEl.classList.remove('hidden')
    applyChrome()
  }

  function hideRespawn() {
    respawnEl.classList.add('hidden')
    if (scene === 'respawn') {
      scene = 'playing'
      applyChrome()
    }
  }

  function setMuted(muted) {
    muteBtn.setAttribute('aria-pressed', muted ? 'true' : 'false')
    muteBtn.setAttribute('aria-label', muted ? 'Unmute' : 'Mute')
    muteBtn.classList.toggle('on', !!muted)
    muteBtn.querySelector('.label').textContent = muted ? 'UNMUTE' : 'MUTE'
  }

  function setFullscreen(active, supported, standalone = false) {
    fsBtn.classList.toggle('hidden', !supported)
    fsBtn.setAttribute('aria-pressed', active ? 'true' : 'false')
    fsBtn.setAttribute('aria-label', active ? 'Exit fullscreen' : 'Enter fullscreen')
    fsBtn.classList.toggle('on', !!active)
    fsBtn.querySelector('.label').textContent = active ? 'EXIT' : 'FULL'

    const action = rotateFsAction({ supportsFullscreen: supported, standalone })
    rotateFsBtn.classList.toggle('hidden', action !== 'button')
    rotateFsHint.classList.toggle('hidden', action !== 'hint')
    rotateFsBtn.setAttribute('aria-pressed', active ? 'true' : 'false')
    rotateFsBtn.setAttribute('aria-label', active ? 'Exit fullscreen' : 'Enter fullscreen')
    rotateFsBtn.classList.toggle('on', !!active)
    rotateFsBtn.querySelector('.label').textContent = active ? 'EXIT FULLSCREEN' : 'ENTER FULLSCREEN'
  }

  function bindSys({ onMute, onFullscreen }) {
    function wire(btn, fn) {
      btn.addEventListener('pointerdown', (e) => {
        e.stopPropagation()
        e.preventDefault()
        fn?.()
      })
    }
    wire(muteBtn, onMute)
    wire(fsBtn, onFullscreen)
    wire(rotateFsBtn, onFullscreen)
  }

  return {
    setScore,
    setBest,
    setLives,
    setSpeed,
    toast,
    hot,
    showTitle,
    showPlaying,
    showDead,
    setInputMode,
    updateTouch,
    setRotate,
    showPaused,
    hidePaused,
    showRespawn,
    hideRespawn,
    setMuted,
    setFullscreen,
    bindSys,
  }
}

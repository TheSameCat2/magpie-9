import { STICK_RANGE } from './input.js'
import { rotateFsAction } from './screen.js'

const TAP_MS = 280

export const MENU_ITEMS = ['new', 'tutorial', 'help', 'credits']

/** Move a menu highlight by `dir` rows, wrapping at both ends. */
export function stepMenu(index, dir, n = MENU_ITEMS.length) {
  if (n <= 0) return 0
  return (((index + dir) % n) + n) % n
}

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
  const menuEl = document.getElementById('menu')
  const menuBtns = Array.from(menuEl.querySelectorAll('button'))
  const helpEl = document.getElementById('help')
  const creditsEl = document.getElementById('credits')
  const lessonEl = document.getElementById('lesson')
  const lessonBlocks = Array.from(lessonEl.querySelectorAll('.lesson'))
  const backBtns = Array.from(document.querySelectorAll('.screen .back'))
  const exitBtn = document.getElementById('exit')
  const tutorialTag = document.getElementById('tutorialTag')

  let toastTimer = 0
  let hotTimer = 0
  let mode = 'keys'
  let scene = 'menu'
  let gameMode = 'run'
  let menuIndex = 0
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  function retrigger(el, cls) {
    el.classList.remove(cls)
    void el.offsetWidth
    el.classList.add(cls)
  }

  function applyChrome() {
    document.body.dataset.input = mode
    document.body.dataset.mode = gameMode
    const inRun = scene === 'playing' || scene === 'respawn'
    keysEl.classList.toggle('hidden', mode === 'touch')
    zonesEl.classList.toggle('hidden', mode !== 'touch' || scene !== 'menu')
    sysEl.classList.toggle('playing', inRun)
    exitBtn.classList.toggle('hidden', !(inRun && gameMode === 'tutorial'))
    tutorialTag.classList.toggle('hidden', !(inRun && gameMode === 'tutorial'))
    if (scene === 'menu') {
      sub.textContent = mode === 'touch' ? 'TAP TO SELECT' : '↑ ↓ SELECT · ENTER'
    } else if (scene === 'dead') {
      sub.textContent = mode === 'touch' ? 'TAP FOR MENU' : 'SPACE FOR MENU'
    }
  }

  function setMenuIndex(i) {
    menuIndex = stepMenu(i, 0, menuBtns.length)
    menuBtns.forEach((b, k) => b.classList.toggle('sel', k === menuIndex))
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
    velBar.style.width = `${Math.max(0, Math.round(((speed - 12) / 10) * 100))}%`
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

  function hideScreens() {
    helpEl.classList.add('hidden')
    creditsEl.classList.add('hidden')
  }

  function showMenu() {
    scene = 'menu'
    hideScreens()
    hideLesson()
    center.classList.remove('hidden')
    center.classList.remove('dead')
    retrigger(center, 'rise')
    title.innerHTML = 'MAGPIE<span>-9</span>'
    menuEl.classList.remove('hidden')
    prompt.classList.add('hidden')
    setMenuIndex(menuIndex)
    applyChrome()
  }

  function showHelp() {
    scene = 'help'
    center.classList.add('hidden')
    creditsEl.classList.add('hidden')
    helpEl.classList.remove('hidden')
    applyChrome()
  }

  function showCredits() {
    scene = 'credits'
    center.classList.add('hidden')
    helpEl.classList.add('hidden')
    creditsEl.classList.remove('hidden')
    applyChrome()
  }

  function showPlaying() {
    scene = 'playing'
    center.classList.add('hidden')
    hideScreens()
    bestEl.classList.remove('beat')
    applyChrome()
  }

  function showDead(score, newBest) {
    scene = 'dead'
    center.classList.remove('hidden')
    center.classList.add('dead')
    retrigger(center, 'rise')
    menuEl.classList.add('hidden')
    prompt.classList.remove('hidden')
    if (gameMode === 'tutorial') {
      title.innerHTML = 'TUTORIAL'
      prompt.textContent = 'SESSION ENDED'
    } else {
      title.innerHTML = 'REBOOT'
      prompt.textContent = newBest ? `NEW BEST ${score}` : `RUN ${score}`
    }
    applyChrome()
  }

  function showLesson(type) {
    for (const block of lessonBlocks) block.classList.toggle('hidden', block.dataset.lesson !== type)
    lessonEl.classList.remove('hidden')
  }

  function hideLesson() {
    lessonEl.classList.add('hidden')
  }

  function setGameMode(next) {
    gameMode = next
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

  // Menu / screen buttons do not stop propagation: input.js already ignores
  // pointerdown on buttons, and letting it through unlocks audio on the gesture.
  function bindMenu({ onSelect, onBack, onExit }) {
    menuBtns.forEach((btn, i) => {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault()
        setMenuIndex(i)
        onSelect?.(btn.dataset.item)
      })
    })
    for (const btn of backBtns) {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault()
        onBack?.()
      })
    }
    exitBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      onExit?.()
    })
  }

  return {
    setScore,
    setBest,
    setLives,
    setSpeed,
    toast,
    hot,
    showMenu,
    showHelp,
    showCredits,
    showPlaying,
    showDead,
    showLesson,
    hideLesson,
    setGameMode,
    bindMenu,
    moveMenu(dir) {
      setMenuIndex(stepMenu(menuIndex, dir, menuBtns.length))
    },
    get menuItem() {
      return menuBtns[menuIndex]?.dataset.item ?? MENU_ITEMS[0]
    },
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

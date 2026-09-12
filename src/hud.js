import { STICK_RANGE } from './input.js'
import { rotateFsAction } from './screen.js'

const TAP_MS = 280

export const MENU_ITEMS = ['new', 'tutorial', 'scores', 'help', 'credits']

/** Copy for the hold overlay. `begin` is a fresh run; `resume` is after an interrupt. */
export function pauseCopy(reason) {
  if (reason === 'begin') return { title: 'JUMP TO BEGIN', sub: '' }
  if (reason === 'resume') return { title: 'PAUSED', sub: 'JUMP TO RESUME' }
  return null
}

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
  const pausedTitle = pausedEl.querySelector('.overlay-title')
  const pausedSub = pausedEl.querySelector('.overlay-sub')
  const respawnEl = document.getElementById('respawn')
  const muteBtn = document.getElementById('btnMute')
  const fsBtn = document.getElementById('btnFs')
  const rotateFsBtn = document.getElementById('btnRotateFs')
  const rotateFsHint = document.getElementById('rotateFsHint')
  const menuEl = document.getElementById('menu')
  const menuBtns = Array.from(menuEl.querySelectorAll('button'))
  const helpEl = document.getElementById('help')
  const helpBtn = document.getElementById('btnHelp')
  const helpCloseBtn = document.getElementById('btnHelpClose')
  const creditsEl = document.getElementById('credits')
  const scoresEl = document.getElementById('scores')
  const scoresList = document.getElementById('scoresList')
  const scoresStatus = document.getElementById('scoresStatus')
  const entryEl = document.getElementById('entry')
  const entrySlots = Array.from(entryEl.querySelectorAll('.slot'))
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
  let helpOpen = false
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
    helpCloseBtn.querySelector('.label').textContent = mode === 'touch' ? 'CLOSE' : 'CLOSE · ESC'
    if (scene === 'menu') {
      sub.textContent = mode === 'touch' ? 'TAP TO SELECT' : '↑ ↓ SELECT · ENTER · H HELP'
    } else if (scene === 'dead') {
      sub.textContent = mode === 'touch' ? 'TAP FOR MENU' : 'SPACE FOR MENU'
    } else if (scene === 'entry') {
      sub.textContent = mode === 'touch' ? 'TAP ARROWS · ENTER' : 'TYPE OR ↑ ↓ · ENTER'
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
    hideHelp()
    creditsEl.classList.add('hidden')
    scoresEl.classList.add('hidden')
  }

  function hideEntry() {
    entryEl.classList.add('hidden')
  }

  function renderEntry(entry) {
    entrySlots.forEach((slot, i) => {
      slot.classList.toggle('sel', i === entry.cursor)
      slot.querySelector('b').textContent = entry.chars[i]
    })
  }

  function showEntry(score, rank, entry) {
    scene = 'entry'
    hideScreens()
    center.classList.remove('hidden')
    center.classList.add('dead')
    retrigger(center, 'rise')
    menuEl.classList.add('hidden')
    prompt.classList.remove('hidden')
    title.innerHTML = 'REBOOT'
    prompt.textContent = `RUN ${score} · RANK #${rank}`
    entryEl.classList.remove('hidden')
    renderEntry(entry)
    applyChrome()
  }

  function renderScores(board, rank) {
    scoresList.replaceChildren()
    for (let i = 0; i < 10; i++) {
      const row = document.createElement('li')
      const item = board?.[i]
      row.classList.toggle('you', rank === i + 1)
      const place = document.createElement('span')
      place.className = 'rank'
      place.textContent = String(i + 1).padStart(2, '0')
      const name = document.createElement('span')
      name.className = 'initials'
      name.textContent = item ? item.initials : '---'
      const pts = document.createElement('span')
      pts.className = 'pts'
      pts.textContent = item ? String(item.score) : '---'
      row.append(place, name, pts)
      scoresList.appendChild(row)
    }
  }

  function showScores(board, rank, status) {
    scene = 'scores'
    hideScreens()
    hideEntry()
    center.classList.add('hidden')
    scoresEl.classList.remove('hidden')
    const label = status || ''
    scoresStatus.textContent = label
    scoresStatus.classList.toggle('hidden', !label)
    renderScores(board, rank)
    applyChrome()
  }

  function showMenu() {
    scene = 'menu'
    hideScreens()
    hideLesson()
    hideEntry()
    center.classList.remove('hidden')
    center.classList.remove('dead')
    retrigger(center, 'rise')
    title.innerHTML = 'MAGPIE<span>-9</span>'
    menuEl.classList.remove('hidden')
    prompt.classList.add('hidden')
    setMenuIndex(menuIndex)
    applyChrome()
  }

  function showCredits() {
    scene = 'credits'
    hideScreens()
    hideEntry()
    center.classList.add('hidden')
    creditsEl.classList.remove('hidden')
    applyChrome()
  }

  // The field manual is a modal over whatever scene is showing (menu or reboot),
  // not a scene of its own.
  function showHelp() {
    if (helpOpen) return
    helpOpen = true
    document.body.classList.add('help-open')
    helpEl.classList.remove('hidden')
    retrigger(helpEl, 'rise')
    helpEl.scrollTop = 0
    helpEl.querySelector('.help-card').scrollTop = 0
    helpBtn.setAttribute('aria-expanded', 'true')
    helpCloseBtn.focus({ preventScroll: true })
  }

  function hideHelp() {
    if (!helpOpen) return
    helpOpen = false
    document.body.classList.remove('help-open')
    helpEl.classList.add('hidden')
    helpBtn.setAttribute('aria-expanded', 'false')
    if (document.activeElement === helpCloseBtn) helpBtn.focus({ preventScroll: true })
  }

  function toggleHelp() {
    if (helpOpen) hideHelp()
    else showHelp()
  }

  function showPlaying() {
    scene = 'playing'
    center.classList.add('hidden')
    hideScreens()
    hideEntry()
    bestEl.classList.remove('beat')
    applyChrome()
  }

  function showDead(score, newBest) {
    scene = 'dead'
    center.classList.remove('hidden')
    center.classList.add('dead')
    retrigger(center, 'rise')
    hideEntry()
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
    const copy = pauseCopy(reason)
    if (!copy) {
      pausedEl.classList.add('hidden')
      return
    }
    pausedTitle.textContent = copy.title
    pausedSub.textContent = copy.sub
    pausedSub.classList.toggle('hidden', !copy.sub)
    pausedEl.classList.remove('hidden')
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

  function bindSys({ onMute, onFullscreen, onHelp }) {
    function wire(btn, fn) {
      btn.addEventListener('pointerdown', (e) => {
        e.stopPropagation()
        e.preventDefault()
        fn?.()
      })
      // Keyboard activation (Enter on a focused button) arrives as a click with detail 0.
      btn.addEventListener('click', (e) => {
        if (e.detail === 0) fn?.()
      })
    }
    wire(muteBtn, onMute)
    wire(fsBtn, onFullscreen)
    wire(rotateFsBtn, onFullscreen)
    wire(helpBtn, onHelp)
    wire(helpCloseBtn, onHelp)
    // Pointers inside the manual must never reach the game's window listeners
    // (a tap there would arm a run). A tap on the dimmed backdrop closes it;
    // taps on the card are swallowed so the card can scroll.
    helpEl.addEventListener('pointerdown', (e) => {
      e.stopPropagation()
      if (e.target === helpEl) onHelp?.()
    })
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

  function bindEntry({ onAction }) {
    entryEl.addEventListener('pointerdown', (e) => {
      const btn = e.target.closest('[data-entry]')
      if (!btn) return
      e.preventDefault()
      e.stopPropagation()
      if (btn.dataset.entry === 'select') onAction?.('select')
      else onAction?.({ slot: Number(btn.dataset.slot), dir: Number(btn.dataset.dir) })
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
    showCredits,
    showPlaying,
    showDead,
    showEntry,
    hideEntry,
    renderEntry,
    showScores,
    bindEntry,
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
    showHelp,
    hideHelp,
    toggleHelp,
    setMuted,
    setFullscreen,
    bindSys,
    get helpOpen() {
      return helpOpen
    },
  }
}

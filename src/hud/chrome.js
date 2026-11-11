// Persistent chrome: the system buttons (mute / fullscreen), the pause and
// exit buttons, the tutorial tag, and the control hint. `refresh()` derives
// what is visible from the shared HUD state and is called after every change.

import { rotateFsAction } from '../platform/screen.js'
import { byId, onPress, query, setToggleButton, setVisible } from './dom.js'
import { keysHint, lessonHint, pauseCopy, sceneHint, screenHint } from './copy.js'

export function createChrome(state, { help }) {
  const centerEl = byId('center')
  const sub = byId('sub')
  const scoreEl = byId('score')
  const scoreLabelEl = byId('scoreLabel')
  const bestEl = byId('best')
  const livesEl = byId('lives')
  const velEl = byId('vel')
  const keysEl = byId('keys')
  const zonesEl = byId('zones')
  const sysEl = byId('sys')
  const pauseBtn = byId('pause')
  const exitBtn = byId('exit')
  const tutorialTag = byId('tutorialTag')
  const lessonTap = byId('lessonTap')
  const creditsEl = byId('credits')
  const settingsEl = byId('settings')
  const scoresEl = byId('scores')
  const lessonEl = byId('lesson')
  const pausedEl = byId('paused')
  const pausedSub = query('.overlay-sub', pausedEl)
  const respawnEl = byId('respawn')
  const rotateEl = byId('rotate')
  const helpEl = byId('help')
  const muteBtn = byId('btnMute')
  const fsBtn = byId('btnFs')
  const rotateFsBtn = byId('btnRotateFs')
  const rotateFsHint = byId('rotateFsHint')

  const backgroundEls = [
    centerEl,
    sysEl,
    pauseBtn,
    scoreEl,
    scoreLabelEl,
    bestEl,
    livesEl,
    velEl,
    keysEl,
    tutorialTag,
  ]

  tutorialTag.textContent = 'TUTORIAL'

  function refresh() {
    const { scene, inputMode, gameMode, held } = state
    const touch = inputMode === 'touch'
    const inRun = scene === 'playing' || scene === 'respawn'
    const inTutorialRun = inRun && gameMode === 'tutorial'

    document.body.dataset.input = inputMode
    document.body.dataset.mode = gameMode
    setVisible(keysEl, !touch)
    setVisible(zonesEl, touch && scene === 'menu')
    sysEl.classList.toggle('playing', inRun)
    // PAUSE only while the sim is actually running: gone under any hold, respawn, or screen.
    setVisible(pauseBtn, scene === 'playing' && !held)
    setVisible(exitBtn, inTutorialRun)
    setVisible(tutorialTag, inTutorialRun)
    help.setInputMode(inputMode)

    const hint = sceneHint(scene, inputMode)
    if (hint != null) sub.textContent = hint
    keysEl.textContent = keysHint(scene)
    lessonTap.textContent = lessonHint(inputMode)
    const back = screenHint(scene, inputMode)
    const backEl = back != null ? document.querySelector(`#${scene} .back-hint`) : null
    if (backEl) backEl.textContent = back
    // Begin hint follows the input device even if the hold was already showing.
    if (!pausedEl.classList.contains('hidden') && pausedEl.dataset.reason === 'begin') {
      pausedSub.textContent = pauseCopy('begin', 0, inputMode).sub
    }

    const rotateOpen = !rotateEl.classList.contains('hidden')
    const helpOpen = help.open || !helpEl.classList.contains('hidden')
    const creditsOpen = !creditsEl.classList.contains('hidden')
    const settingsOpen = !settingsEl.classList.contains('hidden')
    const scoresOpen = !scoresEl.classList.contains('hidden')
    const pauseMenuOpen = !pausedEl.classList.contains('hidden') && pausedEl.dataset.reason === 'menu'
    const lessonOpen = !lessonEl.classList.contains('hidden')

    const hardModal = rotateOpen || helpOpen || creditsOpen || settingsOpen || scoresOpen || pauseMenuOpen
    const anyModal = hardModal || lessonOpen

    for (const el of backgroundEls) el.inert = anyModal
    // Tutorial lessons keep #exit active so the player can leave for the menu from a lesson card.
    exitBtn.inert = hardModal

    rotateEl.inert = false
    helpEl.inert = rotateOpen
    const underOverlayInert = rotateOpen || helpOpen
    creditsEl.inert = underOverlayInert
    settingsEl.inert = underOverlayInert
    scoresEl.inert = underOverlayInert
    lessonEl.inert = underOverlayInert || pauseMenuOpen
    pausedEl.inert = underOverlayInert
    respawnEl.inert = anyModal
  }

  help.onChange(refresh)

  function setMuted(muted) {
    setToggleButton(muteBtn, {
      pressed: muted,
      ariaLabel: 'Mute',
      text: 'MUTE',
    })
  }

  function setFullscreen(active, supported, standalone = false) {
    setVisible(fsBtn, supported)
    setToggleButton(fsBtn, {
      pressed: active,
      ariaLabel: 'Full screen',
      text: 'FULL',
    })

    const action = rotateFsAction({ supportsFullscreen: supported, standalone })
    setVisible(rotateFsBtn, action === 'button')
    setVisible(rotateFsHint, action === 'hint')
    setToggleButton(rotateFsBtn, {
      pressed: active,
      ariaLabel: 'Fullscreen',
      text: 'FULLSCREEN',
    })
    if (
      !rotateEl.classList.contains('hidden') &&
      action === 'button' &&
      document.activeElement === rotateEl
    ) {
      rotateFsBtn.focus({ preventScroll: true })
    }
  }

  // System buttons swallow the pointer so a tap never doubles as a flap.
  function bindSys({ onMute, onFullscreen, onHelp }) {
    onPress(muteBtn, onMute, { stopPropagation: true })
    onPress(fsBtn, onFullscreen, { stopPropagation: true })
    onPress(rotateFsBtn, onFullscreen, { stopPropagation: true })
    help.bind({ onToggle: onHelp })
  }

  return { refresh, setMuted, setFullscreen, bindSys }
}

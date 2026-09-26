// Persistent chrome: the system buttons (mute / fullscreen), the pause and
// exit buttons, the tutorial tag, and the control hint. `refresh()` derives
// what is visible from the shared HUD state and is called after every change.

import { rotateFsAction } from '../platform/screen.js'
import { byId, onPress, query, setToggleButton, setVisible } from './dom.js'
import { keysHint, lessonHint, pauseCopy, sceneHint, screenHint } from './copy.js'

export function createChrome(state, { help }) {
  const sub = byId('sub')
  const keysEl = byId('keys')
  const zonesEl = byId('zones')
  const sysEl = byId('sys')
  const pauseBtn = byId('pause')
  const exitBtn = byId('exit')
  const tutorialTag = byId('tutorialTag')
  const lessonTap = byId('lessonTap')
  const pausedEl = byId('paused')
  const pausedSub = query('.overlay-sub', pausedEl)
  const muteBtn = byId('btnMute')
  const fsBtn = byId('btnFs')
  const rotateFsBtn = byId('btnRotateFs')
  const rotateFsHint = byId('rotateFsHint')

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
  }

  function setMuted(muted) {
    setToggleButton(muteBtn, {
      pressed: muted,
      ariaLabel: muted ? 'Unmute' : 'Mute',
      text: muted ? 'UNMUTE' : 'MUTE',
    })
  }

  function setFullscreen(active, supported, standalone = false) {
    setVisible(fsBtn, supported)
    setToggleButton(fsBtn, {
      pressed: active,
      ariaLabel: active ? 'Exit fullscreen' : 'Enter fullscreen',
      text: active ? 'EXIT' : 'FULL',
    })

    const action = rotateFsAction({ supportsFullscreen: supported, standalone })
    setVisible(rotateFsBtn, action === 'button')
    setVisible(rotateFsHint, action === 'hint')
    setToggleButton(rotateFsBtn, {
      pressed: active,
      ariaLabel: active ? 'Exit fullscreen' : 'Enter fullscreen',
      text: active ? 'EXIT FULLSCREEN' : 'ENTER FULLSCREEN',
    })
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

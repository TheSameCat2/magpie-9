// The HUD facade. Each panel owns its own DOM; they share one small state
// record (scene, input device, game mode, hold) that chrome.refresh() reads.

import { createChrome } from './chrome.js'
import { createHelp } from './help.js'
import { createOverlays } from './overlays.js'
import { createReadouts } from './readouts.js'
import { createScreens } from './screens.js'
import { createTouchGizmos } from './touch.js'

export { MENU_ITEMS, pauseCopy, stepMenu } from './copy.js'

export function createHud() {
  const state = { scene: 'menu', inputMode: 'keys', gameMode: 'run', held: false }

  const help = createHelp()
  const chrome = createChrome(state, { help })
  const refresh = chrome.refresh
  const readouts = createReadouts()
  const screens = createScreens(state, { refresh, help })
  const overlays = createOverlays(state, { refresh })
  const touch = createTouchGizmos(state)

  function setGameMode(gameMode) {
    state.gameMode = gameMode
    refresh()
  }

  function setInputMode(inputMode) {
    state.inputMode = inputMode
    refresh()
  }

  function showPlaying() {
    readouts.clearBeat()
    screens.showPlaying()
  }

  return {
    ...readouts,
    ...screens,
    ...overlays,
    showPlaying,
    setGameMode,
    setInputMode,
    setMuted: chrome.setMuted,
    setFullscreen: chrome.setFullscreen,
    bindSys: chrome.bindSys,
    updateTouch: touch.update,
    showHelp: help.showHelp,
    hideHelp: help.hideHelp,
    toggleHelp: help.toggleHelp,
    get menuItem() {
      return screens.menuItem
    },
    get helpOpen() {
      return help.open
    },
  }
}

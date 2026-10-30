// Electron shell. Serves the Vite build on magpie://app and does not import
// the game. Security defaults are set explicitly so a later edit cannot
// "simplify" them back to the old insecure recipe.

import { app, BrowserWindow, Menu, ipcMain, session } from 'electron'
// electron-updater is CommonJS. A named import crashes the packaged main
// process: Node does not treat autoUpdater as a static named export.
import electronUpdater from 'electron-updater'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { APP_ORIGIN, isAppUrl, sanitizeApiOrigin } from './files.js'
import { registerScheme, handleScheme, rendererRoot } from './protocol.js'
import {
  UPDATE_LATER_CHANNEL,
  UPDATE_READY,
  UPDATE_RESTART_CHANNEL,
  isPortableEnv,
  shouldCheckForUpdates,
} from './updates.js'

const { autoUpdater } = electronUpdater

const here = path.dirname(fileURLToPath(import.meta.url))

registerScheme()
app.enableSandbox()

const apiOrigin = sanitizeApiOrigin(process.env.MAGPIE_API_ORIGIN)
const devServer = sanitizeDevServer(process.env.MAGPIE_DEV_SERVER)

let mainWindow = null

function sanitizeDevServer(raw) {
  if (!raw) return ''
  try {
    const url = new URL(raw)
    const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
    if (url.protocol === 'http:' && loopback) return url.origin
  } catch {
    /* ignore */
  }
  console.error('MAGPIE_DEV_SERVER must be an http://localhost origin; ignoring it')
  return ''
}

function allowedNavigation(raw) {
  if (isAppUrl(raw)) return true
  if (!devServer) return false
  try {
    return new URL(raw).origin === devServer
  } catch {
    return false
  }
}

function installGuards() {
  const ses = session.defaultSession
  const allow = new Set(['fullscreen', 'pointerLock'])
  ses.setPermissionCheckHandler((_wc, permission) => allow.has(permission))
  ses.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(allow.has(permission))
  })
}

function lockNavigation(contents) {
  contents.on('will-navigate', (event, url) => {
    if (!allowedNavigation(url)) event.preventDefault()
  })
  contents.on('will-redirect', (event, url) => {
    if (!allowedNavigation(url)) event.preventDefault()
  })
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  contents.on('will-attach-webview', (event) => {
    event.preventDefault()
  })
  contents.on('render-process-gone', (_event, details) => {
    console.error('renderer gone:', details.reason)
  })
}

function sendFocus(win, focused) {
  if (!win || win.isDestroyed()) return
  win.webContents.send('magpie:focus', focused)
}

function watchFocus(win) {
  win.on('blur', () => sendFocus(win, false))
  win.on('focus', () => sendFocus(win, true))
  win.on('minimize', () => sendFocus(win, false))
  win.on('hide', () => sendFocus(win, false))
  win.on('restore', () => sendFocus(win, win.isFocused()))
  win.on('show', () => sendFocus(win, win.isFocused()))
  win.webContents.on('did-finish-load', () => sendFocus(win, win.isFocused()))
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 540,
    useContentSize: true,
    show: false,
    backgroundColor: '#07080c',
    title: 'MAGPIE-9',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(here, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      webviewTag: false,
      // Origin is not a secret. additionalArguments is how a sandboxed
      // preload reads boot config without an IPC channel.
      additionalArguments: [`--magpie-api-origin=${apiOrigin}`],
    },
  })

  lockNavigation(win.webContents)
  watchFocus(win)
  win.once('ready-to-show', () => win.show())

  if (devServer) {
    win.loadURL(devServer)
  } else {
    win.loadURL(`${APP_ORIGIN}/index.html`)
  }

  if (process.env.MAGPIE_DEBUG === '1') win.webContents.openDevTools({ mode: 'detach' })
  return win
}

// One check after launch, for a packaged NSIS install only. The download
// stays in the background. Restart now is the only path that quits the
// process; Later leaves the run up and installs on the next quit.
function startUpdateCheck(win) {
  if (!shouldCheckForUpdates({ packaged: app.isPackaged, portable: isPortableEnv(process.env) })) return

  let ready = false
  let dismissed = false
  const notify = () => {
    if (!ready || dismissed || win.isDestroyed()) return
    win.webContents.send(UPDATE_READY)
  }

  ipcMain.on(UPDATE_LATER_CHANNEL, (event) => {
    if (event.sender !== win.webContents) return
    dismissed = true
  })
  ipcMain.on(UPDATE_RESTART_CHANNEL, (event) => {
    if (event.sender !== win.webContents) return
    autoUpdater.quitAndInstall(false, true)
  })

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('update-downloaded', () => {
    ready = true
    notify()
  })
  autoUpdater.on('error', (error) => {
    console.error('update check failed:', error instanceof Error ? error.message : String(error))
  })
  win.webContents.on('did-finish-load', notify)
  autoUpdater.checkForUpdates().catch(() => {})
}

function installMenu() {
  const view = [{ role: 'reload' }, { role: 'togglefullscreen' }]
  if (!app.isPackaged || process.env.MAGPIE_DEBUG === '1') {
    view.push({ type: 'separator' }, { role: 'toggleDevTools' })
  }
  const template = [
    {
      label: app.name,
      submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }],
    },
    { label: 'View', submenu: view },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(() => {
    ipcMain.handle('magpie:focused', (event) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      return !!win && !win.isDestroyed() && win.isFocused()
    })
    installGuards()
    if (!devServer) handleScheme(rendererRoot(), apiOrigin)
    installMenu()
    mainWindow = createWindow()
    startUpdateCheck(mainWindow)
  })

  app.on('window-all-closed', () => app.quit())
}

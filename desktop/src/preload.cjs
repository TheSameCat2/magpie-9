// Sandboxed preload. Exposes a frozen config object and one focus subscription.
// The page never sees ipcRenderer or the IPC event. The update bar is built
// in this world so a click can ask the shell to restart without handing the
// page a quit channel.

const { contextBridge, ipcRenderer } = require('electron')

const UPDATE_LABEL = 'Update available —'
const UPDATE_RESTART = 'Restart now'
const UPDATE_LATER = 'Later'
const UPDATE_READY = 'magpie:update-ready'
const UPDATE_RESTART_CHANNEL = 'magpie:update-restart'
const UPDATE_LATER_CHANNEL = 'magpie:update-later'

function arg(name) {
  const prefix = `--${name}=`
  const hit = process.argv.find((item) => item.startsWith(prefix))
  return hit ? hit.slice(prefix.length) : ''
}

function onFocus(callback) {
  if (typeof callback !== 'function') return () => {}
  const listener = (_event, focused) => callback(focused === true)
  ipcRenderer.on('magpie:focus', listener)
  ipcRenderer
    .invoke('magpie:focused')
    .then((focused) => callback(focused === true))
    .catch(() => {})
  return () => ipcRenderer.removeListener('magpie:focus', listener)
}

function promptButton(label, primary) {
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = label
  Object.assign(button.style, {
    margin: '0',
    padding: '6px 10px',
    border: primary ? '0' : '1px solid #2a3140',
    background: primary ? '#3de0ff' : 'transparent',
    color: primary ? '#07080c' : '#dce8f0',
    font: 'inherit',
    cursor: 'pointer',
  })
  return button
}

function showUpdatePrompt() {
  if (document.getElementById('magpie-update')) return
  const bar = document.createElement('div')
  bar.id = 'magpie-update'
  bar.setAttribute('role', 'status')
  // Assign CSSOM properties directly so strict style-src 'self' CSP permits the
  // banner without 'unsafe-inline'.
  Object.assign(bar.style, {
    position: 'fixed',
    left: '50%',
    bottom: '24px',
    transform: 'translateX(-50%)',
    zIndex: '8',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 8px 8px 14px',
    background: '#161a22',
    color: '#dce8f0',
    border: '1px solid #3de0ff',
    font: '600 14px/1.2 system-ui, sans-serif',
    pointerEvents: 'auto',
  })
  // The game treats a window pointerdown as a flap. Stopping it here keeps
  // the bar from starting a run or burning a flap.
  bar.addEventListener('pointerdown', (event) => event.stopPropagation())

  const label = document.createElement('span')
  label.textContent = UPDATE_LABEL
  const restart = promptButton(UPDATE_RESTART, true)
  const later = promptButton(UPDATE_LATER, false)
  restart.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    ipcRenderer.send(UPDATE_RESTART_CHANNEL)
  })
  later.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    bar.remove()
    ipcRenderer.send(UPDATE_LATER_CHANNEL)
  })
  bar.append(label, restart, later)
  ;(document.body || document.documentElement).append(bar)
}

ipcRenderer.on(UPDATE_READY, () => {
  if (document.body) showUpdatePrompt()
  else document.addEventListener('DOMContentLoaded', showUpdatePrompt, { once: true })
})

contextBridge.exposeInMainWorld(
  'magpieDesktop',
  Object.freeze({
    desktop: true,
    apiOrigin: arg('magpie-api-origin'),
    onFocus,
  }),
)

// Sandboxed preload. Exposes a frozen config object and one focus subscription.
// The page never sees ipcRenderer or the IPC event.

const { contextBridge, ipcRenderer } = require('electron')

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

contextBridge.exposeInMainWorld(
  'magpieDesktop',
  Object.freeze({
    desktop: true,
    apiOrigin: arg('magpie-api-origin'),
    onFocus,
  }),
)

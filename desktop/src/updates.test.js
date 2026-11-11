import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import {
  UPDATE_LABEL,
  UPDATE_LATER,
  UPDATE_LATER_CHANNEL,
  UPDATE_READY,
  UPDATE_RESTART,
  UPDATE_RESTART_CHANNEL,
  isPortableEnv,
  shouldCheckForUpdates,
} from './updates.js'

const here = path.dirname(fileURLToPath(import.meta.url))

function createStrictStyle() {
  const style = {}
  Object.defineProperty(style, 'cssText', {
    enumerable: false,
    get() {
      throw new Error('style.cssText is blocked by style-src CSP')
    },
    set() {
      throw new Error('style.cssText is blocked by style-src CSP')
    },
  })
  return style
}

function createFakeDom() {
  const byId = new Map()
  function makeElement(tagName) {
    const listeners = new Map()
    const attrs = new Map()
    const children = []
    let id = ''
    let parent = null
    const el = {
      tagName: tagName.toUpperCase(),
      type: '',
      textContent: '',
      children,
      style: createStrictStyle(),
      get id() {
        return id
      },
      set id(next) {
        if (id) byId.delete(id)
        id = String(next)
        if (id) byId.set(id, el)
      },
      setAttribute(name, value) {
        if (String(name).toLowerCase() === 'style') {
          throw new Error('inline style attribute is blocked by style-src CSP')
        }
        attrs.set(name, String(value))
      },
      getAttribute(name) {
        return attrs.get(name) ?? null
      },
      addEventListener(type, fn) {
        if (!listeners.has(type)) listeners.set(type, [])
        listeners.get(type).push(fn)
      },
      dispatch(type, event = {}) {
        for (const fn of listeners.get(type) ?? []) fn(event)
      },
      append(...nodes) {
        for (const node of nodes) {
          node.parentNode = el
          children.push(node)
        }
      },
      remove() {
        if (id) byId.delete(id)
        if (!parent) return
        const idx = parent.children.indexOf(el)
        if (idx !== -1) parent.children.splice(idx, 1)
        parent = null
      },
      set parentNode(next) {
        parent = next
      },
      get parentNode() {
        return parent
      },
    }
    return el
  }

  const body = makeElement('body')
  return {
    body,
    documentElement: body,
    createElement: makeElement,
    getElementById(id) {
      return byId.get(id) ?? null
    },
    addEventListener() {},
  }
}

test('updates are checked only for a packaged non-portable install', () => {
  assert.equal(shouldCheckForUpdates({ packaged: false, portable: false }), false)
  assert.equal(shouldCheckForUpdates({ packaged: false, portable: true }), false)
  assert.equal(shouldCheckForUpdates({ packaged: true, portable: true }), false)
  assert.equal(shouldCheckForUpdates({ packaged: true, portable: false }), true)
  assert.equal(isPortableEnv({}), false)
  assert.equal(isPortableEnv({ PORTABLE_EXECUTABLE_FILE: 'C:\\game.exe' }), true)
  assert.equal(isPortableEnv({ PORTABLE_EXECUTABLE_DIR: 'C:\\tmp' }), true)
})

test('the preload banner uses the same prompt copy and channels as the shell', () => {
  const preload = fs.readFileSync(path.join(here, 'preload.cjs'), 'utf8')
  const main = fs.readFileSync(path.join(here, 'main.js'), 'utf8')
  for (const text of [
    UPDATE_LABEL,
    UPDATE_RESTART,
    UPDATE_LATER,
    UPDATE_READY,
    UPDATE_RESTART_CHANNEL,
    UPDATE_LATER_CHANNEL,
  ]) {
    assert.ok(preload.includes(text), `preload missing ${text}`)
  }
  assert.doesNotMatch(preload, /\.cssText\b/)
  assert.doesNotMatch(preload, /setAttribute\(\s*['"]style['"]/i)
  assert.doesNotMatch(preload, /\b(innerHTML|outerHTML|insertAdjacentHTML)\b/)
  assert.match(main, /checkForUpdates\(/)
  assert.match(main, /quitAndInstall\(false, true\)/)
  assert.match(main, /autoDownload = true/)
  assert.match(main, /import electronUpdater from 'electron-updater'/)
  assert.match(main, /const \{ autoUpdater \} = electronUpdater/)
  assert.doesNotMatch(main, /import\s*\{[^}]*\}\s*from\s*'electron-updater'/)
  assert.doesNotMatch(main, /publisherName/)
  assert.doesNotMatch(preload, /contextBridge\.exposeInMainWorld\(\s*'magpieDesktop'[\s\S]*update/i)
})

test('preload builds a CSP-safe CSSOM update banner and preserves the frozen bridge', () => {
  const source = fs.readFileSync(path.join(here, 'preload.cjs'), 'utf8')
  const document = createFakeDom()
  const ipcListeners = new Map()
  const sent = []
  const exposed = {}

  const electronStub = {
    contextBridge: {
      exposeInMainWorld(name, value) {
        exposed[name] = value
      },
    },
    ipcRenderer: {
      on(channel, fn) {
        ipcListeners.set(channel, fn)
      },
      removeListener(channel, fn) {
        if (ipcListeners.get(channel) === fn) ipcListeners.delete(channel)
      },
      invoke() {
        return Promise.resolve(true)
      },
      send(channel) {
        sent.push(channel)
      },
    },
  }

  vm.runInNewContext(source, {
    require(specifier) {
      assert.equal(specifier, 'electron')
      return electronStub
    },
    process: { argv: ['electron', '--magpie-api-origin=https://magpie.nradavies.com'] },
    document,
    Object,
  })

  const bridge = exposed.magpieDesktop
  assert.ok(bridge)
  assert.equal(Object.isFrozen(bridge), true)
  assert.deepEqual(Object.keys(bridge).sort(), ['apiOrigin', 'desktop', 'onFocus'])
  assert.equal(bridge.desktop, true)
  assert.equal(bridge.apiOrigin, 'https://magpie.nradavies.com')
  assert.equal(typeof bridge.onFocus, 'function')

  ipcListeners.get(UPDATE_READY)()
  ipcListeners.get(UPDATE_READY)()
  assert.equal(document.body.children.length, 1)

  const bar = document.getElementById('magpie-update')
  assert.ok(bar)
  assert.equal(bar.getAttribute('role'), 'status')
  assert.equal(bar.style.position, 'fixed')
  assert.equal(bar.style.bottom, '24px')
  assert.equal(bar.style.transform, 'translateX(-50%)')
  assert.equal(bar.style.zIndex, '8')
  assert.equal(bar.style.display, 'flex')
  assert.equal(bar.style.pointerEvents, 'auto')

  let stopped = false
  bar.dispatch('pointerdown', {
    stopPropagation() {
      stopped = true
    },
  })
  assert.equal(stopped, true)

  const [label, restart, later] = bar.children
  assert.equal(label.textContent, UPDATE_LABEL)
  assert.equal(restart.textContent, UPDATE_RESTART)
  assert.equal(restart.style.background, '#3de0ff')
  assert.equal(restart.style.color, '#07080c')
  assert.equal(later.textContent, UPDATE_LATER)
  assert.equal(later.style.background, 'transparent')
  assert.equal(later.style.border, '1px solid #2a3140')

  restart.dispatch('click', { preventDefault() {}, stopPropagation() {} })
  assert.deepEqual(sent, [UPDATE_RESTART_CHANNEL])

  later.dispatch('click', { preventDefault() {}, stopPropagation() {} })
  assert.deepEqual(sent, [UPDATE_RESTART_CHANNEL, UPDATE_LATER_CHANNEL])
  assert.equal(document.getElementById('magpie-update'), null)
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHud } from './index.js'
import { isInert, onPress } from './dom.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const INDEX_HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')

function camelToDataAttr(prop) {
  return `data-${String(prop).replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`)}`
}

function dataAttrToCamel(attr) {
  return attr.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase())
}

function createDomEnv({ reducedMotion = false } = {}) {
  let doc = null
  const motionListeners = new Set()
  let motionMatches = reducedMotion

  class TextNode {
    constructor(data) {
      this.nodeType = 3
      this.data = String(data)
      this.parentElement = null
    }
    get textContent() {
      return this.data
    }
    set textContent(val) {
      this.data = String(val)
    }
  }

  class MockElement {
    constructor(tagName) {
      this.nodeType = 1
      this.tagName = tagName.toUpperCase()
      this.parentElement = null
      this.childNodes = []
      this._attrs = new Map()
      this._classes = new Set()
      this._listeners = new Map()
      this._inert = false
      this.style = { width: '', transform: '', opacity: '' }
      this.offsetWidth = 0
      this.scrollTop = 0

      const el = this
      this.classList = {
        add(...names) {
          for (const n of names) if (n) el._classes.add(n)
          el._syncClassAttr()
        },
        remove(...names) {
          for (const n of names) el._classes.delete(n)
          el._syncClassAttr()
        },
        toggle(name, force) {
          const next = force === undefined ? !el._classes.has(name) : !!force
          if (next) el._classes.add(name)
          else el._classes.delete(name)
          el._syncClassAttr()
          return next
        },
        contains(name) {
          return el._classes.has(name)
        },
      }

      this.dataset = new Proxy(
        {},
        {
          get(_, prop) {
            if (typeof prop !== 'string') return undefined
            const attr = camelToDataAttr(prop)
            return el._attrs.has(attr) ? el._attrs.get(attr) : undefined
          },
          set(_, prop, val) {
            if (typeof prop === 'string') el.setAttribute(camelToDataAttr(prop), String(val))
            return true
          },
          deleteProperty(_, prop) {
            if (typeof prop === 'string') el.removeAttribute(camelToDataAttr(prop))
            return true
          },
          ownKeys() {
            return [...el._attrs.keys()].filter((k) => k.startsWith('data-')).map((k) => dataAttrToCamel(k))
          },
          getOwnPropertyDescriptor(_, prop) {
            if (typeof prop === 'string' && el._attrs.has(camelToDataAttr(prop))) {
              return { enumerable: true, configurable: true }
            }
            return undefined
          },
        },
      )
    }

    _syncClassAttr() {
      if (this._classes.size) this._attrs.set('class', [...this._classes].join(' '))
      else this._attrs.delete('class')
    }

    get id() {
      return this._attrs.get('id') ?? ''
    }
    set id(val) {
      this.setAttribute('id', val)
    }

    get className() {
      return [...this._classes].join(' ')
    }
    set className(val) {
      this._classes = new Set(String(val).split(/\s+/).filter(Boolean))
      this._syncClassAttr()
    }

    get inert() {
      return this._inert
    }
    set inert(val) {
      this._inert = !!val
      if (this._inert) this._attrs.set('inert', '')
      else this._attrs.delete('inert')
    }

    get tabIndex() {
      if (this._attrs.has('tabindex')) return Number(this._attrs.get('tabindex'))
      return this.tagName === 'BUTTON' ? 0 : -1
    }
    set tabIndex(val) {
      this.setAttribute('tabindex', String(val))
    }

    get disabled() {
      return this._attrs.has('disabled')
    }

    get isConnected() {
      for (let cur = this; cur; cur = cur.parentElement) {
        if (cur === doc.documentElement) return true
      }
      return false
    }

    get children() {
      return this.childNodes.filter((n) => n.nodeType === 1)
    }

    get textContent() {
      return this.childNodes.map((n) => n.textContent).join('')
    }
    set textContent(val) {
      for (const child of this.childNodes) child.parentElement = null
      const str = val == null ? '' : String(val)
      this.childNodes = str ? [this._adopt(new TextNode(str))] : []
    }

    _adopt(node) {
      const child = typeof node === 'string' ? new TextNode(node) : node
      if (child.parentElement) {
        const idx = child.parentElement.childNodes.indexOf(child)
        if (idx >= 0) child.parentElement.childNodes.splice(idx, 1)
      }
      child.parentElement = this
      return child
    }

    appendChild(node) {
      const child = this._adopt(node)
      this.childNodes.push(child)
      return child
    }

    append(...nodes) {
      for (const n of nodes) this.appendChild(n)
    }

    replaceChildren(...nodes) {
      for (const child of this.childNodes) child.parentElement = null
      this.childNodes = []
      this.append(...nodes)
    }

    setAttribute(name, val) {
      const key = name.toLowerCase()
      const str = String(val)
      this._attrs.set(key, str)
      if (key === 'class') this._classes = new Set(str.split(/\s+/).filter(Boolean))
      if (key === 'inert') this._inert = true
    }

    getAttribute(name) {
      const key = name.toLowerCase()
      return this._attrs.has(key) ? this._attrs.get(key) : null
    }

    removeAttribute(name) {
      const key = name.toLowerCase()
      this._attrs.delete(key)
      if (key === 'class') this._classes.clear()
      if (key === 'inert') this._inert = false
    }

    hasAttribute(name) {
      return this._attrs.has(name.toLowerCase())
    }

    focus() {
      // Mirrors browser behavior: focusing an hidden or inert subtree is a no-op.
      if (!this.isConnected || this.closest('.hidden') || isInert(this)) return
      doc.activeElement = this
    }

    blur() {
      if (doc.activeElement === this) doc.activeElement = doc.body
    }

    addEventListener(type, fn) {
      if (!this._listeners.has(type)) this._listeners.set(type, [])
      this._listeners.get(type).push(fn)
    }

    dispatchEvent(init) {
      let stopped = false
      let prevented = false
      const event = {
        ...init,
        target: init.target ?? this,
        get defaultPrevented() {
          return prevented
        },
        stopPropagation() {
          stopped = true
        },
        preventDefault() {
          prevented = true
        },
      }
      for (let cur = this; cur; cur = cur.parentElement) {
        const fns = cur._listeners.get(event.type)
        if (fns) for (const fn of fns) fn(event)
        if (stopped || event.bubbles === false) break
      }
      return !prevented
    }

    matches(selector) {
      return selector
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .some((chain) => matchesChain(this, chain.split(/\s+/)))
    }

    closest(selector) {
      for (let cur = this; cur; cur = cur.parentElement) {
        if (cur.matches(selector)) return cur
      }
      return null
    }

    querySelector(selector) {
      return this.querySelectorAll(selector)[0] ?? null
    }

    querySelectorAll(selector) {
      const out = []
      const walk = (parent) => {
        for (const child of parent.children) {
          if (child.matches(selector)) out.push(child)
          walk(child)
        }
      }
      walk(this)
      return out
    }
  }

  function matchesSimple(el, token) {
    let rest = token
    const tagMatch = rest.match(/^[a-zA-Z][\w-]*/)
    if (tagMatch) {
      if (el.tagName !== tagMatch[0].toUpperCase()) return false
      rest = rest.slice(tagMatch[0].length)
    }
    const tokenRe = /#([\w-]+)|\.([\w-]+)|\[([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]*)))?\]/g
    let consumed = 0
    for (const m of rest.matchAll(tokenRe)) {
      consumed += m[0].length
      if (m[1] && el.id !== m[1]) return false
      if (m[2] && !el.classList.contains(m[2])) return false
      if (m[3]) {
        const attrVal = el.getAttribute(m[3])
        if (attrVal === null) return false
        const expected = m[4] ?? m[5] ?? m[6]
        if (expected !== undefined && attrVal !== expected) return false
      }
    }
    return consumed === rest.length
  }

  function matchesChain(el, parts) {
    if (!matchesSimple(el, parts[parts.length - 1])) return false
    let cur = el.parentElement
    for (let i = parts.length - 2; i >= 0; i--) {
      while (cur && !matchesSimple(cur, parts[i])) cur = cur.parentElement
      if (!cur) return false
      cur = cur.parentElement
    }
    return true
  }

  function parseBody(html) {
    const htmlEl = new MockElement('html')
    const bodyEl = new MockElement('body')
    htmlEl.appendChild(bodyEl)

    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
    const content = bodyMatch ? bodyMatch[1] : ''
    const stack = [bodyEl]
    const voidTags = new Set(['br', 'hr', 'img', 'input', 'link', 'meta', 'source'])
    const tagRe = /<!--[\s\S]*?-->|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)([\s\S]*?)(\/?)>/g
    let lastIndex = 0

    const pushText = (raw) => {
      if (!raw) return
      const decoded = raw
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
      if (decoded.trim() || stack.length > 1) stack[stack.length - 1].appendChild(new TextNode(decoded))
    }

    for (const m of content.matchAll(tagRe)) {
      pushText(content.slice(lastIndex, m.index))
      lastIndex = m.index + m[0].length
      if (m[0].startsWith('<!--')) continue
      if (m[1]) {
        const closeTag = m[1].toUpperCase()
        while (stack.length > 1 && stack[stack.length - 1].tagName !== closeTag) stack.pop()
        if (stack.length > 1) stack.pop()
        continue
      }
      const tag = m[2]
      const attrSource = m[3]
      const selfClose = m[4] === '/' || voidTags.has(tag.toLowerCase())
      const node = new MockElement(tag)
      for (const attr of attrSource.matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
        node.setAttribute(attr[1], attr[2] ?? attr[3] ?? attr[4] ?? '')
      }
      stack[stack.length - 1].appendChild(node)
      if (!selfClose) stack.push(node)
    }
    pushText(content.slice(lastIndex))
    return { htmlEl, bodyEl }
  }

  const { htmlEl, bodyEl } = parseBody(INDEX_HTML)

  doc = {
    documentElement: htmlEl,
    body: bodyEl,
    activeElement: bodyEl,
    createElement: (tag) => new MockElement(tag),
    createTextNode: (data) => new TextNode(data),
    getElementById: (id) => htmlEl.querySelector(`#${id}`),
    querySelector: (sel) => htmlEl.querySelector(sel),
    querySelectorAll: (sel) => htmlEl.querySelectorAll(sel),
  }

  const win = {
    matchMedia(query) {
      return {
        media: query,
        get matches() {
          return query.includes('prefers-reduced-motion') ? motionMatches : false
        },
        addEventListener(type, fn) {
          if (type === 'change' && query.includes('prefers-reduced-motion')) motionListeners.add(fn)
        },
      }
    },
  }

  globalThis.document = /** @type {any} */ (doc)
  globalThis.window = /** @type {any} */ (win)

  return {
    document: doc,
    setReducedMotion(next) {
      motionMatches = next
      for (const fn of motionListeners) fn({ matches: next })
    },
  }
}

function pressPointer(el, { pointerType = 'mouse', button = 0 } = {}) {
  el.dispatchEvent({ type: 'pointerdown', pointerType, button, bubbles: true })
}

test('modal overlays isolate background HUD via inert while keeping #exit live during tutorial lessons', () => {
  const { document: doc } = createDomEnv()
  const hud = createHud()
  hud.bindSys({
    onMute: () => {},
    onFullscreen: () => {},
    onHelp: () => hud.toggleHelp(),
  })

  const center = doc.getElementById('center')
  const sys = doc.getElementById('sys')
  const exit = doc.getElementById('exit')
  const pause = doc.getElementById('pause')
  const toast = doc.getElementById('toast')
  const lesson = doc.getElementById('lesson')
  const paused = doc.getElementById('paused')
  const respawn = doc.getElementById('respawn')
  const rotate = doc.getElementById('rotate')
  const help = doc.getElementById('help')

  hud.showMenu()
  assert.equal(center.inert, false)
  assert.equal(sys.inert, false)

  // Opening #help isolates background subtrees and moves focus to #btnHelpClose.
  hud.showHelp()
  assert.equal(help.inert, false)
  assert.equal(center.inert, true)
  assert.equal(sys.inert, true)
  assert.equal(doc.activeElement, doc.getElementById('btnHelpClose'))

  // #rotate sits above even an open #help modal and moves focus inside #rotate.
  hud.setFullscreen(false, true, false)
  hud.setRotate(true)
  assert.equal(rotate.inert, false)
  assert.equal(help.inert, true)
  assert.equal(doc.activeElement, doc.getElementById('btnRotateFs'))

  hud.setRotate(false)
  assert.equal(help.inert, false)
  assert.equal(doc.activeElement, doc.getElementById('btnHelpClose'))

  hud.hideHelp()
  assert.equal(center.inert, false)
  assert.equal(sys.inert, false)

  // Tutorial lesson keeps #exit non-inert while isolating other chrome and leaving #toast live.
  hud.setGameMode('tutorial')
  hud.showPlaying()
  hud.showPaused('lesson')
  hud.showLesson('flight')
  assert.equal(lesson.classList.contains('hidden'), false)
  assert.equal(lesson.inert, false)
  assert.equal(exit.classList.contains('hidden'), false)
  assert.equal(exit.inert, false, '#exit must stay non-inert while #lesson is open')
  assert.equal(center.inert, true)
  assert.equal(sys.inert, true)
  assert.equal(pause.inert, true)
  assert.equal(toast.inert, false, '#toast live region must not be inert')
  assert.equal(doc.activeElement, lesson)

  hud.hideLesson()
  assert.equal(pause.inert, false)

  // Non-interactive holds ('begin', 'resume', 'countdown') and #respawn use role="status", not aria-modal.
  hud.showPaused('begin')
  assert.equal(paused.getAttribute('role'), 'status')
  assert.equal(paused.hasAttribute('aria-modal'), false)
  assert.equal(exit.inert, false)

  hud.showPaused('countdown', 3)
  assert.equal(paused.getAttribute('role'), 'status')
  assert.equal(paused.hasAttribute('aria-modal'), false)

  // Pause menu ('menu') promotes #paused to a modal dialog, isolates #exit, and focuses CONTINUE.
  hud.showPaused('menu')
  assert.equal(paused.getAttribute('role'), 'dialog')
  assert.equal(paused.getAttribute('aria-modal'), 'true')
  assert.equal(exit.inert, true)
  assert.equal(doc.activeElement, doc.getElementById('btnContinue'))

  hud.hidePaused()
  assert.equal(paused.getAttribute('role'), 'status')
  assert.equal(paused.hasAttribute('aria-modal'), false)
  assert.equal(exit.inert, false)

  hud.showRespawn()
  assert.equal(respawn.getAttribute('role'), 'status')
  assert.equal(respawn.hasAttribute('aria-modal'), false)
})

test('setRotate followed by setFullscreen promotes focus from #rotate to #btnRotateFs', () => {
  const { document: doc } = createDomEnv()
  const hud = createHud()
  hud.showMenu()
  // Simulate game syncScreen() order: setRotate(true) before setFullscreen(...) unhides #btnRotateFs.
  hud.setRotate(true)
  assert.equal(doc.activeElement, doc.getElementById('rotate'))
  hud.setFullscreen(false, true, false)
  assert.equal(doc.activeElement, doc.getElementById('btnRotateFs'))
})

test('focus moves to first setting control and returns to triggering menu or help control on close', () => {
  const { document: doc } = createDomEnv()
  const hud = createHud()
  hud.bindSys({
    onMute: () => {},
    onFullscreen: () => {},
    onHelp: () => hud.toggleHelp(),
  })
  hud.bindMenu({
    onSelect: (item) => {
      if (item === 'help') hud.showHelp()
      if (item === 'settings') hud.showSettings()
      if (item === 'scores') hud.showScores([], -1, 'NO ENTRIES YET', { kind: 'run' })
      if (item === 'credits') hud.showCredits()
    },
    onBack: () => hud.showMenu(),
  })

  hud.showMenu()

  // Navigate to SETTINGS on #menu, open it -> focus lands on MASTER lower nudge, then BACK restores #menu item.
  const settingsMenuBtn = doc.querySelector('#menu button[data-item="settings"]')
  pressPointer(settingsMenuBtn)
  assert.equal(doc.activeElement, doc.querySelector('[data-setting="master"] [data-settings-nudge="-1"]'))
  hud.showMenu()
  assert.equal(doc.activeElement, settingsMenuBtn)

  // Open HELP from #menu button -> closing via Escape/H (even if focus moved inside #help) returns to #menu HELP button.
  const helpMenuBtn = doc.querySelector('#menu button[data-item="help"]')
  pressPointer(helpMenuBtn)
  assert.equal(doc.activeElement, doc.getElementById('btnHelpClose'))
  doc.activeElement = doc.getElementById('help')
  hud.hideHelp()
  assert.equal(doc.activeElement, helpMenuBtn)

  // Open HELP from #btnHelp in #sys -> closing returns focus to #btnHelp.
  const sysHelpBtn = doc.getElementById('btnHelp')
  pressPointer(sysHelpBtn)
  assert.equal(doc.activeElement, doc.getElementById('btnHelpClose'))
  hud.hideHelp()
  assert.equal(doc.activeElement, sysHelpBtn)
})

test('toggle buttons keep constant visible-text-inclusive aria-labels while toggling aria-pressed', () => {
  const { document: doc } = createDomEnv()
  const hud = createHud()
  const muteBtn = doc.getElementById('btnMute')
  const fsBtn = doc.getElementById('btnFs')
  const rotateFsBtn = doc.getElementById('btnRotateFs')

  hud.setMuted(false)
  assert.equal(muteBtn.getAttribute('aria-label'), 'Mute')
  assert.equal(muteBtn.getAttribute('aria-pressed'), 'false')
  assert.equal(muteBtn.querySelector('.label').textContent, 'MUTE')

  hud.setMuted(true)
  assert.equal(muteBtn.getAttribute('aria-label'), 'Mute')
  assert.equal(muteBtn.getAttribute('aria-pressed'), 'true')
  assert.equal(muteBtn.querySelector('.label').textContent, 'MUTE')
  assert.equal(muteBtn.classList.contains('on'), true)

  hud.setFullscreen(false, true, false)
  assert.equal(fsBtn.getAttribute('aria-label'), 'Full screen')
  assert.equal(fsBtn.getAttribute('aria-pressed'), 'false')
  assert.equal(fsBtn.querySelector('.label').textContent, 'FULL')
  assert.equal(rotateFsBtn.getAttribute('aria-label'), 'Fullscreen')
  assert.equal(rotateFsBtn.getAttribute('aria-pressed'), 'false')
  assert.equal(rotateFsBtn.querySelector('.label').textContent, 'FULLSCREEN')

  hud.setFullscreen(true, true, false)
  assert.equal(fsBtn.getAttribute('aria-label'), 'Full screen')
  assert.equal(fsBtn.getAttribute('aria-pressed'), 'true')
  assert.equal(fsBtn.querySelector('.label').textContent, 'FULL')
  assert.equal(rotateFsBtn.getAttribute('aria-label'), 'Fullscreen')
  assert.equal(rotateFsBtn.getAttribute('aria-pressed'), 'true')
  assert.equal(rotateFsBtn.querySelector('.label').textContent, 'FULLSCREEN')
})

test('scores tabs, settings radios, volume live output, and entry live output maintain ARIA state', () => {
  const { document: doc } = createDomEnv()
  const hud = createHud()
  hud.bindMenu({})

  // LOADING keeps visible text 'LOADING' while suppressing role="status" live noise.
  hud.showScores(null, -1, 'LOADING', { kind: 'run' })
  const scoresStatus = doc.getElementById('scoresStatus')
  const scoresPanel = doc.getElementById('scoresPanel')
  assert.equal(scoresStatus.textContent, 'LOADING')
  assert.equal(scoresStatus.getAttribute('role'), null)
  assert.equal(scoresStatus.getAttribute('aria-live'), 'off')
  assert.equal(scoresPanel.getAttribute('aria-labelledby'), 'scoreTabRun')
  assert.equal(doc.getElementById('scoreTabRun').tabIndex, 0)
  assert.equal(doc.getElementById('scoreTabBends').tabIndex, -1)
  assert.equal(doc.getElementById('scoreTabChallenge').tabIndex, -1)

  // Non-loading status restores role="status" and switching tabs moves roving tabIndex + focus + aria-labelledby.
  hud.showScores([], -1, 'NO ENTRIES YET', { kind: 'bends' })
  assert.equal(scoresStatus.textContent, 'NO ENTRIES YET')
  assert.equal(scoresStatus.getAttribute('role'), 'status')
  assert.equal(scoresStatus.hasAttribute('aria-live'), false)
  assert.equal(scoresPanel.getAttribute('aria-labelledby'), 'scoreTabBends')
  assert.equal(doc.getElementById('scoreTabRun').tabIndex, -1)
  assert.equal(doc.getElementById('scoreTabBends').tabIndex, 0)
  assert.equal(doc.activeElement, doc.getElementById('scoreTabBends'))

  // Settings rows have no aria-current, quality radios rove tabIndex, and volume nudges announce via #settingsLive.
  hud.showSettings({ master: 1, music: 1, effects: 1, quality: 1 })
  for (const row of doc.querySelectorAll('.settings-row')) {
    assert.equal(row.hasAttribute('aria-current'), false)
  }
  assert.equal(doc.querySelector('[data-quality="auto"]').tabIndex, -1)
  assert.equal(doc.querySelector('[data-quality="1"]').tabIndex, 0)
  assert.equal(doc.getElementById('settingsLive').textContent, '')

  pressPointer(doc.querySelector('[data-setting="master"] [data-settings-nudge="-1"]'))
  assert.equal(doc.querySelector('[data-setting="master"] .settings-readout').textContent, '90')
  assert.equal(doc.getElementById('settingsLive').textContent, 'MASTER 90')

  // Initials entry announces slot & initials politely through #entryLive and clears on hide.
  hud.showEntry(15, 2, { chars: ['M', 'A', 'G'], cursor: 1 })
  assert.equal(doc.getElementById('entrySlot0').textContent, 'M')
  assert.equal(doc.getElementById('entrySlot1').textContent, 'A')
  assert.equal(doc.getElementById('entrySlot2').textContent, 'G')
  assert.equal(doc.getElementById('entryLive').textContent, 'Letter 2: A, initials MAG')
  hud.hideEntry()
  assert.equal(doc.getElementById('entryLive').textContent, '')
})

test('raiseCard avoids HTML sinks, onPress ignores non-primary mouse buttons, and readouts/touch stay clean', async () => {
  const { document: doc, setReducedMotion } = createDomEnv({ reducedMotion: false })
  const hud = createHud()
  const title = doc.getElementById('title')

  Object.defineProperty(title, `inner${'HTML'}`, {
    set() {
      throw new Error('Blocked by Trusted Types')
    },
  })

  hud.showMenu()
  assert.equal(title.textContent, 'MAGPIE-9')
  assert.equal(title.querySelector('span')?.textContent, '-9')

  hud.showDead(9, true)
  assert.equal(title.textContent, 'REBOOT')
  assert.equal(title.querySelector('span'), null)

  // Secondary mouse buttons do not activate HUD buttons; primary mouse, touch, and keyboard detail=0 do.
  const probeBtn = doc.createElement('button')
  doc.body.appendChild(probeBtn)
  let presses = 0
  onPress(probeBtn, () => {
    presses += 1
  })
  pressPointer(probeBtn, { pointerType: 'mouse', button: 2 })
  pressPointer(probeBtn, { pointerType: 'mouse', button: 1 })
  assert.equal(presses, 0)
  pressPointer(probeBtn, { pointerType: 'mouse', button: 0 })
  pressPointer(probeBtn, { pointerType: 'touch', button: 0 })
  probeBtn.dispatchEvent({ type: 'click', detail: 0, bubbles: true })
  probeBtn.dispatchEvent({ type: 'click', detail: 1, bubbles: true })
  assert.equal(presses, 3)

  // #lives marks each '+' span aria-hidden="true".
  hud.setLives(3, false)
  const lives = doc.getElementById('lives')
  assert.equal(lives.getAttribute('aria-label'), '2 spare lives')
  assert.equal(lives.children.length, 2)
  for (const span of lives.children) {
    assert.equal(span.getAttribute('aria-hidden'), 'true')
    assert.equal(span.textContent, '+')
  }

  // Live prefers-reduced-motion change updates touch tapring behavior without recreating HUD.
  hud.setInputMode('touch')
  const tapring = doc.querySelector('#touch .tapring')
  const now = performance.now()
  hud.updateTouch({ stick: { active: false }, lastTap: { at: now - 140, x: 100, y: 80 } })
  assert.ok(Number(tapring.style.opacity) < 1)

  setReducedMotion(true)
  hud.updateTouch({ stick: { active: false }, lastTap: { at: now - 70, x: 120, y: 90 } })
  assert.equal(tapring.style.opacity, '1')

  // Toast clears textContent once expired so stale messages do not linger in browse mode.
  const origSetTimeout = globalThis.setTimeout
  let expiryFn = null
  globalThis.setTimeout = /** @type {any} */ (
    (fn) => {
      expiryFn = fn
      return 1
    }
  )
  try {
    hud.toast('DAMPER', 'gold')
    const toast = doc.getElementById('toast')
    assert.equal(toast.textContent, 'DAMPER')
    assert.equal(toast.classList.contains('show'), true)
    expiryFn?.()
    assert.equal(toast.classList.contains('show'), false)
    assert.equal(toast.textContent, '')
  } finally {
    globalThis.setTimeout = origSetTimeout
  }
})

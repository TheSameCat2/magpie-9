#!/usr/bin/env node
// Verification harness for the MAGPIE-9 web HUD. Not part of the game.
// Buttons listen for pointerdown, so "click" is a real mouse press at the
// element's centre. Keyboard edges are consumed on the next animation frame;
// every press waits for two frames before returning.
// SwiftShader flags exist because a headless machine with no GPU would
// otherwise fail WebGL startup. They are harness scaffolding, not game config.

import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const VIEW_W = 1280
const VIEW_H = 800
const LATEST = '/tmp/magpie-verify/latest'
const PRODUCTION_ORIGIN = 'https://magpie.nradavies.com'
const SURFACES = new Set(['vite', 'production', 'desktop', 'packaged'])

const MENU_BLURBS = {
  new: 'AN OPEN RUN · EVERY GATE COUNTS',
  bends: 'AN ENDLESS RUN IN A CONDUIT THAT TURNS',
  challenge: "TODAY'S 40-GATE COURSE · RANKED BY TIME",
  tutorial: 'A SLOW RUN THAT TEACHES EACH HAZARD AND ORB',
  scores: "ALL-TIME AND BENDS GATES · TODAY'S FASTEST EXTRACTS",
  help: 'CONTROLS, ORBS, AND HOW A CHALLENGE WORKS',
  credits: 'THE PEOPLE BEHIND MAGPIE-9',
  settings: 'VOLUME CHANNELS AND GRAPHICS QUALITY',
}

const KEYS = {
  h: { key: 'h', code: 'KeyH', vk: 72, text: 'h' },
  w: { key: 'w', code: 'KeyW', vk: 87, text: 'w' },
  s: { key: 's', code: 'KeyS', vk: 83, text: 's' },
  a: { key: 'a', code: 'KeyA', vk: 65, text: 'a' },
  d: { key: 'd', code: 'KeyD', vk: 68, text: 'd' },
  m: { key: 'm', code: 'KeyM', vk: 77, text: 'm' },
  p: { key: 'p', code: 'KeyP', vk: 80, text: 'p' },
  r: { key: 'r', code: 'KeyR', vk: 82, text: 'r' },
  b: { key: 'b', code: 'KeyB', vk: 66, text: 'b' },
  Space: { key: ' ', code: 'Space', vk: 32, text: ' ' },
  Enter: { key: 'Enter', code: 'Enter', vk: 13 },
  Escape: { key: 'Escape', code: 'Escape', vk: 27 },
  ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', vk: 38 },
  ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', vk: 40 },
  ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', vk: 37 },
  ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', vk: 39 },
  Backspace: { key: 'Backspace', code: 'Backspace', vk: 8 },
  Control: { key: 'Control', code: 'ControlLeft', vk: 17 },
}

const PROBE = `(() => {
  const hidden = (el) => !el || el.classList.contains('hidden')
  const shown = (el) => (el ? getComputedStyle(el).display : '')
  const canvas = document.querySelector('canvas')
  let webgl = null
  if (canvas) {
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info')
      webgl = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
    }
  }
  const menu = [...document.querySelectorAll('#menu button')].map((b) => ({
    item: b.dataset.item || '',
    current: b.getAttribute('aria-current') === 'true',
    text: (b.textContent || '').replace(/\\s+/g, ' ').trim(),
  }))
  const storage = {}
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith('magpie9.')) storage[k] = localStorage.getItem(k)
    }
  } catch (err) {
    storage.__error = String(err)
  }
  const scoreInitials = [...document.querySelectorAll('#scoresList .initials')].map((el) =>
    (el.textContent || '').replace(/\\s+/g, ' ').trim().replace(/^▸\\s*/, ''),
  )
  const scoresFilled = scoreInitials.filter((text) => text && text !== '---').length
  const scoresStatusText = (document.getElementById('scoresStatus')?.textContent || '').trim()
  const scoresStatusIsHidden = hidden(document.getElementById('scoresStatus'))
  let scoresReach = 'pending'
  if (scoresStatusText === 'LOADING') scoresReach = 'loading'
  else if (scoresStatusText === 'BOARD OFFLINE') scoresReach = 'offline'
  else if (scoresStatusText === 'SAVING') scoresReach = 'saving'
  else if (scoresStatusText === 'NO ENTRIES YET') scoresReach = 'online'
  else if (!scoresStatusText && scoresStatusIsHidden && scoresFilled > 0) scoresReach = 'online'
  const help = document.getElementById('help')
  const paused = document.getElementById('paused')
  const center = document.getElementById('center')
  const score = document.getElementById('score')
  const credits = document.getElementById('credits')
  const settings = document.getElementById('settings')
  const toast = document.getElementById('toast')
  const readout = (name) => {
    const row = settings && settings.querySelector('[data-setting="' + name + '"]')
    const el = row && row.querySelector('.settings-readout')
    return ((el && el.textContent) || '').trim()
  }
  return {
    title: document.title,
    href: location.href,
    visibility: document.visibilityState,
    input: document.body.dataset.input || '',
    mode: document.body.dataset.mode || '',
    helpOpenClass: document.body.classList.contains('help-open'),
    canvas: !!canvas,
    webgl,
    heading: (document.getElementById('title')?.textContent || '').replace(/\\s+/g, ' ').trim(),
    prompt: (document.getElementById('prompt')?.textContent || '').replace(/\\s+/g, ' ').trim(),
    promptHidden: hidden(document.getElementById('prompt')),
    score: score?.textContent ?? null,
    scoreLabel: document.getElementById('scoreLabel')?.textContent ?? null,
    scoreDisplay: shown(score),
    best: document.getElementById('best')?.textContent ?? null,
    blurb: document.getElementById('blurb')?.textContent ?? null,
    sub: document.getElementById('sub')?.textContent ?? null,
    keys: document.getElementById('keys')?.textContent ?? null,
    menu,
    centerHidden: hidden(center),
    centerVisibility: center ? getComputedStyle(center).visibility : '',
    menuHidden: hidden(document.getElementById('menu')),
    helpHidden: hidden(help),
    helpTitle: document.getElementById('helpTitle')?.textContent ?? null,
    helpExpanded: document.getElementById('btnHelp')?.getAttribute('aria-expanded'),
    pausedHidden: hidden(paused),
    pausedReason: paused?.dataset.reason || '',
    pausedTitle: (paused?.querySelector('.overlay-title')?.textContent || '').trim(),
    pausedSub: (paused?.querySelector('.overlay-sub')?.textContent || '').trim(),
    continueHidden: hidden(document.getElementById('btnContinue')),
    quitHidden: hidden(document.getElementById('btnQuit')),
    pauseBtnHidden: hidden(document.getElementById('pause')),
    scoresHidden: hidden(document.getElementById('scores')),
    scoresStatus: scoresStatusText,
    scoresStatusHidden: scoresStatusIsHidden,
    scoresReach,
    scoresFilled,
    scoresDay: (document.getElementById('scoresDay')?.textContent || '').trim(),
    scoresTab: document.querySelector('#scoresTabs button[aria-selected="true"]')?.dataset.board || '',
    desktop: globalThis.magpieDesktop?.desktop === true,
    apiOrigin:
      globalThis.magpieDesktop && typeof globalThis.magpieDesktop.apiOrigin === 'string'
        ? globalThis.magpieDesktop.apiOrigin
        : '',
    creditsHidden: hidden(credits),
    creditsTitle: document.getElementById('creditsTitle')?.textContent ?? '',
    creditsText: (credits?.innerText || '').replace(/\\s+/g, ' ').trim(),
    settingsHidden: hidden(settings),
    settingsTitle: (document.getElementById('settingsTitle')?.textContent || '').trim(),
    settingsText: (settings?.innerText || '').replace(/\\s+/g, ' ').trim(),
    settingsRow: settings?.querySelector('.settings-row.sel')?.dataset.setting || '',
    settingsMaster: readout('master'),
    settingsMusic: readout('music'),
    settingsEffects: readout('effects'),
    settingsQuality: settings?.querySelector('[data-quality][aria-checked="true"]')?.dataset.quality || '',
    settingsCaption: (document.getElementById('settingsQualityCaption')?.textContent || '').trim(),
    lessonHidden: hidden(document.getElementById('lesson')),
    lessonTitle: (document.querySelector('#lesson .lesson:not(.hidden) .overlay-title')?.textContent || '').trim(),
    lessonTap: (document.getElementById('lessonTap')?.textContent || '').trim(),
    rotateHidden: hidden(document.getElementById('rotate')),
    toast: (toast?.textContent || '').trim(),
    toastClass: toast?.className || '',
    tutorialTagHidden: hidden(document.getElementById('tutorialTag')),
    exitHidden: hidden(document.getElementById('exit')),
    storage,
  }
})()`

function parseArgs(argv) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (!token.startsWith('--')) {
      out._.push(token)
      continue
    }
    const key = token.slice(2)
    const next = argv[i + 1]
    if (next == null || next.startsWith('--')) out[key] = true
    else {
      out[key] = next
      i += 1
    }
  }
  return out
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function alive(pid) {
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function repoRoot() {
  if (process.env.MAGPIE_VERIFY_ROOT) return path.resolve(process.env.MAGPIE_VERIFY_ROOT)
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}

function revisionOf(root) {
  const result = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(result.stderr || 'git rev-parse failed')
  return result.stdout.trim()
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

function spawnDetached(command, args, { cwd, env, logPath }) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true })
  const logFd = fs.openSync(logPath, 'a')
  const child = spawn(command, args, {
    cwd,
    env,
    detached: true,
    stdio: ['ignore', logFd, logFd],
  })
  child.unref()
  fs.closeSync(logFd)
  return child.pid
}

function childrenOf(pid) {
  const kids = []
  let entries = []
  try {
    entries = fs.readdirSync('/proc')
  } catch {
    return kids
  }
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue
    let stat
    try {
      stat = fs.readFileSync(`/proc/${entry}/stat`, 'utf8')
    } catch {
      continue
    }
    const rest = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
    if (Number(rest[1]) === pid) kids.push(Number(entry))
  }
  return kids
}

function processTree(pid) {
  const out = []
  const stack = [pid]
  const seen = new Set()
  while (stack.length) {
    const current = stack.pop()
    if (!current || seen.has(current)) continue
    seen.add(current)
    out.push(current)
    stack.push(...childrenOf(current))
  }
  return out
}

async function killTree(pid) {
  if (!pid || pid === process.pid) return
  const tree = processTree(pid)
  const signal = (sig) => {
    try {
      process.kill(-pid, sig)
    } catch {
      /* group already gone, or this pid was not a group leader */
    }
    for (const member of tree) {
      try {
        process.kill(member, sig)
      } catch {
        /* already exited */
      }
    }
  }
  if (!tree.some(alive)) return
  signal('SIGTERM')
  const deadline = Date.now() + 3000
  while (tree.some(alive) && Date.now() < deadline) await sleep(100)
  if (tree.some(alive)) signal('SIGKILL')
}

function cmdline(pid) {
  try {
    return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replaceAll('\0', ' ')
  } catch {
    /* macOS has no /proc. ps is the same check doctor already makes. */
  }
  const result = spawnSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' })
  return (result.stdout || '').trim()
}

// `ss` is not installed here. A listening socket's inode in /proc/net/tcp
// matched against the Vite process tree is the ownership check.
function listenInodes(port) {
  const hexPort = port.toString(16).toUpperCase().padStart(4, '0')
  const inodes = []
  for (const file of ['/proc/net/tcp', '/proc/net/tcp6']) {
    let text = ''
    try {
      text = fs.readFileSync(file, 'utf8')
    } catch {
      continue
    }
    for (const line of text.split('\n').slice(1)) {
      const parts = line.trim().split(/\s+/)
      if (parts.length < 10 || parts[3] !== '0A') continue
      const portHex = parts[1].split(':')[1]
      if (portHex?.toUpperCase() === hexPort) inodes.push(parts[9])
    }
  }
  return inodes
}

function socketInodes(pid) {
  const inodes = new Set()
  let fds = []
  try {
    fds = fs.readdirSync(`/proc/${pid}/fd`)
  } catch {
    return inodes
  }
  for (const fd of fds) {
    try {
      const target = fs.readlinkSync(`/proc/${pid}/fd/${fd}`)
      const match = /^socket:\[(\d+)\]$/.exec(target)
      if (match) inodes.add(match[1])
    } catch {
      /* fd closed while we looked */
    }
  }
  return inodes
}

function ownsPort(pid, port) {
  const listening = listenInodes(port)
  if (listening.length) {
    const owned = new Set()
    for (const member of processTree(pid)) {
      for (const inode of socketInodes(member)) owned.add(inode)
    }
    if (listening.some((inode) => owned.has(inode))) return { ok: true }
    return { ok: false, reason: `port ${port} is not held by pid ${pid}` }
  }
  // Linux reads /proc/net/tcp above. Elsewhere lsof names the listening pid.
  if (process.platform === 'linux') return { ok: false, reason: `nothing is listening on ${port}` }
  const result = spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], { encoding: 'utf8' })
  const listeners = (result.stdout || '')
    .split('\n')
    .map((line) => Number(line.trim()))
    .filter((n) => Number.isInteger(n) && n > 0)
  if (!listeners.length) return { ok: false, reason: `nothing is listening on ${port}` }
  if (listeners.includes(pid)) return { ok: true }
  return { ok: false, reason: `port ${port} is not held by pid ${pid}` }
}

function statePath(home) {
  return path.join(home, 'run.json')
}

function loadState() {
  const home = process.env.MAGPIE_VERIFY_HOME
    ? path.resolve(process.env.MAGPIE_VERIFY_HOME)
    : fs.existsSync(LATEST)
      ? fs.readFileSync(LATEST, 'utf8').trim()
      : ''
  if (!home) throw new Error('no verification instance. Run launch first, or set MAGPIE_VERIFY_HOME.')
  const file = statePath(home)
  if (!fs.existsSync(file)) throw new Error(`missing ${file}`)
  return readJson(file)
}

function rememberLatest(state) {
  if (process.env.MAGPIE_VERIFY_HOME) return
  fs.mkdirSync(path.dirname(LATEST), { recursive: true })
  fs.writeFileSync(LATEST, `${state.home}\n`)
}

function forgetLatest(state) {
  if (!fs.existsSync(LATEST)) return
  const current = fs.readFileSync(LATEST, 'utf8').trim()
  if (current === state.home) fs.rmSync(LATEST)
}

function evidenceFile(state, rel) {
  if (!rel || rel === true) throw new Error('missing --path')
  const evidence = path.resolve(state.evidence)
  const target = path.resolve(evidence, rel)
  if (target !== evidence && !target.startsWith(`${evidence}${path.sep}`)) {
    throw new Error(`path escapes the evidence dir: ${rel}`)
  }
  return target
}

function logAction(state, line) {
  fs.mkdirSync(state.evidence, { recursive: true })
  fs.appendFileSync(path.join(state.evidence, 'actions.log'), `${new Date().toISOString()} ${line}\n`)
}

function connectCdp(wsUrl) {
  const ws = new WebSocket(wsUrl)
  let next = 1
  const pending = new Map()
  const exceptions = []

  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message)
      pending.delete(message.id)
      return
    }
    if (message.method === 'Runtime.exceptionThrown') {
      exceptions.push(
        message.params.exceptionDetails?.exception?.description || message.params.exceptionDetails?.text,
      )
    }
  })

  return new Promise((resolve, reject) => {
    ws.addEventListener('open', () => {
      resolve({
        exceptions,
        call(method, params = {}, timeout = 15000) {
          const id = next++
          ws.send(JSON.stringify({ id, method, params }))
          return new Promise((res, rej) => {
            const timer = setTimeout(() => rej(new Error(`CDP timeout: ${method}`)), timeout)
            pending.set(id, (message) => {
              clearTimeout(timer)
              if (message.error) rej(new Error(message.error.message))
              else res(message.result)
            })
          })
        },
        close() {
          ws.close()
        },
      })
    })
    ws.addEventListener('error', () => reject(new Error(`devtools socket failed for ${wsUrl}`)))
  })
}

async function pageTarget(cdpPort, deadline) {
  let last = ''
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${cdpPort}/json/list`)
      const targets = await response.json()
      const page = targets.find((item) => item.type === 'page' && item.webSocketDebuggerUrl)
      if (page) return page
      last = JSON.stringify(targets)
    } catch (err) {
      last = err.message
    }
    await sleep(200)
  }
  throw new Error(`no Chrome page on :${cdpPort} (${last})`)
}

async function withPage(state, fn) {
  const target = await pageTarget(state.cdpPort, Date.now() + 10000)
  const client = await connectCdp(target.webSocketDebuggerUrl)
  try {
    await client.call('Runtime.enable')
    await client.call('Page.enable')
    // Keep the viewport landscape. A portrait coarse pointer would raise the
    // rotate overlay and block every menu action.
    await client.call('Emulation.setDeviceMetricsOverride', {
      width: VIEW_W,
      height: VIEW_H,
      deviceScaleFactor: 1,
      mobile: false,
    })
    return await fn(client)
  } finally {
    client.close()
  }
}

async function evaluate(client, expression, awaitPromise = false) {
  const result = await client.call('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise,
  })
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
  }
  return result.result?.value
}

async function readProbe(client) {
  return evaluate(client, PROBE)
}

async function waitFrames(client) {
  await evaluate(
    client,
    `new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))`,
    true,
  )
}

// One devtools session for the whole poll. Reconnecting per sample spends
// most of a one-second countdown digit on the socket handshake.
async function pollProbe(client, { field, equals, timeout }) {
  const deadline = Date.now() + timeout
  let last = null
  while (Date.now() < deadline) {
    last = await readProbe(client)
    if (String(last?.[field]) === equals) return last
    await sleep(50)
  }
  throw new Error(`timed out after ${timeout}ms waiting for ${field}=${equals}, last ${last?.[field]}`)
}

async function writeScreenshot(client, state, rel) {
  const target = evidenceFile(state, rel)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const shot = await client.call('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(target, Buffer.from(shot.data, 'base64'))
  return target
}

async function writeSnapshot(state, probe, rel) {
  const target = evidenceFile(state, rel)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, formatProbe(probe, state))
  return target
}

// Snapshot first. The frame capture reads the WebGL canvas and can take the
// rest of a one-second countdown digit, so the PNG may already show the next one.
async function captureMatch(client, state, probe, args) {
  if (args.snapshot) console.log(`ok snapshot ${await writeSnapshot(state, probe, args.snapshot)}`)
  if (args.screenshot) console.log(`ok screenshot ${await writeScreenshot(client, state, args.screenshot)}`)
}

function formatProbe(probe, state) {
  const menu = (probe.menu || []).map((item) => `${item.item}${item.current ? '*' : ''}`).join(' ')
  const storage = Object.keys(probe.storage || {})
  const lines = [
    `revision: ${state.revision}`,
    `url: ${probe.href}`,
    `title: ${probe.title}`,
    `visibility: ${probe.visibility}`,
    `input: ${probe.input}`,
    `mode: ${probe.mode}`,
    `canvas: ${probe.canvas}`,
    `webgl: ${probe.webgl}`,
    `heading: ${probe.heading}`,
    `prompt: ${probe.prompt}`,
    `promptHidden: ${probe.promptHidden}`,
    `score: ${probe.score}`,
    `scoreLabel: ${probe.scoreLabel}`,
    `scoreDisplay: ${probe.scoreDisplay}`,
    `best: ${probe.best}`,
    `blurb: ${probe.blurb}`,
    `sub: ${probe.sub}`,
    `keys: ${probe.keys}`,
    `menu: ${menu}`,
    `centerHidden: ${probe.centerHidden}`,
    `centerVisibility: ${probe.centerVisibility}`,
    `menuHidden: ${probe.menuHidden}`,
    `helpHidden: ${probe.helpHidden}`,
    `helpOpenClass: ${probe.helpOpenClass}`,
    `helpTitle: ${probe.helpTitle}`,
    `helpExpanded: ${probe.helpExpanded}`,
    `pausedHidden: ${probe.pausedHidden}`,
    `pausedReason: ${probe.pausedReason}`,
    `pausedTitle: ${probe.pausedTitle}`,
    `pausedSub: ${probe.pausedSub}`,
    `continueHidden: ${probe.continueHidden}`,
    `quitHidden: ${probe.quitHidden}`,
    `pauseBtnHidden: ${probe.pauseBtnHidden}`,
    `scoresHidden: ${probe.scoresHidden}`,
    `scoresStatus: ${probe.scoresStatus}`,
    `scoresReach: ${probe.scoresReach}`,
    `scoresFilled: ${probe.scoresFilled}`,
    `scoresDay: ${probe.scoresDay}`,
    `scoresTab: ${probe.scoresTab}`,
    `desktop: ${probe.desktop}`,
    `apiOrigin: ${probe.apiOrigin}`,
    `creditsHidden: ${probe.creditsHidden}`,
    `creditsTitle: ${probe.creditsTitle}`,
    `settingsHidden: ${probe.settingsHidden}`,
    `settingsTitle: ${probe.settingsTitle}`,
    `settingsRow: ${probe.settingsRow}`,
    `settingsMaster: ${probe.settingsMaster}`,
    `settingsMusic: ${probe.settingsMusic}`,
    `settingsEffects: ${probe.settingsEffects}`,
    `settingsQuality: ${probe.settingsQuality}`,
    `settingsCaption: ${probe.settingsCaption}`,
    `lessonHidden: ${probe.lessonHidden}`,
    `lessonTitle: ${probe.lessonTitle}`,
    `lessonTap: ${probe.lessonTap}`,
    `rotateHidden: ${probe.rotateHidden}`,
    `toast: ${probe.toast}`,
    `toastClass: ${probe.toastClass}`,
    `tutorialTagHidden: ${probe.tutorialTagHidden}`,
    `exitHidden: ${probe.exitHidden}`,
    `storage: ${storage.length ? JSON.stringify(probe.storage) : '(empty)'}`,
  ]
  return `${lines.join('\n')}\n`
}

function currentItem(probe) {
  return probe.menu?.find((item) => item.current)?.item || ''
}

function problemsFor(name, probe, args) {
  const problems = []
  const need = (ok, message) => {
    if (!ok) problems.push(message)
  }
  if (name === 'menu') {
    need(probe.heading === 'MAGPIE-9', `heading ${probe.heading}`)
    need(probe.centerHidden === false, 'centre card hidden')
    need(probe.centerVisibility === 'visible', `centre visibility ${probe.centerVisibility}`)
    need(probe.menuHidden === false, 'menu hidden')
    need(probe.helpHidden === true && probe.helpOpenClass === false, 'help is open')
    need(probe.pausedHidden === true, 'pause card showing')
    need(probe.scoresHidden === true, 'scores showing')
    need(probe.creditsHidden === true, 'credits showing')
    need(probe.settingsHidden === true, 'settings showing')
    need(probe.lessonHidden === true, 'lesson showing')
    need(probe.rotateHidden === true, 'rotate overlay showing')
    need(probe.mode === 'run', `mode ${probe.mode}`)
    need(probe.input === 'keys', `input ${probe.input}`)
    need(probe.sub === '↑ ↓ SELECT · ENTER · H HELP', `sub ${probe.sub}`)
    need(probe.title === 'MAGPIE-9', `title ${probe.title}`)
  } else if (name === 'menu-item') {
    const item = args.item
    need(MENU_BLURBS[item], `unknown menu item ${item}`)
    need(currentItem(probe) === item, `current ${currentItem(probe)}`)
    need(probe.blurb === MENU_BLURBS[item], `blurb ${probe.blurb}`)
  } else if (name === 'help-open') {
    need(probe.helpHidden === false, 'help hidden')
    need(probe.helpOpenClass === true, 'body missing help-open')
    need(probe.helpTitle === 'FIELD MANUAL', `help title ${probe.helpTitle}`)
    need(probe.helpExpanded === 'true', `aria-expanded ${probe.helpExpanded}`)
    need(probe.centerVisibility === 'hidden', `centre still ${probe.centerVisibility}`)
    need(probe.pausedHidden === true, 'pause card showing')
    need(probe.scoresHidden === true, 'scores showing')
    need(probe.creditsHidden === true, 'credits showing')
    need(probe.settingsHidden === true, 'settings showing')
    need(probe.lessonHidden === true, 'lesson showing')
    need(probe.rotateHidden === true, 'rotate overlay showing')
  } else if (name === 'storage-empty') {
    const keys = Object.keys(probe.storage || {})
    need(keys.length === 0, `storage ${JSON.stringify(probe.storage)}`)
  } else if (name === 'jump-to-begin') {
    const mode = args.mode || 'run'
    need(probe.pausedHidden === false, 'pause card hidden')
    need(probe.pausedReason === 'begin', `reason ${probe.pausedReason}`)
    need(probe.pausedTitle === 'JUMP TO BEGIN', `title ${probe.pausedTitle}`)
    need(probe.pausedSub === 'SPACE · CLICK · ↑', `sub ${probe.pausedSub}`)
    need(probe.centerHidden === true, 'centre card still up')
    need(probe.helpHidden === true, 'help open')
    need(probe.lessonHidden === true, 'lesson showing')
    need(probe.pauseBtnHidden === true, 'PAUSE button visible during the begin hold')
    need(probe.mode === mode, `mode ${probe.mode}`)
    need(probe.rotateHidden === true, 'rotate overlay showing')
    if (mode === 'tutorial') need(probe.scoreDisplay === 'none', `score display ${probe.scoreDisplay}`)
    else need(probe.score === '0', `score ${probe.score}`)
  } else if (name === 'live') {
    const mode = args.mode || 'run'
    need(probe.pausedHidden === true, 'still held')
    need(probe.centerHidden === true, 'centre card up')
    need(probe.lessonHidden === true, 'lesson showing')
    need(probe.helpHidden === true, 'help open')
    need(probe.pauseBtnHidden === false, 'PAUSE button hidden')
    need(probe.mode === mode, `mode ${probe.mode}`)
    need(probe.rotateHidden === true, 'rotate overlay showing')
    if (mode === 'tutorial') {
      need(probe.tutorialTagHidden === false, 'TUTORIAL tag hidden')
      need(probe.exitHidden === false, 'MENU button hidden')
      need(probe.scoreDisplay === 'none', `score display ${probe.scoreDisplay}`)
    }
  } else if (name === 'pause-menu') {
    need(probe.pausedReason === 'menu', `reason ${probe.pausedReason}`)
    need(probe.pausedTitle === 'PAUSED', `title ${probe.pausedTitle}`)
    need(probe.continueHidden === false, 'CONTINUE hidden')
    need(probe.quitHidden === false, 'QUIT hidden')
    need(probe.pauseBtnHidden === true, 'PAUSE button visible while the menu is up')
    need(probe.centerHidden === true, 'centre card up')
  } else if (name === 'flight-card') {
    need(probe.lessonHidden === false, 'lesson hidden')
    need(probe.lessonTitle === 'FLIGHT', `lesson ${probe.lessonTitle}`)
    need(probe.lessonTap === 'SPACE TO CONTINUE', `hint ${probe.lessonTap}`)
    need(probe.pausedHidden === true, 'pause card covering the lesson')
    need(probe.mode === 'tutorial', `mode ${probe.mode}`)
    need(probe.tutorialTagHidden === false, 'TUTORIAL tag hidden')
    need(probe.exitHidden === false, 'MENU button hidden')
    need(probe.scoreDisplay === 'none', `score display ${probe.scoreDisplay}`)
    need(probe.helpHidden === true, 'help open')
    need(probe.rotateHidden === true, 'rotate overlay showing')
  } else if (name === 'dead') {
    need(probe.heading === 'REBOOT', `heading ${probe.heading}`)
    need(probe.prompt === 'RUN 0', `prompt ${probe.prompt}`)
    need(probe.promptHidden === false, 'prompt hidden')
    need(probe.menuHidden === true, 'menu still showing')
    need(probe.centerHidden === false, 'centre card hidden')
    need(probe.helpHidden === true && probe.helpOpenClass === false, 'help open')
    need(probe.pausedHidden === true, 'pause card showing')
    need(probe.mode === 'run', `mode ${probe.mode}`)
  } else if (name === 'scores-offline') {
    const board = args.board || 'run'
    need(probe.scoresHidden === false, 'scores hidden')
    need(probe.scoresStatus === 'BOARD OFFLINE', `status ${probe.scoresStatus}`)
    need(probe.scoresStatusHidden === false, 'status hidden')
    need(probe.scoresTab === board, `tab ${probe.scoresTab}`)
    need(probe.helpHidden === true, 'help open')
    need(probe.creditsHidden === true, 'credits showing')
    need(probe.settingsHidden === true, 'settings showing')
  } else if (name === 'scores-online') {
    const board = args.board || 'run'
    need(probe.scoresHidden === false, 'scores hidden')
    need(probe.scoresReach === 'online', `reach ${probe.scoresReach} status ${probe.scoresStatus}`)
    need(probe.scoresStatus !== 'BOARD OFFLINE', 'board offline')
    need(probe.scoresTab === board, `tab ${probe.scoresTab}`)
    need(probe.helpHidden === true, 'help open')
    need(probe.creditsHidden === true, 'credits showing')
    need(probe.settingsHidden === true, 'settings showing')
  } else if (name === 'desktop-offline') {
    need(probe.desktop === true, 'not the desktop shell')
    need(probe.apiOrigin === '', `apiOrigin ${JSON.stringify(probe.apiOrigin)}`)
    need(String(probe.href || '').startsWith('magpie://app'), `href ${probe.href}`)
  } else if (name === 'desktop-online') {
    need(probe.desktop === true, 'not the desktop shell')
    need(probe.apiOrigin === PRODUCTION_ORIGIN, `apiOrigin ${JSON.stringify(probe.apiOrigin)}`)
    need(String(probe.href || '').startsWith('magpie://app'), `href ${probe.href}`)
  } else if (name === 'credits') {
    need(probe.creditsHidden === false, 'credits hidden')
    need(probe.creditsTitle === 'CREDITS', `title ${probe.creditsTitle}`)
    need(probe.creditsText.includes('TheSameCat'), `credits text ${probe.creditsText}`)
    need(probe.creditsText.includes('ESC TO RETURN'), 'missing ESC TO RETURN')
    need(probe.helpHidden === true, 'help open')
    need(probe.scoresHidden === true, 'scores showing')
    need(probe.settingsHidden === true, 'settings showing')
  } else if (name === 'settings') {
    need(probe.settingsHidden === false, 'settings hidden')
    need(probe.settingsTitle === 'SETTINGS', `title ${probe.settingsTitle}`)
    need(probe.centerHidden === true, 'centre card still up')
    need(probe.creditsHidden === true, 'credits showing')
    need(probe.scoresHidden === true, 'scores showing')
    need(probe.helpHidden === true, 'help open')
    need(probe.settingsRow === 'master', `row ${probe.settingsRow}`)
    need(probe.settingsMaster === '100', `master ${probe.settingsMaster}`)
    need(probe.settingsMusic === '100', `music ${probe.settingsMusic}`)
    need(probe.settingsEffects === '100', `effects ${probe.settingsEffects}`)
    need(probe.settingsQuality === 'auto', `quality ${probe.settingsQuality}`)
    need(probe.settingsCaption === 'DROPS A RUNG IF FRAMES RUN LONG', `caption ${probe.settingsCaption}`)
    need(String(probe.settingsText).includes('ESC RETURN'), 'missing ESC RETURN')
  } else if (name === 'toast') {
    const text = args.text
    need(text, 'missing --text')
    need(probe.toast === text, `toast ${probe.toast}`)
    need(String(probe.toastClass).includes('show'), `toast class ${probe.toastClass}`)
  } else {
    throw new Error(`unknown expect ${name}`)
  }
  return problems
}

function shellSurface(surface) {
  return surface === 'desktop' || surface === 'packaged'
}

function surfaceOf(args) {
  const surface = args.surface || 'vite'
  if (!SURFACES.has(surface)) {
    throw new Error(`unknown --surface ${surface}. Known: vite, production, desktop, packaged`)
  }
  return surface
}

function surfaceUrl(surface, port) {
  if (surface === 'production') return `${PRODUCTION_ORIGIN}/`
  if (shellSurface(surface)) return 'magpie://app/'
  return `http://127.0.0.1:${port}/`
}

function menuReady(probe, url) {
  return (
    probe?.title === 'MAGPIE-9' &&
    String(probe.href || '').startsWith(url) &&
    probe.canvas &&
    probe.webgl &&
    probe.input === 'keys' &&
    probe.visibility === 'visible' &&
    probe.heading === 'MAGPIE-9' &&
    currentItem(probe) === 'new' &&
    probe.blurb === MENU_BLURBS.new &&
    probe.score === '0' &&
    probe.best === 'BEST 0' &&
    probe.helpHidden &&
    probe.pausedHidden &&
    probe.rotateHidden &&
    probe.settingsHidden &&
    Object.keys(probe.storage || {}).length === 0
  )
}

function chromeLaunchArgs(cdpPort, profile) {
  return [
    '--headless=new',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    `--remote-debugging-port=${cdpPort}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${profile}`,
    `--window-size=${VIEW_W},${VIEW_H}`,
    '--force-device-scale-factor=1',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-sync',
    '--disable-extensions',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    'about:blank',
  ]
}

function electronBin(root) {
  const bin = path.join(root, 'desktop', 'node_modules', '.bin', 'electron')
  if (!fs.existsSync(bin)) {
    throw new Error('electron is not installed. From desktop/, run: npm install')
  }
  return bin
}

function syncRenderer(root) {
  const script = path.join(root, 'desktop', 'scripts', 'sync-renderer.js')
  const result = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'sync renderer failed').trim())
  }
}

function packagedBin(root) {
  const bin = process.env.MAGPIE_VERIFY_PACKAGED
    ? path.resolve(process.env.MAGPIE_VERIFY_PACKAGED)
    : path.join(root, 'desktop', 'release', 'linux-unpacked', 'magpie-9')
  if (!fs.existsSync(bin)) {
    throw new Error(
      `packaged binary not found at ${bin}. On Linux, \`npm run build && npm run dist --prefix desktop\` writes desktop/release/linux-unpacked/magpie-9. The deb target may fail after that directory exists. \`electron .\` is unpackaged and stays offline. Set MAGPIE_VERIFY_PACKAGED to another packaged binary.`,
    )
  }
  return bin
}

function shellLaunchArgs(cdpPort, profile) {
  return [
    `--remote-debugging-port=${cdpPort}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${profile}`,
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
  ]
}

// A value inherited from this process would proxy. Both shell recipes leave it unset:
// unpackaged then stays offline, and packaged falls through to the public board.
function shellEnv() {
  const env = { ...process.env }
  delete env.MAGPIE_API_ORIGIN
  delete env.MAGPIE_DEV_SERVER
  delete env.MAGPIE_DEBUG
  return env
}

async function launch(args) {
  const surface = surfaceOf(args)
  const root = repoRoot()
  const pkg = readJson(path.join(root, 'package.json'))
  if (pkg.name !== 'magpie-9') throw new Error(`expected magpie-9 at ${root}, found ${pkg.name}`)
  const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')
  if (surface === 'vite' && !fs.existsSync(viteBin)) {
    throw new Error('vite is not installed. From the repo root, run npm install.')
  }
  if (surface === 'desktop') {
    electronBin(root)
    if (!fs.existsSync(path.join(root, 'dist', 'index.html'))) {
      throw new Error('Missing dist/index.html. From the repo root, run: npm run build')
    }
  }
  if (surface === 'packaged') packagedBin(root)
  const chrome = process.env.MAGPIE_VERIFY_CHROME || 'google-chrome'
  const runId = process.env.MAGPIE_VERIFY_RUN_ID || Date.now().toString(36)
  const home = process.env.MAGPIE_VERIFY_HOME
    ? path.resolve(process.env.MAGPIE_VERIFY_HOME)
    : `/tmp/magpie-verify/${runId}`
  const evidence = process.env.MAGPIE_VERIFY_EVIDENCE
    ? path.resolve(process.env.MAGPIE_VERIFY_EVIDENCE)
    : `/tmp/magpie-verify-evidence/${runId}`
  if (fs.existsSync(statePath(home))) {
    throw new Error(`${home} already has a run.json. Cleanup that instance before launching another.`)
  }
  if (!process.env.MAGPIE_VERIFY_HOME && fs.existsSync(LATEST)) {
    const previousHome = fs.readFileSync(LATEST, 'utf8').trim()
    if (fs.existsSync(statePath(previousHome))) {
      const previous = readJson(statePath(previousHome))
      if (alive(previous.vitePid) || alive(previous.chromePid) || alive(previous.shellPid)) {
        throw new Error(
          `instance already running at ${previousHome}. Cleanup it, or set MAGPIE_VERIFY_HOME for a second one.`,
        )
      }
    }
  }
  const resolvedHome = path.resolve(home)
  const resolvedEvidence = path.resolve(evidence)
  const resolvedRoot = path.resolve(root)
  if (resolvedEvidence === resolvedRoot || resolvedEvidence.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(
      'MAGPIE_VERIFY_EVIDENCE must sit outside the repo so proof is not mixed into the game tree',
    )
  }
  if (
    resolvedEvidence === resolvedHome ||
    resolvedEvidence.startsWith(`${resolvedHome}${path.sep}`) ||
    resolvedHome.startsWith(`${resolvedEvidence}${path.sep}`)
  ) {
    throw new Error('evidence dir must sit outside the run home so cleanup can keep the proof')
  }

  const port = surface === 'vite' ? Number(process.env.MAGPIE_VERIFY_PORT) || (await freePort()) : null
  const cdpPort = Number(process.env.MAGPIE_VERIFY_CDP_PORT) || (await freePort())
  const profile = path.join(home, shellSurface(surface) ? 'electron-data' : 'chrome-profile')
  fs.mkdirSync(profile, { recursive: true })
  fs.mkdirSync(evidence, { recursive: true })
  const revision = revisionOf(root)
  const state = {
    app: 'magpie-9',
    version: pkg.version,
    revision,
    surface,
    root,
    home,
    evidence,
    url: surfaceUrl(surface, port),
    port,
    cdpPort,
    vitePid: null,
    chromePid: null,
    shellPid: null,
    chromeBin: chrome,
    profile,
    startedAt: new Date().toISOString(),
  }
  writeJson(statePath(home), state)
  rememberLatest(state)

  const fail = async (error) => {
    await killTree(state.vitePid)
    await killTree(state.chromePid)
    await killTree(state.shellPid)
    throw error
  }

  try {
    if (surface === 'vite') {
      state.vitePid = spawnDetached(
        process.execPath,
        [viteBin, '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
        {
          cwd: root,
          env: { ...process.env, BROWSER: 'none' },
          logPath: path.join(home, 'vite.log'),
        },
      )
    }
    if (shellSurface(surface)) {
      const bin = surface === 'packaged' ? packagedBin(root) : electronBin(root)
      if (surface === 'desktop') syncRenderer(root)
      state.shellPid = spawnDetached(
        bin,
        [...(surface === 'packaged' ? [] : ['.']), ...shellLaunchArgs(cdpPort, profile)],
        {
          cwd: surface === 'packaged' ? path.dirname(bin) : path.join(root, 'desktop'),
          env: shellEnv(),
          logPath: path.join(home, 'shell.log'),
        },
      )
    } else {
      state.chromePid = spawnDetached(chrome, chromeLaunchArgs(cdpPort, profile), {
        cwd: root,
        env: process.env,
        logPath: path.join(home, 'chrome.log'),
      })
    }
    writeJson(statePath(home), state)

    const deadline = Date.now() + 60000
    if (surface === 'vite') {
      let httpOk = false
      while (Date.now() < deadline) {
        if (!alive(state.vitePid))
          throw new Error(`vite exited early\n${fs.readFileSync(path.join(home, 'vite.log'), 'utf8')}`)
        try {
          const response = await fetch(state.url)
          const body = await response.text()
          if (response.ok && body.includes('MAGPIE-9')) {
            httpOk = true
            break
          }
        } catch {
          /* not listening yet */
        }
        await sleep(200)
      }
      if (!httpOk) throw new Error(`vite did not serve MAGPIE-9 at ${state.url}`)
    }

    const client = await connectCdp((await pageTarget(cdpPort, deadline)).webSocketDebuggerUrl)
    try {
      await client.call('Runtime.enable')
      await client.call('Page.enable')
      await client.call('Emulation.setDeviceMetricsOverride', {
        width: VIEW_W,
        height: VIEW_H,
        deviceScaleFactor: 1,
        mobile: false,
      })
      // The shell loads magpie://app itself. CDP rejects a second navigation to
      // that scheme on a packaged binary ("invalid URL") even though the page is open.
      if (!shellSurface(surface)) await client.call('Page.navigate', { url: state.url })
      let probe = null
      let ready = false
      let probeError = null
      const browserLog = path.join(home, shellSurface(surface) ? 'shell.log' : 'chrome.log')
      const browserPid = shellSurface(surface) ? state.shellPid : state.chromePid
      while (Date.now() < deadline) {
        if (!alive(browserPid)) {
          const log = fs.existsSync(browserLog) ? fs.readFileSync(browserLog, 'utf8') : ''
          throw new Error(`${surface} browser exited early\n${log}`)
        }
        // A navigation commits with no documentElement for a moment. That throw
        // is the page not being ready, not a failed launch.
        try {
          probe = await readProbe(client)
          probeError = null
        } catch (error) {
          probe = null
          probeError = error
        }
        if (probe && menuReady(probe, state.url) && client.exceptions.length === 0) {
          ready = true
          break
        }
        await sleep(250)
      }
      if (!ready) {
        const detail = probe ? formatProbe(probe, state) : String(probeError || 'no probe')
        const errors = client.exceptions.length ? `\nexceptions:\n${client.exceptions.join('\n')}` : ''
        throw new Error(`game was not usable at ${state.url}\n${detail}${errors}`)
      }
    } finally {
      client.close()
    }

    if (surface === 'vite') {
      const portOwner = ownsPort(state.vitePid, state.port)
      if (!portOwner.ok) throw new Error(portOwner.reason)
    }
    writeJson(statePath(home), state)
    writeJson(path.join(evidence, 'instance.json'), state)
    logAction(state, `launch surface=${surface} ${state.url} revision ${revision}`)
    console.log(
      `ready surface=${surface} url=${state.url} home=${home} evidence=${evidence} revision=${revision}`,
    )
  } catch (error) {
    await fail(error)
  }
}

async function doctor() {
  const state = loadState()
  const surface = state.surface || 'vite'
  const problems = []
  if (surface === 'vite') {
    if (!alive(state.vitePid)) problems.push(`vite pid ${state.vitePid} is not running`)
    if (alive(state.vitePid)) {
      const owner = ownsPort(state.vitePid, state.port)
      if (!owner.ok) problems.push(owner.reason)
      if (!cmdline(state.vitePid).includes('vite'))
        problems.push(`vite pid cmdline is not vite: ${cmdline(state.vitePid)}`)
    }
  }
  if (shellSurface(surface)) {
    if (!alive(state.shellPid)) problems.push(`electron pid ${state.shellPid} is not running`)
    if (alive(state.shellPid) && !cmdline(state.shellPid).includes(state.profile)) {
      problems.push('electron pid is not using this run data dir')
    }
  } else if (!alive(state.chromePid)) {
    problems.push(`chrome pid ${state.chromePid} is not running`)
  } else if (!cmdline(state.chromePid).includes(state.profile)) {
    problems.push('chrome pid is not using this run profile')
  }
  let probe = null
  let exceptions = []
  const browserPid = shellSurface(surface) ? state.shellPid : state.chromePid
  if (alive(browserPid)) {
    try {
      await withPage(state, async (client) => {
        // Closing the launch DevTools socket can drop the WebGL context for a
        // frame. A missing canvas on a page that is already MAGPIE-9 is that gap.
        const deadline = Date.now() + 3000
        probe = await readProbe(client)
        while (probe && probe.title === 'MAGPIE-9' && !probe.canvas && Date.now() < deadline) {
          await sleep(200)
          probe = await readProbe(client)
        }
        exceptions = client.exceptions.slice()
      })
    } catch (error) {
      problems.push(error.message)
    }
  }
  if (probe) {
    if (probe.title !== 'MAGPIE-9') problems.push(`title ${probe.title}`)
    if (!String(probe.href || '').startsWith(state.url)) problems.push(`href ${probe.href}`)
    if (!probe.canvas) problems.push('no canvas')
    if (!probe.webgl) problems.push('no WebGL context')
    if (probe.visibility !== 'visible') problems.push(`visibility ${probe.visibility}`)
    if (probe.rotateHidden === false) problems.push('rotate overlay is up')
  }
  if (exceptions.length) problems.push(`uncaught: ${exceptions.join(' | ')}`)
  const report = {
    ok: problems.length === 0,
    revision: state.revision,
    version: state.version,
    surface,
    url: state.url,
    vitePid: state.vitePid,
    chromePid: state.chromePid,
    shellPid: state.shellPid || null,
    webgl: probe?.webgl || null,
    visibility: probe?.visibility || null,
    problems,
  }
  fs.mkdirSync(state.evidence, { recursive: true })
  writeJson(path.join(state.evidence, 'doctor.json'), report)
  logAction(state, `doctor ${report.ok ? 'ok' : 'fail'}`)
  console.log(JSON.stringify(report, null, 2))
  if (!report.ok) process.exitCode = 1
}

async function click(args) {
  const state = loadState()
  const selector = args.selector
  const region = args.region
  if (!selector) throw new Error('click requires --selector')
  if (region && region !== 'backdrop') throw new Error(`unknown --region ${region}`)
  await withPage(state, async (client) => {
    const field = args['wait-field']
    const equals = args['wait-equals']
    if ((field && equals == null) || (!field && equals != null)) {
      throw new Error('click wait requires both --wait-field and --wait-equals')
    }
    // Without a wait, the shot is the screen the press is about to hit. Taking
    // it in a later command lets a falling run crash before PAUSE can be clicked.
    if (!field && (args.screenshot || args.snapshot)) {
      const before = await readProbe(client)
      if (args.snapshot) console.log(`ok snapshot ${await writeSnapshot(state, before, args.snapshot)}`)
      if (args.screenshot)
        console.log(`ok screenshot ${await writeScreenshot(client, state, args.screenshot)}`)
    }
    const point = await evaluate(
      client,
      `(() => {
        const root = document.querySelector(${JSON.stringify(selector)})
        if (!root) return { ok: false, reason: 'missing' }
        const describe = (el) => (el ? el.id || el.className || el.tagName : 'none')
        if (${JSON.stringify(region || '')} === 'backdrop') {
          const card = root.querySelector('.help-card')
          if (!card) return { ok: false, reason: 'no help card' }
          const rect = root.getBoundingClientRect()
          const candidates = [
            [rect.left + 6, rect.top + rect.height / 2],
            [rect.right - 6, rect.top + rect.height / 2],
            [rect.left + rect.width / 2, rect.top + 6],
          ]
          for (const [x, y] of candidates) {
            if (document.elementFromPoint(x, y) === root) return { ok: true, x, y }
          }
          return { ok: false, reason: 'no backdrop point outside the card' }
        }
        const style = getComputedStyle(root)
        if (root.classList.contains('hidden') || style.display === 'none' || style.visibility === 'hidden') {
          return { ok: false, reason: 'not visible' }
        }
        root.scrollIntoView({ block: 'center', inline: 'center' })
        const box = root.getBoundingClientRect()
        if (box.width < 1 || box.height < 1) return { ok: false, reason: 'zero box' }
        const x = box.left + box.width / 2
        const y = box.top + box.height / 2
        const hit = document.elementFromPoint(x, y)
        if (hit !== root && !root.contains(hit)) {
          return { ok: false, reason: 'obscured by ' + describe(hit) + ' at ' + Math.round(x) + ',' + Math.round(y) }
        }
        return { ok: true, x, y }
      })()`,
    )
    if (!point?.ok) throw new Error(`click ${selector} failed: ${point?.reason || 'no point'}`)
    await client.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y })
    await client.call('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: point.x,
      y: point.y,
      button: 'left',
      buttons: 1,
      clickCount: 1,
    })
    await client.call('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: point.x,
      y: point.y,
      button: 'left',
      buttons: 0,
      clickCount: 1,
    })
    await waitFrames(client)
    if (client.exceptions.length) throw new Error(client.exceptions.join(' | '))
    if (field) {
      const matched = await pollProbe(client, {
        field,
        equals: String(equals),
        timeout: Number(args.timeout || 2000),
      })
      await captureMatch(client, state, matched, args)
    }
  })
  const waited = args['wait-field'] ? ` wait ${args['wait-field']}=${args['wait-equals']}` : ''
  const shot = args.screenshot ? ` screenshot ${args.screenshot}` : ''
  const snap = args.snapshot ? ` snapshot ${args.snapshot}` : ''
  logAction(state, `click ${selector}${region ? ` region=${region}` : ''}${waited}${snap}${shot}`)
  console.log(`ok click ${selector}${region ? ` ${region}` : ''}${waited}`)
}

async function press(args) {
  const state = loadState()
  const name = args.key
  const spec = KEYS[name]
  if (!spec) throw new Error(`unsupported --key ${name}. Known: ${Object.keys(KEYS).join(', ')}`)
  await withPage(state, async (client) => {
    const dispatch = (type) =>
      client.call('Input.dispatchKeyEvent', {
        type,
        key: spec.key,
        code: spec.code,
        windowsVirtualKeyCode: spec.vk,
        nativeVirtualKeyCode: spec.vk,
        text: type === 'keyDown' ? spec.text || '' : '',
        unmodifiedText: type === 'keyDown' ? spec.text || '' : '',
      })
    await dispatch('keyDown')
    await dispatch('keyUp')
    await waitFrames(client)
    if (client.exceptions.length) throw new Error(client.exceptions.join(' | '))
  })
  logAction(state, `press ${name}`)
  console.log(`ok press ${name}`)
}

async function blur() {
  const state = loadState()
  await withPage(state, async (client) => {
    await evaluate(client, `(document.activeElement && document.activeElement.blur(), true)`)
    await waitFrames(client)
  })
  logAction(state, 'blur')
  console.log('ok blur')
}

async function capture(args, kind) {
  const state = loadState()
  const target = evidenceFile(state, args.path)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  await withPage(state, async (client) => {
    if (kind === 'screenshot') {
      const shot = await client.call('Page.captureScreenshot', { format: 'png' })
      fs.writeFileSync(target, Buffer.from(shot.data, 'base64'))
    } else {
      const probe = await readProbe(client)
      fs.writeFileSync(target, formatProbe(probe, state))
    }
    if (client.exceptions.length) throw new Error(client.exceptions.join(' | '))
  })
  logAction(state, `${kind} ${path.relative(state.evidence, target)}`)
  console.log(`ok ${kind} ${target}`)
}

async function storage() {
  const state = loadState()
  let probe = null
  await withPage(state, async (client) => {
    probe = await readProbe(client)
  })
  const body = `${JSON.stringify(probe.storage, null, 2)}\n`
  const target = path.join(state.evidence, 'storage.json')
  fs.writeFileSync(target, body)
  logAction(state, 'storage')
  process.stdout.write(body)
}

async function expect(args) {
  const state = loadState()
  const name = args._[0]
  if (!name) throw new Error('expect requires a state name')
  let probe = null
  await withPage(state, async (client) => {
    probe = await readProbe(client)
    if (client.exceptions.length) throw new Error(client.exceptions.join(' | '))
  })
  const problems = problemsFor(name, probe, args)
  if (problems.length) {
    logAction(state, `expect ${name} FAIL ${problems.join('; ')}`)
    console.error(`fail expect ${name}\n${problems.map((item) => `- ${item}`).join('\n')}`)
    process.exitCode = 1
    return
  }
  logAction(state, `expect ${name} ok`)
  console.log(`ok expect ${name}`)
}

async function wait(args) {
  const state = loadState()
  if (args.ms) {
    await sleep(Number(args.ms))
    logAction(state, `wait ms=${args.ms}`)
    console.log(`ok wait ${args.ms}ms`)
    return
  }
  if (!args.field || args.equals == null) throw new Error('wait requires --ms, or --field and --equals')
  const timeout = Number(args.timeout || 5000)
  await withPage(state, async (client) => {
    const matched = await pollProbe(client, { field: args.field, equals: String(args.equals), timeout })
    await captureMatch(client, state, matched, args)
  })
  const shot = args.screenshot ? ` screenshot ${args.screenshot}` : ''
  const snap = args.snapshot ? ` snapshot ${args.snapshot}` : ''
  logAction(state, `wait ${args.field}=${args.equals}${snap}${shot}`)
  console.log(`ok wait ${args.field}=${args.equals}`)
}

async function cleanup() {
  let state
  try {
    state = loadState()
  } catch (error) {
    console.log(`ok cleanup nothing (${error.message})`)
    return
  }
  await killTree(state.chromePid)
  await killTree(state.shellPid)
  await killTree(state.vitePid)
  const evidence = path.resolve(state.evidence)
  if (fs.existsSync(state.home)) fs.rmSync(state.home, { recursive: true, force: true })
  forgetLatest(state)
  if (!fs.existsSync(evidence)) {
    console.error(`cleanup removed evidence at ${evidence}`)
    process.exitCode = 1
    return
  }
  console.log(`ok cleanup home removed, evidence kept at ${evidence}`)
}

function usage() {
  return `magpie-verify commands:
  launch [--surface vite|production|desktop|packaged]
  doctor
  click --selector <css> [--region backdrop] [--wait-field <field> --wait-equals <value> [--timeout ms] [--snapshot <path>] [--screenshot <path>]]
  wait --field <probeField> --equals <value> [--timeout ms] [--snapshot <path>] [--screenshot <path>] | wait --ms <n>
  press --key <key>
  blur
  screenshot --path <evidence-relative>
  snapshot --path <evidence-relative>
  storage
  expect <menu|menu-item|help-open|storage-empty|jump-to-begin|live|pause-menu|flight-card|dead|scores-offline|scores-online|desktop-offline|desktop-online|credits|settings|toast> [--item|--mode|--board|--text]
  cleanup`
}

const command = process.argv[2]
const args = parseArgs(process.argv.slice(3))

try {
  if (command === 'launch') await launch(args)
  else if (command === 'doctor') await doctor()
  else if (command === 'click') await click(args)
  else if (command === 'press') await press(args)
  else if (command === 'blur') await blur()
  else if (command === 'screenshot') await capture(args, 'screenshot')
  else if (command === 'snapshot') await capture(args, 'snapshot')
  else if (command === 'storage') await storage()
  else if (command === 'expect') await expect(args)
  else if (command === 'wait') await wait(args)
  else if (command === 'cleanup') await cleanup()
  else {
    console.log(usage())
    process.exitCode = command ? 1 : 0
  }
} catch (error) {
  console.error(error.message || error)
  process.exitCode = 1
}

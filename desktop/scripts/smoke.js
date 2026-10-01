// Launch the unpackaged shell and check, over the DevTools protocol, that the
// Vite build actually booted: title, canvas, WebGL, and the preload bridge.
// Does not play the game.

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const port = 9333
const electron = path.join(desktop, 'node_modules', '.bin', 'electron')

if (!fs.existsSync(electron)) {
  console.error('electron is not installed. From desktop/, run: npm install')
  process.exit(1)
}

const child = spawn(electron, ['.', `--remote-debugging-port=${port}`, '--remote-allow-origins=*'], {
  cwd: desktop,
  env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let stderr = ''
child.stderr.on('data', (chunk) => {
  stderr += chunk.toString()
})
child.stdout.on('data', (chunk) => {
  stderr += chunk.toString()
})

const deadline = Date.now() + 30000
let closed = false
child.on('exit', () => {
  closed = true
})

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function pageTarget() {
  while (Date.now() < deadline) {
    if (closed) throw new Error(`electron exited early\n${stderr}`)
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json`)
      const targets = await res.json()
      const page = targets.find((item) => item.type === 'page' && item.webSocketDebuggerUrl)
      if (page) return page
    } catch {
      /* port not up yet */
    }
    await sleep(200)
  }
  throw new Error(`no page target on :${port}\n${stderr}`)
}

function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl)
  let next = 1
  const pending = new Map()
  const exceptions = []
  const consoleErrors = []

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data)
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg)
      pending.delete(msg.id)
      return
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      exceptions.push(
        msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text,
      )
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      const text = msg.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' ')
      consoleErrors.push(text)
    }
  })

  return new Promise((resolve, reject) => {
    ws.addEventListener('open', () => {
      resolve({
        exceptions,
        consoleErrors,
        call(method, params = {}) {
          const id = next++
          ws.send(JSON.stringify({ id, method, params }))
          return new Promise((res, rej) => {
            const timer = setTimeout(() => rej(new Error(`CDP timeout: ${method}`)), 8000)
            pending.set(id, (msg) => {
              clearTimeout(timer)
              if (msg.error) rej(new Error(msg.error.message))
              else res(msg.result)
            })
          })
        },
        close() {
          ws.close()
        },
      })
    })
    ws.addEventListener('error', () => reject(new Error('devtools socket failed')))
  })
}

const PROBE = `(() => {
  const canvas = document.querySelector('canvas')
  const gl = canvas && (canvas.getContext('webgl2') || canvas.getContext('webgl'))
  let renderer = null
  if (gl) {
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
  }
  return {
    title: document.title,
    href: location.href,
    origin: location.origin,
    canvas: !!canvas,
    webgl: renderer,
    size: [window.innerWidth, window.innerHeight],
    desktop: globalThis.magpieDesktop
      ? { desktop: globalThis.magpieDesktop.desktop, apiOrigin: globalThis.magpieDesktop.apiOrigin, onFocus: typeof globalThis.magpieDesktop.onFocus }
      : null,
    score: document.querySelector('#score')?.textContent ?? null,
    menu: !!document.querySelector('#menu button'),
  }
})()`

try {
  const target = await pageTarget()
  const client = await cdp(target.webSocketDebuggerUrl)
  await client.call('Runtime.enable')

  let probe = null
  while (Date.now() < deadline) {
    const result = await client.call('Runtime.evaluate', {
      expression: PROBE,
      returnByValue: true,
    })
    probe = result.result?.value
    if (probe?.canvas && probe.webgl) break
    await sleep(250)
  }

  const board = await client.call('Runtime.evaluate', {
    expression: `fetch('/api/scores').then(async (res) => ({ status: res.status, body: await res.json() }))`,
    awaitPromise: true,
    returnByValue: true,
  })

  const shot = await client.call('Page.captureScreenshot', { format: 'png' })
  const shotPath = path.join(os.tmpdir(), 'magpie-electron.png')
  fs.mkdirSync(path.dirname(shotPath), { recursive: true })
  fs.writeFileSync(shotPath, Buffer.from(shot.data, 'base64'))

  client.close()
  child.kill('SIGTERM')

  const failures = []
  if (!probe?.canvas) failures.push('no canvas')
  if (!probe?.webgl) failures.push('no WebGL context')
  if (probe?.title !== 'MAGPIE-9') failures.push(`title ${probe?.title}`)
  if (probe?.origin !== 'magpie://app') failures.push(`origin ${probe?.origin}`)
  if (probe?.desktop?.desktop !== true) failures.push(`bridge ${JSON.stringify(probe?.desktop)}`)
  if (probe?.score == null) failures.push('HUD score node missing')
  if (probe?.menu !== true) failures.push('menu missing')
  if (probe?.size?.[0] !== 1280 || probe?.size?.[1] !== 800) failures.push(`size ${probe?.size}`)
  if (/llvmpipe|swiftshader|software/i.test(probe?.webgl || '')) {
    failures.push(`software renderer ${probe.webgl}`)
  }
  if (probe?.desktop?.onFocus !== 'function') failures.push('focus bridge missing')
  if (client.exceptions.length) failures.push(`uncaught: ${client.exceptions.join(' | ')}`)

  const api = board.result?.value
  const offline = api?.status === 503 && api?.body?.error === 'BOARD OFFLINE'
  const proxied = api && api.status !== 404
  if (!offline && !proxied) failures.push(`api ${JSON.stringify(api)}`)

  const report = {
    ok: failures.length === 0,
    probe,
    api,
    screenshot: shotPath,
    shaderErrors: client.consoleErrors.filter((line) => /shader/i.test(line)).length,
    failures,
  }
  console.log(JSON.stringify(report, null, 2))
  process.exit(failures.length ? 1 : 0)
} catch (error) {
  child.kill('SIGTERM')
  console.error(error?.stack || String(error))
  process.exit(1)
}

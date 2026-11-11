import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createGame,
  rewindDistance,
  pauseTapAction,
  heldPauseReason,
  RESUME_COUNTDOWN,
  DEAD_GRACE,
} from './index.js'
import {
  SHUNT_GATES,
  SHUNT_SPEED,
  difficulty,
  pickLifeSlot,
  rollOrbType,
  stageDelta,
} from '../config/rules.js'
import { UNIFORMS } from '../render/uniforms.js'
import { createBends } from '../world/bends.js'
import { createCameraRig } from './camera.js'

test('difficulty at score 0 is the base speed', () => {
  assert.equal(difficulty(0).speed, 12)
})

test('difficulty offset floors after the tutorial and caps at 1.8', () => {
  assert.equal(difficulty(0).offset, 0.8)
  assert.ok(Math.abs(difficulty(2).offset - 1.04) < 1e-9)
  assert.equal(difficulty(20).offset, 1.8)
})

test('stageDelta(0) is zero', () => {
  assert.equal(stageDelta(0), 0)
})

test('stageDelta(1) is about 0.252', () => {
  assert.ok(Math.abs(stageDelta(1) - 0.252) < 1e-9)
})

test('stageDelta is zero at the speed cap', () => {
  assert.equal(stageDelta(40), 0)
})

test('half of stageDelta(n) is 1.05% of the previous speed below the cap', () => {
  for (const n of [1, 5, 10, 15]) {
    const half = 0.5 * stageDelta(n)
    const expected = 0.0105 * difficulty(n - 1).speed
    assert.ok(Math.abs(half - expected) < 1e-9, `score ${n}`)
  }
})

test('rewindDistance puts the last gate just behind the bird', () => {
  assert.equal(rewindDistance(0, 28), 26.8)
})

test('rewindDistance never moves the world forward', () => {
  assert.equal(rewindDistance(-27, 28), 0)
})

test('rewindDistance from partway through a gap', () => {
  assert.equal(rewindDistance(-5, 18), 11.8)
})

test('pickLifeSlot stays inside the sector', () => {
  assert.equal(
    pickLifeSlot(10, () => 0.99),
    19,
  )
  assert.equal(
    pickLifeSlot(10, () => 0),
    10,
  )
})

test('pauseTapAction ignores taps while the run is live or blocked', () => {
  assert.equal(pauseTapAction({ paused: false, lesson: null, blocked: false }), 'ignore')
  assert.equal(pauseTapAction({ paused: true, lesson: null, blocked: true }), 'ignore')
})

test('pauseTapAction dismisses a lesson without releasing the run', () => {
  assert.equal(pauseTapAction({ paused: true, lesson: 'damper', blocked: false }), 'hold')
})

test('pauseTapAction resumes once the hold is only a jump prompt', () => {
  assert.equal(pauseTapAction({ paused: true, lesson: null, blocked: false }), 'resume')
})

test('pauseTapAction never lets a flap out of the pause menu', () => {
  assert.equal(pauseTapAction({ paused: true, lesson: null, blocked: false, menu: true }), 'ignore')
})

test('heldPauseReason keeps jump-to-begin through rotate and hide', () => {
  assert.equal(heldPauseReason('begin', 'hidden'), 'begin')
  assert.equal(heldPauseReason('begin', 'rotate'), 'begin')
  assert.equal(heldPauseReason('begin', 'begin'), 'begin')
})

test('heldPauseReason keeps the pause menu through rotate and hide', () => {
  assert.equal(heldPauseReason('menu', 'hidden'), 'menu')
  assert.equal(heldPauseReason('menu', 'rotate'), 'menu')
  assert.equal(heldPauseReason('menu', 'menu'), 'menu')
  assert.equal(heldPauseReason(null, 'menu'), 'menu')
})

test('heldPauseReason drops an interrupted countdown back to the pause menu', () => {
  assert.equal(heldPauseReason('countdown', 'hidden'), 'menu')
  assert.equal(heldPauseReason('countdown', 'rotate'), 'menu')
  assert.equal(heldPauseReason('countdown', 'menu'), 'menu')
})

test('heldPauseReason lets a lesson take the overlay', () => {
  assert.equal(heldPauseReason('begin', 'lesson'), 'lesson')
  assert.equal(heldPauseReason('lesson', 'resume'), 'resume')
  assert.equal(heldPauseReason(null, 'resume'), 'resume')
})

function memoryStore() {
  const store = new Map()
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  }
}

function stub() {
  return new Proxy(
    {},
    {
      get: (t, k) => {
        if (k in t) return t[k]
        if (k === 'then') return undefined
        return () => {}
      },
      set: (t, k, v) => {
        t[k] = v
        return true
      },
    },
  )
}

function mockApi(overrides = {}) {
  const filled = Array.from({ length: 10 }, () => ({ initials: 'AAA', score: 1 }))
  return {
    startRun: async (mode = 'run') =>
      mode === 'challenge'
        ? { token: 'challenge-token', seed: 42, day: '2026-09-14', target: 3, now: 1_000 }
        : { token: 'run-token' },
    fetchBoard: async (mode = 'run') =>
      mode === 'challenge' ? { board: filled, day: '2026-09-14', now: 1_000 } : { board: [] },
    submitScore: async () => ({ board: [], rank: 1 }),
    ...overrides,
  }
}

function harness(menuItem = 'new', god = true, api) {
  if (typeof globalThis.localStorage === 'undefined') {
    globalThis.localStorage = memoryStore()
  }
  let clockMs = 1_000
  const now = () => clockMs
  const input = {
    muteEdge: false,
    debugEdge: false,
    flapEdge: false,
    restartEdge: false,
    tapEdge: false,
    helpEdge: false,
    backEdge: false,
    pauseEdge: false,
    selectEdge: false,
    navEdge: 0,
    mode: 'keys',
    stick: { active: false, originX: 0, originY: 0, dx: 0 },
    lastTap: { x: 0, y: 0, at: 0 },
  }
  const bird = {
    x: 0,
    y: 0,
    bank: 0,
    vx: 0,
    thrustPulse: 0,
    pos: { x: 0, y: 0, z: 0 },
    exhaust: { x: 0, y: 0, z: 0 },
    flaps: 0,
    reset() {},
    setAfterburner() {},
    flap() {
      this.flaps += 1
    },
    kill() {},
    toggleCollider() {},
    updateIdle() {},
    updatePlay() {},
    updateDead() {},
  }
  const shown = []
  const hud = stub()
  hud.helpOpen = false
  hud.menuItem = menuItem
  hud.showPaused = (reason) => shown.push(reason)
  hud.hidePaused = () => shown.push('hide')
  let pauseUi = {}
  hud.bindPause = (handlers) => {
    pauseUi = handlers
  }
  let entryUi = {}
  hud.bindEntry = (handlers) => {
    entryUi = handlers
  }
  const powerups = stub()
  powerups.collect = (_pos, _r, out) => {
    out.length = 0
    return false
  }
  const gates = stub()
  gates.hits = () => null
  gates.collectPassed = () => false
  gates.slots = []
  const screen = {
    needsRotate: false,
    hidden: false,
    isFullscreen: false,
    supportsFullscreen: false,
    isStandalone: false,
  }
  const bends = createBends()
  const game = createGame({
    bird,
    tunnel: stub(),
    gates,
    powerups,
    bends,
    input,
    camera: {
      position: {
        x: 0,
        y: 0,
        z: 0,
        copy() {
          return this
        },
      },
      lookAt() {},
      rotateZ() {},
      fov: 68,
      updateProjectionMatrix() {},
    },
    audio: stub(),
    fx: stub(),
    postfx: stub(),
    screen,
    reduceMotion: true,
    god,
    hud,
    api: api ?? mockApi(),
    now,
  })
  function tap() {
    input.flapEdge = true
    input.tapEdge = true
    input.restartEdge = true
    game.update(1 / 60)
    input.flapEdge = false
    input.tapEdge = false
    input.restartEdge = false
  }
  function select() {
    input.selectEdge = true
    game.update(1 / 60)
    input.selectEdge = false
  }
  function pauseKey() {
    input.pauseEdge = true
    game.update(1 / 60)
    input.pauseEdge = false
  }
  function escKey() {
    input.backEdge = true
    game.update(1 / 60)
    input.backEdge = false
  }
  function advance(ms) {
    clockMs += ms
  }
  /** Let `ms` of wall-clock pass, then run one idle frame so the game notices. */
  function wait(ms) {
    advance(ms)
    game.update(1 / 60)
  }
  return {
    game,
    bird,
    input,
    powerups,
    gates,
    bends,
    shown,
    tap,
    select,
    pauseKey,
    escKey,
    advance,
    wait,
    hud,
    screen,
    pressPause: () => pauseUi.onPause?.(),
    pressContinue: () => pauseUi.onContinue?.(),
    pressQuit: () => pauseUi.onQuit?.(),
    pressEntry: (action) => entryUi.onAction?.(action),
  }
}

test('NEW GAME drops into a held run until the first jump', () => {
  const { game, bird, shown, select, tap } = harness('new')
  select()
  assert.equal(game.state, 'playing')
  assert.equal(game.mode, 'run')
  assert.equal(game.paused, true)
  assert.equal(game.pauseReason, 'begin')
  assert.equal(bird.flaps, 0)
  assert.equal(shown.at(-1), 'begin')
  tap()
  assert.equal(game.paused, false)
  assert.equal(game.pauseReason, null)
  assert.equal(bird.flaps, 1)
  assert.equal(shown.at(-1), 'hide')
})

test('TUTORIAL opens on the flight card, then waits for jump to begin', () => {
  const { game, shown, select, tap } = harness('tutorial')
  select()
  assert.equal(game.mode, 'tutorial')
  assert.equal(game.paused, true)
  assert.equal(game.lesson, 'flight')
  assert.equal(game.pauseReason, 'lesson')
  tap()
  assert.equal(game.lesson, null)
  assert.equal(game.pauseReason, 'begin')
  assert.equal(shown.at(-1), 'begin')
  tap()
  assert.equal(game.paused, false)
})

test('closing a tutorial explainer holds the run on jump to resume', () => {
  const { game, powerups, shown, select, tap } = harness('tutorial')
  select()
  tap()
  tap()
  assert.equal(game.paused, false)
  powerups.collect = (_pos, _r, out) => {
    out.length = 0
    out.push({ type: 'damper', x: 0, y: 0, z: 0 })
    return true
  }
  game.update(1 / 60)
  assert.equal(game.lesson, 'damper')
  assert.equal(game.paused, true)
  assert.equal(game.pauseReason, 'lesson')
  tap()
  assert.equal(game.lesson, null)
  assert.equal(game.paused, true)
  assert.equal(game.pauseReason, 'resume')
  assert.equal(shown.at(-1), 'resume')
  tap()
  assert.equal(game.paused, false)
  assert.equal(game.pauseReason, null)
})

test('rollOrbType splits shunts, dampers, and empty gates', () => {
  assert.equal(rollOrbType({ lifeDue: true }), 'life')
  assert.equal(rollOrbType({ rand: () => 0 }), 'shunt')
  assert.equal(rollOrbType({ rand: () => 0.14 }), 'shunt')
  assert.equal(rollOrbType({ rand: () => 0.2 }), 'damper')
  assert.equal(rollOrbType({ rand: () => 0.9 }), null)
})

function collectOnce(powerups, orb) {
  let armed = true
  powerups.collect = (_pos, _r, out) => {
    out.length = 0
    if (armed) {
      armed = false
      out.push(orb)
      return true
    }
    return false
  }
}

function gatePerFrame(gates) {
  gates.collectPassed = (out) => {
    out.length = 0
    out.push({ type: 'bulkhead', z: 0, depth: 0.3, hole: { x: 0, y: 0, w: 2.8, h: 3.2 } })
    return true
  }
}

test('shunt engages overdrive: double gates for five gates at +2 speed', () => {
  const { game, powerups, gates, select, tap } = harness('new')
  select()
  tap()
  const cruise = difficulty(game.score).speed
  collectOnce(powerups, { type: 'shunt', x: 0, y: 0, z: 0 })
  game.update(1 / 60)
  assert.equal(game.shuntLeft, SHUNT_GATES)
  assert.ok(Math.abs(game.speed - (cruise + SHUNT_SPEED)) < 1e-9)
  gatePerFrame(gates)
  for (let i = 0; i < SHUNT_GATES; i++) game.update(1 / 60)
  assert.equal(game.shuntLeft, 0)
  assert.equal(game.score, SHUNT_GATES * 2)
  assert.ok(Math.abs(game.speed - difficulty(game.score).speed) < 1e-9)
})

test('UNIFORMS.uOverdrive activates with shunt and clears when exhausted or reset', () => {
  const { game, powerups, gates, select, tap } = harness('new')
  select()
  tap()
  assert.equal(UNIFORMS.uOverdrive.value, 0)
  collectOnce(powerups, { type: 'shunt', x: 0, y: 0, z: 0 })
  game.update(1 / 60)
  assert.ok(UNIFORMS.uOverdrive.value > 0, 'uOverdrive should increase during shunt boost')
  gatePerFrame(gates)
  for (let i = 0; i < SHUNT_GATES; i++) game.update(1 / 60)
  assert.equal(game.shuntLeft, 0)
  for (let i = 0; i < 20; i++) game.update(1 / 60)
  assert.ok(UNIFORMS.uOverdrive.value < 0.1, 'uOverdrive ramps down after shunt ends')
})

test('a spare hit burns the shunt charge', () => {
  const h = harness('new', false)
  h.select()
  h.tap()
  collectOnce(h.powerups, { type: 'shunt', x: 0, y: 0, z: 0 })
  h.game.update(1 / 60)
  assert.equal(h.game.shuntLeft, SHUNT_GATES)
  collectOnce(h.powerups, { type: 'life', x: 0, y: 0, z: 0 })
  h.game.update(1 / 60)
  assert.equal(h.game.lives, 2)
  h.gates.hits = () => ({ z: -10, gap: 20 })
  h.game.update(1 / 60)
  assert.equal(h.game.state, 'respawn')
  assert.equal(h.game.lives, 1)
  assert.equal(h.game.shuntLeft, 0)
})

test('tutorial shunts engage overdrive behind an explainer card', () => {
  const { game, powerups, gates, select, tap } = harness('tutorial')
  select()
  tap()
  tap()
  collectOnce(powerups, { type: 'shunt', x: 0, y: 0, z: 0 })
  game.update(1 / 60)
  assert.equal(game.shuntLeft, SHUNT_GATES)
  assert.equal(game.lesson, 'shunt')
  assert.equal(game.paused, true)
  assert.equal(game.pauseReason, 'lesson')
  tap()
  tap()
  assert.equal(game.paused, false)
  gatePerFrame(gates)
  for (let i = 0; i < SHUNT_GATES; i++) game.update(1 / 60)
  assert.equal(game.shuntLeft, 0)
  assert.equal(game.score, SHUNT_GATES * 2)
})

test('CHALLENGE waits for the daily course then holds', async () => {
  const { game, shown, select } = harness('challenge')
  select()
  assert.equal(game.state, 'menu')
  await Promise.resolve()
  assert.equal(game.state, 'playing')
  assert.equal(game.mode, 'challenge')
  assert.equal(game.paused, true)
  assert.equal(game.pauseReason, 'begin')
  assert.equal(shown.at(-1), 'begin')
})

test('CHALLENGE extracts after the target gates and ignores deaths on the board', async () => {
  const { game, gates, select, tap, advance } = harness('challenge', true)
  select()
  await Promise.resolve()
  tap()
  advance(60_000)
  gatePerFrame(gates)
  for (let i = 0; i < 3; i++) game.update(1 / 60)
  assert.equal(game.cleared, 3)
  assert.equal(game.extracted, true)
  assert.equal(game.state, 'dead')
})

test('CHALLENGE stays offline when the board is down', async () => {
  const toasts = []
  const { game, select, hud } = harness(
    'challenge',
    true,
    mockApi({
      startRun: async () => {
        throw new Error('offline')
      },
    }),
  )
  hud.toast = (text) => toasts.push(text)
  select()
  await Promise.resolve()
  assert.equal(game.state, 'menu')
  assert.equal(game.mode, 'run')
  assert.equal(toasts[0], 'CONNECTING')
  assert.equal(toasts.at(-1), 'BOARD OFFLINE')
})

test('QUIT from the pause menu leaves the run', () => {
  const { game, select, tap, pressPause, pressQuit } = harness('new')
  select()
  tap()
  pressPause()
  assert.equal(game.pauseReason, 'menu')
  pressQuit()
  assert.equal(game.state, 'menu')
  assert.equal(game.paused, false)
})

test('the end card ignores a tap until the grace has passed', () => {
  const { game, gates, select, tap, advance } = harness('new', false)
  select()
  tap()
  gates.hits = () => ({ z: 0, gap: 1 })
  game.update(1 / 60)
  assert.equal(game.state, 'dead')
  tap()
  assert.equal(game.state, 'dead', 'the flap that killed the run must not also dismiss the card')
  advance(DEAD_GRACE * 1000)
  tap()
  assert.equal(game.state, 'menu')
})

test('SKIP leaves initials entry for the end card', async () => {
  const { game, gates, select, tap, advance, pressEntry } = harness(
    'challenge',
    true,
    mockApi({
      fetchBoard: async (mode = 'run') =>
        mode === 'challenge' ? { board: [], day: '2026-09-14', now: 1_000 } : { board: [] },
    }),
  )
  select()
  await Promise.resolve()
  tap()
  advance(1_000)
  gatePerFrame(gates)
  for (let i = 0; i < 3; i++) game.update(1 / 60)
  assert.equal(game.state, 'entry')
  pressEntry('skip')
  assert.equal(game.state, 'dead')
  assert.equal(game.extracted, true)
})

test('SCORES says LOADING, then NO ENTRIES YET, and OFFLINE when the fetch fails', async () => {
  const paints = []
  const resolvers = []
  const pending = harness(
    'scores',
    true,
    mockApi({
      fetchBoard: () => new Promise((resolve) => resolvers.push(resolve)),
    }),
  )
  pending.hud.showScores = (_board, _rank, status) => paints.push(status)
  pending.select()
  assert.equal(paints.at(-1), 'LOADING')
  for (const resolve of resolvers.splice(0)) resolve({ board: [], day: '2026-09-14' })
  await Promise.resolve()
  assert.equal(paints.at(-1), 'NO ENTRIES YET')

  const offline = []
  const down = harness(
    'scores',
    true,
    mockApi({
      fetchBoard: async () => {
        throw new Error('offline')
      },
    }),
  )
  down.hud.showScores = (_board, _rank, status) => offline.push(status)
  down.select()
  assert.equal(offline.at(-1), 'LOADING')
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(offline.at(-1), 'BOARD OFFLINE')
})

test('PAUSE holds a live run behind the pause menu until CONTINUE', () => {
  const { game, bird, shown, select, tap, wait, pressPause, pressContinue } = harness('new')
  select()
  tap()
  assert.equal(game.paused, false)
  pressPause()
  assert.equal(game.paused, true)
  assert.equal(game.pauseReason, 'menu')
  assert.equal(shown.at(-1), 'menu')
  const flaps = bird.flaps
  tap()
  tap()
  assert.equal(game.paused, true, 'a flap must not release the pause menu')
  assert.equal(game.pauseReason, 'menu')
  assert.equal(bird.flaps, flaps)
  pressContinue()
  assert.equal(game.paused, true, 'CONTINUE counts down instead of going live at once')
  assert.equal(game.pauseReason, 'countdown')
  assert.equal(game.countdown, RESUME_COUNTDOWN)
  assert.equal(shown.at(-1), 'countdown')
  wait(RESUME_COUNTDOWN * 1000 - 1)
  assert.equal(game.paused, true, 'still held a moment before the count runs out')
  wait(1)
  assert.equal(game.paused, false)
  assert.equal(game.pauseReason, null)
  assert.equal(game.countdown, 0)
  assert.equal(shown.at(-1), 'hide')
  assert.equal(bird.flaps, flaps, 'the countdown release never flaps for the player')
})

test('the countdown runs on the wall clock, not on however many frames the device manages', () => {
  const { game, shown, select, tap, advance, pressPause, pressContinue } = harness('new')
  select()
  tap()
  pressPause()
  pressContinue()
  const redraws = shown.length
  for (let i = 0; i < 200; i++) game.update(0.05)
  assert.equal(game.paused, true, 'a flood of clamped frames with no wall time does not advance it')
  assert.equal(game.countdown, RESUME_COUNTDOWN)
  assert.equal(shown.length, redraws, 'no redraw until the digit changes')
  advance(1_200)
  game.update(1 / 60)
  assert.equal(shown.at(-1), 'countdown')
  assert.equal(shown.length, redraws + 1, 'one redraw for the 2')
  assert.ok(Math.abs(game.countdown - 1.8) < 1e-9)
  advance(2_000)
  game.update(1 / 60)
  assert.equal(game.paused, false, 'three real seconds later it goes live in a single frame')
})

test('flaps during the resume countdown are ignored and never release it early', () => {
  const { game, bird, select, tap, advance, wait, pressPause, pressContinue } = harness('new')
  select()
  tap()
  pressPause()
  pressContinue()
  const flaps = bird.flaps
  advance(500)
  tap()
  tap()
  assert.equal(game.paused, true)
  assert.equal(game.pauseReason, 'countdown')
  assert.equal(bird.flaps, flaps, 'a stray flap mid-countdown does nothing')
  assert.ok(game.countdown < RESUME_COUNTDOWN, 'the countdown keeps running through ignored taps')
  wait(2_500)
  assert.equal(game.paused, false)
  assert.equal(bird.flaps, flaps)
})

test('P and Esc toggle the pause menu from the keyboard, and cancel a countdown back to it', () => {
  const { game, bird, select, tap, wait, pauseKey, escKey } = harness('new')
  select()
  tap()
  const flaps = bird.flaps
  pauseKey()
  assert.equal(game.paused, true)
  assert.equal(game.pauseReason, 'menu')
  pauseKey()
  assert.equal(game.paused, true)
  assert.equal(game.pauseReason, 'countdown')
  wait(1_000)
  pauseKey()
  assert.equal(game.pauseReason, 'menu', 'P mid-countdown returns to the pause menu')
  escKey()
  assert.equal(game.pauseReason, 'countdown')
  assert.equal(game.countdown, RESUME_COUNTDOWN, 'a fresh countdown starts from the top')
  escKey()
  assert.equal(game.pauseReason, 'menu', 'Esc mid-countdown returns to the pause menu')
  escKey()
  wait(RESUME_COUNTDOWN * 1000)
  assert.equal(game.paused, false)
  assert.equal(game.state, 'playing')
  assert.equal(bird.flaps, flaps)
})

test('a hidden tab during the countdown drops back to the pause menu', () => {
  const { game, shown, screen, select, tap, wait, pressPause, pressContinue } = harness('new')
  select()
  tap()
  pressPause()
  pressContinue()
  wait(1_000)
  screen.hidden = true
  game.syncScreen()
  assert.equal(game.paused, true)
  assert.equal(game.pauseReason, 'menu')
  assert.equal(game.countdown, 0)
  wait(RESUME_COUNTDOWN * 1000)
  assert.equal(game.paused, true, 'nothing counts down while the tab is away')
  screen.hidden = false
  game.syncScreen()
  assert.equal(shown.at(-1), 'menu')
  pressContinue()
  assert.equal(game.pauseReason, 'countdown')
  assert.equal(game.countdown, RESUME_COUNTDOWN)
})

test('PAUSE is inert while the run is already held, and Esc still exits a tutorial', () => {
  const held = harness('new')
  held.select()
  held.pressPause()
  assert.equal(held.game.pauseReason, 'begin')
  held.pressContinue()
  assert.equal(held.game.paused, true, 'CONTINUE only answers the pause menu')

  const tut = harness('tutorial')
  tut.select()
  tut.tap()
  tut.escKey()
  assert.equal(tut.game.state, 'menu')
})

test('the pause menu survives a hidden tab and still waits for CONTINUE', () => {
  const { game, shown, screen, select, tap, advance, wait, pressPause, pressContinue } = harness('new')
  select()
  tap()
  pressPause()
  advance(1_000)
  screen.hidden = true
  game.syncScreen()
  assert.equal(game.pauseReason, 'menu')
  assert.equal(game.paused, true)
  assert.equal(pressContinue(), false, 'CONTINUE waits for the tab to come back')
  advance(4_000)
  screen.hidden = false
  game.syncScreen()
  assert.equal(shown.at(-1), 'menu')
  tap()
  assert.equal(game.paused, true)
  pressContinue()
  wait(RESUME_COUNTDOWN * 1000)
  assert.equal(game.paused, false)
  assert.equal(game.pausedMs, 8_000, 'one continuous hold through the countdown, counted once')
})

test('CHALLENGE time excludes the begin wait and every pause, and the board hears about it', async () => {
  const submitted = []
  const { game, bird, gates, select, tap, advance, wait, pressPause, pressContinue } = harness(
    'challenge',
    true,
    mockApi({
      fetchBoard: async (mode = 'run') =>
        mode === 'challenge' ? { board: [], day: '2026-09-14', now: 1_000 } : { board: [] },
      submitScore: async (payload) => {
        submitted.push(payload)
        return { board: [], rank: 1, day: '2026-09-14' }
      },
    }),
  )
  await new Promise((r) => setTimeout(r, 0))
  select()
  await Promise.resolve()
  assert.equal(game.pauseReason, 'begin')
  advance(5_000)
  tap()
  assert.equal(game.pausedMs, 5_000, 'waiting at JUMP TO BEGIN does not count')
  advance(2_000)
  pressPause()
  advance(30_000)
  const flaps = bird.flaps
  tap()
  assert.equal(game.paused, true)
  assert.equal(bird.flaps, flaps)
  pressContinue()
  assert.equal(game.pausedMs, 35_000)
  wait(RESUME_COUNTDOWN * 1000)
  assert.equal(game.paused, false)
  assert.equal(game.pausedMs, 38_000, 'the resume countdown is still held time')
  advance(3_000)
  gatePerFrame(gates)
  for (let i = 0; i < 3; i++) game.update(1 / 60)
  assert.equal(game.extracted, true)
  assert.equal(game.extractTime, 5_000)
  assert.equal(game.state, 'entry')
  advance(8_000)
  assert.equal(game.extractTime, 5_000, 'typing initials must not move the extract clock')
  for (let i = 0; i < 3; i++) select()
  assert.equal(submitted.length, 1)
  assert.equal(submitted[0].token, 'challenge-token')
  assert.equal(submitted[0].score, 5_000)
  assert.equal(submitted[0].pausedMs, 38_000)
})

test('UNIFORMS.uHazard tracks approaching gate proximity and resets on hold or menu', () => {
  const { game, gates, select, tap, pressPause } = harness('new', true)
  select()
  assert.equal(UNIFORMS.uHazard.value, 0, 'uHazard should be 0 while held at begin')

  tap()
  assert.equal(game.paused, false)

  // Gate ahead at -19z (halfway through 38z HAZARD_RANGE)
  gates.nearestAhead = () => ({ type: 'bulkhead', z: -19 })
  game.update(1 / 60)
  assert.ok(UNIFORMS.uHazard.value > 0.2 && UNIFORMS.uHazard.value < 0.3, 'uHazard should track ~0.5^2')

  // Gate passed / no gate ahead
  gates.nearestAhead = () => null
  game.update(1 / 60)
  assert.equal(UNIFORMS.uHazard.value, 0, 'uHazard should clear when no gate is ahead')

  // Approaching gate then pausing
  gates.nearestAhead = () => ({ type: 'bulkhead', z: -10 })
  game.update(1 / 60)
  assert.ok(UNIFORMS.uHazard.value > 0.5)
  pressPause()
  game.update(1 / 60)
  assert.equal(UNIFORMS.uHazard.value, 0, 'uHazard should clear on pause hold')
})

test('BENDS starts a held run on its own token', async () => {
  const modes = []
  const api = mockApi({
    startRun: async (mode) => {
      modes.push(mode)
      return { token: 'bends-token' }
    },
  })
  const { game, shown, select } = harness('bends', true, api)
  select()
  assert.equal(game.mode, 'bends')
  assert.equal(game.state, 'playing')
  assert.equal(game.pauseReason, 'begin')
  assert.equal(shown.at(-1), 'begin')
  assert.deepEqual(modes, ['bends'])
})

test('inside an arc the bird slips outward and the conduit is drawn bent', () => {
  const h = harness('bends')
  const slips = []
  h.bird.updatePlay = (_dt, _input, _dz, slip) => slips.push(slip)
  h.select()
  h.tap()
  h.game.update(1 / 60)
  assert.equal(h.game.slip, 0)
  // A right turn that the bird is already inside.
  h.bends.spawn(5, 30, 0.4)
  for (let i = 0; i < 30; i++) h.game.update(1 / 60)
  assert.ok(h.game.slip < 0, 'a right turn pushes the bird left')
  assert.equal(slips.at(-1), h.game.slip)
  const table = UNIFORMS.uBend.value
  assert.ok(table[table.length - 1] > 0, 'the conduit ahead has turned right')
})

test('BENDS keeps its own best, and the menu straightens the conduit', () => {
  const h = harness('bends', false)
  const runBest = localStorage.getItem('magpie9.best')
  h.select()
  h.tap()
  h.bends.spawn(5, 30, 0.4)
  gatePerFrame(h.gates)
  for (let i = 0; i < 3; i++) h.game.update(1 / 60)
  h.gates.collectPassed = () => false
  h.gates.hits = () => ({ z: -1, gap: 20 })
  h.game.update(1 / 60)
  assert.equal(h.game.state, 'dead')
  assert.equal(localStorage.getItem('magpie9.bends.best'), '3')
  assert.equal(localStorage.getItem('magpie9.best'), runBest)
  h.advance(DEAD_GRACE * 1000)
  h.tap()
  assert.equal(h.game.state, 'menu')
  assert.equal(h.bends.active().length, 0)
  assert.equal(h.game.slip, 0)
  const table = UNIFORMS.uBend.value
  for (let i = 2; i < table.length; i += 3) assert.equal(table[i], 0)
})

test('CHALLENGE extract time ignores server data.now skew and rounds fractional monotonic ms', async () => {
  for (const serverSkewMs of [-30_000, 30_000, 1_700_000_000_000]) {
    const submitted = []
    const h = harness(
      'challenge',
      true,
      mockApi({
        startRun: async () => ({
          token: 'skew-token',
          seed: 42,
          day: '2026-09-14',
          target: 3,
          now: 1_000 + serverSkewMs,
        }),
        fetchBoard: async (mode = 'run') =>
          mode === 'challenge' ? { board: [], day: '2026-09-14' } : { board: [] },
        submitScore: async (payload) => {
          submitted.push(payload)
          return { board: [], rank: 1, day: '2026-09-14' }
        },
      }),
    )
    h.select()
    await Promise.resolve()
    h.advance(2_500.2)
    h.tap()
    h.advance(4_321.6)
    gatePerFrame(h.gates)
    for (let i = 0; i < 3; i++) h.game.update(1 / 60)
    assert.equal(h.game.extracted, true)
    assert.equal(h.game.extractTime, 4_322)
    assert.equal(Number.isSafeInteger(h.game.extractTime), true)
    for (let i = 0; i < 3; i++) h.select()
    assert.equal(submitted.length, 1)
    assert.equal(submitted[0].score, 4_322)
    assert.equal(submitted[0].pausedMs, 2_500)
  }
})

test('stale startRun token from an aborted run session never overwrites an active bends session', async () => {
  /** @type {Record<string, (v: { token: string }) => void>} */
  const pending = {}
  const submitted = []
  const api = mockApi({
    startRun: (mode) =>
      new Promise((resolve) => {
        pending[mode] = resolve
      }),
    fetchBoard: async () => ({ board: [] }),
    submitScore: async (payload) => {
      submitted.push(payload)
      return { board: [], rank: 1 }
    },
  })
  const h = harness('new', false, api)
  await Promise.resolve()

  // Start plain run, then immediately quit back to menu and start BENDS.
  h.select()
  h.tap()
  h.pressPause()
  h.pressQuit()
  assert.equal(h.game.state, 'menu')

  h.hud.menuItem = 'bends'
  h.select()
  assert.equal(h.game.mode, 'bends')

  // Resolve BENDS first, then resolve the stale RUN token after.
  pending.bends({ token: 'bends-valid-token' })
  await Promise.resolve()
  pending.run({ token: 'stale-run-token' })
  await Promise.resolve()

  h.tap()
  gatePerFrame(h.gates)
  h.game.update(1 / 60)
  h.gates.collectPassed = () => false
  h.gates.hits = () => ({ z: 0, gap: 20 })
  h.game.update(1 / 60)
  assert.equal(h.game.state, 'entry')
  for (let i = 0; i < 3; i++) h.select()
  assert.equal(submitted.length, 1)
  assert.equal(submitted[0].token, 'bends-valid-token')
})

test('scoreboard uses low priority in background, aborts superseded refreshes, and preserves SAVING', async () => {
  const fetches = []
  let resolveSubmit
  const paints = []
  const api = mockApi({
    fetchBoard: (mode, opts = {}) =>
      new Promise((resolve, reject) => {
        fetches.push({ mode, opts, resolve, reject })
        opts.signal?.addEventListener('abort', () => {
          const err = new Error('aborted')
          err.name = 'AbortError'
          reject(err)
        })
      }),
    submitScore: () =>
      new Promise((resolve) => {
        resolveSubmit = resolve
      }),
  })
  const h = harness('new', false, api)
  h.hud.showScores = (_board, rank, status, extra) => paints.push({ rank, status, kind: extra?.kind })

  // Boot background prefetch uses priority: 'low'
  assert.equal(fetches.length, 3)
  for (const f of fetches) {
    assert.equal(f.opts.priority, 'low')
    assert.equal(f.opts.signal.aborted, false)
  }

  // Opening SCORES aborts background prefetches without painting BOARD OFFLINE and uses 'auto'
  const bootBatch = fetches.splice(0)
  h.hud.menuItem = 'scores'
  h.select()
  for (const f of bootBatch) assert.equal(f.opts.signal.aborted, true)
  await Promise.resolve()
  await Promise.resolve()
  assert.notEqual(paints.at(-1)?.status, 'BOARD OFFLINE')
  assert.equal(fetches.length, 3)
  for (const f of fetches) assert.equal(f.opts.priority, 'auto')
  for (const f of fetches.splice(0)) f.resolve({ board: [] })
  await Promise.resolve()
  assert.equal(paints.at(-1)?.status, 'NO ENTRIES YET')

  // Return to menu, run a game, die with a qualifying score, and submit initials
  h.escKey()
  assert.equal(h.game.state, 'menu')
  for (const f of fetches.splice(0)) f.resolve({ board: [] })
  await Promise.resolve()

  h.hud.menuItem = 'new'
  h.select()
  await Promise.resolve()
  h.tap()
  gatePerFrame(h.gates)
  h.game.update(1 / 60)
  h.gates.collectPassed = () => false
  h.gates.hits = () => ({ z: 0, gap: 20 })
  h.game.update(1 / 60)
  assert.equal(h.game.state, 'entry')
  for (let i = 0; i < 3; i++) h.select()
  assert.equal(h.game.state, 'scores')
  assert.equal(paints.at(-1)?.status, 'SAVING')

  // Switching away and back (triggering refresh) while submitScore is in flight must not clobber SAVING
  h.input.strafeEdge = 1
  h.game.update(1 / 60)
  h.input.strafeEdge = 0
  for (const f of fetches.splice(0)) f.resolve({ board: [] })
  await Promise.resolve()

  h.input.strafeEdge = -1
  h.game.update(1 / 60)
  h.input.strafeEdge = 0
  for (const f of fetches.splice(0)) f.resolve({ board: [] })
  await Promise.resolve()
  assert.equal(paints.at(-1)?.kind, 'run')
  assert.equal(paints.at(-1)?.status, 'SAVING')

  resolveSubmit({ board: [{ initials: 'AAA', score: 1 }], rank: 1 })
  await Promise.resolve()
  assert.equal(paints.at(-1)?.rank, 1)
  assert.equal(paints.at(-1)?.status, '')
})

test('createCameraRig and game.setReduceMotion toggle shake, bank, turn lead, and FOV punch live', () => {
  const looks = []
  const rolls = []
  const camera = {
    position: {
      x: 0,
      y: 0,
      z: 0,
      copy(v) {
        this.x = v.x
        this.y = v.y
        this.z = v.z
        return this
      },
    },
    lookAt(v) {
      looks.push({ x: v.x, y: v.y, z: v.z })
    },
    rotateZ(r) {
      rolls.push(r)
    },
    fov: 68,
    projUpdates: 0,
    updateProjectionMatrix() {
      this.projUpdates += 1
    },
  }
  const bird = { x: 0, y: 0, bank: 0.8 }
  const bends = createBends()
  bends.spawn(5, 30, 0.5)
  bends.sample(UNIFORMS.uBend.value)

  try {
    const rig = createCameraRig({ camera, bird, reduceMotion: false })
    rig.jolt(0.4)
    rig.punch(5)
    rig.update(1 / 60, true, true)
    assert.ok(camera.fov > 68, 'FOV punch widens FOV when motion is enabled')
    assert.ok(Math.abs(rolls.at(-1)) > 0, 'camera banks when motion is enabled')
    assert.ok(Math.abs(looks.at(-1).x) > 0, 'camera leads into conduit bend when motion is enabled')

    rig.setReduceMotion(true)
    assert.equal(camera.fov, 68, 'enabling reduced motion immediately restores base FOV')
    rig.jolt(0.5)
    rig.punch(6)
    rig.update(1 / 60, true, true)
    assert.equal(camera.fov, 68)
    assert.equal(rolls.at(-1), 0, 'banking roll is zeroed under reduced motion')
    assert.equal(looks.at(-1).x, 0, 'turn lead is zeroed under reduced motion')
    assert.equal(camera.position.x, 0, 'shake is suppressed under reduced motion')

    rig.setReduceMotion(false)
    rig.punch(4)
    rig.update(1 / 60, true, true)
    assert.ok(camera.fov > 68, 'disabling reduced motion re-enables FOV punch')
    assert.ok(Math.abs(rolls.at(-1)) > 0, 'disabling reduced motion re-enables banking')
    assert.ok(Math.abs(looks.at(-1).x) > 0, 'disabling reduced motion re-enables turn lead')
  } finally {
    bends.reset()
    bends.sample(UNIFORMS.uBend.value)
  }

  // Also verify createGame forwards setReduceMotion to its internal rig
  const h = harness('new')
  assert.equal(typeof h.game.setReduceMotion, 'function')
  h.game.setReduceMotion(false)
  h.game.setReduceMotion(true)
})

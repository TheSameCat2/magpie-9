import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createGame,
  difficulty,
  stageDelta,
  rewindDistance,
  pickLifeSlot,
  pauseTapAction,
  heldPauseReason,
} from './game.js'

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

test('stageDelta(1) is about 0.36', () => {
  assert.ok(Math.abs(stageDelta(1) - 0.36) < 1e-9)
})

test('stageDelta is zero at the speed cap', () => {
  assert.equal(stageDelta(30), 0)
})

test('half of stageDelta(n) is 1.5% of the previous speed below the cap', () => {
  for (const n of [1, 5, 10, 15]) {
    const half = 0.5 * stageDelta(n)
    const expected = 0.015 * difficulty(n - 1).speed
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
  assert.equal(pickLifeSlot(10, () => 0.99), 19)
  assert.equal(pickLifeSlot(10, () => 0), 10)
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

test('heldPauseReason keeps jump-to-begin through rotate and hide', () => {
  assert.equal(heldPauseReason('begin', 'hidden'), 'begin')
  assert.equal(heldPauseReason('begin', 'rotate'), 'begin')
  assert.equal(heldPauseReason('begin', 'begin'), 'begin')
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

function harness(menuItem = 'new') {
  if (typeof globalThis.localStorage === 'undefined') {
    globalThis.localStorage = memoryStore()
  }
  const input = {
    muteEdge: false,
    debugEdge: false,
    flapEdge: false,
    restartEdge: false,
    tapEdge: false,
    helpEdge: false,
    backEdge: false,
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
    pos: { x: 0, y: 0, z: 0 },
    flaps: 0,
    reset() {},
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
  const powerups = stub()
  powerups.collect = (_pos, _r, out) => {
    out.length = 0
    return false
  }
  const obstacles = stub()
  obstacles.hits = () => null
  obstacles.collectScores = () => false
  const game = createGame({
    bird,
    tunnel: stub(),
    obstacles,
    powerups,
    input,
    camera: {
      position: { x: 0, y: 0, z: 0, copy() { return this } },
      lookAt() {},
      rotateZ() {},
      fov: 68,
      updateProjectionMatrix() {},
    },
    audio: stub(),
    fx: stub(),
    postfx: stub(),
    screen: { needsRotate: false, hidden: false, isFullscreen: false, supportsFullscreen: false, isStandalone: false },
    reduceMotion: true,
    god: true,
    hud,
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
  return { game, bird, input, powerups, shown, tap, select }
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

test('TUTORIAL also waits for jump to begin', () => {
  const { game, shown, select } = harness('tutorial')
  select()
  assert.equal(game.mode, 'tutorial')
  assert.equal(game.paused, true)
  assert.equal(game.pauseReason, 'begin')
  assert.equal(shown.at(-1), 'begin')
})

test('closing a tutorial explainer holds the run on jump to resume', () => {
  const { game, powerups, shown, select, tap } = harness('tutorial')
  select()
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

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { WING_FLEX, createWingFlex, shoulderTuning, springStep } from './wing-flex.js'

function run(fps, seconds, onFrame) {
  const flex = createWingFlex()
  flex.flap()
  const dt = 1 / fps
  for (let i = 0; i < Math.round(seconds * fps); i++) {
    flex.step(dt)
    onFrame(flex.pose, (i + 1) * dt)
  }
  return flex
}

test('springStep is exact: one big step equals many small ones', () => {
  for (const zeta of [0.3, 1, 1.8]) {
    const big = springStep({ x: 0.4, v: -3 }, 0.1, 30, zeta, 0.1)
    const small = { x: 0.4, v: -3 }
    for (let i = 0; i < 100; i++) springStep(small, 0.001, 30, zeta, 0.1)
    assert.ok(Math.abs(big.x - small.x) < 1e-9, `x matches at zeta ${zeta}`)
    assert.ok(Math.abs(big.v - small.v) < 1e-7, `v matches at zeta ${zeta}`)
  }
})

test('shoulderTuning lands the downstroke at the configured depth and time', () => {
  const { strokeDepth, strokePeak, shoulderZeta } = WING_FLEX
  const { omega, impulse } = shoulderTuning(strokeDepth, strokePeak, shoulderZeta)
  const s = { x: 0, v: impulse }
  springStep(s, strokePeak, omega, shoulderZeta)
  assert.ok(Math.abs(s.x - strokeDepth) < 1e-9)
  assert.ok(Math.abs(s.v) < 1e-9, 'velocity is zero at the bottom of the stroke')
})

test('one flap traces downstroke, upstroke above level, then settles', () => {
  let deepest = 0
  let highest = 0
  const flex = run(240, 0.6, (pose) => {
    deepest = Math.max(deepest, pose.shoulder)
    highest = Math.min(highest, pose.shoulder)
  })
  assert.ok(Math.abs(deepest - WING_FLEX.strokeDepth) < 0.01)
  assert.ok(highest < -0.08, 'recovery upstroke rises above level')
  assert.ok(Math.abs(flex.pose.shoulder) < 0.01 && Math.abs(flex.pose.elbow) < 0.01)
})

test('the wingtip lags the downstroke, then whips through on the upstroke', () => {
  let lagged = false
  let whipped = false
  run(240, 0.2, (pose) => {
    if (pose.stroke > 0.5 && pose.elbow < 0 && pose.wrist < 0) lagged = true
    if (pose.stroke < -0.5 && pose.elbow > 0.1 && pose.wrist > 0.1) whipped = true
  })
  assert.ok(lagged, 'elbow and wrist bend tip-up while the shoulder drives down')
  assert.ok(whipped, 'elbow and wrist bend tip-down while the shoulder lifts')
})

test('the wing folds back on the upstroke and opens on the downstroke', () => {
  let folded = 0
  run(240, 0.2, (pose) => {
    if (pose.stroke < 0) folded = Math.min(folded, pose.wristSweep)
    if (pose.stroke > 0.9) assert.ok(pose.wristSweep > 0, 'hand reaches forward on the power stroke')
  })
  assert.ok(folded < -0.1, 'hand sweeps back on the upstroke')
})

test('the shoulder stroke is frame-rate independent and bends stay in limits', () => {
  const at60 = []
  const at20 = []
  run(60, 0.4, (pose, t) => at60.push([t, pose.shoulder]))
  run(20, 0.4, (pose, t) => {
    at20.push([t, pose.shoulder])
    assert.ok(Math.abs(pose.elbow) <= WING_FLEX.elbowLimit)
    assert.ok(Math.abs(pose.wrist) <= WING_FLEX.wristLimit)
  })
  for (const [t, x] of at20) {
    const match = at60.find(([t60]) => Math.abs(t60 - t) < 1e-6)
    assert.ok(match && Math.abs(match[1] - x) < 1e-9, `same shoulder angle at ${t}`)
  }
})

test('mashing flap re-arms the stroke instead of winding the wing past its stop', () => {
  const flex = createWingFlex()
  let deepest = 0
  for (let i = 0; i < 480; i++) {
    if (i % (2 + (i % 7)) === 0) flex.flap()
    flex.step(1 / 120)
    deepest = Math.max(deepest, flex.pose.shoulder)
  }
  assert.ok(deepest < WING_FLEX.strokeDepth * 1.25, `stroke stays bounded, got ${deepest}`)
})

test('reset returns every joint to rest', () => {
  const flex = run(60, 0.05, () => {})
  flex.reset()
  for (const value of Object.values(flex.pose)) assert.ok(value === 0)
})

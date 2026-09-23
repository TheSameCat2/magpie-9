import { clamp } from '../lib/math.js'

/**
 * Quality ladder, lowest first. The governor walks down it if frames run
 * long. `particles` scales the continuous spark streams (fx.setDensity).
 */
export const QUALITY = [
  { dpr: 1, bloom: false, bloomScale: 0.5, flare: false, particles: 0.45 },
  { dpr: 1.25, bloom: true, bloomScale: 0.35, flare: true, particles: 0.75 },
  { dpr: 2, bloom: true, bloomScale: 0.5, flare: true, particles: 1 },
]

const TOP = QUALITY.length - 1

/**
 * Starting rung. `?q=0|1|2` pins one; coarse pointers (phones) start one
 * rung down because their GPUs rarely hold the top rung.
 */
export function initialQuality(params, coarse) {
  if (params.has('q')) {
    const pinned = Number(params.get('q'))
    return clamp(Number.isFinite(pinned) ? pinned : TOP, 0, TOP)
  }
  return coarse ? 1 : TOP
}

/**
 * Steps quality down one rung after ~1.5 s of frames averaging over the
 * budget, with a warm-up grace after every change. Never steps back up:
 * bouncing between rungs looks worse than staying low.
 */
export function createQualityGovernor({ level, pinned = false, onChange }) {
  let frameAvg = 16
  let slowFor = 0
  let warmup = 3

  function observe(frameMs, dt) {
    frameAvg += (Math.min(frameMs, 100) - frameAvg) * 0.08
    if (warmup > 0) {
      warmup -= dt
      return
    }
    if (frameAvg > 19.5) slowFor += dt
    else slowFor = 0
    if (slowFor > 1.5 && level > 0 && !pinned) {
      level -= 1
      slowFor = 0
      warmup = 2
      onChange?.(level)
    }
  }

  return {
    observe,
    get level() {
      return level
    },
    get settings() {
      return QUALITY[level]
    },
  }
}

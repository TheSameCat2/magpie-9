// The AudioContext and the shared bus every voice plugs into. Browsers only
// let a context start from a user gesture, so everything is built lazily on
// the first `ensure()` and the voices register `onBuild` hooks to attach.

const MASTER_GAIN = 0.9

export function createAudioGraph({ muted = false } = {}) {
  let ctx = null
  let master = null
  let wet = null
  let noiseBuffer = null
  let isMuted = muted
  const buildHooks = []

  function buildBus() {
    master = ctx.createGain()
    master.gain.value = isMuted ? 0 : MASTER_GAIN
    const compressor = ctx.createDynamicsCompressor()
    compressor.threshold.value = -14
    compressor.knee.value = 18
    compressor.ratio.value = 6
    compressor.attack.value = 0.004
    compressor.release.value = 0.18
    master.connect(compressor)
    compressor.connect(ctx.destination)

    // Feedback delay shared by the melodic hits for a sense of space.
    wet = ctx.createGain()
    wet.gain.value = 0.32
    const delay = ctx.createDelay(1)
    delay.delayTime.value = 0.21
    const feedback = ctx.createGain()
    feedback.gain.value = 0.36
    const damp = ctx.createBiquadFilter()
    damp.type = 'lowpass'
    damp.frequency.value = 2400
    wet.connect(delay)
    delay.connect(damp)
    damp.connect(feedback)
    feedback.connect(delay)
    damp.connect(master)

    const length = ctx.sampleRate * 2
    noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
  }

  function ensure() {
    if (!ctx) {
      ctx = new AudioContext()
      buildBus()
      for (const hook of buildHooks) hook(graph)
    }
    if (ctx.state === 'suspended' || ctx.state === 'interrupted') ctx.resume()
    return ctx
  }

  const graph = {
    ensure,
    /** Register a voice builder; runs once, right after the context exists. */
    onBuild(hook) {
      buildHooks.push(hook)
    },
    get ready() {
      return ctx !== null
    },
    get ctx() {
      return ctx
    },
    get master() {
      return master
    },
    get wet() {
      return wet
    },
    get noiseBuffer() {
      return noiseBuffer
    },
    /** Current context time, or 0 before the context exists. */
    get now() {
      return ctx ? ctx.currentTime : 0
    },
    get muted() {
      return isMuted
    },
    setMuted(next) {
      isMuted = next
      if (master) master.gain.setTargetAtTime(next ? 0 : MASTER_GAIN, ctx.currentTime, 0.05)
    },
    suspend() {
      if (ctx && ctx.state === 'running') ctx.suspend()
    },
    resume() {
      if (ctx && (ctx.state === 'suspended' || ctx.state === 'interrupted')) ctx.resume()
    },
  }
  return graph
}

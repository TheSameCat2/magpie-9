// Fire-and-forget voices: a shaped oscillator and a filtered noise burst.
// Every sound effect is a few of these layered.

export function createOneShots(graph) {
  function tone(freq, dur, type, peak, { endFreq, attack = 0.004, toWet = 0, when = 0 } = {}) {
    if (graph.muted) return
    const ctx = graph.ensure()
    const t = ctx.currentTime + when
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t)
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + dur)
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(peak, t + attack)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(gain)
    gain.connect(graph.master)
    if (toWet > 0) {
      const send = ctx.createGain()
      send.gain.value = toWet
      gain.connect(send)
      send.connect(graph.wet)
    }
    osc.start(t)
    osc.stop(t + dur + 0.05)
  }

  function noise(dur, peak, { type = 'bandpass', from = 800, to = 300, q = 0.8, when = 0 } = {}) {
    if (graph.muted) return
    const ctx = graph.ensure()
    const t = ctx.currentTime + when
    const source = ctx.createBufferSource()
    source.buffer = graph.noiseBuffer
    source.loop = true
    const filter = ctx.createBiquadFilter()
    filter.type = type
    filter.Q.value = q
    filter.frequency.setValueAtTime(from, t)
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    source.connect(filter)
    filter.connect(gain)
    gain.connect(graph.master)
    source.start(t, Math.random() * 1.5)
    source.stop(t + dur + 0.05)
  }

  return { tone, noise }
}

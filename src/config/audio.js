// Soundtrack mix. The file is already mastered, so this gain sits it under the
// one-shots. It still runs through the gameplay compressor on the master bus.

/** Linear gain into the master bus for the whole visit. */
export const MUSIC_GAIN = 0.4

/** Level the song ducks to while the crash noise plays. */
export const MUSIC_CRASH_GAIN = 0.05

/** Seconds to reach the crash duck. */
export const MUSIC_CRASH_DIP_S = 0.12

/** Seconds to return from the duck to the current music level. */
export const MUSIC_CRASH_RECOVER_S = 1

/** How far one press moves a volume channel. */
export const VOLUME_STEP = 0.1

/** A channel level in 0..1. Anything unreadable stays at full. */
export function clampVolume(value) {
  if (!Number.isFinite(value)) return 1
  return Math.min(1, Math.max(0, value))
}

/** Step `value` by `dir` clicks and keep it on the 10% grid. */
export function stepVolume(value, dir) {
  const stepped = Math.round((clampVolume(value) + dir * VOLUME_STEP) * 10) / 10
  return clampVolume(stepped)
}

/** Whole-number percent for a channel readout. */
export function formatVolume(value) {
  return String(Math.round(clampVolume(value) * 100))
}

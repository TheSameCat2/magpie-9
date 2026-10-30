// Soundtrack mix. The file is already mastered, so this gain sits it under the
// one-shots. It still runs through the gameplay compressor on the master bus.

/** Linear gain into the master bus for the whole visit. */
export const MUSIC_GAIN = 0.4

/** Level the song ducks to while the crash noise plays. */
export const MUSIC_CRASH_GAIN = 0.05

/** Seconds to reach the crash duck. */
export const MUSIC_CRASH_DIP_S = 0.12

/** Seconds to return from the duck to MUSIC_GAIN. */
export const MUSIC_CRASH_RECOVER_S = 1

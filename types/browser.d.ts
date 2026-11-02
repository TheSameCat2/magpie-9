// Browser APIs the game feature-detects but TypeScript's DOM library omits:
// WebKit's prefixed Fullscreen API (iOS Safari), iOS's navigator.standalone,
// and Screen Orientation lock (Android Chrome). Each is optional because the
// code checks for it before calling.

interface Document {
  webkitFullscreenElement?: Element | null
  webkitExitFullscreen?: () => void
}

interface HTMLElement {
  webkitRequestFullscreen?: () => void
}

interface Navigator {
  standalone?: boolean
}

interface ScreenOrientation {
  lock?: (orientation: 'landscape' | 'portrait' | 'any' | 'natural') => Promise<void>
}

interface Window {
  /** Debug handles, set only with ?god or ?debug (src/main.js). */
  __magpie?: Record<string, unknown>
}

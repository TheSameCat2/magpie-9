// Native-shell focus. The browser has no shell, so it stays focused and a
// hidden tab is still just document.visibilityState.

/** True when the page or the native window is not the thing the player is looking at. */
export function displayHidden({ visibility, shellFocused = true }) {
  return visibility === 'hidden' || shellFocused === false
}

/**
 * Subscribe to shell focus. No-op without a bridge. The callback receives a
 * boolean and nothing else — the shell must not hand over an IPC event.
 * Returns an unsubscribe function.
 */
export function watchShellFocus(onChange, bridge = globalThis.magpieDesktop) {
  if (!bridge || typeof bridge.onFocus !== 'function' || typeof onChange !== 'function') return () => {}
  const unsubscribe = bridge.onFocus((focused) => onChange(focused === true))
  return typeof unsubscribe === 'function' ? unsubscribe : () => {}
}

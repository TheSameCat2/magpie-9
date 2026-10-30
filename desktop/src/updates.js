// Whether this process should look for a GitHub Release update.
// Dev (`electron .`) and portable builds must not check: there is no
// installed NSIS app to replace, and a check would be noise.

export const UPDATE_LABEL = 'Update available —'
export const UPDATE_RESTART = 'Restart now'
export const UPDATE_LATER = 'Later'

export const UPDATE_READY = 'magpie:update-ready'
export const UPDATE_RESTART_CHANNEL = 'magpie:update-restart'
export const UPDATE_LATER_CHANNEL = 'magpie:update-later'

export function isPortableEnv(env) {
  return Boolean(env.PORTABLE_EXECUTABLE_FILE || env.PORTABLE_EXECUTABLE_DIR)
}

export function shouldCheckForUpdates({ packaged, portable }) {
  return packaged === true && portable !== true
}

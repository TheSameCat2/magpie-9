const INITIALS_RE = /^[A-Z0-9]{3}$/

export const BLOCKLIST = new Set(['ASS', 'CUM', 'DIK', 'FAG', 'FUK', 'FUC', 'KKK', 'NIG', 'SEX', 'TIT'])

/** Upper-case, strip anything outside A-Z0-9, keep three characters. */
export function normalizeInitials(raw) {
  return String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 3)
}

export function acceptableInitials(initials) {
  return INITIALS_RE.test(initials) && !BLOCKLIST.has(initials)
}

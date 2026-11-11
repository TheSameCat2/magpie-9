// Gzip budget for the production bundle. Run after `npm run build`; CI fails
// when a chunk outgrows its budget so a heavy import or a stray asset shows up
// in review instead of on a player's phone. Raise a budget on purpose, in the
// same change that needs it, and say why in the commit.

import fs from 'node:fs'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'

/**
 * Gzip budgets in bytes, keyed by the chunk name before Vite's content hash.
 * Measured sizes when set (Nov 2026): three 126.8 kB, index 48.5 kB, CSS 6.6 kB,
 * index.html 6.3 kB. index was re-measured at 52.6 kB after the a11y and
 * lifecycle hardening. Headroom is roughly 5% so routine work does not trip them.
 */
export const BUDGETS = {
  'three.js': 134_000,
  'index.js': 55_000,
  'index.css': 7_500,
  'index.html': 7_000,
}

/** `index-CHfMUJbL.css` → `index.css`; files without a hash keep their name. */
export function chunkName(file) {
  const ext = path.extname(file)
  const stem = path.basename(file, ext)
  return stem.replace(/-[\w-]{8}$/, '') + ext
}

/**
 * Compare measured gzip sizes against budgets. Every budgeted name must be
 * present exactly once, and nothing unbudgeted may ship, so a renamed or new
 * chunk cannot slip past the check.
 * @param {{ file: string, gzip: number }[]} measured
 * @param {Record<string, number>} budgets
 */
export function checkBudgets(measured, budgets) {
  const rows = []
  const errors = []
  const seen = new Map()
  for (const { file, gzip } of measured) {
    const name = chunkName(file)
    seen.set(name, (seen.get(name) ?? 0) + 1)
    const budget = budgets[name]
    if (budget === undefined) {
      errors.push(`${file}: no budget for "${name}"; add one to BUDGETS`)
      rows.push({ file, gzip, budget: null })
      continue
    }
    if (gzip > budget) errors.push(`${file}: ${gzip} B gzip is over its ${budget} B budget`)
    rows.push({ file, gzip, budget })
  }
  for (const name of Object.keys(budgets)) {
    const count = seen.get(name) ?? 0
    if (count === 0) errors.push(`"${name}" has a budget but was not built`)
    if (count > 1) errors.push(`"${name}" matched ${count} files`)
  }
  return { rows, errors }
}

function measure(dist) {
  const files = [path.join(dist, 'index.html')]
  const assets = path.join(dist, 'assets')
  for (const f of fs.readdirSync(assets)) {
    if (f.endsWith('.js') || f.endsWith('.css')) files.push(path.join(assets, f))
  }
  return files.map((file) => ({
    file: path.relative(dist, file),
    gzip: gzipSync(fs.readFileSync(file), { level: 9 }).length,
  }))
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const dist = path.join(root, 'dist')
  if (!fs.existsSync(path.join(dist, 'index.html'))) {
    console.error('Missing dist/index.html. Run `npm run build` first.')
    process.exit(1)
  }
  const { rows, errors } = checkBudgets(measure(dist), BUDGETS)
  const kb = (n) => (n / 1000).toFixed(1).padStart(6) + ' kB'
  for (const { file, gzip, budget } of rows) {
    console.log(`${kb(gzip)}  / ${budget === null ? '     none' : kb(budget)}  ${file}`)
  }
  const total = rows.reduce((sum, r) => sum + r.gzip, 0)
  console.log(`${kb(total)}  gzip total`)
  if (errors.length) {
    for (const e of errors) console.error(`over budget: ${e}`)
    process.exit(1)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()

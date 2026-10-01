// Copy the Vite build into desktop/renderer. electron-builder will not follow
// a parent path, and the unpackaged app serves this same directory.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = path.resolve(desktop, '../dist')
const target = path.join(desktop, 'renderer')
const index = path.join(source, 'index.html')

if (!fs.existsSync(index)) {
  console.error('Missing dist/index.html. From the repo root, run: npm run build')
  process.exit(1)
}

fs.rmSync(target, { recursive: true, force: true })
fs.cpSync(source, target, { recursive: true })
console.log(`synced ${source} -> ${target}`)

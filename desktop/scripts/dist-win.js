// Unsigned Windows NSIS installer. Signing env is stripped so a certificate
// on the machine cannot mark the build as a trusted publisher. electron-builder
// still edits the exe resources (icon, name, version).

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export const SIGNING_ENV_KEYS = [
  'CSC_LINK',
  'CSC_KEY_PASSWORD',
  'CSC_NAME',
  'WIN_CSC_LINK',
  'WIN_CSC_KEY_PASSWORD',
]

export function unsignedPackEnv(base) {
  const env = { ...base, CSC_IDENTITY_AUTO_DISCOVERY: 'false' }
  for (const key of SIGNING_ENV_KEYS) delete env[key]
  // A stray draft flag would hide the release from electron-updater.
  delete env.EP_DRAFT
  if (base.MAGPIE_RELEASE_TYPE === 'prerelease') env.EP_PRE_RELEASE = 'true'
  else delete env.EP_PRE_RELEASE
  delete env.EP_PRELEASE
  return env
}

export function builderArgs(env) {
  const publish = env.MAGPIE_PUBLISH === 'always' ? 'always' : 'never'
  return ['--win', '--x64', '--publish', publish]
}

function isDirectRun() {
  const entry = process.argv[1]
  if (!entry) return false
  return import.meta.url === pathToFileURL(path.resolve(entry)).href
}

function pack() {
  const cli = path.join(desktop, 'node_modules', 'electron-builder', 'cli.js')
  if (!fs.existsSync(cli)) {
    console.error('electron-builder is not installed. From desktop/, run: npm install')
    process.exit(1)
  }

  const result = spawnSync(process.execPath, [cli, ...builderArgs(process.env)], {
    cwd: desktop,
    stdio: 'inherit',
    env: unsignedPackEnv(process.env),
  })
  if (result.error) {
    console.error(result.error.message)
    process.exit(1)
  }
  process.exit(result.status ?? 1)
}

if (isDirectRun()) pack()

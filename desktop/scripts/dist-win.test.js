import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SIGNING_ENV_KEYS, unsignedPackEnv } from './dist-win.js'

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const root = path.resolve(desktop, '..')

test('unsigned pack env drops certificates and disables identity discovery', () => {
  const env = unsignedPackEnv({
    PATH: '/usr/bin',
    CSC_LINK: 'cert.pfx',
    CSC_KEY_PASSWORD: 'secret',
    CSC_NAME: 'CN=Someone',
    WIN_CSC_LINK: 'cert.pfx',
    WIN_CSC_KEY_PASSWORD: 'secret',
    CSC_IDENTITY_AUTO_DISCOVERY: 'true',
  })
  assert.equal(env.PATH, '/usr/bin')
  assert.equal(env.CSC_IDENTITY_AUTO_DISCOVERY, 'false')
  for (const key of SIGNING_ENV_KEYS) assert.equal(env[key], undefined)
})

test('windows builder config stays unsigned and names the NSIS installer', () => {
  const yml = fs.readFileSync(path.join(desktop, 'electron-builder.yml'), 'utf8')
  assert.match(yml, /signExecutable:\s*false/)
  assert.match(yml, /differentialPackage:\s*false/)
  assert.match(yml, /artifactName:\s*\$\{productName\} Setup \$\{version\}\.\$\{ext\}/)
  const pkg = JSON.parse(fs.readFileSync(path.join(desktop, 'package.json'), 'utf8'))
  assert.match(pkg.scripts['dist:win'], /scripts\/sync-renderer\.js/)
  assert.match(pkg.scripts['dist:win'], /scripts\/dist-win\.js/)
  const rootPkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  assert.equal(rootPkg.scripts['desktop:dist:win'], 'npm run build && npm run dist:win --prefix desktop')
})

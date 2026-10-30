import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SIGNING_ENV_KEYS, builderArgs, unsignedPackEnv } from './dist-win.js'

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const root = path.resolve(desktop, '..')

test('unsigned pack env drops certificates and disables identity discovery', () => {
  const env = unsignedPackEnv({
    PATH: '/usr/bin',
    GH_TOKEN: 'gh-token',
    CSC_LINK: 'cert.pfx',
    CSC_KEY_PASSWORD: 'secret',
    CSC_NAME: 'CN=Someone',
    WIN_CSC_LINK: 'cert.pfx',
    WIN_CSC_KEY_PASSWORD: 'secret',
    CSC_IDENTITY_AUTO_DISCOVERY: 'true',
    EP_DRAFT: 'true',
    EP_PRE_RELEASE: 'true',
    MAGPIE_RELEASE_TYPE: 'release',
  })
  assert.equal(env.PATH, '/usr/bin')
  assert.equal(env.GH_TOKEN, 'gh-token')
  assert.equal(env.CSC_IDENTITY_AUTO_DISCOVERY, 'false')
  assert.equal(env.EP_DRAFT, undefined)
  assert.equal(env.EP_PRE_RELEASE, undefined)
  for (const key of SIGNING_ENV_KEYS) assert.equal(env[key], undefined)
})

test('prerelease publish mode is explicit and drafts are stripped', () => {
  const env = unsignedPackEnv({ MAGPIE_RELEASE_TYPE: 'prerelease', EP_DRAFT: 'true' })
  assert.equal(env.EP_PRE_RELEASE, 'true')
  assert.equal(env.EP_DRAFT, undefined)
  assert.deepEqual(builderArgs({}), ['--win', '--x64', '--publish', 'never'])
  assert.deepEqual(builderArgs({ MAGPIE_PUBLISH: 'never' }), ['--win', '--x64', '--publish', 'never'])
  assert.throws(() => builderArgs({ MAGPIE_PUBLISH: 'always' }), /two GitHub Releases/)
  assert.throws(() => builderArgs({ MAGPIE_PUBLISH: 'true' }), /two GitHub Releases/)
})

test('windows builder config stays unsigned and publishes GitHub releases', () => {
  const yml = fs.readFileSync(path.join(desktop, 'electron-builder.yml'), 'utf8')
  assert.match(yml, /signExecutable:\s*false/)
  assert.match(yml, /verifyUpdateCodeSignature:\s*false/)
  assert.match(yml, /provider:\s*github/)
  assert.match(yml, /owner:\s*TheSameCat2/)
  assert.match(yml, /repo:\s*magpie-9/)
  assert.match(yml, /releaseType:\s*release/)
  assert.match(yml, /artifactName:\s*\$\{productName\}-Setup-\$\{version\}\.\$\{ext\}/)
  assert.doesNotMatch(yml, /differentialPackage:\s*false/)
  assert.doesNotMatch(yml, /^\s*publisherName\s*:/m)
  assert.equal((yml.match(/^publish:/gm) || []).length, 1)
  const pkg = JSON.parse(fs.readFileSync(path.join(desktop, 'package.json'), 'utf8'))
  assert.equal(pkg.dependencies['electron-updater'], '6.8.12')
  assert.match(pkg.scripts['dist:win'], /scripts\/sync-renderer\.js/)
  assert.match(pkg.scripts['dist:win'], /scripts\/dist-win\.js/)
  assert.match(pkg.scripts.pack, /--publish never/)
  assert.match(pkg.scripts.dist, /--publish never/)
  const rootPkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  assert.equal(rootPkg.scripts['desktop:dist:win'], 'npm run build && npm run dist:win --prefix desktop')
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/desktop-release.yml'), 'utf8')
  assert.match(workflow, /publish-release\.js/)
  assert.match(workflow, /--notes-only/)
  assert.match(workflow, /cancel-in-progress:\s*false/)
  assert.match(workflow, /GH_TOKEN:/)
  assert.doesNotMatch(workflow, /MAGPIE_PUBLISH/)
  assert.doesNotMatch(workflow, /gh release /)
  assert.doesNotMatch(workflow, /WIN_CSC_LINK/)
  assert.doesNotMatch(workflow, /^\s*publisherName\s*:/m)
})

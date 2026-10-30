import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  createReleaseArgs,
  editReleaseArgs,
  ensureReleaseNotes,
  filterByTag,
  flattenReleasePages,
  isPrereleaseTag,
  isTagNameConflict,
  metadataMatches,
  normalizeNotes,
  planAssetPublish,
  publishReleaseAssets,
  releaseTitle,
  resolveReleaseContext,
  titleAndNotesMatch,
  uploadReleaseArgs,
  versionFromTag,
} from './publish-release.js'

const repo = 'TheSameCat2/magpie-9'
const tag = 'v1.2.3'
const title = 'MAGPIE-9 v1.2.3'
const notes = 'Install it.\n'
const notesFile = 'desktop/release-notes.md'
const assets = [
  'desktop/release/MAGPIE-9-Setup-1.2.3.exe',
  'desktop/release/MAGPIE-9-Setup-1.2.3.exe.blockmap',
  'desktop/release/latest.yml',
]

function release(overrides = {}) {
  return {
    id: 9,
    tag_name: tag,
    name: title,
    body: notes,
    draft: false,
    prerelease: false,
    ...overrides,
  }
}

function viewJson(overrides = {}) {
  const row = release(overrides)
  return JSON.stringify({
    databaseId: row.id,
    tagName: row.tag_name,
    name: row.name,
    body: row.body,
    isDraft: row.draft,
    isPrerelease: row.prerelease,
  })
}

function conflict() {
  const error = new Error('HTTP 422: Validation Failed\nRelease.tag_name already exists')
  error.stderr = 'HTTP 422: Validation Failed\nRelease.tag_name already exists'
  return error
}

function scripted(steps) {
  const calls = []
  return {
    calls,
    async gh(args) {
      calls.push(args)
      const step = steps.shift()
      assert.ok(step, `unexpected gh ${args.join(' ')}`)
      if (step.args) assert.deepEqual(args.slice(0, step.args.length), step.args)
      if (step.boundary) {
        const next = args[step.args.length]
        assert.ok(
          next == null || next.startsWith('--'),
          `expected ${step.args.join(' ')} to end, got ${next}`,
        )
      }
      if (step.error) throw step.error
      return step.stdout ?? ''
    },
    done() {
      assert.equal(steps.length, 0, `unused gh steps: ${steps.length}`)
    },
  }
}

function publishCtx(gh, extra = {}) {
  return {
    gh,
    repo,
    tag,
    title,
    notes,
    notesFile,
    prerelease: false,
    assets,
    pause: async () => {},
    ...extra,
  }
}

test('tag helpers reject anything that is not a release tag', () => {
  assert.equal(versionFromTag('v1.2.3'), '1.2.3')
  assert.equal(versionFromTag('v1.2.3-rc.1'), '1.2.3-rc.1')
  assert.equal(isPrereleaseTag('v1.2.3'), false)
  assert.equal(isPrereleaseTag('v1.2.3-rc.1'), true)
  assert.equal(releaseTitle('v1.2.3'), 'MAGPIE-9 v1.2.3')
  assert.equal(normalizeNotes('a\r\n\n'), 'a')
  for (const bad of ['1.2.3', 'v1.2', 'vv1.2.3', 'v1.2.3-', '']) {
    assert.throws(() => versionFromTag(bad), /vX\.Y\.Z/)
  }
})

test('plans are create, upload, or abort and never a second create', () => {
  assert.deepEqual(planAssetPublish([]), { action: 'create' })
  assert.deepEqual(planAssetPublish([release()]), { action: 'upload', id: 9 })
  assert.deepEqual(planAssetPublish([release(), release({ id: 10 })]), { action: 'abort', count: 2 })
  const pages = flattenReleasePages(
    JSON.stringify([[release({ id: 1, tag_name: 'v0.1.0' })], [release({ id: 2, tag_name: 'v0.1.0' })]]),
  )
  assert.equal(filterByTag(pages, 'v0.1.0').length, 2)
  assert.equal(filterByTag(pages, 'v1.2.3').length, 0)
  assert.throws(() => flattenReleasePages('not-json'), /refusing to create/)
})

test('metadata matches only when title, notes, draft, prerelease, and latest agree', () => {
  const spec = { title, notes, prerelease: false, latestId: 9 }
  assert.equal(metadataMatches(release(), spec), true)
  assert.equal(metadataMatches(release({ body: 'Install it.' }), spec), true)
  assert.equal(metadataMatches(release({ name: '0.1.1' }), spec), false)
  assert.equal(metadataMatches(release({ draft: true }), spec), false)
  assert.equal(metadataMatches(release({ prerelease: true }), spec), false)
  assert.equal(metadataMatches(release(), { ...spec, latestId: 4 }), false)
  assert.equal(
    metadataMatches(release({ prerelease: true }), {
      title,
      notes,
      prerelease: true,
      latestId: 4,
    }),
    true,
  )
  assert.equal(titleAndNotesMatch(release({ draft: true, prerelease: true }), { title, notes }), true)
  assert.equal(isTagNameConflict(conflict()), true)
  assert.equal(isTagNameConflict(new Error('release not found')), false)
})

test('create and edit commands do not upload a second release', () => {
  const created = createReleaseArgs({ tag, title, notesFile, prerelease: false, repo })
  assert.deepEqual(created.slice(0, 3), ['release', 'create', tag])
  assert.ok(created.includes('--verify-tag'))
  assert.ok(created.includes('--latest'))
  assert.ok(!created.includes('--prerelease'))
  assert.ok(!created.some((arg) => String(arg).includes('.exe') || arg === 'latest.yml'))

  const pre = createReleaseArgs({ tag: 'v1.2.3-rc.1', title, notesFile, prerelease: true, repo })
  assert.ok(pre.includes('--prerelease'))
  assert.ok(pre.includes('--latest=false'))
  assert.ok(!pre.includes('--latest'))

  const upload = uploadReleaseArgs({ tag, repo, assets })
  assert.equal(upload[1], 'upload')
  assert.ok(upload.includes('--clobber'))
  assert.deepEqual(
    upload.filter((arg) => arg.endsWith('.exe') || arg.endsWith('.blockmap') || arg.endsWith('latest.yml')),
    assets,
  )

  const edit = editReleaseArgs({ tag, title, notesFile, prerelease: false, repo })
  assert.equal(edit[1], 'edit')
  assert.ok(edit.includes('--draft=false'))
  assert.ok(edit.includes('--prerelease=false'))
  assert.ok(edit.includes('--latest'))
  assert.ok(!edit.includes('create'))
})

test('first publish creates once and uploads every feed file', async () => {
  const created = release()
  const fake = scripted([
    { args: ['api'], stdout: '[[]]' },
    { args: ['release', 'create'], stdout: 'created\n' },
    { args: ['api'], stdout: JSON.stringify([[created]]) },
    { args: ['release', 'upload'], stdout: '' },
  ])
  const result = await publishReleaseAssets(publishCtx(fake.gh))
  assert.deepEqual(result, { action: 'upload', id: 9 })
  assert.equal(fake.calls.filter((args) => args[1] === 'create').length, 1)
  assert.equal(fake.calls.filter((args) => args[1] === 'upload').length, 1)
  assert.ok(fake.calls.at(-1).includes(assets[0]))
  assert.ok(fake.calls.at(-1).includes(assets[2]))
  fake.done()
})

test('an existing release is updated in place', async () => {
  const fake = scripted([
    { args: ['api'], stdout: JSON.stringify([[release()]]) },
    { args: ['release', 'upload'], stdout: '' },
  ])
  const result = await publishReleaseAssets(publishCtx(fake.gh))
  assert.equal(result.id, 9)
  assert.equal(fake.calls.filter((args) => args[1] === 'create').length, 0)
  assert.equal(fake.calls.filter((args) => args[1] === 'upload').length, 1)
  fake.done()
})

test('two releases for the tag abort before any upload or create', async () => {
  const fake = scripted([
    {
      args: ['api'],
      stdout: JSON.stringify([[release({ id: 1 }), release({ id: 2 })]]),
    },
  ])
  await assert.rejects(publishReleaseAssets(publishCtx(fake.gh)), /Refusing to create another/)
  assert.equal(fake.calls.length, 1)
  fake.done()
})

test('a create conflict uploads to the release that won and does not create again', async () => {
  const fake = scripted([
    { args: ['api'], stdout: '[[]]' },
    { args: ['release', 'create'], error: conflict() },
    { args: ['api'], stdout: JSON.stringify([[release()]]) },
    { args: ['release', 'upload'], stdout: '' },
  ])
  await publishReleaseAssets(publishCtx(fake.gh))
  assert.equal(fake.calls.filter((args) => args[1] === 'create').length, 1)
  assert.equal(fake.calls.filter((args) => args[1] === 'upload').length, 1)
  fake.done()
})

test('a create conflict that reveals duplicates does not upload', async () => {
  const fake = scripted([
    { args: ['api'], stdout: '[[]]' },
    { args: ['release', 'create'], error: conflict() },
    {
      args: ['api'],
      stdout: JSON.stringify([[release({ id: 1 }), release({ id: 2 })]]),
    },
  ])
  await assert.rejects(publishReleaseAssets(publishCtx(fake.gh)), /ambiguous tag/)
  assert.ok(!fake.calls.some((args) => args[1] === 'upload'))
  assert.equal(fake.calls.filter((args) => args[1] === 'create').length, 1)
  fake.done()
})

test('a create conflict with no listed release does not retry create', async () => {
  const empty = { args: ['api'], stdout: '[[]]' }
  const fake = scripted([empty, { args: ['release', 'create'], error: conflict() }, empty, empty, empty])
  await assert.rejects(publishReleaseAssets(publishCtx(fake.gh)), /refusing to create a second release/)
  assert.equal(fake.calls.filter((args) => args[1] === 'create').length, 1)
  assert.ok(!fake.calls.some((args) => args[1] === 'upload'))
  fake.done()
})

test('notes step skips when the release already has the title and notes', async () => {
  const fake = scripted([
    { args: ['release', 'view', tag], stdout: viewJson() },
    { args: ['release', 'view'], boundary: true, stdout: viewJson() },
  ])
  const result = await ensureReleaseNotes(publishCtx(fake.gh))
  assert.deepEqual(result, { action: 'skip', id: 9 })
  assert.ok(!fake.calls.some((args) => args[1] === 'edit' || args[1] === 'create'))
  fake.done()
})

test('notes step edits one release and never creates', async () => {
  const fake = scripted([
    { args: ['release', 'view', tag], stdout: viewJson({ name: '0.1.1' }) },
    { args: ['release', 'view'], boundary: true, stdout: viewJson() },
    { args: ['release', 'edit', tag], stdout: 'https://example.test/v1.2.3\n' },
  ])
  const result = await ensureReleaseNotes(publishCtx(fake.gh))
  assert.deepEqual(result, { action: 'edit', id: 9 })
  assert.equal(fake.calls.filter((args) => args[1] === 'create').length, 0)
  const edit = fake.calls.find((args) => args[1] === 'edit')
  assert.ok(edit.includes('--notes-file'))
  assert.ok(edit.includes(notesFile))
  assert.ok(edit.includes('--draft=false'))
  fake.done()
})

test('notes step succeeds when a tag conflict lands on notes that are already set', async () => {
  const fake = scripted([
    { args: ['release', 'view', tag], stdout: viewJson({ name: '0.1.1' }) },
    { args: ['release', 'view'], boundary: true, stdout: viewJson() },
    { args: ['release', 'edit', tag], error: conflict() },
    { args: ['release', 'view', tag], stdout: viewJson() },
  ])
  const result = await ensureReleaseNotes(publishCtx(fake.gh))
  assert.equal(result.action, 'skip')
  assert.equal(result.reason, 'tag-conflict')
  assert.equal(fake.calls.filter((args) => args.includes('create')).length, 0)
  fake.done()
})

test('notes step fails a tag conflict when the title is still wrong, without creating', async () => {
  const fake = scripted([
    { args: ['release', 'view', tag], stdout: viewJson({ name: '0.1.1' }) },
    { args: ['release', 'view'], boundary: true, stdout: viewJson() },
    { args: ['release', 'edit', tag], error: conflict() },
    { args: ['release', 'view', tag], stdout: viewJson({ name: '0.1.1' }) },
  ])
  await assert.rejects(ensureReleaseNotes(publishCtx(fake.gh)), /Refusing to create another release/)
  assert.equal(fake.calls.filter((args) => args.includes('create')).length, 0)
  fake.done()
})

test('a create failure other than a tag conflict does not upload', async () => {
  const fake = scripted([
    { args: ['api'], stdout: '[[]]' },
    { args: ['release', 'create'], error: new Error('bad credentials') },
  ])
  await assert.rejects(publishReleaseAssets(publishCtx(fake.gh)), /bad credentials/)
  assert.equal(fake.calls.length, 2)
  fake.done()
})

test('notes step treats a missing latest release as not the channel', async () => {
  const missing = new Error('release not found')
  missing.stderr = 'release not found'
  const preTag = 'v1.2.3-rc.1'
  const fake = scripted([
    {
      args: ['release', 'view', preTag],
      stdout: viewJson({ tag_name: preTag, name: releaseTitle(preTag), prerelease: true }),
    },
    { args: ['release', 'view'], boundary: true, error: missing },
  ])
  const result = await ensureReleaseNotes(
    publishCtx(fake.gh, { tag: preTag, title: releaseTitle(preTag), prerelease: true }),
  )
  assert.deepEqual(result, { action: 'skip', id: 9 })
  fake.done()
})

test('notes step refuses to create a release that is not there', async () => {
  const missing = new Error('release not found')
  missing.stderr = 'release not found'
  const fake = scripted([{ args: ['release', 'view', tag], error: missing }])
  await assert.rejects(ensureReleaseNotes(publishCtx(fake.gh)), /refusing to create one/)
  assert.equal(fake.calls.length, 1)
  fake.done()
})

test('resolveReleaseContext binds the tag to the installer files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'magpie-release-'))
  try {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version: '1.2.3' }))
    fs.writeFileSync(path.join(dir, 'release-notes.md'), notes)
    const releaseDir = path.join(dir, 'release')
    fs.mkdirSync(releaseDir)
    for (const name of ['MAGPIE-9-Setup-1.2.3.exe', 'MAGPIE-9-Setup-1.2.3.exe.blockmap', 'latest.yml']) {
      fs.writeFileSync(path.join(releaseDir, name), 'x')
    }
    const env = { GITHUB_REF_NAME: tag, GITHUB_REPOSITORY: repo }
    const ctx = resolveReleaseContext({ env, desktopDir: dir, requireAssets: true })
    assert.equal(ctx.title, title)
    assert.equal(ctx.prerelease, false)
    assert.equal(ctx.assets.length, 3)
    fs.rmSync(path.join(releaseDir, 'latest.yml'))
    assert.throws(() => resolveReleaseContext({ env, desktopDir: dir, requireAssets: true }), /missing/)
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version: '1.2.3-rc.1' }))
    const pre = resolveReleaseContext({
      env: { GITHUB_REF_NAME: 'v1.2.3-rc.1', GITHUB_REPOSITORY: repo },
      desktopDir: dir,
      requireAssets: false,
    })
    assert.equal(pre.prerelease, true)
    assert.throws(
      () =>
        resolveReleaseContext({
          env: { GITHUB_REF_NAME: 'v9.9.9', GITHUB_REPOSITORY: repo },
          desktopDir: dir,
          requireAssets: false,
        }),
      /does not match tag/,
    )
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

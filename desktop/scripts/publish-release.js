// One GitHub Release per tag, then the installer, blockmap, and latest.yml.
//
// electron-builder must not publish. PublishManager caches a publisher only
// after awaiting its constructor, so the exe and the blockmap each construct
// a GitHubPublisher. Each one lists releases, misses the tag, and POSTs a
// release. GitHub keeps both. gh release edit then PATCHes one of them with
// tag_name set and gets 422 "Release.tag_name already exists".
//
// This script creates at most once. A 422 on create is "the tag is taken",
// not a prompt to try again. The notes step only edits, and it exits clean
// when the title and notes are already the ones we would write.

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const VIEW_FIELDS = 'databaseId,name,body,isDraft,isPrerelease,tagName'
const LIST_ATTEMPTS = 3

const TAG_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$/

export function versionFromTag(tag) {
  if (typeof tag !== 'string' || !tag.startsWith('v')) {
    throw new Error(`tag must be vX.Y.Z or vX.Y.Z-prerelease (got ${tag})`)
  }
  const version = tag.slice(1)
  if (!TAG_PATTERN.test(version)) {
    throw new Error(`tag must be vX.Y.Z or vX.Y.Z-prerelease (got ${tag})`)
  }
  return version
}

export function isPrereleaseTag(tag) {
  return versionFromTag(tag).includes('-')
}

export function releaseTitle(tag) {
  return `MAGPIE-9 ${tag}`
}

export function normalizeNotes(text) {
  return String(text ?? '')
    .replace(/\r\n/g, '\n')
    .trim()
}

export function titleAndNotesMatch(release, { title, notes }) {
  return release.name === title && normalizeNotes(release.body) === normalizeNotes(notes)
}

// Latest is a separate flag from the title. A prerelease must not be the
// channel; a stable release must be. Drafts are invisible to electron-updater.
export function metadataMatches(release, { title, notes, prerelease, latestId }) {
  if (!titleAndNotesMatch(release, { title, notes })) return false
  if (Boolean(release.prerelease) !== Boolean(prerelease)) return false
  if (release.draft) return false
  if (prerelease) return latestId !== release.id
  return latestId === release.id
}

export function normalizeRelease(raw) {
  if (raw == null || typeof raw !== 'object') {
    throw new Error('release payload was empty; refusing to create a release')
  }
  const id = raw.databaseId ?? raw.id
  const tag = raw.tagName ?? raw.tag_name
  if (id == null || tag == null) {
    throw new Error('release payload had no id or tag; refusing to create a release')
  }
  return {
    id,
    tag_name: tag,
    name: raw.name ?? '',
    body: raw.body ?? '',
    draft: Boolean(raw.isDraft ?? raw.draft),
    prerelease: Boolean(raw.isPrerelease ?? raw.prerelease),
  }
}

export function flattenReleasePages(payload) {
  let pages
  try {
    pages = JSON.parse(payload)
  } catch {
    throw new Error('release list was not JSON; refusing to create a release')
  }
  if (!Array.isArray(pages)) {
    throw new Error('expected a JSON array of release pages; refusing to create a release')
  }
  const releases = []
  for (const page of pages) {
    if (!Array.isArray(page)) {
      throw new Error('expected each release page to be an array; refusing to create a release')
    }
    for (const raw of page) releases.push(normalizeRelease(raw))
  }
  return releases
}

export function filterByTag(releases, tag) {
  return releases.filter((release) => release.tag_name === tag)
}

export function planAssetPublish(matches) {
  if (matches.length > 1) return { action: 'abort', count: matches.length }
  if (matches.length === 1) return { action: 'upload', id: matches[0].id }
  return { action: 'create' }
}

export function isTagNameConflict(error) {
  const text = `${error?.stderr ?? ''}\n${error?.stdout ?? ''}\n${error?.message ?? ''}`
  return text.includes('Release.tag_name already exists')
}

export function isMissingRelease(error) {
  const text = `${error?.stderr ?? ''}\n${error?.stdout ?? ''}\n${error?.message ?? ''}`
  return /release not found/i.test(text)
}

export function listReleaseArgs(repo) {
  return ['api', '--paginate', '--slurp', '--method', 'GET', `repos/${repo}/releases?per_page=100`]
}

export function viewReleaseArgs(repo, tag) {
  const args = ['release', 'view']
  if (tag) args.push(tag)
  args.push('--repo', repo, '--json', VIEW_FIELDS)
  return args
}

export function createReleaseArgs({ tag, title, notesFile, prerelease, repo }) {
  const args = [
    'release',
    'create',
    tag,
    '--repo',
    repo,
    '--title',
    title,
    '--notes-file',
    notesFile,
    '--verify-tag',
  ]
  if (prerelease) args.push('--prerelease', '--latest=false')
  else args.push('--latest')
  return args
}

// --clobber replaces an asset of the same name. A failed upload can drop the
// previous file; the next run uploads it again onto this same release.
export function uploadReleaseArgs({ tag, repo, assets }) {
  return ['release', 'upload', tag, ...assets, '--repo', repo, '--clobber']
}

export function editReleaseArgs({ tag, title, notesFile, prerelease, repo }) {
  const args = [
    'release',
    'edit',
    tag,
    '--repo',
    repo,
    '--title',
    title,
    '--notes-file',
    notesFile,
    '--draft=false',
  ]
  if (prerelease) args.push('--prerelease', '--latest=false')
  else args.push('--prerelease=false', '--latest')
  return args
}

function duplicateMessage(tag, count) {
  return `${count} GitHub Releases are already tagged ${tag}. Refusing to create another or upload into an ambiguous tag.`
}

async function listReleases(gh, repo) {
  return flattenReleasePages(await gh(listReleaseArgs(repo)))
}

async function listTag(gh, repo, tag) {
  return filterByTag(await listReleases(gh, repo), tag)
}

// The list can lag a create that just succeeded. Retry the read. Never POST again.
async function listUntilPresent(ctx, tag) {
  const pause = ctx.pause ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  let matches = []
  for (let attempt = 0; attempt < LIST_ATTEMPTS; attempt++) {
    matches = await listTag(ctx.gh, ctx.repo, tag)
    if (matches.length > 0) return matches
    if (attempt < LIST_ATTEMPTS - 1) await pause(500)
  }
  return matches
}

export async function publishReleaseAssets(ctx) {
  const { gh, repo, tag, title, notesFile, prerelease, assets } = ctx
  let matches = await listTag(gh, repo, tag)
  let plan = planAssetPublish(matches)
  if (plan.action === 'abort') throw new Error(duplicateMessage(tag, plan.count))

  if (plan.action === 'create') {
    try {
      await gh(createReleaseArgs({ tag, title, notesFile, prerelease, repo }))
    } catch (error) {
      if (!isTagNameConflict(error)) throw error
    }
    matches = await listUntilPresent(ctx, tag)
    plan = planAssetPublish(matches)
    if (plan.action === 'abort') throw new Error(duplicateMessage(tag, plan.count))
    if (plan.action !== 'upload') {
      throw new Error(`refusing to create a second release for ${tag}`)
    }
  }

  await gh(uploadReleaseArgs({ tag, repo, assets }))
  return { action: 'upload', id: plan.id }
}

async function viewRelease(gh, repo, tag) {
  try {
    return normalizeRelease(JSON.parse(await gh(viewReleaseArgs(repo, tag))))
  } catch (error) {
    // No tagged release, or no stable release for /releases/latest. Do not create.
    if (isMissingRelease(error)) return null
    throw error
  }
}

async function latestReleaseId(gh, repo) {
  const release = await viewRelease(gh, repo)
  return release ? release.id : null
}

export async function ensureReleaseNotes(ctx) {
  const { gh, repo, tag, title, notes, notesFile, prerelease } = ctx
  const release = await viewRelease(gh, repo, tag)
  if (release == null) {
    throw new Error(`no GitHub Release for ${tag}; refusing to create one`)
  }
  if (release.tag_name !== tag) {
    throw new Error(`release view returned ${release.tag_name}, expected ${tag}; refusing to create one`)
  }
  const latestId = await latestReleaseId(gh, repo)
  if (metadataMatches(release, { title, notes, prerelease, latestId })) {
    return { action: 'skip', id: release.id }
  }
  try {
    await gh(editReleaseArgs({ tag, title, notesFile, prerelease, repo }))
  } catch (error) {
    if (!isTagNameConflict(error)) throw error
    const again = await viewRelease(gh, repo, tag)
    if (again && titleAndNotesMatch(again, { title, notes })) {
      return { action: 'skip', id: again.id, reason: 'tag-conflict' }
    }
    throw new Error(
      `GitHub refused to edit ${tag} because the tag is already on a release, and the title or notes do not match. Refusing to create another release.`,
    )
  }
  return { action: 'edit', id: release.id }
}

export function resolveReleaseContext({ env, desktopDir, requireAssets }) {
  const tag = env.GITHUB_REF_NAME
  if (!tag) throw new Error('GITHUB_REF_NAME is required')
  const version = versionFromTag(tag)
  const repo = env.GITHUB_REPOSITORY
  if (!repo || !/^[^/\s]+\/[^/\s]+$/.test(repo)) {
    throw new Error('GITHUB_REPOSITORY must be owner/repo')
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(desktopDir, 'package.json'), 'utf8'))
  if (pkg.version !== version) {
    throw new Error(`desktop/package.json version ${pkg.version} does not match tag ${tag}`)
  }
  const notesFile = path.join(desktopDir, 'release-notes.md')
  if (!fs.existsSync(notesFile)) throw new Error(`missing ${notesFile}`)
  const notes = fs.readFileSync(notesFile, 'utf8')
  const result = {
    repo,
    tag,
    version,
    title: releaseTitle(tag),
    notes,
    notesFile,
    prerelease: isPrereleaseTag(tag),
  }
  if (!requireAssets) return result

  const releaseDir = path.join(desktopDir, 'release')
  const exeName = `MAGPIE-9-Setup-${version}.exe`
  const assets = [exeName, `${exeName}.blockmap`, 'latest.yml'].map((name) => path.join(releaseDir, name))
  for (const file of assets) {
    if (!fs.existsSync(file)) throw new Error(`missing ${file}`)
  }
  return { ...result, assets }
}

export function spawnGh(args, { input } = {}) {
  console.log(`+ gh ${args.join(' ')}`)
  const result = spawnSync('gh', args, {
    input,
    encoding: 'utf8',
    stdio: [input == null ? 'ignore' : 'pipe', 'pipe', 'pipe'],
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    const error = new Error((result.stderr || result.stdout || `gh exited ${result.status}`).trim())
    error.status = result.status
    error.stdout = result.stdout ?? ''
    error.stderr = result.stderr ?? ''
    throw error
  }
  return result.stdout ?? ''
}

function isDirectRun() {
  const entry = process.argv[1]
  if (!entry) return false
  return import.meta.url === pathToFileURL(path.resolve(entry)).href
}

async function main() {
  const args = process.argv.slice(2)
  const unknown = args.filter((arg) => arg !== '--notes-only')
  if (unknown.length > 0) throw new Error(`unknown argument: ${unknown.join(' ')}`)
  const notesOnly = args.includes('--notes-only')
  const base = resolveReleaseContext({
    env: process.env,
    desktopDir: desktop,
    requireAssets: !notesOnly,
  })
  const ctx = { ...base, gh: spawnGh }
  const result = notesOnly ? await ensureReleaseNotes(ctx) : await publishReleaseAssets(ctx)
  const what = notesOnly ? 'release notes' : 'release assets'
  console.log(`${what} ${result.action} for ${base.tag}`)
}

if (isDirectRun()) {
  main().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}

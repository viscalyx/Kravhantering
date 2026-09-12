import childProcess from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { promotionEntries } from './promote-container-candidates.mjs'
import {
  assertPublicationAllowed,
  RELEASE_IMAGE_ROLES,
  readPublicationEvidence,
  readPublishedTag,
} from './publication.mjs'

export function releaseAssetPaths(version) {
  const root = 'tmp/container-release-artifacts'
  const names = RELEASE_IMAGE_ROLES.map(([, name]) => name)
  const archive = `${root}/kravhantering-production-deploy-${version}.tar.gz`
  return [
    'container-stack.lock.json',
    'container-hsa-integration-support.lock.json',
    'container-test-support.lock.json',
    'hashes.sha256',
    'public/build.json',
    ...[
      'release-metadata.json',
      'grype-db-status.json',
      'vulnerability-policy-decision.json',
    ].map(name => `${root}/metadata/${name}`),
    ...names.map(name => `${root}/reports/${name}.json`),
    ...names.map(name => `${root}/sbom/${name}.spdx.json`),
    archive,
    `${archive}.sha256`,
    `${archive}.sigstore.json`,
    `${archive}.trusted-root.jsonl`,
  ]
}
const digest = bytes =>
  `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`

/** Preserve matching remote content; fill only verified missing stages under the same identity. */
export async function publishGitHubRelease(input, options = {}) {
  const { plan, metadata, notes, assets, archiveNotes } = input
  const evidence = options.evidence ?? readPublicationEvidence(plan, options)
  const { notes: committed } = assertPublicationAllowed(
    plan,
    metadata,
    evidence,
  )
  for (const name of [
    'Verify final artifact attestations',
    'Verify deployment archive provenance',
  ]) {
    if (evidence.checks[name] !== 'success')
      throw new Error(`Publication evidence missing or unsuccessful: ${name}.`)
  }
  if (
    archiveNotes !== committed.content ||
    (committed.unreleased && !notes.includes(committed.unreleased))
  )
    throw new Error(
      'Release page and archive must contain the exact committed operator notes.',
    )
  const required = releaseAssetPaths(plan.version).map(file =>
    path.basename(file),
  )
  if (
    new Set(assets.map(asset => asset.name)).size !== assets.length ||
    required.some(
      name =>
        !assets.some(
          asset =>
            asset.name === name && /^sha256:[a-f0-9]{64}$/u.test(asset.digest),
        ),
    )
  )
    throw new Error('Required release assets or content digests are missing.')
  const progress = {
    source: plan.commitSha,
    release: plan.releaseTagName,
    imagePublication: 'pending',
    releasePage: 'pending',
    assets: [],
    environmentDeployment: 'not observed',
  }
  try {
    const remote = options.remote ?? githubPublicationClient(plan, options)
    // Independently observe validated image publication before creating tags, pages or assets.
    for (const entry of promotionEntries(metadata)) {
      for (const tag of entry.tags) {
        if ((await remote.imageDigest(tag)) !== entry.manifestDigest)
          throw new Error(
            `Published image identity is missing or conflicting: ${tag}.`,
          )
      }
    }
    progress.imagePublication = 'verified'
    const verifyTag = sha => {
      if (sha && sha !== plan.commitSha)
        throw new Error(
          `Tag ${plan.releaseTagName} points at ${sha}, expected ${plan.commitSha}.`,
        )
    }
    const verifyRelease = release => {
      if (
        release &&
        (release.body !== notes ||
          release.name !== plan.releaseTagName ||
          release.prerelease !== plan.prerelease ||
          release.draft)
      )
        throw new Error(
          `Conflicting release page ${plan.releaseTagName}; preserve it and reconcile manually.`,
        )
    }
    let tag = await remote.tag()
    verifyTag(tag)
    let release = await remote.release()
    if (release && !tag)
      throw new Error('Existing release has an unverifiable tag.')
    verifyRelease(release)
    if (release) progress.releasePage = 'preserved'
    const existing = release ? await remote.assets(release.id) : []
    if (new Set(existing.map(asset => asset.name)).size !== existing.length)
      throw new Error('Ambiguous duplicate remote assets.')
    for (const asset of assets) {
      const prior = existing.find(candidate => candidate.name === asset.name)
      if (prior && (await remote.assetDigest(prior)) !== asset.digest)
        throw new Error(
          `Conflicting or unverifiable asset: ${asset.name}. Preserve successful publication.`,
        )
    }
    if (!tag) {
      try {
        await remote.createTag()
      } catch (error) {
        tag = await remote.tag()
        if (!tag)
          throw new Error(
            `Tag write uncertain: ${error.message}. Inspect remote state before a manual rerun.`,
          )
        verifyTag(tag)
      }
      tag = await remote.tag()
      verifyTag(tag)
      if (!tag) throw new Error('Created tag could not be verified.')
    }
    if (!release) {
      try {
        await remote.createRelease(notes)
      } catch (error) {
        release = await remote.release()
        if (!release)
          throw new Error(
            `Release page write uncertain: ${error.message}. Inspect remote state before a manual rerun.`,
          )
      }
      release = await remote.release()
      verifyRelease(release)
      if (!release)
        throw new Error('Created release page could not be verified.')
      progress.releasePage = 'published'
    }
    const delivered = progress.assets
    for (const asset of assets) {
      if (existing.some(candidate => candidate.name === asset.name)) {
        delivered.push({ name: asset.name, outcome: 'preserved' })
        continue
      }
      let writeError
      try {
        await remote.uploadAsset(release.id, asset)
      } catch (error) {
        writeError = error
      }
      const observed = (await remote.assets(release.id)).filter(
        candidate => candidate.name === asset.name,
      )
      if (
        observed.length !== 1 ||
        (await remote.assetDigest(observed[0])) !== asset.digest
      )
        throw new Error(
          `Asset delivery incomplete or conflicting: ${asset.name}${writeError ? ` (${writeError.message})` : ''}. Keep earlier stages and inspect remote state before a manual rerun.`,
        )
      delivered.push({ name: asset.name, outcome: 'published' })
    }
    return progress
  } catch (error) {
    error.publicationResult = { ...progress, error: error.message }
    throw error
  }
}

export function githubPublicationClient(plan, options = {}) {
  const execFileSync = options.execFileSync ?? childProcess.execFileSync
  const call = (args, encoding = 'utf8') =>
    execFileSync('gh', args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      encoding,
      maxBuffer: 128 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  const prefix = `repos/${plan.repository}`
  const json = endpoint => JSON.parse(call(['api', endpoint]))
  const optional = endpoint => {
    try {
      return json(endpoint)
    } catch (error) {
      if (/HTTP 404/u.test(String(error.stderr))) return undefined
      throw error
    }
  }
  return {
    async imageDigest(tag) {
      return execFileSync(
        'skopeo',
        ['inspect', '--format', '{{.Digest}}', `docker://${tag}`],
        { env: options.env ?? process.env, encoding: 'utf8' },
      ).trim()
    },
    async tag() {
      return readPublishedTag(plan, options)
    },
    async release() {
      return optional(`${prefix}/releases/tags/${plan.releaseTagName}`)
    },
    async assets(id) {
      return JSON.parse(
        call([
          'api',
          '--paginate',
          '--slurp',
          `${prefix}/releases/${id}/assets?per_page=100`,
        ]),
      ).flat()
    },
    async assetDigest(asset) {
      return (
        asset.digest ??
        digest(
          call(
            [
              'api',
              '-H',
              'Accept: application/octet-stream',
              `${prefix}/releases/assets/${asset.id}`,
            ],
            null,
          ),
        )
      )
    },
    async createTag() {
      call([
        'api',
        '-X',
        'POST',
        `${prefix}/git/refs`,
        '-f',
        `ref=refs/tags/${plan.releaseTagName}`,
        '-f',
        `sha=${plan.commitSha}`,
      ])
    },
    async createRelease(notes) {
      call([
        'api',
        '-X',
        'POST',
        `${prefix}/releases`,
        '-f',
        `tag_name=${plan.releaseTagName}`,
        '-f',
        `name=${plan.releaseTagName}`,
        '-f',
        `body=${notes}`,
        '-F',
        `prerelease=${plan.prerelease}`,
        '-f',
        `make_latest=${!plan.prerelease}`,
      ])
    },
    async uploadAsset(id, asset) {
      call([
        'api',
        '-X',
        'POST',
        '-H',
        'Content-Type: application/octet-stream',
        `https://uploads.github.com/${prefix}/releases/${id}/assets?name=${encodeURIComponent(asset.name)}`,
        '--input',
        asset.file,
      ])
    },
  }
}

/* v8 ignore start -- CLI file/process orchestration. */
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const root = 'tmp/container-release-artifacts'
    const plan = JSON.parse(
      fs.readFileSync(`${root}/metadata/release-plan.json`, 'utf8'),
    )
    const metadata = JSON.parse(
      fs.readFileSync(`${root}/metadata/release-metadata.json`, 'utf8'),
    )
    const assets = releaseAssetPaths(plan.version).map(file => ({
      file,
      name: path.basename(file),
      digest: digest(fs.readFileSync(file)),
    }))
    const archive = `${root}/kravhantering-production-deploy-${plan.version}.tar.gz`
    const archiveNotes = childProcess.execFileSync(
      'tar',
      [
        '-xOf',
        archive,
        `kravhantering-production-deploy-${plan.version}/docs/operations/operator-upgrade-notes.md`,
      ],
      { encoding: 'utf8' },
    )
    const result = await publishGitHubRelease({
      plan,
      metadata,
      assets,
      archiveNotes,
      notes: fs.readFileSync(`${root}/release-notes.md`, 'utf8'),
    })
    fs.writeFileSync(
      `${root}/metadata/github-publication-result.json`,
      `${JSON.stringify(result, null, 2)}\n`,
    )
    if (process.env.GITHUB_STEP_SUMMARY)
      fs.appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        `Publication stages:\n\n\x60\x60\x60json\n${JSON.stringify(result, null, 2)}\n\x60\x60\x60\n`,
      )
  } catch (error) {
    if (error.publicationResult)
      fs.writeFileSync(
        'tmp/container-release-artifacts/metadata/github-publication-result.json',
        `${JSON.stringify(error.publicationResult, null, 2)}\n`,
      )
    console.error(error.message)
    process.exitCode = 1
  }
}
/* v8 ignore stop */

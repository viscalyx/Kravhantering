import childProcess from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { setTimeout } from 'node:timers/promises'
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

const unfinished = asset => asset.state === 'starter' && !asset.digest

async function deliverAsset(remote, releaseId, asset, sleep) {
  const errors = []
  const fail = detail =>
    new Error(
      `Asset delivery incomplete or conflicting: ${asset.name}. ${[...errors, detail].join(' ')} Keep earlier stages and inspect remote state before a manual rerun.`,
    )
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await remote.uploadAsset(releaseId, asset)
    } catch (error) {
      errors.push(`Upload attempt ${attempt}: ${error.message}`)
    }
    try {
      const observed = (await remote.assets(releaseId)).filter(
        candidate => candidate.name === asset.name,
      )
      if (observed.length > 1)
        throw new Error('Ambiguous duplicate remote assets.')
      const current = observed[0]
      if (current?.state === 'uploaded') {
        if ((await remote.assetDigest(current)) !== asset.digest)
          throw new Error('Uploaded asset digest does not match; preserve it.')
        return
      }
      if (current && !unfinished(current))
        throw new Error('Unrecognized asset state; preserve it.')
      if (attempt === 3)
        throw new Error('Upload did not complete after 3 attempts.')
      if (current) await remote.removeUnfinishedAsset(current)
    } catch (error) {
      throw fail(`Verification/recovery: ${error.message}`)
    }
    await sleep(attempt * 1000)
  }
}

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
        (!Number.isSafeInteger(release.id) ||
          release.id <= 0 ||
          typeof release.draft !== 'boolean' ||
          release.body !== notes ||
          release.name !== plan.releaseTagName ||
          release.prerelease !== plan.prerelease ||
          release.tag_name !== plan.releaseTagName)
      )
        throw new Error(
          `Conflicting release page ${plan.releaseTagName}; preserve it and reconcile manually.`,
        )
    }
    const observeRelease = async (id, published = false) => {
      for (let attempt = 1; attempt <= 3; attempt++) {
        const observed = await remote.release(id)
        verifyRelease(observed)
        if (observed && id !== undefined && observed.id !== id)
          throw new Error('Release identity changed before publication.')
        if (attempt === 3 || (observed && (!published || !observed.draft)))
          return observed
        await (options.sleep ?? setTimeout)(attempt * 1000)
      }
    }
    let tag = await remote.tag()
    verifyTag(tag)
    let release = await remote.release()
    if (release && !tag)
      throw new Error('Existing release has an unverifiable tag.')
    verifyRelease(release)
    if (release) progress.releasePage = release.draft ? 'draft' : 'preserved'
    const existing = release ? await remote.assets(release.id) : []
    if (new Set(existing.map(asset => asset.name)).size !== existing.length)
      throw new Error('Ambiguous duplicate remote assets.')
    for (const asset of assets) {
      const prior = existing.find(candidate => candidate.name === asset.name)
      if (
        prior &&
        !unfinished(prior) &&
        (prior.state !== 'uploaded' ||
          (await remote.assetDigest(prior)) !== asset.digest)
      )
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
      let created
      try {
        created = await remote.createRelease(notes)
      } catch (error) {
        try {
          created = await observeRelease()
          if (!created) throw new Error('Release page could not be found.')
        } catch (inspectionError) {
          throw new Error(
            `Release page write uncertain: ${error.message}. ${inspectionError.message} Inspect remote state before a manual rerun.`,
          )
        }
      }
      verifyRelease(created)
      if (!created)
        throw new Error(
          'Created release page could not be verified: response missing.',
        )
      progress.releasePage = created.draft ? 'draft' : 'preserved'
      // Retain the write's identity: draft discovery by tag/list can lag creation.
      release = await observeRelease(created.id)
      if (!release)
        throw new Error(
          `Created release page could not be verified: release ID ${created.id}.`,
        )
    }
    const delivered = progress.assets
    for (const asset of assets) {
      const prior = existing.find(candidate => candidate.name === asset.name)
      if (prior && !unfinished(prior)) {
        delivered.push({ name: asset.name, outcome: 'preserved' })
        continue
      }
      if (prior) await remote.removeUnfinishedAsset(prior)
      await deliverAsset(remote, release.id, asset, options.sleep ?? setTimeout)
      delivered.push({ name: asset.name, outcome: 'published' })
    }
    if (release.draft) {
      // Recheck the complete inventory and source identity before public visibility.
      const finalAssets = await remote.assets(release.id)
      for (const asset of assets) {
        const observed = finalAssets.filter(item => item.name === asset.name)
        if (
          observed.length !== 1 ||
          observed[0].state !== 'uploaded' ||
          (await remote.assetDigest(observed[0])) !== asset.digest
        )
          throw new Error(
            `Release remains a draft: required asset is unverified: ${asset.name}.`,
          )
      }
      const finalTag = await remote.tag()
      verifyTag(finalTag)
      if (!finalTag)
        throw new Error('Release remains a draft: source tag is missing.')
      const finalRelease = await observeRelease(release.id)
      if (!finalRelease)
        throw new Error('Release identity changed before publication.')
      let publishError
      progress.releasePage = 'uncertain'
      try {
        await remote.publishRelease(release.id)
      } catch (error) {
        publishError = error
      }
      let published
      try {
        published = await observeRelease(release.id, true)
        if (published?.draft) progress.releasePage = 'draft'
        if (!published || published.draft)
          throw new Error('Published release could not be verified.')
      } catch (error) {
        throw new Error(
          `Release publication uncertain: ${publishError ? `${publishError.message}. ` : ''}${error.message}`,
        )
      }
      progress.releasePage = 'published'
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
    async release(id) {
      if (id !== undefined) return optional(`${prefix}/releases/${id}`)
      const published = optional(
        `${prefix}/releases/tags/${plan.releaseTagName}`,
      )
      if (published) return published
      // The tag endpoint documents published releases; list with write access to resume drafts.
      const matching = JSON.parse(
        call([
          'api',
          '--paginate',
          '--slurp',
          `${prefix}/releases?per_page=100`,
        ]),
      )
        .flat()
        .filter(release => release.tag_name === plan.releaseTagName)
      if (matching.length > 1) throw new Error('Ambiguous duplicate releases.')
      return matching[0]
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
      return JSON.parse(
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
          '-F',
          'draft=true',
          '-f',
          'make_latest=false',
        ]),
      )
    },
    async publishRelease(id) {
      call([
        'api',
        '-X',
        'PATCH',
        `${prefix}/releases/${id}`,
        '-F',
        'draft=false',
        '-f',
        `make_latest=${!plan.prerelease}`,
      ])
    },
    async removeUnfinishedAsset(asset) {
      const current = json(`${prefix}/releases/assets/${asset.id}`)
      if (current.name !== asset.name || !unfinished(current))
        throw new Error(
          `Refusing to delete changed or completed asset: ${asset.name}.`,
        )
      call(['api', '-X', 'DELETE', `${prefix}/releases/assets/${asset.id}`])
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

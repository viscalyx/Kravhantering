import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  cleanupSourceRequest,
  createCleanupSourceLock,
  selectCleanupSourceRelease,
} from './cleanup-source.mjs'
import {
  deploymentArchiveName,
  verifyDeploymentProvenance,
} from './deployment-provenance.mjs'

export function prepareCleanupSource(args, dependencies = {}) {
  const { repository, targetTag, outputDir, sourceTag } =
    cleanupSourceRequest(args)
  const output = path.resolve(outputDir)
  fs.mkdirSync(output, { recursive: true })
  const prepared = fs.mkdtempSync(path.join(output, 'cleanup-source.'))
  fs.chmodSync(prepared, 0o755)
  const commandEnv = {
    ...process.env,
    GH_CONFIG_DIR: path.join(prepared, 'gh'),
    XDG_CACHE_HOME: path.join(prepared, 'cache'),
  }
  delete commandEnv.GH_TOKEN
  delete commandEnv.GITHUB_TOKEN
  const run =
    dependencies.run ??
    ((command, argv) =>
      execFileSync(command, argv, {
        encoding: 'utf8',
        timeout: 300_000,
        maxBuffer: 32 * 1024 * 1024,
        env: commandEnv,
      }))
  const verify =
    dependencies.verify ??
    (options => verifyDeploymentProvenance(options, { execFileSyncImpl: run }))
  const download = (url, file) =>
    run('curl', [
      '--disable',
      '--fail',
      '--silent',
      '--show-error',
      '--location',
      '--retry',
      '3',
      ...(file ? ['--output', file] : []),
      url,
    ])
  const releases = []
  for (let page = 1; ; page++) {
    const batch = JSON.parse(
      download(
        `https://api.github.com/repos/${repository}/releases?per_page=100&page=${page}`,
      ),
    )
    releases.push(...batch)
    if (batch.length < 100) break
  }
  const selected = selectCleanupSourceRelease(
    releases.map(release => ({
      tagName: release.tag_name,
      isDraft: release.draft,
      isPrerelease: release.prerelease,
      publishedAt: release.published_at,
    })),
    targetTag,
    sourceTag,
  )
  const version = selected.tagName.slice(1)
  const commitSha = JSON.parse(
    download(
      `https://api.github.com/repos/${repository}/commits/${selected.tagName}`,
    ),
  ).sha
  const archive = path.join(prepared, deploymentArchiveName(version))
  const assetUrl = `https://github.com/${repository}/releases/download/${selected.tagName}/${path.basename(archive)}`
  download(assetUrl, archive)
  download(`${assetUrl}.sigstore.json`, `${archive}.sigstore.json`)
  // Fetch the verifier's current trust roots rather than trusting a root file
  // downloaded beside the artifact being authenticated.
  const trustedRoot = path.join(prepared, 'trusted-root.jsonl')
  fs.writeFileSync(trustedRoot, run('gh', ['attestation', 'trusted-root']))
  verify({
    subject: archive,
    repository,
    signerWorkflow: `${repository}/.github/workflows/container-release.yml`,
    sourceDigest: commitSha,
    sourceRef: selected.isPrerelease
      ? 'refs/heads/main'
      : `refs/tags/${selected.tagName}`,
    releaseVersion: version,
    releaseTag: selected.tagName,
    bundle: `${archive}.sigstore.json`,
    trustedRoot,
  })
  // Extract only after the archive has passed the established release policy.
  run('tar', ['-xzf', archive, '--no-same-owner', '-C', prepared])
  const bundle = path.join(prepared, path.basename(archive, '.tar.gz'))
  const read = file =>
    JSON.parse(fs.readFileSync(path.join(bundle, file), 'utf8'))
  const hash = file =>
    crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
  const source = createCleanupSourceLock({
    manifest: read('DEPLOYMENT-MANIFEST.json'),
    stackLock: read('container-stack.lock.json'),
    selected,
    commitSha,
    archiveSha256: hash(archive),
    stackLockSha256: hash(path.join(bundle, 'container-stack.lock.json')),
  })
  fs.writeFileSync(
    path.join(output, 'cleanup-source.json'),
    `${JSON.stringify(source, null, 2)}\n`,
  )
  fs.writeFileSync(
    path.join(output, 'cleanup-source-selection.json'),
    `${JSON.stringify(
      {
        policy: sourceTag ? 'explicit' : 'previous-published',
        tag: selected.tagName,
        publishedAt: selected.publishedAt,
        archive,
        bundle,
      },
      null,
      2,
    )}\n`,
  )
  return source
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    prepareCleanupSource(process.argv.slice(2))
    console.info('Cleanup source release authenticated and locked.')
  } catch (error) {
    console.error(
      'Cleanup source release preparation failed; no compatibility approval was produced.',
      error instanceof Error ? error.message : String(error),
    )
    process.exitCode = 1
  }
}

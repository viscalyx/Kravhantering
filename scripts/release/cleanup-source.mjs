export function selectCleanupSourceRelease(releases, targetTag, override) {
  const target = releases.find(
    release =>
      release.tagName === targetTag &&
      !release.isDraft &&
      Number.isFinite(Date.parse(release.publishedAt)),
  )
  const cutoff = target ? Date.parse(target.publishedAt) : Infinity
  const candidates = releases.filter(
    release =>
      !release.isDraft &&
      release.tagName !== targetTag &&
      Number.isFinite(Date.parse(release.publishedAt)),
  )
  const selected = override
    ? candidates.find(release => release.tagName === override)
    : candidates
        .filter(release => Date.parse(release.publishedAt) < cutoff)
        .sort(
          (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt),
        )[0]
  if (!selected || !/^v[0-9][a-zA-Z0-9.+-]*$/.test(selected.tagName))
    throw new Error('A published cleanup source release is required')
  return selected
}

export function cleanupSourceRequest(args) {
  const [repository, targetTag, outputDir, sourceTag] = args
  const tag = /^v[0-9][a-zA-Z0-9.+-]*$/
  if (
    args.length < 3 ||
    args.length > 4 ||
    !/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repository) ||
    repository.startsWith('-') ||
    !tag.test(targetTag) ||
    !outputDir ||
    (sourceTag !== undefined && !tag.test(sourceTag))
  )
    throw new Error(
      'Usage: prepare-cleanup-source.mjs <owner/repo> <target-tag> <output-dir> [source-tag]',
    )
  return { repository, targetTag, outputDir, sourceTag }
}

export function createCleanupSourceLock({
  manifest,
  stackLock,
  selected,
  commitSha,
  archiveSha256,
  stackLockSha256,
}) {
  const image = stackLock.services.find(service => service.name === 'db-job')
  if (
    manifest.version !== selected.tagName.slice(1) ||
    manifest.sourceRelease?.tag !== selected.tagName ||
    manifest.commitSha !== commitSha ||
    !/^[a-f0-9]{40}$/.test(commitSha) ||
    typeof manifest.database?.expectedSchemaVersion !== 'string' ||
    !/^[a-zA-Z0-9]{1,200}$/.test(manifest.database.expectedSchemaVersion) ||
    !image ||
    !/^sha256:[a-f0-9]{64}$/.test(image.imageId) ||
    !/^sha256:[a-f0-9]{64}$/.test(image.manifestDigest) ||
    manifest.imageIds?.dbJob !== image.imageId ||
    manifest.images?.dbJob !== `${image.image}@${image.manifestDigest}` ||
    !/^[a-f0-9]{64}$/.test(archiveSha256) ||
    !/^[a-f0-9]{64}$/.test(stackLockSha256)
  )
    throw new Error(
      'Cleanup source metadata does not match its authenticated release',
    )
  return {
    release: manifest.version,
    schemaVersion: manifest.database.expectedSchemaVersion,
    archiveSha256,
    stackLockSha256,
  }
}

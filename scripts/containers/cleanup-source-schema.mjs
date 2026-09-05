import crypto from 'node:crypto'

export function selectCleanupSourceMigrations(
  source,
  descriptors,
  readMigration,
) {
  if (!Array.isArray(source.migrationFiles) || !source.migrationFiles.length)
    throw new Error('missing source migration lock')
  const selected = source.migrationFiles.map(file => {
    if (!/^\d{4}_[a-z0-9_]+\.mjs$/.test(file.fileName))
      throw new Error('invalid source migration path')
    const descriptor = descriptors.find(item => item.fileName === file.fileName)
    if (
      !descriptor ||
      crypto
        .createHash('sha256')
        .update(readMigration(file.fileName))
        .digest('hex') !== file.sha256
    )
      throw new Error('source migration identity mismatch')
    return descriptor
  })
  if (
    new Set(selected).size !== selected.length ||
    selected.at(-1).name !== source.schemaVersion
  )
    throw new Error('source schema head mismatch')
  return selected
}

export function validateCleanupFixtureInputs(
  source,
  databaseName,
  env,
  runtimeManifest,
) {
  if (
    env.KRAVHANTERING_CLEANUP_FIXTURE !== '1' ||
    !/^cleanup_compat_[a-z0-9_]+$/.test(databaseName)
  )
    throw new Error('disposable cleanup fixture required')
  if (
    crypto.createHash('sha256').update(runtimeManifest).digest('hex') !==
    source.runtimePermissionManifestSha256
  )
    throw new Error('source migration dependency identity mismatch')
}

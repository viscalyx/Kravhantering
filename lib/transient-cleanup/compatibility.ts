export const CLEANUP_TARGET_KINDS = [
  'ai_run_coordination_entries',
  'ai_forensic_evidence',
  'hsa_verification_quota_buckets',
  'requirement_import_validation_sessions',
  'requirement_import_validation_rate_buckets',
] as const

export interface CleanupSchemaEvidence {
  imageId: string
  outcome: 'success'
  schemaFingerprint: string
  schemaVersion: string
  targets: { kind: string; outcome: 'success' | 'not_applicable' }[]
}

export interface CleanupSourceReleaseLock {
  archiveSha256: string
  release: string
  schemaVersion: string
  stackLockSha256: string
}

export interface CleanupCompatibilityContract {
  imageId: string
  manifestDigest: string
  schemaVersion: 1
  sources: CleanupSourceReleaseLock[]
  target: { release: string; schemaVersion: string }
  verification: CleanupSchemaEvidence[]
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('invalid cleanup compatibility contract')
  }
  return value as Record<string, unknown>
}

function identifier(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._+-]{0,199}$/.test(value)
  ) {
    throw new Error('invalid cleanup compatibility identifier')
  }
  return value
}

function digest(value: unknown, prefix = true): string {
  if (
    typeof value !== 'string' ||
    !(prefix ? /^sha256:[a-f0-9]{64}$/ : /^[a-f0-9]{64}$/).test(value)
  ) {
    throw new Error('invalid cleanup compatibility digest')
  }
  return value
}

export function parseCleanupCompatibilityContract(
  value: unknown,
): CleanupCompatibilityContract {
  const data = record(value)
  if (
    data.schemaVersion !== 1 ||
    !Array.isArray(data.sources) ||
    !Array.isArray(data.verification)
  ) {
    throw new Error('invalid cleanup compatibility version or matrix')
  }
  const target = record(data.target)
  const contract: CleanupCompatibilityContract = {
    schemaVersion: 1,
    imageId: digest(data.imageId),
    manifestDigest: digest(data.manifestDigest),
    target: {
      release: identifier(target.release),
      schemaVersion: identifier(target.schemaVersion),
    },
    sources: data.sources.map(value => {
      const source = record(value)
      return {
        release: identifier(source.release),
        schemaVersion: identifier(source.schemaVersion),
        archiveSha256: digest(source.archiveSha256, false),
        stackLockSha256: digest(source.stackLockSha256, false),
      }
    }),
    verification: [],
  }
  const releases = [
    contract.target.release,
    ...contract.sources.map(source => source.release),
  ]
  if (new Set(releases).size !== releases.length)
    throw new Error('duplicate cleanup release')
  const schemas = new Set([
    contract.target.schemaVersion,
    ...contract.sources.map(source => source.schemaVersion),
  ])
  for (const value of data.verification) {
    const evidence = record(value)
    const schemaVersion = identifier(evidence.schemaVersion)
    if (
      !schemas.delete(schemaVersion) ||
      evidence.imageId !== contract.imageId ||
      evidence.outcome !== 'success' ||
      !Array.isArray(evidence.targets)
    ) {
      throw new Error('cleanup schema verification is missing or failed')
    }
    const kinds = new Set<string>(CLEANUP_TARGET_KINDS)
    const targets = evidence.targets.map<
      CleanupSchemaEvidence['targets'][number]
    >(value => {
      const target = record(value)
      if (
        typeof target.kind !== 'string' ||
        !kinds.delete(target.kind) ||
        (target.outcome !== 'success' && target.outcome !== 'not_applicable')
      ) {
        throw new Error('cleanup target verification is missing or failed')
      }
      return { kind: target.kind, outcome: target.outcome }
    })
    if (kinds.size) throw new Error('cleanup target verification is incomplete')
    contract.verification.push({
      schemaVersion,
      schemaFingerprint: digest(evidence.schemaFingerprint, false),
      imageId: contract.imageId,
      outcome: 'success',
      targets,
    })
  }
  if (schemas.size) throw new Error('cleanup schema verification is incomplete')
  return contract
}

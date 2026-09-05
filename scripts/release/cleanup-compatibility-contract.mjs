import { isDeepStrictEqual } from 'node:util'
import { parseCleanupCompatibilityContract } from '../../lib/transient-cleanup/compatibility.ts'

export function createCleanupCompatibilityContract({
  manifest,
  stackLock,
  sources = [],
  evidence,
}) {
  const image = stackLock.services.find(service => service.name === 'db-job')
  return parseCleanupCompatibilityContract({
    schemaVersion: 1,
    imageId: image?.imageId,
    manifestDigest: image?.manifestDigest,
    target: {
      release: manifest.version,
      schemaVersion: manifest.database.expectedSchemaVersion,
    },
    sources,
    verification: evidence,
  })
}

export function verifyCleanupCompatibilityContract(
  contract,
  manifest,
  stackLock,
  declaredSources,
) {
  const parsed = parseCleanupCompatibilityContract(contract)
  const image = stackLock.services.find(service => service.name === 'db-job')
  if (
    parsed.imageId !== image?.imageId ||
    parsed.manifestDigest !== image?.manifestDigest ||
    parsed.target.release !== manifest.version ||
    parsed.target.schemaVersion !== manifest.database.expectedSchemaVersion
  ) {
    throw new Error(
      'cleanup compatibility contract does not match the release lock',
    )
  }
  if (
    declaredSources &&
    !isDeepStrictEqual(
      [...parsed.sources].sort((a, b) => a.release.localeCompare(b.release)),
      [...declaredSources].sort((a, b) => a.release.localeCompare(b.release)),
    )
  )
    throw new Error(
      'cleanup source declarations do not match the verified matrix',
    )
  return parsed
}

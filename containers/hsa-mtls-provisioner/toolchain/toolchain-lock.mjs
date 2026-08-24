const LOCK_SCHEMA_VERSION = 1
const SELECTION_FIELDS = [
  'baseImage',
  'baseTag',
  'baseDigest',
  'nodeVersion',
  'opensslPackageVersion',
  'caCertificatesPackageVersion',
]

function mismatch(message) {
  throw new Error(`HSA provisioner toolchain lock mismatch: ${message}`)
}

/**
 * Verify both the selected build inputs and versions observed inside the image
 * against the committed toolchain lock.
 *
 * @param {{
 *   lock: Record<string, unknown>,
 *   observed: {
 *     caCertificatesPackageVersion: string,
 *     nodeVersion: string,
 *     opensslPackageVersion: string,
 *     opensslVersion: string,
 *   },
 *   selection: Record<string, string>,
 * }} input
 * @returns {void}
 */
export function verifyToolchainLock({ lock, observed, selection }) {
  if (lock.schemaVersion !== LOCK_SCHEMA_VERSION) {
    mismatch('unsupported schema version')
  }
  for (const field of SELECTION_FIELDS) {
    if (typeof lock[field] !== 'string' || lock[field].length === 0) {
      mismatch(`lock field ${field} is invalid`)
    }
    if (selection[field] !== lock[field]) {
      mismatch(`selected ${field} differs from the lock`)
    }
  }
  if (typeof lock.opensslVersion !== 'string' || !lock.opensslVersion) {
    mismatch('lock field opensslVersion is invalid')
  }

  const observedNodeMajor = /^(\d+)(?:\.|$)/u.exec(observed.nodeVersion)?.[1]
  if (observedNodeMajor !== lock.nodeVersion) {
    mismatch('installed Node major differs from the lock')
  }
  if (observed.opensslPackageVersion !== lock.opensslPackageVersion) {
    mismatch('installed OpenSSL package differs from the lock')
  }
  if (observed.opensslVersion !== lock.opensslVersion) {
    mismatch('installed OpenSSL binary differs from the lock')
  }
  if (
    observed.caCertificatesPackageVersion !== lock.caCertificatesPackageVersion
  ) {
    mismatch('installed CA certificates package differs from the lock')
  }
}

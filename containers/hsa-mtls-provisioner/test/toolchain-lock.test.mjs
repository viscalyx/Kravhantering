import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { verifyToolchainLock } from '../toolchain/toolchain-lock.mjs'

const lock = Object.freeze({
  baseDigest:
    'sha256:a747ad80c8a161b650d79a6da9c422005b91148b18b8d2c669eb5a0b7c07e600',
  baseImage: 'docker.io/library/node',
  baseTag: '24-trixie-slim',
  caCertificatesPackageVersion: '20250419',
  nodeVersion: '24',
  opensslPackageVersion: '3.5.7-1~deb13u2',
  opensslVersion: '3.5.7',
  schemaVersion: 1,
})

function validInput() {
  return {
    lock: { ...lock },
    observed: {
      caCertificatesPackageVersion: lock.caCertificatesPackageVersion,
      nodeVersion: '24.7.0',
      opensslPackageVersion: lock.opensslPackageVersion,
      opensslVersion: lock.opensslVersion,
    },
    selection: {
      baseDigest: lock.baseDigest,
      baseImage: lock.baseImage,
      baseTag: lock.baseTag,
      caCertificatesPackageVersion: lock.caCertificatesPackageVersion,
      nodeVersion: lock.nodeVersion,
      opensslPackageVersion: lock.opensslPackageVersion,
    },
  }
}

describe('HSA provisioner toolchain lock', () => {
  it('accepts selected inputs and installed versions matching the lock', () => {
    assert.doesNotThrow(() => verifyToolchainLock(validInput()))
  })

  it('rejects every selected build input when it drifts', () => {
    for (const field of [
      'baseImage',
      'baseTag',
      'baseDigest',
      'nodeVersion',
      'opensslPackageVersion',
      'caCertificatesPackageVersion',
    ]) {
      const input = validInput()
      input.selection[field] = `${input.selection[field]}-drift`
      assert.throws(
        () => verifyToolchainLock(input),
        new RegExp(`selected ${field} differs from the lock`, 'u'),
      )
    }
  })

  it('rejects invalid lock schemas and fields', () => {
    const unsupported = validInput()
    unsupported.lock.schemaVersion = 2
    assert.throws(
      () => verifyToolchainLock(unsupported),
      /unsupported schema version/u,
    )

    for (const value of ['', undefined]) {
      const invalid = validInput()
      invalid.lock.baseTag = value
      assert.throws(
        () => verifyToolchainLock(invalid),
        /lock field baseTag is invalid/u,
      )

      const invalidOpenSsl = validInput()
      invalidOpenSsl.lock.opensslVersion = value
      assert.throws(
        () => verifyToolchainLock(invalidOpenSsl),
        /lock field opensslVersion is invalid/u,
      )
    }
  })

  it('rejects drift in each version observed inside the image', () => {
    const cases = [
      ['nodeVersion', '25.0.0', 'installed Node major'],
      ['nodeVersion', 'not-a-version', 'installed Node major'],
      ['opensslPackageVersion', '3.5.6-drift', 'installed OpenSSL package'],
      ['opensslVersion', '3.5.6-drift', 'installed OpenSSL binary'],
      [
        'caCertificatesPackageVersion',
        '20250419-drift',
        'installed CA certificates package',
      ],
    ]
    for (const [field, value, message] of cases) {
      const input = validInput()
      input.observed[field] = value
      assert.throws(() => verifyToolchainLock(input), new RegExp(message, 'u'))
    }
  })
})

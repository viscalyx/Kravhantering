import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { verifyToolchainLock } from '../toolchain/toolchain-lock.mjs'

const lock = Object.freeze({
  baseDigest:
    'sha256:f0e6f6fa5bd82741bdf9b304341c94bbac4268a7f94d710c26eac01f20528c2b',
  baseImage: 'registry.access.redhat.com/ubi10/nodejs-24-minimal',
  baseTag: 'latest',
  caCertificatesPackageVersion: '2025.2.80_v9.0.305-102.el10_1',
  nodeVersion: '24',
  installedNodeVersion: '24.19.0',
  packages: [
    {
      name: 'openssl',
      epoch: '1',
      version: '3.5.8-1.el10_2',
      architecture: 'x86_64',
      sourceRpm: 'openssl-3.5.8-1.el10_2.src.rpm',
      vendor: 'Red Hat, Inc.',
    },
    {
      name: 'openssl-libs',
      epoch: '1',
      version: '3.5.8-1.el10_2',
      architecture: 'x86_64',
      sourceRpm: 'openssl-3.5.8-1.el10_2.src.rpm',
      vendor: 'Red Hat, Inc.',
    },
    {
      name: 'ca-certificates',
      epoch: '0',
      version: '2025.2.80_v9.0.305-102.el10_1',
      architecture: 'noarch',
      sourceRpm: 'ca-certificates-2025.2.80_v9.0.305-102.el10_1.src.rpm',
      vendor: 'Red Hat, Inc.',
    },
  ],
  opensslPackageVersion: '3.5.8-1.el10_2',
  opensslVersion: '3.5.8',
  schemaVersion: 2,
})

function validInput() {
  return {
    lock: structuredClone(lock),
    observed: {
      packages: structuredClone(lock.packages),
      caCertificatesPackageVersion: lock.caCertificatesPackageVersion,
      nodeVersion: '24.19.0',
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

  it('rejects missing or mismatched installed RPM evidence', () => {
    for (const field of [
      'name',
      'epoch',
      'version',
      'architecture',
      'sourceRpm',
      'vendor',
    ]) {
      for (const value of [undefined, '', 'wrong-source']) {
        const input = validInput()
        input.observed.packages[0][field] = value
        assert.throws(() => verifyToolchainLock(input), /installed RPM/u)
      }
    }
    for (const packages of [
      undefined,
      [],
      [lock.packages[0]],
      [...lock.packages, lock.packages[0]],
    ]) {
      const input = validInput()
      input.observed.packages = packages
      assert.throws(() => verifyToolchainLock(input), /installed RPM/u)
    }
  })

  it('rejects exact Node version drift within the selected major', () => {
    const input = validInput()
    input.observed.nodeVersion = '24.18.0'
    assert.throws(() => verifyToolchainLock(input), /installed Node version/u)
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
    unsupported.lock.schemaVersion = 3
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

  it('rejects incomplete or contradictory independent RPM and Node locks', () => {
    for (const packages of [
      undefined,
      [],
      [...lock.packages, lock.packages[0]],
      [lock.packages[0], lock.packages[0], lock.packages[2]],
    ]) {
      const input = validInput()
      input.lock.packages = packages
      assert.throws(() => verifyToolchainLock(input), /lock RPM/u)
    }
    for (const field of [
      'epoch',
      'version',
      'architecture',
      'sourceRpm',
      'vendor',
    ]) {
      const input = validInput()
      delete input.lock.packages[0][field]
      assert.throws(() => verifyToolchainLock(input), /lock RPM/u)
    }
    for (const value of [undefined, '', '25.0.0']) {
      const input = validInput()
      input.lock.installedNodeVersion = value
      assert.throws(
        () => verifyToolchainLock(input),
        /installedNodeVersion is invalid/u,
      )
    }
    const contradictory = validInput()
    contradictory.lock.packages[0].version = '3.5.6-1.el10'
    contradictory.observed.packages[0].version = '3.5.6-1.el10'
    assert.throws(
      () => verifyToolchainLock(contradictory),
      /lock RPM openssl version differs/u,
    )
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

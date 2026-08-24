import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

import { verifyToolchainLock } from './toolchain-lock.mjs'

function requiredEnvironment(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Required build input ${name} is missing`)
  return value
}

function installedPackageVersion(name) {
  return execFileSync('dpkg-query', ['-W', '-f=$' + '{Version}', name], {
    encoding: 'utf8',
  }).trim()
}

function installedOpenSslVersion() {
  const output = execFileSync('openssl', ['version'], { encoding: 'utf8' })
  const version = /^OpenSSL\s+(\S+)/u.exec(output)?.[1]
  if (!version) throw new Error('Installed OpenSSL version is unreadable')
  return version
}

const lockPath = process.argv[2]
if (!lockPath) throw new Error('Toolchain lock path is required')
const lock = JSON.parse(readFileSync(lockPath, 'utf8'))
const observed = {
  caCertificatesPackageVersion: installedPackageVersion('ca-certificates'),
  nodeVersion: process.versions.node,
  opensslPackageVersion: installedPackageVersion('openssl'),
  opensslVersion: installedOpenSslVersion(),
}
const selection = {
  baseDigest: requiredEnvironment('HSA_TOOLCHAIN_BASE_DIGEST'),
  baseImage: requiredEnvironment('HSA_TOOLCHAIN_BASE_IMAGE'),
  baseTag: requiredEnvironment('HSA_TOOLCHAIN_BASE_TAG'),
  caCertificatesPackageVersion: requiredEnvironment(
    'HSA_TOOLCHAIN_CA_CERTIFICATES_VERSION',
  ),
  nodeVersion: requiredEnvironment('HSA_TOOLCHAIN_NODE_VERSION'),
  opensslPackageVersion: requiredEnvironment('HSA_TOOLCHAIN_OPENSSL_VERSION'),
}

verifyToolchainLock({ lock, observed, selection })
process.stdout.write(
  `${JSON.stringify({ event: 'hsa_provisioner_toolchain_verified', observed })}\n`,
)

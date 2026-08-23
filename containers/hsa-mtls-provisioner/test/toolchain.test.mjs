import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const packageDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

function dockerfileInstructions(source) {
  return source
    .replace(/\\\r?\n\s*/gu, ' ')
    .split(/\r?\n/u)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .map(line => {
      const separator = line.indexOf(' ')
      return {
        keyword: line.slice(0, separator),
        value: line.slice(separator + 1),
      }
    })
}

describe('one-shot provisioner image contract', () => {
  it('uses the independently pinned toolchain lock', async () => {
    const lock = JSON.parse(
      await readFile(path.join(packageDir, 'toolchain.lock.json'), 'utf8'),
    )
    const instructions = dockerfileInstructions(
      await readFile(path.join(packageDir, 'Dockerfile'), 'utf8'),
    )
    const argumentValues = Object.fromEntries(
      instructions
        .filter(instruction => instruction.keyword === 'ARG')
        .map(instruction => instruction.value.split(/=(.*)/su).slice(0, 2)),
    )
    const from = instructions.find(
      instruction => instruction.keyword === 'FROM',
    )
    const entrypoint = instructions.find(
      instruction => instruction.keyword === 'ENTRYPOINT',
    )
    const copySources = instructions
      .filter(instruction => instruction.keyword === 'COPY')
      .map(instruction => instruction.value.split(/\s+/u)[0])

    assert.match(lock.baseDigest, /^sha256:[a-f0-9]{64}$/)
    assert.equal(from?.value, `node:${lock.baseTag}@${lock.baseDigest}`)
    assert.deepEqual(argumentValues, {
      CA_CERTIFICATES_VERSION: lock.caCertificatesPackageVersion,
      OPENSSL_VERSION: lock.opensslPackageVersion,
    })
    assert.deepEqual(JSON.parse(entrypoint?.value), ['node', 'src/cli.mjs'])
    assert.deepEqual(copySources, [
      'containers/hsa-mtls-provisioner/package.json',
      'containers/hsa-mtls-provisioner/src',
      'containers/hsa-mtls/certificate-profile.json',
    ])
  })
})

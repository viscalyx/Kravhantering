import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const packageDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

test('the one-shot image uses the independently pinned toolchain lock', async () => {
  const lock = JSON.parse(
    await readFile(path.join(packageDir, 'toolchain.lock.json'), 'utf8'),
  )
  const dockerfile = await readFile(path.join(packageDir, 'Dockerfile'), 'utf8')

  assert.match(lock.baseDigest, /^sha256:[a-f0-9]{64}$/)
  assert.match(
    dockerfile,
    new RegExp(`FROM node:${lock.baseTag}@${lock.baseDigest}`),
  )
  assert.match(
    dockerfile,
    new RegExp(
      `ARG OPENSSL_VERSION=${lock.opensslPackageVersion.replaceAll('.', '\\.')}`,
    ),
  )
  assert.match(
    dockerfile,
    new RegExp(
      `ARG CA_CERTIFICATES_VERSION=${lock.caCertificatesPackageVersion}`,
    ),
  )
  assert.match(dockerfile, /ENTRYPOINT \["node", "src\/cli\.mjs"\]/)
  assert.doesNotMatch(dockerfile, /containers\/hsa-person-lookup-adapter/)
})

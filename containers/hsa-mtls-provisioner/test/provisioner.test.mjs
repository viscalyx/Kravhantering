import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  chmod,
  cp,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { loadCertificateProfile } from '../src/profile.mjs'
import {
  ensureGeneration,
  finalizeGeneration,
  generationNeedsRenewal,
  inspectGeneration,
  materializeSelectedGeneration,
  promoteGeneration,
  rollbackGeneration,
  rotateTrustDomain,
  stageGeneration,
  verifyGenerationDirectory,
} from '../src/provisioner.mjs'

const packageDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const profilePath = path.resolve(
  packageDir,
  '../hsa-mtls/certificate-profile.json',
)
const expectedFiles = {
  adapter: [
    'adapter-client.crt',
    'adapter-client.key',
    'adapter-server.crt',
    'adapter-server.key',
    'hsa-server-ca.crt',
    'kong-client-ca.crt',
  ],
  app: ['app-client.crt', 'app-client.key', 'kong-server-ca.crt'],
  kong: [
    'adapter-server-ca.crt',
    'app-client-ca.crt',
    'kong-client.crt',
    'kong-client.key',
    'kong-server.crt',
    'kong-server.key',
  ],
  mock: ['adapter-client-ca.crt', 'mock-server.crt', 'mock-server.key'],
  probe: [
    'adapter-server-ca.crt',
    'hsa-server-ca.crt',
    'kong-server-ca.crt',
    'wrong-adapter-client.crt',
    'wrong-adapter-client.key',
    'wrong-adapter-server.crt',
    'wrong-adapter-server.key',
    'wrong-app-client.crt',
    'wrong-app-client.key',
    'wrong-kong-client.crt',
    'wrong-kong-client.key',
    'wrong-kong-server.crt',
    'wrong-kong-server.key',
    'wrong-mock-server.crt',
    'wrong-mock-server.key',
  ],
}

let profile
let testRoot
let issuerRoot
let currentGenerationId

function digest(value) {
  return createHash('sha256').update(value).digest('hex')
}

async function bundleFiles(generationId, role) {
  return readdir(
    path.join(testRoot, 'generations', generationId, 'bundles', role),
  )
}

describe('certificate generation lifecycle', () => {
  before(async () => {
    const canonicalProfile = await loadCertificateProfile(profilePath)
    const rawProfile = structuredClone(canonicalProfile)
    for (const bundle of Object.values(rawProfile.runtimeBundles)) {
      bundle.owner = { gid: process.getgid(), uid: process.getuid() }
    }
    profile = await loadCertificateProfile(undefined, { rawProfile })
    testRoot = await mkdtemp(path.join(os.tmpdir(), 'hsa-mtls-provisioner-'))
    issuerRoot = await mkdtemp('/dev/shm/hsa-mtls-issuer-')

    const staged = await stageGeneration({
      issuerRoot,
      lifetime: 'ephemeral',
      profile,
      rootDir: testRoot,
    })
    const promoted = await promoteGeneration({
      generationId: staged.generationId,
      profile,
      rootDir: testRoot,
    })
    currentGenerationId = promoted.generationId
  })

  after(async () => {
    await rm(testRoot, { force: true, recursive: true })
    await rm(issuerRoot, { force: true, recursive: true })
  })

  it('promotes only each role allowlist with restrictive modes', async () => {
    for (const [role, expected] of Object.entries(expectedFiles)) {
      assert.deepEqual(
        (await bundleFiles(currentGenerationId, role)).sort(),
        expected,
      )
      for (const filename of expected) {
        const file = path.join(
          testRoot,
          'generations',
          currentGenerationId,
          'bundles',
          role,
          filename,
        )
        const details = await stat(file)
        assert.equal(
          details.mode & 0o777,
          filename.endsWith('.key') ? 0o400 : 0o444,
        )
        assert.equal(details.uid, process.getuid())
        assert.equal(details.gid, process.getgid())
      }
    }
    assert.deepEqual(await readdir(issuerRoot), [])
    const allNames = (
      await Promise.all(
        Object.keys(expectedFiles).map(role =>
          bundleFiles(currentGenerationId, role),
        ),
      )
    ).flat()
    assert.equal(
      allNames.some(name => name.includes('ca.key')),
      false,
    )
    assert.equal(
      allNames.some(name => name.includes('staging')),
      false,
    )
  })

  it('returns safe certificate metadata from verification and inspection', async () => {
    const verified = await verifyGenerationDirectory({
      generationDir: path.join(testRoot, 'generations', currentGenerationId),
      profile,
    })
    assert.equal(verified.generationId, currentGenerationId)

    const inspected = await inspectGeneration({ profile, rootDir: testRoot })
    assert.equal(inspected.selection.current, currentGenerationId)
    const serialized = JSON.stringify(inspected)
    assert.equal(serialized.includes('BEGIN CERTIFICATE'), false)
    assert.equal(serialized.includes('PRIVATE KEY'), false)
    assert.equal(serialized.includes('signingKey'), false)
    assert.match(serialized, /digestSha256/)
  })

  it('materializes only the selected role allowlists and removes stale runtime files', async t => {
    const runtimeRoot = await mkdtemp(
      path.join(os.tmpdir(), 'hsa-mtls-runtime-'),
    )
    t.after(() => rm(runtimeRoot, { force: true, recursive: true }))
    for (const role of Object.keys(expectedFiles)) {
      await cp(
        path.join(
          testRoot,
          'generations',
          currentGenerationId,
          'bundles',
          role,
        ),
        path.join(runtimeRoot, role),
        { recursive: true },
      )
      await writeFile(path.join(runtimeRoot, role, 'stale.key'), 'stale')
    }

    const result = await materializeSelectedGeneration({
      includeProbes: true,
      profile,
      rootDir: testRoot,
      runtimeRoot,
    })

    assert.equal(result.generationId, currentGenerationId)
    for (const [role, expected] of Object.entries(expectedFiles)) {
      const roleDirectory = await stat(path.join(runtimeRoot, role))
      assert.equal(roleDirectory.mode & 0o777, 0o700)
      assert.equal(roleDirectory.uid, profile.runtimeBundles[role].owner.uid)
      assert.equal(roleDirectory.gid, profile.runtimeBundles[role].owner.gid)
      assert.deepEqual(
        (await readdir(path.join(runtimeRoot, role))).sort(),
        expected,
      )
      for (const filename of expected) {
        const runtimeFile = await stat(path.join(runtimeRoot, role, filename))
        assert.equal(
          runtimeFile.mode & 0o777,
          filename.endsWith('.key') ? 0o400 : 0o444,
        )
        assert.equal(runtimeFile.uid, profile.runtimeBundles[role].owner.uid)
        assert.equal(runtimeFile.gid, profile.runtimeBundles[role].owner.gid)
      }
    }
  })

  it('reuses a valid generation without replacing material', async () => {
    const beforeMetadata = await readFile(
      path.join(testRoot, 'generations', currentGenerationId, 'metadata.json'),
    )
    const result = await ensureGeneration({
      issuerRoot,
      lifetime: 'ephemeral',
      profile,
      rootDir: testRoot,
    })
    const afterMetadata = await readFile(
      path.join(testRoot, 'generations', currentGenerationId, 'metadata.json'),
    )

    assert.deepEqual(result, {
      action: 'reused',
      generationId: currentGenerationId,
    })
    assert.equal(digest(afterMetadata), digest(beforeMetadata))
    assert.deepEqual(await readdir(path.join(testRoot, 'staged')), [])
  })

  it('renews persistent material at 30 days and keeps ephemeral runs fresh', () => {
    const now = new Date('2026-08-23T00:00:00.000Z')
    const metadata = {
      trustDomains: {
        domain: {
          ca: { notAfter: '2027-01-01T00:00:00.000Z' },
          client: { notAfter: '2026-09-21T23:59:59.999Z' },
          server: { notAfter: '2027-01-01T00:00:00.000Z' },
        },
      },
    }

    assert.equal(
      generationNeedsRenewal(metadata, profile, 'persistent', now),
      true,
    )
    metadata.trustDomains.domain.client.notAfter = '2026-09-23T00:00:00.000Z'
    assert.equal(
      generationNeedsRenewal(metadata, profile, 'persistent', now),
      false,
    )
    assert.equal(
      generationNeedsRenewal(metadata, profile, 'ephemeral', now),
      false,
    )
  })

  it('automatically promotes near-threshold persistent material for authenticated reconciliation', async () => {
    const previousGenerationId = currentGenerationId
    const result = await ensureGeneration({
      issuerRoot,
      lifetime: 'persistent',
      profile,
      rootDir: testRoot,
    })
    currentGenerationId = result.generationId
    const inspection = await inspectGeneration({ profile, rootDir: testRoot })

    assert.equal(result.action, 'promoted')
    assert.equal(result.previousGenerationId, previousGenerationId)
    assert.equal(inspection.selection.current, currentGenerationId)
    assert.equal(inspection.selection.previous, previousGenerationId)

    await finalizeGeneration({
      expectedGenerationId: currentGenerationId,
      profile,
      rootDir: testRoot,
    })
    assert.equal(
      (await inspectGeneration({ profile, rootDir: testRoot })).selection
        .previous,
      null,
    )
  })

  it('replaces only the selected CA and its expected and decoy leaves during rotation', async () => {
    const beforeInspect = await inspectGeneration({
      profile,
      rootDir: testRoot,
    })
    const previousId = currentGenerationId
    const rotated = await rotateTrustDomain({
      issuerRoot,
      lifetime: 'ephemeral',
      profile,
      rootDir: testRoot,
      trustDomain: 'kong-to-adapter',
    })
    currentGenerationId = rotated.generationId
    const afterInspect = await inspectGeneration({ profile, rootDir: testRoot })

    assert.equal(rotated.previousGenerationId, previousId)
    assert.equal(afterInspect.selection.current, currentGenerationId)
    assert.equal(afterInspect.selection.previous, previousId)
    for (const name of Object.keys(profile.trustDomains)) {
      const beforeDomain = beforeInspect.current.trustDomains[name]
      const afterDomain = afterInspect.current.trustDomains[name]
      if (name === 'kong-to-adapter') {
        assert.notEqual(
          afterDomain.ca.digestSha256,
          beforeDomain.ca.digestSha256,
        )
        assert.notEqual(
          afterDomain.server.digestSha256,
          beforeDomain.server.digestSha256,
        )
        assert.notEqual(
          afterDomain.client.digestSha256,
          beforeDomain.client.digestSha256,
        )
        assert.notEqual(
          afterDomain.wrongClient.digestSha256,
          beforeDomain.wrongClient.digestSha256,
        )
        assert.notEqual(
          afterDomain.wrongServer.digestSha256,
          beforeDomain.wrongServer.digestSha256,
        )
      } else {
        assert.deepEqual(afterDomain, beforeDomain)
      }
    }
  })

  it('restores the prior selection and removes the failed generation on rollback', async () => {
    const failedId = currentGenerationId
    const prior = (await inspectGeneration({ profile, rootDir: testRoot }))
      .selection.previous
    const result = await rollbackGeneration({ profile, rootDir: testRoot })
    currentGenerationId = result.generationId

    assert.equal(currentGenerationId, prior)
    await assert.rejects(stat(path.join(testRoot, 'generations', failedId)), {
      code: 'ENOENT',
    })
    assert.equal(
      (await inspectGeneration({ profile, rootDir: testRoot })).selection
        .previous,
      null,
    )
  })

  it('deletes a verified prior generation only after promotion', async () => {
    const rotated = await rotateTrustDomain({
      issuerRoot,
      lifetime: 'ephemeral',
      profile,
      rootDir: testRoot,
      trustDomain: 'app-to-kong',
    })
    currentGenerationId = rotated.generationId
    const result = await finalizeGeneration({
      expectedGenerationId: currentGenerationId,
      profile,
      rootDir: testRoot,
    })

    assert.deepEqual(result, {
      deletedGenerationId: rotated.previousGenerationId,
      generationId: currentGenerationId,
    })
    await assert.rejects(
      stat(path.join(testRoot, 'generations', rotated.previousGenerationId)),
      { code: 'ENOENT' },
    )
  })

  it('retains the prior cleanup identity until generation deletion succeeds', async () => {
    const rotated = await rotateTrustDomain({
      issuerRoot,
      lifetime: 'ephemeral',
      profile,
      rootDir: testRoot,
      trustDomain: 'app-to-kong',
    })
    currentGenerationId = rotated.generationId
    await assert.rejects(
      finalizeGeneration({ profile, rootDir: testRoot }),
      error => error.category === 'ARGUMENT_INVALID',
    )
    await assert.rejects(
      finalizeGeneration({
        expectedGenerationId: 'different-generation',
        profile,
        rootDir: testRoot,
      }),
      error => error.category === 'SELECTION_INVALID',
    )
    const generationsDir = path.join(testRoot, 'generations')
    await chmod(generationsDir, 0o500)
    try {
      await assert.rejects(
        finalizeGeneration({
          expectedGenerationId: rotated.generationId,
          profile,
          rootDir: testRoot,
        }),
        /permission denied|operation not permitted/i,
      )
      assert.equal(
        (await inspectGeneration({ profile, rootDir: testRoot })).selection
          .previous,
        rotated.previousGenerationId,
      )
    } finally {
      await chmod(generationsDir, 0o700)
    }

    const finalized = await finalizeGeneration({
      expectedGenerationId: rotated.generationId,
      profile,
      rootDir: testRoot,
    })
    assert.equal(finalized.deletedGenerationId, rotated.previousGenerationId)
    assert.equal(
      (await inspectGeneration({ profile, rootDir: testRoot })).selection
        .previous,
      null,
    )
  })

  it('fails closed for bundle drift, mismatched keys, wrong trust, and permissions', async t => {
    const source = path.join(testRoot, 'generations', currentGenerationId)
    const negativeRoot = await mkdtemp(
      path.join(os.tmpdir(), 'hsa-mtls-negative-'),
    )
    t.after(() => rm(negativeRoot, { force: true, recursive: true }))

    const cases = [
      {
        category: 'BUNDLE_CONTENT_INVALID',
        mutate: directory =>
          writeFile(
            path.join(directory, 'bundles/app/unexpected.crt'),
            'not trusted',
          ),
        name: 'an unexpected runtime artifact',
      },
      {
        category: 'CERT_KEY_MISMATCH',
        mutate: directory =>
          cp(
            path.join(directory, 'bundles/kong/kong-client.key'),
            path.join(directory, 'bundles/kong/kong-server.key'),
          ),
        name: 'a private key from another leaf',
      },
      {
        category: 'CA_IDENTITY_INVALID',
        mutate: async directory => {
          await cp(
            path.join(directory, 'bundles/adapter/hsa-server-ca.crt'),
            path.join(directory, 'bundles/adapter/kong-client-ca.crt'),
          )
          await cp(
            path.join(directory, 'bundles/adapter/hsa-server-ca.crt'),
            path.join(directory, 'bundles/kong/adapter-server-ca.crt'),
          )
          await cp(
            path.join(directory, 'bundles/adapter/hsa-server-ca.crt'),
            path.join(directory, 'bundles/probe/adapter-server-ca.crt'),
          )
        },
        name: 'a trust root from another leg',
      },
      {
        category: 'FILE_MODE_INVALID',
        mutate: directory =>
          chmod(path.join(directory, 'bundles/app/app-client.key'), 0o444),
        name: 'an overly broad private-key mode',
      },
    ]

    for (const [index, fixture] of cases.entries()) {
      await t.test(`rejects ${fixture.name}`, async () => {
        const directory = path.join(negativeRoot, String(index))
        await cp(source, directory, { recursive: true })
        await fixture.mutate(directory)
        await assert.rejects(
          verifyGenerationDirectory({ generationDir: directory, profile }),
          error => error.category === fixture.category,
        )
      })
    }
  })
})

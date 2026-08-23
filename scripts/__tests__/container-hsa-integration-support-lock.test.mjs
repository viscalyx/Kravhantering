import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  assertHsaIntegrationSupportLockSchema,
  checkHsaIntegrationSupportVendorLocks,
  createHsaIntegrationSupportLockFromCliOptions,
  formatHsaIntegrationSupportLockJson,
  main,
  parseArgs,
  readHsaIntegrationVendorLocks,
} from '../containers/generate-hsa-integration-support-lock.mjs'

const tempDirs = []

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function service(name, role, image, tag, manifestDigest, imageId) {
  return {
    image,
    imageId,
    manifestDigest,
    name,
    role,
    source: `https://example.test/${name}`,
    tag,
  }
}

function makeProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hsa-integration-lock-'))
  tempDirs.push(dir)
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    `${JSON.stringify({ version: '0.1.0' })}\n`,
  )
  writeJson(
    path.join(dir, 'containers/kong/image.lock.json'),
    service(
      'kong',
      'api-management',
      'docker.io/kong/kong-gateway',
      '3.15.0.0-20260702-ubuntu',
      'sha256:kong-manifest',
      'sha256:kong-image',
    ),
  )
  return dir
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { force: true, recursive: true })
  }
})

describe('container HSA integration support lock generation', () => {
  it('copies Kong exactly and records adapter release metadata', () => {
    const cwd = makeProject()

    const lock = createHsaIntegrationSupportLockFromCliOptions({
      cwd,
      env: {},
      cliOptions: {
        'generated-at': '2026-06-14T10:00:00.000Z',
        'hsa-person-lookup-adapter-image':
          'ghcr.io/viscalyx/kravhantering-hsa-person-lookup-adapter',
        'hsa-person-lookup-adapter-image-id': 'sha256:adapter-image',
        'hsa-person-lookup-adapter-manifest-digest': 'sha256:adapter-manifest',
        'hsa-person-lookup-adapter-tag': '1.2.3',
        'hsa-mtls-provisioner-image':
          'ghcr.io/viscalyx/kravhantering-hsa-mtls-provisioner',
        'hsa-mtls-provisioner-image-id': 'sha256:provisioner-image',
        'hsa-mtls-provisioner-manifest-digest': 'sha256:provisioner-manifest',
        'hsa-mtls-provisioner-tag': '1.2.3',
        'release-version': '1.2.3',
      },
      execFileSync: () => 'deadbeef\n',
    })

    expect(lock).toMatchObject({
      commitSha: 'deadbeef',
      generatedAt: '2026-06-14T10:00:00.000Z',
      generatedBy:
        'scripts/containers/generate-hsa-integration-support-lock.mjs',
      releaseVersion: '1.2.3',
      schemaVersion: 1,
    })
    expect(lock.services).toEqual([
      ...readHsaIntegrationVendorLocks({ cwd }),
      {
        image: 'ghcr.io/viscalyx/kravhantering-hsa-person-lookup-adapter',
        imageId: 'sha256:adapter-image',
        manifestDigest: 'sha256:adapter-manifest',
        name: 'hsa-person-lookup-adapter',
        role: 'hsa-person-lookup-adapter',
        source: 'local-build',
        tag: '1.2.3',
      },
      {
        image: 'ghcr.io/viscalyx/kravhantering-hsa-mtls-provisioner',
        imageId: 'sha256:provisioner-image',
        manifestDigest: 'sha256:provisioner-manifest',
        name: 'hsa-mtls-provisioner',
        role: 'hsa-mtls-provisioner',
        source: 'local-build',
        tag: '1.2.3',
      },
    ])
    expect(formatHsaIntegrationSupportLockJson(lock)).toMatch(/\n$/u)
  })

  it('fails check mode when Kong is edited or the adapter is missing', () => {
    const vendorLocks = [
      service(
        'kong',
        'api-management',
        'docker.io/kong/kong-gateway',
        '3.15.0.0-20260702-ubuntu',
        'sha256:kong-manifest',
        'sha256:kong-image',
      ),
    ]

    expect(() =>
      checkHsaIntegrationSupportVendorLocks(
        { schemaVersion: 2, services: [] },
        vendorLocks,
      ),
    ).toThrow('must use schemaVersion 1')
    expect(() =>
      checkHsaIntegrationSupportVendorLocks(
        { schemaVersion: 1, services: [] },
        vendorLocks,
      ),
    ).toThrow('missing "kong"')
    expect(() =>
      checkHsaIntegrationSupportVendorLocks(
        {
          schemaVersion: 1,
          services: [
            { ...vendorLocks[0], manifestDigest: 'different' },
            service(
              'hsa-person-lookup-adapter',
              'hsa-person-lookup-adapter',
              'ghcr.io/viscalyx/kravhantering-hsa-person-lookup-adapter',
              '1.2.3',
              'sha256:adapter-manifest',
              'sha256:adapter-image',
            ),
          ],
        },
        vendorLocks,
      ),
    ).toThrow('differs from image.lock.json at "manifestDigest"')
  })

  it('writes and checks the lock through the CLI wrapper', async () => {
    const cwd = makeProject()
    const messages = []

    const generateExitCode = await main(
      [
        'generate',
        '--hsa-person-lookup-adapter-manifest-digest',
        'sha256:adapter-manifest',
        '--hsa-person-lookup-adapter-image-id',
        'sha256:adapter-image',
        '--hsa-mtls-provisioner-manifest-digest',
        'sha256:provisioner-manifest',
        '--hsa-mtls-provisioner-image-id',
        'sha256:provisioner-image',
        '--generated-at',
        '2026-06-14T11:00:00.000Z',
      ],
      {
        consoleObj: {
          error: message => messages.push(`error:${message}`),
          log: message => messages.push(`log:${message}`),
        },
        cwd,
        env: {},
        execFileSync: () => 'cafef00d\n',
      },
    )
    const checkExitCode = await main(['check'], {
      consoleObj: {
        error: message => messages.push(`error:${message}`),
        log: message => messages.push(`log:${message}`),
      },
      cwd,
    })

    expect(generateExitCode).toBe(0)
    expect(checkExitCode).toBe(0)
    expect(
      JSON.parse(
        fs.readFileSync(
          path.join(cwd, 'container-hsa-integration-support.lock.json'),
          'utf8',
        ),
      ),
    ).toMatchObject({
      commitSha: 'cafef00d',
      services: [
        expect.objectContaining({ name: 'kong' }),
        expect.objectContaining({ name: 'hsa-person-lookup-adapter' }),
        expect.objectContaining({ name: 'hsa-mtls-provisioner' }),
      ],
    })
    expect(messages).toContain(
      'log:Wrote container-hsa-integration-support.lock.json',
    )
    expect(messages).toContain(
      'log:Checked container-hsa-integration-support.lock.json',
    )
  })

  it('covers bounded schema, argument, fallback, and CLI failures', async () => {
    const cwd = makeProject()
    const vendorLocks = readHsaIntegrationVendorLocks({ cwd })
    const adapter = service(
      'hsa-person-lookup-adapter',
      'hsa-person-lookup-adapter',
      'example.test/adapter',
      'local',
      'sha256:adapter-manifest',
      'sha256:adapter-image',
    )
    const provisioner = service(
      'hsa-mtls-provisioner',
      'hsa-mtls-provisioner',
      'example.test/provisioner',
      'local',
      'sha256:provisioner-manifest',
      'sha256:provisioner-image',
    )

    expect(() =>
      assertHsaIntegrationSupportLockSchema(null, 'fixture'),
    ).toThrow('fixture must use schemaVersion 1')
    expect(() => parseArgs(['generate', 'value'])).toThrow(
      'Unexpected argument',
    )
    expect(() => parseArgs(['generate', '--output'])).toThrow('Missing value')
    expect(() =>
      checkHsaIntegrationSupportVendorLocks(
        { schemaVersion: 1, services: null },
        vendorLocks,
      ),
    ).toThrow('must contain services[]')
    expect(() =>
      checkHsaIntegrationSupportVendorLocks(
        {
          schemaVersion: 1,
          services: [{ ...vendorLocks[0], unexpected: true }],
        },
        vendorLocks,
      ),
    ).toThrow('fields that do not match')
    expect(() =>
      checkHsaIntegrationSupportVendorLocks(
        { schemaVersion: 1, services: [...vendorLocks, adapter] },
        vendorLocks,
      ),
    ).toThrow('missing "hsa-mtls-provisioner"')
    expect(() =>
      checkHsaIntegrationSupportVendorLocks(
        {
          schemaVersion: 1,
          services: [...vendorLocks, { ...adapter, image: '' }, provisioner],
        },
        vendorLocks,
      ),
    ).toThrow()

    const envLock = createHsaIntegrationSupportLockFromCliOptions({
      cwd,
      env: {
        BUILD_COMMIT_SHA: 'env-commit',
        BUILD_VERSION: '2.0.0',
        HSA_MTLS_PROVISIONER_IMAGE_ID: 'sha256:provisioner-image',
        HSA_MTLS_PROVISIONER_MANIFEST_DIGEST: 'sha256:provisioner-manifest',
        HSA_PERSON_LOOKUP_ADAPTER_IMAGE_ID: 'sha256:adapter-image',
        HSA_PERSON_LOOKUP_ADAPTER_MANIFEST_DIGEST: 'sha256:adapter-manifest',
      },
    })
    expect(envLock).toMatchObject({
      commitSha: 'env-commit',
      releaseVersion: '2.0.0',
    })

    const errors = []
    const consoleObj = { error: value => errors.push(String(value)), log() {} }
    await expect(main(['unknown'], { consoleObj, cwd, env: {} })).resolves.toBe(
      1,
    )
    await expect(
      main(['check', '--lock-file', 'missing.json'], {
        consoleObj,
        cwd,
        env: {},
      }),
    ).resolves.toBe(1)
    expect(errors.length).toBe(2)
  })
})

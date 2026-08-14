import childProcess from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  buildSmokeBundleInputs,
  main,
  parseArgs,
  prepareProductionSmokeBundle,
} from '../containers/prepare-production-smoke-bundle.mjs'

const IMAGE_ID = `sha256:${'a'.repeat(64)}`
const DB_IMAGE_ID = `sha256:${'b'.repeat(64)}`

function values(overrides = {}) {
  return {
    'app-image-id': IMAGE_ID,
    'app-ref': 'localhost/kravhantering/app-runtime:pr-42',
    'commit-sha': '1234567890abcdef',
    'db-job-image-id': DB_IMAGE_ID,
    'db-job-ref': 'localhost/kravhantering/db-job:pr-42',
    'output-dir': 'tmp/production-smoke/deployment',
    'run-id': '42',
    'stack-lock': 'container-stack.lock.json',
    version: '0.1.0-pr.42',
    ...overrides,
  }
}

function stackLock() {
  const service = (name, role) => ({
    image: `registry.example/${name}`,
    imageId: `sha256:${name}-image`,
    manifestDigest: `sha256:${name}-manifest`,
    name,
    role,
    source: 'test',
    tag: '1.0.0',
  })
  return {
    commitSha: '1234567890abcdef',
    generatedAt: '2026-08-09T10:00:00.000Z',
    generatedBy: 'scripts/containers/generate-stack-lock.mjs',
    releaseVersion: '0.1.0-pr.42',
    schemaVersion: 2,
    services: [
      service('app-runtime', 'application'),
      service('db-job', 'database-job'),
      service('nginx', 'tls-proxy'),
      service('sqlserver', 'database'),
      service('keycloak', 'identity-provider'),
    ],
  }
}

describe('production smoke bundle preparation', () => {
  it('parses the explicit production archive contract', () => {
    expect(
      parseArgs(
        Object.entries(values()).flatMap(([key, value]) => [`--${key}`, value]),
      ),
    ).toEqual(values())
    expect(() => parseArgs(['version', '1.0.0'])).toThrow(
      'Invalid option near version.',
    )
  })

  it('builds release-shaped metadata from exact candidate image IDs', () => {
    const result = buildSmokeBundleInputs(values(), {
      fsImpl: {
        readFileSync: () =>
          JSON.stringify({ expectedDatabaseSchemaVersion: 'Schema123' }),
      },
    })

    expect(result.plan).toMatchObject({
      commitSha: '1234567890abcdef',
      expectedDatabaseSchemaVersion: 'Schema123',
      runId: '42',
      version: '0.1.0-pr.42',
    })
    expect(result.metadata).toEqual({
      appRuntime: {
        imageId: IMAGE_ID,
        manifestDigest: IMAGE_ID,
        manifestRef: `localhost/kravhantering/app-runtime:pr-42@${IMAGE_ID}`,
      },
      database: { expectedSchemaVersion: 'Schema123' },
      dbJob: {
        imageId: DB_IMAGE_ID,
        manifestDigest: DB_IMAGE_ID,
        manifestRef: `localhost/kravhantering/db-job:pr-42@${DB_IMAGE_ID}`,
      },
    })
  })

  it('rejects incomplete and malformed image identity inputs', () => {
    expect(() => parseArgs(['--version', '1.0.0'])).toThrow(
      'Missing --commit-sha.',
    )
    expect(() =>
      buildSmokeBundleInputs(values({ 'app-image-id': 'latest' }), {
        fsImpl: {
          readFileSync: () =>
            JSON.stringify({ expectedDatabaseSchemaVersion: 'Schema123' }),
        },
      }),
    ).toThrow('Invalid image ID: latest')
  })

  it('stages and archives the release-shaped bundle', () => {
    const execFileSync = vi.fn()
    const stageBundle = vi.fn(() => ({
      archiveName: 'kravhantering-production-deploy-0.1.0-pr.42.tar.gz',
      bundleName: 'kravhantering-production-deploy-0.1.0-pr.42',
    }))
    const fsImpl = {
      readFileSync: vi.fn(file =>
        String(file).endsWith('public/build.json')
          ? JSON.stringify({ expectedDatabaseSchemaVersion: 'Schema123' })
          : JSON.stringify({ schemaVersion: 2 }),
      ),
    }

    const result = prepareProductionSmokeBundle(values(), {
      cwd: '/repo',
      execFileSync,
      fsImpl,
      now: () => new Date('2026-08-09T10:00:00.000Z'),
      stageBundle,
    })

    expect(result.archivePath).toBe(
      '/repo/tmp/production-smoke/kravhantering-production-deploy-0.1.0-pr.42.tar.gz',
    )
    expect(stageBundle).toHaveBeenCalledWith(
      expect.objectContaining({
        generatedAt: '2026-08-09T10:00:00.000Z',
        outputDir: '/repo/tmp/production-smoke/deployment',
        stackLock: { schemaVersion: 2 },
        stackLockPath: '/repo/container-stack.lock.json',
      }),
    )
    expect(execFileSync).toHaveBeenCalledWith(
      'tar',
      [
        '-C',
        '/repo/tmp/production-smoke/deployment',
        '-czf',
        result.archivePath,
        'kravhantering-production-deploy-0.1.0-pr.42',
      ],
      { cwd: '/repo', stdio: 'inherit' },
    )
  })

  it('reports CLI success and validation failures', async () => {
    const consoleObj = { error: vi.fn(), log: vi.fn() }
    const dependencies = {
      consoleObj,
      cwd: '/repo',
      execFileSync: vi.fn(),
      fsImpl: {
        readFileSync: vi.fn(file =>
          String(file).endsWith('public/build.json')
            ? JSON.stringify({ expectedDatabaseSchemaVersion: 'Schema123' })
            : JSON.stringify({ schemaVersion: 2 }),
        ),
      },
      now: () => new Date('2026-08-09T10:00:00.000Z'),
      stageBundle: vi.fn(() => ({
        archiveName: 'bundle.tar.gz',
        bundleName: 'bundle',
      })),
    }
    const args = Object.entries(values()).flatMap(([key, value]) => [
      `--${key}`,
      value,
    ])

    await expect(main(args, dependencies)).resolves.toBe(0)
    expect(consoleObj.log).toHaveBeenCalledWith(
      '/repo/tmp/production-smoke/bundle.tar.gz',
    )

    await expect(main(['--version', '1.0.0'], dependencies)).resolves.toBe(1)
    expect(consoleObj.error).toHaveBeenCalledWith('Missing --commit-sha.')
    expect(consoleObj.error).toHaveBeenCalledWith(
      expect.stringContaining('Usage:'),
    )
  })

  it('builds the archive with the production staging and tar adapters', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'production-smoke-'))
    try {
      const buildJsonPath = path.join(root, 'build.json')
      const stackLockPath = path.join(root, 'container-stack.lock.json')
      fs.writeFileSync(
        buildJsonPath,
        JSON.stringify({ expectedDatabaseSchemaVersion: 'Schema123' }),
      )
      fs.writeFileSync(stackLockPath, JSON.stringify(stackLock()))
      const result = prepareProductionSmokeBundle(
        values({
          'output-dir': path.join(root, 'deployment'),
          'stack-lock': stackLockPath,
        }),
        { buildJsonPath },
      )

      expect(fs.statSync(result.archivePath).size).toBeGreaterThan(0)
      expect(
        fs.existsSync(path.join(root, 'deployment', result.bundleName)),
      ).toBe(true)
      const archiveEntries = childProcess
        .execFileSync('tar', ['-tzf', result.archivePath], { encoding: 'utf8' })
        .trim()
        .split('\n')
      for (const entry of [
        'DEPLOYMENT-MANIFEST.json',
        'bin/kravhantering-quadlet.sh',
        'quadlet/templates/single-node/kravhantering-app-runtime.container.template',
        'quadlet/templates/single-node/kravhantering-transient-cleanup.container.template',
        'quadlet/templates/single-node/kravhantering-transient-cleanup.timer.template',
        'release-metadata.json',
      ]) {
        expect(archiveEntries).toContain(`${result.bundleName}/${entry}`)
      }
    } finally {
      fs.rmSync(root, { force: true, recursive: true })
    }
  })
})

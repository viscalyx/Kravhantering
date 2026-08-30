import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import buildMetadataTools from '../build-metadata.js'
import {
  APP_RUNTIME_DESCRIPTION,
  APP_RUNTIME_PACKAGE,
  changedFilesFromText,
  createDeploymentBundleManifest,
  createReleaseChangelog,
  createReleaseMetadata,
  createReleasePlan,
  DB_JOB_DESCRIPTION,
  DEFAULT_OPERATOR_UPGRADE_NOTES_PATH,
  DEMO_SEED_DESCRIPTION,
  DEMO_SEED_PACKAGE,
  deploymentBundleArchiveName,
  deploymentBundleBaseName,
  ensureGitTag,
  extractOciArchiveIdentity,
  extractUnreleasedOperatorUpgradeNotes,
  githubEnvLines,
  HSA_DIRECTORY_MOCK_DESCRIPTION,
  HSA_DIRECTORY_MOCK_PACKAGE,
  isReleaseRelevantPath,
  isStableReleaseRef,
  packageVersionUrlFromVersions,
  parseArgs,
  productionDeploymentMetadata,
  readChangedFiles,
  readGeneratedReleaseNotes,
  readOciArchiveIdentity,
  readOperatorUpgradeNotes,
  readPublishedGitHubReleases,
  releaseMetadataEnv,
  releasePlanEnv,
  renderReleaseNotes,
  resolveBundledMarkdownAssets,
  resolvePackageTagUrls,
  resolvePackageVersionUrl,
  selectPreviousReleaseTag,
  stableVersionFromRef,
  stageProductionDeploymentBundle,
  withReleasePackageUrls,
} from '../release/container-release.mjs'

const gitVersion = { FullSemVer: '1.2.0-preview.4' }
const { readExpectedDatabaseSchemaVersion } = buildMetadataTools
const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
)
let cachedExpectedDatabaseSchemaVersion

function getExpectedDatabaseSchemaVersion() {
  cachedExpectedDatabaseSchemaVersion ??= readExpectedDatabaseSchemaVersion({
    cwd: REPO_ROOT,
    env: {},
  })
  return cachedExpectedDatabaseSchemaVersion
}

function createTestReleasePlan(input = {}) {
  return createReleasePlan({
    expectedDatabaseSchemaVersion: getExpectedDatabaseSchemaVersion(),
    ...input,
  })
}

function env(overrides = {}) {
  return {
    GITHUB_EVENT_NAME: 'push',
    GITHUB_REF: 'refs/heads/main',
    GITHUB_REF_NAME: 'main',
    GITHUB_REPOSITORY: 'Viscalyx/Kravhantering',
    GITHUB_REPOSITORY_OWNER: 'Viscalyx',
    GITHUB_RUN_ID: '99',
    GITHUB_SHA: '1234567890abcdef1234567890abcdef12345678',
    ...overrides,
  }
}

function minimalStackLock() {
  const service = (name, image, role) => ({
    image,
    imageId: `sha256:${name}-image`,
    manifestDigest: `sha256:${name}-manifest`,
    name,
    role,
    source: 'release-test',
    tag: '1.2.3',
  })
  return {
    commitSha: 'deadbeef',
    generatedAt: '2026-07-30T00:00:00.000Z',
    generatedBy: 'scripts/containers/generate-stack-lock.mjs',
    releaseVersion: '1.2.3',
    schemaVersion: 2,
    services: [
      service(
        'app-runtime',
        'ghcr.io/viscalyx/kravhantering-app-runtime',
        'application',
      ),
      service(
        'db-job',
        'ghcr.io/viscalyx/kravhantering-db-job',
        'database-job',
      ),
      service('nginx', 'docker.io/library/nginx', 'tls-proxy'),
      service('sqlserver', 'mcr.microsoft.com/mssql/server', 'database'),
      service('keycloak', 'quay.io/keycloak/keycloak', 'identity-provider'),
    ],
  }
}

function readWorkspaceFile(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

function expectNginxTemplateSyntax(content) {
  let depth = 0
  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    if (line.endsWith('{')) {
      depth += 1
      continue
    }
    if (line === '}') {
      depth -= 1
      expect(depth).toBeGreaterThanOrEqual(0)
      continue
    }
    expect(line).toMatch(/;$/u)
  }
  expect(depth).toBe(0)
}

function buildxMetadata(manifestDigest, imageId) {
  return {
    'containerimage.config.digest': imageId,
    'containerimage.digest': manifestDigest,
  }
}

function buildxMetadataWithDescriptorAnnotation(manifestDigest, imageId) {
  return {
    'containerimage.descriptor': {
      annotations: {
        'config.digest': imageId,
      },
    },
    'containerimage.digest': manifestDigest,
  }
}

describe('trusted container release helpers', () => {
  it('parses release CLI and changed-file inputs deterministically', () => {
    expect(parseArgs(['plan', '--output', 'plan.json'])).toEqual({
      command: 'plan',
      options: { output: 'plan.json' },
    })
    expect(() => parseArgs(['plan', 'output'])).toThrow(
      'Unexpected argument: output',
    )
    expect(() => parseArgs(['plan', '--output'])).toThrow(
      'Missing value for --output',
    )
    expect(() => parseArgs(['plan', '--output', '--other'])).toThrow(
      'Missing value for --output',
    )
    expect(changedFilesFromText(' app/page.tsx\r\n\n docs/readme.md ')).toEqual(
      ['app/page.tsx', 'docs/readme.md'],
    )
  })

  it('reads changed files for new and existing GitHub revisions', () => {
    const existingRevision = vi.fn(() => 'app/page.tsx\n')
    expect(
      readChangedFiles({
        cwd: '/workspace',
        env: {
          GITHUB_EVENT_BEFORE: 'before-sha',
          GITHUB_SHA: 'head-sha',
        },
        execFileSync: existingRevision,
      }),
    ).toEqual(['app/page.tsx'])
    expect(existingRevision).toHaveBeenCalledWith(
      'git',
      ['diff', '--name-only', 'before-sha', 'head-sha'],
      expect.objectContaining({ cwd: '/workspace' }),
    )

    const newRevision = vi.fn(() => 'containers/app/Dockerfile\n')
    expect(
      readChangedFiles({
        cwd: '/workspace',
        env: {
          GITHUB_EVENT_BEFORE: '0000000000',
          GITHUB_SHA: 'head-sha',
        },
        execFileSync: newRevision,
      }),
    ).toEqual(['containers/app/Dockerfile'])
    expect(newRevision).toHaveBeenCalledWith(
      'git',
      ['diff-tree', '--no-commit-id', '--name-only', '-r', 'head-sha'],
      expect.any(Object),
    )
    expect(
      readChangedFiles({
        env: {},
        execFileSync: vi.fn(() => {
          throw new Error('not a git checkout')
        }),
      }),
    ).toEqual([])
  })

  it('supports explicit release-plan inputs and environment serialization', () => {
    const plan = createReleasePlan({
      changedFiles: [],
      env: { GITHUB_REPOSITORY_OWNER: ' example ' },
      eventName: 'workflow_dispatch',
      expectedDatabaseSchemaVersion: 'Migration20260730120000',
      gitVersion: { SemVer: '2.0.0-preview.1' },
      ref: 'refs/heads/feature',
      refName: 'feature',
      repository: 'Example/Repository',
      runId: '100',
      sha: 'abcdef',
    })

    expect(plan).toMatchObject({
      owner: 'example',
      releaseTagName: '',
      repository: 'Example/Repository',
      runId: '100',
      version: '2.0.0-preview.1',
    })
    expect(githubEnvLines({ A: 'one', B: 2 })).toEqual(['A=one', 'B=2'])
    expect(
      createReleasePlan({
        env: {},
        expectedDatabaseSchemaVersion: 'Migration20260730120000',
        repository: 'Owner/Repository',
        repositoryOwner: '  OWNER  ',
      }).owner,
    ).toBe('owner')
    expect(() =>
      createReleasePlan({
        env: {},
        expectedDatabaseSchemaVersion: 'Migration20260730120000',
      }),
    ).toThrow('Repository owner is required')
    expect(
      createReleasePlan({
        env: { GITHUB_REPOSITORY_OWNER: 'Trusted-Owner' },
        expectedDatabaseSchemaVersion: 'Migration20260730120000',
      }).owner,
    ).toBe('trusted-owner')
    expect(
      createReleasePlan({
        env: {},
        expectedDatabaseSchemaVersion: 'Migration20260730120000',
        repository: 'Repository-Owner/Repository',
      }).owner,
    ).toBe('repository-owner')
    expect(() =>
      createReleasePlan({
        env: { GITHUB_REPOSITORY_OWNER: 'trusted-owner' },
        expectedDatabaseSchemaVersion: 'Migration20260730120000',
        repository: 'different-owner/Repository',
      }),
    ).toThrow('GITHUB_REPOSITORY_OWNER does not match GITHUB_REPOSITORY')
  })

  it('covers defensive release identity and bundle boundaries', () => {
    expect(isStableReleaseRef('', 'v1.2.3')).toBe(true)
    expect(isStableReleaseRef(undefined, undefined)).toBe(false)
    expect(stableVersionFromRef('refs/tags/v3.2.1', undefined)).toBe('3.2.1')
    expect(stableVersionFromRef('', 'preview')).toBeUndefined()
    expect(deploymentBundleBaseName(undefined)).toBe(
      'kravhantering-production-deploy-0.0.0-local',
    )
    expect(
      resolveBundledMarkdownAssets(
        { source: 'docs/readme.txt', target: 'docs/readme.txt' },
        '',
      ),
    ).toEqual([])
    expect(
      resolveBundledMarkdownAssets(
        { source: 'docs/readme.md', target: 'docs/readme.md' },
        '![Image](<image.png?raw=1>)',
      ),
    ).toEqual([
      {
        source: 'docs/image.png',
        target: 'docs/image.png',
      },
    ])
    expect(() =>
      resolveBundledMarkdownAssets(
        { source: 'docs/readme.md', target: 'docs/readme.md' },
        '![Image](../../outside.png)',
      ),
    ).toThrow('escapes the bundle root')
    expect(() => stageProductionDeploymentBundle()).toThrow(
      'plan, metadata and stackLock are required',
    )
    expect(ensureGitTag({ releaseTagName: '' })).toBe('skipped')
  })

  it('creates semantic-version primary tags for preview releases', () => {
    const plan = createTestReleasePlan({
      changedFiles: ['app/[locale]/page.tsx', 'docs/notes.md'],
      env: env(),
      gitVersion,
    })

    expect(plan).toMatchObject({
      appRuntimeImage: `ghcr.io/viscalyx/${APP_RUNTIME_PACKAGE}`,
      createGitHubRelease: true,
      demoSeedImage: `ghcr.io/viscalyx/${DEMO_SEED_PACKAGE}`,
      expectedDatabaseSchemaVersion: getExpectedDatabaseSchemaVersion(),
      hasRelevantChange: true,
      hsaDirectoryMockImage: `ghcr.io/viscalyx/${HSA_DIRECTORY_MOCK_PACKAGE}`,
      prerelease: true,
      releaseTagName: 'v1.2.0-preview.4',
      version: '1.2.0-preview.4',
    })
    expect(plan.tags).toEqual([
      '1.2.0-preview.4',
      'main-1234567890ab',
      'sha-1234567890abcdef1234567890abcdef12345678',
    ])
    expect(plan.tag).toBe('1.2.0-preview.4')
    expect(plan.appRuntimeTags[0]).toBe(
      `ghcr.io/viscalyx/${APP_RUNTIME_PACKAGE}:1.2.0-preview.4`,
    )
    expect(plan.hsaDirectoryMockTags[0]).toBe(
      `ghcr.io/viscalyx/${HSA_DIRECTORY_MOCK_PACKAGE}:1.2.0-preview.4`,
    )
    expect(plan.demoSeedTags[0]).toBe(
      `ghcr.io/viscalyx/${DEMO_SEED_PACKAGE}:1.2.0-preview.4`,
    )
    expect(plan.candidates.appRuntime).toEqual({
      artifactPath:
        'tmp/container-release-artifacts/candidates/app-runtime.oci.tar',
      localRef:
        'localhost/kravhantering-release-candidates/kravhantering-app-runtime:sha-1234567890abcdef1234567890abcdef12345678',
    })
    expect(plan.candidates.appRuntime.localRef).not.toContain('ghcr.io')
  })

  it('exports package descriptions for GHCR image metadata', () => {
    const plan = createTestReleasePlan({
      changedFiles: ['containers/app/Dockerfile'],
      env: env(),
      gitVersion,
    })

    const values = releasePlanEnv(plan)

    expect(values.APP_RUNTIME_DESCRIPTION).toBe(APP_RUNTIME_DESCRIPTION)
    expect(values.DB_JOB_DESCRIPTION).toBe(DB_JOB_DESCRIPTION)
    expect(values.BUILD_IMAGE_TAG).toBe(values.APP_RUNTIME_PRIMARY_TAG)
    expect(values.BUILD_EXPECTED_DATABASE_SCHEMA_VERSION).toBe(
      getExpectedDatabaseSchemaVersion(),
    )
    expect(values.DEMO_SEED_DESCRIPTION).toBe(DEMO_SEED_DESCRIPTION)
    expect(values.HSA_DIRECTORY_MOCK_DESCRIPTION).toBe(
      HSA_DIRECTORY_MOCK_DESCRIPTION,
    )
    expect(values.APP_RUNTIME_DESCRIPTION.length).toBeLessThanOrEqual(512)
    expect(values.DB_JOB_DESCRIPTION.length).toBeLessThanOrEqual(512)
    expect(values.DEMO_SEED_DESCRIPTION.length).toBeLessThanOrEqual(512)
    expect(values.HSA_DIRECTORY_MOCK_DESCRIPTION.length).toBeLessThanOrEqual(
      512,
    )
    expect(values.APP_RUNTIME_DESCRIPTION).not.toMatch(/\r|\n/u)
    expect(values.DB_JOB_DESCRIPTION).not.toMatch(/\r|\n/u)
    expect(values.DEMO_SEED_DESCRIPTION).not.toMatch(/\r|\n/u)
    expect(values.HSA_DIRECTORY_MOCK_DESCRIPTION).not.toMatch(/\r|\n/u)
  })

  it('strips GitVersion build metadata from preview release tags', () => {
    const plan = createTestReleasePlan({
      changedFiles: ['containers/app/Dockerfile'],
      env: env(),
      gitVersion: {
        FullSemVer: '1.2.0-preview.4+Branch.main.Sha.abcdef',
      },
    })

    expect(plan).toMatchObject({
      releaseTagName: 'v1.2.0-preview.4',
      version: '1.2.0-preview.4',
    })
    expect(plan.tags).toEqual([
      '1.2.0-preview.4',
      'main-1234567890ab',
      'sha-1234567890abcdef1234567890abcdef12345678',
    ])
    for (const tag of [
      plan.releaseTagName,
      ...plan.tags,
      ...plan.appRuntimeTags,
      ...plan.dbJobTags,
      ...plan.demoSeedTags,
      ...plan.hsaDirectoryMockTags,
    ]) {
      expect(tag).not.toContain('+')
    }
  })

  it('keeps docs-only main pushes as snapshots without preview releases', () => {
    const plan = createTestReleasePlan({
      changedFiles: ['docs/prompt.md', 'tests/unit/example.test.ts'],
      env: env(),
      gitVersion,
    })

    expect(plan).toMatchObject({
      createGitHubRelease: false,
      hasRelevantChange: false,
      releaseTagName: '',
      shouldCreatePreviewRelease: false,
    })
    expect(plan.tags).toEqual([
      'main-1234567890ab',
      'sha-1234567890abcdef1234567890abcdef12345678',
    ])
  })

  it('uses stable v-tags as exact release versions without latest image tags', () => {
    const plan = createTestReleasePlan({
      changedFiles: [],
      env: env({
        GITHUB_REF: 'refs/tags/v1.2.3',
        GITHUB_REF_NAME: 'v1.2.3',
      }),
      gitVersion,
    })

    expect(plan).toMatchObject({
      createGitHubRelease: true,
      isStableRelease: true,
      makeLatest: true,
      prerelease: false,
      releaseTagName: 'v1.2.3',
      version: '1.2.3',
    })
    expect(plan.tags).toEqual(['1.2.3'])
    expect(plan.appRuntimeTags.join('\n')).not.toContain(':latest')
  })

  it('identifies release-relevant paths conservatively', () => {
    expect(isReleaseRelevantPath('containers/app/Dockerfile')).toBe(true)
    expect(isReleaseRelevantPath('package-lock.json')).toBe(true)
    expect(isReleaseRelevantPath('proxy.ts')).toBe(true)
    expect(
      isReleaseRelevantPath(
        'docs/images/infographic-production-access-and-service-flow.png',
      ),
    ).toBe(true)
    expect(
      isReleaseRelevantPath('docs/operations/rhel10-production-deploy.md'),
    ).toBe(true)
    expect(
      isReleaseRelevantPath('docs/operations/api-docs-edge-verification.md'),
    ).toBe(true)
    expect(
      isReleaseRelevantPath(
        'docs/operations/production-quadlet-containment.md',
      ),
    ).toBe(true)
    expect(
      isReleaseRelevantPath(
        'docs/operations/rhel10-production-disconnected.md',
      ),
    ).toBe(true)
    expect(
      isReleaseRelevantPath('docs/operations/rhel10-production-upgrade.md'),
    ).toBe(true)
    expect(
      isReleaseRelevantPath('docs/operations/rhel10-production-uninstall.md'),
    ).toBe(true)
    expect(
      isReleaseRelevantPath('docs/operations/operator-upgrade-notes.md'),
    ).toBe(true)
    expect(
      isReleaseRelevantPath(
        'docs/operations/rhel10-production-single-node-self-contained-deploy.md',
      ),
    ).toBe(true)
    expect(
      isReleaseRelevantPath(
        'docs/operations/rhel10-production-single-node-self-contained-disconnected.md',
      ),
    ).toBe(true)
    expect(
      isReleaseRelevantPath(
        'docs/operations/rhel10-production-single-node-self-contained-upgrade.md',
      ),
    ).toBe(true)
    expect(
      isReleaseRelevantPath(
        'docs/operations/rhel10-production-single-node-self-contained-uninstall.md',
      ),
    ).toBe(true)
    expect(isReleaseRelevantPath('typeorm/ai-safety-seed-data.mjs')).toBe(true)
    expect(isReleaseRelevantPath('typeorm/seed-dogfood.mjs')).toBe(true)
    expect(isReleaseRelevantPath('scripts/keycloak-demo-users.mjs')).toBe(true)
    expect(
      isReleaseRelevantPath('dev/keycloak/realm-kravhantering-dev.json'),
    ).toBe(true)
    expect(isReleaseRelevantPath('docs/prompt-faser.md')).toBe(false)
    expect(isReleaseRelevantPath('tests/unit/example.test.ts')).toBe(false)
  })

  it('reads Buildx image IDs from descriptor annotations', () => {
    const plan = createTestReleasePlan({
      changedFiles: ['containers/app/Dockerfile'],
      env: env(),
      gitVersion,
    })

    const metadata = createReleaseMetadata(
      plan,
      buildxMetadataWithDescriptorAnnotation(
        'sha256:app-manifest',
        'sha256:app-image',
      ),
      buildxMetadataWithDescriptorAnnotation(
        'sha256:dbjob-manifest',
        'sha256:dbjob-image',
      ),
    )

    expect(metadata.appRuntime).toMatchObject({
      imageId: 'sha256:app-image',
      manifestDigest: 'sha256:app-manifest',
    })
    expect(metadata.dbJob).toMatchObject({
      imageId: 'sha256:dbjob-image',
      manifestDigest: 'sha256:dbjob-manifest',
    })
    expect(metadata.database).toEqual({
      expectedSchemaVersion: getExpectedDatabaseSchemaVersion(),
    })
  })

  it('records the exact OCI index and represented platform manifests', () => {
    const amd64Digest = `sha256:${'a'.repeat(64)}`
    const arm64Digest = `sha256:${'b'.repeat(64)}`
    const identity = extractOciArchiveIdentity(
      {
        manifests: [
          {
            digest: 'sha256:index',
            mediaType: 'application/vnd.oci.image.index.v1+json',
            size: 500,
          },
        ],
        schemaVersion: 2,
      },
      descriptor => {
        expect(descriptor.digest).toBe('sha256:index')
        return {
          manifests: [
            {
              digest: amd64Digest,
              mediaType: 'application/vnd.oci.image.manifest.v1+json',
              platform: { architecture: 'amd64', os: 'linux' },
              size: 250,
            },
            {
              digest: arm64Digest,
              mediaType: 'application/vnd.oci.image.manifest.v1+json',
              platform: { architecture: 'arm64', os: 'linux' },
              size: 251,
            },
          ],
        }
      },
    )

    expect(identity).toEqual({
      manifestDigest: 'sha256:index',
      mediaType: 'application/vnd.oci.image.index.v1+json',
      platformManifests: [
        {
          digest: amd64Digest,
          mediaType: 'application/vnd.oci.image.manifest.v1+json',
          platform: { architecture: 'amd64', os: 'linux' },
          size: 250,
        },
        {
          digest: arm64Digest,
          mediaType: 'application/vnd.oci.image.manifest.v1+json',
          platform: { architecture: 'arm64', os: 'linux' },
          size: 251,
        },
      ],
      size: 500,
    })
  })

  it('validates OCI layout roots and reads archives with optional leading paths', () => {
    const singleManifest = {
      digest: `sha256:${'c'.repeat(64)}`,
      mediaType: 'application/vnd.oci.image.manifest.v1+json',
      size: 100,
    }
    expect(
      extractOciArchiveIdentity(
        {
          manifests: [singleManifest],
          schemaVersion: 2,
        },
        vi.fn(),
      ).platformManifests,
    ).toEqual([singleManifest])
    for (const invalidIndex of [
      undefined,
      { manifests: [], schemaVersion: 2 },
      { manifests: {}, schemaVersion: 2 },
      { manifests: [singleManifest], schemaVersion: 1 },
    ]) {
      expect(() => extractOciArchiveIdentity(invalidIndex, vi.fn())).toThrow(
        'exactly one root descriptor',
      )
    }
    expect(() =>
      extractOciArchiveIdentity(
        {
          manifests: [
            {
              digest: 'sha256:index',
              mediaType: 'application/vnd.oci.image.index.v1+json',
            },
          ],
          schemaVersion: 2,
        },
        () => ({ manifests: [] }),
      ),
    ).toThrow('no platform manifests')
    const validPlatformDescriptor = {
      digest: `sha256:${'d'.repeat(64)}`,
      mediaType: 'application/vnd.oci.image.manifest.v1+json',
      size: 100,
    }
    for (const [field, value] of [
      ['digest', 'invalid'],
      ['mediaType', ' '],
      ['size', -1],
    ]) {
      expect(() =>
        extractOciArchiveIdentity(
          {
            manifests: [
              {
                digest: 'sha256:index',
                mediaType: 'application/vnd.oci.image.index.v1+json',
                size: 200,
              },
            ],
            schemaVersion: 2,
          },
          () => ({
            manifests: [
              validPlatformDescriptor,
              { ...validPlatformDescriptor, [field]: value },
            ],
          }),
        ),
      ).toThrow(`invalid ${field}`)
    }

    const digestValue = 'a'.repeat(64)
    const rootDigest = `sha256:${digestValue}`
    const execFileSync = vi.fn((_command, args) => {
      const member = args.at(-1)
      if (!member.startsWith('./')) throw new Error('leading path required')
      if (member === './index.json') {
        return JSON.stringify({
          manifests: [
            {
              digest: rootDigest,
              mediaType: 'application/vnd.oci.image.index.v1+json',
              size: 200,
            },
          ],
          schemaVersion: 2,
        })
      }
      if (member === `./blobs/sha256/${digestValue}`) {
        return JSON.stringify({ manifests: [singleManifest] })
      }
      throw new Error(`Unexpected member: ${member}`)
    })
    expect(
      readOciArchiveIdentity('candidate.oci.tar', { execFileSync }),
    ).toMatchObject({
      manifestDigest: rootDigest,
      platformManifests: [singleManifest],
    })
    expect(execFileSync).toHaveBeenCalledTimes(4)

    expect(() =>
      readOciArchiveIdentity('invalid.oci.tar', {
        execFileSync: vi.fn(() =>
          JSON.stringify({
            manifests: [
              {
                digest: 'invalid',
                mediaType: 'application/vnd.oci.image.index.v1+json',
              },
            ],
            schemaVersion: 2,
          }),
        ),
      }),
    ).toThrow('OCI descriptor has an invalid digest')
    const finalTarError = new Error('truncated archive')
    let archiveError
    try {
      readOciArchiveIdentity('invalid-json.oci.tar', {
        execFileSync: vi.fn((_command, args) => {
          if (args.at(-1) === 'index.json') {
            throw new Error('member path not found')
          }
          throw finalTarError
        }),
      })
    } catch (error) {
      archiveError = error
    }
    expect(archiveError).toBeInstanceOf(Error)
    expect(archiveError).toMatchObject({ cause: finalTarError })
    expect(archiveError.message).toContain(
      'Unable to read OCI candidate archive invalid-json.oci.tar member index.json: truncated archive',
    )
    expect(() =>
      readOciArchiveIdentity('missing-tar.oci.tar', {
        execFileSync: vi.fn(() => {
          throw 'tar unavailable'
        }),
      }),
    ).toThrow(
      'Unable to read OCI candidate archive missing-tar.oci.tar member index.json: tar unavailable',
    )
  })

  it('accepts supported Buildx metadata shapes and rejects incomplete metadata', () => {
    expect(
      createReleaseMetadata(
        createTestReleasePlan({
          env: env(),
          expectedDatabaseSchemaVersion: 'Migration20260730120000',
        }),
        {
          containerimage: {
            config: { digest: 'sha256:app-config' },
            digest: 'sha256:app',
          },
        },
        {
          containerimage: {
            configDigest: 'sha256:db-config',
            digest: 'sha256:db',
          },
        },
      ),
    ).toMatchObject({
      appRuntime: {
        imageId: 'sha256:app-config',
        manifestDigest: 'sha256:app',
      },
      dbJob: {
        imageId: 'sha256:db-config',
        manifestDigest: 'sha256:db',
      },
    })
    const plan = createTestReleasePlan({ env: env(), gitVersion })
    expect(() =>
      createReleaseMetadata(
        plan,
        { 'containerimage.config.digest': 'sha256:config' },
        buildxMetadata('sha256:db', 'sha256:db-config'),
      ),
    ).toThrow('missing containerimage.digest')
    expect(() =>
      createReleaseMetadata(
        plan,
        { 'containerimage.digest': 'sha256:app' },
        buildxMetadata('sha256:db', 'sha256:db-config'),
      ),
    ).toThrow('missing containerimage.config.digest')
  })

  it('exports metadata identities and removes demo-only deployment data', () => {
    const plan = createTestReleasePlan({ env: env(), gitVersion })
    const metadata = createReleaseMetadata(
      plan,
      buildxMetadata('sha256:app', 'sha256:app-config'),
      buildxMetadata('sha256:db', 'sha256:db-config'),
      buildxMetadata('sha256:mock', 'sha256:mock-config'),
      buildxMetadata('sha256:adapter', 'sha256:adapter-config'),
      buildxMetadata('sha256:demo', 'sha256:demo-config'),
    )
    expect(releaseMetadataEnv(metadata)).toMatchObject({
      APP_RUNTIME_MANIFEST_DIGEST: 'sha256:app',
      DB_JOB_MANIFEST_DIGEST: 'sha256:db',
      DEMO_SEED_MANIFEST_DIGEST: 'sha256:demo',
      HSA_DIRECTORY_MOCK_MANIFEST_DIGEST: 'sha256:mock',
      HSA_PERSON_LOOKUP_ADAPTER_MANIFEST_DIGEST: 'sha256:adapter',
    })
    expect(productionDeploymentMetadata(metadata)).not.toHaveProperty(
      'demoSeed',
    )
    expect(productionDeploymentMetadata(undefined)).toEqual({})
  })

  it('preserves provisioner-only metadata through package links and release notes', () => {
    const plan = createTestReleasePlan({ env: env(), gitVersion })
    const metadata = createReleaseMetadata(
      plan,
      buildxMetadata('sha256:app', 'sha256:app-config'),
      buildxMetadata('sha256:db', 'sha256:db-config'),
      undefined,
      undefined,
      undefined,
      {},
      buildxMetadata('sha256:provisioner', 'sha256:provisioner-config'),
    )

    expect(metadata.hsaIntegrationSupport).toEqual({
      hsaMtlsProvisioner: expect.objectContaining({
        imageId: 'sha256:provisioner-config',
        manifestDigest: 'sha256:provisioner',
      }),
    })
    expect(releaseMetadataEnv(metadata)).toMatchObject({
      HSA_MTLS_PROVISIONER_IMAGE_ID: 'sha256:provisioner-config',
      HSA_MTLS_PROVISIONER_MANIFEST_DIGEST: 'sha256:provisioner',
    })

    const linked = withReleasePackageUrls(plan, metadata, {
      execFileSync: vi.fn(() =>
        JSON.stringify([
          { id: 123, metadata: { container: { tags: plan.tags } } },
        ]),
      ),
    })
    const provisioner = linked.hsaIntegrationSupport.hsaMtlsProvisioner
    expect(provisioner.tagUrls[provisioner.tags[0]]).toContain(
      '/kravhantering-hsa-mtls-provisioner/123?',
    )

    const notes = renderReleaseNotes(plan, linked, '', {
      commits: [],
      generatedNotes: '',
      previousTagName: undefined,
    })
    expect(notes).toContain('## HSA Integration Support Container Images')
    expect(notes).toContain('### kravhantering-hsa-mtls-provisioner')
    expect(notes).not.toContain('### kravhantering-hsa-person-lookup-adapter')
  })

  it('builds a deployment manifest from lock fallbacks without optional support', () => {
    const plan = createTestReleasePlan({
      env: env({
        GITHUB_REF: 'refs/tags/v1.2.3',
        GITHUB_REF_NAME: 'v1.2.3',
      }),
      gitVersion,
    })
    const manifest = createDeploymentBundleManifest({
      files: ['z.txt', 'a.txt'],
      metadata: {
        appRuntime: {},
        database: {},
        dbJob: {},
      },
      plan,
      stackLock: minimalStackLock(),
    })

    expect(manifest.files).toEqual(['a.txt', 'z.txt'])
    expect(manifest.images).toMatchObject({
      appRuntime:
        'ghcr.io/viscalyx/kravhantering-app-runtime@sha256:app-runtime-manifest',
      dbJob: 'ghcr.io/viscalyx/kravhantering-db-job@sha256:db-job-manifest',
    })
    expect(manifest.imageIds).toMatchObject({
      appRuntime: 'sha256:app-runtime-image',
      dbJob: 'sha256:db-job-image',
    })
    expect(manifest.schemaVersion).toBe(3)
    expect(manifest.supportedTopologies).toEqual([
      'app-node-tls',
      'app-node-http',
      'single-node',
    ])
    expect(manifest.supportedTopologies).not.toContain('single-node-demo')
    expect(manifest.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/u)
  })

  it('uses matching candidate metadata and omits absent optional identity exports', () => {
    const plan = createTestReleasePlan({ env: env(), gitVersion })
    const candidate = {
      artifactPath: 'candidate.oci.tar',
      localRef: 'localhost/candidate:sha-test',
      manifestDigest: 'sha256:app',
      mediaType: 'application/vnd.oci.image.manifest.v1+json',
      platformManifests: [],
      size: 1,
    }
    const metadata = createReleaseMetadata(
      plan,
      buildxMetadata('sha256:app', 'sha256:app-config'),
      buildxMetadata('sha256:db', 'sha256:db-config'),
      undefined,
      undefined,
      undefined,
      { appRuntime: candidate },
    )

    expect(metadata.appRuntime.candidate).toEqual(candidate)
    expect(releaseMetadataEnv(metadata)).toEqual(
      expect.not.objectContaining({
        DEMO_SEED_MANIFEST_DIGEST: expect.anything(),
        HSA_DIRECTORY_MOCK_MANIFEST_DIGEST: expect.anything(),
        HSA_PERSON_LOOKUP_ADAPTER_MANIFEST_DIGEST: expect.anything(),
      }),
    )
  })

  it('rejects a candidate identity that differs from Buildx metadata', () => {
    const plan = createTestReleasePlan({
      changedFiles: ['containers/app/Dockerfile'],
      env: env(),
      gitVersion,
    })

    expect(() =>
      createReleaseMetadata(
        plan,
        buildxMetadata('sha256:buildx', 'sha256:app-image'),
        buildxMetadata('sha256:dbjob', 'sha256:dbjob-image'),
        undefined,
        undefined,
        undefined,
        {
          appRuntime: {
            manifestDigest: 'sha256:archive',
          },
        },
      ),
    ).toThrow('does not match Buildx digest')
  })

  it('resolves local Markdown images for bundled deployment docs', () => {
    const assets = resolveBundledMarkdownAssets(
      {
        source: 'docs/operations/rhel10-production-deploy.md',
        target: 'docs/operations/rhel10-production-deploy.md',
      },
      [
        '![Local](../images/diagram.png)',
        '![Remote](https://example.test/diagram.png)',
        '![Absolute](/diagram.png)',
        '![With title](../images/diagram.png "Diagram")',
      ].join('\n'),
    )

    expect(assets).toEqual([
      {
        source: 'docs/images/diagram.png',
        target: 'docs/images/diagram.png',
      },
    ])
  })

  it('rejects release documentation images sourced from public', () => {
    expect(() =>
      resolveBundledMarkdownAssets(
        {
          source: 'docs/operations/rhel10-production-deploy.md',
          target: 'docs/operations/rhel10-production-deploy.md',
        },
        '![Public](../../public/diagram.png)',
      ),
    ).toThrow('Move release documentation images under docs/')
  })

  it('treats bundled single-node upgrade docs as release-relevant', () => {
    const plan = createTestReleasePlan({
      changedFiles: [
        'docs/operations/rhel10-production-single-node-self-contained-upgrade.md',
      ],
      env: env(),
      gitVersion,
    })

    expect(plan).toMatchObject({
      createGitHubRelease: true,
      hasRelevantChange: true,
      releaseTagName: 'v1.2.0-preview.4',
      shouldCreatePreviewRelease: true,
    })
  })

  it('selects the previous stable release without using prereleases', () => {
    const plan = createTestReleasePlan({
      changedFiles: [],
      env: env({
        GITHUB_REF: 'refs/tags/v1.2.3',
        GITHUB_REF_NAME: 'v1.2.3',
      }),
      gitVersion,
    })

    expect(
      selectPreviousReleaseTag(plan, [
        { isPrerelease: false, tagName: 'v1.2.3' },
        { isPrerelease: true, tagName: 'v1.2.2-preview.5' },
        { isPrerelease: false, tagName: 'v1.2.2' },
      ]),
    ).toBe('v1.2.2')
  })

  it('selects the previous preview release without using stable releases', () => {
    const plan = createTestReleasePlan({
      changedFiles: ['containers/app/Dockerfile'],
      env: env(),
      gitVersion,
    })

    expect(
      selectPreviousReleaseTag(plan, [
        { isPrerelease: true, tagName: 'v1.2.0-preview.4' },
        { isPrerelease: false, tagName: 'v1.1.9' },
        { isPrerelease: true, tagName: 'v1.2.0-preview.3' },
      ]),
    ).toBe('v1.2.0-preview.3')
  })

  it('excludes the current release tag when rerunning notes', () => {
    const plan = createTestReleasePlan({
      changedFiles: ['containers/app/Dockerfile'],
      env: env(),
      gitVersion,
    })

    expect(
      selectPreviousReleaseTag(plan, [
        { isPrerelease: true, tagName: 'v1.2.0-preview.4' },
        { isPrerelease: true, tagName: 'v1.2.0-preview.3' },
      ]),
    ).toBe('v1.2.0-preview.3')
  })

  it('reports when no same-kind release exists without building an extra commit list', () => {
    const plan = createTestReleasePlan({
      changedFiles: [],
      env: env({
        GITHUB_REF: 'refs/tags/v1.2.3',
        GITHUB_REF_NAME: 'v1.2.3',
      }),
      gitVersion,
    })
    const execFileSync = vi.fn((command, args) => {
      if (command === 'gh' && args[0] === 'release') {
        return JSON.stringify([
          { isPrerelease: true, tagName: 'v1.2.3-preview.7' },
        ])
      }
      throw new Error(`Unexpected command: ${command}`)
    })

    const changelog = createReleaseChangelog(plan, { execFileSync })

    expect(changelog.previousTagName).toBeUndefined()
    expect(changelog.generatedNotesNotice).toContain(
      'No previous stable GitHub Release was found',
    )
    expect(changelog.commits).toEqual([])
    expect(
      execFileSync.mock.calls.some(
        ([command, args]) => command === 'gh' && args[0] === 'api',
      ),
    ).toBe(false)
    expect(execFileSync.mock.calls.some(([command]) => command === 'git')).toBe(
      false,
    )
  })

  it('keeps a notice when GitHub-generated notes fail', () => {
    const plan = createTestReleasePlan({
      changedFiles: ['containers/app/Dockerfile'],
      env: env(),
      gitVersion,
    })
    const execFileSync = vi.fn((command, args) => {
      if (command === 'gh' && args[0] === 'release') {
        return JSON.stringify([
          { isPrerelease: true, tagName: 'v1.2.0-preview.3' },
        ])
      }
      if (command === 'gh' && args[0] === 'api') {
        throw new Error('release notes API failed')
      }
      throw new Error(`Unexpected command: ${command}`)
    })

    const changelog = createReleaseChangelog(plan, { execFileSync })

    expect(changelog.previousTagName).toBe('v1.2.0-preview.3')
    expect(changelog.generatedNotesNotice).toContain(
      'GitHub-generated release notes were unavailable',
    )
    expect(changelog.commits).toEqual([])
    expect(execFileSync.mock.calls.some(([command]) => command === 'git')).toBe(
      false,
    )
  })

  it('builds repository package version URLs from matching container tags', () => {
    const plan = createTestReleasePlan({
      changedFiles: ['containers/app/Dockerfile'],
      env: env(),
      gitVersion,
    })

    expect(
      packageVersionUrlFromVersions(
        plan,
        APP_RUNTIME_PACKAGE,
        [
          {
            id: 901247371,
            metadata: {
              container: {
                tags: ['1.2.0-preview.4'],
              },
            },
          },
        ],
        '1.2.0-preview.4',
      ),
    ).toBe(
      'https://github.com/Viscalyx/Kravhantering/pkgs/container/kravhantering-app-runtime/901247371?tag=1.2.0-preview.4',
    )
  })

  it('reads package HTML URLs when package version ids are absent', () => {
    const plan = createTestReleasePlan({
      changedFiles: ['containers/app/Dockerfile'],
      env: env(),
      gitVersion,
    })

    expect(
      packageVersionUrlFromVersions(
        plan,
        APP_RUNTIME_PACKAGE,
        'not-json',
        '1.2.0-preview.4',
      ),
    ).toBeUndefined()
    expect(
      packageVersionUrlFromVersions(
        plan,
        APP_RUNTIME_PACKAGE,
        [
          {
            html_url:
              'https://github.com/Viscalyx/Kravhantering/pkgs/container/kravhantering-app-runtime/901247371',
            metadata: {
              container: {
                tags: ['1.2.0-preview.4'],
              },
            },
          },
        ],
        '1.2.0-preview.4',
      ),
    ).toBe(
      'https://github.com/Viscalyx/Kravhantering/pkgs/container/kravhantering-app-runtime/901247371',
    )
    expect(
      packageVersionUrlFromVersions(
        plan,
        APP_RUNTIME_PACKAGE,
        [
          {
            metadata: {
              container: {
                tags: ['main-1234567890ab'],
              },
            },
            package_html_url:
              'https://github.com/Viscalyx/Kravhantering/pkgs/container/kravhantering-app-runtime/901247372',
          },
        ],
        'main-1234567890ab',
      ),
    ).toBe(
      'https://github.com/Viscalyx/Kravhantering/pkgs/container/kravhantering-app-runtime/901247372',
    )
  })

  it('falls back to repository package pages when package API endpoints fail', () => {
    const plan = createTestReleasePlan({
      changedFiles: ['containers/app/Dockerfile'],
      env: env(),
      gitVersion,
    })
    const execFileSync = vi.fn(() => {
      throw new Error('package API unavailable')
    })

    const tagUrls = resolvePackageTagUrls(
      plan,
      APP_RUNTIME_PACKAGE,
      plan.tags,
      {
        execFileSync,
      },
    )

    expect(tagUrls).toEqual({
      '1.2.0-preview.4':
        'https://github.com/Viscalyx/Kravhantering/pkgs/container/kravhantering-app-runtime',
      'main-1234567890ab':
        'https://github.com/Viscalyx/Kravhantering/pkgs/container/kravhantering-app-runtime',
      'sha-1234567890abcdef1234567890abcdef12345678':
        'https://github.com/Viscalyx/Kravhantering/pkgs/container/kravhantering-app-runtime',
    })
    expect(
      execFileSync.mock.calls.map(([command, args]) => [
        command,
        args[0],
        args[1],
      ]),
    ).toEqual([
      [
        'gh',
        'api',
        '/orgs/viscalyx/packages/container/kravhantering-app-runtime/versions?per_page=100',
      ],
      [
        'gh',
        'api',
        '/users/viscalyx/packages/container/kravhantering-app-runtime/versions?per_page=100',
      ],
    ])
  })

  it('handles package and release lookups without publishable inputs', () => {
    expect(resolvePackageTagUrls({}, 'package', ['tag'])).toEqual({})
    expect(resolvePackageVersionUrl({}, 'package', 'tag')).toBeUndefined()
    expect(readPublishedGitHubReleases({})).toEqual([])
    expect(
      readPublishedGitHubReleases(
        { repository: 'Owner/Repository' },
        { execFileSync: vi.fn(() => '{}') },
      ),
    ).toEqual([])
    expect(readGeneratedReleaseNotes({}, 'v1.0.0')).toBeUndefined()
    expect(
      readGeneratedReleaseNotes({ releaseTagName: 'v2.0.0' }, undefined),
    ).toBeUndefined()
    expect(selectPreviousReleaseTag({}, [])).toBeUndefined()
    expect(createReleaseChangelog({})).toEqual({
      commits: [],
      generatedNotes: undefined,
      generatedNotesNotice: undefined,
      previousTagName: undefined,
    })

    const metadata = {
      appRuntime: { tags: ['ghcr.io/example/app:tag'] },
      dbJob: { tags: ['ghcr.io/example/db:tag'] },
    }
    expect(
      withReleasePackageUrls(
        {
          owner: '',
          repository: '',
        },
        metadata,
      ),
    ).toMatchObject({
      appRuntime: { tagUrls: { 'ghcr.io/example/app:tag': undefined } },
      dbJob: { tagUrls: { 'ghcr.io/example/db:tag': undefined } },
    })
  })

  it('adds package version URLs to release metadata when the package API is available', () => {
    const plan = createTestReleasePlan({
      changedFiles: ['containers/app/Dockerfile'],
      env: env(),
      gitVersion,
    })
    const metadata = createReleaseMetadata(
      plan,
      buildxMetadata('sha256:app-manifest', 'sha256:app-image'),
      buildxMetadata('sha256:dbjob-manifest', 'sha256:dbjob-image'),
      buildxMetadata('sha256:hsa-manifest', 'sha256:hsa-image'),
      undefined,
      buildxMetadata('sha256:demo-seed-manifest', 'sha256:demo-seed-image'),
    )
    const execFileSync = vi.fn((command, args) => {
      expect(command).toBe('gh')
      expect(args[0]).toBe('api')
      if (args[1].includes('kravhantering-app-runtime')) {
        return JSON.stringify([
          {
            id: 111,
            metadata: {
              container: { tags: plan.tags },
            },
          },
        ])
      }
      if (args[1].includes('kravhantering-db-job')) {
        return JSON.stringify([
          {
            id: 222,
            metadata: {
              container: { tags: plan.tags },
            },
          },
        ])
      }
      if (args[1].includes('kravhantering-demo-seed')) {
        return JSON.stringify([
          {
            id: 444,
            metadata: {
              container: { tags: plan.tags },
            },
          },
        ])
      }
      throw new Error(`Unexpected endpoint: ${args[1]}`)
    })

    const linkedMetadata = withReleasePackageUrls(plan, metadata, {
      execFileSync,
    })

    expect(linkedMetadata.appRuntime.tagUrls[metadata.appRuntime.tags[0]]).toBe(
      'https://github.com/Viscalyx/Kravhantering/pkgs/container/kravhantering-app-runtime/111?tag=1.2.0-preview.4',
    )
    expect(linkedMetadata.appRuntime.tagUrls[metadata.appRuntime.tags[1]]).toBe(
      'https://github.com/Viscalyx/Kravhantering/pkgs/container/kravhantering-app-runtime/111?tag=main-1234567890ab',
    )
    expect(linkedMetadata.appRuntime.tagUrls[metadata.appRuntime.tags[2]]).toBe(
      'https://github.com/Viscalyx/Kravhantering/pkgs/container/kravhantering-app-runtime/111?tag=sha-1234567890abcdef1234567890abcdef12345678',
    )
    expect(linkedMetadata.dbJob.tagUrls[metadata.dbJob.tags[0]]).toBe(
      'https://github.com/Viscalyx/Kravhantering/pkgs/container/kravhantering-db-job/222?tag=1.2.0-preview.4',
    )
    expect(linkedMetadata.dbJob.tagUrls[metadata.dbJob.tags[1]]).toBe(
      'https://github.com/Viscalyx/Kravhantering/pkgs/container/kravhantering-db-job/222?tag=main-1234567890ab',
    )
    expect(linkedMetadata.dbJob.tagUrls[metadata.dbJob.tags[2]]).toBe(
      'https://github.com/Viscalyx/Kravhantering/pkgs/container/kravhantering-db-job/222?tag=sha-1234567890abcdef1234567890abcdef12345678',
    )
    expect(linkedMetadata.demoSeed.tagUrls[metadata.demoSeed.tags[0]]).toBe(
      'https://github.com/Viscalyx/Kravhantering/pkgs/container/kravhantering-demo-seed/444?tag=1.2.0-preview.4',
    )
  })

  it('renders release notes with generated changes, GHCR refs and bundle links', () => {
    const plan = createTestReleasePlan({
      changedFiles: ['containers/app/Dockerfile'],
      env: env(),
      gitVersion,
    })
    const metadata = createReleaseMetadata(
      plan,
      buildxMetadata('sha256:app-manifest', 'sha256:app-image'),
      buildxMetadata('sha256:dbjob-manifest', 'sha256:dbjob-image'),
      buildxMetadata(
        'sha256:hsa-directory-mock-manifest',
        'sha256:hsa-directory-mock-image',
      ),
      undefined,
      buildxMetadata('sha256:demo-seed-manifest', 'sha256:demo-seed-image'),
    )

    const linkedMetadata = {
      ...metadata,
      appRuntime: {
        ...metadata.appRuntime,
        tagUrls: {
          [metadata.appRuntime.tags[0]]:
            'https://github.com/Viscalyx/Kravhantering/pkgs/container/kravhantering-app-runtime/111?tag=1.2.0-preview.4',
          [metadata.appRuntime.tags[1]]:
            'https://github.com/Viscalyx/Kravhantering/pkgs/container/kravhantering-app-runtime/111?tag=main-1234567890ab',
          [metadata.appRuntime.tags[2]]:
            'https://github.com/Viscalyx/Kravhantering/pkgs/container/kravhantering-app-runtime/111?tag=sha-1234567890abcdef1234567890abcdef12345678',
        },
      },
      dbJob: {
        ...metadata.dbJob,
        tagUrls: {
          [metadata.dbJob.tags[0]]:
            'https://github.com/Viscalyx/Kravhantering/pkgs/container/kravhantering-db-job/222?tag=1.2.0-preview.4',
          [metadata.dbJob.tags[1]]:
            'https://github.com/Viscalyx/Kravhantering/pkgs/container/kravhantering-db-job/222?tag=main-1234567890ab',
          [metadata.dbJob.tags[2]]:
            'https://github.com/Viscalyx/Kravhantering/pkgs/container/kravhantering-db-job/222?tag=sha-1234567890abcdef1234567890abcdef12345678',
        },
      },
      demoSeed: {
        ...metadata.demoSeed,
        tagUrls: {
          [metadata.demoSeed.tags[0]]:
            'https://github.com/Viscalyx/Kravhantering/pkgs/container/kravhantering-demo-seed/444?tag=1.2.0-preview.4',
          [metadata.demoSeed.tags[1]]:
            'https://github.com/Viscalyx/Kravhantering/pkgs/container/kravhantering-demo-seed/444?tag=main-1234567890ab',
          [metadata.demoSeed.tags[2]]:
            'https://github.com/Viscalyx/Kravhantering/pkgs/container/kravhantering-demo-seed/444?tag=sha-1234567890abcdef1234567890abcdef12345678',
        },
      },
      testSupport: {
        hsaDirectoryMock: {
          ...metadata.testSupport.hsaDirectoryMock,
          tagUrls: {
            [metadata.testSupport.hsaDirectoryMock.tags[0]]:
              'https://github.com/Viscalyx/Kravhantering/pkgs/container/kravhantering-hsa-directory-mock/333?tag=1.2.0-preview.4',
            [metadata.testSupport.hsaDirectoryMock.tags[1]]:
              'https://github.com/Viscalyx/Kravhantering/pkgs/container/kravhantering-hsa-directory-mock/333?tag=main-1234567890ab',
            [metadata.testSupport.hsaDirectoryMock.tags[2]]:
              'https://github.com/Viscalyx/Kravhantering/pkgs/container/kravhantering-hsa-directory-mock/333?tag=sha-1234567890abcdef1234567890abcdef12345678',
          },
        },
      },
    }

    const notes = renderReleaseNotes(
      plan,
      linkedMetadata,
      'abc123  container-stack.lock.json\n',
      {
        commits: [],
        generatedNotes: "## What's Changed\n\n- feat: release notes (#228)",
        previousTagName: 'v1.2.0-preview.3',
      },
    )

    expect(notes).toMatch(/^## What's Changed/u)
    expect(notes).not.toContain('# Preview release 1.2.0-preview.4')
    expect(notes).not.toContain('Commit:')
    expect(notes).not.toContain('Workflow run:')
    expect(notes).toContain("## What's Changed")
    expect(notes).toContain('- feat: release notes (#228)')
    expect(notes).not.toContain('## Exact Commit Range')
    expect(notes).not.toContain('## Public GHCR Images')
    expect(notes).not.toContain('## Tags')
    expect(notes).toContain('## Container Images')
    expect(notes).toContain('### kravhantering-app-runtime')
    expect(notes).toContain(
      'Runnable Next.js application image for the production web runtime.',
    )
    expect(notes).toContain(
      '- [`ghcr.io/viscalyx/kravhantering-app-runtime:1.2.0-preview.4`](https://github.com/Viscalyx/Kravhantering/pkgs/container/kravhantering-app-runtime/111?tag=1.2.0-preview.4)',
    )
    expect(notes).toContain(
      '- [`ghcr.io/viscalyx/kravhantering-app-runtime:main-1234567890ab`](https://github.com/Viscalyx/Kravhantering/pkgs/container/kravhantering-app-runtime/111?tag=main-1234567890ab)',
    )
    expect(notes).toContain(
      '- [`ghcr.io/viscalyx/kravhantering-app-runtime:sha-1234567890abcdef1234567890abcdef12345678`](https://github.com/Viscalyx/Kravhantering/pkgs/container/kravhantering-app-runtime/111?tag=sha-1234567890abcdef1234567890abcdef12345678)',
    )
    expect(notes).toContain('### kravhantering-db-job')
    expect(notes).toContain(
      'Database job image for SQL Server health checks, migrations and required seed operations.',
    )
    expect(notes).toContain(
      '- [`ghcr.io/viscalyx/kravhantering-db-job:1.2.0-preview.4`](https://github.com/Viscalyx/Kravhantering/pkgs/container/kravhantering-db-job/222?tag=1.2.0-preview.4)',
    )
    expect(notes).toContain(
      '- [`ghcr.io/viscalyx/kravhantering-db-job:main-1234567890ab`](https://github.com/Viscalyx/Kravhantering/pkgs/container/kravhantering-db-job/222?tag=main-1234567890ab)',
    )
    expect(notes).toContain(
      '- [`ghcr.io/viscalyx/kravhantering-db-job:sha-1234567890abcdef1234567890abcdef12345678`](https://github.com/Viscalyx/Kravhantering/pkgs/container/kravhantering-db-job/222?tag=sha-1234567890abcdef1234567890abcdef12345678)',
    )
    expect(notes).toContain('## Demonstration Container Images')
    expect(notes).toContain(
      'These images are explicit opt-in support for disposable demonstration or test environments and are not part of the production runtime topology.',
    )
    expect(notes).toContain('### kravhantering-demo-seed')
    expect(notes).toContain(
      'Optional destructive demo seed image for disposable demonstration and test environments.',
    )
    expect(notes).toContain(
      '- [`ghcr.io/viscalyx/kravhantering-demo-seed:1.2.0-preview.4`](https://github.com/Viscalyx/Kravhantering/pkgs/container/kravhantering-demo-seed/444?tag=1.2.0-preview.4)',
    )
    expect(notes).toContain('## Test Support Container Images')
    expect(notes).toContain('### kravhantering-hsa-directory-mock')
    expect(notes).toContain(
      'Test-only HSA directory mock image for the single-node-demo release support topology.',
    )
    expect(notes).toContain(
      '- [`ghcr.io/viscalyx/kravhantering-hsa-directory-mock:1.2.0-preview.4`](https://github.com/Viscalyx/Kravhantering/pkgs/container/kravhantering-hsa-directory-mock/333?tag=1.2.0-preview.4)',
    )
    expect(notes.match(/Immutable manifest digest reference:/gu)).toHaveLength(
      4,
    )
    expect(notes).not.toContain('Manifest digest verification reference:')
    expect(notes).toContain(
      'ghcr.io/viscalyx/kravhantering-app-runtime@sha256:app-manifest',
    )
    expect(notes).toContain(
      'ghcr.io/viscalyx/kravhantering-db-job@sha256:dbjob-manifest',
    )
    expect(notes).toContain(
      'ghcr.io/viscalyx/kravhantering-hsa-directory-mock@sha256:hsa-directory-mock-manifest',
    )
    expect(notes).toContain(
      'ghcr.io/viscalyx/kravhantering-demo-seed@sha256:demo-seed-manifest',
    )
    expect(notes.indexOf('### kravhantering-app-runtime')).toBeLessThan(
      notes.indexOf('### kravhantering-db-job'),
    )
    expect(notes.indexOf('### kravhantering-db-job')).toBeLessThan(
      notes.indexOf('## Demonstration Container Images'),
    )
    expect(notes.indexOf('## Demonstration Container Images')).toBeLessThan(
      notes.indexOf('## Test Support Container Images'),
    )
    expect(notes.indexOf('## Test Support Container Images')).toBeLessThan(
      notes.indexOf('## Production Deployment Bundle'),
    )
    expect(notes).toContain(
      'The rootless Podman Quadlet deployment archive passes production smoke validation before promotion.',
    )
    expect(notes).not.toContain('## Checksums')
    expect(notes).not.toContain('abc123  container-stack.lock.json')
    expect(notes).not.toContain('## Verification')
    expect(notes).not.toContain(
      'Cosign keyless signatures and GitHub Artifact Attestations were verified before Compose startup.',
    )
    expect(notes).not.toContain(
      'Release smoke artifacts are attached to this workflow run.',
    )
    expect(notes).toContain(
      '- [`kravhantering-production-deploy-1.2.0-preview.4.tar.gz`](https://github.com/Viscalyx/Kravhantering/releases/download/v1.2.0-preview.4/kravhantering-production-deploy-1.2.0-preview.4.tar.gz)',
    )
    expect(notes).toContain(
      '- [`kravhantering-production-deploy-1.2.0-preview.4.tar.gz.sha256`](https://github.com/Viscalyx/Kravhantering/releases/download/v1.2.0-preview.4/kravhantering-production-deploy-1.2.0-preview.4.tar.gz.sha256)',
    )
    expect(notes).not.toContain('## Operational Notes')
    expect(notes).not.toContain(
      'Single-node TLS CA guidance installs `ca.crt` as readable public trust material',
    )
    expect(notes).not.toContain(
      'Production nginx templates use dynamic Podman DNS resolution',
    )
    expect(notes).not.toContain('GHCR package visibility')
  })

  it('renders operator upgrade notes before container image evidence', () => {
    const plan = createTestReleasePlan({
      changedFiles: ['docs/operations/operator-upgrade-notes.md'],
      env: env(),
      gitVersion,
    })
    const metadata = createReleaseMetadata(
      plan,
      buildxMetadata('sha256:app-manifest', 'sha256:app-image'),
      buildxMetadata('sha256:dbjob-manifest', 'sha256:dbjob-image'),
    )
    const operatorNotes = extractUnreleasedOperatorUpgradeNotes(
      [
        '# Operator Upgrade Notes',
        '',
        '## Unreleased',
        '',
        '### Requirement area owners must have valid HSA-id values before upgrade',
        '',
        'Confirm owner HSA-id values before running `db-job migrate`.',
        '',
        '## 0.1.0 - 2026-01-01',
        '',
        'Earlier note.',
        '',
      ].join('\n'),
      DEFAULT_OPERATOR_UPGRADE_NOTES_PATH,
    )

    const notes = renderReleaseNotes(plan, metadata, '', {}, operatorNotes)

    expect(notes).toContain('## Operator Upgrade Notes')
    expect(notes).toContain(
      '### Requirement area owners must have valid HSA-id values before upgrade',
    )
    expect(notes).toContain(
      'Confirm owner HSA-id values before running `db-job migrate`.',
    )
    expect(notes).not.toContain('Earlier note.')
    expect(notes.indexOf('## Operator Upgrade Notes')).toBeLessThan(
      notes.indexOf('## Container Images'),
    )
  })

  it('omits empty operator upgrade notes and reports invalid note sources', () => {
    expect(
      extractUnreleasedOperatorUpgradeNotes(
        [
          '# Operator Upgrade Notes',
          '',
          '## Unreleased',
          '',
          '## 0.1.0 - 2026-01-01',
          '',
        ].join('\n'),
        DEFAULT_OPERATOR_UPGRADE_NOTES_PATH,
      ),
    ).toBeUndefined()
    expect(() =>
      extractUnreleasedOperatorUpgradeNotes(
        '# Operator Upgrade Notes\n',
        DEFAULT_OPERATOR_UPGRADE_NOTES_PATH,
      ),
    ).toThrow('must contain "## Unreleased"')
    expect(() =>
      readOperatorUpgradeNotes(DEFAULT_OPERATOR_UPGRADE_NOTES_PATH, {
        existsSync: () => false,
        readFileSync: vi.fn(),
      }),
    ).toThrow('Operator upgrade notes file is missing')
  })

  it('reports operator note read failures and accepts a final unreleased section', () => {
    expect(
      extractUnreleasedOperatorUpgradeNotes(
        '# Notes\n\n## Unreleased\n\nCurrent note.\n',
        'notes.md',
      ),
    ).toBe('Current note.')
    expect(() =>
      extractUnreleasedOperatorUpgradeNotes(undefined, 'notes.md'),
    ).toThrow('must contain "## Unreleased"')
    expect(() =>
      readOperatorUpgradeNotes('missing.md', {
        readFileSync: () => {
          const error = new Error('missing')
          error.code = 'ENOENT'
          throw error
        },
      }),
    ).toThrow('Operator upgrade notes file is missing')
    const denied = new Error('denied')
    denied.code = 'EACCES'
    expect(() =>
      readOperatorUpgradeNotes('denied.md', {
        readFileSync: () => {
          throw denied
        },
      }),
    ).toThrow(denied)
  })

  it('keeps production TLS CA guidance readable for app-runtime', () => {
    const singleNodeGuide = readWorkspaceFile(
      'docs/operations/rhel10-production-single-node-self-contained-deploy.md',
    )

    expect(singleNodeGuide).toMatch(
      /sudo install -o root -g kravhantering -m 0644 ca\.crt \\\n\s+\/etc\/kravhantering\/tls\/ca\.crt/u,
    )
    expect(singleNodeGuide).toMatch(
      /sudo install -o root -g kravhantering -m 0644 \\\n\s+"\$\{TLS_DIR\}\/local-root-ca\.crt" "\$\{TLS_DIR\}\/ca\.crt"/u,
    )
    expect(singleNodeGuide).toContain(
      'sudo chmod 0644 /etc/kravhantering/tls/ca.crt',
    )
    expect(singleNodeGuide).not.toMatch(/-m 0640 ca\.crt/u)
  })

  it('labels every release-owned nginx bind mount for SELinux', () => {
    const guides = [
      'docs/operations/rhel10-production-deploy.md',
      'docs/operations/rhel10-production-disconnected.md',
      'docs/operations/rhel10-production-upgrade.md',
      'docs/operations/rhel10-production-single-node-self-contained-deploy.md',
      'docs/operations/rhel10-production-single-node-self-contained-disconnected.md',
      'docs/operations/rhel10-production-single-node-self-contained-upgrade.md',
    ]

    for (const guide of guides) {
      const content = readWorkspaceFile(guide)
      const labelingCommands = content.match(
        /sudo chcon -R -t container_file_t \\\n(?:\s+"\/opt\/kravhantering\/releases\/\$\{VERSION\}\/[^\n]+"(?: \\\n)?)+/gu,
      )
      const nginxLabelingCommands = (labelingCommands ?? []).filter(command =>
        command.includes('/nginx'),
      )

      expect(labelingCommands).not.toBeNull()
      expect(nginxLabelingCommands.length).toBeGreaterThan(0)
      for (const command of nginxLabelingCommands) {
        expect(command).toContain(
          ['"/opt/kravhantering/releases/', '$', '{VERSION}/api-docs"'].join(
            '',
          ),
        )
      }
    }
  })

  it('requires the purpose-specific Quadlet network for temporary containers', () => {
    const singleNodeGuide = readWorkspaceFile(
      'docs/operations/rhel10-production-single-node-self-contained-deploy.md',
    )

    expect(singleNodeGuide).toContain(
      'NETWORK_UNIT=kravhantering-single-node-identity-network.service',
    )
    expect(singleNodeGuide).toContain('--purpose identity')
    expect(singleNodeGuide).toContain('--purpose database')
    expect(singleNodeGuide).toContain('--purpose edge')
    expect(singleNodeGuide).toContain('systemctl --user start "$NETWORK_UNIT"')
    expect(singleNodeGuide).not.toContain(
      'podman network create "$STACK_NETWORK"',
    )
  })

  it('ships idempotent least-privilege SQL runtime-role provisioning without broad app roles', () => {
    const template = readWorkspaceFile(
      'containers/production/sqlserver/dba-provision.sql.template',
    )
    const dockerfile = readWorkspaceFile('containers/app/Dockerfile')

    expect(template).toContain("AND [type] <> N'R'")
    expect(template).toContain(
      'CREATE ROLE [kravhantering_runtime] AUTHORIZATION [dbo]',
    )
    expect(template).toContain('WITH DEFAULT_SCHEMA = [dbo]')
    expect(template).toContain(
      'ALTER USER [<db-job-login>] WITH DEFAULT_SCHEMA = [dbo]',
    )
    expect(template).toContain(
      'ALTER USER [<app-login>] WITH DEFAULT_SCHEMA = [dbo]',
    )
    expect(template).not.toContain('GRANT SELECT ON OBJECT::')
    expect(template).not.toContain('ON SCHEMA::[dbo]')
    expect(template).not.toContain('ALTER ROLE [db_datareader]')
    expect(template).not.toContain('ALTER ROLE [db_datawriter]')
    expect(template).toContain('ALTER ROLE [kravhantering_runtime]')
    expect(dockerfile).toContain(
      'typeorm/runtime-permission-manifest.mjs ./typeorm/runtime-permission-manifest.mjs',
    )
    expect(dockerfile).toContain(
      '/workspace/.build/transient-cleanup ./transient-cleanup',
    )
  })

  it('ships verified SQL Server identity configuration for single-node clients', () => {
    const appEnv = readWorkspaceFile(
      'containers/production/env/app.env.template',
    )
    const dbJobEnv = readWorkspaceFile(
      'containers/production/env/db-job.env.template',
    )
    const sqlServerConfig = readWorkspaceFile(
      'containers/production/sqlserver/mssql.conf',
    )

    expect(appEnv).toContain('DB_TRUST_SERVER_CERTIFICATE=false')
    expect(dbJobEnv).toMatch(/^DB_HOST=sqlserver$/mu)
    expect(dbJobEnv).toContain('DB_TRUST_SERVER_CERTIFICATE=false')
    expect(dbJobEnv).toContain(
      'NODE_EXTRA_CA_CERTS=/run/kravhantering/sqlserver-ca.crt',
    )
    expect(sqlServerConfig).toContain(
      'tlscert = /etc/kravhantering/sqlserver-tls/server.crt',
    )
    expect(sqlServerConfig).toContain(
      'tlskey = /etc/kravhantering/sqlserver-tls/server.key',
    )
    expect(sqlServerConfig).toContain('forceencryption = 1')
  })

  it('ships nginx templates with dynamic upstream DNS resolution', () => {
    const nginxResolverPlaceholder = '$' + '{NGINX_RESOLVER}'
    const nginxIdentityResolverPlaceholder = '$' + '{NGINX_IDENTITY_RESOLVER}'
    const templates = [
      'containers/production/nginx/templates/app-node-http.conf.template',
      'containers/production/nginx/templates/app-node-tls.conf.template',
      'containers/production/nginx/templates/single-node-tls.conf.template',
    ]

    for (const template of templates) {
      const content = readWorkspaceFile(template)
      expectNginxTemplateSyntax(
        content
          .replaceAll(nginxResolverPlaceholder, '10.89.0.1')
          .replaceAll(nginxIdentityResolverPlaceholder, '10.89.1.1'),
      )
      expect(content).toContain(
        `resolver ${nginxResolverPlaceholder} valid=10s ipv6=off;`,
      )
      if (template.includes('single-node')) {
        expect(content).toContain(
          `resolver ${nginxIdentityResolverPlaceholder} valid=10s ipv6=off;`,
        )
      }
      expect(content).toContain('resolver_timeout 5s;')
      expect(content).toContain('server app-runtime:3000 resolve;')
      expect(content).toContain('proxy_pass http://app_runtime_upstream')
      expect(content).not.toContain('proxy_pass http://app-runtime:3000')
    }

    const singleNode = readWorkspaceFile(
      'containers/production/nginx/templates/single-node-tls.conf.template',
    )
    expect(singleNode).toContain('server keycloak:8080 resolve;')
    expect(singleNode).toContain('proxy_pass http://keycloak_upstream/;')
    expect(singleNode).toContain('return 308 /auth/;')
    expect(singleNode).toContain('location = /auth/error')

    const releaseEnv = readWorkspaceFile(
      'containers/production/env/release.env.template',
    )
    expect(releaseEnv).toContain('NGINX_RESOLVER=10.89.0.1')
    expect(releaseEnv).toContain(
      [
        'APP_RUNTIME_IMAGE_REF=registry.example.internal',
        '/kravhantering-app-runtime:replace-with-release-tag',
      ].join(''),
    )
    expect(releaseEnv).toContain(
      'ghcr.io/viscalyx/kravhantering-app-runtime:replace-with-release-tag',
    )
    expect(releaseEnv).toContain(
      'NGINX_IMAGE_REF=docker.io/library/nginx:1.31.3-alpine',
    )
    expect(releaseEnv).toContain(
      'SQLSERVER_IMAGE_REF=mcr.microsoft.com/mssql/server:2025-CU7-ubuntu-24.04',
    )
    expect(releaseEnv).toContain(
      'KEYCLOAK_IMAGE_REF=quay.io/keycloak/keycloak:26.7.1-0',
    )
    expect(releaseEnv).toContain(
      'KONG_IMAGE_REF=docker.io/kong/kong-gateway:3.15.0.5-20260824-ubuntu',
    )
    expect(releaseEnv).toContain(
      'HSA_DIRECTORY_MOCK_IMAGE_REF=ghcr.io/viscalyx/kravhantering-hsa-directory-mock:replace-with-release-tag',
    )
    expect(releaseEnv).not.toContain('SQLSERVER_HOST_PORT')
    expect(releaseEnv).not.toContain('replace-with-release-manifest-digest')
    expect(releaseEnv).not.toContain('replace-with-release-digest')
  })

  it('stages the production deployment bundle with manifest and templates', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kh-release-bundle-'))
    try {
      const plan = createTestReleasePlan({
        changedFiles: ['containers/app/Dockerfile'],
        env: env({
          GITHUB_REF: 'refs/tags/v1.2.3',
          GITHUB_REF_NAME: 'v1.2.3',
        }),
        gitVersion,
      })
      const metadata = createReleaseMetadata(
        plan,
        buildxMetadata('sha256:app-manifest', 'sha256:app-image'),
        buildxMetadata('sha256:dbjob-manifest', 'sha256:dbjob-image'),
        buildxMetadata('sha256:hsa-manifest', 'sha256:hsa-image'),
        undefined,
        buildxMetadata('sha256:demo-manifest', 'sha256:demo-image'),
      )
      const stackLock = {
        schemaVersion: 2,
        releaseVersion: '1.2.3',
        commitSha: 'deadbeef',
        generatedAt: '2026-05-23T00:00:00.000Z',
        generatedBy: 'scripts/containers/generate-stack-lock.mjs',
        services: [
          {
            imageId: 'sha256:app-image',
            image: 'ghcr.io/viscalyx/kravhantering-app-runtime',
            manifestDigest: 'sha256:app-manifest',
            name: 'app-runtime',
            role: 'application',
            source: 'ghcr-release',
            tag: '1.2.3',
          },
          {
            imageId: 'sha256:dbjob-image',
            image: 'ghcr.io/viscalyx/kravhantering-db-job',
            manifestDigest: 'sha256:dbjob-manifest',
            name: 'db-job',
            role: 'database-job',
            source: 'ghcr-release',
            tag: '1.2.3',
          },
          {
            imageId: 'sha256:nginx-image',
            image: 'docker.io/library/nginx',
            manifestDigest: 'sha256:nginx-manifest',
            name: 'nginx',
            role: 'tls-proxy',
            source: 'docker-hub',
            tag: '1.31.3-alpine',
          },
          {
            imageId: 'sha256:sql-image',
            image: 'mcr.microsoft.com/mssql/server',
            manifestDigest: 'sha256:sql-manifest',
            name: 'sqlserver',
            role: 'database',
            source: 'mcr',
            tag: '2025-CU7-ubuntu-24.04',
          },
          {
            imageId: 'sha256:keycloak-image',
            image: 'quay.io/keycloak/keycloak',
            manifestDigest: 'sha256:keycloak-manifest',
            name: 'keycloak',
            role: 'identity-provider',
            source: 'quay',
            tag: '26.7.1-0',
          },
        ],
      }
      const testSupportLock = {
        schemaVersion: 1,
        services: [
          {
            imageId: 'sha256:hsa-image',
            image: 'ghcr.io/viscalyx/kravhantering-hsa-directory-mock',
            manifestDigest: 'sha256:hsa-manifest',
            name: 'hsa-directory-mock',
            role: 'hsa-directory-test-support',
            source: 'ghcr-release',
            tag: '1.2.3',
          },
        ],
      }
      const hsaIntegrationSupportLock = {
        schemaVersion: 1,
        services: [
          {
            imageId: 'sha256:kong-image',
            image: 'docker.io/kong/kong-gateway',
            manifestDigest: 'sha256:kong-manifest',
            name: 'kong',
            role: 'api-management',
            source: 'docker-hub',
            tag: '3.15.0.0-20260702-ubuntu',
          },
          {
            imageId: 'sha256:adapter-image',
            image: 'ghcr.io/viscalyx/kravhantering-hsa-person-lookup-adapter',
            manifestDigest: 'sha256:adapter-manifest',
            name: 'hsa-person-lookup-adapter',
            role: 'hsa-person-lookup-adapter',
            source: 'ghcr-release',
            tag: '1.2.3',
          },
        ],
      }
      const stackLockPath = path.join(tmp, 'container-stack.lock.json')
      const hsaIntegrationSupportLockPath = path.join(
        tmp,
        'container-hsa-integration-support.lock.json',
      )
      const testSupportLockPath = path.join(
        tmp,
        'container-test-support.lock.json',
      )
      const metadataPath = path.join(tmp, 'release-metadata.json')
      const buildJsonPath = path.join(tmp, 'build.json')
      const hashesPath = path.join(tmp, 'hashes.sha256')
      const sbomDir = path.join(tmp, 'sbom')
      fs.mkdirSync(sbomDir)
      fs.writeFileSync(stackLockPath, JSON.stringify(stackLock))
      fs.writeFileSync(
        hsaIntegrationSupportLockPath,
        JSON.stringify(hsaIntegrationSupportLock),
      )
      fs.writeFileSync(testSupportLockPath, JSON.stringify(testSupportLock))
      fs.writeFileSync(metadataPath, JSON.stringify(metadata))
      fs.writeFileSync(buildJsonPath, '{"version":"1.2.3"}\n')
      fs.writeFileSync(hashesPath, 'abc123  container-stack.lock.json\n')
      fs.writeFileSync(path.join(sbomDir, 'app-runtime.spdx.json'), '{}\n')
      fs.writeFileSync(path.join(sbomDir, 'db-job.spdx.json'), '{}\n')
      fs.writeFileSync(
        path.join(sbomDir, 'hsa-person-lookup-adapter.spdx.json'),
        '{}\n',
      )
      fs.writeFileSync(
        path.join(sbomDir, 'hsa-directory-mock.spdx.json'),
        '{}\n',
      )

      const result = stageProductionDeploymentBundle({
        buildJsonPath,
        generatedAt: '2026-05-23T00:00:00.000Z',
        hashesPath,
        hsaIntegrationSupportLock,
        hsaIntegrationSupportLockPath,
        metadata,
        metadataPath,
        outputDir: path.join(tmp, 'deployment'),
        plan,
        sbomDir,
        stackLock,
        stackLockPath,
        testSupportLock,
        testSupportLockPath,
      })

      expect(result.archiveName).toBe(deploymentBundleArchiveName('1.2.3'))
      expect(
        result.files.some(file =>
          /(?:^|\/)(?:\.auth|\.codex|\.ssh)(?:\/|$)|auth\.json$/u.test(file),
        ),
      ).toBe(false)
      for (const file of result.files) {
        const content = fs.readFileSync(path.join(result.bundleRoot, file))
        expect(content.toString()).not.toMatch(
          /\b(?:CODEX_HOME|COPILOT_GITHUB_TOKEN|GH_TOKEN|SSH_AUTH_SOCK)\b/u,
        )
      }
      expect(result.files).toContain(
        'quadlet/templates/app-node-tls/kravhantering-nginx.container.template',
      )
      expect(result.files).toContain(
        'quadlet/templates/app-node-http/kravhantering-app-node.target.template',
      )
      expect(result.files).toContain(
        'quadlet/templates/single-node/kravhantering-sqlserver-data.volume.template',
      )
      expect(result.files).toContain(
        'quadlet/templates/app-node-tls/kravhantering-transient-cleanup.timer.template',
      )
      expect(result.files).toContain(
        'quadlet/templates/app-node-http/kravhantering-transient-cleanup.container.template',
      )
      expect(result.files).toContain(
        'quadlet/templates/single-node/kravhantering-transient-cleanup.container.template',
      )
      expect(result.files.some(file => file.startsWith('compose/'))).toBe(false)
      expect(result.files).toContain(
        'docs/operations/rhel10-production-deploy.md',
      )
      expect(result.files).toContain(
        'docs/operations/api-docs-edge-verification.md',
      )
      expect(result.files).toContain(
        'docs/operations/production-quadlet-containment.md',
      )
      expect(result.files).toContain(
        'docs/operations/transient-state-cleanup.md',
      )
      expect(result.files).toContain('docs/operations/ai-connections.md')
      expect(result.files).toContain(
        'docs/operations/rhel10-production-disconnected.md',
      )
      expect(result.files).toContain(
        'docs/operations/rhel10-production-upgrade.md',
      )
      expect(result.files).toContain(
        'docs/operations/rhel10-production-uninstall.md',
      )
      expect(result.files).toContain(
        'docs/operations/rhel10-production-single-node-self-contained-deploy.md',
      )
      expect(result.files).toContain(
        'docs/operations/rhel10-production-single-node-self-contained-disconnected.md',
      )
      expect(result.files).toContain(
        'docs/operations/rhel10-production-single-node-self-contained-upgrade.md',
      )
      expect(result.files).toContain(
        'docs/operations/rhel10-production-single-node-self-contained-uninstall.md',
      )
      for (const deploymentGuide of [
        'docs/operations/rhel10-production-deploy.md',
        'docs/operations/rhel10-production-single-node-self-contained-deploy.md',
      ]) {
        const guide = fs.readFileSync(
          path.join(result.bundleRoot, deploymentGuide),
          'utf8',
        )
        expect(guide).toContain('kravhantering-quadlet.sh install --topology')
        expect(guide).toContain('systemctl --user enable --now')
        expect(guide).not.toContain('podman-compose')
        expect(guide).not.toContain('podman compose')
      }
      expect(result.files).toContain(
        'docs/images/infographic-production-access-and-service-flow.png',
      )
      expect(result.files).toContain(
        'docs/images/infographic-single-node-access-flow.png',
      )
      expect(result.files).not.toContain(
        'public/infographic-production-access-and-service-flow.png',
      )
      expect(result.files).not.toContain(
        'public/infographic-single-node-access-flow.png',
      )
      expect(result.files).not.toContain(
        'docs/adr/0001-produktionsdriftsattning-fran-releaseartefakt.md',
      )
      expect(result.files).toContain('env/app.env.template')
      expect(result.files).toContain('env/release.env.template')
      expect(result.files).toContain(
        'container-hsa-integration-support.lock.json',
      )
      expect(result.files).toContain('container-test-support.lock.json')
      expect(result.files).toContain('openapi/hsa-person-lookup.yaml')
      expect(result.files).toContain('api-docs/hsa-person-lookup/index.html')
      expect(result.files).toContain(
        'api-docs/hsa-person-lookup/swagger-ui-bundle.js',
      )
      expect(result.files).toContain(
        'api-docs/hsa-person-lookup/swagger-initializer.js',
      )
      expect(result.files).toContain(
        'api-docs/hsa-person-lookup/swagger-ui-override.css',
      )
      expect(result.files).not.toContain(
        'api-docs/hsa-person-lookup/swagger-ui-standalone-preset.js',
      )
      expect(result.files).toContain(
        'nginx/templates/api-docs-security-headers.conf',
      )
      expect(result.files).toContain('kong/kong.strict.yml')
      expect(result.files).toContain('kong/strict-app-client-subject.conf')
      expect(result.files).toContain('bin/kravhantering-images.sh')
      expect(result.files).toContain('bin/kravhantering-quadlet.sh')
      expect(result.files).toContain('sqlserver/mssql.conf')
      expect(result.files).toContain(
        'keycloak/realm-kravhantering-production.template.json',
      )
      expect(result.files).toContain(
        'keycloak/demo-users.not-for-production.json',
      )
      expect(result.files).not.toContain('demo-seed/seed.mjs')
      expect(result.files).not.toContain('demo-seed/seed-dogfood.mjs')
      expect(result.files).not.toContain('demo-seed/seed-dogfood-build.mjs')
      expect(result.files).not.toContain(
        'demo-seed/seed-archiving-retention-build.mjs',
      )
      expect(result.files).toContain('scripts/keycloak-demo-users.mjs')
      expect(result.files).toContain('scripts/ai-deployment-gate.mjs')
      expect(result.files).toContain('scripts/ai-staging-live-probe.mjs')
      expect(result.files).toContain('sbom/hsa-directory-mock.spdx.json')
      expect(result.files).toContain('sbom/hsa-person-lookup-adapter.spdx.json')
      expect(result.files).toContain(
        'nginx/templates/single-node-tls.conf.template',
      )
      expect(result.files).not.toContain('nginx/conf.d/single-node-tls.conf')
      const quadletTemplates = result.files
        .filter(file => file.startsWith('quadlet/templates/'))
        .map(file =>
          fs.readFileSync(path.join(result.bundleRoot, file), 'utf8'),
        )
        .join('\n')
      expect(quadletTemplates).toContain('NGINX_RESOLVER')
      expect(quadletTemplates).toContain(
        'NetworkName=kravhantering-app-node_edge',
      )
      expect(quadletTemplates).toContain(
        'NetworkName=kravhantering-app-node_egress',
      )
      expect(quadletTemplates).toContain(
        'NetworkName=kravhantering-single-node_identity',
      )
      expect(quadletTemplates).toContain(
        'NetworkName=kravhantering-single-node_database',
      )
      const statelessContainerTemplates = result.files.filter(file =>
        /\/kravhantering-(?:app-runtime|nginx)\.container\.template$/u.test(
          file,
        ),
      )
      expect(statelessContainerTemplates).toHaveLength(6)
      for (const file of statelessContainerTemplates) {
        const template = fs.readFileSync(
          path.join(result.bundleRoot, file),
          'utf8',
        )
        expect(template).toContain('DropCapability=all')
        expect(template).toContain('ReadOnlyTmpfs=false')
        expect(template).toMatch(
          /^MemoryMax=@@(?:APP_RUNTIME|NGINX)_MEMORY_LIMIT_MIB@@M$/mu,
        )
      }
      expect(quadletTemplates).toContain(
        '/api-docs:/usr/share/nginx/html/api-docs:ro',
      )
      expect(quadletTemplates).toContain('DB_JOB_IMAGE_REF')
      expect(quadletTemplates).toContain(
        '/workspace/transient-cleanup/lib/transient-cleanup/cli.js',
      )
      expect(quadletTemplates).toContain('OnCalendar=*:0/5')
      expect(quadletTemplates).not.toContain('db-bootstrap')
      expect(quadletTemplates).not.toContain('db-migrate')
      expect(quadletTemplates).not.toContain('db-seed-required')
      for (const file of [
        'nginx/templates/app-node-http.conf.template',
        'nginx/templates/app-node-tls.conf.template',
        'nginx/templates/single-node-tls.conf.template',
      ]) {
        const template = fs.readFileSync(
          path.join(result.bundleRoot, file),
          'utf8',
        )
        expect(template).toContain('location /api-docs/')
        expect(template).toContain('/usr/share/nginx/html')
      }
      const releaseEnv = fs.readFileSync(
        path.join(result.bundleRoot, 'env/release.env.template'),
        'utf8',
      )
      expect(releaseEnv).not.toContain('SQLSERVER_HOST_PORT')
      expect(releaseEnv).not.toContain('DEMO_SEED_IMAGE_REF')
      const bundledReleaseMetadata = JSON.parse(
        fs.readFileSync(
          path.join(result.bundleRoot, 'release-metadata.json'),
          'utf8',
        ),
      )
      expect(bundledReleaseMetadata.demoSeed).toBeUndefined()
      const demoUsers = JSON.parse(
        fs.readFileSync(
          path.join(
            result.bundleRoot,
            'keycloak/demo-users.not-for-production.json',
          ),
          'utf8',
        ),
      )
      expect(demoUsers.users).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            username: 'ada.admin',
          }),
        ]),
      )
      expect(demoUsers.users[0]?.attributes).toHaveProperty(
        'kravhanteringDemoUser',
      )
      expect(result.manifest).toMatchObject({
        commitSha: plan.commitSha,
        schemaVersion: 3,
        database: {
          expectedSchemaVersion: getExpectedDatabaseSchemaVersion(),
        },
        images: {
          appRuntime:
            'ghcr.io/viscalyx/kravhantering-app-runtime@sha256:app-manifest',
          nginx: 'docker.io/library/nginx@sha256:nginx-manifest',
        },
        imageIds: {
          appRuntime: 'sha256:app-image',
          nginx: 'sha256:nginx-image',
        },
        supportedTopologies: ['app-node-tls', 'app-node-http', 'single-node'],
        testSupportImages: {
          hsaDirectoryMock:
            'ghcr.io/viscalyx/kravhantering-hsa-directory-mock@sha256:hsa-manifest',
        },
        hsaIntegrationSupportImages: {
          hsaPersonLookupAdapter:
            'ghcr.io/viscalyx/kravhantering-hsa-person-lookup-adapter@sha256:adapter-manifest',
          kong: 'docker.io/kong/kong-gateway@sha256:kong-manifest',
        },
        version: '1.2.3',
      })
      expect(
        fs.existsSync(path.join(result.bundleRoot, 'DEPLOYMENT-MANIFEST.json')),
      ).toBe(true)
    } finally {
      fs.rmSync(tmp, { force: true, recursive: true })
    }
  })

  it('does not move an existing release tag to another commit', () => {
    const plan = createTestReleasePlan({
      changedFiles: ['app/[locale]/page.tsx'],
      env: env(),
      gitVersion,
    })

    expect(() =>
      ensureGitTag(plan, {
        execFileSync: () => 'different-sha\n',
        spawnSync: vi.fn(),
      }),
    ).toThrow('already points at different-sha')
  })

  it('keeps matching tags and creates missing release tags', () => {
    const plan = createTestReleasePlan({
      changedFiles: ['app/[locale]/page.tsx'],
      env: env(),
      gitVersion,
    })
    expect(
      ensureGitTag(plan, {
        execFileSync: () => `${plan.commitSha}\n`,
        spawnSync: vi.fn(),
      }),
    ).toBe('exists')

    const spawnSync = vi.fn(() => ({ status: 0 }))
    expect(
      ensureGitTag(plan, {
        execFileSync: () => {
          throw new Error('missing')
        },
        spawnSync,
      }),
    ).toBe('created')
    expect(spawnSync).toHaveBeenCalledTimes(2)
  })

  it('configures generated release note categories with a catch-all', () => {
    const releaseConfig = readWorkspaceFile('.github/release.yml')

    expect(releaseConfig).toContain('ignore-for-release')
    expect(releaseConfig).toContain('title: Security and Privacy')
    expect(releaseConfig).toContain('title: Containers and Infrastructure')
    expect(releaseConfig).toContain('title: Other Changes')
    expect(releaseConfig).toContain('- "*"')
  })
})

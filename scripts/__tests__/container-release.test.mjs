import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import buildMetadataTools from '../build-metadata.js'
import {
  APP_RUNTIME_DESCRIPTION,
  APP_RUNTIME_PACKAGE,
  createReleaseChangelog,
  createReleaseMetadata,
  createReleasePlan,
  DB_JOB_DESCRIPTION,
  DEFAULT_OPERATOR_UPGRADE_NOTES_PATH,
  DEMO_SEED_DESCRIPTION,
  DEMO_SEED_PACKAGE,
  deploymentBundleArchiveName,
  ensureGitTag,
  extractUnreleasedOperatorUpgradeNotes,
  HSA_DIRECTORY_MOCK_DESCRIPTION,
  HSA_DIRECTORY_MOCK_PACKAGE,
  isReleaseRelevantPath,
  packageVersionUrlFromVersions,
  readOperatorUpgradeNotes,
  releasePlanEnv,
  renderReleaseNotes,
  resolveBundledMarkdownAssets,
  resolvePackageTagUrls,
  selectPreviousReleaseTag,
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

  it('ships nginx templates with dynamic upstream DNS resolution', () => {
    const nginxResolverPlaceholder = '$' + '{NGINX_RESOLVER}'
    const templates = [
      'containers/production/nginx/templates/app-node-http.conf.template',
      'containers/production/nginx/templates/app-node-tls.conf.template',
      'containers/production/nginx/templates/single-node-tls.conf.template',
    ]

    for (const template of templates) {
      const content = readWorkspaceFile(template)
      expectNginxTemplateSyntax(
        content.replaceAll(nginxResolverPlaceholder, '10.89.0.1'),
      )
      expect(content).toContain(
        `resolver ${nginxResolverPlaceholder} valid=10s ipv6=off;`,
      )
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
      'NGINX_IMAGE_REF=docker.io/library/nginx:1.31.2-alpine',
    )
    expect(releaseEnv).toContain(
      'SQLSERVER_IMAGE_REF=mcr.microsoft.com/mssql/server:2025-CU6-ubuntu-24.04',
    )
    expect(releaseEnv).toContain(
      'KONG_IMAGE_REF=docker.io/kong/kong-gateway:3.15.0.1-20260708-ubuntu',
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
            tag: '1.31.2-alpine',
          },
          {
            imageId: 'sha256:sql-image',
            image: 'mcr.microsoft.com/mssql/server',
            manifestDigest: 'sha256:sql-manifest',
            name: 'sqlserver',
            role: 'database',
            source: 'mcr',
            tag: '2025-CU6-ubuntu-24.04',
          },
          {
            imageId: 'sha256:keycloak-image',
            image: 'quay.io/keycloak/keycloak',
            manifestDigest: 'sha256:keycloak-manifest',
            name: 'keycloak',
            role: 'identity-provider',
            source: 'quay',
            tag: '26.6.4-1',
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
      expect(result.files).toContain('compose/app-node-tls.compose.yml')
      expect(result.files).toContain('compose/single-node.compose.yml')
      expect(result.files).toContain('compose/single-node-demo.compose.yml')
      expect(result.files).toContain(
        'docs/operations/rhel10-production-deploy.md',
      )
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
      expect(result.files).toContain('kong/kong.yml')
      expect(result.files).toContain('bin/kravhantering-images.sh')
      expect(result.files).toContain(
        'systemd/kravhantering-single-node-compose.service',
      )
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
      expect(result.files).toContain('sbom/hsa-directory-mock.spdx.json')
      expect(result.files).toContain('sbom/hsa-person-lookup-adapter.spdx.json')
      expect(result.files).toContain(
        'nginx/templates/single-node-tls.conf.template',
      )
      expect(result.files).not.toContain('nginx/conf.d/single-node-tls.conf')
      for (const file of [
        'compose/app-node-http.compose.yml',
        'compose/app-node-tls.compose.yml',
        'compose/single-node.compose.yml',
      ]) {
        const compose = fs.readFileSync(
          path.join(result.bundleRoot, file),
          'utf8',
        )
        expect(compose).not.toContain(':ro,Z')
        expect(compose).not.toMatch(/-\s+\.\/nginx\//)
        expect(compose).toContain('NGINX_RESOLVER')
        expect(compose).toContain('name: kravhantering-internal')
        expect(compose).toContain(
          '../api-docs:/usr/share/nginx/html/api-docs:ro',
        )
        expect(compose).not.toContain(
          'kravhantering-app-node_kravhantering-internal',
        )
        expect(compose).not.toContain(
          'kravhantering-single-node_kravhantering-internal',
        )
        expect(compose).toContain('/etc/nginx/templates/default.conf.template')
        expect(compose).not.toContain('/etc/nginx/conf.d/default.conf')
      }
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
      const singleNodeDemoCompose = fs.readFileSync(
        path.join(result.bundleRoot, 'compose/single-node-demo.compose.yml'),
        'utf8',
      )
      expect(singleNodeDemoCompose).toContain('${KONG_IMAGE_REF:?set')
      expect(singleNodeDemoCompose).toContain(
        '${HSA_PERSON_LOOKUP_ADAPTER_IMAGE_REF:?set',
      )
      expect(singleNodeDemoCompose).toContain(
        '${HSA_DIRECTORY_MOCK_IMAGE_REF:?set',
      )
      expect(singleNodeDemoCompose).not.toContain('\n    ports:')
      const singleNodeCompose = fs.readFileSync(
        path.join(result.bundleRoot, 'compose/single-node.compose.yml'),
        'utf8',
      )
      expect(singleNodeCompose).not.toContain(
        'condition: service_completed_successfully',
      )
      expect(singleNodeCompose).not.toContain('\n  db-bootstrap:')
      expect(singleNodeCompose).not.toContain('\n  db-migrate:')
      expect(singleNodeCompose).not.toContain('\n  db-seed-required:')
      expect(singleNodeCompose).not.toContain('SQLSERVER_HOST_PORT')
      const sqlServerBlock =
        singleNodeCompose.match(
          /\n {2}sqlserver:[\s\S]*?\n\n {2}keycloak:/,
        )?.[0] ?? ''
      expect(sqlServerBlock).not.toContain('\n    ports:')
      expect(sqlServerBlock).toContain('kravhantering-internal')
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
      const appRuntimeBlock =
        singleNodeCompose.match(
          /\n {2}app-runtime:[\s\S]*?\n\n {2}nginx:/,
        )?.[0] ?? ''
      expect(appRuntimeBlock).toContain('sqlserver:')
      expect(appRuntimeBlock).not.toContain('db-seed-required')
      expect(result.manifest).toMatchObject({
        commitSha: plan.commitSha,
        schemaVersion: 2,
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
        supportedTopologies: [
          'app-node-external-sql-external-idp',
          'single-node-internal-sql-internal-keycloak',
          'single-node-demo',
        ],
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

  it('declares the trusted release workflow contract', () => {
    const workflow = fs.readFileSync(
      path.join(process.cwd(), '.github/workflows/container-release.yml'),
      'utf8',
    )

    expect(workflow).toContain('branches: [main]')
    expect(workflow).toContain("- 'v[0-9]*.[0-9]*.[0-9]*'")
    expect(workflow).toContain("- '!v*-*'")
    expect(workflow).toContain('packages: write')
    expect(workflow).toContain('id-token: write')
    expect(workflow).toContain('attestations: write')
    expect(workflow).toContain('fetch-depth: 0')
    expect(workflow).toContain('operator-upgrade-notes.mjs sync-commit-prs')
    expect(workflow).toContain(
      "if: env.RELEASE_CREATE_GITHUB_RELEASE == 'true' && env.RELEASE_PRERELEASE == 'true'",
    )
    expect(workflow).not.toContain('Install latest npm')
    expect(workflow).not.toContain('npm install -g npm@latest')
    expect(workflow).not.toContain('verify-ghcr-public')
    expect(workflow).not.toContain('sigstore/cosign-installer')
    expect(workflow).not.toContain('cosign sign --yes')
    expect(workflow).not.toContain('cosign verify')
    expect(workflow).toContain('mkdir -p tmp/container-release-artifacts/sbom')
    expect(workflow).toContain('Verify artifact attestations')
    expect(workflow).toContain(`gh attestation verify "oci://\${ref}"`)
    expect(workflow).toContain(
      `--signer-workflow "\${GITHUB_REPOSITORY}/.github/workflows/container-release.yml"`,
    )
    expect(workflow).toContain(
      '--predicate-type https://spdx.dev/Document/v2.3',
    )
    expect(workflow).toContain('Attest app-runtime provenance')
    expect(workflow).toContain('Attest db-job provenance')
    expect(workflow).toContain('Attest demo seed provenance')
    expect(workflow).toContain('Attest HSA directory mock provenance')
    expect(workflow).toContain('Attest app-runtime SBOM')
    expect(workflow).toContain('Attest db-job SBOM')
    expect(workflow).toContain('Attest demo seed SBOM')
    expect(workflow).toContain('Attest HSA directory mock SBOM')
    const usesReferences = workflow.match(/uses:/g) ?? []
    const shaPinnedUsesReferences =
      workflow.match(/uses:[^@]+@[0-9a-f]{40}/g) ?? []
    expect(shaPinnedUsesReferences).toHaveLength(usesReferences.length)
    expect(workflow.match(/uses: actions\/attest@[0-9a-f]{40}/g)).toHaveLength(
      10,
    )
    expect(workflow.match(/persist-credentials:\s*false/g)).not.toBeNull()
    expect(workflow.match(/--provenance=false/g)).toHaveLength(5)
    const appRuntimeDescriptionEnv = '$' + '{APP_RUNTIME_DESCRIPTION}'
    const dbJobDescriptionEnv = '$' + '{DB_JOB_DESCRIPTION}'
    const demoSeedDescriptionEnv = '$' + '{DEMO_SEED_DESCRIPTION}'
    const hsaDirectoryMockDescriptionEnv =
      '$' + '{HSA_DIRECTORY_MOCK_DESCRIPTION}'
    const hsaPersonLookupAdapterDescriptionEnv =
      '$' + '{HSA_PERSON_LOOKUP_ADAPTER_DESCRIPTION}'
    expect(
      workflow.match(/org\.opencontainers\.image\.description/g),
    ).toHaveLength(10)
    expect(workflow).toContain(
      `--label "org.opencontainers.image.description=${appRuntimeDescriptionEnv}"`,
    )
    expect(workflow).toContain(
      `--label "org.opencontainers.image.description=${dbJobDescriptionEnv}"`,
    )
    expect(workflow).toContain(
      `--label "org.opencontainers.image.description=${demoSeedDescriptionEnv}"`,
    )
    expect(workflow).toContain(
      `--label "org.opencontainers.image.description=${hsaDirectoryMockDescriptionEnv}"`,
    )
    expect(workflow).toContain(
      `--label "org.opencontainers.image.description=${hsaPersonLookupAdapterDescriptionEnv}"`,
    )
    expect(workflow).toContain(
      `--annotation "manifest:org.opencontainers.image.description=${appRuntimeDescriptionEnv}"`,
    )
    expect(workflow).toContain(
      `--annotation "manifest:org.opencontainers.image.description=${dbJobDescriptionEnv}"`,
    )
    expect(workflow).toContain(
      `--annotation "manifest:org.opencontainers.image.description=${demoSeedDescriptionEnv}"`,
    )
    expect(workflow).toContain(
      `--annotation "manifest:org.opencontainers.image.description=${hsaDirectoryMockDescriptionEnv}"`,
    )
    expect(workflow).toContain(
      `--annotation "manifest:org.opencontainers.image.description=${hsaPersonLookupAdapterDescriptionEnv}"`,
    )
    expect(workflow).toContain(
      'sbom-path: tmp/container-release-artifacts/sbom/app-runtime.spdx.json',
    )
    expect(workflow).toContain(
      'sbom-path: tmp/container-release-artifacts/sbom/db-job.spdx.json',
    )
    expect(workflow).toContain(
      'sbom-path: tmp/container-release-artifacts/sbom/demo-seed.spdx.json',
    )
    expect(workflow).toContain(
      'sbom-path: tmp/container-release-artifacts/sbom/hsa-directory-mock.spdx.json',
    )
    expect(workflow).toContain(
      'sbom-path: tmp/container-release-artifacts/sbom/hsa-person-lookup-adapter.spdx.json',
    )
    expect(workflow).toMatch(
      /node scripts\/containers\/write-hashes\.mjs[\s\S]*tmp\/container-release-artifacts\/sbom\/demo-seed\.spdx\.json[\s\S]*tmp\/container-release-artifacts\/sbom\/hsa-person-lookup-adapter\.spdx\.json/u,
    )
    expect(workflow.match(/push-to-registry: false/g)).toHaveLength(10)
    expect(workflow).not.toContain('push-to-registry: true')
    expect(workflow).toContain('--release-images-from-lock')
    expect(workflow).toContain(
      '--test-lock-file container-test-support.lock.json',
    )
    expect(workflow).toContain(
      '--hsa-integration-lock-file container-hsa-integration-support.lock.json',
    )
    expect(workflow).toContain(
      '--run-id "$' + '{CONTAINER_STACK_RUN_ID}" || true',
    )
    expect(workflow).toContain('container-release.mjs identities')
    expect(workflow).toContain(
      '--build-arg BUILD_EXPECTED_DATABASE_SCHEMA_VERSION="$' +
        '{BUILD_EXPECTED_DATABASE_SCHEMA_VERSION}"',
    )
    expect(workflow).toContain('APP_RUNTIME_MANIFEST_DIGEST_REF')
    expect(workflow).toContain('DB_JOB_MANIFEST_DIGEST_REF')
    expect(workflow).toContain('DEMO_SEED_MANIFEST_DIGEST_REF')
    expect(workflow).toContain('HSA_DIRECTORY_MOCK_MANIFEST_DIGEST_REF')
    expect(workflow).toContain('APP_RUNTIME_IMAGE_ID')
    expect(workflow).toContain('DB_JOB_IMAGE_ID')
    expect(workflow).toContain('HSA_DIRECTORY_MOCK_IMAGE_ID')
    expect(workflow).toContain(
      '--demo-seed-metadata tmp/container-release-artifacts/metadata/demo-seed-buildx.json',
    )
    expect(workflow).toContain('container-test-support.lock.json')
    expect(workflow).not.toContain('APP_RUNTIME_DIGEST_REF')
    expect(workflow).not.toContain('DB_JOB_DIGEST_REF')
    expect(workflow).toContain('container-release.mjs bundle')
    expect(workflow).toContain('GH_TOKEN: $' + '{{ github.token }}')
    expect(workflow).toContain(
      `kravhantering-production-deploy-\${RELEASE_VERSION}.tar.gz`,
    )
    expect(workflow).toContain(
      `( cd "\${artifact_dir}" && sha256sum "\${bundle}.tar.gz" )`,
    )
    expect(workflow).toContain(
      `container-release-deployment-\${{ github.run_id }}`,
    )
    expect(workflow).toContain('Archive stable operator upgrade notes')
    expect(workflow).toContain('operator-upgrade-notes.mjs archive-stable')
    expect(workflow).toContain(
      "if: env.RELEASE_CREATE_GITHUB_RELEASE == 'true' && env.RELEASE_IS_STABLE == 'true'",
    )
    expect(workflow).toContain(
      'archive_branch="automation/operator-upgrade-notes-archive-$' +
        '{RELEASE_TAG_NAME}"',
    )
    expect(workflow).toContain(
      'GH_TOKEN: $' + '{{ secrets.OPERATOR_UPGRADE_NOTES_TOKEN }}',
    )
    expect(workflow).toContain(
      'gh pr create --base main --head "$' + '{archive_branch}"',
    )
    expect(workflow).toContain("--jq '.published_at[0:10]'")
    expect(workflow).toContain(
      'git fetch origin "+$' +
        '{archive_branch}:refs/remotes/origin/$' +
        '{archive_branch}"',
    )
    expect(workflow).toMatch(
      /gh\s+pr\s+merge\s+"\$\{pr_number\}"\s+--squash\s+--auto/u,
    )
    expect(workflow).not.toContain('git push origin HEAD:main')
    expect(workflow).toContain('npm run test:release-smoke')
    expect(workflow).not.toContain('pull_request_target')
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

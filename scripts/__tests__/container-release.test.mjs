import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  APP_RUNTIME_PACKAGE,
  createReleaseMetadata,
  createReleasePlan,
  deploymentBundleArchiveName,
  ensureGitTag,
  isReleaseRelevantPath,
  renderReleaseNotes,
  stageProductionDeploymentBundle,
} from '../release/container-release.mjs'

const gitVersion = { FullSemVer: '1.2.0-preview.4' }

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

describe('trusted container release helpers', () => {
  it('creates main snapshot tags and preview releases for relevant changes', () => {
    const plan = createReleasePlan({
      changedFiles: ['app/[locale]/page.tsx', 'docs/notes.md'],
      env: env(),
      gitVersion,
    })

    expect(plan).toMatchObject({
      appRuntimeImage: `ghcr.io/viscalyx/${APP_RUNTIME_PACKAGE}`,
      createGitHubRelease: true,
      hasRelevantChange: true,
      prerelease: true,
      releaseTagName: 'v1.2.0-preview.4',
      version: '1.2.0-preview.4',
    })
    expect(plan.tags).toEqual([
      'main-1234567890ab',
      'sha-1234567890abcdef1234567890abcdef12345678',
      '1.2.0-preview.4',
    ])
  })

  it('strips GitVersion build metadata from preview release tags', () => {
    const plan = createReleasePlan({
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
      'main-1234567890ab',
      'sha-1234567890abcdef1234567890abcdef12345678',
      '1.2.0-preview.4',
    ])
    for (const tag of [
      plan.releaseTagName,
      ...plan.tags,
      ...plan.appRuntimeTags,
      ...plan.dbJobTags,
    ]) {
      expect(tag).not.toContain('+')
    }
  })

  it('keeps docs-only main pushes as snapshots without preview releases', () => {
    const plan = createReleasePlan({
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
    const plan = createReleasePlan({
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
    expect(isReleaseRelevantPath('docs/rhel10-production-deploy.md')).toBe(true)
    expect(isReleaseRelevantPath('docs/prompt-faser.md')).toBe(false)
    expect(isReleaseRelevantPath('tests/unit/example.test.ts')).toBe(false)
  })

  it('renders release notes with GHCR refs and checksums', () => {
    const plan = createReleasePlan({
      changedFiles: ['containers/app/Dockerfile'],
      env: env(),
      gitVersion,
    })
    const metadata = createReleaseMetadata(
      plan,
      { 'containerimage.digest': 'sha256:app' },
      { 'containerimage.digest': 'sha256:dbjob' },
    )

    const notes = renderReleaseNotes(
      plan,
      metadata,
      'abc123  container-stack.lock.json\n',
    )

    expect(notes).toContain(
      'ghcr.io/viscalyx/kravhantering-app-runtime@sha256:app',
    )
    expect(notes).toContain(
      'ghcr.io/viscalyx/kravhantering-db-job@sha256:dbjob',
    )
    expect(notes).toContain('abc123  container-stack.lock.json')
    expect(notes).toContain(
      'kravhantering-production-deploy-1.2.0-preview.4.tar.gz',
    )
    expect(notes).not.toContain('GHCR package visibility')
  })

  it('stages the production deployment bundle with manifest and templates', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kh-release-bundle-'))
    try {
      const plan = createReleasePlan({
        changedFiles: ['containers/app/Dockerfile'],
        env: env({
          GITHUB_REF: 'refs/tags/v1.2.3',
          GITHUB_REF_NAME: 'v1.2.3',
        }),
        gitVersion,
      })
      const metadata = createReleaseMetadata(
        plan,
        { 'containerimage.digest': 'sha256:app' },
        { 'containerimage.digest': 'sha256:dbjob' },
      )
      const stackLock = {
        services: [
          {
            digest: 'sha256:app',
            image: 'ghcr.io/viscalyx/kravhantering-app-runtime',
            name: 'app-runtime',
            role: 'application',
            source: 'ghcr-release',
            tag: '1.2.3',
          },
          {
            digest: 'sha256:dbjob',
            image: 'ghcr.io/viscalyx/kravhantering-db-job',
            name: 'db-job',
            role: 'database-job',
            source: 'ghcr-release',
            tag: '1.2.3',
          },
          {
            digest: 'sha256:nginx',
            image: 'docker.io/library/nginx',
            name: 'nginx',
            role: 'tls-proxy',
            source: 'docker-hub',
            tag: 'stable',
          },
          {
            digest: 'sha256:sql',
            image: 'mcr.microsoft.com/mssql/server',
            name: 'sqlserver',
            role: 'database',
            source: 'mcr',
            tag: '2025-latest',
          },
          {
            digest: 'sha256:keycloak',
            image: 'quay.io/keycloak/keycloak',
            name: 'keycloak',
            role: 'identity-provider',
            source: 'quay',
            tag: '26.6.1',
          },
        ],
      }
      const stackLockPath = path.join(tmp, 'container-stack.lock.json')
      const metadataPath = path.join(tmp, 'release-metadata.json')
      const buildJsonPath = path.join(tmp, 'build.json')
      const hashesPath = path.join(tmp, 'hashes.sha256')
      const sbomDir = path.join(tmp, 'sbom')
      fs.mkdirSync(sbomDir)
      fs.writeFileSync(stackLockPath, JSON.stringify(stackLock))
      fs.writeFileSync(metadataPath, JSON.stringify(metadata))
      fs.writeFileSync(buildJsonPath, '{"version":"1.2.3"}\n')
      fs.writeFileSync(hashesPath, 'abc123  container-stack.lock.json\n')
      fs.writeFileSync(path.join(sbomDir, 'app-runtime.spdx.json'), '{}\n')
      fs.writeFileSync(path.join(sbomDir, 'db-job.spdx.json'), '{}\n')

      const result = stageProductionDeploymentBundle({
        buildJsonPath,
        generatedAt: '2026-05-23T00:00:00.000Z',
        hashesPath,
        metadata,
        metadataPath,
        outputDir: path.join(tmp, 'deployment'),
        plan,
        sbomDir,
        stackLock,
        stackLockPath,
      })

      expect(result.archiveName).toBe(deploymentBundleArchiveName('1.2.3'))
      expect(result.files).toContain('compose/app-node-tls.compose.yml')
      expect(result.files).toContain('compose/single-node.compose.yml')
      expect(result.files).toContain('docs/rhel10-production-deploy.md')
      expect(result.files).toContain('env/app.env.template')
      expect(result.files).toContain(
        'keycloak/realm-kravhantering-production.template.json',
      )
      expect(result.manifest).toMatchObject({
        commitSha: plan.commitSha,
        images: {
          appRuntime: 'ghcr.io/viscalyx/kravhantering-app-runtime@sha256:app',
          nginx: 'docker.io/library/nginx@sha256:nginx',
        },
        supportedTopologies: [
          'app-node-external-sql-external-idp',
          'single-node-internal-sql-internal-keycloak',
        ],
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
    const plan = createReleasePlan({
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
    expect(workflow).toContain("tags: ['v[0-9]*.[0-9]*.[0-9]*']")
    expect(workflow).toContain('packages: write')
    expect(workflow).toContain('id-token: write')
    expect(workflow).toContain('attestations: write')
    expect(workflow).toContain('fetch-depth: 0')
    expect(workflow).not.toContain('Install latest npm')
    expect(workflow).not.toContain('npm install -g npm@latest')
    expect(workflow).not.toContain('verify-ghcr-public')
    expect(workflow).toContain('cosign sign --yes')
    expect(workflow).toContain('mkdir -p tmp/container-release-artifacts/sbom')
    expect(workflow).toContain('attest-build-provenance')
    expect(workflow).toContain('attest-sbom')
    expect(workflow).toContain('--release-images-from-lock')
    expect(workflow).toContain('container-release.mjs bundle')
    expect(workflow).toContain(
      `kravhantering-production-deploy-\${RELEASE_VERSION}.tar.gz`,
    )
    expect(workflow).toContain(
      `container-release-deployment-\${{ github.run_id }}`,
    )
    expect(workflow).toContain('npm run test:release-smoke')
    expect(workflow).not.toContain('pull_request_target')
  })
})

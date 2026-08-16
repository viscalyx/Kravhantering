import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  detectImageDrift,
  detectLycheeDrift,
  detectNpmDrift,
  detectUnits,
  executeIssueActions,
  formatState,
  IMAGE_CONFIGS,
  listDetectorIssues,
  main,
  parseArgs,
  parseDevcontainerBaseTag,
  parseKeycloakTag,
  parseKongTag,
  parseLycheeVersion,
  parseNginxTag,
  parseNodeTag,
  parseSqlServerTag,
  planIssueActions,
  readLycheeCurrent,
  readNodeCurrent,
  renderIssueBody,
  selectAvailableVersion,
} from '../../.github/workflows/dependency-drift.mjs'

const temporaryDirectories = []
const digest = character => `sha256:${character.repeat(64)}`

function temporaryDirectory() {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'dependency-drift-test-'),
  )
  temporaryDirectories.push(directory)
  return directory
}

function write(root, relativePath, contents) {
  const absolutePath = path.join(root, relativePath)
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
  fs.writeFileSync(absolutePath, contents)
}

function writeLycheeState(
  root,
  version,
  checksums = { amd64: 'a'.repeat(64), arm64: 'b'.repeat(64) },
) {
  const installerChecksums = `
    amd64) lychee_sha256='${checksums.amd64}' ;;
    arm64) lychee_sha256='${checksums.arm64}' ;;
  `
  write(
    root,
    '.devcontainer/Dockerfile',
    `ARG LYCHEE_VERSION=${version}\n${installerChecksums}`,
  )
  write(
    root,
    'scripts/azure-dev/templates/bootstrap-host.sh',
    `LYCHEE_VERSION="${version}"\n${installerChecksums}`,
  )
  write(
    root,
    '.github/workflows/quality-checks.yml',
    `with:\n  lycheeVersion: ${version}\n`,
  )
}

function lycheeRelease(version, checksums = { amd64: 'c', arm64: 'd' }) {
  return {
    assets: [
      {
        digest: digest(checksums.amd64),
        name: 'lychee-x86_64-unknown-linux-gnu.tar.gz',
      },
      {
        digest: digest(checksums.arm64),
        name: 'lychee-aarch64-unknown-linux-gnu.tar.gz',
      },
    ],
    draft: false,
    prerelease: false,
    tag_name: `lychee-${version}`,
  }
}

function lycheeUnit(overrides = {}) {
  return {
    id: 'lychee-toolchain',
    paths: [
      '.devcontainer/Dockerfile',
      'scripts/azure-dev/templates/bootstrap-host.sh',
      '.github/workflows/quality-checks.yml',
      'tests/unit/github-actions-workflow-security.test.ts',
    ],
    repository: 'lycheeverse/lychee',
    skill: 'resolve-dependency-drift',
    ...overrides,
  }
}

function drift(unit = 'keycloak') {
  return {
    available: {
      imageId: digest('b'),
      manifestDigest: digest('c'),
      tag: '26.8.0',
    },
    current: {
      imageId: digest('d'),
      manifestDigest: digest('e'),
      tag: '26.7.0',
    },
    drift: true,
    skill: 'resolve-dependency-drift',
    unit,
  }
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true })
  }
  vi.restoreAllMocks()
})

describe('dependency drift selection', () => {
  it('parses workflow input', () => {
    expect(parseArgs([], {})).toEqual({ unit: 'all' })
    expect(parseArgs([], { DEPENDENCY_DRIFT_UNIT: 'npm' })).toEqual({
      unit: 'npm',
    })
    expect(parseArgs(['--unit', 'node'], {})).toEqual({ unit: 'node' })
    expect(parseArgs(['--unit', 'lychee'], {})).toEqual({ unit: 'lychee' })
    expect(() => parseArgs(['--unit'], {})).toThrow('Missing value')
    expect(() => parseArgs(['--unknown'], {})).toThrow('Unexpected argument')
  })

  it('parses supported image lanes', () => {
    expect(parseDevcontainerBaseTag('2.0.5-ubuntu-24.04')).toMatchObject({
      major: 2,
      minor: 0,
      patch: 5,
    })
    expect(parseDevcontainerBaseTag('ubuntu-24.04')).toBeNull()
    expect(parseDevcontainerBaseTag('2-ubuntu-24.04')).toBeNull()
    expect(parseNodeTag('24-trixie-slim')).toMatchObject({ major: 24 })
    expect(parseNodeTag('25-trixie-slim')).toBeNull()
    expect(parseNginxTag('1.29.4-alpine')).toMatchObject({ minor: 29 })
    expect(parseSqlServerTag('2025-CU7-ubuntu-24.04')).toMatchObject({ cu: 7 })
    expect(parseKeycloakTag('26.7.0-1')).toMatchObject({ revision: 1 })
    expect(parseKongTag('3.15.0.1-20260708-ubuntu')).toMatchObject({
      buildDate: 20260708,
      revision: 1,
    })
    expect(parseLycheeVersion('v1.2.3')).toMatchObject({
      major: 1,
      minor: 2,
      patch: 3,
    })
    expect(parseLycheeVersion('latest')).toBeNull()
  })

  it('selects the newest supported current-or-newer version', () => {
    const selected = selectAvailableVersion(
      IMAGE_CONFIGS.keycloak,
      ['25.0.0', '26.7.1', '27.0.0', 'latest'],
      '26.7.0',
    )
    expect(selected.tag).toBe('27.0.0')
    expect(
      selectAvailableVersion(
        IMAGE_CONFIGS.keycloak,
        ['26.7.1', '27.0.0'],
        '26.7.0',
        { sameLaneOnly: true },
      ).tag,
    ).toBe('26.7.1')
  })

  it('keeps the current version when no newer supported tag exists', () => {
    expect(
      selectAvailableVersion(
        IMAGE_CONFIGS.nginx,
        ['1.28.0-alpine', 'mainline'],
        '1.29.4-alpine',
      ).tag,
    ).toBe('1.29.4-alpine')
  })
})

describe('drift detection', () => {
  it('detects same-tag manifest drift for the devcontainer base image', async () => {
    const root = temporaryDirectory()
    const config = IMAGE_CONFIGS['devcontainer-base']
    write(
      root,
      config.lockPath,
      JSON.stringify({
        image: config.image,
        imageId: digest('a'),
        manifestDigest: digest('b'),
        tag: '2.0.5-ubuntu-24.04',
      }),
    )

    const result = await detectImageDrift(
      {
        detector: 'devcontainer-base',
        id: 'devcontainer-base',
        skill: 'resolve-dependency-drift',
      },
      root,
      {
        listTags: async () => ['2.0.5-ubuntu-24.04'],
        resolveImageIdentity: async () => ({
          imageId: digest('c'),
          manifestDigest: digest('d'),
        }),
      },
    )

    expect(result).toMatchObject({
      available: {
        imageId: digest('c'),
        manifestDigest: digest('d'),
        tag: '2.0.5-ubuntu-24.04',
      },
      drift: true,
      unit: 'devcontainer-base',
    })
  })

  it('requires every production Node Dockerfile to use one identity', () => {
    const root = temporaryDirectory()
    for (const dockerfilePath of IMAGE_CONFIGS.node.paths) {
      write(
        root,
        dockerfilePath,
        `FROM node:24-trixie-slim@${digest('a')} AS runtime\n`,
      )
    }

    expect(readNodeCurrent(IMAGE_CONFIGS.node, root)).toEqual({
      imageId: null,
      manifestDigest: digest('a'),
      tag: '24-trixie-slim',
    })

    write(
      root,
      IMAGE_CONFIGS.node.paths[2],
      `FROM node:24-trixie-slim@${digest('b')} AS runtime\n`,
    )
    expect(() => readNodeCurrent(IMAGE_CONFIGS.node, root)).toThrow(
      'not aligned',
    )
  })

  it('detects a same-tag manifest refresh for production Node', async () => {
    const root = temporaryDirectory()
    for (const dockerfilePath of IMAGE_CONFIGS.node.paths) {
      write(
        root,
        dockerfilePath,
        `FROM node:24-trixie-slim@${digest('a')} AS runtime\n`,
      )
    }
    const result = await detectImageDrift(
      {
        detector: 'node',
        id: 'production-node',
        skill: 'resolve-dependency-drift',
      },
      root,
      {
        listTags: async () => ['24-trixie-slim'],
        resolveImageIdentity: async () => ({
          imageId: digest('c'),
          manifestDigest: digest('b'),
        }),
      },
    )

    expect(result.drift).toBe(true)
    expect(result.available.manifestDigest).toBe(digest('b'))
  })

  it('reports same-lane image maintenance before a newer major', async () => {
    const root = temporaryDirectory()
    write(
      root,
      IMAGE_CONFIGS.keycloak.lockPath,
      JSON.stringify({
        image: IMAGE_CONFIGS.keycloak.image,
        imageId: digest('a'),
        manifestDigest: digest('b'),
        tag: '26.7.0',
      }),
    )
    const resolveIdentity = vi.fn(async (_config, tag) => ({
      imageId: tag === '26.7.0' ? digest('a') : digest('c'),
      manifestDigest: tag === '26.7.0' ? digest('b') : digest('d'),
    }))

    const result = await detectImageDrift(
      {
        detector: 'keycloak',
        id: 'keycloak',
        skill: 'resolve-dependency-drift',
      },
      root,
      {
        listTags: async () => ['26.7.0', '26.7.1', '27.0.0'],
        resolveImageIdentity: resolveIdentity,
      },
    )

    expect(result.available.tag).toBe('26.7.1')
    expect(resolveIdentity).toHaveBeenCalledTimes(1)
  })

  it('reports a current-lane digest refresh before a newer major', async () => {
    const root = temporaryDirectory()
    write(
      root,
      IMAGE_CONFIGS.keycloak.lockPath,
      JSON.stringify({
        image: IMAGE_CONFIGS.keycloak.image,
        imageId: digest('a'),
        manifestDigest: digest('b'),
        tag: '26.7.0',
      }),
    )
    const resolveIdentity = vi.fn(async (_config, tag) => ({
      imageId: tag === '26.7.0' ? digest('a') : digest('c'),
      manifestDigest: tag === '26.7.0' ? digest('c') : digest('d'),
    }))

    const result = await detectImageDrift(
      {
        detector: 'keycloak',
        id: 'keycloak',
        skill: 'resolve-dependency-drift',
      },
      root,
      {
        listTags: async () => ['26.7.0', '27.0.0'],
        resolveImageIdentity: resolveIdentity,
      },
    )

    expect(result.available.tag).toBe('26.7.0')
    expect(result.available.manifestDigest).toBe(digest('c'))
    expect(resolveIdentity).toHaveBeenCalledTimes(1)
  })

  it('reports a newer major after confirming the current lane is unchanged', async () => {
    const root = temporaryDirectory()
    write(
      root,
      IMAGE_CONFIGS.keycloak.lockPath,
      JSON.stringify({
        image: IMAGE_CONFIGS.keycloak.image,
        imageId: digest('a'),
        manifestDigest: digest('b'),
        tag: '26.7.0',
      }),
    )
    const resolveIdentity = vi.fn(async (_config, tag) => ({
      imageId: tag === '26.7.0' ? digest('a') : digest('c'),
      manifestDigest: tag === '26.7.0' ? digest('b') : digest('d'),
    }))

    const result = await detectImageDrift(
      {
        detector: 'keycloak',
        id: 'keycloak',
        skill: 'resolve-dependency-drift',
      },
      root,
      {
        listTags: async () => ['26.7.0', '27.0.0'],
        resolveImageIdentity: resolveIdentity,
      },
    )

    expect(result.available.tag).toBe('27.0.0')
    expect(result.drift).toBe(true)
    expect(resolveIdentity).toHaveBeenCalledTimes(2)
  })

  it('detects npm drift from the canonical root manifest', async () => {
    const root = temporaryDirectory()
    write(
      root,
      'package.json',
      JSON.stringify({ packageManager: 'npm@12.0.2' }),
    )

    await expect(
      detectNpmDrift(
        {
          id: 'npm-toolchain',
          skill: 'resolve-dependency-drift',
        },
        root,
        { fetchLatest: async () => '12.1.0' },
      ),
    ).resolves.toMatchObject({
      available: { version: '12.1.0' },
      current: { version: '12.0.2' },
      drift: true,
    })
  })

  it('detects a supported Lychee release with both published asset digests', async () => {
    const root = temporaryDirectory()
    writeLycheeState(root, 'v1.2.3')
    const paths = [
      '.devcontainer/Dockerfile',
      'scripts/azure-dev/templates/bootstrap-host.sh',
      '.github/workflows/quality-checks.yml',
    ]

    await expect(
      detectLycheeDrift(lycheeUnit({ paths }), root, {
        fetchLatestLycheeRelease: async () => lycheeRelease('v1.2.4'),
      }),
    ).resolves.toMatchObject({
      available: {
        checksums: { amd64: 'c'.repeat(64), arm64: 'd'.repeat(64) },
        version: 'v1.2.4',
      },
      current: { version: 'v1.2.3' },
      drift: true,
      paths,
    })
  })

  it('detects same-version Lychee asset digest drift', async () => {
    const root = temporaryDirectory()
    writeLycheeState(root, 'v1.2.3')

    await expect(
      detectLycheeDrift(lycheeUnit(), root, {
        fetchLatestLycheeRelease: async () => lycheeRelease('v1.2.3'),
      }),
    ).resolves.toMatchObject({ drift: true })
  })

  it('reports no Lychee drift when version and both digests match', async () => {
    const root = temporaryDirectory()
    writeLycheeState(root, 'v1.2.3')

    await expect(
      detectLycheeDrift(lycheeUnit(), root, {
        fetchLatestLycheeRelease: async () =>
          lycheeRelease('v1.2.3', { amd64: 'a', arm64: 'b' }),
      }),
    ).resolves.toMatchObject({ drift: false })
  })

  it('fails closed when a Lychee asset has no published digest', async () => {
    const root = temporaryDirectory()
    writeLycheeState(root, 'v1.2.3')
    const release = lycheeRelease('v1.2.4')
    delete release.assets[1].digest

    await expect(
      detectLycheeDrift(lycheeUnit(), root, {
        fetchLatestLycheeRelease: async () => release,
      }),
    ).rejects.toThrow('did not resolve to a sha256 digest')
  })

  it('requires synchronized Lychee versions', () => {
    const root = temporaryDirectory()
    writeLycheeState(root, 'v1.2.3')
    const workflowPath = path.join(root, '.github/workflows/quality-checks.yml')
    fs.writeFileSync(
      workflowPath,
      fs.readFileSync(workflowPath, 'utf8').replace('v1.2.3', 'v1.2.4'),
    )

    expect(() => readLycheeCurrent(lycheeUnit(), root)).toThrow(
      'versions are not aligned',
    )
  })

  it('requires synchronized Lychee architecture checksums', () => {
    const root = temporaryDirectory()
    writeLycheeState(root, 'v1.2.3')
    const bootstrapPath = path.join(
      root,
      'scripts/azure-dev/templates/bootstrap-host.sh',
    )
    fs.writeFileSync(
      bootstrapPath,
      fs
        .readFileSync(bootstrapPath, 'utf8')
        .replace('a'.repeat(64), 'c'.repeat(64)),
    )

    expect(() => readLycheeCurrent(lycheeUnit(), root)).toThrow(
      'Lychee architecture checksums are not aligned across synchronized installers.',
    )
  })

  it('rejects duplicate Lychee architecture sections', () => {
    const root = temporaryDirectory()
    writeLycheeState(root, 'v1.2.3')
    const dockerfilePath = path.join(root, '.devcontainer/Dockerfile')
    fs.appendFileSync(
      dockerfilePath,
      `\n    amd64) lychee_sha256='${'c'.repeat(64)}' ;;\n`,
    )

    expect(() => readLycheeCurrent(lycheeUnit(), root)).toThrow(
      '.devcontainer/Dockerfile must declare both Lychee architecture checksums.',
    )
  })

  it('rejects Lychee registry paths unsupported by the detector', () => {
    const root = temporaryDirectory()
    writeLycheeState(root, 'v1.2.3')

    expect(() =>
      readLycheeCurrent(
        lycheeUnit({
          paths: [
            '.devcontainer/Dockerfile',
            'scripts/azure-dev/templates/bootstrap-host.sh',
            '.github/workflows/renamed-quality-checks.yml',
          ],
        }),
        root,
      ),
    ).toThrow('registry paths do not match')
  })

  it('rejects a latest Lychee release older than the synchronized state', async () => {
    const root = temporaryDirectory()
    writeLycheeState(root, 'v1.2.3')

    await expect(
      detectLycheeDrift(lycheeUnit(), root, {
        fetchLatestLycheeRelease: async () => lycheeRelease('v1.2.2'),
      }),
    ).rejects.toThrow(
      'Latest supported Lychee release is older than current state.',
    )
  })

  it('stops detection before later units after a failure', async () => {
    const detectImage = vi.fn()
    const detectLychee = vi.fn()
    const detectNpm = vi.fn(async () => {
      throw new Error('registry unavailable')
    })
    await expect(
      detectUnits(
        [{ kind: 'npm-toolchain' }, { kind: 'image-lock' }],
        '/workspace',
        {
          detectImageDrift: detectImage,
          detectLycheeDrift: detectLychee,
          detectNpmDrift: detectNpm,
        },
      ),
    ).rejects.toThrow('registry unavailable')
    expect(detectImage).not.toHaveBeenCalled()
    expect(detectLychee).not.toHaveBeenCalled()
  })
})

describe('issue contract', () => {
  const now = new Date('2026-07-27T12:34:56.000Z')
  const registry = { deferrals: [] }

  it('renders outcome-focused detector fields', () => {
    const body = renderIssueBody(drift(), now)
    expect(body).toContain('<!-- dependency-drift:keycloak -->')
    expect(body).toContain('Maintenance unit: `keycloak`')
    expect(body).toContain('Skill: `resolve-dependency-drift`')
    expect(body).toContain('Detected: `2026-07-27T12:34:56.000Z`')
    expect(body).toContain('## Completion checklist')
  })

  it('formats npm and immutable image state', () => {
    expect(formatState({ version: '12.0.2' })).toBe('npm 12.0.2')
    expect(
      formatState({
        imageId: digest('a'),
        manifestDigest: digest('b'),
        tag: '1.2.3',
      }),
    ).toContain(`image ${digest('a')}`)
    expect(
      formatState({
        checksums: { amd64: 'a'.repeat(64), arm64: 'b'.repeat(64) },
        tool: 'lychee',
        version: 'v1.2.3',
      }),
    ).toContain(`arm64 sha256:${'b'.repeat(64)}`)
  })

  it('renders an actionable Lychee synchronization checklist', () => {
    const body = renderIssueBody(
      {
        available: {
          checksums: { amd64: 'c'.repeat(64), arm64: 'd'.repeat(64) },
          tool: 'lychee',
          version: 'v1.2.4',
        },
        current: {
          checksums: { amd64: 'a'.repeat(64), arm64: 'b'.repeat(64) },
          tool: 'lychee',
          version: 'v1.2.3',
        },
        paths: ['.devcontainer/Dockerfile'],
        skill: 'resolve-dependency-drift',
        unit: 'lychee-toolchain',
      },
      now,
    )

    expect(body).toContain('## Synchronized surfaces')
    expect(body).toContain('`.devcontainer/Dockerfile`')
    expect(body).toContain('both installer versions')
    expect(body).toContain('AMD64 and ARM64 asset checksums')
    expect(body).toContain('full commit SHA')
  })

  it('creates one issue when no marker exists', () => {
    expect(planIssueActions([drift()], [], registry, now)).toEqual([
      expect.objectContaining({
        title: 'Dependency drift: keycloak',
        type: 'create',
        unit: 'keycloak',
      }),
    ])
  })

  it('refreshes an open issue identified by its marker', () => {
    const actions = planIssueActions(
      [drift()],
      [
        {
          body: '<!-- dependency-drift:keycloak -->',
          number: 42,
          state: 'OPEN',
          title: 'renamed manually',
        },
      ],
      registry,
      now,
    )
    expect(actions).toEqual([
      expect.objectContaining({ issue: 42, type: 'edit' }),
    ])
  })

  it('reopens a manually closed issue while drift remains', () => {
    const actions = planIssueActions(
      [drift()],
      [
        {
          body: '<!-- dependency-drift:keycloak -->',
          number: 42,
          state: 'CLOSED',
        },
      ],
      registry,
      now,
    )
    expect(actions.map(action => action.type)).toEqual(['reopen', 'edit'])
  })

  it('closes resolved drift and active reviewed deferrals', () => {
    const issue = {
      body: '<!-- dependency-drift:keycloak -->',
      number: 42,
      state: 'OPEN',
    }
    expect(
      planIssueActions([{ ...drift(), drift: false }], [issue], registry, now),
    ).toEqual([expect.objectContaining({ reason: 'completed', type: 'close' })])
    expect(
      planIssueActions(
        [drift()],
        [issue],
        {
          deferrals: [
            {
              available: '26.8.0',
              expiresOn: '2026-07-28',
              rationale: 'Reviewed compatibility hold.',
              unit: 'keycloak',
            },
          ],
        },
        now,
      ),
    ).toEqual([
      expect.objectContaining({ reason: 'not planned', type: 'close' }),
    ])
  })

  it('does not let a major deferral suppress same-lane drift', () => {
    expect(
      planIssueActions(
        [drift()],
        [],
        {
          deferrals: [
            {
              available: '27.0.0',
              expiresOn: '2026-07-28',
              rationale: 'Reviewed major compatibility hold.',
              unit: 'keycloak',
            },
          ],
        },
        now,
      ),
    ).toEqual([expect.objectContaining({ type: 'create', unit: 'keycloak' })])
  })

  it('resumes issue creation after a deferral expires', () => {
    expect(
      planIssueActions(
        [drift()],
        [],
        {
          deferrals: [
            {
              available: '26.8.0',
              expiresOn: '2026-07-26',
              rationale: 'Reviewed compatibility hold.',
              unit: 'keycloak',
            },
          ],
        },
        now,
      ),
    ).toEqual([expect.objectContaining({ type: 'create', unit: 'keycloak' })])
  })

  it('closes duplicate open markers and keeps one authoritative issue', () => {
    const actions = planIssueActions(
      [drift()],
      [
        {
          body: '<!-- dependency-drift:keycloak -->',
          number: 4,
          state: 'OPEN',
        },
        {
          body: '<!-- dependency-drift:keycloak -->',
          number: 8,
          state: 'OPEN',
        },
      ],
      registry,
      now,
    )
    expect(actions).toEqual([
      expect.objectContaining({ issue: 8, type: 'close' }),
      expect.objectContaining({ issue: 4, type: 'edit' }),
    ])
  })

  it('lists labeled detector issues so the hidden marker remains authoritative', () => {
    const run = vi.fn(() => '[{"number":1}]')
    expect(listDetectorIssues(run)).toEqual([{ number: 1 }])
    expect(run).toHaveBeenCalledWith('gh', [
      'issue',
      'list',
      '--state',
      'all',
      '--label',
      'automation:dependency-drift',
      '--limit',
      '1000',
      '--json',
      'number,state,title,body',
    ])
  })

  it('executes issue edits with all required labels', () => {
    const calls = []
    const run = vi.fn((_command, args) => {
      calls.push(args)
      const bodyFileIndex = args.indexOf('--body-file')
      if (bodyFileIndex !== -1) {
        expect(fs.readFileSync(args[bodyFileIndex + 1], 'utf8')).toBe('body')
      }
      return ''
    })
    const results = executeIssueActions(
      [
        {
          body: 'body',
          title: 'Dependency drift: npm-toolchain',
          type: 'create',
          unit: 'npm-toolchain',
        },
      ],
      run,
    )
    expect(results.created).toEqual(['npm-toolchain'])
    expect(calls[0]).toEqual(
      expect.arrayContaining([
        '--label',
        'automation:dependency-drift,dependencies,ready-for-agent',
      ]),
    )
  })

  it('preserves callback failures when the body directory is already absent', () => {
    const run = vi.fn((_command, args) => {
      const bodyFileIndex = args.indexOf('--body-file')
      fs.rmSync(path.dirname(args[bodyFileIndex + 1]), {
        force: true,
        recursive: true,
      })
      throw new Error('GitHub command failed')
    })

    expect(() =>
      executeIssueActions(
        [
          {
            body: 'body',
            title: 'Dependency drift: npm-toolchain',
            type: 'create',
            unit: 'npm-toolchain',
          },
        ],
        run,
      ),
    ).toThrow('GitHub command failed')
  })

  it('writes the workflow summary through the injected environment', async () => {
    const root = temporaryDirectory()
    const summaryPath = path.join(root, 'summary.md')
    const results = {
      closed: [],
      created: ['npm-toolchain'],
      reopened: [],
      unchanged: [],
      updated: [],
    }

    await expect(
      main(
        ['--unit', 'npm'],
        { GITHUB_STEP_SUMMARY: summaryPath },
        {
          detectNpmDrift: async () => drift('npm-toolchain'),
          executeIssueActions: () => results,
          listDetectorIssues: () => [],
          root: process.cwd(),
          run: vi.fn(),
          validateDependencyMaintenance: () => [],
        },
      ),
    ).resolves.toBe(0)
    expect(fs.readFileSync(summaryPath, 'utf8')).toContain('- npm-toolchain')
  })

  it('does not mutate GitHub when remote detection fails', async () => {
    const run = vi.fn()
    await expect(
      main(
        ['--unit', 'npm'],
        {},
        {
          detectNpmDrift: async () => {
            throw new Error('npm registry failed')
          },
          root: process.cwd(),
          run,
          validateDependencyMaintenance: () => [],
        },
      ),
    ).rejects.toThrow('npm registry failed')
    expect(run).not.toHaveBeenCalled()
  })
})

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
  resolveImageIdentity,
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

function detectorIssue(detection, number, state = 'OPEN', overrides = {}) {
  return {
    body: renderIssueBody(detection, new Date('2026-07-26T12:34:56.000Z')),
    comments: [],
    number,
    state,
    title: 'Original detector title',
    url: `https://github.com/viscalyx/Kravhantering/issues/${number}`,
    ...overrides,
  }
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true })
  }
  vi.restoreAllMocks()
})

describe('dependency drift selection', () => {
  it('selects supported UBI 10 revisions while retaining Node 24 and digest refresh channels', () => {
    const config = IMAGE_CONFIGS['ubi-node-builder']
    const tags = [
      'latest',
      '10.1',
      '10.2-1788245909',
      '10.2-source',
      '10.3-1789000000-source',
      '11.0-1789000000',
    ]
    expect(selectAvailableVersion(config, tags, '10.1').tag).toBe(
      '10.2-1788245909',
    )
    expect(selectAvailableVersion(config, tags, 'latest').tag).toBe('latest')
    expect(() => selectAvailableVersion(config, tags, '24')).toThrow(
      'unsupported',
    )
  })

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
    expect(parseNginxTag('1.29.4-alpine3.24')).toMatchObject({ minor: 29 })
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
        ['1.28.0-alpine3.24', 'mainline'],
        '1.29.4-alpine3.24',
      ).tag,
    ).toBe('1.29.4-alpine3.24')
  })

  it('selects nginx and Alpine updates within the full-image lane', () => {
    expect(parseNginxTag('1.31.6-alpine3.24')).toMatchObject({
      major: 1,
      minor: 31,
      patch: 6,
      alpineMajor: 3,
      alpineMinor: 24,
    })
    expect(
      selectAvailableVersion(
        IMAGE_CONFIGS.nginx,
        ['1.31.6-alpine3.25', '1.31.7-alpine3.24', '1.31.8-alpine3.24-slim'],
        '1.31.6-alpine3.24',
      ).tag,
    ).toBe('1.31.7-alpine3.24')
    expect(
      selectAvailableVersion(
        IMAGE_CONFIGS.nginx,
        ['1.31.6-alpine3.25', '1.31.6-alpine3.23'],
        '1.31.6-alpine3.24',
      ).tag,
    ).toBe('1.31.6-alpine3.25')
  })

  it('reports a rebuilt nginx tag without advancing the committed lock', async () => {
    const root = temporaryDirectory()
    const current = {
      image: 'docker.io/library/nginx',
      tag: '1.31.6-alpine3.24',
      manifestDigest: digest('a'),
      imageId: digest('b'),
    }
    const lockPath = 'containers/nginx/image.lock.json'
    write(root, lockPath, JSON.stringify(current))
    const result = await detectImageDrift(
      { id: 'nginx', detector: 'nginx', skill: 'resolve-dependency-drift' },
      root,
      {
        listTags: async () => ['1.31.6-alpine3.24'],
        resolveImageIdentity: async () => ({
          manifestDigest: digest('c'),
          imageId: digest('d'),
        }),
      },
    )
    expect(result).toMatchObject({
      drift: true,
      current: {
        tag: '1.31.6-alpine3.24',
        manifestDigest: digest('a'),
        imageId: digest('b'),
      },
      available: {
        tag: '1.31.6-alpine3.24',
        manifestDigest: digest('c'),
        imageId: digest('d'),
      },
    })
    expect(
      JSON.parse(fs.readFileSync(path.join(root, lockPath), 'utf8')),
    ).toEqual(current)
  })

  it('lists Docker Hub tags through registry cursor pagination', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(null, {
          headers: {
            'www-authenticate':
              'Bearer realm="https://auth.docker.io/token",service="registry.docker.io",scope="repository:library/nginx:pull"',
          },
          status: 401,
        }),
      )
      .mockResolvedValueOnce(Response.json({ token: 'registry-token' }))
      .mockResolvedValueOnce(
        Response.json(
          { name: 'library/nginx', tags: ['1.29.4-alpine3.24'] },
          {
            headers: {
              link: '</v2/library/nginx/tags/list?last=1.29.4-alpine3.24&n=1000>; rel="next"',
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          headers: {
            'www-authenticate':
              'Bearer realm="https://auth.docker.io/token",service="registry.docker.io",scope="repository:library/nginx:pull"',
          },
          status: 401,
        }),
      )
      .mockResolvedValueOnce(Response.json({ token: 'registry-token' }))
      .mockResolvedValueOnce(
        Response.json({
          name: 'library/nginx',
          tags: ['1.30.0-alpine3.24'],
        }),
      )

    await expect(IMAGE_CONFIGS.nginx.listTags()).resolves.toEqual([
      '1.29.4-alpine3.24',
      '1.30.0-alpine3.24',
    ])
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://registry-1.docker.io/v2/library/nginx/tags/list?n=1000',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer registry-token',
        }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'https://registry-1.docker.io/v2/library/nginx/tags/list?last=1.29.4-alpine3.24&n=1000',
      expect.any(Object),
    )
  })
})

describe('drift detection', () => {
  it.each([
    [() => [new Response('registry unavailable', { status: 503 })], '503'],
    [() => [new Response('', { status: 401 })], '401'],
    [
      () => [
        new Response('', {
          status: 401,
          headers: { 'www-authenticate': 'Basic realm=""' },
        }),
      ],
      '401',
    ],
    [
      () => [
        new Response('', {
          status: 401,
          headers: {
            'www-authenticate':
              'Bearer realm="https://registry.access.redhat.com/token"',
          },
        }),
        new Response('', { status: 403 }),
      ],
      '401',
    ],
    [
      () => [new Response(JSON.stringify({ config: { digest: digest('a') } }))],
      'manifest digest did not resolve',
    ],
    [
      () => [
        new Response(
          JSON.stringify({
            manifests: [
              {
                digest: digest('b'),
                platform: { os: 'linux', architecture: 'amd64' },
              },
            ],
          }),
          { headers: { 'docker-content-digest': digest('a') } },
        ),
        new Response('{}'),
      ],
      'platform manifest has no config',
    ],
  ])(
    'fails closed when a public registry cannot supply an immutable usable image',
    async (responses, message) => {
      const replies = responses()
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
        replies.shift(),
      )
      await expect(
        resolveImageIdentity(IMAGE_CONFIGS['ubi-node-runtime'], 'latest'),
      ).rejects.toThrow(message)
    },
  )

  it('keeps the Docker Official Node platform identity when an index is published', async () => {
    const replies = [
      new Response(
        JSON.stringify({
          manifests: [
            {
              digest: digest('b'),
              platform: { os: 'linux', architecture: 'amd64' },
            },
          ],
        }),
        { headers: { 'docker-content-digest': digest('a') } },
      ),
      new Response(JSON.stringify({ config: { digest: digest('c') } })),
    ]
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      replies.shift(),
    )
    expect(
      await resolveImageIdentity(IMAGE_CONFIGS.node, '24-trixie-slim'),
    ).toEqual({ manifestDigest: digest('b'), imageId: digest('c') })
  })

  it.each([
    'FROM node:24-trixie-slim\n',
    `FROM node:25-trixie-slim@${digest('a')}\n`,
  ])('requires supported immutable Node inputs', source => {
    const root = temporaryDirectory()
    write(root, 'Dockerfile', source)
    expect(() =>
      readNodeCurrent({ ...IMAGE_CONFIGS.node, paths: ['Dockerfile'] }, root),
    ).toThrow('must pin a supported tag and digest')
    expect(() =>
      readNodeCurrent({ ...IMAGE_CONFIGS.node, paths: [] }, root),
    ).toThrow('not owned')
  })

  it('fails when no Docker Official Node input remains for an active detector', () => {
    expect(() =>
      readNodeCurrent(IMAGE_CONFIGS.node, temporaryDirectory()),
    ).toThrow('No production Node')
  })

  it('resolves the public UBI index identity and AMD64 image through an anonymous challenge', async () => {
    const config = IMAGE_CONFIGS['ubi-node-runtime']
    const replies = [
      new Response('', {
        status: 401,
        headers: {
          'www-authenticate':
            'Bearer realm="https://registry.access.redhat.com/token",service="registry",scope="repository:ubi10/nodejs-24-minimal:pull"',
        },
      }),
      new Response(JSON.stringify({ access_token: 'anonymous-token' })),
      new Response(
        JSON.stringify({
          manifests: [
            {
              digest: digest('d'),
              platform: { os: 'linux', architecture: 'arm64' },
            },
            {
              digest: digest('b'),
              platform: { os: 'linux', architecture: 'amd64' },
            },
          ],
        }),
        { headers: { 'docker-content-digest': digest('a') } },
      ),
      new Response(JSON.stringify({ config: { digest: digest('c') } }), {
        headers: { 'docker-content-digest': digest('b') },
      }),
    ]
    const requests = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
      requests.push({
        url: String(url),
        authorization: options?.headers?.Authorization,
      })
      return replies.shift()
    })
    expect(await resolveImageIdentity(config, 'latest')).toEqual({
      manifestDigest: digest('a'),
      imageId: digest('c'),
    })
    expect(requests).toEqual([
      {
        url: 'https://registry.access.redhat.com/v2/ubi10/nodejs-24-minimal/manifests/latest',
        authorization: undefined,
      },
      {
        url: 'https://registry.access.redhat.com/token?service=registry&scope=repository%3Aubi10%2Fnodejs-24-minimal%3Apull',
        authorization: undefined,
      },
      {
        url: 'https://registry.access.redhat.com/v2/ubi10/nodejs-24-minimal/manifests/latest',
        authorization: 'Bearer anonymous-token',
      },
      {
        url: `https://registry.access.redhat.com/v2/ubi10/nodejs-24-minimal/manifests/${digest('b')}`,
        authorization: undefined,
      },
    ])
  })

  it.each([
    [{ manifests: [] }, 'does not include linux/amd64'],
    [{ manifests: [{ digest: digest('a') }] }, 'does not include linux/amd64'],
    [{}, 'manifest has no config'],
    [{ config: { digest: 'invalid' } }, 'did not resolve to a sha256 digest'],
  ])('rejects unusable public UBI identities', async (manifest, message) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(manifest), {
        headers: { 'docker-content-digest': digest('a') },
      }),
    )
    await expect(
      resolveImageIdentity(IMAGE_CONFIGS['ubi-node-builder'], 'latest'),
    ).rejects.toThrow(message)
  })

  it('detects supported numeric UBI revision updates from synchronized ARG inputs', async () => {
    const root = temporaryDirectory()
    const image = 'registry.access.redhat.com/ubi10/nodejs-24'
    const unit = {
      id: 'ubi-node-builder',
      detector: 'ubi-node-builder',
      image,
      paths: ['containers/app/Dockerfile'],
      selectedReference: `${image}:10.1@${digest('a')}`,
      skill: 'resolve-dependency-drift',
    }
    write(
      root,
      unit.paths[0],
      `ARG BASE=${unit.selectedReference}\nFROM $BASE AS build\n`,
    )
    const replies = [
      new Response(JSON.stringify({ tags: ['latest', '10.1', null] }), {
        headers: {
          link: '</v2/ubi10/nodejs-24/tags/list?last=10.1>; rel="next"',
        },
      }),
      new Response(
        JSON.stringify({ tags: ['10.2-1788245909', '10.2-source'] }),
      ),
      new Response(JSON.stringify({ config: { digest: digest('c') } }), {
        headers: { 'docker-content-digest': digest('b') },
      }),
    ]
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      replies.shift(),
    )
    expect(await detectImageDrift(unit, root)).toMatchObject({
      drift: true,
      current: { tag: '10.1', manifestDigest: digest('a') },
      available: { tag: '10.2-1788245909', manifestDigest: digest('b') },
    })
    write(root, unit.paths[0], `FROM ${image}:10.1@${digest('d')}\n`)
    await expect(detectImageDrift(unit, root)).rejects.toThrow('not aligned')
    write(root, unit.paths[0], `FROM ${unit.selectedReference}\n`)
    write(
      root,
      'containers/unowned/Dockerfile',
      `FROM ${unit.selectedReference}\n`,
    )
    await expect(detectImageDrift(unit, root)).rejects.toThrow('unowned')
  })

  it('detects independent UBI role digest drift anonymously before adoption', async () => {
    const root = temporaryDirectory()
    const units = ['builder', 'runtime'].map(role => ({
      id: `ubi-node-${role}`,
      detector: `ubi-node-${role}`,
      kind: 'dockerfile-image',
      image: `registry.access.redhat.com/ubi10/nodejs-24${role === 'runtime' ? '-minimal' : ''}`,
      selectedReference: `registry.access.redhat.com/ubi10/nodejs-24${role === 'runtime' ? '-minimal' : ''}:latest@${digest('a')}`,
      paths: ['containers/app/Dockerfile'],
      skill: 'resolve-dependency-drift',
    }))
    const requests = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
      requests.push({
        url: String(url),
        authorization: options?.headers?.Authorization,
      })
      if (String(url).includes('/tags/list'))
        return new Response(
          JSON.stringify({
            tags: ['latest', '10.2-1788245909', '10.2-source'],
          }),
        )
      return new Response(JSON.stringify({ config: { digest: digest('c') } }), {
        headers: {
          'docker-content-digest': String(url).includes('minimal')
            ? digest('a')
            : digest('b'),
        },
      })
    })
    const results = await detectUnits(units, root)
    expect(results.map(result => [result.unit, result.drift])).toEqual([
      ['ubi-node-builder', true],
      ['ubi-node-runtime', false],
    ])
    expect(results[0].available).toEqual({
      tag: 'latest',
      manifestDigest: digest('b'),
      imageId: digest('c'),
    })
    expect(requests).toEqual([
      {
        url: 'https://registry.access.redhat.com/v2/ubi10/nodejs-24/tags/list?n=1000',
        authorization: undefined,
      },
      {
        url: 'https://registry.access.redhat.com/v2/ubi10/nodejs-24/manifests/latest',
        authorization: undefined,
      },
      {
        url: 'https://registry.access.redhat.com/v2/ubi10/nodejs-24-minimal/tags/list?n=1000',
        authorization: undefined,
      },
      {
        url: 'https://registry.access.redhat.com/v2/ubi10/nodejs-24-minimal/manifests/latest',
        authorization: undefined,
      },
    ])
  })

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
        paths: IMAGE_CONFIGS.node.paths,
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

  it('keeps remaining Node references discoverable through ARGs during incremental adoption', async () => {
    const root = temporaryDirectory()
    const paths = ['containers/hsa-mtls-topology/Dockerfile']
    write(
      root,
      paths[0],
      `ARG NODE_IMAGE=node:24-trixie-slim@${digest('a')}\nFROM $NODE_IMAGE AS runtime\n`,
    )
    const result = await detectImageDrift(
      {
        detector: 'node',
        id: 'production-node',
        paths,
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
    expect(result.current).toEqual({
      imageId: null,
      manifestDigest: digest('a'),
      tag: '24-trixie-slim',
    })
    expect(result.drift).toBe(true)
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
  it('reconciles UBI roles independently with target deduplication and fresh issues after closure or expiry', () => {
    const now = new Date('2026-09-11T12:00:00Z')
    const builder = {
      ...drift('ubi-node-builder'),
      paths: [
        '.github/dependency-maintenance.json',
        'containers/app/Dockerfile',
      ],
    }
    builder.current.tag = 'latest'
    builder.available.tag = 'latest'
    const runtime = { ...builder, unit: 'ubi-node-runtime' }
    const issues = [
      detectorIssue(builder, 1),
      detectorIssue(builder, 2),
      detectorIssue(runtime, 3, 'CLOSED'),
    ]
    const actions = planIssueActions([builder, runtime], issues, {}, now)
    expect(
      actions.map(({ type, unit, issue }) => ({ type, unit, issue })),
    ).toEqual([
      { type: 'close', unit: 'ubi-node-builder', issue: 2 },
      { type: 'create', unit: 'ubi-node-runtime', issue: undefined },
    ])
    expect(actions[1].body).toContain('`resolve-dependency-drift`')
    expect(actions[1].body).toContain('`containers/app/Dockerfile`')
    const registry = {
      deferrals: [
        {
          unit: builder.unit,
          available: 'latest',
          expiresOn: '2026-09-12',
          rationale: 'Reviewed compatibility investigation',
        },
      ],
    }
    expect(
      planIssueActions([builder], [issues[0]], registry, now)[0],
    ).toMatchObject({ type: 'close', reason: 'not planned' })
    expect(
      planIssueActions(
        [builder],
        [{ ...issues[0], state: 'CLOSED' }],
        registry,
        new Date('2026-09-13T12:00:00Z'),
      )[0],
    ).toMatchObject({ type: 'create', unit: builder.unit })
    const newTarget = {
      ...builder,
      available: { ...builder.available, manifestDigest: digest('f') },
    }
    expect(
      planIssueActions([newTarget], [issues[0]], {}, now)[0],
    ).toMatchObject({
      type: 'create',
      supersedes: [{ issue: 1, url: issues[0].url }],
    })
  })

  const now = new Date('2026-07-27T12:34:56.000Z')
  const registry = { deferrals: [] }

  it('renders outcome-focused detector fields', () => {
    const body = renderIssueBody(drift(), now)
    expect(body).toMatch(
      /^<!-- dependency-drift-metadata:v1:[A-Za-z0-9_-]+ -->/u,
    )
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
        title: 'Dependency drift: keycloak → 26.8.0 @ sha256:cccccccccccc',
        type: 'create',
        unit: 'keycloak',
      }),
    ])
  })

  it('performs no mutation for an identical later scan', () => {
    const detection = drift()
    expect(
      planIssueActions(
        [detection],
        [detectorIssue(detection, 42)],
        registry,
        now,
      ),
    ).toEqual([{ type: 'unchanged', unit: 'keycloak' }])
  })

  it('creates a fresh issue after unresolved drift is manually closed', () => {
    const detection = drift()
    expect(
      planIssueActions(
        [detection],
        [detectorIssue(detection, 42, 'CLOSED')],
        registry,
        now,
      ),
    ).toEqual([
      expect.objectContaining({
        title: 'Dependency drift: keycloak → 26.8.0 @ sha256:cccccccccccc',
        type: 'create',
      }),
    ])
  })

  it('does not mutate a closed issue when creating its replacement', () => {
    const detection = drift()
    const actions = planIssueActions(
      [detection],
      [detectorIssue(detection, 42, 'CLOSED')],
      registry,
      now,
    )
    expect(actions.some(action => action.issue === 42)).toBe(false)
  })

  it('comments once when current state changes for the same target', () => {
    const initial = drift()
    const changed = {
      ...initial,
      current: {
        imageId: digest('f'),
        manifestDigest: digest('a'),
        tag: '26.7.1',
      },
    }
    const issue = detectorIssue(initial, 42)
    const actions = planIssueActions([changed], [issue], registry, now)

    expect(actions).toEqual([
      expect.objectContaining({
        issue: 42,
        type: 'comment',
        unit: 'keycloak',
      }),
    ])
    expect(actions[0].body).toContain('2026-07-27T12:34:56.000Z')
    expect(actions[0].body).toContain(
      `Previous snapshot: \`${formatState(initial.current)}\``,
    )
    expect(actions[0].body).toContain(
      `New snapshot: \`${formatState(changed.current)}\``,
    )

    expect(
      planIssueActions(
        [changed],
        [{ ...issue, comments: [{ body: actions[0].body }] }],
        registry,
        now,
      ),
    ).toEqual([{ type: 'unchanged', unit: 'keycloak' }])
  })

  it('creates a new target issue before superseding the active issue', () => {
    const initial = drift()
    const nextTarget = {
      ...initial,
      available: {
        imageId: digest('1'),
        manifestDigest: digest('2'),
        tag: '26.9.0',
      },
    }

    expect(
      planIssueActions(
        [nextTarget],
        [detectorIssue(initial, 42)],
        registry,
        now,
      ),
    ).toEqual([
      expect.objectContaining({
        supersedes: [
          {
            issue: 42,
            url: 'https://github.com/viscalyx/Kravhantering/issues/42',
          },
        ],
        title: 'Dependency drift: keycloak → 26.9.0 @ sha256:222222222222',
        type: 'create',
      }),
    ])
  })

  it('uses immutable digest data to distinguish a republished image target', () => {
    const initial = drift()
    const republished = {
      ...initial,
      available: {
        ...initial.available,
        imageId: digest('1'),
        manifestDigest: digest('2'),
      },
    }

    const [action] = planIssueActions(
      [republished],
      [detectorIssue(initial, 42)],
      registry,
      now,
    )
    expect(action).toEqual(
      expect.objectContaining({
        supersedes: [expect.objectContaining({ issue: 42 })],
        title: 'Dependency drift: keycloak → 26.8.0 @ sha256:222222222222',
        type: 'create',
      }),
    )
  })

  it('distinguishes Lychee checksum-only targets in metadata and title', () => {
    const initial = {
      available: {
        checksums: { amd64: 'a'.repeat(64), arm64: 'b'.repeat(64) },
        tool: 'lychee',
        version: 'v1.2.4',
      },
      current: {
        checksums: { amd64: 'c'.repeat(64), arm64: 'd'.repeat(64) },
        tool: 'lychee',
        version: 'v1.2.3',
      },
      drift: true,
      skill: 'resolve-dependency-drift',
      unit: 'lychee-toolchain',
    }
    const republished = {
      ...initial,
      available: {
        ...initial.available,
        checksums: { ...initial.available.checksums, arm64: 'e'.repeat(64) },
      },
    }
    const initialAction = planIssueActions([initial], [], registry, now)[0]
    const replacementAction = planIssueActions(
      [republished],
      [detectorIssue(initial, 42)],
      registry,
      now,
    )[0]

    expect(initialAction.title).toMatch(
      /^Dependency drift: lychee-toolchain → v1\.2\.4 @ sha256:[a-f0-9]{12}$/u,
    )
    expect(replacementAction).toEqual(
      expect.objectContaining({
        supersedes: [expect.objectContaining({ issue: 42 })],
        type: 'create',
      }),
    )
    expect(replacementAction.title).not.toBe(initialAction.title)
  })

  it('uses the npm version as the complete target identity in the title', () => {
    const npmDrift = {
      available: { version: '12.0.3' },
      current: { version: '12.0.2' },
      drift: true,
      skill: 'resolve-dependency-drift',
      unit: 'npm-toolchain',
    }
    expect(planIssueActions([npmDrift], [], registry, now)[0].title).toBe(
      'Dependency drift: npm-toolchain → 12.0.3',
    )
  })

  it('comments with the resolution before closing as completed', () => {
    const initial = drift()
    const resolved = {
      ...initial,
      current: initial.available,
      drift: false,
    }
    const [action] = planIssueActions(
      [resolved],
      [detectorIssue(initial, 42)],
      registry,
      now,
    )

    expect(action).toEqual(
      expect.objectContaining({
        issue: 42,
        reason: 'completed',
        type: 'close',
      }),
    )
    expect(action.comment).toContain('Dependency drift resolved')
    expect(action.comment).toContain('2026-07-27T12:34:56.000Z')
    expect(action.comment).toContain(formatState(resolved.current))
  })

  it('comments with reviewed deferral details before closing as not planned', () => {
    const detection = drift()
    const [action] = planIssueActions(
      [detection],
      [detectorIssue(detection, 42)],
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
    )

    expect(action).toEqual(
      expect.objectContaining({
        issue: 42,
        reason: 'not planned',
        type: 'close',
      }),
    )
    expect(action.comment).toContain('Reviewed compatibility hold.')
    expect(action.comment).toContain('2026-07-28')
    expect(action.comment).toContain(formatState(detection.available))
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
    const detection = drift()
    expect(
      planIssueActions(
        [detection],
        [detectorIssue(detection, 42, 'CLOSED')],
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

  it('retains the oldest current-target issue and closes other active issues', () => {
    const current = drift()
    const previousTarget = {
      ...current,
      available: {
        imageId: digest('8'),
        manifestDigest: digest('9'),
        tag: '26.7.5',
      },
    }
    const actions = planIssueActions(
      [current],
      [
        detectorIssue(previousTarget, 4),
        detectorIssue(current, 8),
        detectorIssue(current, 12),
      ],
      registry,
      now,
    )

    expect(actions.map(action => [action.type, action.issue])).toEqual([
      ['comment', 8],
      ['supersede', 4],
      ['close', 12],
    ])
    expect(actions[0].body).toContain(
      'https://github.com/viscalyx/Kravhantering/issues/4',
    )
    expect(actions[1].comment).toContain(
      'https://github.com/viscalyx/Kravhantering/issues/8',
    )
    expect(actions[2].comment).toContain('duplicate of #8')
  })

  it('resumes supersession without repeating completed cross-links', () => {
    const current = drift()
    const previousTarget = {
      ...current,
      available: {
        imageId: digest('8'),
        manifestDigest: digest('9'),
        tag: '26.7.5',
      },
    }
    const currentIssue = detectorIssue(current, 8)
    const previousIssue = detectorIssue(previousTarget, 4)
    const firstPlan = planIssueActions(
      [current],
      [previousIssue, currentIssue],
      registry,
      now,
    )

    const resumedPlan = planIssueActions(
      [current],
      [
        { ...previousIssue, comments: [{ body: firstPlan[1].comment }] },
        { ...currentIssue, comments: [{ body: firstPlan[0].body }] },
      ],
      registry,
      now,
    )
    expect(resumedPlan).toEqual([
      expect.objectContaining({
        comment: undefined,
        issue: 4,
        type: 'supersede',
      }),
    ])

    const run = vi.fn(() => '')
    const results = executeIssueActions(resumedPlan, run)
    expect(run).toHaveBeenCalledWith(
      'gh',
      ['issue', 'close', '4', '--reason', 'not planned'],
      { stdio: 'inherit' },
    )
    expect(results.commented).toEqual([])
    expect(results.superseded).toEqual(['keycloak (#4)'])
  })

  it('lists labeled detector issues so the hidden marker remains authoritative', () => {
    const run = vi
      .fn()
      .mockReturnValueOnce('[{"number":1,"state":"OPEN"}]')
      .mockReturnValueOnce('[[{"body":"first page"}],[{"body":"second page"}]]')
    expect(listDetectorIssues(run)).toEqual([
      {
        comments: [{ body: 'first page' }, { body: 'second page' }],
        number: 1,
        state: 'OPEN',
      },
    ])
    expect(run).toHaveBeenNthCalledWith(1, 'gh', [
      'issue',
      'list',
      '--state',
      'all',
      '--label',
      'automation:dependency-drift',
      '--limit',
      '1000',
      '--json',
      'number,state,title,body,url',
    ])
    expect(run).toHaveBeenNthCalledWith(2, 'gh', [
      'api',
      '--paginate',
      '--slurp',
      'repos/{owner}/{repo}/issues/1/comments?per_page=100',
    ])
  })

  it('creates issues with all required labels', () => {
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

  it('comments before closing an issue', () => {
    const calls = []
    const commentBodies = []
    const run = vi.fn((_command, args) => {
      calls.push(args)
      const bodyFileIndex = args.indexOf('--body-file')
      if (bodyFileIndex !== -1) {
        commentBodies.push(fs.readFileSync(args[bodyFileIndex + 1], 'utf8'))
      }
      return ''
    })

    const results = executeIssueActions(
      [
        {
          comment: 'Resolution details',
          issue: 42,
          reason: 'completed',
          type: 'close',
          unit: 'keycloak',
        },
      ],
      run,
    )

    expect(calls.map(args => args.slice(0, 2))).toEqual([
      ['issue', 'comment'],
      ['issue', 'close'],
    ])
    expect(commentBodies).toEqual(['Resolution details'])
    expect(results.commented).toEqual(['keycloak (#42)'])
    expect(results.closed).toEqual(['keycloak (#42)'])
  })

  it('creates and cross-links a replacement before superseding', () => {
    const calls = []
    const commentBodies = []
    const replacementUrl =
      'https://github.com/viscalyx/Kravhantering/issues/1206'
    const run = vi.fn((_command, args) => {
      calls.push(args)
      const bodyFileIndex = args.indexOf('--body-file')
      if (bodyFileIndex !== -1 && args[1] === 'comment') {
        commentBodies.push(fs.readFileSync(args[bodyFileIndex + 1], 'utf8'))
      }
      return args[1] === 'create' ? `${replacementUrl}\n` : ''
    })

    const results = executeIssueActions(
      [
        {
          body: 'New immutable issue body',
          supersedes: [
            {
              issue: 42,
              url: 'https://github.com/viscalyx/Kravhantering/issues/42',
            },
          ],
          title: 'Dependency drift: keycloak → 26.9.0',
          type: 'create',
          unit: 'keycloak',
        },
      ],
      run,
    )

    expect(calls.map(args => args.slice(0, 3))).toEqual([
      ['issue', 'create', '--title'],
      ['issue', 'comment', replacementUrl],
      ['issue', 'comment', '42'],
      ['issue', 'close', '42'],
    ])
    expect(commentBodies[0]).toContain(
      'https://github.com/viscalyx/Kravhantering/issues/42',
    )
    expect(commentBodies[1]).toContain(replacementUrl)
    expect(results.superseded).toEqual(['keycloak (#42)'])
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
      commented: [],
      created: ['npm-toolchain'],
      superseded: [],
      unchanged: [],
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
    const summary = fs.readFileSync(summaryPath, 'utf8')
    expect(summary).toContain('## Created issues')
    expect(summary).toContain('## Comments added')
    expect(summary).toContain('## Superseded issues')
    expect(summary).toContain('## Closed issues')
    expect(summary).toContain('## No action')
    expect(summary).toContain('- npm-toolchain')
  })

  it('does not perform a GitHub mutation for an identical scan', async () => {
    const detection = drift('npm-toolchain')
    const run = vi.fn()
    const execute = vi.fn(() => ({
      closed: [],
      commented: [],
      created: [],
      superseded: [],
      unchanged: ['npm-toolchain'],
    }))

    await expect(
      main(
        ['--unit', 'npm'],
        {},
        {
          detectNpmDrift: async () => detection,
          executeIssueActions: execute,
          listDetectorIssues: () => [detectorIssue(detection, 42)],
          root: process.cwd(),
          run,
          validateDependencyMaintenance: () => [],
        },
      ),
    ).resolves.toBe(0)
    expect(run).not.toHaveBeenCalled()
    expect(execute).toHaveBeenCalledWith(
      [{ type: 'unchanged', unit: 'npm-toolchain' }],
      run,
    )
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

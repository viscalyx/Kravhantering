import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cleanupSourceRequest,
  createCleanupSourceLock,
  selectCleanupSourceRelease,
} from '../release/cleanup-source.mjs'
import { prepareCleanupSource } from '../release/prepare-cleanup-source.mjs'

const releases = [
  { tagName: 'v1.0.0', publishedAt: '2026-08-01T00:00:00Z', isDraft: false },
  {
    tagName: 'v1.1.0-preview.1',
    publishedAt: '2026-08-03T00:00:00Z',
    isDraft: false,
  },
  { tagName: 'v1.0.1', publishedAt: '2026-08-02T00:00:00Z', isDraft: false },
  { tagName: 'v1.2.0', publishedAt: '2026-08-04T00:00:00Z', isDraft: true },
]

describe('cleanup source release selection', () => {
  it('reports the preparation failure cause and exits unsuccessfully', () => {
    const result = spawnSync(
      process.execPath,
      [
        path.resolve(
          path.dirname(fileURLToPath(import.meta.url)),
          '../release/prepare-cleanup-source.mjs',
        ),
      ],
      { encoding: 'utf8', timeout: 10_000 },
    )

    expect(result.error).toBeUndefined()
    expect(result.status).toBe(1)
    expect(result.stderr).toContain(
      'Cleanup source release preparation failed; no compatibility approval was produced.',
    )
    expect(result.stderr).toContain(
      'Usage: prepare-cleanup-source.mjs <owner/repo> <target-tag> <output-dir> [source-tag]',
    )
  })

  it('defaults to the preceding published release without a maintained release list', () => {
    expect(
      selectCleanupSourceRelease(releases, 'v1.1.0-preview.2').tagName,
    ).toBe('v1.1.0-preview.1')
    expect(selectCleanupSourceRelease(releases, 'v1.2.0').tagName).toBe(
      'v1.1.0-preview.1',
    )
    expect(
      selectCleanupSourceRelease(releases, 'v1.1.0-preview.1').tagName,
    ).toBe('v1.0.1')
  })
})

describe('generated cleanup source lock', () => {
  const digest = 'a'.repeat(64)
  const commitSha = 'b'.repeat(40)
  const selected = releases[0]
  function fixture() {
    return {
      manifest: {
        version: '1.0.0',
        commitSha,
        sourceRelease: { tag: 'v1.0.0' },
        database: { expectedSchemaVersion: 'Source123' },
        images: { dbJob: `registry.example/db@sha256:${digest}` },
        imageIds: { dbJob: `sha256:${digest}` },
      },
      stackLock: {
        services: [
          {
            name: 'db-job',
            image: 'registry.example/db',
            imageId: `sha256:${digest}`,
            manifestDigest: `sha256:${digest}`,
          },
        ],
      },
      selected,
      commitSha,
      archiveSha256: digest,
      stackLockSha256: digest,
    }
  }
  it('generates a source lock from authenticated release metadata instead of migration inventories', () => {
    expect(createCleanupSourceLock(fixture())).toEqual({
      release: '1.0.0',
      schemaVersion: 'Source123',
      archiveSha256: digest,
      stackLockSha256: digest,
    })
  })
  it.each([
    'release',
    'commit',
    'tag',
    'schema',
    'image',
    'digest',
    'missing-image',
  ])('rejects inconsistent %s identity', reason => {
    const input = fixture()
    if (reason === 'release') input.manifest.version = '2.0.0'
    if (reason === 'commit') input.manifest.commitSha = 'c'.repeat(40)
    if (reason === 'tag') input.manifest.sourceRelease.tag = 'v2.0.0'
    if (reason === 'schema')
      input.manifest.database.expectedSchemaVersion = '../unsafe'
    if (reason === 'image')
      input.manifest.imageIds.dbJob = `sha256:${'c'.repeat(64)}`
    if (reason === 'digest') input.archiveSha256 = 'bad'
    if (reason === 'missing-image') input.stackLock.services = []
    expect(() => createCleanupSourceLock(input)).toThrow()
  })
  it('accepts a deliberate older published source and rejects drafts, current or unknown releases', () => {
    expect(
      selectCleanupSourceRelease(releases, 'v1.1.0-preview.2', 'v1.0.0')
        .tagName,
    ).toBe('v1.0.0')
    for (const override of ['v1.2.0', 'v0.0.0', 'v1.0.0']) {
      expect(() =>
        selectCleanupSourceRelease(releases, 'v1.0.0', override),
      ).toThrow('published')
    }
    expect(() => selectCleanupSourceRelease([], 'v1.0.0')).toThrow('published')
    expect(() =>
      selectCleanupSourceRelease(
        [{ tagName: '--unsafe', publishedAt: '2026-08-01T00:00:00Z' }],
        'v1.0.0',
      ),
    ).toThrow('published')
    expect(() =>
      selectCleanupSourceRelease(
        [{ tagName: 'v1.0.0', publishedAt: null }],
        'v2.0.0',
      ),
    ).toThrow('published')
  })
  it('validates command inputs before invoking release tooling', () => {
    expect(
      cleanupSourceRequest(['owner/repo', 'v2.0.0', '/tmp/output']),
    ).toEqual({
      repository: 'owner/repo',
      targetTag: 'v2.0.0',
      outputDir: '/tmp/output',
      sourceTag: undefined,
    })
    expect(
      cleanupSourceRequest(['owner/repo', 'v2.0.0', '/tmp/output', 'v1.0.0'])
        .sourceTag,
    ).toBe('v1.0.0')
    for (const args of [
      [],
      ['--unsafe', 'v2.0.0', '/tmp/out'],
      ['owner/repo', '../unsafe', '/tmp/out'],
      ['owner/repo', 'v2.0.0', ''],
      ['owner/repo', 'v2.0.0', '/tmp/out', '--unsafe'],
      ['owner/repo', 'v2.0.0', '/tmp/out', 'v1.0.0', 'extra'],
    ]) {
      expect(() => cleanupSourceRequest(args)).toThrow('Usage')
    }
  })
})

const roots = []
afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true })
})

describe('cleanup source preparation', () => {
  it.each([false, true])(
    'publishes a generated source lock only after successful provenance verification (rejected=%s)',
    rejected => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cleanup-source-'))
      roots.push(root)
      const digest = 'a'.repeat(64)
      const commitSha = 'b'.repeat(40)
      const commands = []
      const verify = vi.fn(() => {
        if (rejected) throw new Error('untrusted archive')
      })
      const run = (command, args) => {
        commands.push({ command, args })
        if (command === 'curl') {
          const url = args.at(-1)
          expect(args[0]).toBe('--disable')
          if (url.includes('/releases?'))
            return JSON.stringify(
              releases.map(release => ({
                tag_name: release.tagName,
                published_at: release.publishedAt,
                draft: release.isDraft,
              })),
            )
          if (url.includes('/commits/'))
            return JSON.stringify({ sha: commitSha })
          fs.writeFileSync(args[args.indexOf('--output') + 1], 'abc')
          return ''
        }
        if (command === 'gh') {
          expect(args).toEqual(['attestation', 'trusted-root'])
          return 'trusted roots'
        }
        expect(command).toBe('tar')
        expect(verify).toHaveBeenCalledOnce()
        const bundle = path.join(
          args.at(-1),
          'kravhantering-production-deploy-1.0.0',
        )
        fs.mkdirSync(bundle)
        fs.writeFileSync(
          path.join(bundle, 'DEPLOYMENT-MANIFEST.json'),
          JSON.stringify({
            version: '1.0.0',
            commitSha,
            sourceRelease: { tag: 'v1.0.0' },
            database: { expectedSchemaVersion: 'Source123' },
            images: { dbJob: `registry.example/db@sha256:${digest}` },
            imageIds: { dbJob: `sha256:${digest}` },
          }),
        )
        fs.writeFileSync(
          path.join(bundle, 'container-stack.lock.json'),
          JSON.stringify({
            services: [
              {
                name: 'db-job',
                image: 'registry.example/db',
                imageId: `sha256:${digest}`,
                manifestDigest: `sha256:${digest}`,
              },
            ],
          }),
        )
        return ''
      }
      const invoke = () =>
        prepareCleanupSource(['owner/repo', 'v2.0.0', root, 'v1.0.0'], {
          run,
          verify,
        })
      if (rejected) {
        expect(invoke).toThrow('untrusted archive')
        expect(commands.some(command => command.command === 'tar')).toBe(false)
        expect(fs.existsSync(path.join(root, 'cleanup-source.json'))).toBe(
          false,
        )
      } else {
        expect(invoke()).toMatchObject({
          release: '1.0.0',
          schemaVersion: 'Source123',
          archiveSha256:
            'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
        })
        expect(
          JSON.parse(
            fs.readFileSync(
              path.join(root, 'cleanup-source-selection.json'),
              'utf8',
            ),
          ),
        ).toMatchObject({ policy: 'explicit', tag: 'v1.0.0' })
        expect(verify).toHaveBeenCalledWith(
          expect.objectContaining({
            repository: 'owner/repo',
            sourceDigest: commitSha,
            sourceRef: 'refs/tags/v1.0.0',
            releaseTag: 'v1.0.0',
          }),
        )
      }
    },
  )
})

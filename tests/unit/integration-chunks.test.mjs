import { describe, expect, it } from 'vitest'
import {
  buildManifestFromSpecs,
  checkManifestAgainstSpecs,
  createRunPlan,
  formatChunkMemoryLine,
  formatChunkServerLogFinishedLine,
  parseArgs,
  readSystemMemorySnapshot,
  selectChunks,
  shouldIgnoreSpec,
} from '../integration-chunks.mjs'

const fixtureSpecs = [
  'tests/integration/00-report-pdf/authorization-boundaries.spec.ts',
  'tests/integration/00-report-pdf/collaboration-report.spec.ts',
  'tests/integration/admin/statuses.spec.ts',
  'tests/integration/authentication/login.spec.ts',
  'tests/integration/authorization/08-admin.spec.ts',
  'tests/integration/developer-mode/overlay.spec.ts',
  'tests/integration/mcp/seeded-scan.spec.ts',
  'tests/integration/requirements/library.spec.ts',
  'tests/integration/requirements/lifecycle.spec.ts',
]

describe('integration chunk manifest generation', () => {
  it('keeps suite-specific ignore rules explicit', () => {
    expect(
      shouldIgnoreSpec('dev', 'tests/integration/mcp/seeded-scan.spec.ts'),
    ).toBe(true)
    expect(
      shouldIgnoreSpec(
        'prodlike',
        'tests/integration/developer-mode/overlay.spec.ts',
      ),
    ).toBe(true)
    expect(
      shouldIgnoreSpec('prodlike', 'tests/integration/mcp/seeded-scan.spec.ts'),
    ).toBe(false)
  })

  it('generates deterministic chunks and keeps prodlike MCP last', () => {
    const manifest = buildManifestFromSpecs(fixtureSpecs)

    expect(manifest.$comment).toBe(
      'Generated file. Do not manually edit; run npm run test:integration:chunks:generate.',
    )
    expect(manifest.suites.dev.ignoredSpecs).toEqual([
      'tests/integration/mcp/seeded-scan.spec.ts',
    ])
    expect(manifest.suites.prodlike.ignoredSpecs).toEqual([
      'tests/integration/developer-mode/overlay.spec.ts',
    ])
    expect(manifest.suites.prodlike.chunks.at(-1)).toEqual({
      id: 'prodlike-mcp-seeded-scan',
      paths: ['tests/integration/mcp/seeded-scan.spec.ts'],
      specCount: 1,
    })
  })
})

describe('integration chunk manifest validation', () => {
  it('accepts the generated manifest for the discovered specs', () => {
    const manifest = buildManifestFromSpecs(fixtureSpecs)

    expect(checkManifestAgainstSpecs(manifest, fixtureSpecs)).toMatchObject({
      errors: [],
      ok: true,
    })
  })

  it('reports missing, duplicated, and wrong-suite assignments', () => {
    const manifest = buildManifestFromSpecs(fixtureSpecs)
    const broken = structuredClone(manifest)
    broken.suites.dev.chunks[0].paths.push(broken.suites.dev.chunks[0].paths[0])
    broken.suites.dev.chunks[0].paths.push(
      'tests/integration/mcp/seeded-scan.spec.ts',
    )
    broken.suites.dev.chunks = broken.suites.dev.chunks.filter(
      chunk => !chunk.paths.includes('tests/integration/requirements'),
    )

    const result = checkManifestAgainstSpecs(broken, fixtureSpecs)

    expect(result.ok).toBe(false)
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('is missing tests/integration/requirements'),
        expect.stringContaining(
          'unexpectedly assigns tests/integration/mcp/seeded-scan.spec.ts',
        ),
        expect.stringContaining('more than once'),
        expect.stringContaining('manifest content differs'),
      ]),
    )
  })
})

describe('integration chunk command planning', () => {
  it('formats chunk memory lines with used and total memory', () => {
    const snapshot = readSystemMemorySnapshot({
      freeBytes: 3 * 1024 * 1024 * 1024,
      totalBytes: 8 * 1024 * 1024 * 1024,
    })

    expect(snapshot).toEqual({
      freeBytes: 3 * 1024 * 1024 * 1024,
      totalBytes: 8 * 1024 * 1024 * 1024,
      usedBytes: 5 * 1024 * 1024 * 1024,
    })
    expect(
      formatChunkMemoryLine({
        chunkId: 'prodlike-requirements',
        phase: 'before',
        snapshot,
        suite: 'prodlike',
      }),
    ).toBe(
      '[integration-chunks] Memory before start prodlike chunk prodlike-requirements: used=5120 MiB total=8192 MiB free=3072 MiB usedPercent=62.5%\n',
    )
    expect(
      formatChunkMemoryLine({
        chunkId: 'prodlike-requirements',
        phase: 'after',
        snapshot,
        suite: 'prodlike',
      }),
    ).toContain('Memory after finish prodlike chunk prodlike-requirements')
  })

  it('formats a finished chunk server-log line for console discovery', () => {
    expect(
      formatChunkServerLogFinishedLine({
        chunkId: 'prodlike-requirements',
        logFile: 'test-results/prodlike/server-logs/prodlike-requirements.log',
        suite: 'prodlike',
      }),
    ).toBe(
      '[integration-chunks] Finished prodlike chunk prodlike-requirements; app server log: test-results/prodlike/server-logs/prodlike-requirements.log\n',
    )
  })

  it('selects a chunk by stable id', () => {
    const manifest = buildManifestFromSpecs(fixtureSpecs)

    expect(
      selectChunks(manifest, 'prodlike', 'prodlike-mcp-seeded-scan'),
    ).toEqual([
      {
        id: 'prodlike-mcp-seeded-scan',
        paths: ['tests/integration/mcp/seeded-scan.spec.ts'],
        specCount: 1,
      },
    ])
    expect(() => selectChunks(manifest, 'prodlike', 'prodlike-nope')).toThrow(
      'Unknown prodlike integration chunk',
    )
  })

  it('passes targeted Playwright args through without chunking', () => {
    const manifest = buildManifestFromSpecs(fixtureSpecs)
    const args = parseArgs([
      'run',
      '--suite',
      'prodlike',
      'tests/integration/mcp/seeded-scan.spec.ts',
      '--project=chromium',
    ])
    const plan = createRunPlan({
      manifest,
      passthroughArgs: args.passthroughArgs,
      suite: args.suite,
    })

    expect(plan).toMatchObject({
      mode: 'direct',
      suite: 'prodlike',
    })
    expect(plan.commands).toEqual([
      {
        args: [
          'playwright',
          'test',
          '--config=playwright.prodlike.config.ts',
          'tests/integration/mcp/seeded-scan.spec.ts',
          '--project=chromium',
        ],
        command: 'npx',
        env: {},
      },
    ])
  })

  it('plans an owned prodlike chunk with build, fresh server, and auth setup', () => {
    const manifest = buildManifestFromSpecs(fixtureSpecs)
    const plan = createRunPlan({
      chunkId: 'prodlike-mcp-seeded-scan',
      env: {},
      manifest,
      suite: 'prodlike',
    })

    expect(plan.externalServer).toBe(false)
    expect(plan.commands.map(entry => entry.kind)).toEqual([
      'build',
      'kill-port',
      'start-server',
      'playwright-chunk',
      'merge-reports',
    ])
    const playwright = plan.commands.find(
      entry => entry.kind === 'playwright-chunk',
    )
    expect(playwright.args).toEqual([
      'playwright',
      'test',
      '--config=playwright.prodlike.config.ts',
      '--reporter=blob,list',
      'tests/integration/mcp/seeded-scan.spec.ts',
    ])
    expect(playwright.env).toMatchObject({
      PLAYWRIGHT_BASE_URL: 'http://localhost:3001',
      PLAYWRIGHT_BLOB_OUTPUT_DIR: 'test-results/playwright-blob-prodlike',
      PLAYWRIGHT_BLOB_OUTPUT_NAME: 'prodlike-mcp-seeded-scan.zip',
      PLAYWRIGHT_FORCE_AUTH_SETUP: '1',
      PLAYWRIGHT_SKIP_WEBSERVER: '1',
    })
    expect(plan.reportPaths.serverLogDir).toBe(
      'test-results/prodlike/server-logs',
    )
  })

  it('does not kill or start servers in external-server chunk mode', () => {
    const manifest = buildManifestFromSpecs(fixtureSpecs, { targetSpecs: 1 })
    const plan = createRunPlan({
      env: {
        PLAYWRIGHT_FORCE_AUTH_SETUP: '1',
        PLAYWRIGHT_SKIP_WEBSERVER: '1',
      },
      manifest,
      suite: 'dev',
    })

    expect(plan.externalServer).toBe(true)
    expect(plan.commands.map(entry => entry.kind)).not.toContain('kill-port')
    expect(plan.commands.map(entry => entry.kind)).not.toContain('start-server')
    const chunkCommands = plan.commands.filter(
      entry => entry.kind === 'playwright-chunk',
    )
    expect(chunkCommands.length).toBeGreaterThan(1)
    expect(chunkCommands[0].env.PLAYWRIGHT_FORCE_AUTH_SETUP).toBe('1')
    expect(chunkCommands[1].env.PLAYWRIGHT_FORCE_AUTH_SETUP).toBeUndefined()
  })
})

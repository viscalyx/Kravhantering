import { describe, expect, it } from 'vitest'
import {
  buildManifestFromSpecs,
  checkManifestAgainstSpecs,
  createRunPlan,
  formatChunkDurationLine,
  formatChunkMemoryLine,
  formatChunkServerLogFinishedLine,
  formatDevServerOutputResetLine,
  formatDurationMs,
  formatHttpReadinessWaitLine,
  formatRecursiveRemoveRetryLine,
  isRetriableRemoveError,
  parseArgs,
  readSystemMemorySnapshot,
  removePathRecursivelyWithRetries,
  selectChunks,
  shouldIgnoreSpec,
  waitForHttpReady,
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

function testClock() {
  let currentTime = 0
  return {
    now: () => currentTime,
    sleepImpl: async delayMs => {
      currentTime += delayMs
    },
  }
}

async function captureError(action) {
  try {
    await action()
  } catch (error) {
    return error
  }
  throw new Error('Expected action to throw')
}

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
    expect(manifest.chunkPolicy.areasPerChunk).toBe(1)
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
    expect(
      manifest.suites.dev.chunks.every(chunk => chunk.paths.length === 1),
    ).toBe(true)
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

  it('reports exact manifest spec paths that are not discovered specs', () => {
    const manifest = buildManifestFromSpecs(fixtureSpecs)
    const broken = structuredClone(manifest)
    const mcpChunk = broken.suites.prodlike.chunks.find(
      chunk => chunk.id === 'prodlike-mcp-seeded-scan',
    )
    if (!mcpChunk) {
      throw new Error(
        'Expected the prodlike MCP chunk in the fixture manifest.',
      )
    }
    mcpChunk.paths = ['tests/integration/mcp/missing.spec.ts']

    const result = checkManifestAgainstSpecs(broken, fixtureSpecs)

    expect(result.ok).toBe(false)
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'suite prodlike chunk prodlike-mcp-seeded-scan matches no specs',
        ),
        expect.stringContaining(
          'suite prodlike chunk prodlike-mcp-seeded-scan specCount is 1, expected 0',
        ),
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
        logFile: 'test-results/server-logs/prodlike/prodlike-requirements.log',
        suite: 'prodlike',
      }),
    ).toBe(
      '[integration-chunks] Finished prodlike chunk prodlike-requirements; app server log: test-results/server-logs/prodlike/prodlike-requirements.log\n',
    )
  })

  it('formats chunk duration lines for console discovery', () => {
    expect(formatDurationMs(3_661_000)).toBe('01h 01m 01s (3661s)')
    expect(
      formatChunkDurationLine({
        chunkId: 'prodlike-requirements',
        durationMs: 3_661_000,
        suite: 'prodlike',
      }),
    ).toBe(
      '[integration-chunks] Duration prodlike chunk prodlike-requirements: 01h 01m 01s (3661s)\n',
    )
  })

  it('formats app readiness wait lines for console discovery', () => {
    expect(
      formatHttpReadinessWaitLine({
        chunkId: 'dev-00-report-pdf',
        expectedStatuses: [302, 303, 307, 308],
        suite: 'dev',
        url: 'http://localhost:3000/api/auth/login',
      }),
    ).toBe(
      '[integration-chunks] Waiting for dev chunk dev-00-report-pdf app readiness: http://localhost:3000/api/auth/login expected status 302, 303, 307, 308\n',
    )
  })

  it('formats dev server output reset lines for console discovery', () => {
    expect(
      formatDevServerOutputResetLine({
        chunkId: 'dev-00-report-pdf',
        outputDir: '.next/dev',
        suite: 'dev',
      }),
    ).toBe(
      '[integration-chunks] Resetting dev chunk dev-00-report-pdf dev server output: .next/dev\n',
    )
  })

  it('retries transient recursive cleanup failures', async () => {
    const calls = []
    const delays = []
    const retryLines = []

    await removePathRecursivelyWithRetries('.next/dev', {
      maxAttempts: 3,
      onRetry: retry => retryLines.push(formatRecursiveRemoveRetryLine(retry)),
      retryDelayMs: 25,
      rmImpl: async (targetPath, options) => {
        calls.push({ options, targetPath })
        if (calls.length === 1) {
          throw Object.assign(new Error('directory not empty'), {
            code: 'ENOTEMPTY',
          })
        }
      },
      sleepImpl: async delayMs => {
        delays.push(delayMs)
      },
    })

    expect(calls).toEqual([
      { options: { force: true, recursive: true }, targetPath: '.next/dev' },
      { options: { force: true, recursive: true }, targetPath: '.next/dev' },
    ])
    expect(delays).toEqual([25])
    expect(retryLines).toEqual([
      '[integration-chunks] Retrying cleanup of .next/dev after ENOTEMPTY; attempt 2/3 in 25 ms\n',
    ])
  })

  it('does not retry non-transient recursive cleanup failures', async () => {
    const failure = Object.assign(new Error('invalid path'), { code: 'EINVAL' })
    const calls = []
    const delays = []

    await expect(
      removePathRecursivelyWithRetries('.next/dev', {
        maxAttempts: 3,
        retryDelayMs: 25,
        rmImpl: async (targetPath, options) => {
          calls.push({ options, targetPath })
          throw failure
        },
        sleepImpl: async delayMs => {
          delays.push(delayMs)
        },
      }),
    ).rejects.toBe(failure)

    expect(isRetriableRemoveError(failure)).toBe(false)
    expect(calls).toEqual([
      { options: { force: true, recursive: true }, targetPath: '.next/dev' },
    ])
    expect(delays).toEqual([])
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

  it('parses a stable chunk id with the selected suite', () => {
    expect(
      parseArgs([
        'run',
        '--suite',
        'prodlike',
        '--chunk',
        'prodlike-mcp-seeded-scan',
      ]),
    ).toMatchObject({
      chunkId: 'prodlike-mcp-seeded-scan',
      command: 'run',
      passthroughArgs: [],
      suite: 'prodlike',
    })
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
      'test-results/server-logs/prodlike',
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

describe('integration chunk app readiness probe', () => {
  it('retries transient 404 HTML until the auth route redirects', async () => {
    const { now, sleepImpl } = testClock()
    const fetchCalls = []
    const responses = [
      new Response('<html><body>/_not-found</body></html>', {
        headers: { 'content-type': 'text/html; charset=utf-8' },
        status: 404,
      }),
      new Response(null, {
        headers: { location: 'http://localhost:8080/realms/dev' },
        status: 302,
      }),
    ]

    const response = await waitForHttpReady(
      'http://localhost:3000/api/auth/login',
      {
        expectedStatuses: [302, 303, 307, 308],
        fetchImpl: async (url, init) => {
          fetchCalls.push({ init, url })
          return responses.shift()
        },
        intervalMs: 1,
        now,
        sleepImpl,
        timeoutMs: 10,
      },
    )

    expect(response.status).toBe(302)
    expect(fetchCalls).toHaveLength(2)
    expect(fetchCalls[0]).toMatchObject({
      url: 'http://localhost:3000/api/auth/login',
    })
    expect(fetchCalls[0].init).toMatchObject({
      cache: 'no-store',
      redirect: 'manual',
    })
  })

  it('times out repeated 404s with status, content type, and body excerpt', async () => {
    const { now, sleepImpl } = testClock()

    const error = await captureError(() =>
      waitForHttpReady('http://localhost:3000/api/auth/login', {
        bodyExcerptLength: 32,
        expectedStatuses: [302, 303, 307, 308],
        fetchImpl: async () =>
          new Response('<html><body>/_not-found route missing</body></html>', {
            headers: { 'content-type': 'text/html; charset=utf-8' },
            status: 404,
          }),
        intervalMs: 1,
        now,
        sleepImpl,
        timeoutMs: 2,
      }),
    )

    expect(error).toBeInstanceOf(Error)
    expect(error.message).toContain('Reason: timeout')
    expect(error.message).toContain('Expected status: 302, 303, 307, 308')
    expect(error.message).toContain('Last status: 404')
    expect(error.message).toContain(
      'Last content-type: text/html; charset=utf-8',
    )
    expect(error.message).toContain(
      'Last body excerpt: <html><body>/_not-found route mi...',
    )
  })

  it('fails clearly when the server exits before readiness', async () => {
    const { now, sleepImpl } = testClock()

    const error = await captureError(() =>
      waitForHttpReady('http://localhost:3000/api/auth/login', {
        child: { exitCode: 1, signalCode: null },
        expectedStatuses: [302],
        fetchImpl: async () => new Response(null, { status: 302 }),
        intervalMs: 1,
        now,
        sleepImpl,
        timeoutMs: 10,
      }),
    )

    expect(error).toBeInstanceOf(Error)
    expect(error.message).toContain('Reason: server exited before readiness')
    expect(error.message).toContain('Server process: exitCode=1')
    expect(error.message).toContain('Last status: <none>')
  })

  it('retries network errors and reports the last fetch error', async () => {
    const { now, sleepImpl } = testClock()
    let attempts = 0

    const error = await captureError(() =>
      waitForHttpReady('http://localhost:3000/api/auth/login', {
        expectedStatuses: [302],
        fetchImpl: async () => {
          attempts += 1
          throw new Error('connect ECONNREFUSED 127.0.0.1:3000')
        },
        intervalMs: 1,
        now,
        sleepImpl,
        timeoutMs: 2,
      }),
    )

    expect(attempts).toBeGreaterThan(1)
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toContain('Last status: <none>')
    expect(error.message).toContain(
      'Last fetch error: connect ECONNREFUSED 127.0.0.1:3000',
    )
  })
})

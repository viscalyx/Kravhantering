import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const analyzeBundle = require('../analyze-bundle.js')

const createdTempDirs = []
const originalGithubOutput = process.env.GITHUB_OUTPUT

const makeTempDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-test-'))
  createdTempDirs.push(dir)
  return dir
}

const withTempCwd = run => {
  const dir = makeTempDir()
  const originalCwd = process.cwd()
  process.chdir(dir)
  let result
  try {
    result = run(dir)
  } catch (error) {
    process.chdir(originalCwd)
    throw error
  }

  if (result && typeof result.then === 'function') {
    return result.finally(() => {
      process.chdir(originalCwd)
    })
  }

  process.chdir(originalCwd)
  return result
}

const writeFile = (filePath, content) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content)
}

afterEach(() => {
  vi.restoreAllMocks()
  createdTempDirs.forEach(dir => {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
  createdTempDirs.length = 0
  if (originalGithubOutput === undefined) {
    delete process.env.GITHUB_OUTPUT
  } else {
    process.env.GITHUB_OUTPUT = originalGithubOutput
  }
})

describe('analyze-bundle.js', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('formats bytes correctly', () => {
    expect(analyzeBundle.formatBytes(0)).toBe('0 B')
    expect(analyzeBundle.formatBytes(1024)).toBe('1.00 KB')
    expect(analyzeBundle.formatBytes(1024 * 1024)).toBe('1.00 MB (1024 KB)')
  })

  it('returns expected status emojis', () => {
    expect(analyzeBundle.getStatusEmoji('error')).toBe('❌')
    expect(analyzeBundle.getStatusEmoji('warning')).toBe('⚠️')
    expect(analyzeBundle.getStatusEmoji('info')).toBe('ℹ️')
    expect(analyzeBundle.getStatusEmoji('success')).toBe('✅')
  })

  it('creates progress bars with bounds', () => {
    expect(analyzeBundle.createProgressBar(0, 10)).toBe('[░░░░░░░░░░]')
    expect(analyzeBundle.createProgressBar(50, 10)).toBe('[█████░░░░░]')
    expect(analyzeBundle.createProgressBar(150, 10)).toBe('[██████████]')
  })

  it('parses wrangler output in KiB and MiB formats', () => {
    expect(
      analyzeBundle.parseWranglerOutput(
        'Total Upload: 1500.00 KiB / gzip: 450.00 KiB',
      ),
    ).toEqual({ uncompressedKB: 1500, compressedKB: 450 })

    expect(
      analyzeBundle.parseWranglerOutput(
        'Total Upload: 1.50 MiB / gzip: 0.45 MiB',
      ),
    ).toEqual({ uncompressedKB: 1536, compressedKB: 460.8 })
    expect(
      analyzeBundle.parseWranglerOutput(
        'Total Upload: 1,50 MiB / gzip: 0,45 MiB',
      ),
    ).toEqual({ uncompressedKB: 1536, compressedKB: 460.8 })
    expect(
      analyzeBundle.parseWranglerOutput(
        'Total Upload: 1,500.00 KiB / gzip: 450.00 KiB',
      ),
    ).toEqual({ uncompressedKB: 1500, compressedKB: 450 })
    expect(
      analyzeBundle.parseWranglerOutput(
        'Total Upload: 1500,00 KiB / gzip: 450,00 KiB',
      ),
    ).toEqual({ uncompressedKB: 1500, compressedKB: 450 })
    expect(
      analyzeBundle.parseWranglerOutput(
        'Total Upload: 1.500,00 KiB / gzip: 500,00 KiB',
      ),
    ).toEqual({ uncompressedKB: 1500, compressedKB: 500 })

    expect(analyzeBundle.parseWranglerOutput('no size info')).toBeNull()
  })

  it('handles file and directory size helpers', () => {
    const dir = makeTempDir()
    const fileA = path.join(dir, 'a.txt')
    const nested = path.join(dir, 'nested', 'b.txt')
    writeFile(fileA, 'hello')
    writeFile(nested, 'world!')

    expect(analyzeBundle.getFileSize(fileA)).toBe(5)
    expect(analyzeBundle.getFileSize(path.join(dir, 'missing.txt'))).toBe(0)

    const size = analyzeBundle.getDirSize(dir)
    expect(size).toBeGreaterThanOrEqual(11)
    expect(analyzeBundle.getDirSize(path.join(dir, 'missing-dir'))).toBe(0)
  })

  it('returns gzip size and handles missing files', () => {
    const dir = makeTempDir()
    const file = path.join(dir, 'data.txt')
    writeFile(file, 'content for gzip test')

    expect(analyzeBundle.getGzipSize(file)).toBeGreaterThan(0)
    expect(analyzeBundle.getGzipSize(path.join(dir, 'nope.txt'))).toBe(0)
  })

  it('detects fresh and stale builds', () => {
    withTempCwd(dir => {
      expect(analyzeBundle.isBuildFresh(30).fresh).toBe(false)

      const handler = path.join(
        dir,
        '.open-next',
        'server-functions',
        'default',
        'handler.mjs',
      )
      writeFile(handler, 'export default {}')

      const fresh = analyzeBundle.isBuildFresh(30)
      expect(fresh.fresh).toBe(true)

      const stale = analyzeBundle.isBuildFresh(-1)
      expect(stale.fresh).toBe(false)
      expect(stale.reason).toContain('minutes old')
    })
  })

  it('analyzes build output and computes usage', () => {
    withTempCwd(dir => {
      const handler = path.join(
        dir,
        '.open-next',
        'server-functions',
        'default',
        'handler.mjs',
      )
      const middleware = path.join(
        dir,
        '.open-next',
        'middleware',
        'handler.mjs',
      )
      const asset = path.join(dir, '.open-next', 'assets', 'asset.txt')
      writeFile(handler, 'console.log("handler")')
      writeFile(middleware, 'console.log("middleware")')
      writeFile(asset, 'asset-content')

      const results = analyzeBundle.analyzeBuild({ dryRun: false })
      expect(results.serverHandler.size).toBeGreaterThan(0)
      expect(results.middleware.size).toBeGreaterThan(0)
      expect(results.assets.size).toBeGreaterThan(0)
      expect(results.total.size).toBeGreaterThan(0)
      expect(results.usage).toBeDefined()
      expect(['success', 'info', 'warning', 'error']).toContain(results.status)
    })
  })

  it('sets warning/error/info status branches based on usage thresholds', () => {
    withTempCwd(dir => {
      const handler = path.join(
        dir,
        '.open-next',
        'server-functions',
        'default',
        'handler.mjs',
      )
      writeFile(handler, 'console.log("handler")')

      expect(
        analyzeBundle.analyzeBuild(
          {
            dryRun: false,
          },
          {
            LIMITS: {
              freeCompressedMB: 0.000001,
              paidCompressedMB: 1,
              warnPercentage: 99,
            },
          },
        ).status,
      ).toBe('warning')

      expect(
        analyzeBundle.analyzeBuild(
          {
            dryRun: false,
          },
          {
            LIMITS: {
              freeCompressedMB: 10,
              paidCompressedMB: 0.000001,
              warnPercentage: 99,
            },
          },
        ).status,
      ).toBe('error')

      expect(
        analyzeBundle.analyzeBuild(
          {
            dryRun: false,
          },
          {
            LIMITS: {
              freeCompressedMB: 10,
              paidCompressedMB: 1,
              warnPercentage: 0.001,
            },
          },
        ).status,
      ).toBe('info')
    })
  })

  it('returns error result when server handler missing and dryRun is false', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    withTempCwd(dir => {
      fs.mkdirSync(path.join(dir, '.open-next', 'assets'), { recursive: true })
      const results = analyzeBundle.analyzeBuild({ dryRun: false })
      expect(results.status).toBe('error')
      expect(results.statusMessage).toContain('Server handler not found')
    })
  })

  it('returns error result when build directory is missing', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    withTempCwd(() => {
      const results = analyzeBundle.analyzeBuild({ dryRun: false })
      expect(results.status).toBe('error')
      expect(results.statusMessage).toBe('Build directory .open-next not found')
    })
  })

  it('returns error result when dry-run cannot determine wrangler sizes', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    withTempCwd(dir => {
      const handler = path.join(
        dir,
        '.open-next',
        'server-functions',
        'default',
        'handler.mjs',
      )
      writeFile(handler, 'console.log("handler")')
      const results = analyzeBundle.analyzeBuild(
        { dryRun: true },
        { getWranglerBundleSize: () => null },
      )
      expect(results.status).toBe('error')
      expect(results.statusMessage).toContain('dry-run requested')
    })
  })

  it('writes CI output including usage fields', () => {
    const dir = makeTempDir()
    const outFile = path.join(dir, 'github-output.txt')
    process.env.GITHUB_OUTPUT = outFile

    analyzeBundle.outputForCI({
      serverHandler: { size: 2048, gzipSize: 1024 },
      middleware: { size: 1024, gzipSize: 512 },
      assets: { size: 4096 },
      total: { size: 8192 },
      wrangler: { uncompressedKB: 1500, compressedKB: 450 },
      usage: {
        compressedMB: 0.439,
        freePercent: 14.6,
        paidPercent: 4.4,
        exceedsFree: false,
        exceedsPaid: false,
      },
      status: 'success',
      statusMessage: 'Bundle size OK',
    })

    const content = fs.readFileSync(outFile, 'utf8')
    expect(content).toContain('status=success')
    expect(content).toContain('free-usage-percent=14.6')
    expect(content).toContain('wrangler-gzip-formatted=450.00 KB')
  })

  it('renders markdown output with expected sections', () => {
    const lines = []
    vi.spyOn(console, 'log').mockImplementation(message => {
      lines.push(String(message))
    })

    analyzeBundle.outputForMarkdown({
      serverHandler: { size: 2048, gzipSize: 1024 },
      middleware: { size: 1024, gzipSize: 512 },
      assets: { size: 4096 },
      total: { size: 8192 },
      wrangler: { uncompressedKB: 1500, compressedKB: 450 },
      usage: {
        compressedMB: 0.439,
        freePercent: 14.6,
        paidPercent: 4.4,
        exceedsFree: false,
        exceedsPaid: false,
      },
      status: 'success',
      statusMessage: 'Bundle size OK',
    })

    const captured = lines.join('\n')
    expect(captured).toContain('Bundle Size Report')
    expect(captured).toContain('Wrangler Bundle')
    expect(captured).toContain('Plan Usage')
    expect(captured).toContain('**Status:** Bundle size OK')
  })

  it('renders markdown warning and error advisory text', () => {
    const lines = []
    vi.spyOn(console, 'log').mockImplementation(message =>
      lines.push(String(message)),
    )

    const base = {
      serverHandler: { size: 2048, gzipSize: 1024 },
      middleware: { size: 1024, gzipSize: 512 },
      assets: { size: 4096 },
      total: { size: 8192 },
      wrangler: null,
      usage: null,
    }

    analyzeBundle.outputForMarkdown({
      ...base,
      status: 'warning',
      statusMessage: 'warning',
    })
    analyzeBundle.outputForMarkdown({
      ...base,
      status: 'error',
      statusMessage: 'error',
    })

    const combined = lines.join('\n')
    expect(combined).toContain('Consider optimizing bundle size')
    expect(combined).toContain('Action required')
    expect(combined).toContain('N/A')
  })

  it('renders terminal output with plan limits', () => {
    const logs = []
    vi.spyOn(console, 'log').mockImplementation(message => {
      logs.push(String(message))
    })

    analyzeBundle.outputForTerminal({
      serverHandler: { size: 2048, gzipSize: 1024 },
      middleware: { size: 1024, gzipSize: 512 },
      assets: { size: 4096 },
      serverFunctions: { size: 2048 },
      total: { size: 8192 },
      wrangler: null,
      usage: {
        compressedMB: 0.439,
        freePercent: 14.6,
        paidPercent: 4.4,
        exceedsFree: false,
        exceedsPaid: false,
      },
      status: 'success',
      statusMessage: 'Bundle size OK',
    })

    const combined = logs.join('\n')
    expect(combined).toContain('Bundle Size Analysis')
    expect(combined).toContain('Cloudflare Workers Limits')
  })

  it('renders terminal output including wrangler section', () => {
    const logs = []
    vi.spyOn(console, 'log').mockImplementation(message => {
      logs.push(String(message))
    })

    analyzeBundle.outputForTerminal({
      serverHandler: { size: 2048, gzipSize: 1024 },
      middleware: { size: 1024, gzipSize: 512 },
      assets: { size: 4096 },
      serverFunctions: { size: 2048 },
      total: { size: 8192 },
      wrangler: { uncompressedKB: 1500, compressedKB: 450 },
      usage: null,
      status: 'success',
      statusMessage: 'Bundle size OK',
    })

    expect(logs.join('\n')).toContain('Wrangler Bundle (what Cloudflare sees)')
  })

  it('main prints help and exits 0', () => {
    const logs = []
    vi.spyOn(console, 'log').mockImplementation(message =>
      logs.push(String(message)),
    )
    vi.spyOn(process, 'exit').mockImplementation(code => {
      throw new Error(`exit:${code}`)
    })

    expect(() => analyzeBundle.main(['--help'])).toThrow('exit:0')

    expect(logs.join('\n')).toContain(
      'Bundle Size Analyzer for Cloudflare Workers',
    )
  })

  it('main rejects invalid --max-age and exits 1', () => {
    const errs = []
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(message =>
      errs.push(String(message)),
    )
    vi.spyOn(process, 'exit').mockImplementation(code => {
      throw new Error(`exit:${code}`)
    })

    expect(() => analyzeBundle.main(['--max-age=abc'])).toThrow('exit:1')

    expect(errs.join('\n')).toContain('Invalid --max-age value')
  })

  it('main routes to JSON/markdown/ci/terminal outputs', () => {
    const logs = []
    vi.spyOn(console, 'log').mockImplementation(message =>
      logs.push(String(message)),
    )

    const mockResults = {
      serverHandler: { size: 1, gzipSize: 1 },
      middleware: { size: 1, gzipSize: 1 },
      assets: { size: 1 },
      serverFunctions: { size: 1 },
      total: { size: 1 },
      status: 'success',
      statusMessage: 'ok',
    }

    analyzeBundle.main(['--json', '--no-build'], {
      analyzeBuild: () => mockResults,
    })
    analyzeBundle.main(['--markdown', '--no-build'], {
      analyzeBuild: () => mockResults,
      outputForMarkdown: () => logs.push('markdown-out'),
    })
    analyzeBundle.main(['--ci', '--no-build'], {
      analyzeBuild: () => mockResults,
      outputForCI: () => logs.push('ci-out'),
    })
    analyzeBundle.main(['--no-build'], {
      analyzeBuild: () => mockResults,
      outputForTerminal: () => logs.push('terminal-out'),
    })

    const combined = logs.join('\n')
    expect(combined).toContain('"status": "success"')
    expect(combined).toContain('markdown-out')
    expect(combined).toContain('ci-out')
    expect(combined).toContain('terminal-out')
  })

  it('main exits when build is stale and rebuild fails', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(process, 'exit').mockImplementation(code => {
      throw new Error(`exit:${code}`)
    })

    expect(() =>
      analyzeBundle.main(['--max-age=1'], {
        isBuildFresh: () => ({ fresh: false, reason: 'stale build' }),
        runBuild: () => false,
      }),
    ).toThrow('exit:1')
  })

  it('main exits when analysis status is error', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(process, 'exit').mockImplementation(code => {
      throw new Error(`exit:${code}`)
    })

    expect(() =>
      analyzeBundle.main(['--no-build'], {
        analyzeBuild: () => ({
          serverHandler: { size: 0, gzipSize: 0 },
          middleware: { size: 0, gzipSize: 0 },
          assets: { size: 0 },
          serverFunctions: { size: 0 },
          total: { size: 0 },
          status: 'error',
          statusMessage: 'too big',
        }),
        outputForTerminal: () => {},
      }),
    ).toThrow('exit:1')
  })

  it('main uses existing build when fresh and sets dry-run by default', () => {
    const errs = []
    vi.spyOn(console, 'error').mockImplementation(message =>
      errs.push(String(message)),
    )

    const seen = []
    analyzeBundle.main([], {
      isBuildFresh: () => ({ fresh: true, ageMinutes: 2 }),
      analyzeBuild: options => {
        seen.push(options)
        return {
          serverHandler: { size: 0, gzipSize: 0 },
          middleware: { size: 0, gzipSize: 0 },
          assets: { size: 0 },
          serverFunctions: { size: 0 },
          total: { size: 0 },
          status: 'success',
          statusMessage: 'ok',
        }
      },
      outputForTerminal: () => {},
    })

    expect(errs.join('\n')).toContain('Using existing build')
    expect(seen[0].dryRun).toBe(true)
  })
})

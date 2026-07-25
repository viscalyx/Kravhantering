import { access, mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  actionAuditCsvHeaders,
  traverseActionAuditEventsForCsv,
} from '@/lib/audit/action-audit'
import { runBoundedCsvOutput } from '@/lib/generated-output/csv-runner'

const mocks = vi.hoisted(() => ({
  getApplicationSettings: vi.fn(),
}))

vi.mock('@/lib/dal/application-settings', () => ({
  getApplicationSettings: mocks.getApplicationSettings,
}))

const context = {
  actor: { id: 'csv-runner-test' },
  correlationId: 'csv-correlation',
  requestId: 'csv-request',
  source: 'rest',
} as never

let root: string
let previousTempDirectory: string | undefined

beforeEach(async () => {
  vi.clearAllMocks()
  previousTempDirectory = process.env.KRAVHANTERING_EXPORT_TEMP_DIR
  root = await mkdtemp(join(tmpdir(), 'csv-runner-test-'))
  process.env.KRAVHANTERING_EXPORT_TEMP_DIR = root
  mocks.getApplicationSettings.mockResolvedValue({
    csvExportConcurrencyPerNode: 2,
    csvExportMaxFileBytes: 1024,
    csvExportMaxItems: 2,
    csvExportTimeoutSeconds: 120,
  })
})

afterEach(async () => {
  if (previousTempDirectory == null) {
    delete process.env.KRAVHANTERING_EXPORT_TEMP_DIR
  } else {
    process.env.KRAVHANTERING_EXPORT_TEMP_DIR = previousTempDirectory
  }
  await rm(root, { force: true, recursive: true })
})

function run(
  generateRows: Parameters<typeof runBoundedCsvOutput>[0]['generateRows'],
  requestSignal?: AbortSignal,
): Promise<Response> {
  return runBoundedCsvOutput({
    context,
    db: {} as never,
    generateRows,
    headers: ['Krav;ID'],
    operation: 'requirements.specification_csv_export',
    requestSignal,
    responseHeaders: {
      'Content-Disposition': 'attachment; filename="test.csv"',
      'Content-Type': 'text/csv; charset=utf-8',
    },
  })
}

describe('bounded CSV runner', () => {
  it('returns a localized header-only action-log CSV for zero matches', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ anchorId: '42' }])
      .mockResolvedValueOnce([])
    const db = { query } as never
    const headers = actionAuditCsvHeaders('sv')

    const response = await runBoundedCsvOutput({
      context,
      db,
      generateRows: async output => {
        await traverseActionAuditEventsForCsv(
          db,
          { action: 'no.matching.action' },
          { ...output, locale: 'sv' },
        )
      },
      headers,
      operation: 'admin.action_log_csv_export',
      responseHeaders: {
        'Content-Disposition': 'attachment; filename="atgardslogg.csv"',
        'Content-Type': 'text/csv; charset=utf-8',
      },
    })
    const bytes = new Uint8Array(await response.arrayBuffer())
    const csv = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes)

    expect(response.status).toBe(200)
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf])
    expect(csv).toBe(`\uFEFF${headers.join(';')}`)
    expect(query).toHaveBeenCalledTimes(2)
    expect(query.mock.calls[1]?.[0]).toContain('action = @0')
  })

  it('streams the completed file and cleans it when delivery is cancelled', async () => {
    const response = await run(async ({ writeRow }) => {
      await writeRow('BEH0001')
    })
    const [spoolDirectory] = await readdir(root)

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Length')).toBe('21')
    await response.body?.cancel()
    if (spoolDirectory) {
      await expect(access(join(root, spoolDirectory))).rejects.toThrow()
    }
  })

  it('enforces the item limit even when a callback does not bound traversal', async () => {
    mocks.getApplicationSettings.mockResolvedValueOnce({
      csvExportConcurrencyPerNode: 2,
      csvExportMaxFileBytes: 1024,
      csvExportMaxItems: 1,
      csvExportTimeoutSeconds: 120,
    })

    const response = await run(async ({ writeRow }) => {
      await writeRow('BEH0001')
      await writeRow('BEH0002')
    })

    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toMatchObject({
      code: 'output_limit_exceeded',
      details: { limit: 1, limitKind: 'items', output: 'csv' },
    })
  })

  it('maps request cancellation before a row write to status 499', async () => {
    const request = new AbortController()
    request.abort(new Error('private cancellation detail'))

    const response = await run(async ({ writeRow }) => {
      await writeRow('BEH0001')
    }, request.signal)

    expect(response.status).toBe(499)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })

  it('maps the generation deadline to the stable timeout envelope', async () => {
    mocks.getApplicationSettings.mockResolvedValueOnce({
      csvExportConcurrencyPerNode: 2,
      csvExportMaxFileBytes: 1024,
      csvExportMaxItems: 2,
      csvExportTimeoutSeconds: 0,
    })

    const response = await run(
      ({ signal }) =>
        new Promise((_, reject) => {
          const rejectFromAbort = () => reject(signal.reason)
          signal.addEventListener('abort', rejectFromAbort, { once: true })
          if (signal.aborted) rejectFromAbort()
        }),
    )

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({
      code: 'generation_timeout',
      details: { output: 'csv' },
    })
  })

  it('cleans the spool and rethrows unexpected generation failures', async () => {
    await expect(
      run(async () => {
        throw new Error('unexpected generation failure')
      }),
    ).rejects.toThrow('unexpected generation failure')
    expect(await readdir(root)).toEqual([])
  })
})

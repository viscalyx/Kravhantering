// @vitest-environment node
import { createReadStream, type ReadStream } from 'node:fs'
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { acquireGeneratedOutputCapacity } from '@/lib/generated-output/capacity'
import { GeneratedOutputError } from '@/lib/generated-output/errors'
import {
  ClientCancelledGeneratedOutputError,
  GeneratedOutputTimeoutError,
} from '@/lib/generated-output/operation'
import {
  generatedOutputCapacitySnapshot,
  writeBoundedFile,
} from '@/lib/generated-output/spool'
import {
  type GenerateDataSubjectExportOptions,
  generateDataSubjectExport,
} from '@/lib/privacy/data-subject-export-output'
import type { DataSubjectExportV1 } from '@/lib/privacy/data-subject-export-types'

const state = vi.hoisted(() => ({
  collect: vi.fn(),
  record: vi.fn(),
  render: vi.fn(),
  settings: {
    csvExportConcurrencyPerNode: 2,
    csvExportMaxFileBytes: 4096,
    csvExportMaxItems: 100,
    csvExportTimeoutSeconds: 30,
    pdfReportConcurrencyPerNode: 1,
    pdfReportMaxFileBytes: 8192,
    pdfReportMaxRequirements: 200,
    pdfReportTimeoutSeconds: 60,
    pdfWorkerMemoryMib: 256,
  },
}))

vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual, createReadStream: vi.fn(actual.createReadStream) }
})
vi.mock('@/lib/dal/application-settings', () => ({
  getApplicationSettings: vi.fn(async () => state.settings),
}))
vi.mock('@/lib/observability/capacity', () => ({
  recordCapacityEvent: state.record,
}))
vi.mock('@/lib/privacy/data-subject-export', () => ({
  collectDataSubjectExport: state.collect,
}))
vi.mock('@/lib/pdf/report-worker', () => ({
  renderDataSubjectExportInWorker: state.render,
}))

function dataSubjectExportFixture(): DataSubjectExportV1 {
  return {
    generatedAt: '2026-08-04T12:00:00.000Z',
    generatedBy: {
      displayName: 'Privacy Officer',
      hsaId: 'SE5560000001-privacy1',
      roles: ['PrivacyOfficer'],
      source: 'oidc',
      sub: 'privacy-sub',
    },
    limitations: [
      { description: 'Free text is excluded.', key: 'free_text_not_scanned' },
    ],
    schemaVersion: 'privacy-data-subject-export.v1',
    sources: [
      {
        fieldKey: 'owner',
        items: [
          {
            fieldName: 'owner_hsa_id',
            relatedObject: {
              key: '1',
              label: 'Area',
              type: 'requirement_area',
            },
            relationToSubject: 'live_owner_assignment',
            sourceKey: 'requirement_areas.owner',
            table: 'requirement_areas',
            value: 'SE5560000001-subject1',
          },
        ],
        key: 'requirement_areas.owner',
        objectKey: 'requirementAreas',
        relationToSubject: 'live_owner_assignment',
        table: 'requirement_areas',
      },
    ],
    subject: {
      hsaId: 'SE5560000001-subject1',
      targetFingerprint: '0123456789abcdef0123456789abcdef',
    },
    summary: { itemCount: 1, limitationCount: 1, sourceCount: 1 },
  }
}

function options(delivery: 'json' | 'pdf'): GenerateDataSubjectExportOptions {
  return {
    context: {
      actor: {
        displayName: 'Privacy Officer',
        hsaId: 'SE5560000001-privacy1',
        source: 'oidc',
        id: 'privacy-sub',
        isAuthenticated: true,
        roles: ['PrivacyOfficer'],
      },
      correlationId: 'correlation-1',
      requestId: 'request-1',
      source: 'rest',
    },
    db: {} as GenerateDataSubjectExportOptions['db'],
    delivery,
    input: {
      generatedBy: dataSubjectExportFixture().generatedBy,
      target: { hsaId: 'SE5560000001-subject1' },
    },
    locale: 'en',
    requestSignal: new AbortController().signal,
  }
}

// Keep deadlines, admission, bounded writes and response streaming real so the
// orchestration tests also exercise ownership of capacity and temporary files.
describe.each(['json', 'pdf'] as const)(
  '%s bounded export resources',
  delivery => {
    let directory: string
    const isPdf = delivery === 'pdf'
    const activeField = isPdf ? 'activePdf' : 'activeCsv'
    const maxItems = isPdf ? 200 : 100

    beforeEach(async () => {
      vi.clearAllMocks()
      directory = await mkdtemp(join(tmpdir(), 'privacy-output-test-'))
      vi.stubEnv('KRAVHANTERING_EXPORT_TEMP_DIR', directory)
      state.settings.csvExportMaxFileBytes = 4096
      state.settings.pdfReportMaxFileBytes = 8192
      state.collect.mockResolvedValue(dataSubjectExportFixture())
      state.render.mockImplementation(
        async ({ outputPath, maxBytes, signal }) =>
          writeBoundedFile(outputPath, ['%PDF'], maxBytes, 'pdf', signal),
      )
    })

    afterEach(async () => {
      vi.useRealTimers()
      vi.unstubAllEnvs()
      await rm(directory, { force: true, recursive: true })
      expect(generatedOutputCapacitySnapshot()).toEqual({
        activeCsv: 0,
        activePdf: 0,
        reservedBytes: 0,
      })
    })

    async function expectCleaned(): Promise<void> {
      await vi.waitFor(async () => {
        expect(await readdir(directory)).toEqual([])
        expect(generatedOutputCapacitySnapshot()).toEqual({
          activeCsv: 0,
          activePdf: 0,
          reservedBytes: 0,
        })
      })
    }

    function expectTerminal(
      event: string,
      statusCode: number,
      metrics: Record<string, number> = {},
    ): void {
      expect(state.record).toHaveBeenCalledOnce()
      expect(state.record).toHaveBeenCalledWith(
        expect.objectContaining({
          event,
          statusCode,
          operation: `privacy.data_subject_${delivery}_export`,
          metrics: expect.objectContaining({
            concurrency_limit: isPdf ? 1 : 2,
            item_limit: maxItems,
            timeout_ms: isPdf ? 60_000 : 30_000,
            worker_memory_limit_bytes: isPdf ? 268_435_456 : undefined,
            ...metrics,
          }),
        }),
      )
    }

    it('admits before collection, delivers exact-limit payloads and cleans up after completion', async () => {
      const payload = dataSubjectExportFixture()
      payload.summary.itemCount = maxItems
      state.collect.mockImplementationOnce(async (_db, _input, limits) => {
        expect(limits.maxItems).toBe(maxItems)
        expect(generatedOutputCapacitySnapshot()).toMatchObject({
          [activeField]: 1,
        })
        expect(await readdir(directory)).toHaveLength(1)
        return payload
      })
      const input = options(delivery)
      const removeListener = vi.spyOn(
        input.requestSignal,
        'removeEventListener',
      )
      const { response, payload: collected } =
        await generateDataSubjectExport(input)
      expect(collected).toBe(payload)
      expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function))
      expect(generatedOutputCapacitySnapshot()).toEqual({
        activeCsv: 0,
        activePdf: 0,
        reservedBytes: isPdf ? 8192 : 4096,
      })
      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe(
        isPdf ? 'application/pdf' : 'application/json;charset=utf-8',
      )
      expect(response.headers.get('Content-Disposition')).toBe(
        `attachment; filename=data-subject-access-export-0123456789abcdef-2026-08-04.${delivery}`,
      )
      expect(response.headers.get('Cache-Control')).toBe('no-store')
      expect(response.headers.get('X-Accel-Buffering')).toBe('no')
      const body = await response.text()
      expect(body).toBe(isPdf ? '%PDF' : JSON.stringify(payload))
      expect(response.headers.get('Content-Length')).toBe(
        String(Buffer.byteLength(body)),
      )
      await expectCleaned()
      expectTerminal('capacity.operation.completed', 200, {
        active_count: 0,
        byte_count: Buffer.byteLength(body),
        item_count: maxItems,
      })
    })

    it('records one cancellation and cleans up when the response is cancelled', async () => {
      const { response } = await generateDataSubjectExport(options(delivery))
      await response.body?.cancel()
      await expectCleaned()
      expectTerminal('capacity.operation.cancelled', 499, {
        active_count: 0,
        item_count: 1,
      })
    })

    it('records one stream failure and cleans up the spool', async () => {
      const { response } = await generateDataSubjectExport(options(delivery))
      const source = vi.mocked(createReadStream).mock.results.at(-1)
        ?.value as ReadStream
      const error = new Error('disk read failed')
      source.destroy(error)
      await expect(response.text()).rejects.toBe(error)
      await expectCleaned()
      expectTerminal('capacity.operation.failed', 500, {
        active_count: 0,
        item_count: 1,
      })
    })

    it('rejects a full pool before collection with retry details and no spool', async () => {
      const held = Array.from({ length: isPdf ? 1 : 2 }, () =>
        acquireGeneratedOutputCapacity({
          concurrencyLimit: isPdf ? 1 : 2,
          output: delivery,
        }),
      )
      try {
        await expect(
          generateDataSubjectExport(options(delivery)),
        ).rejects.toMatchObject({
          code: 'capacity_busy',
          status: 429,
          details: { output: delivery, retryAfterSeconds: 5 },
        })
        expect(state.collect).not.toHaveBeenCalled()
        expect(await readdir(directory)).toEqual([])
        expectTerminal('capacity.throttled', 429, {
          active_count: isPdf ? 1 : 2,
          item_count: 0,
          byte_count: 0,
        })
      } finally {
        for (const capacity of held) capacity.release()
      }
    })

    it('cleans up item overflow and records the first excessive item', async () => {
      state.collect.mockImplementationOnce(async (_db, _input, limits) => {
        throw limits.createItemLimitError(limits.maxItems)
      })
      await expect(
        generateDataSubjectExport(options(delivery)),
      ).rejects.toMatchObject({
        status: 422,
        details: { limit: maxItems, limitKind: 'items', output: delivery },
      })
      await expectCleaned()
      expectTerminal('capacity.threshold_exceeded', 422, {
        active_count: 1,
        item_count: maxItems + 1,
      })
    })

    it('cleans up byte overflow and reports the configured file limit', async () => {
      state.settings.csvExportMaxFileBytes = 3
      state.settings.pdfReportMaxFileBytes = 3
      await expect(
        generateDataSubjectExport(options(delivery)),
      ).rejects.toMatchObject({
        status: 422,
        details: { limit: 3, limitKind: 'bytes', output: delivery },
      })
      await expectCleaned()
      expectTerminal('capacity.threshold_exceeded', 422, {
        active_count: 1,
        byte_limit: 3,
        item_count: 1,
      })
    })

    it.each(['cancel', 'timeout'] as const)(
      'interrupts collection on %s and releases resources',
      async reason => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
        const controller = new AbortController()
        let collected!: () => void
        const collecting = new Promise<void>(resolve => {
          collected = resolve
        })
        state.collect.mockImplementationOnce(async (_db, _input, limits) => {
          collected()
          return new Promise((_resolve, reject) => {
            limits.signal.addEventListener(
              'abort',
              () => reject(limits.signal.reason),
              { once: true },
            )
          })
        })
        const input = { ...options(delivery), requestSignal: controller.signal }
        const removeListener = vi.spyOn(
          controller.signal,
          'removeEventListener',
        )
        const result = generateDataSubjectExport(input)
        const rejected = expect(result).rejects.toBeInstanceOf(
          reason === 'cancel'
            ? ClientCancelledGeneratedOutputError
            : GeneratedOutputTimeoutError,
        )
        await collecting
        if (reason === 'cancel') controller.abort()
        else await vi.advanceTimersByTimeAsync(isPdf ? 60_000 : 30_000)
        await rejected
        expect(vi.getTimerCount()).toBe(0)
        expect(removeListener).toHaveBeenCalledWith(
          'abort',
          expect.any(Function),
        )
        vi.useRealTimers()
        await expectCleaned()
        expectTerminal(
          reason === 'cancel'
            ? 'capacity.operation.cancelled'
            : 'capacity.operation.failed',
          reason === 'cancel' ? 499 : 503,
        )
      },
    )

    it('cleans up an already aborted request before rendering', async () => {
      const controller = new AbortController()
      controller.abort()
      await expect(
        generateDataSubjectExport({
          ...options(delivery),
          requestSignal: controller.signal,
        }),
      ).rejects.toBeInstanceOf(ClientCancelledGeneratedOutputError)
      expect(state.render).not.toHaveBeenCalled()
      await expectCleaned()
      expectTerminal('capacity.operation.cancelled', 499)
    })

    it('cleans up a generation failure', async () => {
      const failure = new GeneratedOutputError(
        'temporary_storage_unavailable',
        'temporary_storage_unavailable',
        { output: delivery },
      )
      if (isPdf) state.render.mockRejectedValueOnce(failure)
      else {
        state.collect.mockImplementationOnce(async () => {
          const [spool] = await readdir(directory)
          // Simulate a filesystem failure when the JSON writer opens its output.
          await rm(join(directory, spool, 'output'))
          await mkdir(join(directory, spool, 'output'))
          return dataSubjectExportFixture()
        })
      }
      await expect(
        generateDataSubjectExport(options(delivery)),
      ).rejects.toThrow()
      await expectCleaned()
      expectTerminal('capacity.operation.failed', isPdf ? 503 : 500)
    })
  },
)

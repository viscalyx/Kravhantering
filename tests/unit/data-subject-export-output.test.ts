import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GeneratedOutputError } from '@/lib/generated-output/errors'
import { createGenerationDeadline } from '@/lib/generated-output/operation'
import type { GeneratedOutputStreamLifecycle } from '@/lib/generated-output/spool'
import { collectDataSubjectExport } from '@/lib/privacy/data-subject-export'
import type { DataSubjectExportV1 } from '@/lib/privacy/data-subject-export-types'

const outputState = vi.hoisted(() => ({
  acquireSpool: vi.fn(),
  cancelled: vi.fn(),
  completed: vi.fn(),
  createFileResponse: vi.fn(),
  disposeDeadline: vi.fn(),
  failed: vi.fn(),
  lifecycle: undefined as GeneratedOutputStreamLifecycle | undefined,
  operations: [] as string[],
  payload: undefined as DataSubjectExportV1 | undefined,
  releaseGeneration: vi.fn(),
  releaseSpool: vi.fn(),
  renderPdf: vi.fn(),
  serializedJson: '',
  writeFile: vi.fn(),
}))

vi.mock('@/lib/dal/application-settings', () => ({
  getApplicationSettings: vi.fn(async () => ({
    csvExportConcurrencyPerNode: 2,
    csvExportMaxFileBytes: 4096,
    csvExportMaxItems: 100,
    csvExportTimeoutSeconds: 30,
    pdfReportConcurrencyPerNode: 1,
    pdfReportMaxFileBytes: 8192,
    pdfReportMaxRequirements: 200,
    pdfReportTimeoutSeconds: 60,
    pdfWorkerMemoryMib: 256,
  })),
}))

vi.mock('@/lib/generated-output/operation', () => ({
  createGeneratedOutputTerminalRecorder: vi.fn((operation: string) => {
    outputState.operations.push(operation)
    return {
      cancelled: outputState.cancelled,
      completed: outputState.completed,
      failed: outputState.failed,
    }
  }),
  createGenerationDeadline: vi.fn(
    (_timeout: number, requestSignal: AbortSignal) => ({
      dispose: outputState.disposeDeadline,
      signal: requestSignal,
    }),
  ),
  throwIfGenerationAborted: vi.fn((signal: AbortSignal) =>
    signal.throwIfAborted(),
  ),
}))

vi.mock('@/lib/generated-output/spool', () => ({
  acquireGeneratedOutputSpool: outputState.acquireSpool,
  createGeneratedOutputFileResponse: outputState.createFileResponse,
  generatedOutputCapacitySnapshot: vi.fn(() => ({
    activeCsv: 1,
    activePdf: 2,
    reservedBytes: 0,
  })),
  writeBoundedFile: outputState.writeFile,
}))

vi.mock('@/lib/pdf/report-worker', () => ({
  renderDataSubjectExportInWorker: outputState.renderPdf,
}))

vi.mock('@/lib/privacy/data-subject-export', () => ({
  collectDataSubjectExport: vi.fn(async () => outputState.payload),
}))

import {
  type GenerateDataSubjectExportOptions,
  generateDataSubjectExport,
} from '@/lib/privacy/data-subject-export-output'

function payload(): DataSubjectExportV1 {
  return {
    generatedAt: '2026-08-18T10:00:00.000Z',
    generatedBy: {
      displayName: 'Ada Admin',
      hsaId: 'SE5560000001-admin1',
      roles: ['Admin'],
      source: 'oidc',
      sub: 'admin-sub',
    },
    limitations: [],
    schemaVersion: 'privacy-data-subject-export.v1',
    sources: [],
    subject: {
      hsaId: 'SE5560000001-admin1',
      targetFingerprint: '0123456789abcdef0123456789abcdef',
    },
    summary: { itemCount: 0, limitationCount: 0, sourceCount: 0 },
  }
}

function options(delivery: 'json' | 'pdf'): GenerateDataSubjectExportOptions {
  return {
    context: {
      actor: {
        displayName: 'Ada Admin',
        hsaId: 'SE5560000001-admin1',
        id: 'admin-sub',
        isAuthenticated: true,
        roles: ['Admin'],
        source: 'oidc' as const,
      },
      correlationId: 'correlation-1',
      requestId: 'request-1',
      source: 'rest' as const,
    },
    db: { query: vi.fn() } as unknown as GenerateDataSubjectExportOptions['db'],
    delivery,
    input: {
      generatedBy: payload().generatedBy,
      target: { hsaId: 'SE5560000001-admin1' },
    },
    locale: 'en' as const,
    requestSignal: new AbortController().signal,
  }
}

describe('data-subject export output orchestration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    outputState.lifecycle = undefined
    outputState.operations.length = 0
    outputState.payload = payload()
    outputState.serializedJson = ''
    vi.mocked(collectDataSubjectExport).mockImplementation(
      async () => outputState.payload ?? payload(),
    )
    outputState.acquireSpool.mockResolvedValue({
      directoryPath: '/tmp/export',
      filePath: '/tmp/export/output',
      releaseGeneration: outputState.releaseGeneration,
      releaseSpool: outputState.releaseSpool,
    })
    outputState.createFileResponse.mockImplementation(
      async (_spool, _headers, lifecycle) => {
        outputState.lifecycle = lifecycle
        return new Response('{}')
      },
    )
    outputState.renderPdf.mockResolvedValue(4)
    outputState.writeFile.mockImplementation(async (_path, chunks) => {
      outputState.serializedJson = ''
      for await (const chunk of chunks) {
        outputState.serializedJson += String(chunk)
      }
      return new TextEncoder().encode(outputState.serializedJson).byteLength
    })
  })

  describe.each(['json', 'pdf'] as const)('%s lifecycle', delivery => {
    const isPdf = delivery === 'pdf'
    const itemLimit = isPdf ? 200 : 100
    const maxFileBytes = isPdf ? 8192 : 4096
    const metrics = {
      activeCount: isPdf ? 2 : 1,
      byteCount: 0,
      concurrencyLimit: isPdf ? 1 : 2,
      itemCount: 0,
      itemLimit,
      timeoutMs: isPdf ? 60_000 : 30_000,
      ...(isPdf ? { workerMemoryLimitBytes: 268_435_456 } : {}),
    }
    const generator = () =>
      isPdf ? outputState.renderPdf : outputState.writeFile

    it.each(['onComplete', 'onCancel', 'onError'] as const)(
      'transfers the spool to the response and records %s metrics',
      async callback => {
        const input = options(delivery)
        const result = await generateDataSubjectExport(input)
        const byteCount = isPdf
          ? 4
          : Buffer.byteLength(outputState.serializedJson)

        expect(result.payload).toBe(outputState.payload)
        expect(outputState.acquireSpool).toHaveBeenCalledWith({
          concurrencyLimit: metrics.concurrencyLimit,
          maxFileBytes,
          output: delivery,
        })
        expect(createGenerationDeadline).toHaveBeenCalledWith(
          isPdf ? 60 : 30,
          input.requestSignal,
        )
        expect(collectDataSubjectExport).toHaveBeenCalledWith(
          input.db,
          input.input,
          {
            createItemLimitError: expect.any(Function),
            maxItems: itemLimit,
            signal: input.requestSignal,
          },
        )
        expect(outputState.disposeDeadline).toHaveBeenCalledOnce()
        expect(outputState.releaseGeneration).not.toHaveBeenCalled()
        expect(outputState.releaseSpool).not.toHaveBeenCalled()
        expect(outputState.completed).not.toHaveBeenCalled()
        expect(outputState.lifecycle?.[callback]).toBeTypeOf('function')
        outputState.lifecycle?.[callback]?.()
        if (callback === 'onError') {
          expect(outputState.failed).toHaveBeenCalledWith(
            new Error(
              `Privacy ${delivery.toUpperCase()} response stream failed`,
            ),
            { ...metrics, byteCount },
          )
        } else {
          expect(
            callback === 'onComplete'
              ? outputState.completed
              : outputState.cancelled,
          ).toHaveBeenCalledWith({ ...metrics, byteCount })
        }
        expect(outputState.operations).toEqual([
          `privacy.data_subject_${delivery}_export`,
        ])
      },
    )

    it('rejects capacity before collection without allocating a deadline', async () => {
      const error = new GeneratedOutputError(
        'capacity_busy',
        'concurrency_limit',
        {
          output: delivery,
          retryAfterSeconds: 5,
        },
      )
      outputState.acquireSpool.mockRejectedValueOnce(error)
      await expect(generateDataSubjectExport(options(delivery))).rejects.toBe(
        error,
      )
      expect(collectDataSubjectExport).not.toHaveBeenCalled()
      expect(createGenerationDeadline).not.toHaveBeenCalled()
      expect(outputState.releaseSpool).not.toHaveBeenCalled()
      expect(outputState.failed).toHaveBeenCalledWith(error, metrics)
    })

    it.each(['collection', 'generation', 'response'] as const)(
      'cleans up after a %s failure',
      async stage => {
        const error = new Error(`${stage} failed`)
        const operation =
          stage === 'collection'
            ? vi.mocked(collectDataSubjectExport)
            : stage === 'generation'
              ? generator()
              : outputState.createFileResponse
        operation.mockRejectedValueOnce(error)
        await expect(generateDataSubjectExport(options(delivery))).rejects.toBe(
          error,
        )
        expect(outputState.disposeDeadline).toHaveBeenCalledOnce()
        expect(outputState.releaseGeneration).toHaveBeenCalledOnce()
        expect(outputState.releaseSpool).toHaveBeenCalledOnce()
        expect(outputState.failed).toHaveBeenCalledWith(error, {
          ...metrics,
          byteCount:
            stage === 'response'
              ? isPdf
                ? 4
                : Buffer.byteLength(outputState.serializedJson)
              : 0,
        })
      },
    )

    it('records observed item overflow using the delivery-specific error', async () => {
      vi.mocked(collectDataSubjectExport).mockImplementationOnce(
        async (_db, _input, limits) => {
          throw limits?.createItemLimitError?.(itemLimit)
        },
      )
      await expect(
        generateDataSubjectExport(options(delivery)),
      ).rejects.toMatchObject({
        capacityReason: 'item_limit_exceeded',
        details: { limit: itemLimit, limitKind: 'items', output: delivery },
        status: 422,
      })
      expect(outputState.failed).toHaveBeenCalledWith(
        expect.any(GeneratedOutputError),
        {
          ...metrics,
          itemCount: itemLimit + 1,
        },
      )
      expect(generator()).not.toHaveBeenCalled()
      expect(outputState.disposeDeadline).toHaveBeenCalledOnce()
      expect(outputState.releaseGeneration).toHaveBeenCalledOnce()
      expect(outputState.releaseSpool).toHaveBeenCalledOnce()
    })

    it('preserves byte-limit mapping and configured limit metrics', async () => {
      generator().mockRejectedValueOnce(
        new GeneratedOutputError(
          'output_limit_exceeded',
          'byte_limit_exceeded',
          {
            limit: isPdf ? maxFileBytes : maxFileBytes - 3,
            limitKind: 'bytes',
            output: delivery,
          },
        ),
      )
      await expect(
        generateDataSubjectExport(options(delivery)),
      ).rejects.toMatchObject({
        capacityReason: 'byte_limit_exceeded',
        details: { limit: maxFileBytes, limitKind: 'bytes', output: delivery },
        status: 422,
      })
      expect(outputState.failed).toHaveBeenCalledWith(
        expect.any(GeneratedOutputError),
        metrics,
      )
      expect(outputState.disposeDeadline).toHaveBeenCalledOnce()
      expect(outputState.releaseGeneration).toHaveBeenCalledOnce()
      expect(outputState.releaseSpool).toHaveBeenCalledOnce()
    })

    it.each([
      'before collection',
      'after collection',
      'during generation',
      'after generation',
    ] as const)('cleans up an abort %s', async timing => {
      const controller = new AbortController()
      const error = new Error('request aborted')
      const input = { ...options(delivery), requestSignal: controller.signal }
      if (timing === 'before collection') controller.abort(error)
      if (timing === 'after collection') {
        vi.mocked(collectDataSubjectExport).mockImplementationOnce(async () => {
          controller.abort(error)
          return payload()
        })
      }
      if (timing === 'during generation' || timing === 'after generation') {
        generator().mockImplementationOnce(async (...args: unknown[]) => {
          const signal = isPdf
            ? (args[0] as { signal: AbortSignal }).signal
            : (args[4] as AbortSignal)
          controller.abort(error)
          if (timing === 'during generation') signal.throwIfAborted()
          return 4
        })
      }
      await expect(generateDataSubjectExport(input)).rejects.toBe(error)
      expect(outputState.failed).toHaveBeenCalledWith(error, {
        ...metrics,
        byteCount: timing === 'after generation' ? 4 : 0,
      })
      expect(outputState.createFileResponse).not.toHaveBeenCalled()
      expect(outputState.disposeDeadline).toHaveBeenCalledOnce()
      expect(outputState.releaseGeneration).toHaveBeenCalledOnce()
      expect(outputState.releaseSpool).toHaveBeenCalledOnce()
    })
  })

  it('serializes JSON with native array and undefined-value semantics', async () => {
    outputState.payload = {
      ...payload(),
      generatedBy: {
        ...payload().generatedBy,
        roles: ['Admin', undefined, () => undefined],
      },
      serializerFixture: {
        first: 1,
        omitted: undefined,
        second: 2,
      },
    } as unknown as DataSubjectExportV1

    await generateDataSubjectExport(options('json'))

    expect(JSON.parse(outputState.serializedJson)).toMatchObject({
      generatedBy: { roles: ['Admin', null, null] },
      serializerFixture: { first: 1, second: 2 },
    })
  })

  it('propagates non-capacity JSON writer failures', async () => {
    const failure = new Error('writer failed')
    outputState.writeFile.mockRejectedValueOnce(failure)

    await expect(generateDataSubjectExport(options('json'))).rejects.toBe(
      failure,
    )
    expect(outputState.failed).toHaveBeenCalledWith(failure, expect.any(Object))
  })
})

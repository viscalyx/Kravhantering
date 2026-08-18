import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GeneratedOutputStreamLifecycle } from '@/lib/generated-output/spool'
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
    pdfReportMaxRequirements: 100,
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
    activePdf: 1,
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

  it.each(['json', 'pdf'] as const)(
    'records %s response cancellation and stream errors',
    async delivery => {
      await generateDataSubjectExport(options(delivery))

      outputState.lifecycle?.onCancel?.()
      outputState.lifecycle?.onError?.()

      expect(outputState.cancelled).toHaveBeenCalledOnce()
      expect(outputState.failed).toHaveBeenCalledOnce()
      expect(outputState.operations).toEqual([
        `privacy.data_subject_${delivery}_export`,
      ])
    },
  )

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

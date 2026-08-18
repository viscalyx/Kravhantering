import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PdfWorkerData } from '@/lib/pdf/report-worker-contract'

const entryState = vi.hoisted(() => {
  const reportWorkerData = (): PdfWorkerData => ({
    locale: 'sv',
    maxBytes: 2048,
    model: {
      sections: [
        {
          generatedAt: '2026-05-01T00:00:00.000Z',
          requirementId: 'REQ-1',
          status: {
            color: '#dc2626',
            iconName: 'CircleAlert',
            label: 'Review',
          },
          title: 'Report',
          type: 'header',
        },
      ],
    },
    outputPath: '/tmp/report-worker-entry-test.pdf',
  })

  return {
    collectStatusIconNames: vi.fn(() => ['CircleAlert']),
    events: [] as string[],
    pipelineMode: 'success' as
      | 'byte_limit'
      | 'storage_efbig'
      | 'storage_enospc'
      | 'success'
      | 'unexpected',
    pipeline: vi.fn(
      async (_source: unknown, bounded: import('node:stream').Transform) => {
        if (entryState.pipelineMode === 'storage_enospc') {
          throw Object.assign(new Error('disk full'), { code: 'ENOSPC' })
        }
        if (entryState.pipelineMode === 'storage_efbig') {
          throw Object.assign(new Error('file too large'), { code: 'EFBIG' })
        }
        if (entryState.pipelineMode === 'unexpected') {
          throw new Error('renderer failed')
        }

        const size = entryState.pipelineMode === 'byte_limit' ? 2049 : 1024
        await new Promise<void>((resolve, reject) => {
          bounded.once('error', () => undefined)
          bounded.write(Buffer.alloc(size), error => {
            if (error) reject(error)
            else resolve()
          })
        })
      },
    ),
    postMessage: vi.fn(),
    preloadStatusIconNodes: vi.fn(async () => {
      entryState.events.push('preload')
    }),
    renderToStream: vi.fn(async () => {
      entryState.events.push('render')
      return { source: true }
    }),
    reportWorkerData,
    workerData: reportWorkerData(),
  }
})

vi.mock('node:fs', () => {
  const createWriteStream = vi.fn(() => ({ destination: true }))
  return { createWriteStream, default: { createWriteStream } }
})

vi.mock('node:stream/promises', () => ({
  default: { pipeline: entryState.pipeline },
  pipeline: entryState.pipeline,
}))

vi.mock('node:worker_threads', () => {
  const workerThreads = {
    parentPort: { postMessage: entryState.postMessage },
    get workerData() {
      return entryState.workerData
    },
  }
  return { ...workerThreads, default: workerThreads }
})

vi.mock('@react-pdf/renderer', () => ({
  renderToStream: entryState.renderToStream,
}))

vi.mock('@/components/reports/pdf/PdfReportRenderer', () => ({
  default: 'mock-pdf-report',
}))

vi.mock('@/components/privacy/DataSubjectExportPdfRenderer', () => ({
  default: 'mock-data-subject-export',
}))

vi.mock('@/lib/icons/status-icon-allowlist', () => ({
  collectStatusIconNames: entryState.collectStatusIconNames,
  preloadStatusIconNodes: entryState.preloadStatusIconNodes,
}))

describe('PDF report worker entry', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    entryState.events.length = 0
    entryState.pipelineMode = 'success'
    entryState.workerData = entryState.reportWorkerData()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('preloads allowlisted model icons before isolated rendering', async () => {
    await import('@/lib/pdf/report-worker-entry')
    await vi.waitFor(() => expect(entryState.postMessage).toHaveBeenCalled())

    expect(entryState.preloadStatusIconNodes).toHaveBeenCalledWith([
      'CircleAlert',
    ])
    expect(entryState.events).toEqual(['preload', 'render'])
    expect(entryState.postMessage).toHaveBeenCalledWith({
      byteCount: 1024,
      ok: true,
    })
  })

  it('reports output that exceeds the byte bound', async () => {
    entryState.pipelineMode = 'byte_limit'

    await import('@/lib/pdf/report-worker-entry')

    await vi.waitFor(() =>
      expect(entryState.postMessage).toHaveBeenCalledWith({
        failure: 'byte_limit',
        ok: false,
      }),
    )
  })

  it('renders the privacy export document in the isolated worker', async () => {
    entryState.workerData = {
      document: {
        exportData: {
          generatedAt: '2026-05-01T00:00:00.000Z',
          generatedBy: {
            displayName: 'Ada Admin',
            hsaId: 'SE5560000001-admin1',
            roles: ['Admin'],
            source: 'oidc',
          },
          limitations: [],
          schemaVersion: 'privacy-data-subject-export.v1',
          sources: [],
          subject: {
            hsaId: 'SE5560000001-admin1',
            targetFingerprint: '0123456789abcdef',
          },
          summary: { itemCount: 0, limitationCount: 0, sourceCount: 0 },
        },
        kind: 'data-subject-export',
        locale: 'en',
      },
      maxBytes: 2048,
      outputPath: '/tmp/privacy-worker-entry-test.pdf',
    }

    await import('@/lib/pdf/report-worker-entry')
    await vi.waitFor(() => expect(entryState.postMessage).toHaveBeenCalled())

    expect(entryState.collectStatusIconNames).not.toHaveBeenCalled()
    expect(entryState.renderToStream).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'mock-data-subject-export' }),
    )
  })

  it.each(['storage_enospc', 'storage_efbig'] as const)(
    'reports the bounded storage failure %s',
    async pipelineMode => {
      entryState.pipelineMode = pipelineMode

      await import('@/lib/pdf/report-worker-entry')

      await vi.waitFor(() =>
        expect(entryState.postMessage).toHaveBeenCalledWith({
          failure: 'storage',
          ok: false,
        }),
      )
    },
  )

  it('rethrows unexpected rendering failures on the next event-loop turn', async () => {
    entryState.pipelineMode = 'unexpected'
    const setImmediate = vi.fn()
    vi.stubGlobal('setImmediate', setImmediate)

    await import('@/lib/pdf/report-worker-entry')
    await vi.waitFor(() => expect(setImmediate).toHaveBeenCalled())

    const rethrow = setImmediate.mock.calls[0]?.[0] as () => void
    expect(rethrow).toThrow('renderer failed')
    expect(entryState.postMessage).not.toHaveBeenCalled()
  })
})

import { describe, expect, it, vi } from 'vitest'

const entryState = vi.hoisted(() => ({
  collectStatusIconNames: vi.fn(() => ['CircleAlert']),
  events: [] as string[],
  pipeline: vi.fn(async () => undefined),
  postMessage: vi.fn(),
  preloadStatusIconNodes: vi.fn(async () => {
    entryState.events.push('preload')
  }),
  renderToStream: vi.fn(async () => {
    entryState.events.push('render')
    return { source: true }
  }),
}))

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
    workerData: {
      locale: 'sv',
      maxBytes: 2048,
      model: {
        sections: [
          {
            generatedAt: '2026-05-01T00:00:00.000Z',
            requirementId: 'REQ-1',
            status: { iconName: 'CircleAlert' },
            title: 'Report',
            type: 'header',
          },
        ],
      },
      outputPath: '/tmp/report-worker-entry-test.pdf',
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

vi.mock('@/lib/icons/status-icon-allowlist', () => ({
  collectStatusIconNames: entryState.collectStatusIconNames,
  preloadStatusIconNodes: entryState.preloadStatusIconNodes,
}))

describe('PDF report worker entry', () => {
  it('preloads allowlisted model icons before isolated rendering', async () => {
    await import('@/lib/pdf/report-worker-entry')
    await vi.waitFor(() => expect(entryState.postMessage).toHaveBeenCalled())

    expect(entryState.preloadStatusIconNodes).toHaveBeenCalledWith([
      'CircleAlert',
    ])
    expect(entryState.events).toEqual(['preload', 'render'])
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

const responseState = vi.hoisted(() => ({
  collectStatusIconNames: vi.fn(() => ['CircleAlert']),
  events: [] as string[],
  preloadStatusIconNodes: vi.fn(async () => {
    responseState.events.push('preload')
  }),
  renderPdfResponse: vi.fn(async () => {
    responseState.events.push('render')
    return new Response('%PDF')
  }),
}))

vi.mock('@/components/reports/pdf/PdfReportRenderer', () => ({
  default: 'mock-pdf-report',
}))

vi.mock('@/lib/icons/status-icon-allowlist', () => ({
  collectStatusIconNames: responseState.collectStatusIconNames,
  preloadStatusIconNodes: responseState.preloadStatusIconNodes,
}))

vi.mock('@/lib/pdf/server-response', () => ({
  renderPdfResponse: responseState.renderPdfResponse,
}))

import { renderReportModelPdfResponse } from '@/components/reports/pdf/report-response'

describe('report PDF response', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    responseState.events.length = 0
  })

  it('preloads allowlisted model icons before server rendering', async () => {
    const model = {
      sections: [
        {
          type: 'header' as const,
          generatedAt: '2026-05-01T00:00:00.000Z',
          requirementId: 'REQ-1',
          status: {
            color: '#22c55e',
            iconName: 'CircleAlert',
            label: 'Published',
          },
          title: 'Report',
        },
      ],
    }

    await renderReportModelPdfResponse(model, 'en', 'report.pdf')

    expect(responseState.collectStatusIconNames).toHaveBeenCalledWith(model)
    expect(responseState.preloadStatusIconNodes).toHaveBeenCalledWith([
      'CircleAlert',
    ])
    expect(responseState.events).toEqual(['preload', 'render'])
  })
})

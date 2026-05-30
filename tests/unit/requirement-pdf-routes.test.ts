import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const routeState = vi.hoisted(() => ({
  ReportDataError: class MockReportDataError extends Error {
    status: number

    constructor(message: string, status = 500) {
      super(message)
      this.name = 'ReportDataError'
      this.status = status
    }
  },
  buildListReport: vi.fn(),
  buildReviewReport: vi.fn(),
  collectMultipleRequirementsForReport: vi.fn(),
  collectRequirementForReport: vi.fn(),
  getRequestSqlServerDataSource: vi.fn(() => ({ db: true })),
  renderReportModelPdfResponse: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: routeState.getRequestSqlServerDataSource,
}))

vi.mock('@/lib/reports/data/server', () => ({
  ReportDataError: routeState.ReportDataError,
  collectMultipleRequirementsForReport:
    routeState.collectMultipleRequirementsForReport,
  collectRequirementForReport: routeState.collectRequirementForReport,
}))

vi.mock('@/lib/reports/templates/list-template', () => ({
  buildListReport: routeState.buildListReport,
}))

vi.mock('@/lib/reports/templates/review-template', () => ({
  buildReviewReport: routeState.buildReviewReport,
}))

vi.mock('@/components/reports/pdf/report-response', () => ({
  renderReportModelPdfResponse: routeState.renderReportModelPdfResponse,
}))

function pdfResponse(filename: string): Response {
  return new Response('%PDF', {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Type': 'application/pdf',
    },
  })
}

function requirement(uniqueId = 'REQ-1') {
  return {
    area: null,
    createdAt: '2026-05-12T12:00:00.000Z',
    id: 1,
    isArchived: false,
    uniqueId,
    versions: [],
  }
}

describe('requirement PDF routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeState.collectRequirementForReport.mockResolvedValue(requirement())
    routeState.collectMultipleRequirementsForReport.mockResolvedValue([
      requirement('REQ-1'),
      requirement('REQ-2'),
    ])
    routeState.buildReviewReport.mockReturnValue({ kind: 'review' })
    routeState.buildListReport.mockReturnValue({ kind: 'list' })
    routeState.renderReportModelPdfResponse.mockImplementation(
      (_model, _locale, filename) => Promise.resolve(pdfResponse(filename)),
    )
  })

  it('returns a binary review PDF for a requirement id', async () => {
    const { GET } = await import(
      '@/app/[locale]/requirements/reports/pdf/review/[id]/route'
    )

    const response = await GET(
      new NextRequest('http://localhost/sv/requirements/reports/pdf/review/1'),
      { params: Promise.resolve({ id: '1', locale: 'sv' }) },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('application/pdf')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(routeState.collectRequirementForReport).toHaveBeenCalledWith(
      { db: true },
      '1',
    )
    expect(routeState.buildReviewReport).toHaveBeenCalledWith(
      requirement(),
      'sv',
    )
    expect(routeState.renderReportModelPdfResponse).toHaveBeenCalledWith(
      { kind: 'review' },
      'sv',
      'Granskningsrapport REQ-1.pdf',
    )
  })

  it('returns a no-store 404 when the requirement cannot be found', async () => {
    routeState.collectRequirementForReport.mockRejectedValueOnce(
      new routeState.ReportDataError('Requirement not found: missing', 404),
    )
    const { GET } = await import(
      '@/app/[locale]/requirements/reports/pdf/review/[id]/route'
    )

    const response = await GET(
      new NextRequest(
        'http://localhost/sv/requirements/reports/pdf/review/missing',
      ),
      { params: Promise.resolve({ id: 'missing', locale: 'sv' }) },
    )
    const body = (await response.json()) as { error: string }

    expect(response.status).toBe(404)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(body.error).toBe('Requirement not found: missing')
    expect(routeState.renderReportModelPdfResponse).not.toHaveBeenCalled()
  })

  it('returns a binary list PDF for selected ids', async () => {
    const { GET } = await import(
      '@/app/[locale]/requirements/reports/pdf/list/route'
    )

    const response = await GET(
      new NextRequest(
        'http://localhost/en/requirements/reports/pdf/list?ids=1,REQ-2',
      ),
      { params: Promise.resolve({ locale: 'en' }) },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('application/pdf')
    expect(
      routeState.collectMultipleRequirementsForReport,
    ).toHaveBeenCalledWith({ db: true }, ['1', 'REQ-2'])
    expect(routeState.buildListReport).toHaveBeenCalledWith(
      [requirement('REQ-1'), requirement('REQ-2')],
      'en',
    )
    expect(routeState.renderReportModelPdfResponse).toHaveBeenCalledWith(
      { kind: 'list' },
      'en',
      expect.stringMatching(/^Requirements List \d{4}-\d{2}-\d{2} /),
    )
  })

  it('rejects list PDFs without ids before opening the database', async () => {
    const { GET } = await import(
      '@/app/[locale]/requirements/reports/pdf/list/route'
    )

    const response = await GET(
      new NextRequest('http://localhost/sv/requirements/reports/pdf/list'),
      { params: Promise.resolve({ locale: 'sv' }) },
    )
    const body = (await response.json()) as { error: string }

    expect(response.status).toBe(400)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(body.error).toBe('No requirement IDs provided')
    expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
    expect(
      routeState.collectMultipleRequirementsForReport,
    ).not.toHaveBeenCalled()
  })
})

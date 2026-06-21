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
  buildCombinedReviewReport: vi.fn(),
  buildDeviationReviewReport: vi.fn(),
  buildReviewReport: vi.fn(),
  buildSpecificationProfileReport: vi.fn(),
  collectDeviationForReport: vi.fn(),
  collectMultipleRequirementsForReport: vi.fn(),
  collectMultiplePublishedRequirementsForReport: vi.fn(),
  collectRequirementForReport: vi.fn(),
  collectSpecificationOutputData: vi.fn(),
  collectSuggestionsForReport: vi.fn(),
  context: {
    actor: {
      displayName: 'Report Tester',
      hsaId: 'SE5560000001-report',
      id: 'report-test',
      isAuthenticated: true,
      roles: [],
      source: 'oidc',
    },
    correlationId: 'corr-report',
    requestId: 'req-report',
    source: 'rest',
  },
  createRequirementsRestRuntime: vi.fn(),
  getSpecificationBySlug: vi.fn(),
  getSpecificationItemById: vi.fn(),
  getRequestSqlServerDataSource: vi.fn(() => ({ db: true })),
  authorization: {
    assertAuthorized: vi.fn(),
  },
  listSpecificationRequirementSelectionQuestions: vi.fn(),
  parseLibrarySpecificationItemId: vi.fn(),
  parseSpecificationItemRef: vi.fn(),
  renderReportModelPdfResponse: vi.fn(),
  resolveSpecificationId: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: routeState.getRequestSqlServerDataSource,
}))

vi.mock('@/lib/reports/data/server', () => ({
  ReportDataError: routeState.ReportDataError,
  collectDeviationForReport: routeState.collectDeviationForReport,
  collectMultipleRequirementsForReport:
    routeState.collectMultipleRequirementsForReport,
  collectMultiplePublishedRequirementsForReport:
    routeState.collectMultiplePublishedRequirementsForReport,
  collectRequirementForReport: routeState.collectRequirementForReport,
  collectSuggestionsForReport: routeState.collectSuggestionsForReport,
  parseLibrarySpecificationItemId: routeState.parseLibrarySpecificationItemId,
}))

vi.mock('@/lib/reports/data/specification-output', () => ({
  collectSpecificationOutputData: routeState.collectSpecificationOutputData,
}))

vi.mock('@/lib/dal/requirements-specifications', () => ({
  getSpecificationBySlug: routeState.getSpecificationBySlug,
  getSpecificationItemById: routeState.getSpecificationItemById,
  parseSpecificationItemRef: routeState.parseSpecificationItemRef,
}))

vi.mock('@/lib/dal/requirement-selection-questions', () => ({
  listSpecificationRequirementSelectionQuestions:
    routeState.listSpecificationRequirementSelectionQuestions,
  resolveSpecificationId: routeState.resolveSpecificationId,
}))

vi.mock('@/lib/requirements/server', () => ({
  createRequirementsRestRuntime: routeState.createRequirementsRestRuntime,
}))

vi.mock('@/lib/reports/templates/list-template', () => ({
  buildListReport: routeState.buildListReport,
}))

vi.mock('@/lib/reports/templates/combined-review-template', () => ({
  buildCombinedReviewReport: routeState.buildCombinedReviewReport,
}))

vi.mock('@/lib/reports/templates/deviation-review-template', () => ({
  buildDeviationReviewReport: routeState.buildDeviationReviewReport,
}))

vi.mock('@/lib/reports/templates/review-template', () => ({
  buildReviewReport: routeState.buildReviewReport,
}))

vi.mock('@/lib/reports/templates/specification-profile-template', () => ({
  buildSpecificationProfileReport: routeState.buildSpecificationProfileReport,
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

function reportIds(count: number): string[] {
  return Array.from({ length: count }, (_, index) => String(index + 1))
}

describe('requirement PDF routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeState.authorization.assertAuthorized.mockResolvedValue(undefined)
    routeState.createRequirementsRestRuntime.mockResolvedValue({
      authorization: routeState.authorization,
      context: routeState.context,
      db: { db: true },
    })
    routeState.collectRequirementForReport.mockResolvedValue(requirement())
    routeState.collectDeviationForReport.mockResolvedValue({
      requirementUniqueId: 'REQ-1',
    })
    routeState.collectMultipleRequirementsForReport.mockResolvedValue([
      requirement('REQ-1'),
      requirement('REQ-2'),
    ])
    routeState.collectMultiplePublishedRequirementsForReport.mockResolvedValue([
      requirement('REQ-1'),
      requirement('REQ-2'),
    ])
    routeState.collectSuggestionsForReport.mockResolvedValue([])
    routeState.buildCombinedReviewReport.mockReturnValue({
      kind: 'combined-review',
    })
    routeState.buildDeviationReviewReport.mockReturnValue({
      kind: 'deviation-review',
    })
    routeState.buildReviewReport.mockReturnValue({ kind: 'review' })
    routeState.buildListReport.mockReturnValue({ kind: 'list' })
    routeState.buildSpecificationProfileReport.mockReturnValue({
      kind: 'specification-profile',
    })
    routeState.collectSpecificationOutputData.mockResolvedValue({
      items: [],
      specification: {
        businessNeedsReference: null,
        governanceObjectType: null,
        implementationType: null,
        lifecycleStatus: null,
        specificationLifecycleStatusId: 1,
        name: 'Specification',
        uniqueId: 'SPEC-1',
      },
    })
    routeState.getSpecificationBySlug.mockResolvedValue({
      specificationLifecycleStatusId: 1,
    })
    routeState.getSpecificationItemById.mockResolvedValue({
      specificationId: 42,
    })
    routeState.listSpecificationRequirementSelectionQuestions.mockResolvedValue(
      [],
    )
    routeState.parseSpecificationItemRef.mockReturnValue({
      id: 55,
      kind: 'library',
    })
    routeState.parseLibrarySpecificationItemId.mockReturnValue(55)
    routeState.resolveSpecificationId.mockResolvedValue(42)
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
    expect(routeState.authorization.assertAuthorized).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'get_requirement', view: 'history' }),
      routeState.context,
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
      routeState.collectMultiplePublishedRequirementsForReport,
    ).toHaveBeenCalledWith({ db: true }, ['1', 'REQ-2'])
    expect(routeState.authorization.assertAuthorized).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'get_requirement', view: 'detail' }),
      routeState.context,
    )
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

  it('accepts list PDFs with more than 50 requirement ids', async () => {
    const ids = reportIds(60)
    const { GET } = await import(
      '@/app/[locale]/requirements/reports/pdf/list/route'
    )

    const response = await GET(
      new NextRequest(
        `http://localhost/en/requirements/reports/pdf/list?ids=${ids.join(',')}`,
      ),
      { params: Promise.resolve({ locale: 'en' }) },
    )

    expect(response.status).toBe(200)
    expect(
      routeState.collectMultiplePublishedRequirementsForReport,
    ).toHaveBeenCalledWith({ db: true }, ids)
  })

  it('accepts combined review PDFs with more than 50 requirement ids', async () => {
    const ids = reportIds(60)
    const { GET } = await import(
      '@/app/[locale]/requirements/reports/pdf/review-combined/route'
    )

    const response = await GET(
      new NextRequest(
        `http://localhost/sv/requirements/reports/pdf/review-combined?ids=${ids.join(',')}`,
      ),
      { params: Promise.resolve({ locale: 'sv' }) },
    )

    expect(response.status).toBe(200)
    expect(
      routeState.collectMultipleRequirementsForReport,
    ).toHaveBeenCalledWith({ db: true }, ids)
    expect(routeState.buildCombinedReviewReport).toHaveBeenCalledWith(
      [requirement('REQ-1'), requirement('REQ-2')],
      'sv',
    )
    expect(routeState.renderReportModelPdfResponse).toHaveBeenCalledWith(
      { kind: 'combined-review' },
      'sv',
      expect.stringMatching(
        /^Kombinerad granskningsrapport \d{4}-\d{2}-\d{2} /,
      ),
    )
  })

  it('returns localized PDF filenames for history, deviation, suggestion, and specification reports', async () => {
    routeState.getSpecificationBySlug.mockResolvedValueOnce({
      specificationLifecycleStatusId: 3,
    })
    routeState.collectSpecificationOutputData.mockResolvedValueOnce({
      items: [],
      specification: {
        businessNeedsReference: null,
        governanceObjectType: null,
        implementationType: null,
        lifecycleStatus: null,
        specificationLifecycleStatusId: 3,
        name: 'Införande',
        uniqueId: 'SPEC-2',
      },
    })

    const { GET: historyGET } = await import(
      '@/app/[locale]/requirements/reports/pdf/history/[id]/route'
    )
    const { GET: deviationGET } = await import(
      '@/app/[locale]/requirements/reports/pdf/deviation-review/[id]/route'
    )
    const { GET: suggestionGET } = await import(
      '@/app/[locale]/requirements/reports/pdf/suggestion-history/[id]/route'
    )
    const { GET: specificationGET } = await import(
      '@/app/[locale]/specifications/[slug]/reports/pdf/[profile]/route'
    )

    await historyGET(
      new NextRequest('http://localhost/sv/requirements/reports/pdf/history/1'),
      { params: Promise.resolve({ id: '1', locale: 'sv' }) },
    )
    await deviationGET(
      new NextRequest(
        'http://localhost/sv/requirements/reports/pdf/deviation-review/1?item=lib:55',
      ),
      { params: Promise.resolve({ id: '1', locale: 'sv' }) },
    )
    await suggestionGET(
      new NextRequest(
        'http://localhost/sv/requirements/reports/pdf/suggestion-history/1',
      ),
      { params: Promise.resolve({ id: '1', locale: 'sv' }) },
    )
    await specificationGET(
      new NextRequest(
        'http://localhost/sv/specifications/SPEC-2/reports/pdf/progress',
      ),
      {
        params: Promise.resolve({
          locale: 'sv',
          profile: 'progress',
          slug: 'SPEC-2',
        }),
      },
    )

    expect(routeState.renderReportModelPdfResponse).toHaveBeenCalledWith(
      expect.anything(),
      'sv',
      'Historikrapport REQ-1.pdf',
    )
    expect(routeState.renderReportModelPdfResponse).toHaveBeenCalledWith(
      expect.anything(),
      'sv',
      'Granskningsrapport avsteg REQ-1.pdf',
    )
    expect(routeState.renderReportModelPdfResponse).toHaveBeenCalledWith(
      expect.anything(),
      'sv',
      'Ändringsförslagshistorik REQ-1.pdf',
    )
    expect(routeState.renderReportModelPdfResponse).toHaveBeenCalledWith(
      { kind: 'specification-profile' },
      'sv',
      'Genomföranderapport Införande SPEC-2.pdf',
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
    expect(routeState.createRequirementsRestRuntime).not.toHaveBeenCalled()
    expect(
      routeState.collectMultiplePublishedRequirementsForReport,
    ).not.toHaveBeenCalled()
  })

  it('rejects review PDFs before collecting data when authorization is denied', async () => {
    routeState.authorization.assertAuthorized.mockRejectedValueOnce(
      Object.assign(new Error('Forbidden'), {
        code: 'forbidden',
        status: 403,
      }),
    )
    const { GET } = await import(
      '@/app/[locale]/requirements/reports/pdf/review/[id]/route'
    )

    const response = await GET(
      new NextRequest('http://localhost/sv/requirements/reports/pdf/review/1'),
      { params: Promise.resolve({ id: '1', locale: 'sv' }) },
    )
    const body = (await response.json()) as { error: string }

    expect(response.status).toBe(403)
    expect(body.error).toBe('Forbidden')
    expect(routeState.collectRequirementForReport).not.toHaveBeenCalled()
    expect(routeState.renderReportModelPdfResponse).not.toHaveBeenCalled()
  })

  it('authorizes specification profile PDFs before collecting report data', async () => {
    const { GET } = await import(
      '@/app/[locale]/specifications/[slug]/reports/pdf/[profile]/route'
    )

    const response = await GET(
      new NextRequest(
        'http://localhost/en/specifications/SPEC-1/reports/pdf/procurement',
      ),
      {
        params: Promise.resolve({
          locale: 'en',
          profile: 'procurement',
          slug: 'SPEC-1',
        }),
      },
    )

    expect(response.status).toBe(200)
    expect(routeState.authorization.assertAuthorized).toHaveBeenCalledWith(
      { kind: 'get_specification_items', specificationId: 42 },
      routeState.context,
    )
    expect(routeState.collectSpecificationOutputData).toHaveBeenCalledWith(
      { db: true },
      'SPEC-1',
    )
    expect(routeState.buildSpecificationProfileReport).toHaveBeenCalledWith(
      expect.objectContaining({
        specification: expect.objectContaining({ uniqueId: 'SPEC-1' }),
      }),
      'procurement',
      'en',
    )
  })

  it('rejects deviation review PDFs before collecting report data when specification authorization is denied', async () => {
    routeState.authorization.assertAuthorized.mockRejectedValueOnce(
      Object.assign(new Error('Forbidden'), {
        code: 'forbidden',
        status: 403,
      }),
    )
    const { GET } = await import(
      '@/app/[locale]/requirements/reports/pdf/deviation-review/[id]/route'
    )

    const response = await GET(
      new NextRequest(
        'http://localhost/sv/requirements/reports/pdf/deviation-review/1?item=lib:55',
      ),
      { params: Promise.resolve({ id: '1', locale: 'sv' }) },
    )

    expect(response.status).toBe(403)
    expect(routeState.parseLibrarySpecificationItemId).toHaveBeenCalledWith(
      'lib:55',
    )
    expect(routeState.getSpecificationItemById).toHaveBeenCalledWith(
      { db: true },
      55,
    )
    expect(routeState.collectDeviationForReport).not.toHaveBeenCalled()
    expect(routeState.renderReportModelPdfResponse).not.toHaveBeenCalled()
  })
})

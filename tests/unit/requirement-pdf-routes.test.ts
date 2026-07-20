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
  collectMultipleRequirementListItemsForReport: vi.fn(),
  collectMultipleRequirementsForReport: vi.fn(),
  collectRequirementForReport: vi.fn(),
  collectCompleteSpecificationOutputData: vi.fn(),
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
  getSpecificationById: vi.fn(),
  getSpecificationItemById: vi.fn(),
  getRequestSqlServerDataSource: vi.fn(() => ({ db: true })),
  getApplicationSettings: vi.fn(),
  authorization: {
    assertAuthorized: vi.fn(),
  },
  listSpecificationRequirementSelectionQuestions: vi.fn(),
  parseLibrarySpecificationItemId: vi.fn(),
  parseSpecificationItemRef: vi.fn(),
  traverseCompleteRequirementList: vi.fn(),
  renderReportModelPdfResponse: vi.fn(),
  renderReportInWorker: vi.fn(),
  resolveSpecificationId: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: routeState.getRequestSqlServerDataSource,
}))

vi.mock('@/lib/dal/application-settings', () => ({
  getApplicationSettings: routeState.getApplicationSettings,
}))

vi.mock('@/lib/pdf/report-worker', () => ({
  renderReportInWorker: routeState.renderReportInWorker,
}))

vi.mock('@/lib/generated-output/spool', () => ({
  acquireGeneratedOutputSpool: vi.fn(async () => ({
    filePath: '/tmp/generated-output-test.pdf',
    releaseGeneration: vi.fn(),
    releaseSpool: vi.fn(async () => {}),
  })),
  createGeneratedOutputFileResponse: vi.fn(
    async (_spool, headers: HeadersInit) =>
      new Response('%PDF', { headers, status: 200 }),
  ),
  generatedOutputCapacitySnapshot: vi.fn(() => ({
    activeCsv: 0,
    activePdf: 1,
    reservedBytes: 50 * 1024 * 1024,
  })),
}))

vi.mock('@/lib/reports/data/server', () => ({
  ReportDataError: routeState.ReportDataError,
  collectDeviationForReport: routeState.collectDeviationForReport,
  collectMultipleRequirementListItemsForReport:
    routeState.collectMultipleRequirementListItemsForReport,
  collectMultipleRequirementsForReport:
    routeState.collectMultipleRequirementsForReport,
  collectRequirementForReport: routeState.collectRequirementForReport,
  collectSuggestionsForReport: routeState.collectSuggestionsForReport,
  parseLibrarySpecificationItemId: routeState.parseLibrarySpecificationItemId,
}))

vi.mock('@/lib/reports/data/specification-output', () => ({
  collectCompleteSpecificationOutputData:
    routeState.collectCompleteSpecificationOutputData,
}))

vi.mock('@/lib/dal/requirements-specifications', () => ({
  getSpecificationById: routeState.getSpecificationById,
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

vi.mock('@/lib/requirements/list-query', () => ({
  traverseCompleteRequirementList: routeState.traverseCompleteRequirementList,
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

function listRequirement(id: number, uniqueId = `REQ-${id}`) {
  return {
    area: { id: 8, name: 'Security' },
    createdAt: '2026-05-12T12:00:00.000Z',
    hasPendingVersion: false,
    id,
    isArchived: false,
    normReferenceIds: [],
    normReferenceUris: [],
    pendingVersionStatusColor: null,
    pendingVersionStatusIconName: null,
    pendingVersionStatusId: null,
    requirementPackages: [{ id: 9, name: 'Baseline' }],
    suggestionCount: 0,
    uniqueId,
    version: {
      acceptanceCriteria: null,
      archiveInitiatedAt: null,
      categoryId: null,
      categoryNameEn: null,
      categoryNameSv: null,
      description: `Requirement ${id}`,
      id: id * 10,
      priorityLevelColor: null,
      priorityLevelIconName: null,
      priorityLevelId: null,
      priorityLevelNameEn: null,
      priorityLevelNameSv: null,
      priorityLevelSortOrder: null,
      qualityCharacteristicId: null,
      qualityCharacteristicNameEn: null,
      qualityCharacteristicNameSv: null,
      verifiable: false,
      revisionToken: `rev-${id}`,
      status: 2,
      statusColor: '#eab308',
      statusIconName: 'clock',
      statusNameEn: 'Review',
      statusNameSv: 'Granskning',
      typeId: null,
      typeNameEn: null,
      typeNameSv: null,
      versionCreatedAt: '2026-05-12T13:00:00.000Z',
      versionNumber: id,
    },
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
    routeState.getApplicationSettings.mockResolvedValue({
      csvExportConcurrencyPerNode: 5,
      csvExportMaxFileBytes: 100 * 1024 * 1024,
      csvExportMaxRequirements: 1000,
      csvExportTimeoutSeconds: 120,
      pdfReportConcurrencyPerNode: 3,
      pdfReportMaxFileBytes: 50 * 1024 * 1024,
      pdfReportMaxRequirements: 1000,
      pdfReportTimeoutSeconds: 180,
      pdfWorkerMemoryMib: 512,
    })
    routeState.renderReportInWorker.mockResolvedValue(4)
    routeState.collectRequirementForReport.mockResolvedValue(requirement())
    routeState.collectDeviationForReport.mockResolvedValue({
      requirementUniqueId: 'REQ-1',
    })
    routeState.collectMultipleRequirementsForReport.mockResolvedValue([
      requirement('REQ-1'),
      requirement('REQ-2'),
    ])
    routeState.collectMultipleRequirementListItemsForReport.mockResolvedValue([
      requirement('REQ-1'),
      requirement('REQ-2'),
    ])
    routeState.traverseCompleteRequirementList.mockImplementation(
      async (
        _db: unknown,
        _input: unknown,
        _authorization: unknown,
        visitPage: (rows: unknown[], page: number) => void | Promise<void>,
      ) => {
        await visitPage([listRequirement(1), listRequirement(2)], 1)
        return { itemCount: 2, pageCount: 1 }
      },
    )
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
    routeState.collectCompleteSpecificationOutputData.mockResolvedValue({
      items: [],
      specification: {
        businessNeedsReference: null,
        governanceObjectType: null,
        implementationType: null,
        lifecycleStatus: null,
        specificationLifecycleStatusId: 1,
        name: 'Specification',
        specificationCode: 'SPEC-1',
      },
    })
    routeState.getSpecificationById.mockResolvedValue({
      id: 42,
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
      routeState.collectMultipleRequirementListItemsForReport,
    ).toHaveBeenCalledWith({ db: true }, ['1', 'REQ-2'])
    expect(routeState.authorization.assertAuthorized).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'get_requirement', view: 'detail' }),
      routeState.context,
    )
    expect(routeState.buildListReport).toHaveBeenCalledWith(
      [requirement('REQ-1'), requirement('REQ-2')],
      'en',
    )
    expect(routeState.renderReportInWorker).toHaveBeenCalledWith(
      expect.objectContaining({
        locale: 'en',
        maxBytes: 50 * 1024 * 1024,
        memoryLimitMib: 512,
        model: { kind: 'list' },
      }),
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
      routeState.collectMultipleRequirementListItemsForReport,
    ).toHaveBeenCalledWith({ db: true }, ids)
  })

  it('authorizes and collects explicit list PDF ids only once', async () => {
    const { GET } = await import(
      '@/app/[locale]/requirements/reports/pdf/list/route'
    )

    const response = await GET(
      new NextRequest(
        'http://localhost/en/requirements/reports/pdf/list?ids=1,REQ-2,1,REQ-2',
      ),
      { params: Promise.resolve({ locale: 'en' }) },
    )

    expect(response.status).toBe(200)
    expect(
      routeState.collectMultipleRequirementListItemsForReport,
    ).toHaveBeenCalledWith({ db: true }, ['1', 'REQ-2'])
    expect(routeState.authorization.assertAuthorized).toHaveBeenCalledTimes(2)
  })

  it('rejects explicit list PDFs above the Admin item limit', async () => {
    const ids = reportIds(1001)
    const { GET } = await import(
      '@/app/[locale]/requirements/reports/pdf/list/route'
    )

    const response = await GET(
      new NextRequest(
        `http://localhost/en/requirements/reports/pdf/list?ids=${ids.join(',')}`,
      ),
      { params: Promise.resolve({ locale: 'en' }) },
    )

    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toMatchObject({
      code: 'output_limit_exceeded',
      details: { limit: 1000, limitKind: 'items', output: 'pdf' },
    })
    expect(routeState.renderReportInWorker).not.toHaveBeenCalled()
  })

  it('maps PDF worker memory exhaustion to the stable 503 contract', async () => {
    const { GeneratedOutputError } = await import(
      '@/lib/generated-output/errors'
    )
    routeState.renderReportInWorker.mockRejectedValueOnce(
      new GeneratedOutputError(
        'pdf_worker_memory_exceeded',
        'worker_memory_exceeded',
        { output: 'pdf' },
      ),
    )
    const { GET } = await import(
      '@/app/[locale]/requirements/reports/pdf/list/route'
    )
    const response = await GET(
      new NextRequest(
        'http://localhost/en/requirements/reports/pdf/list?ids=1',
      ),
      { params: Promise.resolve({ locale: 'en' }) },
    )

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({
      code: 'pdf_worker_memory_exceeded',
      details: { output: 'pdf' },
    })
  })

  it('resolves list PDFs from the complete active filter and sort query', async () => {
    routeState.traverseCompleteRequirementList.mockImplementationOnce(
      async (
        _db: unknown,
        _input: unknown,
        _authorization: unknown,
        visitPage: (rows: unknown[], page: number) => void | Promise<void>,
      ) => {
        await visitPage([listRequirement(1, 'REQ-1')], 1)
        await visitPage([listRequirement(2, 'REQ-2')], 2)
        return { itemCount: 2, pageCount: 2 }
      },
    )
    const { GET } = await import(
      '@/app/[locale]/requirements/reports/pdf/list/route'
    )

    const response = await GET(
      new NextRequest(
        'http://localhost/sv/requirements/reports/pdf/list?locale=sv&sortBy=status&sortDirection=desc&statuses=2&statuses=3&uniqueIdSearch=REQ',
      ),
      { params: Promise.resolve({ locale: 'sv' }) },
    )

    expect(response.status).toBe(200)
    expect(routeState.traverseCompleteRequirementList).toHaveBeenCalledWith(
      { db: true },
      {
        filters: {
          areaIds: undefined,
          categoryIds: undefined,
          descriptionSearch: undefined,
          needsReferenceIds: undefined,
          normReferenceIds: undefined,
          priorityLevelIds: undefined,
          qualityCharacteristicIds: undefined,
          requirementPackageIds: undefined,
          verifiable: undefined,
          specificationItemStatusIds: undefined,
          statuses: [2, 3],
          typeIds: undefined,
          uniqueIdSearch: 'REQ',
        },
        locale: 'sv',
        sort: { by: 'status', direction: 'desc' },
      },
      {
        authorization: routeState.authorization,
        context: routeState.context,
      },
      expect.any(Function),
      expect.objectContaining({ maxItems: 1000 }),
    )
    expect(
      routeState.collectMultipleRequirementListItemsForReport,
    ).not.toHaveBeenCalled()
    expect(routeState.buildListReport).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          id: 1,
          uniqueId: 'REQ-1',
          versions: [
            expect.objectContaining({
              description: 'Requirement 1',
              status: 2,
              versionNumber: 1,
            }),
          ],
        }),
        expect.objectContaining({
          id: 2,
          uniqueId: 'REQ-2',
        }),
      ],
      'sv',
    )
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
    routeState.getSpecificationById.mockResolvedValueOnce({
      id: 42,
      specificationLifecycleStatusId: 3,
    })
    routeState.collectCompleteSpecificationOutputData.mockResolvedValueOnce({
      items: [],
      specification: {
        businessNeedsReference: null,
        governanceObjectType: null,
        implementationType: null,
        lifecycleStatus: null,
        specificationLifecycleStatusId: 3,
        name: 'Införande',
        specificationCode: 'SPEC-2',
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
      '@/app/[locale]/specifications/[specificationId]/reports/pdf/[profile]/route'
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
        'http://localhost/sv/specifications/42/reports/pdf/progress',
      ),
      {
        params: Promise.resolve({
          locale: 'sv',
          profile: 'progress',
          specificationId: '42',
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
      'Avstegsgranskningsrapport REQ-1.pdf',
    )
    expect(routeState.renderReportModelPdfResponse).toHaveBeenCalledWith(
      expect.anything(),
      'sv',
      'Förbättringsförslagshistorik REQ-1.pdf',
    )
    expect(routeState.renderReportModelPdfResponse).toHaveBeenCalledWith(
      { kind: 'specification-profile' },
      'sv',
      'Genomföranderapport Införande SPEC-2.pdf',
    )
  })

  it('rejects filter-based list PDFs when no requirements match', async () => {
    routeState.traverseCompleteRequirementList.mockImplementationOnce(
      async (
        _db: unknown,
        _input: unknown,
        _authorization: unknown,
        visitPage: (rows: unknown[], page: number) => void,
      ) => {
        visitPage([], 1)
        return { itemCount: 0, pageCount: 1 }
      },
    )
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
    expect(body.error).toBe('No requirements matched report filters')
    expect(routeState.createRequirementsRestRuntime).toHaveBeenCalled()
    expect(
      routeState.collectMultipleRequirementListItemsForReport,
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
      '@/app/[locale]/specifications/[specificationId]/reports/pdf/[profile]/route'
    )

    const response = await GET(
      new NextRequest(
        'http://localhost/en/specifications/42/reports/pdf/procurement',
      ),
      {
        params: Promise.resolve({
          locale: 'en',
          profile: 'procurement',
          specificationId: '42',
        }),
      },
    )

    expect(response.status).toBe(200)
    expect(routeState.authorization.assertAuthorized).toHaveBeenCalledWith(
      { kind: 'get_specification_items', specificationId: 42 },
      routeState.context,
    )
    expect(
      routeState.collectCompleteSpecificationOutputData,
    ).toHaveBeenCalledWith({ db: true }, 42)
    expect(routeState.buildSpecificationProfileReport).toHaveBeenCalledWith(
      expect.objectContaining({
        specification: expect.objectContaining({ specificationCode: 'SPEC-1' }),
      }),
      'procurement',
      'en',
    )
  })

  it('rejects oversized specification profile PDF ids before lookup', async () => {
    const { GET } = await import(
      '@/app/[locale]/specifications/[specificationId]/reports/pdf/[profile]/route'
    )

    const response = await GET(
      new NextRequest(
        'http://localhost/en/specifications/2147483648/reports/pdf/procurement',
      ),
      {
        params: Promise.resolve({
          locale: 'en',
          profile: 'procurement',
          specificationId: '2147483648',
        }),
      },
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: 'Specification not found: 2147483648',
    })
    expect(routeState.getSpecificationById).not.toHaveBeenCalled()
    expect(routeState.authorization.assertAuthorized).not.toHaveBeenCalled()
    expect(
      routeState.collectCompleteSpecificationOutputData,
    ).not.toHaveBeenCalled()
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

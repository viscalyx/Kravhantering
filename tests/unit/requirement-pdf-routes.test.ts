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
  buildSpecificationTraceabilityReport: vi.fn(),
  assertRequirementReportItemLimit: vi.fn(),
  collectDeviationForReport: vi.fn(),
  collectMultipleRequirementListItemsForReport: vi.fn(),
  collectMultipleRequirementsForReport: vi.fn(),
  collectRequirementForReport: vi.fn(),
  collectCompleteSpecificationOutputData: vi.fn(),
  collectSuggestionsForReport: vi.fn(),
  collectSpecificationTraceabilityData: vi.fn(),
  context: {
    actor: {
      displayName: 'Report Tester',
      hsaId: 'SE5560000001-report',
      id: 'report-test',
      isAuthenticated: true,
      roles: [],
      source: 'oidc' as const,
    },
    correlationId: 'corr-report',
    requestId: 'req-report',
    source: 'rest' as const,
  },
  acquireGeneratedOutputSpool: vi.fn(),
  createGeneratedOutputFileResponse: vi.fn(),
  createRequirementsRestRuntime: vi.fn(),
  generatedOutputCapacitySnapshot: vi.fn(),
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
  recordCapacityEvent: vi.fn(),
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
  acquireGeneratedOutputSpool: routeState.acquireGeneratedOutputSpool,
  createGeneratedOutputFileResponse:
    routeState.createGeneratedOutputFileResponse,
  generatedOutputCapacitySnapshot: routeState.generatedOutputCapacitySnapshot,
}))

vi.mock('@/lib/observability/capacity', () => ({
  recordCapacityEvent: routeState.recordCapacityEvent,
}))

vi.mock('@/lib/reports/data/server', () => ({
  ReportDataError: routeState.ReportDataError,
  assertRequirementReportItemLimit: routeState.assertRequirementReportItemLimit,
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

vi.mock('@/lib/reports/data/specification-traceability', () => ({
  collectSpecificationTraceabilityData:
    routeState.collectSpecificationTraceabilityData,
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

vi.mock('@/lib/reports/templates/specification-traceability-template', () => ({
  buildSpecificationTraceabilityReport:
    routeState.buildSpecificationTraceabilityReport,
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
    routeState.acquireGeneratedOutputSpool.mockResolvedValue({
      filePath: '/tmp/generated-output-test.pdf',
      releaseGeneration: vi.fn(),
      releaseSpool: vi.fn(async () => {}),
    })
    routeState.createGeneratedOutputFileResponse.mockImplementation(
      async (
        _spool: unknown,
        headers: HeadersInit,
        lifecycle: { onComplete: () => void },
      ) => {
        lifecycle.onComplete()
        return new Response('%PDF', { headers, status: 200 })
      },
    )
    routeState.generatedOutputCapacitySnapshot.mockReturnValue({
      activeCsv: 0,
      activePdf: 1,
      reservedBytes: 50 * 1024 * 1024,
    })
    routeState.authorization.assertAuthorized.mockResolvedValue(undefined)
    routeState.assertRequirementReportItemLimit.mockResolvedValue(undefined)
    routeState.createRequirementsRestRuntime.mockResolvedValue({
      authorization: routeState.authorization,
      context: routeState.context,
      db: { db: true },
    })
    routeState.getApplicationSettings.mockResolvedValue({
      csvExportConcurrencyPerNode: 5,
      csvExportMaxFileBytes: 100 * 1024 * 1024,
      csvExportMaxItems: 1000,
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
    routeState.collectSpecificationTraceabilityData.mockResolvedValue({
      items: [{ itemRef: 'lib:55', uniqueId: 'REQ-1' }],
      specification: {
        name: 'Specification',
        specificationCode: 'SPEC-1',
      },
    })
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
    routeState.buildSpecificationTraceabilityReport.mockReturnValue({
      kind: 'specification-traceability',
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
      expect.objectContaining({ output: 'pdf' }),
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

  it('rejects oversized history collections before loading requirement details', async () => {
    routeState.getApplicationSettings.mockResolvedValueOnce({
      ...(await routeState.getApplicationSettings()),
      pdfReportMaxRequirements: 1,
    })
    routeState.assertRequirementReportItemLimit.mockImplementationOnce(
      async (_db, _id, options) => {
        throw options.createItemLimitError(options.maxItems)
      },
    )
    const { GET } = await import(
      '@/app/[locale]/requirements/reports/pdf/history/[id]/route'
    )

    const response = await GET(
      new NextRequest('http://localhost/en/requirements/reports/pdf/history/1'),
      { params: Promise.resolve({ id: '1', locale: 'en' }) },
    )

    expect(response.status).toBe(422)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(routeState.collectRequirementForReport).not.toHaveBeenCalled()
    expect(routeState.renderReportModelPdfResponse).not.toHaveBeenCalled()
  })

  it('rejects oversized suggestion history before loading versions or suggestions', async () => {
    routeState.getApplicationSettings.mockResolvedValueOnce({
      ...(await routeState.getApplicationSettings()),
      pdfReportMaxRequirements: 1,
    })
    routeState.assertRequirementReportItemLimit.mockImplementationOnce(
      async (_db, _id, options) => {
        throw options.createItemLimitError(options.maxItems)
      },
    )
    const { GET } = await import(
      '@/app/[locale]/requirements/reports/pdf/suggestion-history/[id]/route'
    )

    const response = await GET(
      new NextRequest(
        'http://localhost/en/requirements/reports/pdf/suggestion-history/1',
      ),
      { params: Promise.resolve({ id: '1', locale: 'en' }) },
    )

    expect(response.status).toBe(422)
    expect(routeState.collectRequirementForReport).not.toHaveBeenCalled()
    expect(routeState.collectSuggestionsForReport).not.toHaveBeenCalled()
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

  it('maps nullable list fields and priority details for an English filter report', async () => {
    routeState.traverseCompleteRequirementList.mockImplementationOnce(
      async (
        _db: unknown,
        _input: unknown,
        _authorization: unknown,
        visitPage: (rows: unknown[], page: number) => void | Promise<void>,
      ) => {
        const row = listRequirement(3, 'REQ-3')
        await visitPage(
          [
            {
              ...row,
              area: null,
              version: {
                ...row.version,
                priorityLevelCode: undefined,
                priorityLevelId: 7,
                priorityLevelNameEn: null,
                priorityLevelNameSv: null,
              },
            },
          ],
          1,
        )
        return { itemCount: 1, pageCount: 1 }
      },
    )
    const { GET } = await import(
      '@/app/[locale]/requirements/reports/pdf/list/route'
    )

    const response = await GET(
      new NextRequest('http://localhost/en/requirements/reports/pdf/list'),
      { params: Promise.resolve({ locale: 'en' }) },
    )

    expect(response.status).toBe(200)
    expect(routeState.buildListReport).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          area: null,
          versions: [
            expect.objectContaining({
              priorityLevel: expect.objectContaining({
                code: '',
                id: 7,
                nameEn: '',
                nameSv: '',
              }),
            }),
          ],
        }),
      ],
      'en',
    )
  })

  it('rejects unsupported list filters before opening a runtime', async () => {
    const { GET } = await import(
      '@/app/[locale]/requirements/reports/pdf/list/route'
    )

    const response = await GET(
      new NextRequest(
        'http://localhost/en/requirements/reports/pdf/list?unexpected=true',
      ),
      { params: Promise.resolve({ locale: 'en' }) },
    )

    expect(response.status).toBe(400)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(routeState.createRequirementsRestRuntime).not.toHaveBeenCalled()
  })

  it('rejects an explicit list request containing only empty IDs', async () => {
    const { GET } = await import(
      '@/app/[locale]/requirements/reports/pdf/list/route'
    )

    const response = await GET(
      new NextRequest(
        'http://localhost/en/requirements/reports/pdf/list?ids=%20,%20',
      ),
      { params: Promise.resolve({ locale: 'en' }) },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'No requirement IDs provided',
    })
    expect(
      routeState.collectMultipleRequirementListItemsForReport,
    ).not.toHaveBeenCalled()
  })

  it('maps a timed-out list PDF generation to the stable timeout envelope', async () => {
    const { GeneratedOutputTimeoutError } = await import(
      '@/lib/generated-output/operation'
    )
    routeState.renderReportInWorker.mockRejectedValueOnce(
      new GeneratedOutputTimeoutError(180),
    )
    const { GET } = await import(
      '@/app/[locale]/requirements/reports/pdf/list/route'
    )

    const response = await GET(
      new NextRequest(
        'http://localhost/en/requirements/reports/pdf/list?ids=REQ-1',
      ),
      { params: Promise.resolve({ locale: 'en' }) },
    )

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({
      code: 'generation_timeout',
      details: { output: 'pdf', timeoutSeconds: 180 },
    })
  })

  it('returns 499 when list PDF generation observes client cancellation', async () => {
    const { ClientCancelledGeneratedOutputError } = await import(
      '@/lib/generated-output/operation'
    )
    routeState.renderReportInWorker.mockRejectedValueOnce(
      new ClientCancelledGeneratedOutputError(),
    )
    const { GET } = await import(
      '@/app/[locale]/requirements/reports/pdf/list/route'
    )

    const response = await GET(
      new NextRequest(
        'http://localhost/en/requirements/reports/pdf/list?ids=REQ-1',
      ),
      { params: Promise.resolve({ locale: 'en' }) },
    )

    expect(response.status).toBe(499)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.text()).toBe('')
  })

  it('returns the stable item limit for an oversized filtered list', async () => {
    routeState.getApplicationSettings.mockResolvedValueOnce({
      ...(await routeState.getApplicationSettings()),
      pdfReportMaxRequirements: 1,
    })
    routeState.traverseCompleteRequirementList.mockImplementationOnce(
      async (_db, _input, _authorization, _visitPage, options) => {
        throw options.createItemLimitError(options.maxItems)
      },
    )
    const { GET } = await import(
      '@/app/[locale]/requirements/reports/pdf/list/route'
    )

    const response = await GET(
      new NextRequest('http://localhost/en/requirements/reports/pdf/list'),
      { params: Promise.resolve({ locale: 'en' }) },
    )

    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toMatchObject({
      code: 'output_limit_exceeded',
      details: { limit: 1, limitKind: 'items', output: 'pdf' },
    })
  })

  it('records cancellation from the PDF response stream', async () => {
    routeState.createGeneratedOutputFileResponse.mockImplementationOnce(
      async (_spool, headers: HeadersInit, lifecycle) => {
        lifecycle.onCancel()
        return new Response('%PDF', { headers, status: 200 })
      },
    )
    const { GET } = await import(
      '@/app/[locale]/requirements/reports/pdf/list/route'
    )

    const response = await GET(
      new NextRequest(
        'http://localhost/en/requirements/reports/pdf/list?ids=REQ-1',
      ),
      { params: Promise.resolve({ locale: 'en' }) },
    )

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('%PDF')
    expect(routeState.recordCapacityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'capacity.operation.cancelled',
        operation: 'requirements.list_pdf_report',
        outcome: 'cancelled',
        statusCode: 499,
      }),
    )
  })

  it('records failure from the PDF response stream', async () => {
    routeState.createGeneratedOutputFileResponse.mockImplementationOnce(
      async (_spool, headers: HeadersInit, lifecycle) => {
        lifecycle.onError()
        return new Response('%PDF', { headers, status: 200 })
      },
    )
    const { GET } = await import(
      '@/app/[locale]/requirements/reports/pdf/list/route'
    )

    const response = await GET(
      new NextRequest(
        'http://localhost/en/requirements/reports/pdf/list?ids=REQ-1',
      ),
      { params: Promise.resolve({ locale: 'en' }) },
    )

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('%PDF')
    expect(routeState.recordCapacityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'capacity.operation.failed',
        operation: 'requirements.list_pdf_report',
        outcome: 'failure',
        statusCode: 500,
      }),
    )
  })

  it('accepts combined review PDFs at the exact configured item limit', async () => {
    const ids = reportIds(2)
    routeState.getApplicationSettings.mockResolvedValueOnce({
      ...(await routeState.getApplicationSettings()),
      pdfReportMaxRequirements: 2,
    })
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
      expect.objectContaining({ output: 'pdf' }),
    )
  })

  it('rejects combined review PDFs above the item limit before per-row work', async () => {
    routeState.getApplicationSettings.mockResolvedValueOnce({
      ...(await routeState.getApplicationSettings()),
      pdfReportMaxRequirements: 1,
    })
    const { GET } = await import(
      '@/app/[locale]/requirements/reports/pdf/review-combined/route'
    )

    const response = await GET(
      new NextRequest(
        'http://localhost/en/requirements/reports/pdf/review-combined?ids=1,2',
      ),
      { params: Promise.resolve({ locale: 'en' }) },
    )

    expect(response.status).toBe(422)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    await expect(response.json()).resolves.toMatchObject({
      code: 'output_limit_exceeded',
      details: { limit: 1, limitKind: 'items', output: 'pdf' },
    })
    expect(routeState.authorization.assertAuthorized).not.toHaveBeenCalled()
    expect(
      routeState.collectMultipleRequirementsForReport,
    ).not.toHaveBeenCalled()
    expect(routeState.renderReportModelPdfResponse).not.toHaveBeenCalled()
  })

  it('rejects saturated PDF capacity before per-row collection', async () => {
    routeState.getApplicationSettings.mockResolvedValueOnce({
      ...(await routeState.getApplicationSettings()),
      pdfReportConcurrencyPerNode: 1,
    })
    const { acquireGeneratedOutputCapacity } = await import(
      '@/lib/generated-output/capacity'
    )
    const occupied = acquireGeneratedOutputCapacity({
      concurrencyLimit: 1,
      output: 'pdf',
    })
    try {
      const { GET } = await import(
        '@/app/[locale]/requirements/reports/pdf/review-combined/route'
      )
      const response = await GET(
        new NextRequest(
          'http://localhost/en/requirements/reports/pdf/review-combined?ids=1',
        ),
        { params: Promise.resolve({ locale: 'en' }) },
      )

      expect(response.status).toBe(429)
      expect(response.headers.get('Cache-Control')).toBe('no-store')
      expect(response.headers.get('Retry-After')).toBe('5')
      expect(routeState.authorization.assertAuthorized).not.toHaveBeenCalled()
      expect(
        routeState.collectMultipleRequirementsForReport,
      ).not.toHaveBeenCalled()
    } finally {
      occupied.release()
    }
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
      expect.objectContaining({ output: 'pdf' }),
    )
    expect(routeState.renderReportModelPdfResponse).toHaveBeenCalledWith(
      expect.anything(),
      'sv',
      'Avstegsgranskningsrapport REQ-1.pdf',
      expect.objectContaining({ output: 'pdf' }),
    )
    expect(routeState.renderReportModelPdfResponse).toHaveBeenCalledWith(
      expect.anything(),
      'sv',
      'Förbättringsförslagshistorik REQ-1.pdf',
      expect.objectContaining({ output: 'pdf' }),
    )
    expect(routeState.renderReportModelPdfResponse).toHaveBeenCalledWith(
      { kind: 'specification-profile' },
      'sv',
      'Genomföranderapport Införande SPEC-2.pdf',
      expect.objectContaining({ output: 'pdf' }),
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

  it('rejects oversized deviation reviews before loading requirement details', async () => {
    routeState.getApplicationSettings.mockResolvedValueOnce({
      ...(await routeState.getApplicationSettings()),
      pdfReportMaxRequirements: 1,
    })
    routeState.assertRequirementReportItemLimit.mockImplementationOnce(
      async (_db, _id, options) => {
        throw options.createItemLimitError(options.maxItems)
      },
    )
    const { GET } = await import(
      '@/app/[locale]/requirements/reports/pdf/deviation-review/[id]/route'
    )

    const response = await GET(
      new NextRequest(
        'http://localhost/en/requirements/reports/pdf/deviation-review/1?item=lib:55',
      ),
      { params: Promise.resolve({ id: '1', locale: 'en' }) },
    )

    expect(response.status).toBe(422)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(routeState.assertRequirementReportItemLimit).toHaveBeenCalledWith(
      { db: true },
      '1',
      expect.objectContaining({ collection: 'versions', maxItems: 1 }),
    )
    expect(routeState.collectDeviationForReport).not.toHaveBeenCalled()
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
    ).toHaveBeenCalledWith(
      { db: true },
      42,
      expect.objectContaining({
        maxItems: 1000,
        signal: expect.any(AbortSignal),
      }),
    )
    expect(routeState.buildSpecificationProfileReport).toHaveBeenCalledWith(
      expect.objectContaining({
        specification: expect.objectContaining({ specificationCode: 'SPEC-1' }),
      }),
      'procurement',
      'en',
    )
  })

  it('rejects oversized specification PDFs before enriching report rows', async () => {
    routeState.getApplicationSettings.mockResolvedValueOnce({
      ...(await routeState.getApplicationSettings()),
      pdfReportMaxRequirements: 1,
    })
    routeState.collectCompleteSpecificationOutputData.mockImplementationOnce(
      async (_db, _id, options) => {
        throw options.createItemLimitError(options.maxItems)
      },
    )
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

    expect(response.status).toBe(422)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(routeState.buildSpecificationProfileReport).not.toHaveBeenCalled()
    expect(routeState.renderReportModelPdfResponse).not.toHaveBeenCalled()
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

  it('rejects a deviation PDF without an item reference before opening a runtime', async () => {
    const { GET } = await import(
      '@/app/[locale]/requirements/reports/pdf/deviation-review/[id]/route'
    )

    const response = await GET(
      new NextRequest(
        'http://localhost/en/requirements/reports/pdf/deviation-review/REQ-1',
      ),
      { params: Promise.resolve({ id: 'REQ-1', locale: 'en' }) },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Missing item ID in URL',
    })
    expect(routeState.createRequirementsRestRuntime).not.toHaveBeenCalled()
  })

  it('returns 404 when a deviation PDF item no longer exists', async () => {
    routeState.getSpecificationItemById.mockResolvedValueOnce(null)
    const { GET } = await import(
      '@/app/[locale]/requirements/reports/pdf/deviation-review/[id]/route'
    )

    const response = await GET(
      new NextRequest(
        'http://localhost/en/requirements/reports/pdf/deviation-review/REQ-1?item=lib:404',
      ),
      { params: Promise.resolve({ id: 'REQ-1', locale: 'en' }) },
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: 'Item not found: lib:404',
    })
    expect(routeState.collectDeviationForReport).not.toHaveBeenCalled()
  })

  it('rejects a combined review without requirement IDs', async () => {
    const { GET } = await import(
      '@/app/[locale]/requirements/reports/pdf/review-combined/route'
    )

    const response = await GET(
      new NextRequest(
        'http://localhost/en/requirements/reports/pdf/review-combined?ids=%20,%20',
      ),
      { params: Promise.resolve({ locale: 'en' }) },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'No requirement IDs provided',
    })
    expect(routeState.createRequirementsRestRuntime).not.toHaveBeenCalled()
  })

  it.each([
    { lifecycleStatusId: 1, profile: 'management' },
    { lifecycleStatusId: 3, profile: 'procurement' },
  ])(
    'rejects the unavailable $profile specification PDF profile',
    async ({ lifecycleStatusId, profile }) => {
      routeState.getSpecificationById.mockResolvedValueOnce({
        id: 42,
        specificationLifecycleStatusId: lifecycleStatusId,
      })
      const { GET } = await import(
        '@/app/[locale]/specifications/[specificationId]/reports/pdf/[profile]/route'
      )

      const response = await GET(
        new NextRequest(
          `http://localhost/en/specifications/42/reports/pdf/${profile}`,
        ),
        {
          params: Promise.resolve({
            locale: 'en',
            profile,
            specificationId: '42',
          }),
        },
      )

      expect(response.status).toBe(409)
      expect(
        routeState.collectCompleteSpecificationOutputData,
      ).not.toHaveBeenCalled()
    },
  )

  it('rejects an unknown specification PDF profile before opening a runtime', async () => {
    const { GET } = await import(
      '@/app/[locale]/specifications/[specificationId]/reports/pdf/[profile]/route'
    )

    const response = await GET(
      new NextRequest(
        'http://localhost/en/specifications/42/reports/pdf/unknown',
      ),
      {
        params: Promise.resolve({
          locale: 'en',
          profile: 'unknown',
          specificationId: '42',
        }),
      },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid report profile',
    })
    expect(routeState.createRequirementsRestRuntime).not.toHaveBeenCalled()
  })

  it('returns a traceability PDF for the validated filter query', async () => {
    const { GET } = await import(
      '@/app/[locale]/specifications/[specificationId]/reports/pdf/traceability/route'
    )

    const response = await GET(
      new NextRequest(
        'http://localhost/sv/specifications/42/reports/pdf/traceability?descriptionSearch=access&sortDirection=desc',
      ),
      {
        params: Promise.resolve({ locale: 'sv', specificationId: '42' }),
      },
    )

    expect(response.status).toBe(200)
    expect(
      routeState.collectSpecificationTraceabilityData,
    ).toHaveBeenCalledWith(
      { db: true },
      expect.objectContaining({ id: 42 }),
      expect.objectContaining({
        descriptionSearch: 'access',
        locale: 'sv',
        sortDirection: 'desc',
      }),
      expect.objectContaining({
        maxItems: 1000,
        signal: expect.any(AbortSignal),
      }),
    )
    expect(routeState.renderReportModelPdfResponse).toHaveBeenCalledWith(
      { kind: 'specification-traceability' },
      'sv',
      'Tillämpningsspårbarhet Specification SPEC-1.pdf',
      expect.objectContaining({ output: 'pdf' }),
    )
  })

  it('rejects oversized traceability PDFs before building the report model', async () => {
    routeState.getApplicationSettings.mockResolvedValueOnce({
      ...(await routeState.getApplicationSettings()),
      pdfReportMaxRequirements: 1,
    })
    routeState.collectSpecificationTraceabilityData.mockImplementationOnce(
      async (_db, _specification, _query, options) => {
        throw options.createItemLimitError(options.maxItems)
      },
    )
    const { GET } = await import(
      '@/app/[locale]/specifications/[specificationId]/reports/pdf/traceability/route'
    )

    const response = await GET(
      new NextRequest(
        'http://localhost/en/specifications/42/reports/pdf/traceability',
      ),
      { params: Promise.resolve({ locale: 'en', specificationId: '42' }) },
    )

    expect(response.status).toBe(422)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(
      routeState.buildSpecificationTraceabilityReport,
    ).not.toHaveBeenCalled()
    expect(routeState.renderReportModelPdfResponse).not.toHaveBeenCalled()
  })

  it('rejects unsupported traceability filters before opening a runtime', async () => {
    const { GET } = await import(
      '@/app/[locale]/specifications/[specificationId]/reports/pdf/traceability/route'
    )

    const response = await GET(
      new NextRequest(
        'http://localhost/en/specifications/42/reports/pdf/traceability?refs=lib:55',
      ),
      {
        params: Promise.resolve({ locale: 'en', specificationId: '42' }),
      },
    )

    expect(response.status).toBe(400)
    expect(routeState.createRequirementsRestRuntime).not.toHaveBeenCalled()
  })

  it('keeps malformed encoded requirement references observable to authorization', async () => {
    const { authorizeRequirementReportRead } = await import(
      '@/app/[locale]/requirements/reports/pdf/route-helpers'
    )

    await authorizeRequirementReportRead(
      routeState.authorization,
      routeState.context,
      '%E0%A4%A',
      'detail',
    )

    expect(routeState.authorization.assertAuthorized).toHaveBeenCalledWith(
      {
        kind: 'get_requirement',
        uniqueId: '%E0%A4%A',
        view: 'detail',
      },
      routeState.context,
    )
  })

  it('redacts unexpected report failures and server-side report details', async () => {
    const { reportErrorResponse } = await import(
      '@/app/[locale]/requirements/reports/pdf/route-helpers'
    )

    const unexpected = reportErrorResponse(new Error('database password'))
    const serverReportError = reportErrorResponse(
      new routeState.ReportDataError('worker internals', 500),
    )

    expect(unexpected.status).toBe(500)
    expect(await unexpected.json()).not.toEqual({ error: 'database password' })
    expect(serverReportError.status).toBe(500)
    await expect(serverReportError.json()).resolves.toEqual({
      error: 'Failed to generate PDF',
    })
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getApplicationSettings: vi.fn(),
  traverseCompleteRequirementList: vi.fn(),
}))

vi.mock('@/lib/dal/application-settings', () => ({
  getApplicationSettings: mocks.getApplicationSettings,
}))

vi.mock('@/lib/requirements/list-query', () => ({
  traverseCompleteRequirementList: mocks.traverseCompleteRequirementList,
}))

vi.mock('@/lib/requirements/server', () => ({
  createRequirementsRestRuntime: vi.fn(async () => ({
    authorization: { assertAuthorized: vi.fn() },
    context: {
      actor: { id: 'route-test' },
      correlationId: 'correlation-1',
      requestId: 'request-1',
      source: 'rest',
    },
    db: {},
  })),
}))

vi.mock('@/lib/requirements/service', () => ({
  toHttpErrorPayload: (error: unknown) => ({
    body: { error: error instanceof Error ? error.message : 'failed' },
    status: 500,
  }),
}))

function requirement(id: number) {
  return {
    area: { id: 1, name: 'Area' },
    id,
    isArchived: false,
    normReferenceIds: [],
    normReferenceUris: [],
    requirementPackages: [],
    uniqueId: `TST-${String(id).padStart(3, '0')}`,
    version: {
      categoryNameEn: 'Business',
      categoryNameSv: 'Verksamhet',
      description: `Requirement ${id}`,
      priorityLevelNameEn: 'High',
      priorityLevelNameSv: 'Hög',
      qualityCharacteristicNameEn: 'Security',
      qualityCharacteristicNameSv: 'Säkerhet',
      statusNameEn: 'Published',
      statusNameSv: 'Publicerad',
      typeNameEn: 'Functional',
      typeNameSv: 'Funktionellt',
      verifiable: true,
      versionNumber: 1,
    },
  }
}

async function responseTextWithBom(response: Response): Promise<string> {
  const bytes = new Uint8Array(await response.arrayBuffer())
  expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf])
  return new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes)
}

describe('requirements export route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getApplicationSettings.mockResolvedValue({
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
    mocks.traverseCompleteRequirementList.mockImplementation(
      async (
        _db: unknown,
        _input: unknown,
        _authorization: unknown,
        visitPage: (rows: unknown[], page: number) => void,
      ) => {
        await visitPage([requirement(1), requirement(2)], 1)
        await visitPage([requirement(3)], 2)
        return { itemCount: 3, pageCount: 2 }
      },
    )
  })

  it('exports every traversed page exactly once in page order', async () => {
    const { GET } = await import('@/app/api/requirements/export/route')
    const response = await GET(
      new Request(
        'http://localhost/api/requirements/export?locale=sv&sortBy=uniqueId&sortDirection=asc',
      ) as never,
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toContain('text/csv')
    expect(response.headers.get('Content-Disposition')).toContain(
      'kravbibliotek.csv',
    )
    const csv = await responseTextWithBom(response)
    expect(csv).toContain('Krav-ID;Kravtext')
    expect(csv).toContain('TST-001;Requirement 1')
    expect(csv).toContain('TST-002;Requirement 2')
    expect(csv).toContain('TST-003;Requirement 3')
    expect(csv.indexOf('TST-001')).toBeLessThan(csv.indexOf('TST-003'))
    expect(mocks.traverseCompleteRequirementList).toHaveBeenCalledWith(
      expect.anything(),
      expect.not.objectContaining({ cursor: expect.anything() }),
      expect.anything(),
      expect.any(Function),
      expect.objectContaining({ maxItems: 1000 }),
    )
  })

  it.each(['cursor=opaque', 'limit=10'])(
    'rejects the unsupported export query input %s',
    async unsupportedQuery => {
      vi.clearAllMocks()
      const { GET } = await import('@/app/api/requirements/export/route')
      const response = await GET(
        new Request(
          `http://localhost/api/requirements/export?${unsupportedQuery}`,
        ) as never,
      )

      expect(response.status).toBe(400)
      expect(mocks.traverseCompleteRequirementList).not.toHaveBeenCalled()
    },
  )

  it('returns the stable item-limit envelope before delivery', async () => {
    mocks.getApplicationSettings.mockResolvedValueOnce({
      ...(await mocks.getApplicationSettings()),
      csvExportMaxRequirements: 2,
    })
    mocks.traverseCompleteRequirementList.mockImplementationOnce(
      async (
        _db,
        _input,
        _authorization,
        _visitPage,
        options: {
          createItemLimitError: (limit: number) => Error
          maxItems: number
        },
      ) => {
        throw options.createItemLimitError(options.maxItems)
      },
    )
    const { GET } = await import('@/app/api/requirements/export/route')
    const response = await GET(
      new Request(
        'http://localhost/api/requirements/export?locale=en',
      ) as never,
    )

    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toMatchObject({
      code: 'output_limit_exceeded',
      details: { limit: 2, limitKind: 'items', output: 'csv' },
    })
  })

  it('returns the stable byte-limit envelope without a partial download', async () => {
    mocks.getApplicationSettings.mockResolvedValueOnce({
      ...(await mocks.getApplicationSettings()),
      csvExportMaxFileBytes: 8,
    })
    const { GET } = await import('@/app/api/requirements/export/route')
    const response = await GET(
      new Request(
        'http://localhost/api/requirements/export?locale=en',
      ) as never,
    )

    expect(response.status).toBe(422)
    expect(response.headers.get('Content-Disposition')).toBeNull()
    await expect(response.json()).resolves.toMatchObject({
      code: 'output_limit_exceeded',
      details: { limit: 8, limitKind: 'bytes', output: 'csv' },
    })
  })
})

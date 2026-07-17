import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  exportToCsv: vi.fn((_columns: unknown, _rows: unknown) => 'csv-data'),
  traverseCompleteRequirementList: vi.fn(),
}))

vi.mock('@/lib/export-csv', () => ({
  exportToCsv: mocks.exportToCsv,
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
    mocks.traverseCompleteRequirementList.mockImplementation(
      async (
        _db: unknown,
        _input: unknown,
        _authorization: unknown,
        visitPage: (rows: unknown[], page: number) => void,
      ) => {
        visitPage([requirement(1), requirement(2)], 1)
        visitPage([requirement(3)], 2)
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
    expect(await responseTextWithBom(response)).toBe('\uFEFFcsv-data')
    expect(mocks.exportToCsv.mock.calls[0]?.[1]).toEqual([
      expect.objectContaining({ 'Krav-ID': 'TST-001' }),
      expect.objectContaining({ 'Krav-ID': 'TST-002' }),
      expect.objectContaining({ 'Krav-ID': 'TST-003' }),
    ])
    expect(mocks.traverseCompleteRequirementList).toHaveBeenCalledWith(
      expect.anything(),
      expect.not.objectContaining({ cursor: expect.anything() }),
      expect.anything(),
      expect.any(Function),
    )
  })

  it('rejects cursor and page-size inputs', async () => {
    const { GET } = await import('@/app/api/requirements/export/route')
    const response = await GET(
      new Request(
        'http://localhost/api/requirements/export?cursor=opaque&limit=10',
      ) as never,
    )

    expect(response.status).toBe(400)
    expect(mocks.traverseCompleteRequirementList).not.toHaveBeenCalled()
  })
})

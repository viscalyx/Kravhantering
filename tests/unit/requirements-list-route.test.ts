import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: vi.fn().mockReturnValue({}),
}))

const mockQueryCatalog = vi.fn()
const mockQueryRequirementList = vi.fn()
const mockManageRequirement = vi.fn()
const mockAuthorization = { assertAuthorized: vi.fn() }
const mockRequestContext = {
  actor: {
    id: null,
    displayName: '',
    hsaId: null,
    roles: [],
    source: 'anonymous',
    isAuthenticated: false,
  },
  requestId: 'test',
  source: 'rest',
}
const mockCreateRequestContext = vi.fn(() => mockRequestContext)

vi.mock('@/lib/requirements/service', () => ({
  createRequirementsService: () => ({
    queryCatalog: mockQueryCatalog,
    manageRequirement: mockManageRequirement,
  }),
  toHttpErrorPayload: () => ({ body: { error: 'fail' }, status: 500 }),
}))

vi.mock('@/lib/requirements/auth', () => ({
  createDefaultAuthorizationService: vi.fn(() => mockAuthorization),
  createRequestContext: mockCreateRequestContext,
}))

vi.mock('@/lib/requirements/list-query', () => ({
  queryRequirementList: mockQueryRequirementList,
}))

vi.mock('@/lib/dal/ui-settings', () => ({
  createUiSettingsLoader: () => ({
    getTerminology: vi.fn().mockResolvedValue({}),
  }),
}))

vi.mock('@/lib/requirements/list-view', () => ({
  DEFAULT_REQUIREMENT_SORT: { by: 'uniqueId', direction: 'asc' },
  isRequirementSortField: (v: string) =>
    ['uniqueId', 'description', 'area', 'status'].includes(v),
  isRequirementSortDirection: (v: string) => ['asc', 'desc'].includes(v),
}))

vi.mock('@/lib/ui-terminology', () => ({
  getRequirementCsvHeaders: () => ['ID', 'Description'],
}))

vi.mock('@/lib/export-csv', () => ({
  exportToCsv: () => 'csv-data',
}))

describe('requirements route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('GET', () => {
    it('returns JSON list of requirements', async () => {
      mockQueryRequirementList.mockResolvedValue({
        pagination: { total: 1, limit: 25, offset: 0 },
        requirements: [{ id: 1, uniqueId: 'TST-001' }],
      })

      const { GET } = await import('@/app/api/requirements/route')
      const req = new Request('http://localhost/api/requirements?locale=en')
      const res = await GET(req as never)
      const json = (await res.json()) as {
        requirements: unknown[]
        pagination: { total: number }
      }
      expect(json.requirements).toHaveLength(1)
      expect(json.pagination.total).toBe(1)
      expect(mockCreateRequestContext).toHaveBeenCalledWith(req, 'rest')
      expect(mockQueryRequirementList).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { authorization: mockAuthorization, context: mockRequestContext },
      )
    })

    it('returns CSV when format=csv', async () => {
      mockQueryRequirementList.mockResolvedValue({
        pagination: { total: 1 },
        requirements: [{ id: 1, uniqueId: 'TST-001', version: {} }],
      })

      const { GET } = await import('@/app/api/requirements/route')
      const req = new Request(
        'http://localhost/api/requirements?format=csv&locale=sv',
      )
      const res = await GET(req as never)
      expect(res.headers.get('Content-Type')).toContain('text/csv')
      expect(res.headers.get('Content-Disposition')).toContain(
        'kravkatalog.csv',
      )
    })

    it('passes filter params to service', async () => {
      mockQueryRequirementList.mockResolvedValue({
        pagination: { total: 0 },
        requirements: [],
      })

      const { GET } = await import('@/app/api/requirements/route')
      const req = new Request(
        'http://localhost/api/requirements?sortBy=uniqueId&sortDirection=desc&limit=10&offset=5&areaIds=1&statuses=1&requiresTesting=true&categoryIds=2&typeIds=3&qualityCharacteristicIds=4&requirementPackageIds=5&requirementPackageIds=0&requirementPackageIds=-1&requirementPackageIds=1.5&requirementPackageIds=abc',
      )
      await GET(req as never)
      expect(mockQueryRequirementList).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          limit: 10,
          offset: 5,
          sort: { by: 'uniqueId', direction: 'desc' },
          filters: expect.objectContaining({
            areaIds: [1],
            categoryIds: [2],
            qualityCharacteristicIds: [4],
            requirementPackageIds: [5],
            requiresTesting: ['true'],
            statuses: [1],
            typeIds: [3],
          }),
        }),
        { authorization: mockAuthorization, context: mockRequestContext },
      )
    })

    it('returns error on failure', async () => {
      mockQueryRequirementList.mockRejectedValue(new Error('db error'))

      const { GET } = await import('@/app/api/requirements/route')
      const req = new Request('http://localhost/api/requirements')
      const res = await GET(req as never)
      expect(res.status).toBe(500)
    })

    it('returns handled errors when request context creation fails', async () => {
      mockCreateRequestContext.mockRejectedValueOnce(new Error('auth failed'))

      const { GET } = await import('@/app/api/requirements/route')
      const req = new Request('http://localhost/api/requirements')
      const res = await GET(req as never)

      expect(res.status).toBe(500)
      expect(mockQueryRequirementList).not.toHaveBeenCalled()
    })
  })

  describe('POST', () => {
    it('creates requirement and returns 201', async () => {
      mockManageRequirement.mockResolvedValue({
        result: { id: 42, uniqueId: 'TST-042' },
      })

      const { POST } = await import('@/app/api/requirements/route')
      const req = new Request('http://localhost/api/requirements', {
        method: 'POST',
        body: JSON.stringify({
          description: 'New requirement',
          areaId: 1,
          typeId: 2,
          requirementPackageIds: [1, 2, 2, 0, -1, 1.5, 'abc'],
          references: [{ name: 'Ref 1', uri: 'https://example.com' }],
        }),
        headers: { 'Content-Type': 'application/json' },
      })
      const res = await POST(req as never)
      expect(res.status).toBe(201)
      const json = (await res.json()) as { id: number }
      expect(json.id).toBe(42)
      expect(mockManageRequirement).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          requirement: expect.objectContaining({
            requirementPackageIds: [1, 2],
          }),
        }),
      )
    })

    it('omits requirement package ids when POST contains no valid ids', async () => {
      mockManageRequirement.mockResolvedValue({
        result: { id: 42, uniqueId: 'TST-042' },
      })

      const { POST } = await import('@/app/api/requirements/route')
      const req = new Request('http://localhost/api/requirements', {
        method: 'POST',
        body: JSON.stringify({
          description: 'New requirement',
          areaId: 1,
          requirementPackageIds: [0, -1, 1.5, 'abc'],
        }),
        headers: { 'Content-Type': 'application/json' },
      })
      const res = await POST(req as never)
      expect(res.status).toBe(201)
      const payload = mockManageRequirement.mock.calls.at(-1)?.[1] as
        | { requirement?: Record<string, unknown> }
        | undefined
      expect(payload?.requirement).toBeDefined()
      expect(payload?.requirement).not.toHaveProperty('requirementPackageIds')
    })

    it('returns error on failure', async () => {
      mockManageRequirement.mockRejectedValue(new Error('validation'))

      const { POST } = await import('@/app/api/requirements/route')
      const req = new Request('http://localhost/api/requirements', {
        method: 'POST',
        body: JSON.stringify({ description: 'Bad' }),
        headers: { 'Content-Type': 'application/json' },
      })
      const res = await POST(req as never)
      expect(res.status).toBe(500)
    })

    it('returns handled errors when request context creation fails', async () => {
      mockCreateRequestContext.mockRejectedValueOnce(new Error('auth failed'))

      const { POST } = await import('@/app/api/requirements/route')
      const req = new Request('http://localhost/api/requirements', {
        method: 'POST',
        body: JSON.stringify({ description: 'New requirement', areaId: 1 }),
        headers: { 'Content-Type': 'application/json' },
      })
      const res = await POST(req as never)

      expect(res.status).toBe(500)
      expect(mockManageRequirement).not.toHaveBeenCalled()
    })

    it('returns 400 for invalid JSON bodies', async () => {
      const { POST } = await import('@/app/api/requirements/route')
      const req = new Request('http://localhost/api/requirements', {
        method: 'POST',
        body: 'not-json',
        headers: { 'Content-Type': 'application/json' },
      })
      const res = await POST(req as never)

      expect(res.status).toBe(400)
      await expect(res.json()).resolves.toEqual({
        error: 'Invalid JSON body',
      })
      expect(mockManageRequirement).not.toHaveBeenCalled()
    })
  })
})

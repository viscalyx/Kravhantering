import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: vi.fn().mockResolvedValue({ env: { DB: {} }, ctx: {} }),
}))

vi.mock('@/lib/db', () => ({
  getDb: vi.fn().mockReturnValue({}),
}))

const mockQueryCatalog = vi.fn()
const mockManageRequirement = vi.fn()

vi.mock('@/lib/requirements/service', () => ({
  createRequirementsService: () => ({
    queryCatalog: mockQueryCatalog,
    manageRequirement: mockManageRequirement,
  }),
  toHttpErrorPayload: () => ({ body: { error: 'fail' }, status: 500 }),
}))

vi.mock('@/lib/requirements/auth', () => ({
  createRequestContext: () => ({
    actor: { id: null, roles: [], source: 'anonymous', isAuthenticated: false },
    requestId: 'test',
    source: 'rest',
  }),
}))

vi.mock('@/lib/dal/ui-settings', () => ({
  createUiSettingsLoader: () => ({
    getTerminology: vi.fn().mockResolvedValue({}),
  }),
}))

vi.mock('@/lib/requirements/list-view', () => ({
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
      mockQueryCatalog.mockResolvedValue({
        items: [{ id: 1, uniqueId: 'TST-001' }],
        pagination: { total: 1, limit: 25, offset: 0 },
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
    })

    it('returns CSV when format=csv', async () => {
      mockQueryCatalog.mockResolvedValue({
        items: [{ id: 1, uniqueId: 'TST-001', version: {} }],
        pagination: { total: 1 },
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
      mockQueryCatalog.mockResolvedValue({
        items: [],
        pagination: { total: 0 },
      })

      const { GET } = await import('@/app/api/requirements/route')
      const req = new Request(
        'http://localhost/api/requirements?sortBy=uniqueId&sortDirection=desc&limit=10&offset=5&areaIds=1&statuses=1&requiresTesting=true',
      )
      await GET(req as never)
      expect(mockQueryCatalog).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          sortBy: 'uniqueId',
          sortDirection: 'desc',
          limit: 10,
          offset: 5,
        }),
      )
    })

    it('returns error on failure', async () => {
      mockQueryCatalog.mockRejectedValue(new Error('db error'))

      const { GET } = await import('@/app/api/requirements/route')
      const req = new Request('http://localhost/api/requirements')
      const res = await GET(req as never)
      expect(res.status).toBe(500)
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
          scenarioIds: [1, 2],
          references: [{ name: 'Ref 1', uri: 'https://example.com' }],
        }),
        headers: { 'Content-Type': 'application/json' },
      })
      const res = await POST(req as never)
      expect(res.status).toBe(201)
      const json = (await res.json()) as { id: number }
      expect(json.id).toBe(42)
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
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createAdminPrivilegedAuditContext: vi.fn(async () => ({
    actor: {
      displayName: 'Ada Admin',
      hsaId: 'SE5560000001-admin1',
      id: 'admin-sub',
      isAuthenticated: true,
      roles: ['Admin'],
      source: 'oidc',
    },
    request: {
      method: 'POST',
      path: '/api/requirement-areas',
      requestId: 'request-area',
    },
    correlationId: 'correlation-area',
    requestId: 'request-area',
    source: 'rest',
  })),
  getRequestSqlServerDataSource: vi.fn(() => 'mock-db'),
  listAreas: vi.fn(),
  createArea: vi.fn(),
  updateArea: vi.fn(),
  recordAdminPrivilegedActionSucceeded: vi.fn(),
}))

vi.mock('@/lib/admin/privileged-audit', () => ({
  createAdminPrivilegedAuditContext: mocks.createAdminPrivilegedAuditContext,
  recordAdminPrivilegedActionSucceeded:
    mocks.recordAdminPrivilegedActionSucceeded,
}))
vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: mocks.getRequestSqlServerDataSource,
}))
vi.mock('@/lib/dal/requirement-areas', () => ({
  listAreas: mocks.listAreas,
  createArea: mocks.createArea,
  updateArea: mocks.updateArea,
}))

import { PUT } from '@/app/api/requirement-areas/[id]/route'
import { GET, POST } from '@/app/api/requirement-areas/route'

function request(
  body: unknown,
  url = 'http://localhost/api/requirement-areas',
  method = 'POST',
) {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('requirement-areas route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('GET', () => {
    it('returns areas with ownerHsaId', async () => {
      mocks.listAreas.mockResolvedValue([
        {
          id: 1,
          prefix: 'INT',
          name: 'Integration',
          description: null,
          ownerHsaId: 'SE5560000001-annaj',
        },
      ])

      const res = await GET()
      const json = (await res.json()) as {
        areas: { ownerHsaId: string }[]
      }

      expect(json.areas).toHaveLength(1)
      expect(json.areas[0].ownerHsaId).toBe('SE5560000001-annaj')
    })
  })

  describe('POST', () => {
    it('creates a requirement area and returns 201', async () => {
      const body = {
        ownerHsaId: 'NO5560000001-new1',
        prefix: 'NEW',
        name: 'New requirement area',
      }
      mocks.createArea.mockResolvedValue({ id: 3, ...body })

      const res = await POST(request(body))
      expect(res.status).toBe(201)
      expect(await res.json()).toMatchObject({ id: 3 })
      expect(mocks.createArea).toHaveBeenCalledWith('mock-db', body)
      expect(mocks.recordAdminPrivilegedActionSucceeded).toHaveBeenCalledWith(
        expect.objectContaining({ requestId: 'request-area' }),
        {
          changedFields: ['name', 'ownerHsaId', 'prefix'],
          operation: 'create',
          resourceId: 3,
          resourceType: 'requirement_area',
        },
      )
    })

    it('requires ownerHsaId', async () => {
      const res = await POST(
        request({ prefix: 'NEW', name: 'New requirement area' }),
      )

      expect(res.status).toBe(400)
      expect(mocks.createArea).not.toHaveBeenCalled()
    })

    it('rejects invalid ownerHsaId', async () => {
      const res = await POST(
        request({
          ownerHsaId: 'not-hsa',
          prefix: 'NEW',
          name: 'New requirement area',
        }),
      )

      expect(res.status).toBe(400)
      expect(mocks.createArea).not.toHaveBeenCalled()
    })

    it('rejects legacy ownerId and ownerName fields', async () => {
      const res = await POST(
        request({
          ownerHsaId: 'SE5560000001-new1',
          ownerId: 1,
          ownerName: 'Anna Svensson',
          prefix: 'NEW',
          name: 'New requirement area',
        }),
      )

      expect(res.status).toBe(400)
      expect(mocks.createArea).not.toHaveBeenCalled()
    })
  })

  describe('PUT', () => {
    it('can change ownerHsaId', async () => {
      mocks.updateArea.mockResolvedValue({
        id: 1,
        prefix: 'INT',
        name: 'Integration',
        description: null,
        ownerHsaId: 'NO5560000001-next1',
      })

      const res = await PUT(
        request(
          { ownerHsaId: 'NO5560000001-next1' },
          'http://localhost/api/requirement-areas/1',
          'PUT',
        ),
        makeParams('1'),
      )

      expect(res.status).toBe(200)
      expect(mocks.updateArea).toHaveBeenCalledWith('mock-db', 1, {
        ownerHsaId: 'NO5560000001-next1',
      })
    })

    it('rejects legacy ownerId and ownerName fields', async () => {
      const res = await PUT(
        request(
          { ownerId: 1, ownerName: 'Anna Svensson' },
          'http://localhost/api/requirement-areas/1',
          'PUT',
        ),
        makeParams('1'),
      )

      expect(res.status).toBe(400)
      expect(mocks.updateArea).not.toHaveBeenCalled()
    })
  })
})

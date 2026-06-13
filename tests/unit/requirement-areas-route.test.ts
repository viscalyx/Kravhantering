import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const db = { query: vi.fn() }
  return {
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
    createRequestContext: vi.fn(async () => ({
      actor: {
        displayName: 'Ada Admin',
        hsaId: 'SE5560000001-admin1',
        id: 'admin-sub',
        isAuthenticated: true,
        roles: ['Admin'],
        source: 'oidc',
      },
      correlationId: 'correlation-area',
      requestId: 'request-area',
      source: 'rest',
    })),
    canManageAreaCoAuthors: vi.fn(),
    db,
    getAreaById: vi.fn(),
    getRequestSqlServerDataSource: vi.fn(() => db),
    listAreas: vi.fn(),
    createArea: vi.fn(),
    resolveVerifiedRequirementResponsibilityPerson: vi.fn(),
    updateArea: vi.fn(),
    updateAreaWithOwnerCheck: vi.fn(),
    recordAdminPrivilegedActionSucceeded: vi.fn(),
  }
})

vi.mock('@/lib/admin/privileged-audit', () => ({
  createAdminPrivilegedAuditContext: mocks.createAdminPrivilegedAuditContext,
  recordAdminPrivilegedActionSucceeded:
    mocks.recordAdminPrivilegedActionSucceeded,
}))
vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: mocks.getRequestSqlServerDataSource,
}))
vi.mock('@/lib/dal/requirement-areas', () => ({
  canManageAreaCoAuthors: mocks.canManageAreaCoAuthors,
  listAreas: mocks.listAreas,
  createArea: mocks.createArea,
  getAreaById: mocks.getAreaById,
  updateArea: mocks.updateArea,
  updateAreaWithOwnerCheck: mocks.updateAreaWithOwnerCheck,
}))
vi.mock('@/lib/requirements/responsibility-person-verification', () => ({
  resolveVerifiedRequirementResponsibilityPerson:
    mocks.resolveVerifiedRequirementResponsibilityPerson,
}))
vi.mock('@/lib/requirements/auth', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/requirements/auth')>()
  return {
    ...actual,
    createRequestContext: mocks.createRequestContext,
  }
})

import { PUT } from '@/app/api/requirement-areas/[id]/route'
import { GET, POST } from '@/app/api/requirement-areas/route'

function request(
  body: unknown,
  url = 'http://localhost/api/requirement-areas',
  method = 'POST',
) {
  return new Request(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost:3000',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: JSON.stringify(body),
  })
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('requirement-areas route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.canManageAreaCoAuthors.mockResolvedValue(true)
    mocks.db.query.mockResolvedValue([])
    mocks.getAreaById.mockResolvedValue({ id: 1 })
    mocks.resolveVerifiedRequirementResponsibilityPerson.mockResolvedValue({
      email: 'new@example.test',
      givenName: 'New',
      hsaId: 'NO5560000001-new1',
      middleName: null,
      surname: 'Owner',
    })
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
      expect(mocks.createArea).toHaveBeenCalledWith(mocks.db, {
        ...body,
        ownerPerson: expect.objectContaining({
          hsaId: 'NO5560000001-new1',
        }),
      })
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

    it('uses a locally verified owner person without HSA lookup on save', async () => {
      mocks.resolveVerifiedRequirementResponsibilityPerson.mockResolvedValueOnce(
        {
          email: 'verified.owner@example.test',
          givenName: 'Verified',
          hsaId: 'NO5560000001-new1',
          middleName: null,
          surname: 'Owner',
        },
      )
      const body = {
        ownerHsaId: 'NO5560000001-new1',
        prefix: 'NEW',
        name: 'New requirement area',
      }
      mocks.createArea.mockResolvedValue({ id: 4, ...body })

      const res = await POST(request(body))

      expect(res.status).toBe(201)
      expect(
        mocks.resolveVerifiedRequirementResponsibilityPerson,
      ).toHaveBeenCalledWith(mocks.db, 'NO5560000001-new1')
      expect(mocks.createArea).toHaveBeenCalledWith(mocks.db, {
        name: 'New requirement area',
        ownerHsaId: 'NO5560000001-new1',
        ownerPerson: {
          email: 'verified.owner@example.test',
          givenName: 'Verified',
          hsaId: 'NO5560000001-new1',
          middleName: null,
          surname: 'Owner',
        },
        prefix: 'NEW',
      })
      expect(mocks.recordAdminPrivilegedActionSucceeded).toHaveBeenCalledWith(
        expect.objectContaining({ requestId: 'request-area' }),
        expect.objectContaining({
          changedFields: ['name', 'ownerHsaId', 'prefix'],
        }),
      )
    })

    it('rejects obsolete person payload fields on create', async () => {
      const ownerPersonPayload = {
        displayName: 'Verified Owner',
        email: 'preview.owner@example.test',
        givenName: 'Verified',
        hsaId: 'NO5560000001-new1',
        middleName: null,
        surname: 'Owner',
      }
      const body = {
        ownerHsaId: 'NO5560000001-new1',
        ownerPersonPreview: ownerPersonPayload,
        prefix: 'NEW',
        name: 'New requirement area',
      }

      const res = await POST(request(body))

      expect(res.status).toBe(400)
      expect(mocks.createArea).not.toHaveBeenCalled()
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
      mocks.resolveVerifiedRequirementResponsibilityPerson.mockResolvedValue({
        email: 'next@example.test',
        givenName: 'Next',
        hsaId: 'NO5560000001-next1',
        middleName: null,
        surname: 'Owner',
      })
      mocks.updateAreaWithOwnerCheck.mockResolvedValue({
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
      expect(mocks.updateAreaWithOwnerCheck).toHaveBeenCalledWith(
        mocks.db,
        1,
        expect.objectContaining({
          ownerHsaId: 'NO5560000001-next1',
          resolveOwnerPerson: expect.any(Function),
        }),
      )
    })

    it('rejects changing ownerHsaId to an existing co-author', async () => {
      const { validationError } = await import('@/lib/requirements/errors')
      mocks.updateAreaWithOwnerCheck.mockRejectedValueOnce(
        validationError(
          'Requirement area owner cannot also be requirement area co-author',
          { reason: 'area_owner_cannot_be_co_author' },
        ),
      )

      const res = await PUT(
        request(
          { ownerHsaId: 'NO5560000001-next1' },
          'http://localhost/api/requirement-areas/1',
          'PUT',
        ),
        makeParams('1'),
      )

      expect(res.status).toBe(400)
      await expect(res.json()).resolves.toMatchObject({
        error:
          'Requirement area owner cannot also be requirement area co-author',
      })
      expect(mocks.updateArea).not.toHaveBeenCalled()
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
      expect(mocks.updateAreaWithOwnerCheck).not.toHaveBeenCalled()
    })
  })
})

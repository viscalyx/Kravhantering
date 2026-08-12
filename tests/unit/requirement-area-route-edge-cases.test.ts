import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  callMutation,
  authenticatedRouteContext as context,
  routeParams,
  routeRequest,
} from '@/tests/unit/helpers/route-handler-test-helpers'

const state = vi.hoisted(() => ({
  adminAudit: vi.fn(),
  canAuthorArea: vi.fn(),
  canManageAreaCoAuthors: vi.fn(),
  createAdminPrivilegedAuditContext: vi.fn(),
  createRequestContext: vi.fn(),
  delegatedAudit: vi.fn(),
  deleteArea: vi.fn(),
  deniedAudit: vi.fn(),
  getAreaById: vi.fn(),
  isForeignKeyViolation: vi.fn(),
  listRequirementAreaCoAuthors: vi.fn(),
  logSanitizedError: vi.fn(),
  replaceRequirementAreaCoAuthors: vi.fn(),
  resolvePeople: vi.fn(),
  resolvePerson: vi.fn(),
  updateAreaWithOwnerCheck: vi.fn(),
}))

const db = { query: vi.fn() }

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: vi.fn(async () => db),
}))

vi.mock('@/lib/requirements/auth', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/requirements/auth')>()),
  createRequestContext: state.createRequestContext,
}))

vi.mock('@/lib/dal/requirement-areas', () => ({
  canAuthorArea: state.canAuthorArea,
  canManageAreaCoAuthors: state.canManageAreaCoAuthors,
  deleteArea: state.deleteArea,
  getAreaById: state.getAreaById,
  listRequirementAreaCoAuthors: state.listRequirementAreaCoAuthors,
  replaceRequirementAreaCoAuthors: state.replaceRequirementAreaCoAuthors,
  updateAreaWithOwnerCheck: state.updateAreaWithOwnerCheck,
}))

vi.mock('@/lib/admin/privileged-audit', () => ({
  createAdminPrivilegedAuditContext: state.createAdminPrivilegedAuditContext,
  recordAdminPrivilegedActionSucceeded: state.adminAudit,
  recordDelegatedPrivilegedActionSucceeded: state.delegatedAudit,
}))

vi.mock('@/lib/requirements/responsibility-person-verification', () => ({
  REQUIREMENT_RESPONSIBILITY_PERSON_VERIFICATION_EVIDENCE_MAX_LENGTH: 4096,
  resolveVerifiedRequirementResponsibilityPeople: state.resolvePeople,
  resolveVerifiedRequirementResponsibilityPerson: state.resolvePerson,
}))

vi.mock('@/lib/audit/action-audit', () => ({
  recordDeniedActionAuditEvent: state.deniedAudit,
}))

vi.mock('@/lib/http/safe-errors', () => ({
  isForeignKeyViolation: state.isForeignKeyViolation,
  logSanitizedError: state.logSanitizedError,
}))

import {
  GET as areaCoAuthorsGet,
  PUT as areaCoAuthorsPut,
} from '@/app/api/requirement-areas/[id]/co-authors/route'
import {
  DELETE as areaDelete,
  GET as areaGet,
  PUT as areaPut,
} from '@/app/api/requirement-areas/[id]/route'
import { getRouteHandlerBrand } from '@/lib/http/response-policy'

describe('requirement-area routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.createAdminPrivilegedAuditContext.mockResolvedValue(context)
    state.createRequestContext.mockResolvedValue(context)
    state.canManageAreaCoAuthors.mockResolvedValue(true)
    state.deleteArea.mockResolvedValue(1)
    state.getAreaById.mockResolvedValue({ id: 7 })
    state.listRequirementAreaCoAuthors.mockResolvedValue([{ hsaId: 'author' }])
    state.replaceRequirementAreaCoAuthors.mockResolvedValue({ areaId: 7 })
    state.resolvePeople.mockReturnValue([])
    state.resolvePerson.mockReturnValue({ hsaId: 'SE5560000001-next' })
    state.updateAreaWithOwnerCheck.mockResolvedValue({ id: 7 })
  })

  it('keeps requirement-area mutations behind the secure route wrapper', () => {
    expect(
      [areaCoAuthorsPut, areaPut, areaDelete].map(getRouteHandlerBrand),
    ).toEqual(['mutation', 'mutation', 'mutation'])
  })

  it('covers co-author GET validation, missing, denial, and success', async () => {
    const request = routeRequest()
    expect((await areaCoAuthorsGet(request, routeParams('bad'))).status).toBe(
      400,
    )
    state.getAreaById.mockResolvedValueOnce(null)
    expect((await areaCoAuthorsGet(request, routeParams('7'))).status).toBe(404)
    state.canManageAreaCoAuthors.mockResolvedValueOnce(false)
    expect((await areaCoAuthorsGet(request, routeParams('7'))).status).toBe(403)
    const success = await areaCoAuthorsGet(request, routeParams('7'))
    expect(success.status).toBe(200)
    expect(await success.json()).toEqual({ coAuthors: [{ hsaId: 'author' }] })
  })

  it('covers co-author PUT validation, authorization, and outcomes', async () => {
    const path = '/api/requirement-areas/7/co-authors'
    const body = {
      coAuthorHsaIds: ['SE5560000001-author'],
      verificationEvidence: ['verified-author'],
    }
    expect(
      (await callMutation(areaCoAuthorsPut, path, 'PUT', { body, id: '7' }))
        .status,
    ).toBe(200)
    expect(state.replaceRequirementAreaCoAuthors).toHaveBeenCalledWith(
      db,
      7,
      expect.objectContaining({
        changedBy: {
          displayName: 'Route Test Actor',
          hsaId: 'SE5560000001-actor',
        },
      }),
    )

    state.getAreaById
      .mockResolvedValueOnce({ id: 7 })
      .mockResolvedValueOnce(null)
    expect(
      (await callMutation(areaCoAuthorsPut, path, 'PUT', { body, id: '7' }))
        .status,
    ).toBe(404)

    state.replaceRequirementAreaCoAuthors.mockResolvedValueOnce(undefined)
    expect(
      (await callMutation(areaCoAuthorsPut, path, 'PUT', { body, id: '7' }))
        .status,
    ).toBe(404)

    state.getAreaById.mockResolvedValueOnce(null)
    expect(
      (await callMutation(areaCoAuthorsPut, path, 'PUT', { body, id: '7' }))
        .status,
    ).toBe(200)

    state.canManageAreaCoAuthors.mockResolvedValueOnce(false)
    expect(
      (await callMutation(areaCoAuthorsPut, path, 'PUT', { body, id: '7' }))
        .status,
    ).toBe(403)
    expect(
      (
        await callMutation(areaCoAuthorsPut, path, 'PUT', {
          body: { coAuthorHsaIds: ['bad'] },
          id: '7',
        })
      ).status,
    ).toBe(400)
  })

  it('covers detail reads and wrapped deletion outcomes', async () => {
    const request = routeRequest()
    expect((await areaGet(request, routeParams('bad'))).status).toBe(400)

    state.getAreaById.mockResolvedValueOnce(null)
    expect((await areaGet(request, routeParams('7'))).status).toBe(404)

    state.createRequestContext.mockResolvedValueOnce({
      ...context,
      actor: {
        ...context.actor,
        hsaId: 'SE5560000001-owner',
        roles: ['Author'],
      },
    })
    state.getAreaById.mockResolvedValueOnce({
      id: 7,
      ownerHsaId: 'SE5560000001-owner',
    })
    state.canAuthorArea.mockResolvedValueOnce(true)
    const owned = await areaGet(request, routeParams('7'))
    await expect(owned.json()).resolves.toMatchObject({
      area: {
        permissions: { canAuthor: true, canManageAssignments: true },
      },
    })

    state.createRequestContext.mockResolvedValueOnce({
      ...context,
      actor: { ...context.actor, roles: ['Author'] },
    })
    state.getAreaById.mockResolvedValueOnce({
      id: 7,
      ownerHsaId: 'SE5560000001-other',
    })
    const unowned = await areaGet(request, routeParams('7'))
    await expect(unowned.json()).resolves.toMatchObject({
      area: { permissions: { canManageAssignments: false } },
    })

    const path = '/api/requirement-areas/7'
    expect(
      (await callMutation(areaDelete, path, 'DELETE', { id: '7' })).status,
    ).toBe(200)
    expect(state.adminAudit).toHaveBeenCalledWith(
      context,
      expect.objectContaining({ operation: 'delete', resourceId: 7 }),
    )

    state.deleteArea.mockResolvedValueOnce(0)
    expect(
      (await callMutation(areaDelete, path, 'DELETE', { id: '7' })).status,
    ).toBe(404)

    state.deleteArea.mockRejectedValueOnce(new Error('foreign key'))
    state.isForeignKeyViolation.mockReturnValueOnce(true)
    expect(
      (await callMutation(areaDelete, path, 'DELETE', { id: '7' })).status,
    ).toBe(409)

    state.deleteArea.mockRejectedValueOnce(new Error('database failure'))
    state.isForeignKeyViolation.mockReturnValueOnce(false)
    expect(
      (await callMutation(areaDelete, path, 'DELETE', { id: '7' })).status,
    ).toBe(500)
  })

  it('executes owner resolution and observes policy outcomes', async () => {
    state.updateAreaWithOwnerCheck.mockImplementationOnce(
      async (_db: unknown, _id: number, data: Record<string, unknown>) => {
        expect(data.ownerPerson).toEqual({ hsaId: 'SE5560000001-next' })
        return { id: 7 }
      },
    )
    const path = '/api/requirement-areas/7'
    const body = {
      ownerHsaId: 'SE5560000001-next',
      verificationEvidence: 'verified-owner',
    }
    expect(
      (await callMutation(areaPut, path, 'PUT', { body, id: '7' })).status,
    ).toBe(200)
    expect(state.resolvePerson).toHaveBeenCalledWith(
      'verified-owner',
      expect.objectContaining({
        hsaId: 'SE5560000001-next',
        purpose: 'requirement_area_owner',
        scopeId: 7,
      }),
    )

    state.getAreaById.mockResolvedValueOnce(null)
    expect(
      (await callMutation(areaPut, path, 'PUT', { body, id: '7' })).status,
    ).toBe(200)

    state.canManageAreaCoAuthors.mockResolvedValueOnce(false)
    expect(
      (await callMutation(areaPut, path, 'PUT', { body, id: '7' })).status,
    ).toBe(403)

    state.createRequestContext.mockResolvedValueOnce({
      ...context,
      actor: { ...context.actor, roles: ['Author'] },
    })
    expect(
      (
        await callMutation(areaPut, path, 'PUT', {
          body: { name: 'Delegated update' },
          id: '7',
        })
      ).status,
    ).toBe(200)
    expect(state.delegatedAudit).toHaveBeenCalled()

    state.updateAreaWithOwnerCheck.mockResolvedValueOnce(undefined)
    expect(
      (
        await callMutation(areaPut, path, 'PUT', {
          body: { name: 'Missing area' },
          id: '7',
        })
      ).status,
    ).toBe(404)
  })

  it('requires owner evidence only when an owner is being changed', async () => {
    const path = '/api/requirement-areas/7'

    expect(
      (
        await callMutation(areaPut, path, 'PUT', {
          body: { ownerHsaId: 'SE5560000001-next' },
          id: '7',
        })
      ).status,
    ).toBe(400)
    expect(
      (
        await callMutation(areaPut, path, 'PUT', {
          body: { name: 'Updated', verificationEvidence: 'orphan-evidence' },
          id: '7',
        })
      ).status,
    ).toBe(400)
  })
})

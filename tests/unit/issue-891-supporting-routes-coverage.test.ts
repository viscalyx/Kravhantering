import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  archiveNormReferenceWithAudit: vi.fn(),
  archiveRequirementPackage: vi.fn(),
  adminAudit: vi.fn(),
  audit: vi.fn(),
  canManageAreaCoAuthors: vi.fn(),
  canAuthorArea: vi.fn(),
  cleanupAudit: vi.fn(),
  countLinkedNormReferences: vi.fn(),
  countLinkedPackages: vi.fn(),
  createNormReferenceWithAudit: vi.fn(),
  createAdminPrivilegedAuditContext: vi.fn(),
  createRequirementPackage: vi.fn(),
  createRequestContext: vi.fn(),
  deleteNormReferenceWithAudit: vi.fn(),
  deleteArea: vi.fn(),
  deleteRequirementPackage: vi.fn(),
  delegatedAudit: vi.fn(),
  deniedAudit: vi.fn(),
  getAreaById: vi.fn(),
  getLinkedRequirements: vi.fn(),
  getLinkedRequirementsForPackage: vi.fn(),
  getNormReferenceById: vi.fn(),
  getRequirementPackageById: vi.fn(),
  getRequirementPackageUsage: vi.fn(),
  listRequirementAreaCoAuthors: vi.fn(),
  listNormReferences: vi.fn(),
  listRequirementPackageCoAuthors: vi.fn(),
  listRequirementPackages: vi.fn(),
  logSanitizedError: vi.fn(),
  isForeignKeyViolation: vi.fn(),
  normPolicyAuthorize: vi.fn(),
  reactivateNormReferenceWithAudit: vi.fn(),
  reactivateRequirementPackage: vi.fn(),
  replaceRequirementAreaCoAuthors: vi.fn(),
  replaceRequirementPackageCoAuthors: vi.fn(),
  requirePackageCreatePermission: vi.fn(),
  requireLeadOrAdmin: vi.fn(),
  requirePackagePermission: vi.fn(),
  resolvePeople: vi.fn(),
  resolvePerson: vi.fn(),
  updateNormReferenceWithAudit: vi.fn(),
  updateAreaWithOwnerCheck: vi.fn(),
  updateRequirementPackage: vi.fn(),
}))

const db = { query: vi.fn() }
Object.assign(db, {
  transaction: vi.fn(async (callback: (manager: typeof db) => unknown) =>
    callback(db),
  ),
})
const context = {
  actor: {
    displayName: 'Issue 891 Actor',
    hsaId: 'SE5560000001-actor',
    id: 'issue-891',
    isAuthenticated: true,
    roles: ['Admin'],
    source: 'oidc',
  },
  correlationId: 'correlation',
  requestId: 'request',
  source: 'rest',
}

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
  getAreaById: state.getAreaById,
  deleteArea: state.deleteArea,
  listRequirementAreaCoAuthors: state.listRequirementAreaCoAuthors,
  replaceRequirementAreaCoAuthors: state.replaceRequirementAreaCoAuthors,
  updateAreaWithOwnerCheck: state.updateAreaWithOwnerCheck,
}))

vi.mock('@/lib/admin/privileged-audit', () => ({
  createAdminPrivilegedAuditContext: state.createAdminPrivilegedAuditContext,
  recordAdminPrivilegedActionSucceeded: state.adminAudit,
  recordDelegatedPrivilegedActionSucceeded: state.delegatedAudit,
}))

vi.mock('@/lib/dal/requirement-packages', () => ({
  archiveRequirementPackage: state.archiveRequirementPackage,
  countLinkedRequirementsByPackage: state.countLinkedPackages,
  createRequirementPackage: state.createRequirementPackage,
  deleteRequirementPackage: state.deleteRequirementPackage,
  getLinkedRequirementsForPackage: state.getLinkedRequirementsForPackage,
  getRequirementPackageById: state.getRequirementPackageById,
  getRequirementPackageUsage: state.getRequirementPackageUsage,
  listRequirementPackageCoAuthors: state.listRequirementPackageCoAuthors,
  listRequirementPackages: state.listRequirementPackages,
  reactivateRequirementPackage: state.reactivateRequirementPackage,
  replaceRequirementPackageCoAuthors: state.replaceRequirementPackageCoAuthors,
  updateRequirementPackage: state.updateRequirementPackage,
}))

vi.mock('@/lib/dal/norm-references', () => ({
  countLinkedRequirements: state.countLinkedNormReferences,
  getLinkedRequirements: state.getLinkedRequirements,
  getNormReferenceById: state.getNormReferenceById,
  listNormReferences: state.listNormReferences,
}))

vi.mock('@/lib/requirements/norm-reference-mutations', () => ({
  archiveNormReferenceWithAudit: state.archiveNormReferenceWithAudit,
  deleteNormReferenceWithAudit: state.deleteNormReferenceWithAudit,
  createNormReferenceWithAudit: state.createNormReferenceWithAudit,
  reactivateNormReferenceWithAudit: state.reactivateNormReferenceWithAudit,
  updateNormReferenceWithAudit: state.updateNormReferenceWithAudit,
}))

vi.mock('@/lib/requirements/norm-reference-permissions', () => ({
  normReferenceMutationPolicy: (name: string) => ({
    authorize: state.normPolicyAuthorize,
    kind: 'custom',
    name,
  }),
}))

vi.mock('@/lib/requirements/requirement-package-permissions', () => ({
  requireRequirementPackageCreatePermission:
    state.requirePackageCreatePermission,
  requireRequirementPackageLeadOrAdmin: state.requireLeadOrAdmin,
  requireRequirementPackagePermission: state.requirePackagePermission,
}))

vi.mock('@/lib/requirements/responsibility-person-verification', () => ({
  resolveVerifiedRequirementResponsibilityPeople: state.resolvePeople,
  resolveVerifiedRequirementResponsibilityPerson: state.resolvePerson,
}))

vi.mock('@/lib/audit/action-audit', () => ({
  recordAllowedActionAuditEvent: state.audit,
  recordDeniedActionAuditEvent: state.deniedAudit,
}))

vi.mock('@/lib/audit/requirement-selection-cleanup-audit', () => ({
  recordRequirementSelectionCleanupAudit: state.cleanupAudit,
}))

vi.mock('@/lib/http/safe-errors', () => ({
  isForeignKeyViolation: state.isForeignKeyViolation,
  logSanitizedError: state.logSanitizedError,
}))

import { POST as normArchivePost } from '@/app/api/norm-reference-actions/[id]/archive/route'
import { POST as normReactivatePost } from '@/app/api/norm-references/[id]/reactivate/route'
import {
  DELETE as normDelete,
  GET as normGet,
  PUT as normPut,
} from '@/app/api/norm-references/[id]/route'
import {
  POST as normCreatePost,
  GET as normListGet,
} from '@/app/api/norm-references/route'
import {
  GET as areaCoAuthorsGet,
  PUT as areaCoAuthorsPut,
} from '@/app/api/requirement-areas/[id]/co-authors/route'
import {
  DELETE as areaDelete,
  GET as areaGet,
  PUT as areaPut,
} from '@/app/api/requirement-areas/[id]/route'
import { POST as packageArchivePost } from '@/app/api/requirement-packages/[id]/archive/route'
import {
  GET as packageCoAuthorsGet,
  PUT as packageCoAuthorsPut,
} from '@/app/api/requirement-packages/[id]/co-authors/route'
import { POST as packageReactivatePost } from '@/app/api/requirement-packages/[id]/reactivate/route'
import {
  DELETE as packageDelete,
  GET as packageGet,
  PUT as packagePut,
} from '@/app/api/requirement-packages/[id]/route'
import {
  POST as packageCreatePost,
  GET as packageListGet,
} from '@/app/api/requirement-packages/route'
import { getRouteHandlerBrand } from '@/lib/http/response-policy'
import type { MutationRouteHandler } from '@/lib/http/secure-mutation-route'
import { forbiddenError } from '@/lib/requirements/errors'

const request = new NextRequest('https://example.test/api/resource')
const routeParams = (id: string) => ({ params: Promise.resolve({ id }) })

type MutationMethod = 'DELETE' | 'POST' | 'PUT'
function mutationRequest(
  path: string,
  method: MutationMethod,
  body?: Record<string, unknown>,
): NextRequest {
  return new NextRequest(`https://example.test${path}`, {
    ...(body
      ? {
          body: JSON.stringify(body),
          headers: { 'content-type': 'application/json' },
        }
      : {}),
    method,
  })
}

function callMutation(
  handler: MutationRouteHandler,
  path: string,
  method: MutationMethod,
  options: { body?: Record<string, unknown>; id?: string } = {},
): Promise<Response> {
  return handler(
    mutationRequest(path, method, options.body),
    options.id === undefined ? undefined : routeParams(options.id),
  )
}

describe('Issue 891 supporting workflow routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.createAdminPrivilegedAuditContext.mockResolvedValue(context)
    state.createRequestContext.mockResolvedValue(context)
    state.canManageAreaCoAuthors.mockResolvedValue(true)
    state.deleteArea.mockResolvedValue(1)
    state.getAreaById.mockResolvedValue({ id: 7 })
    state.updateAreaWithOwnerCheck.mockResolvedValue({ id: 7 })
    state.listRequirementAreaCoAuthors.mockResolvedValue([{ hsaId: 'author' }])
    state.replaceRequirementAreaCoAuthors.mockResolvedValue({ areaId: 7 })
    state.getRequirementPackageById.mockResolvedValue({
      coAuthors: [],
      id: 7,
      leadHsaId: 'SE5560000001-lead',
    })
    state.getLinkedRequirements.mockResolvedValue([])
    state.getLinkedRequirementsForPackage.mockResolvedValue([])
    state.listRequirementPackageCoAuthors.mockResolvedValue([
      { hsaId: 'author' },
    ])
    state.replaceRequirementPackageCoAuthors.mockResolvedValue({
      coAuthorHsaIds: ['SE5560000001-author'],
      requirementPackageId: 7,
    })
    state.resolvePeople.mockResolvedValue([])
    state.resolvePerson.mockResolvedValue({ hsaId: 'SE5560000001-next' })
    state.updateRequirementPackage.mockResolvedValue({ id: 7 })
    state.deleteRequirementPackage.mockResolvedValue({
      cleanup: { removedLinkCount: 0 },
      deletedCount: 1,
    })
    state.getRequirementPackageUsage.mockResolvedValue({
      answerLinkCount: 0,
      libraryRequirementCount: 1,
    })
    state.reactivateRequirementPackage.mockResolvedValue({ id: 7 })
    state.archiveRequirementPackage.mockResolvedValue({
      cleanup: { removedLinkCount: 0 },
      requirementPackage: { id: 7 },
    })
    state.createRequirementPackage.mockResolvedValue({ id: 7 })
    state.listRequirementPackages.mockResolvedValue([
      { id: 7, leadHsaId: 'SE5560000001-actor' },
    ])
    state.countLinkedPackages.mockResolvedValue({ 7: 2 })
    state.getNormReferenceById.mockResolvedValue({ id: 7 })
    state.updateNormReferenceWithAudit.mockResolvedValue({ id: 7 })
    state.deleteNormReferenceWithAudit.mockResolvedValue({ status: 'deleted' })
    state.archiveNormReferenceWithAudit.mockResolvedValue({ id: 7 })
    state.reactivateNormReferenceWithAudit.mockResolvedValue({ id: 7 })
    state.createNormReferenceWithAudit.mockResolvedValue({ id: 7 })
    state.listNormReferences.mockResolvedValue([{ id: 7 }, { id: 8 }])
    state.countLinkedNormReferences.mockResolvedValue({ 7: 2 })
  })

  it('keeps every mutation behind the secure route wrapper', () => {
    expect(
      [
        areaCoAuthorsPut,
        areaPut,
        areaDelete,
        packageCoAuthorsPut,
        normPut,
        normDelete,
        normArchivePost,
        normReactivatePost,
        normCreatePost,
        packagePut,
        packageDelete,
        packageArchivePost,
        packageReactivatePost,
        packageCreatePost,
      ].map(getRouteHandlerBrand),
    ).toEqual(Array.from({ length: 14 }, () => 'mutation'))
  })

  it('covers requirement-area co-author GET validation, missing, denial, and success', async () => {
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

  it('covers requirement-area co-author PUT validation, authorization, and outcomes', async () => {
    const path = '/api/requirement-areas/7/co-authors'
    const body = { coAuthorHsaIds: ['SE5560000001-author'] }
    expect(
      (await callMutation(areaCoAuthorsPut, path, 'PUT', { body, id: '7' }))
        .status,
    ).toBe(200)
    expect(state.replaceRequirementAreaCoAuthors).toHaveBeenCalledWith(
      db,
      7,
      expect.objectContaining({
        changedBy: {
          displayName: 'Issue 891 Actor',
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

  it('covers requirement-area detail reads and wrapped deletion outcomes', async () => {
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

  it('executes requirement-area owner resolution and observes policy outcomes', async () => {
    state.updateAreaWithOwnerCheck.mockImplementationOnce(
      async (_db: unknown, _id: number, data: Record<string, unknown>) => {
        const resolveOwnerPerson = data.resolveOwnerPerson as (
          executor: unknown,
          hsaId: string,
        ) => Promise<unknown>
        await resolveOwnerPerson(db, 'SE5560000001-next')
        return { id: 7 }
      },
    )
    const path = '/api/requirement-areas/7'
    const body = { ownerHsaId: 'SE5560000001-next' }
    expect(
      (await callMutation(areaPut, path, 'PUT', { body, id: '7' })).status,
    ).toBe(200)
    expect(state.resolvePerson).toHaveBeenCalledWith(db, 'SE5560000001-next')

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

  it('covers package co-author GET and wrapped PUT outcomes', async () => {
    expect(
      (await packageCoAuthorsGet(request, routeParams('bad'))).status,
    ).toBe(400)
    state.getRequirementPackageById.mockResolvedValueOnce(null)
    expect((await packageCoAuthorsGet(request, routeParams('7'))).status).toBe(
      404,
    )
    state.requireLeadOrAdmin.mockRejectedValueOnce(new Error('denied'))
    expect((await packageCoAuthorsGet(request, routeParams('7'))).status).toBe(
      500,
    )
    expect((await packageCoAuthorsGet(request, routeParams('7'))).status).toBe(
      200,
    )

    const path = '/api/requirement-packages/7/co-authors'
    const body = { coAuthorHsaIds: ['SE5560000001-author'] }
    expect(
      (
        await callMutation(packageCoAuthorsPut, path, 'PUT', {
          body,
          id: '7',
        })
      ).status,
    ).toBe(200)
    expect(state.audit).toHaveBeenCalled()

    state.getRequirementPackageById.mockResolvedValueOnce(null)
    expect(
      (
        await callMutation(packageCoAuthorsPut, path, 'PUT', {
          body,
          id: '7',
        })
      ).status,
    ).toBe(404)

    state.replaceRequirementPackageCoAuthors.mockResolvedValueOnce(undefined)
    expect(
      (
        await callMutation(packageCoAuthorsPut, path, 'PUT', {
          body,
          id: '7',
        })
      ).status,
    ).toBe(404)

    state.requireLeadOrAdmin.mockRejectedValueOnce(
      forbiddenError('denied', { reason: 'package_lead_required' }),
    )
    expect(
      (
        await callMutation(packageCoAuthorsPut, path, 'PUT', {
          body,
          id: '7',
        })
      ).status,
    ).toBe(403)

    state.replaceRequirementPackageCoAuthors.mockResolvedValueOnce({
      coAuthorHsaIds: [],
      requirementPackageId: 7,
    })
    state.createRequestContext.mockResolvedValueOnce({
      ...context,
      actor: {
        ...context.actor,
        displayName: '',
        id: 'fallback-id',
      },
    })
    expect(
      (
        await callMutation(packageCoAuthorsPut, path, 'PUT', {
          body,
          id: '7',
        })
      ).status,
    ).toBe(200)
    expect(state.replaceRequirementPackageCoAuthors).toHaveBeenLastCalledWith(
      db,
      7,
      expect.objectContaining({
        changedBy: expect.objectContaining({ displayName: 'fallback-id' }),
      }),
    )
    expect(
      (
        await callMutation(packageCoAuthorsPut, path, 'PUT', {
          body: {
            coAuthorHsaIds: ['SE5560000001-author', 'SE5560000001-author'],
          },
          id: '7',
        })
      ).status,
    ).toBe(400)
  })

  it('covers norm detail GET and all mutation outcomes', async () => {
    expect((await normGet(request, routeParams('bad'))).status).toBe(400)
    expect((await normGet(request, routeParams('7'))).status).toBe(200)
    state.getNormReferenceById.mockResolvedValueOnce(null)
    expect((await normGet(request, routeParams('7'))).status).toBe(404)

    const detailPath = '/api/norm-references/7'
    expect(
      (
        await callMutation(normPut, detailPath, 'PUT', {
          body: { name: 'Updated' },
          id: '7',
        })
      ).status,
    ).toBe(200)
    state.updateNormReferenceWithAudit.mockResolvedValueOnce(undefined)
    expect(
      (
        await callMutation(normPut, detailPath, 'PUT', {
          body: { name: 'Updated' },
          id: '7',
        })
      ).status,
    ).toBe(404)

    expect(
      (await callMutation(normDelete, detailPath, 'DELETE', { id: '7' }))
        .status,
    ).toBe(200)
    state.deleteNormReferenceWithAudit.mockResolvedValueOnce({
      status: 'not_found',
    })
    expect(
      (await callMutation(normDelete, detailPath, 'DELETE', { id: '7' }))
        .status,
    ).toBe(404)
    state.deleteNormReferenceWithAudit.mockResolvedValueOnce({
      status: 'in_use',
      usage: { libraryRequirementCount: 1, localRequirementCount: 0 },
    })
    expect(
      (await callMutation(normDelete, detailPath, 'DELETE', { id: '7' }))
        .status,
    ).toBe(409)

    const archivePath = '/api/norm-reference-actions/7/archive'
    expect(
      (await callMutation(normArchivePost, archivePath, 'POST', { id: '7' }))
        .status,
    ).toBe(200)
    state.archiveNormReferenceWithAudit.mockResolvedValueOnce(undefined)
    expect(
      (await callMutation(normArchivePost, archivePath, 'POST', { id: '7' }))
        .status,
    ).toBe(404)

    const reactivatePath = '/api/norm-references/7/reactivate'
    expect(
      (
        await callMutation(normReactivatePost, reactivatePath, 'POST', {
          id: '7',
        })
      ).status,
    ).toBe(200)
    state.reactivateNormReferenceWithAudit.mockResolvedValueOnce(undefined)
    expect(
      (
        await callMutation(normReactivatePost, reactivatePath, 'POST', {
          id: '7',
        })
      ).status,
    ).toBe(404)
  })

  it('covers norm-reference list validation/filtering and create shaping', async () => {
    expect(
      (
        await normListGet(
          new Request('https://example.test/api/norm-references?linked=bad'),
        )
      ).status,
    ).toBe(400)
    const all = await normListGet(
      new Request('https://example.test/api/norm-references'),
    )
    expect(await all.json()).toEqual({
      normReferences: [
        { id: 7, linkedRequirementCount: 2 },
        { id: 8, linkedRequirementCount: 0 },
      ],
    })
    const linked = await normListGet(
      new Request(
        'https://example.test/api/norm-references?linked=true&statuses=3&includeArchived=true&includeIds=7',
      ),
    )
    expect(await linked.json()).toEqual({
      normReferences: [{ id: 7, linkedRequirementCount: 2 }],
    })
    expect(state.countLinkedNormReferences).toHaveBeenLastCalledWith(db, {
      statuses: [3],
    })

    const body = {
      issuer: 'ISO',
      name: 'Security',
      normReferenceId: 'ISO-1',
      reference: 'ISO 1',
      type: 'Standard',
      uri: '',
      version: '',
    }
    expect(
      (
        await callMutation(normCreatePost, '/api/norm-references', 'POST', {
          body,
        })
      ).status,
    ).toBe(201)
    expect(state.createNormReferenceWithAudit).toHaveBeenCalledWith(
      db,
      { ...body, uri: null, version: null },
      context,
    )
  })

  it('covers package detail GET and wrapped update outcomes', async () => {
    expect((await packageGet(request, routeParams('bad'))).status).toBe(400)
    expect((await packageGet(request, routeParams('7'))).status).toBe(200)
    state.getRequirementPackageById.mockResolvedValueOnce(null)
    expect((await packageGet(request, routeParams('7'))).status).toBe(404)

    const path = '/api/requirement-packages/7'
    expect(
      (
        await callMutation(packagePut, path, 'PUT', {
          body: { name: 'Updated' },
          id: '7',
        })
      ).status,
    ).toBe(200)
    state.getRequirementPackageById.mockResolvedValueOnce(null)
    expect(
      (
        await callMutation(packagePut, path, 'PUT', {
          body: { name: 'Updated' },
          id: '7',
        })
      ).status,
    ).toBe(404)
    state.getRequirementPackageById.mockResolvedValueOnce({
      coAuthors: [{ hsaId: 'SE5560000001-next' }],
      id: 7,
      leadHsaId: 'SE5560000001-lead',
    })
    expect(
      (
        await callMutation(packagePut, path, 'PUT', {
          body: { leadHsaId: 'SE5560000001-next' },
          id: '7',
        })
      ).status,
    ).toBe(400)
    state.updateRequirementPackage.mockResolvedValueOnce(undefined)
    expect(
      (
        await callMutation(packagePut, path, 'PUT', {
          body: { name: 'Updated' },
          id: '7',
        })
      ).status,
    ).toBe(404)
    expect(
      (
        await callMutation(packagePut, path, 'PUT', {
          body: {},
          id: '7',
        })
      ).status,
    ).toBe(400)
  })

  it('covers package delete conflict, missing, success, audit failure, and reactivation', async () => {
    const path = '/api/requirement-packages/7'
    state.deleteRequirementPackage.mockResolvedValueOnce({
      cleanup: { removedLinkCount: 0 },
      deletedCount: 0,
    })
    expect(
      (await callMutation(packageDelete, path, 'DELETE', { id: '7' })).status,
    ).toBe(409)
    state.deleteRequirementPackage.mockResolvedValueOnce({
      cleanup: { removedLinkCount: 0 },
      deletedCount: 0,
    })
    state.getRequirementPackageById.mockResolvedValueOnce(null)
    expect(
      (await callMutation(packageDelete, path, 'DELETE', { id: '7' })).status,
    ).toBe(404)
    state.cleanupAudit.mockRejectedValueOnce(new Error('audit failed'))
    expect(
      (await callMutation(packageDelete, path, 'DELETE', { id: '7' })).status,
    ).toBe(200)
    expect(state.logSanitizedError).toHaveBeenCalled()

    const reactivatePath = '/api/requirement-packages/7/reactivate'
    expect(
      (
        await callMutation(packageReactivatePost, reactivatePath, 'POST', {
          id: '7',
        })
      ).status,
    ).toBe(200)
    expect(state.audit).toHaveBeenCalledWith(
      db,
      context,
      expect.objectContaining({ action: 'requirement_package.reactivate' }),
    )
    state.reactivateRequirementPackage.mockResolvedValueOnce(undefined)
    expect(
      (
        await callMutation(packageReactivatePost, reactivatePath, 'POST', {
          id: '7',
        })
      ).status,
    ).toBe(404)
  })

  it('covers package list permissions and wrapped creation and archiving', async () => {
    expect(
      (
        await packageListGet(
          new Request(
            'https://example.test/api/requirement-packages?includeArchived=bad',
          ),
        )
      ).status,
    ).toBe(400)

    const listResponse = await packageListGet(
      new Request(
        'https://example.test/api/requirement-packages?includeArchived=true',
      ),
    )
    expect(await listResponse.json()).toEqual({
      requirementPackages: [
        expect.objectContaining({
          linkedRequirementCount: 2,
          permissions: { canManageAssignments: true },
        }),
      ],
    })
    state.createRequestContext.mockResolvedValueOnce({
      ...context,
      actor: { ...context.actor, hsaId: null, roles: [] },
    })
    const anonymousHsa = await packageListGet(
      new Request('https://example.test/api/requirement-packages'),
    )
    expect(await anonymousHsa.json()).toEqual({
      requirementPackages: [
        expect.objectContaining({
          permissions: { canManageAssignments: false },
        }),
      ],
    })

    state.createRequestContext.mockResolvedValueOnce({
      ...context,
      actor: { ...context.actor, roles: ['Author'] },
    })
    state.listRequirementPackages.mockResolvedValueOnce([
      { id: 8, leadHsaId: 'SE5560000001-actor' },
    ])
    state.countLinkedPackages.mockResolvedValueOnce({})
    const matchingLead = await packageListGet(
      new Request('https://example.test/api/requirement-packages'),
    )
    await expect(matchingLead.json()).resolves.toEqual({
      requirementPackages: [
        expect.objectContaining({
          linkedRequirementCount: 0,
          permissions: { canManageAssignments: true },
        }),
      ],
    })

    expect(
      (
        await callMutation(
          packageCreatePost,
          '/api/requirement-packages',
          'POST',
          { body: { name: 'Package', purposeAndScope: 'Scope' } },
        )
      ).status,
    ).toBe(201)

    const archivePath = '/api/requirement-packages/7/archive'
    expect(
      (
        await callMutation(packageArchivePost, archivePath, 'POST', {
          id: '7',
        })
      ).status,
    ).toBe(200)
    expect(state.cleanupAudit).toHaveBeenCalled()
    state.archiveRequirementPackage.mockResolvedValueOnce(undefined)
    expect(
      (
        await callMutation(packageArchivePost, archivePath, 'POST', {
          id: '7',
        })
      ).status,
    ).toBe(404)
  })
})

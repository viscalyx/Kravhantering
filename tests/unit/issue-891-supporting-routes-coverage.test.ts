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
  createRequirementPackage: vi.fn(),
  createRequestContext: vi.fn(),
  deleteNormReferenceWithAudit: vi.fn(),
  deleteArea: vi.fn(),
  deleteRequirementPackage: vi.fn(),
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

vi.mock('@/lib/http/secure-mutation-route', () => ({
  adminMutationPolicy: () => ({ kind: 'admin' }),
  authenticatedMutationPolicy: (name: string) => ({ kind: 'custom', name }),
  customMutationPolicy: (name: string, authorize: unknown) => ({
    authorize,
    kind: 'custom',
    name,
  }),
  secureMutationRoute: (options: {
    bodySchema?: unknown
    handler: object
    policy: unknown
  }) =>
    Object.assign(options.handler, {
      issue891BodySchema: options.bodySchema,
      issue891Policy: options.policy,
    }),
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
  recordAdminPrivilegedActionSucceeded: state.adminAudit,
  recordDelegatedPrivilegedActionSucceeded: vi.fn(),
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
  normReferenceMutationPolicy: (name: string) => ({ kind: 'custom', name }),
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
}))

vi.mock('@/lib/audit/requirement-selection-cleanup-audit', () => ({
  recordRequirementSelectionCleanupAudit: state.cleanupAudit,
}))

vi.mock('@/lib/http/safe-errors', () => ({
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
import { PUT as areaPut } from '@/app/api/requirement-areas/[id]/route'
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

type DirectHandler = (args: {
  body?: Record<string, unknown>
  context: typeof context
  params: { id: number }
}) => Promise<Response>

const direct = (handler: unknown) => handler as DirectHandler
const policyFor = (handler: unknown) =>
  (handler as { issue891Policy: { authorize?: DirectHandler } }).issue891Policy
const bodySchemaFor = (handler: unknown) =>
  (
    handler as {
      issue891BodySchema?: { safeParse: (value: unknown) => unknown }
    }
  ).issue891BodySchema
const request = new NextRequest('https://example.test/api/resource')
const routeParams = (id: string) => ({ params: Promise.resolve({ id }) })

describe('Issue 891 supporting workflow routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.createRequestContext.mockResolvedValue(context)
    state.canManageAreaCoAuthors.mockResolvedValue(true)
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

  it('covers requirement-area co-author PUT success and both not-found outcomes', async () => {
    const args = {
      body: { coAuthorHsaIds: ['SE5560000001-author'] },
      context,
      params: { id: 7 },
    }
    expect((await direct(areaCoAuthorsPut)(args)).status).toBe(200)
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
    state.getAreaById.mockResolvedValueOnce(null)
    expect((await direct(areaCoAuthorsPut)(args)).status).toBe(404)
    state.replaceRequirementAreaCoAuthors.mockResolvedValueOnce(undefined)
    expect((await direct(areaCoAuthorsPut)(args)).status).toBe(404)

    const policy = policyFor(areaCoAuthorsPut)
    state.getAreaById.mockResolvedValueOnce(null)
    await expect(policy.authorize?.(args)).resolves.toBeUndefined()
    await expect(policy.authorize?.(args)).resolves.toBeUndefined()
    state.canManageAreaCoAuthors.mockResolvedValueOnce(false)
    await expect(policy.authorize?.(args)).rejects.toMatchObject({
      code: 'forbidden',
    })
    expect(bodySchemaFor(areaCoAuthorsPut)?.safeParse(args.body)).toMatchObject(
      {
        success: true,
      },
    )
    expect(
      bodySchemaFor(areaCoAuthorsPut)?.safeParse({ coAuthorHsaIds: ['bad'] }),
    ).toMatchObject({ success: false })
  })

  it('executes requirement-area owner resolvers and update policy branches', async () => {
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
    const args = {
      body: { ownerHsaId: 'SE5560000001-next' },
      context,
      params: { id: 7 },
    }
    expect((await direct(areaPut)(args)).status).toBe(200)
    expect(state.resolvePerson).toHaveBeenCalledWith(db, 'SE5560000001-next')
    await expect(policyFor(areaPut).authorize?.(args)).resolves.toBeUndefined()
    state.getAreaById.mockResolvedValueOnce(null)
    await expect(policyFor(areaPut).authorize?.(args)).resolves.toBeUndefined()
    state.canManageAreaCoAuthors.mockResolvedValueOnce(false)
    await expect(policyFor(areaPut).authorize?.(args)).rejects.toMatchObject({
      code: 'forbidden',
    })
  })

  it('covers package co-author GET/PUT success, missing rows, and permission failures', async () => {
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

    const args = {
      body: { coAuthorHsaIds: ['SE5560000001-author'] },
      context,
      params: { id: 7 },
    }
    expect((await direct(packageCoAuthorsPut)(args)).status).toBe(200)
    expect(state.audit).toHaveBeenCalled()
    state.getRequirementPackageById.mockResolvedValueOnce(null)
    expect((await direct(packageCoAuthorsPut)(args)).status).toBe(404)
    state.replaceRequirementPackageCoAuthors.mockResolvedValueOnce(undefined)
    expect((await direct(packageCoAuthorsPut)(args)).status).toBe(404)
    await expect(
      policyFor(packageCoAuthorsPut).authorize?.(args),
    ).resolves.toBeUndefined()
    state.replaceRequirementPackageCoAuthors.mockResolvedValueOnce({
      coAuthorHsaIds: [],
      requirementPackageId: 7,
    })
    await direct(packageCoAuthorsPut)({
      ...args,
      context: {
        ...context,
        actor: { ...context.actor, displayName: '', id: 'fallback-id' },
      },
    })
    expect(state.replaceRequirementPackageCoAuthors).toHaveBeenLastCalledWith(
      db,
      7,
      expect.objectContaining({
        changedBy: expect.objectContaining({ displayName: 'fallback-id' }),
      }),
    )
    expect(
      bodySchemaFor(packageCoAuthorsPut)?.safeParse({
        coAuthorHsaIds: ['SE5560000001-author', 'SE5560000001-author'],
      }),
    ).toMatchObject({ success: false })
  })

  it('covers norm detail GET and all mutation outcomes', async () => {
    expect((await normGet(request, routeParams('bad'))).status).toBe(400)
    expect((await normGet(request, routeParams('7'))).status).toBe(200)
    state.getNormReferenceById.mockResolvedValueOnce(null)
    expect((await normGet(request, routeParams('7'))).status).toBe(404)

    const args = { body: { name: 'Updated' }, context, params: { id: 7 } }
    expect((await direct(normPut)(args)).status).toBe(200)
    state.updateNormReferenceWithAudit.mockResolvedValueOnce(undefined)
    expect((await direct(normPut)(args)).status).toBe(404)

    expect((await direct(normDelete)(args)).status).toBe(200)
    state.deleteNormReferenceWithAudit.mockResolvedValueOnce({
      status: 'not_found',
    })
    expect((await direct(normDelete)(args)).status).toBe(404)
    state.deleteNormReferenceWithAudit.mockResolvedValueOnce({
      status: 'in_use',
      usage: { libraryRequirementCount: 1, localRequirementCount: 0 },
    })
    expect((await direct(normDelete)(args)).status).toBe(409)

    expect((await direct(normArchivePost)(args)).status).toBe(200)
    state.archiveNormReferenceWithAudit.mockResolvedValueOnce(undefined)
    expect((await direct(normArchivePost)(args)).status).toBe(404)
    expect((await direct(normReactivatePost)(args)).status).toBe(200)
    state.reactivateNormReferenceWithAudit.mockResolvedValueOnce(undefined)
    expect((await direct(normReactivatePost)(args)).status).toBe(404)
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

    const args = {
      body: {
        issuer: 'ISO',
        name: 'Security',
        normReferenceId: 'ISO-1',
        reference: 'ISO 1',
        type: 'Standard',
      },
      context,
      params: { id: 7 },
    }
    expect((await direct(normCreatePost)(args)).status).toBe(201)
    expect(
      bodySchemaFor(normCreatePost)?.safeParse({
        ...args.body,
        uri: '',
        version: '',
      }),
    ).toMatchObject({ success: true })
  })

  it('covers package detail GET and update success/conflict/missing outcomes', async () => {
    expect((await packageGet(request, routeParams('bad'))).status).toBe(400)
    expect((await packageGet(request, routeParams('7'))).status).toBe(200)
    state.getRequirementPackageById.mockResolvedValueOnce(null)
    expect((await packageGet(request, routeParams('7'))).status).toBe(404)

    const args = { body: { name: 'Updated' }, context, params: { id: 7 } }
    expect((await direct(packagePut)(args)).status).toBe(200)
    state.getRequirementPackageById.mockResolvedValueOnce(null)
    expect((await direct(packagePut)(args)).status).toBe(404)
    state.getRequirementPackageById.mockResolvedValueOnce({
      coAuthors: [{ hsaId: 'SE5560000001-next' }],
      id: 7,
      leadHsaId: 'SE5560000001-lead',
    })
    await expect(
      direct(packagePut)({ ...args, body: { leadHsaId: 'SE5560000001-next' } }),
    ).rejects.toMatchObject({ code: 'validation' })
    state.updateRequirementPackage.mockResolvedValueOnce(undefined)
    expect((await direct(packagePut)(args)).status).toBe(404)
    await expect(
      policyFor(packagePut).authorize?.(args),
    ).resolves.toBeUndefined()
    expect(bodySchemaFor(packagePut)?.safeParse({})).toMatchObject({
      success: false,
    })
    expect(
      bodySchemaFor(packagePut)?.safeParse({ name: 'Updated' }),
    ).toMatchObject({
      success: true,
    })
  })

  it('covers package delete conflict, missing, success, audit failure, and reactivation', async () => {
    const args = { context, params: { id: 7 } }
    state.deleteRequirementPackage.mockResolvedValueOnce({
      cleanup: { removedLinkCount: 0 },
      deletedCount: 0,
    })
    expect((await direct(packageDelete)(args)).status).toBe(409)
    state.deleteRequirementPackage.mockResolvedValueOnce({
      cleanup: { removedLinkCount: 0 },
      deletedCount: 0,
    })
    state.getRequirementPackageById.mockResolvedValueOnce(null)
    expect((await direct(packageDelete)(args)).status).toBe(404)
    state.cleanupAudit.mockRejectedValueOnce(new Error('audit failed'))
    expect((await direct(packageDelete)(args)).status).toBe(200)
    expect(state.logSanitizedError).toHaveBeenCalled()

    expect((await direct(packageReactivatePost)(args)).status).toBe(200)
    expect(state.audit).toHaveBeenCalledWith(
      db,
      context,
      expect.objectContaining({ action: 'requirement_package.reactivate' }),
    )
    state.reactivateRequirementPackage.mockResolvedValueOnce(undefined)
    expect((await direct(packageReactivatePost)(args)).status).toBe(404)
    expect(() =>
      policyFor(packageReactivatePost).authorize?.(args),
    ).not.toThrow()
    expect(() => policyFor(packageDelete).authorize?.(args)).not.toThrow()
  })

  it('covers package list permissions, creation, archiving, and policies', async () => {
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

    const args = {
      body: { name: 'Package', purposeAndScope: 'Scope' },
      context,
      params: { id: 7 },
    }
    expect((await direct(packageCreatePost)(args)).status).toBe(201)
    await expect(
      policyFor(packageCreatePost).authorize?.(args),
    ).resolves.toBeUndefined()
    expect((await direct(packageArchivePost)(args)).status).toBe(200)
    expect(state.cleanupAudit).toHaveBeenCalled()
    state.archiveRequirementPackage.mockResolvedValueOnce(undefined)
    expect((await direct(packageArchivePost)(args)).status).toBe(404)
    expect(() => policyFor(packageArchivePost).authorize?.(args)).not.toThrow()
  })
})

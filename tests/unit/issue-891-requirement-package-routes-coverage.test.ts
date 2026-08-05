import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  callMutation,
  authenticatedRouteContext as context,
  routeParams,
  routeRequest,
} from '@/tests/unit/route-handler-test-helpers'

const state = vi.hoisted(() => ({
  archiveRequirementPackage: vi.fn(),
  audit: vi.fn(),
  cleanupAudit: vi.fn(),
  countLinkedPackages: vi.fn(),
  createRequestContext: vi.fn(),
  createRequirementPackage: vi.fn(),
  deleteRequirementPackage: vi.fn(),
  deniedAudit: vi.fn(),
  getLinkedRequirementsForPackage: vi.fn(),
  getRequirementPackageById: vi.fn(),
  getRequirementPackageUsage: vi.fn(),
  listRequirementPackageCoAuthors: vi.fn(),
  listRequirementPackages: vi.fn(),
  logSanitizedError: vi.fn(),
  reactivateRequirementPackage: vi.fn(),
  replaceRequirementPackageCoAuthors: vi.fn(),
  requireLeadOrAdmin: vi.fn(),
  requirePackageCreatePermission: vi.fn(),
  requirePackagePermission: vi.fn(),
  resolvePeople: vi.fn(),
  resolvePerson: vi.fn(),
  updateRequirementPackage: vi.fn(),
}))

const db = { query: vi.fn() }
Object.assign(db, {
  transaction: vi.fn(async (callback: (manager: typeof db) => unknown) =>
    callback(db),
  ),
})

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: vi.fn(async () => db),
}))

vi.mock('@/lib/requirements/auth', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/requirements/auth')>()),
  createRequestContext: state.createRequestContext,
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
  logSanitizedError: state.logSanitizedError,
}))

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
import { forbiddenError } from '@/lib/requirements/errors'

describe('Issue 891 requirement-package routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.createRequestContext.mockResolvedValue(context)
    state.getRequirementPackageById.mockResolvedValue({
      coAuthors: [],
      id: 7,
      leadHsaId: 'SE5560000001-lead',
    })
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
  })

  it('keeps requirement-package mutations behind the secure route wrapper', () => {
    expect(
      [
        packageCoAuthorsPut,
        packagePut,
        packageDelete,
        packageArchivePost,
        packageReactivatePost,
        packageCreatePost,
      ].map(getRouteHandlerBrand),
    ).toEqual(Array.from({ length: 6 }, () => 'mutation'))
  })

  it('covers co-author GET and wrapped PUT outcomes', async () => {
    const request = routeRequest()
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

  it('covers detail GET and wrapped update outcomes', async () => {
    const request = routeRequest()
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

  it('covers delete conflict, missing, success, audit failure, and reactivation', async () => {
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

  it('covers list permissions and wrapped creation and archiving', async () => {
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

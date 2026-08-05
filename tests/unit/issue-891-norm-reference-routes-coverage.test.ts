import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  callMutation,
  authenticatedRouteContext as context,
  routeParams,
  routeRequest,
} from '@/tests/unit/route-handler-test-helpers'

const state = vi.hoisted(() => ({
  archiveNormReferenceWithAudit: vi.fn(),
  countLinkedNormReferences: vi.fn(),
  createNormReferenceWithAudit: vi.fn(),
  createRequestContext: vi.fn(),
  deleteNormReferenceWithAudit: vi.fn(),
  deniedAudit: vi.fn(),
  getLinkedRequirements: vi.fn(),
  getNormReferenceById: vi.fn(),
  listNormReferences: vi.fn(),
  logSanitizedError: vi.fn(),
  normPolicyAuthorize: vi.fn(),
  reactivateNormReferenceWithAudit: vi.fn(),
  updateNormReferenceWithAudit: vi.fn(),
}))

const db = { query: vi.fn() }

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: vi.fn(async () => db),
}))

vi.mock('@/lib/requirements/auth', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/requirements/auth')>()),
  createRequestContext: state.createRequestContext,
}))

vi.mock('@/lib/dal/norm-references', () => ({
  countLinkedRequirements: state.countLinkedNormReferences,
  getLinkedRequirements: state.getLinkedRequirements,
  getNormReferenceById: state.getNormReferenceById,
  listNormReferences: state.listNormReferences,
}))

vi.mock('@/lib/requirements/norm-reference-mutations', () => ({
  archiveNormReferenceWithAudit: state.archiveNormReferenceWithAudit,
  createNormReferenceWithAudit: state.createNormReferenceWithAudit,
  deleteNormReferenceWithAudit: state.deleteNormReferenceWithAudit,
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

vi.mock('@/lib/audit/action-audit', () => ({
  recordDeniedActionAuditEvent: state.deniedAudit,
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
import { getRouteHandlerBrand } from '@/lib/http/response-policy'

describe('Issue 891 norm-reference routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.createRequestContext.mockResolvedValue(context)
    state.getLinkedRequirements.mockResolvedValue([])
    state.getNormReferenceById.mockResolvedValue({ id: 7 })
    state.updateNormReferenceWithAudit.mockResolvedValue({ id: 7 })
    state.deleteNormReferenceWithAudit.mockResolvedValue({ status: 'deleted' })
    state.archiveNormReferenceWithAudit.mockResolvedValue({ id: 7 })
    state.reactivateNormReferenceWithAudit.mockResolvedValue({ id: 7 })
    state.createNormReferenceWithAudit.mockResolvedValue({ id: 7 })
    state.listNormReferences.mockResolvedValue([{ id: 7 }, { id: 8 }])
    state.countLinkedNormReferences.mockResolvedValue({ 7: 2 })
  })

  it('keeps norm-reference mutations behind the secure route wrapper', () => {
    expect(
      [
        normPut,
        normDelete,
        normArchivePost,
        normReactivatePost,
        normCreatePost,
      ].map(getRouteHandlerBrand),
    ).toEqual(Array.from({ length: 5 }, () => 'mutation'))
  })

  it('covers detail GET and all mutation outcomes', async () => {
    const request = routeRequest()
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

  it('covers list validation, filtering, and wrapped create shaping', async () => {
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
})

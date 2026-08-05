import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { forbiddenError } from '@/lib/requirements/errors'

const mocks = vi.hoisted(() => {
  const context = {
    actor: {
      displayName: 'RFI Steward',
      hsaId: 'SE5560000001-rfi-steward',
      id: 'rfi-steward',
      isAuthenticated: true,
      roles: ['RequirementsEditor'],
      source: 'oidc',
    },
    correlationId: 'correlation-rfi-list',
    requestId: 'request-rfi-list',
    source: 'rest',
  }
  const db = { query: vi.fn() }
  return {
    assertAuthorized: vi.fn(),
    authorize: vi.fn(),
    context,
    db,
    getSpecificationById: vi.fn(),
    getSpecificationRfiList: vi.fn(),
    lockSpecificationRfiList: vi.fn(),
    recordAllowedActionAuditEvent: vi.fn(),
    unlockSpecificationRfiList: vi.fn(),
    updateSpecificationRfiAreaScope: vi.fn(),
    updateSpecificationRfiQuestionItem: vi.fn(),
  }
})

vi.mock('@/lib/audit/action-audit', () => ({
  recordAllowedActionAuditEvent: mocks.recordAllowedActionAuditEvent,
  recordDeniedActionAuditEvent: vi.fn(),
}))

vi.mock('@/lib/dal/requirements-specifications', () => ({
  getSpecificationById: mocks.getSpecificationById,
}))

vi.mock('@/lib/dal/rfi-questions', () => ({
  getSpecificationRfiList: mocks.getSpecificationRfiList,
  lockSpecificationRfiList: mocks.lockSpecificationRfiList,
  unlockSpecificationRfiList: mocks.unlockSpecificationRfiList,
  updateSpecificationRfiAreaScope: mocks.updateSpecificationRfiAreaScope,
  updateSpecificationRfiQuestionItem: mocks.updateSpecificationRfiQuestionItem,
}))

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: vi.fn(async () => mocks.db),
}))

vi.mock('@/lib/requirements/auth', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/requirements/auth')>()
  return {
    ...actual,
    createDefaultAuthorizationService: () => ({
      assertAuthorized: mocks.assertAuthorized,
    }),
    createRequestContext: vi.fn(async () => mocks.context),
  }
})

vi.mock('@/lib/requirements/server', () => ({
  createRequirementsRestRuntime: vi.fn(async () => ({
    authorization: {},
    context: mocks.context,
    db: mocks.db,
  })),
}))

vi.mock('@/lib/requirements/service-shared', () => ({
  authorize: mocks.authorize,
}))

import { PATCH as updateRfiArea } from '@/app/api/requirements-specifications/[id]/rfi-list/areas/[areaId]/route'
import { PATCH as updateRfiItem } from '@/app/api/requirements-specifications/[id]/rfi-list/items/[questionId]/route'
import { POST as lockRfiList } from '@/app/api/requirements-specifications/[id]/rfi-list/lock/route'
import { GET as getRfiList } from '@/app/api/requirements-specifications/[id]/rfi-list/route'
import { POST as unlockRfiList } from '@/app/api/requirements-specifications/[id]/rfi-list/unlock/route'

function params<T extends Record<string, string>>(values: T) {
  return { params: Promise.resolve(values) }
}

function mutationRequest(url: string, method: string, body?: unknown) {
  return new Request(url, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers:
      body === undefined ? undefined : { 'Content-Type': 'application/json' },
    method,
  })
}

describe('requirements specification RFI list routes', () => {
  const list = { areas: [], isLocked: false, questions: [] }
  const specification = {
    id: 41,
    name: 'Log handling',
    specificationCode: 'RS-0041',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.assertAuthorized.mockResolvedValue(undefined)
    mocks.authorize.mockResolvedValue(undefined)
    mocks.getSpecificationById.mockResolvedValue(specification)
    mocks.getSpecificationRfiList.mockResolvedValue(list)
    mocks.lockSpecificationRfiList.mockResolvedValue({
      ...list,
      isLocked: true,
    })
    mocks.recordAllowedActionAuditEvent.mockResolvedValue(undefined)
    mocks.unlockSpecificationRfiList.mockResolvedValue(list)
    mocks.updateSpecificationRfiAreaScope.mockResolvedValue(list)
    mocks.updateSpecificationRfiQuestionItem.mockResolvedValue(list)
  })

  it('returns the authorized RFI list with its specification identity', async () => {
    const response = await getRfiList(
      new NextRequest(
        'http://localhost/api/requirements-specifications/41/rfi-list',
      ),
      params({ id: '41' }),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ list, specification })
    expect(mocks.authorize).toHaveBeenCalledWith(
      {},
      { kind: 'get_specification_items', specificationId: 41 },
      mocks.context,
    )
    expect(mocks.getSpecificationRfiList).toHaveBeenCalledWith(mocks.db, 41)
  })

  it('rejects an invalid specification identifier before loading the runtime', async () => {
    const response = await getRfiList(
      new NextRequest(
        'http://localhost/api/requirements-specifications/0/rfi-list',
      ),
      params({ id: '0' }),
    )

    expect(response.status).toBe(400)
    expect(mocks.getSpecificationById).not.toHaveBeenCalled()
  })

  it('returns 404 when the specification is absent', async () => {
    mocks.getSpecificationById.mockResolvedValueOnce(undefined)

    const response = await getRfiList(
      new NextRequest(
        'http://localhost/api/requirements-specifications/999/rfi-list',
      ),
      params({ id: '999' }),
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: 'Specification not found',
    })
    expect(mocks.getSpecificationRfiList).not.toHaveBeenCalled()
  })

  it('returns the authorization rejection without loading RFI data', async () => {
    mocks.authorize.mockRejectedValueOnce(forbiddenError('Forbidden'))

    const response = await getRfiList(
      new NextRequest(
        'http://localhost/api/requirements-specifications/41/rfi-list',
      ),
      params({ id: '41' }),
    )

    expect(response.status).toBe(403)
    expect(mocks.getSpecificationRfiList).not.toHaveBeenCalled()
  })

  it('updates one area inclusion decision and records its safe audit fields', async () => {
    const response = await updateRfiArea(
      mutationRequest(
        'http://localhost/api/requirements-specifications/41/rfi-list/areas/7',
        'PATCH',
        { isIncluded: true },
      ),
      params({ areaId: '7', id: '41' }),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ list })
    expect(mocks.updateSpecificationRfiAreaScope).toHaveBeenCalledWith(
      mocks.db,
      41,
      7,
      true,
      {
        displayName: 'RFI Steward',
        hsaId: 'SE5560000001-rfi-steward',
      },
    )
    expect(mocks.recordAllowedActionAuditEvent).toHaveBeenCalledWith(
      mocks.db,
      mocks.context,
      expect.objectContaining({
        action: 'specification_rfi_list.area.update',
        details: { areaId: 7, changedFields: ['isIncluded'] },
        targetId: 41,
      }),
    )
  })

  it('updates one RFI question stewardship decision', async () => {
    const response = await updateRfiItem(
      mutationRequest(
        'http://localhost/api/requirements-specifications/41/rfi-list/items/23',
        'PATCH',
        { isIncluded: false, relevance: 'not_relevant' },
      ),
      params({ id: '41', questionId: '23' }),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ list })
    expect(mocks.updateSpecificationRfiQuestionItem).toHaveBeenCalledWith(
      mocks.db,
      41,
      23,
      { isIncluded: false, relevance: 'not_relevant' },
      {
        displayName: 'RFI Steward',
        hsaId: 'SE5560000001-rfi-steward',
      },
    )
  })

  it('locks the list and records the stewardship action', async () => {
    const response = await lockRfiList(
      mutationRequest(
        'http://localhost/api/requirements-specifications/41/rfi-list/lock',
        'POST',
      ),
      params({ id: '41' }),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      list: { ...list, isLocked: true },
    })
    expect(mocks.lockSpecificationRfiList).toHaveBeenCalledWith(mocks.db, 41, {
      displayName: 'RFI Steward',
      hsaId: 'SE5560000001-rfi-steward',
    })
  })

  it('unlocks the list and records the stewardship action', async () => {
    const response = await unlockRfiList(
      mutationRequest(
        'http://localhost/api/requirements-specifications/41/rfi-list/unlock',
        'POST',
      ),
      params({ id: '41' }),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ list })
    expect(mocks.unlockSpecificationRfiList).toHaveBeenCalledWith(mocks.db, 41)
  })

  it.each([
    {
      invoke: () =>
        updateRfiArea(
          mutationRequest(
            'http://localhost/api/requirements-specifications/999/rfi-list/areas/7',
            'PATCH',
            { isIncluded: true },
          ),
          params({ areaId: '7', id: '999' }),
        ),
      mutation: mocks.updateSpecificationRfiAreaScope,
      name: 'area update',
    },
    {
      invoke: () =>
        updateRfiItem(
          mutationRequest(
            'http://localhost/api/requirements-specifications/999/rfi-list/items/23',
            'PATCH',
            { relevance: 'relevant' },
          ),
          params({ id: '999', questionId: '23' }),
        ),
      mutation: mocks.updateSpecificationRfiQuestionItem,
      name: 'item update',
    },
    {
      invoke: () =>
        lockRfiList(
          mutationRequest(
            'http://localhost/api/requirements-specifications/999/rfi-list/lock',
            'POST',
          ),
          params({ id: '999' }),
        ),
      mutation: mocks.lockSpecificationRfiList,
      name: 'lock',
    },
    {
      invoke: () =>
        unlockRfiList(
          mutationRequest(
            'http://localhost/api/requirements-specifications/999/rfi-list/unlock',
            'POST',
          ),
          params({ id: '999' }),
        ),
      mutation: mocks.unlockSpecificationRfiList,
      name: 'unlock',
    },
  ])(
    'returns 404 before the $name mutation when the specification is absent',
    async ({ invoke, mutation }) => {
      mocks.getSpecificationById.mockResolvedValueOnce(undefined)

      const response = await invoke()

      expect(response.status).toBe(404)
      await expect(response.json()).resolves.toEqual({ error: 'Not found' })
      expect(mutation).not.toHaveBeenCalled()
    },
  )
})

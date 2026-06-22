import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const context = {
    actor: {
      displayName: 'Route Tester',
      hsaId: 'SE5560000001-route',
      id: 'route-test',
      isAuthenticated: true,
      roles: ['RequirementsEditor'],
      source: 'oidc',
    },
    correlationId: 'correlation-1',
    requestId: 'request-1',
    source: 'rest',
  }
  const db = { query: vi.fn() }
  const assertAuthorized = vi.fn()

  return {
    assertAuthorized,
    authorize: vi.fn(),
    context,
    db,
    deleteRfiQuestionSuggestion: vi.fn(),
    getRequestSqlServerDataSource: vi.fn(async () => db),
    listRfiQuestionSuggestions: vi.fn(),
    recordAllowedActionAuditEvent: vi.fn(),
  }
})

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: mocks.getRequestSqlServerDataSource,
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

vi.mock('@/lib/dal/rfi-questions', () => ({
  deleteRfiQuestionSuggestion: mocks.deleteRfiQuestionSuggestion,
  listRfiQuestionSuggestions: mocks.listRfiQuestionSuggestions,
}))

vi.mock('@/lib/audit/action-audit', () => ({
  recordAllowedActionAuditEvent: mocks.recordAllowedActionAuditEvent,
}))

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

import { DELETE as deleteRfiQuestionSuggestionRoute } from '@/app/api/rfi-question-suggestions/[id]/route'
import { GET as listRfiQuestionSuggestionsRoute } from '@/app/api/rfi-question-suggestions/route'

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('RFI question suggestion routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.deleteRfiQuestionSuggestion.mockResolvedValue(undefined)
    mocks.listRfiQuestionSuggestions.mockResolvedValue([])
    mocks.authorize.mockResolvedValue(undefined)
    mocks.context.actor.roles = ['RequirementsEditor']
  })

  it('deletes an RFI question suggestion through the requirements mutation policy', async () => {
    const response = await deleteRfiQuestionSuggestionRoute(
      new NextRequest('http://localhost/api/rfi-question-suggestions/77', {
        method: 'DELETE',
      }),
      makeParams('77'),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(mocks.assertAuthorized).toHaveBeenCalledWith(
      {
        kind: 'manage_rfi_question_suggestion',
        operation: 'delete',
        suggestionId: 77,
      },
      mocks.context,
    )
    expect(mocks.deleteRfiQuestionSuggestion).toHaveBeenCalledWith(mocks.db, 77)
    expect(mocks.recordAllowedActionAuditEvent).toHaveBeenCalledWith(
      mocks.db,
      mocks.context,
      {
        action: 'rfi_question_suggestion.delete',
        targetId: 77,
        targetKind: 'rfi_question_suggestion',
      },
    )
  })

  it('lists RFI question suggestions for one requirement area', async () => {
    const suggestions = [{ areaId: 5, content: 'Clarify retention.', id: 1 }]
    mocks.listRfiQuestionSuggestions.mockResolvedValue(suggestions)

    const response = await listRfiQuestionSuggestionsRoute(
      new NextRequest(
        'http://localhost/api/rfi-question-suggestions?areaId=5&specificationId=9',
      ),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ suggestions })
    expect(mocks.authorize).toHaveBeenCalledWith(
      {},
      {
        areaId: 5,
        kind: 'manage_rfi_question_suggestion',
        operation: 'list',
      },
      mocks.context,
    )
    expect(mocks.listRfiQuestionSuggestions).toHaveBeenCalledWith(mocks.db, {
      areaId: 5,
      specificationId: 9,
    })
  })

  it('lists all authorized RFI question suggestions when no area is provided', async () => {
    const suggestions = [
      { areaId: 1, content: 'Allowed suggestion.', id: 1 },
      { areaId: 2, content: 'Hidden suggestion.', id: 2 },
    ]
    mocks.listRfiQuestionSuggestions.mockResolvedValue(suggestions)
    mocks.authorize.mockImplementation(async (_authorization, action) => {
      if ((action as { areaId?: number }).areaId !== 2) return
      const error = Object.assign(new Error('Forbidden'), { status: 403 })
      throw error
    })

    const response = await listRfiQuestionSuggestionsRoute(
      new NextRequest('http://localhost/api/rfi-question-suggestions'),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      suggestions: [{ areaId: 1, content: 'Allowed suggestion.', id: 1 }],
    })
    expect(mocks.listRfiQuestionSuggestions).toHaveBeenCalledWith(mocks.db, {
      specificationId: undefined,
    })
    expect(mocks.authorize).toHaveBeenCalledTimes(2)
  })

  it('lets admins list all RFI question suggestions without per-area checks', async () => {
    mocks.context.actor.roles = ['Admin']
    const suggestions = [
      { areaId: 1, content: 'Allowed suggestion.', id: 1 },
      { areaId: 2, content: 'Admin suggestion.', id: 2 },
    ]
    mocks.listRfiQuestionSuggestions.mockResolvedValue(suggestions)

    const response = await listRfiQuestionSuggestionsRoute(
      new NextRequest('http://localhost/api/rfi-question-suggestions'),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ suggestions })
    expect(mocks.authorize).not.toHaveBeenCalled()
  })
})

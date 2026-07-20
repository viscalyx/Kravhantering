import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { conflictError } from '@/lib/requirements/errors'

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
  const db = { query: vi.fn(), transaction: vi.fn() }
  const assertAuthorized = vi.fn()

  return {
    assertAuthorized,
    authorize: vi.fn(),
    context,
    createRfiQuestionSuggestionWithAudit: vi.fn(),
    db,
    deleteRfiQuestionSuggestionWithAudit: vi.fn(),
    getRequestSqlServerDataSource: vi.fn(async () => db),
    listRfiQuestionSuggestions: vi.fn(),
    requestRfiQuestionSuggestionReviewWithAudit: vi.fn(),
    resolveRfiQuestionSuggestionWithAudit: vi.fn(),
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
  listRfiQuestionSuggestions: mocks.listRfiQuestionSuggestions,
  RFI_SUGGESTION_DISMISSED: 2,
  RFI_SUGGESTION_RESOLVED: 1,
}))

vi.mock('@/lib/requirements/rfi-question-suggestion-mutations', () => ({
  createRfiQuestionSuggestionWithAudit:
    mocks.createRfiQuestionSuggestionWithAudit,
  deleteRfiQuestionSuggestionWithAudit:
    mocks.deleteRfiQuestionSuggestionWithAudit,
  requestRfiQuestionSuggestionReviewWithAudit:
    mocks.requestRfiQuestionSuggestionReviewWithAudit,
  resolveRfiQuestionSuggestionWithAudit:
    mocks.resolveRfiQuestionSuggestionWithAudit,
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

import { POST as requestRfiQuestionSuggestionReviewRoute } from '@/app/api/rfi-question-suggestions/[id]/request-review/route'
import { POST as resolveRfiQuestionSuggestionRoute } from '@/app/api/rfi-question-suggestions/[id]/resolution/route'
import { DELETE as deleteRfiQuestionSuggestionRoute } from '@/app/api/rfi-question-suggestions/[id]/route'
import {
  POST as createRfiQuestionSuggestionRoute,
  GET as listRfiQuestionSuggestionsRoute,
} from '@/app/api/rfi-question-suggestions/route'

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('RFI question suggestion routes', () => {
  const suggestion = {
    areaId: 5,
    content: 'Clarify retention.',
    id: 77,
    rfiQuestionId: 12,
    specificationId: 9,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createRfiQuestionSuggestionWithAudit.mockResolvedValue(suggestion)
    mocks.deleteRfiQuestionSuggestionWithAudit.mockResolvedValue(undefined)
    mocks.listRfiQuestionSuggestions.mockResolvedValue([])
    mocks.requestRfiQuestionSuggestionReviewWithAudit.mockResolvedValue(
      suggestion,
    )
    mocks.resolveRfiQuestionSuggestionWithAudit.mockResolvedValue(suggestion)
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
    expect(mocks.deleteRfiQuestionSuggestionWithAudit).toHaveBeenCalledWith(
      mocks.db,
      77,
      mocks.context,
    )
  })

  it('creates a draft and audit through the atomic mutation module', async () => {
    const response = await createRfiQuestionSuggestionRoute(
      new NextRequest('http://localhost/api/rfi-question-suggestions', {
        body: JSON.stringify({
          areaId: 5,
          content: 'Clarify retention.',
          rfiQuestionId: 12,
          specificationId: 9,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      }),
    )

    expect(response.status).toBe(201)
    expect(mocks.createRfiQuestionSuggestionWithAudit).toHaveBeenCalledWith(
      mocks.db,
      {
        areaId: 5,
        content: 'Clarify retention.',
        rfiQuestionId: 12,
        specificationId: 9,
      },
      {
        displayName: 'Route Tester',
        hsaId: 'SE5560000001-route',
      },
      mocks.context,
    )
  })

  it('requests review through the atomic mutation module', async () => {
    const response = await requestRfiQuestionSuggestionReviewRoute(
      new NextRequest(
        'http://localhost/api/rfi-question-suggestions/77/request-review',
        { method: 'POST' },
      ),
      makeParams('77'),
    )

    expect(response.status).toBe(200)
    expect(
      mocks.requestRfiQuestionSuggestionReviewWithAudit,
    ).toHaveBeenCalledWith(mocks.db, 77, mocks.context)
  })

  it('resolves reviewed suggestions through the atomic mutation module', async () => {
    const response = await resolveRfiQuestionSuggestionRoute(
      new NextRequest(
        'http://localhost/api/rfi-question-suggestions/77/resolution',
        {
          body: JSON.stringify({
            resolution: 'dismissed',
            resolutionMotivation: 'Covered elsewhere.',
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        },
      ),
      makeParams('77'),
    )

    expect(response.status).toBe(200)
    expect(mocks.resolveRfiQuestionSuggestionWithAudit).toHaveBeenCalledWith(
      mocks.db,
      77,
      {
        resolution: 2,
        resolutionMotivation: 'Covered elsewhere.',
      },
      {
        displayName: 'Route Tester',
        hsaId: 'SE5560000001-route',
      },
      mocks.context,
    )
  })

  it('returns an allowlisted reason-coded lifecycle conflict', async () => {
    mocks.requestRfiQuestionSuggestionReviewWithAudit.mockRejectedValueOnce(
      conflictError('Review already requested', {
        reason: 'rfi_question_suggestion_review_already_requested',
      }),
    )

    const response = await requestRfiQuestionSuggestionReviewRoute(
      new NextRequest(
        'http://localhost/api/rfi-question-suggestions/77/request-review',
        { method: 'POST' },
      ),
      makeParams('77'),
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      code: 'conflict',
      details: {
        reason: 'rfi_question_suggestion_review_already_requested',
      },
      error: 'Review already requested',
    })
  })

  it('keeps unexpected trigger failures as sanitized server errors', async () => {
    mocks.resolveRfiQuestionSuggestionWithAudit.mockRejectedValueOnce(
      new Error('Invalid RFI question suggestion lifecycle transition'),
    )

    const response = await resolveRfiQuestionSuggestionRoute(
      new NextRequest(
        'http://localhost/api/rfi-question-suggestions/77/resolution',
        {
          body: JSON.stringify({
            resolution: 'resolved',
            resolutionMotivation: 'Handled.',
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        },
      ),
      makeParams('77'),
    )

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: 'Failed to process mutation',
    })
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

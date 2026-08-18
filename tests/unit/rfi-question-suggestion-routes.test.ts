import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { conflictError, forbiddenError } from '@/lib/requirements/errors'

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
    context,
    createRfiQuestionSuggestionWithAudit: vi.fn(),
    db,
    deleteRfiQuestionSuggestionWithAudit: vi.fn(),
    getRequestSqlServerDataSource: vi.fn(async () => db),
    listRfiQuestionSuggestionsPage: vi.fn(),
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
    service: {
      listRfiQuestionSuggestions: mocks.listRfiQuestionSuggestionsPage,
    },
  })),
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
    mocks.listRfiQuestionSuggestionsPage.mockResolvedValue({
      pagination: {
        count: 0,
        hasMore: false,
        limit: 100,
        nextCursor: null,
      },
      suggestions: [],
    })
    mocks.requestRfiQuestionSuggestionReviewWithAudit.mockResolvedValue(
      suggestion,
    )
    mocks.resolveRfiQuestionSuggestionWithAudit.mockResolvedValue(suggestion)
    mocks.context.actor.isAuthenticated = true
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
    mocks.listRfiQuestionSuggestionsPage.mockResolvedValue({
      pagination: {
        count: 1,
        hasMore: false,
        limit: 100,
        nextCursor: null,
      },
      suggestions,
    })

    const response = await listRfiQuestionSuggestionsRoute(
      new NextRequest(
        'http://localhost/api/rfi-question-suggestions?areaId=5&specificationId=9',
      ),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      pagination: {
        count: 1,
        hasMore: false,
        limit: 100,
        nextCursor: null,
      },
      suggestions,
    })
    expect(mocks.listRfiQuestionSuggestionsPage).toHaveBeenCalledWith(
      mocks.context,
      { areaId: 5, specificationId: 9 },
    )
  })

  it('accepts the maximum page size and rejects larger pages before service work', async () => {
    const maximumResponse = await listRfiQuestionSuggestionsRoute(
      new NextRequest(
        'http://localhost/api/rfi-question-suggestions?limit=200',
      ),
    )
    const overMaximumResponse = await listRfiQuestionSuggestionsRoute(
      new NextRequest(
        'http://localhost/api/rfi-question-suggestions?limit=201',
      ),
    )

    expect(maximumResponse.status).toBe(200)
    expect(overMaximumResponse.status).toBe(400)
    expect(mocks.listRfiQuestionSuggestionsPage).toHaveBeenCalledTimes(1)
    expect(mocks.listRfiQuestionSuggestionsPage).toHaveBeenCalledWith(
      mocks.context,
      { limit: 200 },
    )
  })

  it('lists all authorized RFI question suggestions when no area is provided', async () => {
    const suggestions = [{ areaId: 1, content: 'Allowed suggestion.', id: 1 }]
    const page = {
      pagination: {
        count: 1,
        hasMore: false,
        limit: 100,
        nextCursor: null,
      },
      suggestions,
    }
    mocks.listRfiQuestionSuggestionsPage.mockResolvedValue(page)

    const response = await listRfiQuestionSuggestionsRoute(
      new NextRequest('http://localhost/api/rfi-question-suggestions'),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(page)
    expect(mocks.listRfiQuestionSuggestionsPage).toHaveBeenCalledWith(
      mocks.context,
      {},
    )
  })

  it('lets admins list all RFI question suggestions without per-area checks', async () => {
    mocks.context.actor.roles = ['Admin']
    const suggestions = [
      { areaId: 1, content: 'Allowed suggestion.', id: 1 },
      { areaId: 2, content: 'Admin suggestion.', id: 2 },
    ]
    const page = {
      pagination: {
        count: 2,
        hasMore: false,
        limit: 100,
        nextCursor: null,
      },
      suggestions,
    }
    mocks.listRfiQuestionSuggestionsPage.mockResolvedValue(page)

    const response = await listRfiQuestionSuggestionsRoute(
      new NextRequest('http://localhost/api/rfi-question-suggestions'),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(page)
    expect(mocks.listRfiQuestionSuggestionsPage).toHaveBeenCalledWith(
      mocks.context,
      {},
    )
  })

  it('rejects invalid suggestion filters before reading persistence', async () => {
    const response = await listRfiQuestionSuggestionsRoute(
      new NextRequest('http://localhost/api/rfi-question-suggestions?areaId=0'),
    )

    expect(response.status).toBe(400)
    expect(mocks.listRfiQuestionSuggestionsPage).not.toHaveBeenCalled()
  })

  it('requires authentication before listing suggestions across areas', async () => {
    mocks.context.actor.isAuthenticated = false
    mocks.listRfiQuestionSuggestionsPage.mockRejectedValueOnce(
      Object.assign(new Error('Authentication required'), { status: 401 }),
    )

    const response = await listRfiQuestionSuggestionsRoute(
      new NextRequest('http://localhost/api/rfi-question-suggestions'),
    )

    expect(response.status).toBe(401)
  })

  it('returns an area authorization rejection without listing suggestions', async () => {
    mocks.listRfiQuestionSuggestionsPage.mockRejectedValueOnce(
      forbiddenError('No area access'),
    )

    const response = await listRfiQuestionSuggestionsRoute(
      new NextRequest('http://localhost/api/rfi-question-suggestions?areaId=5'),
    )

    expect(response.status).toBe(403)
  })

  it('does not suppress failures while resolving authorized areas', async () => {
    mocks.listRfiQuestionSuggestionsPage.mockRejectedValueOnce(
      new Error('area lookup unavailable'),
    )

    const response = await listRfiQuestionSuggestionsRoute(
      new NextRequest('http://localhost/api/rfi-question-suggestions'),
    )

    expect(response.status).toBe(500)
  })

  it('normalizes omitted suggestion associations to null', async () => {
    const response = await createRfiQuestionSuggestionRoute(
      new NextRequest('http://localhost/api/rfi-question-suggestions', {
        body: JSON.stringify({
          areaId: 5,
          content: 'Clarify retention.',
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
        rfiQuestionId: null,
        specificationId: null,
      },
      expect.anything(),
      mocks.context,
    )
  })

  it('maps a resolved decision to the resolved lifecycle value', async () => {
    const response = await resolveRfiQuestionSuggestionRoute(
      new NextRequest(
        'http://localhost/api/rfi-question-suggestions/77/resolution',
        {
          body: JSON.stringify({
            resolution: 'resolved',
            resolutionMotivation: 'Implemented.',
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
        resolution: 1,
        resolutionMotivation: 'Implemented.',
      },
      expect.anything(),
      mocks.context,
    )
  })
})

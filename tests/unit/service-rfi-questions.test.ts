import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestContext } from '@/lib/requirements/auth'
import { forbiddenError } from '@/lib/requirements/errors'

const mocks = vi.hoisted(() => ({
  listAreaIdsActorCanAuthor: vi.fn(),
  listRfiQuestions: vi.fn(),
  listRfiQuestionSuggestions: vi.fn(),
  recordAuthorizationDenied: vi.fn(),
}))

vi.mock('@/lib/dal/requirement-areas', () => ({
  listAreaIdsActorCanAuthor: mocks.listAreaIdsActorCanAuthor,
}))

vi.mock('@/lib/dal/rfi-questions', () => ({
  listRfiQuestions: mocks.listRfiQuestions,
  listRfiQuestionSuggestions: mocks.listRfiQuestionSuggestions,
}))

vi.mock('@/lib/requirements/security-audit', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/requirements/security-audit')>()
  return {
    ...actual,
    recordAuthorizationDenied: mocks.recordAuthorizationDenied,
  }
})

import {
  createRfiQuestionQueryService,
  MAX_RFI_QUESTION_SUGGESTION_PAGE_BYTES,
} from '@/lib/requirements/service-rfi-questions'

const db = { query: vi.fn() }
const question = { areaId: 7, id: 12, questionCode: 'INF-RFI001' }
const suggestion = {
  areaId: 7,
  createdAt: '2026-08-18T10:00:00.000Z',
  id: 12,
}
const context: RequestContext = {
  actor: {
    displayName: 'RFI Author',
    hsaId: 'SE5560000001-rfi-author',
    id: 'rfi-author',
    isAuthenticated: true,
    roles: ['RequirementsEditor'],
    source: 'oidc',
  },
  correlationId: 'correlation-1',
  requestId: 'request-1',
  source: 'rest',
}

describe('RFI question query service', () => {
  const assertAuthorized = vi.fn()
  const service = createRfiQuestionQueryService({
    authorization: { assertAuthorized },
    db: db as never,
  })

  beforeEach(() => {
    vi.clearAllMocks()
    context.actor.hsaId = 'SE5560000001-rfi-author'
    context.actor.isAuthenticated = true
    context.actor.roles = ['RequirementsEditor']
    assertAuthorized.mockResolvedValue(undefined)
    mocks.listAreaIdsActorCanAuthor.mockResolvedValue([7])
    mocks.listRfiQuestions.mockResolvedValue([question])
    mocks.listRfiQuestionSuggestions.mockResolvedValue([suggestion])
    mocks.recordAuthorizationDenied.mockResolvedValue(undefined)
  })

  it('authorizes an explicit requirement area before returning its questions', async () => {
    await expect(
      service.listRfiQuestions(context, {
        areaId: 7,
        includeArchived: true,
      }),
    ).resolves.toEqual([question])

    expect(assertAuthorized).toHaveBeenCalledWith(
      {
        areaId: 7,
        kind: 'manage_rfi_question',
        operation: 'read',
      },
      context,
    )
    expect(mocks.listRfiQuestions).toHaveBeenCalledWith(db, {
      areaId: 7,
      includeArchived: true,
    })
  })

  it('rejects a foreign requirement area before reading protected questions', async () => {
    assertAuthorized.mockRejectedValueOnce(forbiddenError('denied'))

    await expect(
      service.listRfiQuestions(context, { areaId: 8 }),
    ).rejects.toMatchObject({ code: 'forbidden' })

    expect(mocks.listRfiQuestions).not.toHaveBeenCalled()
  })

  it('returns only questions from the actor authored requirement areas', async () => {
    mocks.listAreaIdsActorCanAuthor.mockResolvedValueOnce([7, 9])

    await expect(
      service.listRfiQuestions(context, { includeArchived: true }),
    ).resolves.toEqual([question])

    expect(mocks.listAreaIdsActorCanAuthor).toHaveBeenCalledWith(
      db,
      context.actor.hsaId,
    )
    expect(mocks.listRfiQuestions).toHaveBeenCalledWith(db, {
      areaIds: [7, 9],
      includeArchived: true,
    })
  })

  it('returns no questions without an authored requirement area', async () => {
    mocks.listAreaIdsActorCanAuthor.mockResolvedValueOnce([])

    await expect(service.listRfiQuestions(context, {})).resolves.toEqual([])

    expect(mocks.listRfiQuestions).not.toHaveBeenCalled()
  })

  it('allows Admin to list questions across all requirement areas', async () => {
    context.actor.roles = ['Admin']

    await expect(
      service.listRfiQuestions(context, { includeArchived: true }),
    ).resolves.toEqual([question])

    expect(mocks.listAreaIdsActorCanAuthor).not.toHaveBeenCalled()
    expect(mocks.listRfiQuestions).toHaveBeenCalledWith(db, {
      includeArchived: true,
    })
  })

  it('bounds and scopes suggestion pages before reading protected rows', async () => {
    const suggestions = Array.from({ length: 201 }, (_, index) => ({
      ...suggestion,
      createdAt: new Date(Date.UTC(2026, 7, 18, 10, 0, -index)).toISOString(),
      id: 300 - index,
    }))
    mocks.listRfiQuestionSuggestions.mockResolvedValueOnce(suggestions)

    const result = await service.listRfiQuestionSuggestions(context, {
      limit: 200,
      specificationId: 9,
    })

    expect(result.suggestions).toHaveLength(200)
    expect(result.pagination).toMatchObject({
      count: 200,
      hasMore: true,
      limit: 200,
    })
    expect(result.pagination.nextCursor).toEqual(expect.any(String))
    expect(mocks.listRfiQuestionSuggestions).toHaveBeenCalledWith(db, {
      actorHsaId: context.actor.hsaId,
      after: undefined,
      limit: 201,
      specificationId: 9,
    })
  })

  it('authorizes an explicit suggestion area before the bounded query', async () => {
    await service.listRfiQuestionSuggestions(context, {
      areaId: 7,
      limit: 20,
    })

    expect(assertAuthorized).toHaveBeenCalledWith(
      {
        areaId: 7,
        kind: 'manage_rfi_question_suggestion',
        operation: 'list',
      },
      context,
    )
    expect(mocks.listRfiQuestionSuggestions).toHaveBeenCalledWith(db, {
      after: undefined,
      areaId: 7,
      limit: 21,
      specificationId: undefined,
    })
  })

  it('ends a page before its encoded output exceeds the byte budget', async () => {
    const longText = 'å'.repeat(10_000)
    const suggestions = Array.from({ length: 20 }, (_, index) => ({
      ...suggestion,
      areaName: longText,
      content: longText,
      createdAt: new Date(Date.UTC(2026, 7, 18, 10, 0, -index)).toISOString(),
      createdByDisplayName: longText,
      createdByHsaId: null,
      id: 300 - index,
      isReviewRequested: true,
      questionCode: null,
      resolution: 1,
      resolutionMotivation: longText,
      resolvedAt: null,
      resolvedByDisplayName: longText,
      resolvedByHsaId: null,
      reviewRequestedAt: null,
      rfiQuestionId: null,
      sourceSpecificationCode: null,
      sourceSpecificationName: longText,
      specificationId: 9,
      updatedAt: null,
    }))
    mocks.listRfiQuestionSuggestions.mockResolvedValueOnce(suggestions)

    const result = await service.listRfiQuestionSuggestions(context, {
      limit: 20,
      specificationId: 9,
    })

    expect(result.suggestions.length).toBeGreaterThan(0)
    expect(result.suggestions.length).toBeLessThan(20)
    expect(result.pagination.hasMore).toBe(true)
    expect(result.pagination.nextCursor).toEqual(expect.any(String))
    expect(
      new TextEncoder().encode(JSON.stringify(result)).byteLength,
    ).toBeLessThan(MAX_RFI_QUESTION_SUGGESTION_PAGE_BYTES)
  })

  it('rejects unauthenticated suggestion pages before database work', async () => {
    context.actor.isAuthenticated = false

    await expect(
      service.listRfiQuestionSuggestions(context, {}),
    ).rejects.toMatchObject({ code: 'unauthorized', status: 401 })
    expect(mocks.listRfiQuestionSuggestions).not.toHaveBeenCalled()
    expect(assertAuthorized).not.toHaveBeenCalled()
  })

  it('rejects unauthorized explicit suggestion areas before database work', async () => {
    assertAuthorized.mockRejectedValueOnce(forbiddenError('denied'))

    await expect(
      service.listRfiQuestionSuggestions(context, { areaId: 8 }),
    ).rejects.toMatchObject({ code: 'forbidden', status: 403 })
    expect(mocks.listRfiQuestionSuggestions).not.toHaveBeenCalled()
  })

  it('does not add an actor-area predicate for Admin suggestion pages', async () => {
    context.actor.roles = ['Admin']

    await service.listRfiQuestionSuggestions(context, {})

    expect(mocks.listRfiQuestionSuggestions).toHaveBeenCalledWith(db, {
      after: undefined,
      limit: 101,
      specificationId: undefined,
    })
  })

  it('returns an empty bounded page when the actor has no HSA-id', async () => {
    context.actor.hsaId = null

    await expect(
      service.listRfiQuestionSuggestions(context, {}),
    ).resolves.toEqual({
      pagination: {
        count: 0,
        hasMore: false,
        limit: 100,
        nextCursor: null,
      },
      suggestions: [],
    })
    expect(mocks.listRfiQuestionSuggestions).not.toHaveBeenCalled()
  })

  it('rejects malformed suggestion cursors before database work', async () => {
    await expect(
      service.listRfiQuestionSuggestions(context, { cursor: 'not-a-cursor' }),
    ).rejects.toMatchObject({ code: 'invalid_cursor', status: 400 })

    expect(mocks.listRfiQuestionSuggestions).not.toHaveBeenCalled()
  })

  it('continues suggestion pages from an opaque scoped cursor', async () => {
    const firstRows = Array.from({ length: 101 }, (_, index) => ({
      ...suggestion,
      createdAt: new Date(Date.UTC(2026, 7, 18, 10, 0, -index)).toISOString(),
      id: 300 - index,
    }))
    mocks.listRfiQuestionSuggestions.mockResolvedValueOnce(firstRows)
    const firstPage = await service.listRfiQuestionSuggestions(context, {})

    mocks.listRfiQuestionSuggestions.mockResolvedValueOnce([])
    await service.listRfiQuestionSuggestions(context, {
      cursor: firstPage.pagination.nextCursor ?? undefined,
    })

    expect(mocks.listRfiQuestionSuggestions).toHaveBeenLastCalledWith(db, {
      actorHsaId: context.actor.hsaId,
      after: {
        createdAt: firstRows[99]?.createdAt,
        id: firstRows[99]?.id,
      },
      limit: 101,
      specificationId: undefined,
    })
  })
})

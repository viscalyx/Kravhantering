import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestContext } from '@/lib/requirements/auth'
import { forbiddenError } from '@/lib/requirements/errors'

const mocks = vi.hoisted(() => ({
  listAreaIdsActorCanAuthor: vi.fn(),
  listRfiQuestions: vi.fn(),
  recordAuthorizationDenied: vi.fn(),
}))

vi.mock('@/lib/dal/requirement-areas', () => ({
  listAreaIdsActorCanAuthor: mocks.listAreaIdsActorCanAuthor,
}))

vi.mock('@/lib/dal/rfi-questions', () => ({
  listRfiQuestions: mocks.listRfiQuestions,
}))

vi.mock('@/lib/requirements/security-audit', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/requirements/security-audit')>()
  return {
    ...actual,
    recordAuthorizationDenied: mocks.recordAuthorizationDenied,
  }
})

import { createRfiQuestionQueryService } from '@/lib/requirements/service-rfi-questions'

const db = { query: vi.fn() }
const question = { areaId: 7, id: 12, questionCode: 'INF-RFI001' }
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
    context.actor.roles = ['RequirementsEditor']
    assertAuthorized.mockResolvedValue(undefined)
    mocks.listAreaIdsActorCanAuthor.mockResolvedValue([7])
    mocks.listRfiQuestions.mockResolvedValue([question])
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
})

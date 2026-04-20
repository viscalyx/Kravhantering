import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  countSuggestionsForRequirements,
  createSuggestion,
  listSuggestionsForRequirement,
  recordResolution,
  requestReview,
} from '@/lib/dal/improvement-suggestions'
import { RequirementsServiceError } from '@/lib/requirements/errors'

function createSqlServerDb() {
  const query = vi.fn<
    (sql: string, parameters?: unknown[]) => Promise<unknown[]>
  >()
  const db = {
    query,
  } as Parameters<typeof listSuggestionsForRequirement>[0]

  return { db, query }
}

describe('improvement suggestions DAL (SQL Server path)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lists suggestions and normalizes SQL Server row values', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValue([
      {
        id: 7,
        requirementId: 3,
        requirementVersionId: 11,
        content: 'Needs work',
        isReviewRequested: true,
        resolution: null,
        resolutionMotivation: null,
        resolvedBy: null,
        resolvedAt: null,
        createdBy: 'reviewer',
        createdAt: new Date('2026-04-20T10:00:00.000Z'),
        updatedAt: new Date('2026-04-20T12:00:00.000Z'),
        reviewRequestedAt: new Date('2026-04-20T11:00:00.000Z'),
        requirementUniqueId: 'REQ-001',
        requirementDescription: 'Example requirement',
      },
    ])

    const result = await listSuggestionsForRequirement(db, 3)

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('FROM improvement_suggestions suggestion'),
      [3],
    )
    expect(result).toEqual([
      {
        id: 7,
        requirementId: 3,
        requirementVersionId: 11,
        content: 'Needs work',
        isReviewRequested: 1,
        resolution: null,
        resolutionMotivation: null,
        resolvedBy: null,
        resolvedAt: null,
        createdBy: 'reviewer',
        createdAt: '2026-04-20T10:00:00.000Z',
        updatedAt: '2026-04-20T12:00:00.000Z',
        reviewRequestedAt: '2026-04-20T11:00:00.000Z',
        requirementUniqueId: 'REQ-001',
        requirementDescription: 'Example requirement',
      },
    ])
  })

  it('creates a suggestion after validating requirement and version existence', async () => {
    const { db, query } = createSqlServerDb()
    query
      .mockResolvedValueOnce([{ id: 1 }])
      .mockResolvedValueOnce([{ id: 9 }])
      .mockResolvedValueOnce([{ id: 42 }])

    const result = await createSuggestion(db, {
      requirementId: 1,
      requirementVersionId: 9,
      content: '  Improve this  ',
      createdBy: 'tester',
    })

    expect(result).toEqual({ id: 42 })
    expect(query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('INSERT INTO improvement_suggestions'),
      [
        1,
        9,
        'Improve this',
        'tester',
        expect.any(Date),
        0,
      ],
    )
  })

  it('throws not_found when the requirement does not exist', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([])

    await expect(
      createSuggestion(db, {
        requirementId: 999,
        content: 'Valid content',
      }),
    ).rejects.toThrow(RequirementsServiceError)
  })

  it('records a resolution for a reviewed suggestion', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([
      {
        id: 5,
        isReviewRequested: 1,
        resolution: null,
      },
    ])
    query.mockResolvedValueOnce([])

    await recordResolution(db, 5, {
      resolution: 1,
      resolutionMotivation: '  Applied fix  ',
      resolvedBy: '  alice  ',
    })

    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('UPDATE improvement_suggestions'),
      [1, 'Applied fix', 'alice', expect.any(Date), 5],
    )
  })

  it('requests review for a draft suggestion', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([
      {
        id: 8,
        isReviewRequested: 0,
        resolution: null,
      },
    ])
    query.mockResolvedValueOnce([])

    await requestReview(db, 8)

    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('is_review_requested = 1'),
      [expect.any(Date), 8],
    )
  })

  it('counts suggestions across multiple requirements', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValue([
      {
        requirementId: 1,
        total: 3,
        pending: 2,
      },
      {
        requirementId: 4,
        total: 1,
        pending: 0,
      },
    ])

    const result = await countSuggestionsForRequirements(db, [1, 4])

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE requirement_id IN (@0, @1)'),
      [1, 4],
    )
    expect(result).toEqual(
      new Map([
        [1, { total: 3, pending: 2 }],
        [4, { total: 1, pending: 0 }],
      ]),
    )
  })
})

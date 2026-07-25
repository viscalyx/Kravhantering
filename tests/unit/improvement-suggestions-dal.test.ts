import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  countSuggestionsForRequirements,
  createSuggestion,
  deleteSuggestion,
  listSuggestionsForRequirement,
  recordResolution,
  requestReview,
  revertToDraft,
  updateSuggestion,
} from '@/lib/dal/improvement-suggestions'
import { RequirementsServiceError } from '@/lib/requirements/errors'

function createSqlServerDb() {
  const query =
    vi.fn<(sql: string, parameters?: unknown[]) => Promise<unknown[]>>()
  const getRepository = vi.fn()
  const db = {
    getRepository,
    query,
  } as unknown as Parameters<typeof listSuggestionsForRequirement>[0]

  return { db, getRepository, query }
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
        resolvedByHsaId: null,
        resolvedAt: null,
        createdBy: 'reviewer',
        createdByHsaId: 'SE5560000001-reviewer1',
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
        resolvedByHsaId: null,
        resolvedAt: null,
        createdBy: 'reviewer',
        createdByHsaId: 'SE5560000001-reviewer1',
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
      createdByHsaId: '  SE5560000001-tester1  ',
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
        'SE5560000001-tester1',
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
      { id: 5, requirementId: 2, requirementVersionId: 9 },
    ])

    await expect(
      recordResolution(db, 5, {
        resolution: 1,
        resolutionMotivation: '  Applied fix  ',
        resolvedBy: '  alice  ',
        resolvedByHsaId: '  SE5560000001-alice1  ',
      }),
    ).resolves.toEqual({
      id: 5,
      requirementId: 2,
      requirementVersionId: 9,
    })

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('resolved_at = SYSUTCDATETIME()'),
      [5, 1, 'Applied fix', 'alice', 'SE5560000001-alice1'],
    )
    expect(query.mock.calls[0]?.[0]).toContain('AND is_review_requested = 1')
    expect(query.mock.calls[0]?.[0]).toContain('OUTPUT\n        INSERTED.id')
  })

  it('classifies a lost resolution race with a locked read and stable reason', async () => {
    const { db, query } = createSqlServerDb()
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ isReviewRequested: 1, resolution: 2 }])

    await expect(
      recordResolution(db, 5, {
        resolution: 1,
        resolutionMotivation: 'Applied fix',
        resolvedBy: 'alice',
        resolvedByHsaId: 'SE5560000001-alice1',
      }),
    ).rejects.toMatchObject({
      code: 'conflict',
      details: {
        reason: 'improvement_suggestion_already_resolved',
        suggestionId: 5,
      },
    })

    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('WITH (UPDLOCK, HOLDLOCK)'),
      [5],
    )
  })

  it('requires review before resolution with a stable reason', async () => {
    const { db, query } = createSqlServerDb()
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ isReviewRequested: 0, resolution: null }])

    await expect(
      recordResolution(db, 5, {
        resolution: 1,
        resolutionMotivation: 'Applied fix',
        resolvedBy: 'alice',
        resolvedByHsaId: 'SE5560000001-alice1',
      }),
    ).rejects.toMatchObject({
      code: 'conflict',
      details: { reason: 'improvement_suggestion_review_required' },
    })
  })

  it('preserves not_found after a zero-row conditional write', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([])

    await expect(requestReview(db, 404)).rejects.toMatchObject({
      code: 'not_found',
      status: 404,
    })
  })

  it('updates only a coherent draft and returns its mutation target', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([
      { id: 5, requirementId: 2, requirementVersionId: null },
    ])

    await expect(
      updateSuggestion(db, 5, { content: '  Revised  ' }),
    ).resolves.toEqual({
      id: 5,
      requirementId: 2,
      requirementVersionId: null,
    })

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('AND review_requested_at IS NULL'),
      [5, 'Revised'],
    )
  })

  it('rejects stale edit and delete writes after review with stable reasons', async () => {
    const { db, query } = createSqlServerDb()
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ isReviewRequested: 1, resolution: null }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ isReviewRequested: 1, resolution: null }])

    await expect(
      updateSuggestion(db, 5, { content: 'Stale edit' }),
    ).rejects.toMatchObject({
      code: 'conflict',
      details: { reason: 'improvement_suggestion_not_draft' },
    })
    await expect(deleteSuggestion(db, 5)).rejects.toMatchObject({
      code: 'conflict',
      details: { reason: 'improvement_suggestion_not_draft' },
    })
  })

  it('deletes only a coherent draft with OUTPUT evidence', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([
      { id: 5, requirementId: 2, requirementVersionId: 9 },
    ])

    await expect(deleteSuggestion(db, 5)).resolves.toEqual({
      id: 5,
      requirementId: 2,
      requirementVersionId: 9,
    })
    expect(query.mock.calls[0]?.[0]).toContain('OUTPUT\n        DELETED.id')
    expect(query.mock.calls[0]?.[0]).toContain(
      'AND resolution_motivation IS NULL',
    )
  })

  it('reverts only an unresolved reviewed suggestion and classifies stale revert', async () => {
    const { db, query } = createSqlServerDb()
    query
      .mockResolvedValueOnce([
        { id: 5, requirementId: 2, requirementVersionId: 9 },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ isReviewRequested: 1, resolution: 1 }])

    await expect(revertToDraft(db, 5)).resolves.toEqual({
      id: 5,
      requirementId: 2,
      requirementVersionId: 9,
    })
    await expect(revertToDraft(db, 5)).rejects.toMatchObject({
      code: 'conflict',
      details: { reason: 'improvement_suggestion_already_resolved' },
    })
  })

  it('classifies repeated review requests without overwriting the first timestamp', async () => {
    const { db, query } = createSqlServerDb()
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ isReviewRequested: 1, resolution: null }])

    await expect(requestReview(db, 8)).rejects.toMatchObject({
      code: 'conflict',
      details: {
        reason: 'improvement_suggestion_review_already_requested',
      },
    })
    expect(query.mock.calls[0]?.[0]).toContain(
      'review_requested_at = SYSUTCDATETIME()',
    )
    expect(query.mock.calls[0]?.[0]).toContain(
      'AND review_requested_at IS NULL',
    )
  })

  it('returns mutation evidence for a successful first review request', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([
      { id: 8, requirementId: 3, requirementVersionId: null },
    ])

    await expect(requestReview(db, 8)).resolves.toEqual({
      id: 8,
      requirementId: 3,
      requirementVersionId: null,
    })
  })

  it('classifies resolved review requests and draft reverts deterministically', async () => {
    const { db, query } = createSqlServerDb()
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ isReviewRequested: 1, resolution: 1 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ isReviewRequested: 0, resolution: null }])

    await expect(requestReview(db, 8)).rejects.toMatchObject({
      details: { reason: 'improvement_suggestion_already_resolved' },
    })
    await expect(revertToDraft(db, 8)).rejects.toMatchObject({
      details: { reason: 'improvement_suggestion_already_draft' },
    })
  })

  it.each([
    {
      data: {
        resolution: 3,
        resolutionMotivation: 'Applied fix',
        resolvedBy: 'alice',
        resolvedByHsaId: 'SE5560000001-alice1',
      },
      message: 'Resolution must be 1 (resolved) or 2 (dismissed)',
    },
    {
      data: {
        resolution: 1,
        resolutionMotivation: '   ',
        resolvedBy: 'alice',
        resolvedByHsaId: 'SE5560000001-alice1',
      },
      message: 'Resolution motivation is required',
    },
    {
      data: {
        resolution: 1,
        resolutionMotivation: 'Applied fix',
        resolvedBy: '   ',
        resolvedByHsaId: 'SE5560000001-alice1',
      },
      message: 'Resolved by is required',
    },
  ])('validates resolution evidence before SQL: $message', async testCase => {
    const { db, query } = createSqlServerDb()

    await expect(recordResolution(db, 5, testCase.data)).rejects.toMatchObject({
      code: 'validation',
      message: testCase.message,
    })
    expect(query).not.toHaveBeenCalled()
  })

  it('rejects blank resolver HSA-id values before recording a resolution', async () => {
    const { db, query } = createSqlServerDb()

    await expect(
      recordResolution(db, 5, {
        resolution: 1,
        resolutionMotivation: 'Applied fix',
        resolvedBy: 'alice',
        resolvedByHsaId: '   ',
      }),
    ).rejects.toMatchObject({
      code: 'validation',
      message: 'Resolved by HSA-id is required',
    })
    expect(query).not.toHaveBeenCalled()
  })

  it('normalizes blank creator HSA-id values to null when creating suggestions', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([{ id: 1 }]).mockResolvedValueOnce([{ id: 42 }])

    await createSuggestion(db, {
      requirementId: 1,
      content: 'Improve this',
      createdBy: 'tester',
      createdByHsaId: '   ',
    })

    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO improvement_suggestions'),
      [1, null, 'Improve this', 'tester', null, expect.any(Date), 0],
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

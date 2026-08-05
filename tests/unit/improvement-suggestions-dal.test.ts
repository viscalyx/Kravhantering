import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  countSuggestionsByRequirement,
  countSuggestionsForRequirements,
  createSuggestion,
  deleteSuggestion,
  getSuggestion,
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

  it('creates a suggestion with the database UTC clock after validating references', async () => {
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
      expect.stringContaining(
        'VALUES (@0, @1, @2, @3, @4, SYSUTCDATETIME(), 0)',
      ),
      [1, 9, 'Improve this', 'tester', 'SE5560000001-tester1'],
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

  it('records dismissal as the second supported reviewed outcome', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([
      { id: 6, requirementId: 2, requirementVersionId: null },
    ])

    await expect(
      recordResolution(db, 6, {
        resolution: 2,
        resolutionMotivation: 'Not applicable',
        resolvedBy: 'reviewer',
        resolvedByHsaId: 'SE5560000001-reviewer1',
      }),
    ).resolves.toEqual({
      id: 6,
      requirementId: 2,
      requirementVersionId: null,
    })
    expect(query.mock.calls[0]?.[1]).toEqual([
      6,
      2,
      'Not applicable',
      'reviewer',
      'SE5560000001-reviewer1',
    ])
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
      [1, null, 'Improve this', 'tester', null],
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

  it('normalizes nullable, string, and malformed suggestion row values', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([
      {
        id: '7',
        requirementId: '3',
        requirementVersionId: 'bad',
        content: null,
        isReviewRequested: 'bad',
        resolution: 'bad',
        resolutionMotivation: 123,
        resolvedBy: 456,
        resolvedByHsaId: 789,
        resolvedAt: '2026-05-01T10:00:00.000Z',
        createdBy: null,
        createdByHsaId: null,
        createdAt: null,
        updatedAt: null,
        reviewRequestedAt: null,
        requirementUniqueId: null,
        requirementDescription: null,
      },
    ])

    await expect(listSuggestionsForRequirement(db, 3)).resolves.toEqual([
      {
        id: 7,
        requirementId: 3,
        requirementVersionId: null,
        content: '',
        isReviewRequested: 0,
        resolution: null,
        resolutionMotivation: '123',
        resolvedBy: '456',
        resolvedByHsaId: '789',
        resolvedAt: '2026-05-01T10:00:00.000Z',
        createdBy: null,
        createdByHsaId: null,
        createdAt: '1970-01-01T00:00:00.000Z',
        updatedAt: null,
        reviewRequestedAt: null,
        requirementUniqueId: null,
        requirementDescription: null,
      },
    ])
  })

  it('gets a suggestion and reports a missing suggestion', async () => {
    const found = createSqlServerDb()
    found.query.mockResolvedValueOnce([
      {
        id: 8,
        requirementId: 3,
        content: 'Suggestion',
        createdAt: '2026-05-01T10:00:00.000Z',
      },
    ])
    await expect(getSuggestion(found.db, 8)).resolves.toMatchObject({
      id: 8,
      content: 'Suggestion',
    })

    const missing = createSqlServerDb()
    missing.query.mockResolvedValueOnce([])
    await expect(getSuggestion(missing.db, 404)).rejects.toMatchObject({
      code: 'not_found',
      message: 'Improvement suggestion 404 not found',
    })
  })

  it('validates suggestion content and version ownership before insert', async () => {
    const blank = createSqlServerDb()
    await expect(
      createSuggestion(blank.db, { requirementId: 1, content: '   ' }),
    ).rejects.toMatchObject({
      code: 'validation',
      message: 'Content is required',
    })
    expect(blank.query).not.toHaveBeenCalled()

    const wrongVersion = createSqlServerDb()
    wrongVersion.query
      .mockResolvedValueOnce([{ id: 1 }])
      .mockResolvedValueOnce([])
    await expect(
      createSuggestion(wrongVersion.db, {
        requirementId: 1,
        requirementVersionId: 9,
        content: 'Suggestion',
      }),
    ).rejects.toMatchObject({
      code: 'not_found',
      message: 'Requirement version 9 not found for requirement 1',
    })
  })

  it('uses nullable creation defaults and propagates SQL insert failures', async () => {
    const defaults = createSqlServerDb()
    defaults.query
      .mockResolvedValueOnce([{ id: 1 }])
      .mockResolvedValueOnce([{ id: '42' }])
    await expect(
      createSuggestion(defaults.db, {
        requirementId: 1,
        content: ' Suggestion ',
      }),
    ).resolves.toEqual({ id: 42 })
    expect(defaults.query.mock.calls[1][1]).toEqual([
      1,
      null,
      'Suggestion',
      null,
      null,
    ])

    const failed = createSqlServerDb()
    failed.query
      .mockResolvedValueOnce([{ id: 1 }])
      .mockRejectedValueOnce(new Error('SQL insert failed'))
    await expect(
      createSuggestion(failed.db, { requirementId: 1, content: 'Suggestion' }),
    ).rejects.toThrow('SQL insert failed')
  })

  it('validates edits, supports touch-only updates, and reports missing targets', async () => {
    const blank = createSqlServerDb()
    await expect(
      updateSuggestion(blank.db, 5, { content: '   ' }),
    ).rejects.toMatchObject({
      code: 'validation',
      message: 'Content is required',
    })
    expect(blank.query).not.toHaveBeenCalled()

    const touch = createSqlServerDb()
    touch.query.mockResolvedValueOnce([
      { id: 5, requirementId: 2, requirementVersionId: 'bad' },
    ])
    await expect(updateSuggestion(touch.db, 5, {})).resolves.toEqual({
      id: 5,
      requirementId: 2,
      requirementVersionId: null,
    })
    expect(touch.query.mock.calls[0][1]).toEqual([5, null])

    const missing = createSqlServerDb()
    missing.query.mockResolvedValueOnce([]).mockResolvedValueOnce([])
    await expect(updateSuggestion(missing.db, 404, {})).rejects.toMatchObject({
      code: 'not_found',
      details: { suggestionId: 404 },
    })
  })

  it('reports aggregate counts and normalizes absent or malformed database aggregates', async () => {
    const populated = createSqlServerDb()
    populated.query.mockResolvedValueOnce([
      { total: '4', pending: 'bad', resolved: '2', dismissed: null },
    ])
    await expect(
      countSuggestionsByRequirement(populated.db, 3),
    ).resolves.toEqual({
      total: 4,
      pending: 0,
      resolved: 2,
      dismissed: 0,
    })
    expect(populated.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE requirement_id = @0'),
      [3, 1, 2],
    )

    const absent = createSqlServerDb()
    absent.query.mockResolvedValueOnce([])
    await expect(countSuggestionsByRequirement(absent.db, 3)).resolves.toEqual({
      total: 0,
      pending: 0,
      resolved: 0,
      dismissed: 0,
    })
  })

  it('does not query when counting an empty requirement selection', async () => {
    const { db, query } = createSqlServerDb()
    await expect(countSuggestionsForRequirements(db, [])).resolves.toEqual(
      new Map(),
    )
    expect(query).not.toHaveBeenCalled()
  })

  it('propagates SQL read failures without replacing their cause', async () => {
    const { db, query } = createSqlServerDb()
    query.mockRejectedValueOnce(new Error('SQL read failed'))
    await expect(listSuggestionsForRequirement(db, 3)).rejects.toThrow(
      'SQL read failed',
    )
  })
})

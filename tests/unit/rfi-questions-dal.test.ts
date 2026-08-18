import { describe, expect, it, vi } from 'vitest'
import {
  createRfiQuestion,
  createRfiQuestionSuggestion,
  deleteRfiQuestionSuggestion,
  getRfiQuestion,
  getSpecificationRfiList,
  listRfiQuestionSuggestions,
  listRfiQuestions,
  lockSpecificationRfiList,
  RFI_SUGGESTION_RESOLVED,
  requestRfiQuestionSuggestionReview,
  resolveRfiQuestionSuggestion,
  type SqlExecutor,
  setRfiQuestionArchived,
  unlockSpecificationRfiList,
  updateRfiQuestion,
  updateSpecificationRfiAreaScope,
  updateSpecificationRfiQuestionItem,
} from '@/lib/dal/rfi-questions'

type QueryFn = ReturnType<typeof vi.fn> & SqlExecutor['query']
type MockManager = { query: QueryFn }

function createQuery(responses: unknown[][]): QueryFn {
  const query = vi
    .fn<(sql: string, parameters?: unknown[]) => Promise<unknown[]>>()
    .mockResolvedValue([]) as QueryFn
  for (const response of responses) query.mockResolvedValueOnce(response)
  return query
}

function createTransactionalDb({
  managerResponses,
  queryResponses,
}: {
  managerResponses: unknown[][]
  queryResponses: unknown[][]
}) {
  const query = createQuery(queryResponses)
  const managerQuery = createQuery(managerResponses)
  const manager: MockManager = { query: managerQuery }
  const transaction = vi.fn(
    async (
      isolationOrCallback:
        | string
        | ((manager: MockManager) => Promise<unknown> | unknown),
      maybeCallback?: (manager: MockManager) => Promise<unknown> | unknown,
    ) => {
      const callback =
        typeof isolationOrCallback === 'function'
          ? isolationOrCallback
          : maybeCallback
      if (!callback) throw new Error('Missing transaction callback')
      return callback(manager)
    },
  )
  return { db: { query, transaction }, managerQuery, query, transaction }
}

const actor = {
  displayName: 'RFI Tester',
  hsaId: 'SE5560000001-rfi-test',
}

const activeQuestionRow = {
  archivedAt: null,
  areaId: 2,
  areaName: 'Informationssäkerhet',
  areaPrefix: 'INF',
  createdAt: new Date('2026-06-20T08:00:00.000Z'),
  expectedAnswerFormat: 'Fritext',
  helpText: 'Beskriv lösningen.',
  id: 12,
  isArchived: 0,
  questionCode: 'INF-RFI007',
  questionText: 'Hur stödjer lösningen spårbarhet?',
  sortOrder: 30,
  updatedAt: new Date('2026-06-20T08:30:00.000Z'),
  versionId: 34,
  versionNumber: 1,
}

describe('RFI questions DAL', () => {
  it('maps and deduplicates discriminated version links in one fixed-shape query', async () => {
    const query = createQuery([
      [
        activeQuestionRow,
        {
          ...activeQuestionRow,
          id: 13,
          questionCode: 'INF-RFI008',
          questionText: 'Hur hanteras loggning?',
          sortOrder: 40,
          versionId: 35,
        },
      ],
      [
        { id: 5, relationKind: 'package', versionId: 34 },
        { id: 9, relationKind: 'package', versionId: 34 },
        { id: 2, relationKind: 'requirement', versionId: 34 },
        { id: 7, relationKind: 'requirement', versionId: 34 },
        { id: 7, relationKind: 'requirement', versionId: 34 },
        { id: 3, relationKind: 'selection_question', versionId: 34 },
        { id: 8, relationKind: 'selection_question', versionId: 34 },
        { id: 4, relationKind: 'package', versionId: 35 },
        { id: 6, relationKind: 'requirement', versionId: 35 },
        { id: 10, relationKind: 'requirement', versionId: 35 },
        { id: 1, relationKind: 'selection_question', versionId: 35 },
        { id: 11, relationKind: 'selection_question', versionId: 35 },
        { id: 11, relationKind: 'selection_question', versionId: 35 },
      ],
    ])

    const result = await listRfiQuestions(
      { query } as unknown as Parameters<typeof listRfiQuestions>[0],
      { areaId: 2, includeArchived: true },
    )

    expect(result.map(question => question.id)).toEqual([12, 13])
    expect(
      result.map(
        ({
          requirementIds,
          requirementPackageIds,
          requirementSelectionQuestionIds,
        }) => ({
          requirementIds,
          requirementPackageIds,
          requirementSelectionQuestionIds,
        }),
      ),
    ).toEqual([
      {
        requirementIds: [2, 7],
        requirementPackageIds: [5, 9],
        requirementSelectionQuestionIds: [3, 8],
      },
      {
        requirementIds: [6, 10],
        requirementPackageIds: [4],
        requirementSelectionQuestionIds: [1, 11],
      },
    ])
    expect(String(query.mock.calls[1]?.[0]).match(/UNION ALL/g)).toHaveLength(2)
    expect(query.mock.calls[0]?.[1]).toEqual([2])
    expect(query.mock.calls[1]?.[1]).toEqual([2])
  })

  it('scopes catalog queries to the authorized requirement areas', async () => {
    const query = createQuery([[activeQuestionRow], []])

    await listRfiQuestions(
      { query } as unknown as Parameters<typeof listRfiQuestions>[0],
      { areaIds: [2, 4], includeArchived: true },
    )

    expect(String(query.mock.calls[0]?.[0])).toContain(
      'question.area_id IN (@0, @1)',
    )
    expect(query.mock.calls[0]?.[1]).toEqual([2, 4])
    expect(query.mock.calls[1]?.[1]).toEqual([2, 4])
  })

  it('fails closed when the authorized requirement area set is empty', async () => {
    const query = createQuery([[]])

    await expect(
      listRfiQuestions(
        { query } as unknown as Parameters<typeof listRfiQuestions>[0],
        { areaIds: [], includeArchived: true },
      ),
    ).resolves.toEqual([])

    expect(String(query.mock.calls[0]?.[0])).toContain('WHERE 1 = 0')
  })

  it('returns an empty catalog without running the version-link query', async () => {
    const query = createQuery([[]])

    await expect(
      listRfiQuestions(
        { query } as unknown as Parameters<typeof listRfiQuestions>[0],
        { includeArchived: true },
      ),
    ).resolves.toEqual([])
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('creates an area-sequenced RFI question with version links', async () => {
    const { db, managerQuery, query, transaction } = createTransactionalDb({
      managerResponses: [
        [{ id: 2, prefix: 'INF' }],
        [],
        [{ nextSequence: 7 }],
        [],
        [{ id: 12 }],
        [{ id: 34 }],
        [],
        [],
        [],
        [],
        [],
        [],
      ],
      queryResponses: [
        [activeQuestionRow],
        [
          { id: 5, relationKind: 'package', versionId: 34 },
          { id: 7, relationKind: 'requirement', versionId: 34 },
          { id: 3, relationKind: 'selection_question', versionId: 34 },
          { id: 7, relationKind: 'requirement', versionId: 34 },
        ],
      ],
    })

    const result = await createRfiQuestion(
      db as unknown as Parameters<typeof createRfiQuestion>[0],
      {
        areaId: 2,
        expectedAnswerFormat: '  Fritext  ',
        helpText: '  Beskriv lösningen.  ',
        questionText: '  Hur stödjer lösningen spårbarhet?  ',
        requirementIds: [7],
        requirementPackageIds: [5],
        requirementSelectionQuestionIds: [3],
        sortOrder: 30,
      },
      actor,
    )

    expect(transaction).toHaveBeenCalledWith(
      'SERIALIZABLE',
      expect.any(Function),
    )
    const questionInsert = managerQuery.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO rfi_questions'),
    )
    expect(questionInsert?.[1]).toEqual(['INF-RFI007', 2, 30])
    const versionInsert = managerQuery.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO rfi_question_versions'),
    )
    expect(versionInsert?.[1]).toEqual([
      12,
      'Hur stödjer lösningen spårbarhet?',
      'Beskriv lösningen.',
      'Fritext',
      actor.hsaId,
      actor.displayName,
    ])
    expect(result).toMatchObject({
      questionCode: 'INF-RFI007',
      requirementIds: [7],
      requirementPackageIds: [5],
      requirementSelectionQuestionIds: [3],
      versionId: 34,
      versionNumber: 1,
    })
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE question.id = @0'),
      [12],
    )
  })

  it('updates sort order without creating a new RFI question version', async () => {
    const { db, managerQuery } = createTransactionalDb({
      managerResponses: [[{ id: 12 }], []],
      queryResponses: [[{ ...activeQuestionRow, sortOrder: 45 }], [], [], []],
    })

    const result = await updateRfiQuestion(
      db as unknown as Parameters<typeof updateRfiQuestion>[0],
      12,
      { sortOrder: 45 },
      actor,
    )

    expect(result?.sortOrder).toBe(45)
    expect(
      managerQuery.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO rfi_question_versions'),
      ),
    ).toBe(false)
    expect(
      managerQuery.mock.calls.some(([sql]) =>
        String(sql).includes('UPDATE rfi_questions'),
      ),
    ).toBe(true)
  })

  it('creates a new active version and carries unchanged advisory links forward', async () => {
    const { db, managerQuery } = createTransactionalDb({
      managerResponses: [
        [{ id: 12 }],
        [
          {
            expectedAnswerFormat: 'Fritext',
            helpText: 'Gammal hjälptext',
            id: 33,
            questionText: 'Gammal fråga',
            versionNumber: 2,
          },
        ],
        [{ id: 8 }],
        [{ id: 4 }],
        [{ id: 99 }],
        [],
        [{ id: 34 }],
        [],
        [],
        [],
        [],
        [],
        [],
      ],
      queryResponses: [
        [{ ...activeQuestionRow, questionText: 'Ny fråga', versionNumber: 3 }],
        [
          { id: 4, relationKind: 'package', versionId: 34 },
          { id: 99, relationKind: 'requirement', versionId: 34 },
          { id: 8, relationKind: 'selection_question', versionId: 34 },
        ],
      ],
    })

    const result = await updateRfiQuestion(
      db as unknown as Parameters<typeof updateRfiQuestion>[0],
      12,
      { questionText: '  Ny fråga  ' },
      actor,
    )

    const activeVersionUpdate = managerQuery.mock.calls.find(([sql]) =>
      String(sql).includes('SET is_active = 0'),
    )
    const versionInsert = managerQuery.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO rfi_question_versions'),
    )
    expect(activeVersionUpdate?.[1]).toEqual([12])
    expect(versionInsert?.[1]).toEqual([
      12,
      3,
      'Ny fråga',
      'Gammal hjälptext',
      'Fritext',
      actor.hsaId,
      actor.displayName,
    ])
    expect(result).toMatchObject({
      questionText: 'Ny fråga',
      requirementIds: [99],
      requirementPackageIds: [4],
      requirementSelectionQuestionIds: [8],
      versionNumber: 3,
    })
  })

  it('locks a specification RFI list with refresh rules that preserve only unchanged included relevance', async () => {
    const { db, managerQuery, transaction } = createTransactionalDb({
      managerResponses: [
        [],
        [
          { questionId: 12, versionId: 34 },
          { questionId: 13, versionId: 35 },
        ],
        [],
        [],
        [],
        [],
      ],
      queryResponses: [
        [
          {
            isLocked: 1,
            lockedAt: '2026-06-20T09:00:00.000Z',
            lockedByDisplayName: actor.displayName,
            lockedByHsaId: actor.hsaId,
            specificationId: 4,
          },
        ],
        [],
      ],
    })

    const result = await lockSpecificationRfiList(
      db as unknown as Parameters<typeof lockSpecificationRfiList>[0],
      4,
      actor,
    )

    expect(transaction).toHaveBeenCalledWith(
      'SERIALIZABLE',
      expect.any(Function),
    )
    expect(managerQuery.mock.calls[2]?.[1]).toEqual([4, 12, 13])
    const mergeSql = String(
      managerQuery.mock.calls.find(([sql]) =>
        String(sql).includes('MERGE specification_rfi_question_items'),
      )?.[0],
    )
    expect(mergeSql).toContain(
      'target.rfi_question_version_id = source.rfi_question_version_id',
    )
    expect(mergeSql).toContain('AND target.is_included = 1')
    expect(mergeSql).toContain('THEN target.relevance')
    expect(mergeSql).toContain('ELSE NULL')
    expect(result).toMatchObject({
      isLocked: true,
      lockedByHsaId: actor.hsaId,
      specificationId: 4,
    })
  })

  it('rejects relevance edits before the specification RFI list is locked', async () => {
    const { db, managerQuery } = createTransactionalDb({
      managerResponses: [
        [],
        [
          {
            isLocked: 0,
            lockedAt: null,
            lockedByDisplayName: null,
            lockedByHsaId: null,
            specificationId: 4,
          },
        ],
        [{ id: 34 }],
      ],
      queryResponses: [],
    })

    await expect(
      updateSpecificationRfiQuestionItem(
        db as unknown as Parameters<
          typeof updateSpecificationRfiQuestionItem
        >[0],
        4,
        12,
        { relevance: 'relevant' },
        actor,
      ),
    ).rejects.toMatchObject({
      code: 'validation',
      details: { reason: 'rfi_list_not_locked' },
    })
    expect(
      managerQuery.mock.calls.some(([sql]) =>
        String(sql).includes('MERGE specification_rfi_question_items'),
      ),
    ).toBe(false)
  })

  it('rejects scope edits after the specification RFI list is locked', async () => {
    const { db, managerQuery } = createTransactionalDb({
      managerResponses: [
        [],
        [
          {
            isLocked: 1,
            lockedAt: '2026-06-20T09:00:00.000Z',
            lockedByDisplayName: actor.displayName,
            lockedByHsaId: actor.hsaId,
            specificationId: 4,
          },
        ],
        [],
      ],
      queryResponses: [],
    })

    await expect(
      updateSpecificationRfiQuestionItem(
        db as unknown as Parameters<
          typeof updateSpecificationRfiQuestionItem
        >[0],
        4,
        12,
        { isIncluded: false },
        actor,
      ),
    ).rejects.toMatchObject({
      code: 'validation',
      details: { reason: 'rfi_list_locked' },
    })
    expect(
      managerQuery.mock.calls.some(([sql]) =>
        String(sql).includes('MERGE specification_rfi_question_items'),
      ),
    ).toBe(false)
  })

  it('updates all RFI question scope in an area atomically', async () => {
    const { db, managerQuery, transaction } = createTransactionalDb({
      managerResponses: [
        [],
        [
          {
            isLocked: 0,
            lockedAt: null,
            lockedByDisplayName: null,
            lockedByHsaId: null,
            specificationId: 4,
          },
        ],
        [{ id: 2 }],
        [],
      ],
      queryResponses: [
        [
          {
            isLocked: 0,
            lockedAt: null,
            lockedByDisplayName: null,
            lockedByHsaId: null,
            specificationId: 4,
          },
        ],
        [],
      ],
    })

    const result = await updateSpecificationRfiAreaScope(
      db as unknown as Parameters<typeof updateSpecificationRfiAreaScope>[0],
      4,
      2,
      false,
      actor,
    )

    expect(transaction).toHaveBeenCalledWith(expect.any(Function))
    const mergeCall = managerQuery.mock.calls.find(([sql]) =>
      String(sql).includes('MERGE specification_rfi_question_items'),
    )
    expect(String(mergeCall?.[0])).toContain('question.area_id = @1')
    expect(String(mergeCall?.[0])).toContain('question.is_archived = 0')
    expect(String(mergeCall?.[0])).toContain('is_included = @2')
    expect(mergeCall?.[1]).toEqual([4, 2, 0, actor.hsaId, actor.displayName])
    expect(result).toMatchObject({
      isLocked: false,
      items: [],
      specificationId: 4,
    })
  })

  it('rejects area scope edits after the specification RFI list is locked', async () => {
    const { db, managerQuery } = createTransactionalDb({
      managerResponses: [
        [],
        [
          {
            isLocked: 1,
            lockedAt: '2026-06-20T09:00:00.000Z',
            lockedByDisplayName: actor.displayName,
            lockedByHsaId: actor.hsaId,
            specificationId: 4,
          },
        ],
      ],
      queryResponses: [],
    })

    await expect(
      updateSpecificationRfiAreaScope(
        db as unknown as Parameters<typeof updateSpecificationRfiAreaScope>[0],
        4,
        2,
        false,
        actor,
      ),
    ).rejects.toMatchObject({
      code: 'validation',
      details: { reason: 'rfi_list_locked' },
    })
    expect(
      managerQuery.mock.calls.some(([sql]) =>
        String(sql).includes('MERGE specification_rfi_question_items'),
      ),
    ).toBe(false)
  })

  it('does not allow relevance for a question outside the locked list', async () => {
    const { db, managerQuery } = createTransactionalDb({
      managerResponses: [
        [],
        [
          {
            isLocked: 1,
            lockedAt: '2026-06-20T09:00:00.000Z',
            lockedByDisplayName: actor.displayName,
            lockedByHsaId: actor.hsaId,
            specificationId: 4,
          },
        ],
        [],
        [],
      ],
      queryResponses: [],
    })

    await expect(
      updateSpecificationRfiQuestionItem(
        db as unknown as Parameters<
          typeof updateSpecificationRfiQuestionItem
        >[0],
        4,
        12,
        { relevance: 'not_relevant' },
        actor,
      ),
    ).rejects.toMatchObject({
      code: 'validation',
      details: { reason: 'rfi_question_not_locked' },
    })
    expect(
      managerQuery.mock.calls.some(([sql]) =>
        String(sql).includes('MERGE specification_rfi_question_items'),
      ),
    ).toBe(false)
  })

  it('does not allow relevance for an excluded question in a locked list', async () => {
    const { db, managerQuery } = createTransactionalDb({
      managerResponses: [
        [],
        [
          {
            isLocked: 1,
            lockedAt: '2026-06-20T09:00:00.000Z',
            lockedByDisplayName: actor.displayName,
            lockedByHsaId: actor.hsaId,
            specificationId: 4,
          },
        ],
        [],
        [{ isIncluded: 0, versionId: 34 }],
      ],
      queryResponses: [],
    })

    await expect(
      updateSpecificationRfiQuestionItem(
        db as unknown as Parameters<
          typeof updateSpecificationRfiQuestionItem
        >[0],
        4,
        12,
        { relevance: 'not_relevant' },
        actor,
      ),
    ).rejects.toMatchObject({
      code: 'validation',
      details: { reason: 'rfi_question_excluded_from_locked_list' },
    })
    expect(
      managerQuery.mock.calls.some(([sql]) =>
        String(sql).includes('MERGE specification_rfi_question_items'),
      ),
    ).toBe(false)
  })

  it('creates RFI question suggestions with a minimal specification source snapshot', async () => {
    const query = createQuery([
      [{ id: 2 }],
      [{ areaId: 2 }],
      [{ id: 4, name: 'E-arkiv', specificationCode: 'SPEC-004' }],
      [{ id: 77 }],
      [
        {
          areaId: 2,
          areaName: 'Informationssäkerhet',
          content: 'Ny fråga om loggning',
          createdAt: new Date('2026-06-20T09:00:00.000Z'),
          createdByDisplayName: actor.displayName,
          createdByHsaId: actor.hsaId,
          id: 77,
          isReviewRequested: 0,
          questionCode: 'INF-RFI007',
          resolution: null,
          resolutionMotivation: null,
          resolvedAt: null,
          resolvedByDisplayName: null,
          resolvedByHsaId: null,
          reviewRequestedAt: null,
          rfiQuestionId: 12,
          sourceSpecificationName: 'E-arkiv',
          sourceSpecificationCode: 'SPEC-004',
          specificationId: 4,
          updatedAt: null,
        },
      ],
    ])
    const db = { query }

    const result = await createRfiQuestionSuggestion(
      db as unknown as Parameters<typeof createRfiQuestionSuggestion>[0],
      {
        areaId: 2,
        content: '  Ny fråga om loggning  ',
        rfiQuestionId: 12,
        specificationId: 4,
      },
      actor,
    )

    expect(query).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('INSERT INTO rfi_question_suggestions'),
      [
        2,
        12,
        4,
        'SPEC-004',
        'E-arkiv',
        'Ny fråga om loggning',
        actor.hsaId,
        actor.displayName,
      ],
    )
    expect(result).toMatchObject({
      content: 'Ny fråga om loggning',
      sourceSpecificationName: 'E-arkiv',
      sourceSpecificationCode: 'SPEC-004',
    })
  })

  it('reports unknown suggestion specification ids as not found', async () => {
    const query = createQuery([[{ id: 2 }], []])
    const db = { query }

    await expect(
      createRfiQuestionSuggestion(
        db as unknown as Parameters<typeof createRfiQuestionSuggestion>[0],
        {
          areaId: 2,
          content: 'Ny fråga om loggning',
          specificationId: 404,
        },
        actor,
      ),
    ).rejects.toMatchObject({
      code: 'not_found',
      details: {
        reason: 'specification_not_found',
        specificationId: 404,
      },
      status: 404,
    })
  })

  it('lists RFI question suggestions scoped to an area and specification', async () => {
    const query = createQuery([
      [
        {
          areaId: 2,
          areaName: 'Informationssäkerhet',
          content: 'Ny fråga om loggning',
          createdAt: new Date('2026-06-20T09:00:00.000Z'),
          createdByDisplayName: actor.displayName,
          createdByHsaId: actor.hsaId,
          id: 77,
          isReviewRequested: 0,
          questionCode: 'INF-RFI007',
          resolution: null,
          resolutionMotivation: null,
          resolvedAt: null,
          resolvedByDisplayName: null,
          resolvedByHsaId: null,
          reviewRequestedAt: null,
          rfiQuestionId: 12,
          sourceSpecificationName: 'E-arkiv',
          sourceSpecificationCode: 'SPEC-004',
          specificationId: 4,
          updatedAt: null,
        },
      ],
    ])
    const db = { query }

    const result = await listRfiQuestionSuggestions(
      db as unknown as Parameters<typeof listRfiQuestionSuggestions>[0],
      { areaId: 2, specificationId: 4 },
    )

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        'WHERE suggestion.area_id = @1 AND suggestion.specification_id = @2',
      ),
      [201, 2, 4],
    )
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      content: 'Ny fråga om loggning',
      specificationId: 4,
    })
  })

  it('bounds suggestion rows and scopes them to the actor in SQL', async () => {
    const query = createQuery([[]])

    await listRfiQuestionSuggestions(
      { query } as unknown as Parameters<typeof listRfiQuestionSuggestions>[0],
      {
        actorHsaId: 'SE5560000001-author',
        after: { createdAt: '2026-08-18T10:00:00.000Z', id: 77 },
        limit: 101,
        specificationId: 9,
      },
    )

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT TOP (@0)'),
      [101, 'SE5560000001-author', '2026-08-18T10:00:00.000Z', 77, 9],
    )
    const sql = String(query.mock.calls[0]?.[0])
    expect(sql).toContain('area.owner_hsa_id = @1')
    expect(sql).toContain('co_author.hsa_id = @1')
    expect(sql).toContain('suggestion.created_at < @2')
    expect(sql).toContain('suggestion.id < @3')
    expect(sql).toContain('suggestion.specification_id = @4')
    expect(sql).toContain('LEFT(area.name, 10000)')
    expect(sql).toContain('LEFT(suggestion.content, 10000)')
    expect(sql).toContain(
      'ORDER BY suggestion.created_at DESC, suggestion.id DESC',
    )
  })

  it('rejects oversized suggestion reads before querying', async () => {
    const query = createQuery([[]])

    await expect(
      listRfiQuestionSuggestions(
        { query } as unknown as Parameters<
          typeof listRfiQuestionSuggestions
        >[0],
        { limit: 202 },
      ),
    ).rejects.toMatchObject({ code: 'validation', status: 400 })
    expect(query).not.toHaveBeenCalled()
  })

  it('deletes only RFI question suggestions that have not entered review or resolution', async () => {
    const query = createQuery([
      [
        {
          areaId: 2,
          id: 77,
          rfiQuestionId: 12,
          specificationId: 4,
        },
      ],
    ])
    const db = { query }

    await expect(
      deleteRfiQuestionSuggestion(
        db as unknown as Parameters<typeof deleteRfiQuestionSuggestion>[0],
        77,
      ),
    ).resolves.toEqual({
      areaId: 2,
      id: 77,
      rfiQuestionId: 12,
      specificationId: 4,
    })

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM rfi_question_suggestions'),
      [77],
    )
    expect(String(query.mock.calls[0]?.[0])).toContain('OUTPUT')
  })

  it('rejects deletion after RFI question suggestion review has started', async () => {
    const query = createQuery([
      [],
      [
        {
          areaId: 2,
          id: 77,
          isReviewRequested: 1,
          resolution: null,
          reviewRequestedAt: new Date(),
          rfiQuestionId: 12,
          specificationId: 4,
        },
      ],
    ])
    const db = { query }

    await expect(
      deleteRfiQuestionSuggestion(
        db as unknown as Parameters<typeof deleteRfiQuestionSuggestion>[0],
        77,
      ),
    ).rejects.toMatchObject({
      code: 'conflict',
      details: { reason: 'rfi_question_suggestion_not_draft' },
    })
    expect(query).toHaveBeenCalledTimes(2)
    expect(String(query.mock.calls[1]?.[0])).toContain('UPDLOCK, HOLDLOCK')
  })

  it('distinguishes a repeated review request from a missing suggestion', async () => {
    const query = createQuery([
      [],
      [
        {
          areaId: 2,
          id: 77,
          isReviewRequested: 1,
          resolution: null,
          reviewRequestedAt: new Date(),
          rfiQuestionId: 12,
          specificationId: 4,
        },
      ],
    ])

    await expect(
      requestRfiQuestionSuggestionReview({ query }, 77),
    ).rejects.toMatchObject({
      code: 'conflict',
      details: {
        reason: 'rfi_question_suggestion_review_already_requested',
      },
    })
  })

  it('requires review before resolving and preserves reason-coded conflicts', async () => {
    const query = createQuery([
      [],
      [
        {
          areaId: 2,
          id: 77,
          isReviewRequested: 0,
          resolution: null,
          reviewRequestedAt: null,
          rfiQuestionId: 12,
          specificationId: 4,
        },
      ],
    ])

    await expect(
      resolveRfiQuestionSuggestion(
        { query },
        77,
        {
          resolution: RFI_SUGGESTION_RESOLVED,
          resolutionMotivation: 'Handled in the library.',
        },
        actor,
      ),
    ).rejects.toMatchObject({
      code: 'conflict',
      details: { reason: 'rfi_question_suggestion_review_required' },
    })
  })

  it('returns not found only when the conditional mutation diagnostic finds no row', async () => {
    const query = createQuery([[], []])

    await expect(
      deleteRfiQuestionSuggestion({ query }, 404),
    ).rejects.toMatchObject({
      code: 'not_found',
      status: 404,
    })
  })

  it('applies the active-only default and ignores links outside the selected rows', async () => {
    const query = createQuery([
      [
        {
          ...activeQuestionRow,
          archivedAt: new Date('2026-06-21T08:00:00.000Z'),
          isArchived: '1',
        },
      ],
      [
        { id: 19, relationKind: 'requirement', versionId: 999 },
        { id: 7, relationKind: 'requirement', versionId: 34 },
      ],
    ])

    const result = await listRfiQuestions({ query } as unknown as Parameters<
      typeof listRfiQuestions
    >[0])

    expect(String(query.mock.calls[0]?.[0])).toContain(
      'question.is_archived = 0',
    )
    expect(result[0]).toMatchObject({
      archivedAt: '2026-06-21T08:00:00.000Z',
      isArchived: true,
      requirementIds: [7],
    })
  })

  it('returns null when an RFI question lookup has no row', async () => {
    const query = createQuery([[]])

    await expect(
      getRfiQuestion(
        { query } as unknown as Parameters<typeof getRfiQuestion>[0],
        404,
      ),
    ).resolves.toBeNull()
  })

  it('validates question text and area before creating an RFI question', async () => {
    await expect(
      createRfiQuestion(
        { transaction: vi.fn() } as unknown as Parameters<
          typeof createRfiQuestion
        >[0],
        { areaId: 2, questionText: '   ' },
      ),
    ).rejects.toMatchObject({ code: 'validation' })

    const { db } = createTransactionalDb({
      managerResponses: [[]],
      queryResponses: [],
    })
    await expect(
      createRfiQuestion(
        db as unknown as Parameters<typeof createRfiQuestion>[0],
        { areaId: 404, questionText: 'Question?' },
      ),
    ).rejects.toMatchObject({
      code: 'validation',
      details: { areaId: 404, reason: 'area_not_found' },
    })
  })

  it('rejects invalid advisory link ids during question creation', async () => {
    const { db } = createTransactionalDb({
      managerResponses: [
        [{ id: 2, prefix: 'INF' }],
        [],
        [],
        [],
        [{ id: 12 }],
        [{ id: 34 }],
      ],
      queryResponses: [],
    })

    await expect(
      createRfiQuestion(
        db as unknown as Parameters<typeof createRfiQuestion>[0],
        {
          areaId: 2,
          questionText: 'Question?',
          requirementIds: [0],
        },
      ),
    ).rejects.toMatchObject({
      code: 'validation',
      details: { reason: 'invalid_id' },
    })
  })

  it('reports a created question that cannot be reloaded', async () => {
    const { db } = createTransactionalDb({
      managerResponses: [
        [{ id: 2, prefix: 'INF' }],
        [],
        [{ nextSequence: 1 }],
        [],
        [{ id: 12 }],
        [{ id: 34 }],
        [],
        [],
        [],
      ],
      queryResponses: [[]],
    })

    await expect(
      createRfiQuestion(
        db as unknown as Parameters<typeof createRfiQuestion>[0],
        { areaId: 2, questionText: 'Question?' },
      ),
    ).rejects.toMatchObject({ code: 'validation' })
  })

  it('returns null for a missing update target and rejects invalid version changes', async () => {
    const missing = createTransactionalDb({
      managerResponses: [[]],
      queryResponses: [],
    })
    await expect(
      updateRfiQuestion(
        missing.db as unknown as Parameters<typeof updateRfiQuestion>[0],
        404,
        { sortOrder: 1 },
      ),
    ).resolves.toBeNull()

    const missingVersion = createTransactionalDb({
      managerResponses: [[{ id: 12 }], []],
      queryResponses: [],
    })
    await expect(
      updateRfiQuestion(
        missingVersion.db as unknown as Parameters<typeof updateRfiQuestion>[0],
        12,
        { helpText: 'New help' },
      ),
    ).rejects.toMatchObject({
      details: { reason: 'missing_active_rfi_question_version' },
    })

    const blankText = createTransactionalDb({
      managerResponses: [
        [{ id: 12 }],
        [
          {
            expectedAnswerFormat: null,
            helpText: null,
            id: 34,
            questionText: 'Current',
            versionNumber: 1,
          },
        ],
      ],
      queryResponses: [],
    })
    await expect(
      updateRfiQuestion(
        blankText.db as unknown as Parameters<typeof updateRfiQuestion>[0],
        12,
        { questionText: '   ' },
      ),
    ).rejects.toMatchObject({ code: 'validation' })
  })

  it('archives, reactivates, and returns null for missing RFI questions', async () => {
    const query = createQuery([
      [{ id: 12 }],
      [{ ...activeQuestionRow, isArchived: 1 }],
      [],
      [{ id: 12 }],
      [{ ...activeQuestionRow, isArchived: 0 }],
      [],
      [],
    ])
    const db = { query } as unknown as Parameters<
      typeof setRfiQuestionArchived
    >[0]

    await expect(setRfiQuestionArchived(db, 12, true)).resolves.toMatchObject({
      isArchived: true,
    })
    await expect(setRfiQuestionArchived(db, 12, false)).resolves.toMatchObject({
      isArchived: false,
    })
    await expect(setRfiQuestionArchived(db, 404, true)).resolves.toBeNull()
  })

  it('maps locked RFI list items and their advisory links', async () => {
    const item = {
      areaId: 2,
      areaName: 'Informationssäkerhet',
      areaPrefix: 'INF',
      expectedAnswerFormat: 'Fritext',
      helpText: null,
      isIncluded: '1',
      isVersionStale: 0,
      questionCode: 'INF-RFI007',
      questionId: 12,
      questionText: 'Hur stödjer lösningen spårbarhet?',
      relevance: 'relevant',
      sortOrder: 30,
      versionId: 34,
      versionNumber: 1,
    }
    const query = createQuery([
      [
        {
          isLocked: 1,
          lockedAt: new Date('2026-06-21T08:00:00.000Z'),
          lockedByDisplayName: actor.displayName,
          lockedByHsaId: actor.hsaId,
          specificationId: 4,
        },
      ],
      [item],
      [{ id: 5, relationKind: 'package', versionId: 34 }],
    ])

    const result = await getSpecificationRfiList(
      { query } as unknown as Parameters<typeof getSpecificationRfiList>[0],
      4,
    )

    expect(result).toMatchObject({
      isLocked: true,
      items: [
        {
          isIncluded: true,
          isVersionStale: false,
          requirementPackageIds: [5],
        },
      ],
      lockedAt: '2026-06-21T08:00:00.000Z',
    })
  })

  it('bounds RFI list rows before link hydration', async () => {
    const item = {
      areaId: 2,
      areaName: 'Security',
      areaPrefix: 'SEC',
      expectedAnswerFormat: 'Text',
      helpText: null,
      isIncluded: 1,
      isVersionStale: 0,
      questionCode: 'SEC-RFI001',
      questionId: 12,
      questionText: 'Question',
      relevance: null,
      sortOrder: 1,
      versionId: 34,
      versionNumber: 1,
    }
    const header = {
      isLocked: 1,
      lockedAt: null,
      lockedByDisplayName: null,
      lockedByHsaId: null,
      specificationId: 4,
    }
    const exactQuery = createQuery([[header], [item], []])
    const createItemLimitError = (limit: number) =>
      Object.assign(new Error('limit'), { limit })

    await expect(
      getSpecificationRfiList(
        { query: exactQuery } as unknown as Parameters<
          typeof getSpecificationRfiList
        >[0],
        4,
        { createItemLimitError, maxItems: 1 },
      ),
    ).resolves.toMatchObject({ items: [{ questionId: 12 }] })
    expect(exactQuery.mock.calls[1][0]).toContain('TOP (@1)')
    expect(exactQuery.mock.calls[1][1]).toEqual([4, 2])

    const excessQuery = createQuery([
      [header],
      [item, { ...item, questionId: 13, versionId: 35 }],
    ])
    await expect(
      getSpecificationRfiList(
        { query: excessQuery } as unknown as Parameters<
          typeof getSpecificationRfiList
        >[0],
        4,
        { createItemLimitError, maxItems: 1 },
      ),
    ).rejects.toMatchObject({ limit: 1 })
    expect(excessQuery).toHaveBeenCalledTimes(2)
  })

  it('locks an empty catalog and unlocks an existing RFI list', async () => {
    const emptyLock = createTransactionalDb({
      managerResponses: [[], [], [], []],
      queryResponses: [
        [
          {
            isLocked: 1,
            lockedAt: null,
            lockedByDisplayName: actor.displayName,
            lockedByHsaId: actor.hsaId,
            specificationId: 4,
          },
        ],
        [],
      ],
    })
    await expect(
      lockSpecificationRfiList(
        emptyLock.db as unknown as Parameters<
          typeof lockSpecificationRfiList
        >[0],
        4,
        actor,
      ),
    ).resolves.toMatchObject({ isLocked: true, items: [] })
    expect(String(emptyLock.managerQuery.mock.calls[2]?.[0])).toContain(
      'DELETE FROM specification_rfi_question_items WHERE',
    )

    const unlocked = createTransactionalDb({
      managerResponses: [[], []],
      queryResponses: [[], []],
    })
    await expect(
      unlockSpecificationRfiList(
        unlocked.db as unknown as Parameters<
          typeof unlockSpecificationRfiList
        >[0],
        4,
      ),
    ).resolves.toMatchObject({ isLocked: false, items: [] })
  })

  it('persists unlocked inclusion and locked relevance decisions', async () => {
    const unlocked = createTransactionalDb({
      managerResponses: [
        [],
        [
          {
            isLocked: 0,
            lockedAt: null,
            lockedByDisplayName: null,
            lockedByHsaId: null,
            specificationId: 4,
          },
        ],
        [{ id: 34 }],
        [],
      ],
      queryResponses: [[], []],
    })
    await updateSpecificationRfiQuestionItem(
      unlocked.db as unknown as Parameters<
        typeof updateSpecificationRfiQuestionItem
      >[0],
      4,
      12,
      { isIncluded: false },
      actor,
    )
    expect(unlocked.managerQuery.mock.calls.at(-1)?.[1]).toEqual([
      4,
      12,
      34,
      1,
      0,
      0,
      null,
      actor.hsaId,
      actor.displayName,
    ])

    const locked = createTransactionalDb({
      managerResponses: [
        [],
        [
          {
            isLocked: 1,
            lockedAt: new Date(),
            lockedByDisplayName: actor.displayName,
            lockedByHsaId: actor.hsaId,
            specificationId: 4,
          },
        ],
        [{ id: 34 }],
        [{ isIncluded: 1, versionId: 34 }],
        [],
      ],
      queryResponses: [[], []],
    })
    await updateSpecificationRfiQuestionItem(
      locked.db as unknown as Parameters<
        typeof updateSpecificationRfiQuestionItem
      >[0],
      4,
      12,
      { relevance: null },
      actor,
    )
    expect(locked.managerQuery.mock.calls.at(-1)?.[1]).toEqual([
      4,
      12,
      34,
      0,
      1,
      1,
      null,
      actor.hsaId,
      actor.displayName,
    ])
  })

  it('rejects missing unlocked versions and unknown requirement areas', async () => {
    const missingVersion = createTransactionalDb({
      managerResponses: [
        [],
        [
          {
            isLocked: 0,
            lockedAt: null,
            lockedByDisplayName: null,
            lockedByHsaId: null,
            specificationId: 4,
          },
        ],
        [],
      ],
      queryResponses: [],
    })
    await expect(
      updateSpecificationRfiQuestionItem(
        missingVersion.db as unknown as Parameters<
          typeof updateSpecificationRfiQuestionItem
        >[0],
        4,
        404,
        { isIncluded: true },
        actor,
      ),
    ).rejects.toMatchObject({
      details: { reason: 'missing_active_rfi_question_version' },
    })

    const missingArea = createTransactionalDb({
      managerResponses: [
        [],
        [
          {
            isLocked: 0,
            lockedAt: null,
            lockedByDisplayName: null,
            lockedByHsaId: null,
            specificationId: 4,
          },
        ],
        [],
      ],
      queryResponses: [],
    })
    await expect(
      updateSpecificationRfiAreaScope(
        missingArea.db as unknown as Parameters<
          typeof updateSpecificationRfiAreaScope
        >[0],
        4,
        404,
        true,
        actor,
      ),
    ).rejects.toMatchObject({ details: { reason: 'area_not_found' } })
  })

  it('validates suggestion content, area, and question ownership', async () => {
    await expect(
      createRfiQuestionSuggestion(
        { query: vi.fn() },
        { areaId: 2, content: '   ' },
        actor,
      ),
    ).rejects.toMatchObject({ code: 'validation' })

    await expect(
      createRfiQuestionSuggestion(
        { query: createQuery([[]]) },
        { areaId: 404, content: 'Suggestion' },
        actor,
      ),
    ).rejects.toMatchObject({ details: { reason: 'area_not_found' } })

    await expect(
      createRfiQuestionSuggestion(
        { query: createQuery([[{ id: 2 }], []]) },
        { areaId: 2, content: 'Suggestion', rfiQuestionId: 404 },
        actor,
      ),
    ).rejects.toMatchObject({ details: { reason: 'rfi_question_not_found' } })

    await expect(
      createRfiQuestionSuggestion(
        { query: createQuery([[{ id: 2 }], [{ areaId: 3 }]]) },
        { areaId: 2, content: 'Suggestion', rfiQuestionId: 12 },
        actor,
      ),
    ).rejects.toMatchObject({
      details: { reason: 'rfi_question_area_mismatch' },
    })
  })

  it('creates area-only suggestions and reports failed reloads', async () => {
    const query = createQuery([
      [{ id: 2 }],
      [{ id: 77 }],
      [
        {
          areaId: 2,
          areaName: 'Informationssäkerhet',
          content: 'Area suggestion',
          createdAt: new Date('2026-06-20T09:00:00.000Z'),
          createdByDisplayName: null,
          createdByHsaId: null,
          id: 77,
          isReviewRequested: 0,
          questionCode: null,
          resolution: null,
          resolutionMotivation: null,
          resolvedAt: null,
          resolvedByDisplayName: null,
          resolvedByHsaId: null,
          reviewRequestedAt: null,
          rfiQuestionId: null,
          sourceSpecificationCode: null,
          sourceSpecificationName: null,
          specificationId: null,
          updatedAt: null,
        },
      ],
    ])
    await expect(
      createRfiQuestionSuggestion(
        { query },
        { areaId: 2, content: ' Area suggestion ' },
        actor,
      ),
    ).resolves.toMatchObject({
      content: 'Area suggestion',
      specificationId: null,
    })

    const failedReload = createQuery([[{ id: 2 }], [{ id: 88 }], []])
    await expect(
      createRfiQuestionSuggestion(
        { query: failedReload },
        { areaId: 2, content: 'Missing after insert' },
        actor,
      ),
    ).rejects.toMatchObject({ code: 'internal' })
  })

  it('lists unscoped suggestions with resolved timestamp mappings', async () => {
    const query = createQuery([
      [
        {
          areaId: 2,
          areaName: 'Informationssäkerhet',
          content: 'Resolved suggestion',
          createdAt: new Date('2026-06-20T09:00:00.000Z'),
          createdByDisplayName: actor.displayName,
          createdByHsaId: actor.hsaId,
          id: 77,
          isReviewRequested: 1,
          questionCode: null,
          resolution: 1,
          resolutionMotivation: 'Done',
          resolvedAt: new Date('2026-06-21T09:00:00.000Z'),
          resolvedByDisplayName: actor.displayName,
          resolvedByHsaId: actor.hsaId,
          reviewRequestedAt: new Date('2026-06-20T10:00:00.000Z'),
          rfiQuestionId: null,
          sourceSpecificationCode: null,
          sourceSpecificationName: null,
          specificationId: null,
          updatedAt: new Date('2026-06-21T09:00:00.000Z'),
        },
      ],
    ])

    const result = await listRfiQuestionSuggestions({ query })

    expect(query.mock.calls[0]?.[1]).toEqual([201])
    expect(result[0]).toMatchObject({
      resolvedAt: '2026-06-21T09:00:00.000Z',
      reviewRequestedAt: '2026-06-20T10:00:00.000Z',
      updatedAt: '2026-06-21T09:00:00.000Z',
    })
  })

  it('covers successful and terminal suggestion lifecycle outcomes', async () => {
    const reviewedQuery = createQuery([
      [{ id: 77 }],
      [
        {
          areaId: 2,
          areaName: 'Informationssäkerhet',
          content: 'Review me',
          createdAt: new Date(),
          createdByDisplayName: actor.displayName,
          createdByHsaId: actor.hsaId,
          id: 77,
          isReviewRequested: 1,
          questionCode: null,
          resolution: null,
          resolutionMotivation: null,
          resolvedAt: null,
          resolvedByDisplayName: null,
          resolvedByHsaId: null,
          reviewRequestedAt: new Date(),
          rfiQuestionId: null,
          sourceSpecificationCode: null,
          sourceSpecificationName: null,
          specificationId: null,
          updatedAt: new Date(),
        },
      ],
    ])
    await expect(
      requestRfiQuestionSuggestionReview({ query: reviewedQuery }, 77),
    ).resolves.toMatchObject({ id: 77, isReviewRequested: true })

    const resolvedQuery = createQuery([
      [{ id: 77 }],
      [
        {
          areaId: 2,
          areaName: 'Informationssäkerhet',
          content: 'Resolved',
          createdAt: new Date(),
          createdByDisplayName: actor.displayName,
          createdByHsaId: actor.hsaId,
          id: 77,
          isReviewRequested: 1,
          questionCode: null,
          resolution: 1,
          resolutionMotivation: 'Done',
          resolvedAt: new Date(),
          resolvedByDisplayName: actor.displayName,
          resolvedByHsaId: actor.hsaId,
          reviewRequestedAt: new Date(),
          rfiQuestionId: null,
          sourceSpecificationCode: null,
          sourceSpecificationName: null,
          specificationId: null,
          updatedAt: new Date(),
        },
      ],
    ])
    await expect(
      resolveRfiQuestionSuggestion(
        { query: resolvedQuery },
        77,
        { resolution: 1, resolutionMotivation: ' Done ' },
        actor,
      ),
    ).resolves.toMatchObject({ id: 77, resolution: 1 })

    await expect(
      resolveRfiQuestionSuggestion(
        { query: vi.fn() },
        77,
        { resolution: 1, resolutionMotivation: '   ' },
        actor,
      ),
    ).rejects.toMatchObject({ code: 'validation' })

    await expect(
      requestRfiQuestionSuggestionReview({ query: createQuery([[], []]) }, 404),
    ).rejects.toMatchObject({ code: 'not_found' })

    await expect(
      requestRfiQuestionSuggestionReview(
        {
          query: createQuery([
            [],
            [
              {
                areaId: 2,
                id: 77,
                isReviewRequested: 1,
                resolution: 1,
                reviewRequestedAt: new Date(),
                rfiQuestionId: null,
                specificationId: null,
              },
            ],
          ]),
        },
        77,
      ),
    ).rejects.toMatchObject({
      details: { reason: 'rfi_question_suggestion_already_resolved' },
    })

    await expect(
      resolveRfiQuestionSuggestion(
        { query: createQuery([[], []]) },
        404,
        { resolution: 1, resolutionMotivation: 'Done' },
        actor,
      ),
    ).rejects.toMatchObject({ code: 'not_found' })

    await expect(
      resolveRfiQuestionSuggestion(
        {
          query: createQuery([
            [],
            [
              {
                areaId: 2,
                id: 77,
                isReviewRequested: 1,
                resolution: 2,
                reviewRequestedAt: new Date(),
                rfiQuestionId: null,
                specificationId: null,
              },
            ],
          ]),
        },
        77,
        { resolution: 1, resolutionMotivation: 'Done' },
        actor,
      ),
    ).rejects.toMatchObject({
      details: { reason: 'rfi_question_suggestion_already_resolved' },
    })
  })
})

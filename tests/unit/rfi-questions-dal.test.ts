import { describe, expect, it, vi } from 'vitest'
import {
  createRfiQuestion,
  createRfiQuestionSuggestion,
  deleteRfiQuestionSuggestion,
  listRfiQuestionSuggestions,
  lockSpecificationRfiList,
  updateRfiQuestion,
  updateSpecificationRfiQuestionItem,
} from '@/lib/dal/rfi-questions'

type QueryFn = ReturnType<
  typeof vi.fn<(sql: string, parameters?: unknown[]) => Promise<unknown[]>>
>
type MockManager = { query: QueryFn }

function createQuery(responses: unknown[][]): QueryFn {
  const query = vi
    .fn<(sql: string, parameters?: unknown[]) => Promise<unknown[]>>()
    .mockResolvedValue([])
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
        [{ id: 3, versionId: 34 }],
        [{ id: 5, versionId: 34 }],
        [{ id: 7, versionId: 34 }],
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
        [{ id: 8, versionId: 34 }],
        [{ id: 4, versionId: 34 }],
        [{ id: 99, versionId: 34 }],
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
      [{ id: 4, name: 'E-arkiv', uniqueId: 'SPEC-004' }],
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
          sourceSpecificationUniqueId: 'SPEC-004',
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
      sourceSpecificationUniqueId: 'SPEC-004',
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
          sourceSpecificationUniqueId: 'SPEC-004',
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
        'WHERE suggestion.area_id = @0 AND suggestion.specification_id = @1',
      ),
      [2, 4],
    )
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      content: 'Ny fråga om loggning',
      specificationId: 4,
    })
  })

  it('deletes only RFI question suggestions that have not entered review or resolution', async () => {
    const query = createQuery([
      [{ id: 77, isReviewRequested: 0, resolution: null }],
      [],
    ])
    const db = { query }

    await deleteRfiQuestionSuggestion(
      db as unknown as Parameters<typeof deleteRfiQuestionSuggestion>[0],
      77,
    )

    expect(query).toHaveBeenNthCalledWith(
      2,
      'DELETE FROM rfi_question_suggestions WHERE id = @0',
      [77],
    )
  })

  it('rejects deletion after RFI question suggestion review has started', async () => {
    const query = createQuery([
      [{ id: 77, isReviewRequested: 1, resolution: null }],
    ])
    const db = { query }

    await expect(
      deleteRfiQuestionSuggestion(
        db as unknown as Parameters<typeof deleteRfiQuestionSuggestion>[0],
        77,
      ),
    ).rejects.toMatchObject({
      code: 'conflict',
      details: { reason: 'rfi_question_suggestion_already_handled' },
    })
    expect(query).toHaveBeenCalledTimes(1)
  })
})

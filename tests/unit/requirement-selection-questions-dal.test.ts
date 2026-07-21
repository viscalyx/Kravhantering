import { describe, expect, it, vi } from 'vitest'
import {
  cleanupRequirementSelectionPackageLinks,
  getExistingSpecificationRequirementIds,
  getRequirementSelectionFilterForSpecification,
  listRequirementSelectionMatchedRequirements,
  listRequirementSelectionQuestions,
  replaceRequirementSelectionQuestionVisibilityGroups,
  replaceSpecificationRequirementSelectionAnswers,
  resolveRequirementSelectionQuestionId,
  setRequirementSelectionAnswerState,
  setRequirementSelectionQuestionState,
} from '@/lib/dal/requirement-selection-questions'
import { STATUS_PUBLISHED } from '@/lib/requirements/status-constants.mjs'

function createDb(rows: unknown[]) {
  return {
    query: vi.fn(async () => rows),
  } as unknown as Parameters<typeof getExistingSpecificationRequirementIds>[0]
}

function createTransactionalDb(query: ReturnType<typeof vi.fn>) {
  return {
    query,
    transaction: vi.fn(async (callback: (manager: unknown) => Promise<void>) =>
      callback({ query }),
    ),
  } as unknown as Parameters<typeof setRequirementSelectionQuestionState>[0]
}

function questionRow(overrides: Record<string, unknown> = {}) {
  return {
    areaId: 1,
    areaName: 'Security',
    areaPrefix: 'SAK',
    archivedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    helpText: null,
    id: 1,
    isActive: 1,
    isArchived: 0,
    questionCode: 'SAK-KUF001',
    selectionType: 'single',
    sortOrder: 10,
    text: 'Question',
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  }
}

function answerRow(overrides: Record<string, unknown> = {}) {
  return {
    archivedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    description: null,
    id: 4,
    isActive: 1,
    isArchived: 0,
    isNoRequirementSelection: 0,
    questionId: 1,
    sortOrder: 10,
    text: 'Answer',
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  }
}

function createRequirementSelectionFilterDb({
  answers,
  finalRequirementRows = [],
  questions,
  savedRows,
  visibilityRows = [],
}: {
  answers: Array<Record<string, unknown>>
  finalRequirementRows?: Array<Record<string, unknown>>
  questions: Array<Record<string, unknown>>
  savedRows: Array<Record<string, unknown>>
  visibilityRows?: Array<Record<string, unknown>>
}) {
  const query = vi.fn(async (sql: string) => {
    if (
      sql.includes('FROM requirement_selection_questions AS question') &&
      sql.includes('question.question_code AS questionCode')
    ) {
      return questions
    }
    if (
      sql.includes(
        'requirement_selection_question_visibility_groups AS visibility_group',
      )
    ) {
      return visibilityRows
    }
    if (
      sql.includes(
        'SELECT DISTINCT answer_requirement.requirement_id AS requirementId',
      )
    ) {
      return finalRequirementRows
    }
    if (
      sql.includes('requirement_selection_answer_packages AS answer_package')
    ) {
      return []
    }
    if (
      sql.includes(
        'requirement_selection_answer_requirements AS answer_requirement',
      ) &&
      sql.includes('answer_id AS answerId')
    ) {
      return []
    }
    if (sql.includes('source.answerId AS answerId')) {
      return []
    }
    if (sql.includes('FROM requirement_selection_answers AS answer')) {
      return answers
    }
    if (sql.includes('FROM specification_requirement_selection_answers')) {
      return savedRows
    }
    return []
  })
  return { query } as unknown as Parameters<
    typeof getRequirementSelectionFilterForSpecification
  >[0]
}

describe('requirement selection questions DAL', () => {
  it('hydrates catalog collections with fixed parameters and deduplicated matched sources', async () => {
    const query = vi.fn(async (sql: string, _parameters?: unknown[]) => {
      if (sql.includes('source.answerId AS answerId')) {
        return [
          {
            answerId: 4,
            description: 'Published',
            id: 101,
            isDirect: 1,
            packageId: null,
            packageName: null,
            packagePurposeAndScope: null,
            uniqueId: 'SEC-001',
          },
          {
            answerId: 4,
            description: 'Published',
            id: 101,
            isDirect: 0,
            packageId: 8,
            packageName: 'Security',
            packagePurposeAndScope: 'Security baseline',
            uniqueId: 'SEC-001',
          },
          {
            answerId: 4,
            description: 'Published',
            id: 101,
            isDirect: 0,
            packageId: 8,
            packageName: 'Security',
            packagePurposeAndScope: 'Security baseline',
            uniqueId: 'SEC-001',
          },
        ]
      }
      if (
        sql.includes('requirement_selection_answer_packages AS answer_package')
      ) {
        return [{ answerId: 4, packageId: 8 }]
      }
      if (
        sql.includes(
          'requirement_selection_answer_requirements AS answer_requirement',
        )
      ) {
        return [{ answerId: 4, requirementId: 101 }]
      }
      if (sql.includes('FROM requirement_selection_answers AS answer')) {
        return [answerRow()]
      }
      if (
        sql.includes(
          'requirement_selection_question_visibility_groups AS visibility_group',
        )
      ) {
        return []
      }
      return [questionRow()]
    })
    const db = { query } as unknown as Parameters<
      typeof listRequirementSelectionQuestions
    >[0]

    const result = await listRequirementSelectionQuestions(db, {
      includeArchived: true,
    })

    expect(result[0]?.answers[0]).toMatchObject({
      matchingRequirementCount: 1,
      packageIds: [8],
      requirementIds: [101],
      matchingRequirements: [
        {
          direct: true,
          id: 101,
          sourcePackages: [{ id: 8 }],
        },
      ],
    })
    expect(
      query.mock.calls.every(
        ([, parameters]) => (parameters?.length ?? 0) <= 3,
      ),
    ).toBe(true)
    expect(
      query.mock.calls
        .slice(0, 6)
        .every(([sql]) => String(sql).includes('WITH selected_questions AS')),
    ).toBe(true)
  })

  it('loads existing requirement ids through the specification item foreign key', async () => {
    const db = createDb([{ requirementId: 101 }, { requirementId: 102 }])

    await expect(
      getExistingSpecificationRequirementIds(db, 6),
    ).resolves.toEqual([101, 102])

    const query = vi.mocked(db.query)
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('item.requirements_specification_id = @0'),
      [6],
    )
  })

  it('treats no-requirement-selection answers as answered without filtering available requirements', async () => {
    const db = createRequirementSelectionFilterDb({
      answers: [
        answerRow({
          isNoRequirementSelection: 1,
        }),
      ],
      questions: [questionRow()],
      savedRows: [
        {
          answerId: 4,
          isHistorical: 0,
          questionId: 1,
          selectedByDisplayName: 'Ada',
          selectedByHsaId: 'SE5560000001-ada',
          updatedAt: new Date('2026-01-01T00:00:00Z'),
        },
      ],
    })

    await expect(
      getRequirementSelectionFilterForSpecification(db, 9),
    ).resolves.toEqual({
      hasCurrentAnswers: true,
      hasRequirementSelection: false,
      hasNoRequirementSelection: true,
      requirementIds: [],
    })

    expect(
      vi
        .mocked(db.query)
        .mock.calls.some(([sql]) =>
          String(sql).includes(
            'SELECT DISTINCT answer_requirement.requirement_id AS requirementId',
          ),
        ),
    ).toBe(false)
  })

  it('filters explicit answer requirement links to requirements with a published version', async () => {
    const db = createRequirementSelectionFilterDb({
      answers: [answerRow()],
      finalRequirementRows: [{ requirementId: 101 }],
      questions: [questionRow()],
      savedRows: [
        {
          answerId: 4,
          isHistorical: 0,
          questionId: 1,
          selectedByDisplayName: 'Ada',
          selectedByHsaId: 'SE5560000001-ada',
          updatedAt: new Date('2026-01-01T00:00:00Z'),
        },
      ],
    })

    await expect(
      getRequirementSelectionFilterForSpecification(db, 9),
    ).resolves.toEqual({
      hasCurrentAnswers: true,
      hasRequirementSelection: true,
      hasNoRequirementSelection: false,
      requirementIds: [101],
    })

    const query = vi.mocked(db.query)
    const filterCall = query.mock.calls.find(([sql]) =>
      String(sql).includes(
        'SELECT DISTINCT answer_requirement.requirement_id AS requirementId',
      ),
    )
    const filterSql = String(filterCall?.[0])
    expect(filterSql).toContain(
      'FROM requirement_selection_answer_requirements AS answer_requirement',
    )
    expect(filterSql).toContain('AND EXISTS (')
    expect(filterSql).toContain('explicit_version.requirement_status_id = @1')
    expect(filterCall?.[1]).toEqual([4, STATUS_PUBLISHED])
  })

  it('ignores current saved answers on questions hidden by visibility conditions', async () => {
    const db = createRequirementSelectionFilterDb({
      answers: [
        answerRow({ id: 4, questionId: 1, text: 'REST API' }),
        answerRow({ id: 9, questionId: 2, text: 'E2E tests' }),
      ],
      questions: [
        questionRow({ id: 1, questionCode: 'INT-KUF001' }),
        questionRow({
          areaId: 2,
          areaName: 'Quality',
          areaPrefix: 'KVA',
          id: 2,
          questionCode: 'KVA-KUF001',
          text: 'Quality follow-up',
        }),
      ],
      savedRows: [
        {
          answerId: 9,
          isHistorical: 0,
          questionId: 2,
          selectedByDisplayName: 'Ada',
          selectedByHsaId: 'SE5560000001-ada',
          updatedAt: new Date('2026-01-01T00:00:00Z'),
        },
      ],
      visibilityRows: [
        {
          answerId: 4,
          answerIsActive: 1,
          answerIsArchived: 0,
          answerText: 'REST API',
          groupId: 1,
          id: 1,
          parentAreaName: 'Integration',
          parentQuestionCode: 'INT-KUF001',
          parentQuestionId: 1,
          parentQuestionIsActive: 1,
          parentQuestionIsArchived: 0,
          parentQuestionText: 'Integration?',
          questionId: 2,
          sortOrder: 0,
        },
      ],
    })

    await expect(
      getRequirementSelectionFilterForSpecification(db, 9),
    ).resolves.toEqual({
      hasCurrentAnswers: false,
      hasRequirementSelection: false,
      hasNoRequirementSelection: false,
      requirementIds: [],
    })
  })

  it('marks confirmed hidden follow-up answers historical instead of deleting them', async () => {
    const savedRows = [
      {
        answerId: 4,
        isHistorical: 0,
        questionId: 1,
        selectedByDisplayName: 'Ada',
        selectedByHsaId: 'SE5560000001-ada',
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      },
      {
        answerId: 9,
        isHistorical: 0,
        questionId: 2,
        selectedByDisplayName: 'Ada',
        selectedByHsaId: 'SE5560000001-ada',
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      },
    ]
    const query = vi.fn(async (sql: string, _params?: unknown[]) => {
      if (sql.includes('SELECT selection_type AS selectionType')) {
        return [{ selectionType: 'single' }]
      }
      if (sql.includes('is_no_requirement_selection')) {
        return [{ id: 5, isNoRequirementSelection: 0 }]
      }
      if (
        sql.includes('FROM requirement_selection_questions AS question') &&
        sql.includes('question.question_code AS questionCode')
      ) {
        return [
          questionRow({
            areaName: 'Integration',
            areaPrefix: 'INT',
            id: 1,
            questionCode: 'INT-KUF001',
            text: 'Integration?',
          }),
          questionRow({
            areaId: 2,
            areaName: 'Quality',
            areaPrefix: 'KVA',
            id: 2,
            questionCode: 'KVA-KUF001',
            text: 'Quality follow-up',
          }),
        ]
      }
      if (
        sql.includes(
          'requirement_selection_question_visibility_groups AS visibility_group',
        )
      ) {
        return [
          {
            answerId: 4,
            answerIsActive: 1,
            answerIsArchived: 0,
            answerText: 'REST API',
            groupId: 1,
            id: 1,
            parentAreaName: 'Integration',
            parentQuestionCode: 'INT-KUF001',
            parentQuestionId: 1,
            parentQuestionIsActive: 1,
            parentQuestionIsArchived: 0,
            parentQuestionText: 'Integration?',
            questionId: 2,
            sortOrder: 0,
          },
        ]
      }
      if (
        sql.includes('requirement_selection_answer_packages AS answer_package')
      ) {
        return []
      }
      if (
        sql.includes(
          'requirement_selection_answer_requirements AS answer_requirement',
        )
      ) {
        return []
      }
      if (sql.includes('source.answerId AS answerId')) {
        return []
      }
      if (sql.includes('FROM requirement_selection_answers AS answer')) {
        return [
          answerRow({ id: 4, questionId: 1, text: 'REST API' }),
          answerRow({ id: 5, questionId: 1, text: 'Message queue' }),
          answerRow({ id: 9, questionId: 2, text: 'E2E tests' }),
        ]
      }
      if (sql.includes('FROM specification_requirement_selection_answers')) {
        return savedRows
      }
      if (sql.includes('FROM requirements_specification_items')) {
        return []
      }
      return []
    })
    const db = createTransactionalDb(query) as unknown as Parameters<
      typeof replaceSpecificationRequirementSelectionAnswers
    >[0]

    await replaceSpecificationRequirementSelectionAnswers(
      db,
      9,
      1,
      [5],
      { displayName: 'Ada', hsaId: 'SE5560000001-ada' },
      { confirmHiddenAnswerClear: true },
    )

    const hiddenFollowUpUpdate = query.mock.calls.find(([sql]) => {
      const text = String(sql)
      return (
        text.includes('UPDATE specification_requirement_selection_answers') &&
        text.includes('question_id IN (@1)') &&
        text.includes('is_historical = 0')
      )
    })
    expect(String(hiddenFollowUpUpdate?.[0])).toContain('SET is_historical = 1')
    expect(String(hiddenFollowUpUpdate?.[0])).toContain('changed_at = @2')
    expect(String(hiddenFollowUpUpdate?.[0])).toContain(
      'changed_by_hsa_id = @3',
    )
    expect(String(hiddenFollowUpUpdate?.[0])).toContain(
      'changed_by_display_name = @4',
    )
    expect(hiddenFollowUpUpdate?.[1]).toEqual([
      9,
      2,
      expect.any(Date),
      'SE5560000001-ada',
      'Ada',
    ])
    expect(
      query.mock.calls.some(([sql]) => {
        const text = String(sql)
        return (
          text.includes(
            'DELETE FROM specification_requirement_selection_answers',
          ) && text.includes('question_id IN (@1)')
        )
      }),
    ).toBe(false)
  })

  it('limits visibility cleanup to specifications with affected descendant answers', async () => {
    const savedRows = [
      {
        answerId: 4,
        isHistorical: 0,
        questionId: 1,
        selectedByDisplayName: 'Ada',
        selectedByHsaId: 'SE5560000001-ada',
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      },
      {
        answerId: 9,
        isHistorical: 0,
        questionId: 2,
        selectedByDisplayName: 'Ada',
        selectedByHsaId: 'SE5560000001-ada',
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      },
    ]
    const query = vi.fn(async (sql: string, _params?: unknown[]) => {
      if (sql.includes('SELECT id') && sql.includes('WHERE id = @0')) {
        return [{ id: 1 }]
      }
      if (sql.includes('SELECT id, question_id AS questionId')) {
        return [{ id: 30, questionId: 3 }]
      }
      if (sql.includes('childQuestionId')) {
        return [{ childQuestionId: 2, parentQuestionId: 1 }]
      }
      if (
        sql.includes(
          'INSERT INTO requirement_selection_question_visibility_groups',
        )
      ) {
        return [{ id: 100 }]
      }
      if (sql.includes('WITH visibility_descendants')) {
        return [{ questionId: 1 }, { questionId: 2 }]
      }
      if (
        sql.includes('SELECT DISTINCT specification_id AS specificationId') &&
        sql.includes('question_id IN (@0, @1)')
      ) {
        return [{ specificationId: 9 }]
      }
      if (
        sql.includes('FROM requirement_selection_questions AS question') &&
        sql.includes('question.question_code AS questionCode')
      ) {
        return [
          questionRow({
            areaName: 'Integration',
            areaPrefix: 'INT',
            id: 1,
            questionCode: 'INT-KUF001',
            text: 'Integration?',
          }),
          questionRow({
            areaId: 2,
            areaName: 'Quality',
            areaPrefix: 'KVA',
            id: 2,
            questionCode: 'KVA-KUF001',
            text: 'Quality follow-up',
          }),
          questionRow({
            areaId: 3,
            areaName: 'Operations',
            areaPrefix: 'OPS',
            id: 3,
            questionCode: 'OPS-KUF001',
            text: 'Operations?',
          }),
        ]
      }
      if (
        sql.includes(
          'requirement_selection_question_visibility_groups AS visibility_group',
        )
      ) {
        return [
          {
            answerId: 30,
            answerIsActive: 1,
            answerIsArchived: 0,
            answerText: 'Operated service',
            groupId: 11,
            id: 11,
            parentAreaName: 'Operations',
            parentQuestionCode: 'OPS-KUF001',
            parentQuestionId: 3,
            parentQuestionIsActive: 1,
            parentQuestionIsArchived: 0,
            parentQuestionText: 'Operations?',
            questionId: 1,
            sortOrder: 0,
          },
          {
            answerId: 4,
            answerIsActive: 1,
            answerIsArchived: 0,
            answerText: 'REST API',
            groupId: 12,
            id: 12,
            parentAreaName: 'Integration',
            parentQuestionCode: 'INT-KUF001',
            parentQuestionId: 1,
            parentQuestionIsActive: 1,
            parentQuestionIsArchived: 0,
            parentQuestionText: 'Integration?',
            questionId: 2,
            sortOrder: 0,
          },
        ]
      }
      if (
        sql.includes('requirement_selection_answer_packages AS answer_package')
      ) {
        return []
      }
      if (
        sql.includes(
          'requirement_selection_answer_requirements AS answer_requirement',
        )
      ) {
        return []
      }
      if (sql.includes('source.answerId AS answerId')) {
        return []
      }
      if (sql.includes('FROM requirement_selection_answers AS answer')) {
        return [
          answerRow({ id: 4, questionId: 1, text: 'REST API' }),
          answerRow({ id: 9, questionId: 2, text: 'E2E tests' }),
          answerRow({ id: 30, questionId: 3, text: 'Operated service' }),
        ]
      }
      if (sql.includes('UPDATE specification_requirement_selection_answers')) {
        return [{ questionId: 1 }, { questionId: 2 }]
      }
      if (sql.includes('FROM specification_requirement_selection_answers')) {
        return savedRows
      }
      return []
    })
    const db = createTransactionalDb(query) as unknown as Parameters<
      typeof replaceRequirementSelectionQuestionVisibilityGroups
    >[0]

    await replaceRequirementSelectionQuestionVisibilityGroups(db, 1, [
      {
        conditions: [{ answerIds: [30], parentQuestionId: 3 }],
      },
    ])

    const specificationQuery = query.mock.calls.find(([sql]) => {
      const text = String(sql)
      return text.includes(
        'SELECT DISTINCT specification_id AS specificationId',
      )
    })
    expect(String(specificationQuery?.[0])).toContain('question_id IN (@0, @1)')
    expect(specificationQuery?.[1]).toEqual([1, 2])
    const historicalUpdate = query.mock.calls.find(([sql]) =>
      String(sql).includes(
        'UPDATE specification_requirement_selection_answers',
      ),
    )
    expect(String(historicalUpdate?.[0])).toContain('question_id IN (@1, @2)')
    expect(historicalUpdate?.[1]).toEqual([9, 1, 2, expect.any(Date)])
    expect(
      query.mock.calls.some(([sql]) => {
        const text = String(sql)
        return (
          text.includes(
            'SELECT DISTINCT specification_id AS specificationId',
          ) &&
          text.includes('WHERE is_historical = 0') &&
          !text.includes('question_id IN')
        )
      }),
    ).toBe(false)
  })

  it('returns no matched requirements without package or requirement filters', async () => {
    const db = createDb([])

    await expect(
      listRequirementSelectionMatchedRequirements(db),
    ).resolves.toEqual([])

    expect(vi.mocked(db.query)).not.toHaveBeenCalled()
  })

  it('matches published requirements from explicit requirement ids', async () => {
    const db = createDb([
      {
        description: 'Explicit requirement',
        id: 101,
        isDirect: 1,
        packageId: null,
        packageName: null,
        packagePurposeAndScope: null,
        uniqueId: 'REQ-101',
      },
    ])

    await expect(
      listRequirementSelectionMatchedRequirements(db, {
        requirementIds: [101],
      }),
    ).resolves.toEqual([
      {
        description: 'Explicit requirement',
        direct: true,
        id: 101,
        sourcePackages: [],
        uniqueId: 'REQ-101',
      },
    ])

    const query = vi.mocked(db.query)
    expect(String(query.mock.calls[0]?.[0])).toContain(
      'FROM requirements AS explicit_requirement',
    )
    expect(String(query.mock.calls[0]?.[0])).toContain(
      'explicit_version.requirement_status_id = @1',
    )
    expect(String(query.mock.calls[0]?.[0])).not.toContain(
      'requirement_version_requirement_packages',
    )
    expect(query.mock.calls[0]?.[1]).toEqual([
      101,
      STATUS_PUBLISHED,
      STATUS_PUBLISHED,
    ])
  })

  it('matches published requirements from requirement packages', async () => {
    const db = createDb([
      {
        description: 'Packaged requirement',
        id: 202,
        isDirect: 0,
        packageId: 7,
        packageName: 'Baseline',
        packagePurposeAndScope: 'Baseline requirements.',
        uniqueId: 'REQ-202',
      },
    ])

    await expect(
      listRequirementSelectionMatchedRequirements(db, {
        packageIds: [7],
      }),
    ).resolves.toEqual([
      {
        description: 'Packaged requirement',
        direct: false,
        id: 202,
        sourcePackages: [
          {
            id: 7,
            name: 'Baseline',
            purposeAndScope: 'Baseline requirements.',
          },
        ],
        uniqueId: 'REQ-202',
      },
    ])

    const query = vi.mocked(db.query)
    expect(String(query.mock.calls[0]?.[0])).toContain(
      'FROM requirement_version_requirement_packages AS version_package',
    )
    expect(String(query.mock.calls[0]?.[0])).toContain(
      'package_version.requirement_status_id = @1',
    )
    expect(query.mock.calls[0]?.[1]).toEqual([
      7,
      STATUS_PUBLISHED,
      STATUS_PUBLISHED,
    ])
  })

  it('matches overlapping package and requirement ids as one requirement with both sources', async () => {
    const db = createDb([
      {
        description: 'Mixed requirement',
        id: 303,
        isDirect: 1,
        packageId: null,
        packageName: null,
        packagePurposeAndScope: null,
        uniqueId: 'REQ-303',
      },
      {
        description: 'Mixed requirement',
        id: 303,
        isDirect: 0,
        packageId: 9,
        packageName: 'Enhanced',
        packagePurposeAndScope: 'Enhanced requirements.',
        uniqueId: 'REQ-303',
      },
    ])

    await expect(
      listRequirementSelectionMatchedRequirements(db, {
        packageIds: [9, 9],
        requirementIds: [303, 303],
      }),
    ).resolves.toEqual([
      {
        description: 'Mixed requirement',
        direct: true,
        id: 303,
        sourcePackages: [
          {
            id: 9,
            name: 'Enhanced',
            purposeAndScope: 'Enhanced requirements.',
          },
        ],
        uniqueId: 'REQ-303',
      },
    ])

    const query = vi.mocked(db.query)
    const sql = String(query.mock.calls[0]?.[0])
    expect(sql).toContain('UNION ALL')
    expect(sql).toContain('requirement_package.name AS packageName')
    expect(sql).toContain('ORDER BY requirement.unique_id ASC')
    expect(query.mock.calls[0]?.[1]).toEqual([
      303,
      STATUS_PUBLISHED,
      9,
      STATUS_PUBLISHED,
      STATUS_PUBLISHED,
    ])
  })

  it('rejects invalid matched requirement ids before querying', async () => {
    const db = createDb([])

    await expect(
      listRequirementSelectionMatchedRequirements(db, {
        packageIds: [0],
      }),
    ).rejects.toMatchObject({
      details: expect.objectContaining({
        reason: 'invalid_id',
      }),
    })

    expect(vi.mocked(db.query)).not.toHaveBeenCalled()
  })

  it('cleans package links from requirement-selection answers and reports affected answers', async () => {
    const query = vi.fn(async (_sql: string, _params: unknown[]) => [
      { answerId: 7, requirementId: null },
      { answerId: 7, requirementId: null },
      { answerId: 9, requirementId: null },
    ])
    const db = { query } as unknown as Parameters<
      typeof cleanupRequirementSelectionPackageLinks
    >[0]

    await expect(
      cleanupRequirementSelectionPackageLinks(db, [3]),
    ).resolves.toEqual({
      affectedAnswerIds: [7, 9],
      affectedRequirementIds: [],
      removedLinkCount: 3,
    })

    expect(String(query.mock.calls[0]?.[0])).toContain('DELETE answer_package')
  })

  it('resolves visible question codes to database ids', async () => {
    const query = vi.fn(async (_sql: string, _params: unknown[]) => [
      { id: 42 },
    ])
    const db = { query } as unknown as Parameters<
      typeof resolveRequirementSelectionQuestionId
    >[0]

    await expect(
      resolveRequirementSelectionQuestionId(db, 'SÄK-KUF001'),
    ).resolves.toBe(42)

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('question_code = @0'),
      ['SÄK-KUF001'],
    )
  })

  it('sets and clears question archived_at when changing question state', async () => {
    const query = vi.fn(async (_sql: string, _params?: unknown[]) => [])
    const db = createTransactionalDb(query)

    await setRequirementSelectionQuestionState(db, 7, 'archive')
    await setRequirementSelectionQuestionState(db, 7, 'deactivate')

    const updateCalls = query.mock.calls.filter(([sql]) =>
      String(sql).includes('UPDATE requirement_selection_questions'),
    )
    expect(String(updateCalls[0]?.[0])).toContain('archived_at = @2')
    expect(updateCalls[0]?.[1]).toEqual([
      0,
      1,
      expect.any(Date),
      expect.any(Date),
      7,
    ])
    expect(updateCalls[1]?.[1]).toEqual([0, 0, null, expect.any(Date), 7])
  })

  it('sets and clears answer archived_at when changing answer state', async () => {
    const query = vi.fn(async (sql: string, _params?: unknown[]) => {
      if (sql.includes('remainingActiveAnswerCount')) {
        return [{ questionIsActive: 0, remainingActiveAnswerCount: 0 }]
      }
      return []
    })
    const db = createTransactionalDb(query) as unknown as Parameters<
      typeof setRequirementSelectionAnswerState
    >[0]

    await setRequirementSelectionAnswerState(db, 7, 11, 'archive')
    await setRequirementSelectionAnswerState(db, 7, 11, 'reactivate')

    const updateCalls = query.mock.calls.filter(([sql]) =>
      String(sql).includes('UPDATE requirement_selection_answers'),
    )
    expect(String(updateCalls[0]?.[0])).toContain('archived_at = @2')
    expect(updateCalls[0]?.[1]).toEqual([
      0,
      1,
      expect.any(Date),
      expect.any(Date),
      11,
      7,
    ])
    expect(updateCalls[1]?.[1]).toEqual([1, 0, null, expect.any(Date), 11, 7])
  })
})

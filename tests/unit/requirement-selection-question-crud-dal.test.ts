import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createRequirementSelectionAnswer,
  createRequirementSelectionQuestion,
  deleteRequirementSelectionAnswer,
  deleteRequirementSelectionQuestion,
  duplicateRequirementSelectionQuestion,
  getRequirementSelectionQuestionByIdentifier,
  setRequirementSelectionAnswerState,
  setRequirementSelectionQuestionState,
  updateRequirementSelectionAnswer,
  updateRequirementSelectionQuestion,
} from '@/lib/dal/requirement-selection-questions'

const questionDbRow = {
  areaId: 1,
  areaName: 'Security',
  areaPrefix: 'SEC',
  archivedAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  helpText: 'Select an answer',
  id: 1,
  isActive: 1,
  isArchived: 0,
  questionCode: 'SEC-KUF001',
  selectionType: 'single',
  sortOrder: 2,
  text: 'Which controls apply?',
  updatedAt: new Date('2026-01-02T00:00:00Z'),
}

const answerDbRow = {
  archivedAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  description: 'Encryption controls',
  id: 4,
  isActive: 1,
  isArchived: 0,
  isNoRequirementSelection: 0,
  questionId: 1,
  sortOrder: 1,
  text: 'Encryption',
  updatedAt: new Date('2026-01-02T00:00:00Z'),
}

interface DbState {
  activeAnswerCount: number
  answerExists: boolean
  answerIsInUse: boolean
  answerMutationExists: boolean
  areaExists: boolean
  packageIds: number[]
  publishedRequirementIds: number[]
  questionExists: boolean
  questionIsInUse: boolean
  questionMutationExists: boolean
  sequenceExists: boolean
  sourceExists: boolean
}

function createDb(overrides: Partial<DbState> = {}) {
  const state: DbState = {
    activeAnswerCount: 1,
    answerExists: true,
    answerIsInUse: false,
    answerMutationExists: true,
    areaExists: true,
    packageIds: [7],
    publishedRequirementIds: [9],
    questionExists: true,
    questionIsInUse: false,
    questionMutationExists: true,
    sequenceExists: true,
    sourceExists: true,
    ...overrides,
  }

  const query = vi.fn(async (sql: string, parameters: unknown[] = []) => {
    if (
      sql.includes('FROM requirement_areas') &&
      sql.includes('SELECT prefix')
    ) {
      return state.areaExists ? [{ prefix: 'SEC' }] : []
    }
    if (sql.includes('UPDATE requirement_selection_question_sequences')) {
      return state.sequenceExists ? [{ sequence: 1 }] : []
    }
    if (sql.includes('INSERT INTO requirement_selection_question_sequences')) {
      return []
    }
    if (
      sql.includes('INSERT INTO requirement_selection_questions') &&
      sql.includes('OUTPUT inserted.id AS id')
    ) {
      return [{ id: 1 }]
    }
    if (
      sql.includes('UPDATE requirement_selection_questions') &&
      sql.includes('OUTPUT inserted.id AS id')
    ) {
      return state.questionMutationExists ? [{ id: 1 }] : []
    }
    if (sql.includes('COUNT(1) AS activeAnswerCount')) {
      return [{ activeAnswerCount: state.activeAnswerCount }]
    }
    if (
      sql.includes('UPDATE requirement_selection_questions') &&
      !sql.includes('OUTPUT inserted.id AS id')
    ) {
      return []
    }
    if (
      sql.includes('question.question_code AS questionCode') &&
      sql.includes('FROM selected_questions')
    ) {
      return state.questionExists && state.sourceExists ? [questionDbRow] : []
    }
    if (
      sql.includes(
        'requirement_selection_question_visibility_groups AS visibility_group',
      )
    ) {
      return []
    }
    if (
      sql.includes('answer.answer_text AS text') &&
      sql.includes('FROM selected_answers')
    ) {
      return state.answerExists ? [answerDbRow] : []
    }
    if (sql.includes('source.answerId AS answerId')) return []
    if (
      sql.includes('requirement_selection_answer_packages AS answer_package') ||
      sql.includes(
        'requirement_selection_answer_requirements AS answer_requirement',
      )
    ) {
      return []
    }
    if (
      sql.includes('SELECT id') &&
      sql.includes('FROM requirement_selection_questions') &&
      !sql.includes('question_code')
    ) {
      return state.questionExists ? [{ id: 1 }] : []
    }
    if (sql.includes('WHERE question_code = @0')) {
      return state.questionExists ? [{ id: 1 }] : []
    }
    if (
      sql.includes('INSERT INTO requirement_selection_answers') &&
      sql.includes('OUTPUT inserted.id AS id')
    ) {
      return [{ id: 4 }]
    }
    if (sql.includes('FROM requirement_packages')) {
      return state.packageIds.map(id => ({ id }))
    }
    if (
      sql.includes('SELECT DISTINCT requirement_id AS id') &&
      sql.includes('FROM requirement_versions')
    ) {
      return state.publishedRequirementIds.map(id => ({ id }))
    }
    if (
      sql.includes(
        'SELECT is_no_requirement_selection AS isNoRequirementSelection',
      )
    ) {
      return state.answerMutationExists ? [{ isNoRequirementSelection: 0 }] : []
    }
    if (sql.includes('remainingActiveAnswerCount')) {
      return [{ questionIsActive: 1, remainingActiveAnswerCount: 1 }]
    }
    if (
      sql.includes('FROM specification_requirement_selection_answers') &&
      sql.includes('answer_id = @0') &&
      sql.includes('TOP 1')
    ) {
      return state.answerIsInUse ? [{ found: 1 }] : []
    }
    if (
      sql.includes('FROM specification_requirement_selection_answers') &&
      sql.includes('question_id = @0') &&
      sql.includes('TOP 1')
    ) {
      return state.questionIsInUse ? [{ found: 1 }] : []
    }
    if (
      sql.includes('DELETE FROM requirement_selection_answers') &&
      sql.includes('OUTPUT deleted.id AS id')
    ) {
      return state.answerMutationExists ? [{ id: 4 }] : []
    }
    if (
      sql.includes('SELECT id') &&
      sql.includes('FROM requirement_selection_answers') &&
      sql.includes('WHERE question_id = @0')
    ) {
      return state.answerExists ? [{ id: 4 }] : []
    }
    if (
      sql.includes('DELETE FROM requirement_selection_questions') &&
      sql.includes('OUTPUT deleted.id AS id')
    ) {
      return state.questionMutationExists ? [{ id: 1 }] : []
    }
    if (
      sql.includes('SELECT id') &&
      sql.includes('FROM requirement_selection_questions')
    ) {
      return state.questionExists ? [{ id: Number(parameters[0]) }] : []
    }
    return []
  })

  const db = {
    query,
    transaction: vi.fn(
      async (
        isolationOrCallback:
          | string
          | ((manager: { query: typeof query }) => Promise<unknown>),
        maybeCallback?: (manager: { query: typeof query }) => Promise<unknown>,
      ) => {
        const callback =
          typeof isolationOrCallback === 'function'
            ? isolationOrCallback
            : maybeCallback
        return callback?.({ query })
      },
    ),
  }

  return { db, query, state }
}

describe('requirement selection question CRUD DAL', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates and reads a question with a generated stable code', async () => {
    const { db, query } = createDb({ sequenceExists: false })

    const created = await createRequirementSelectionQuestion(db as never, {
      areaId: 1,
      helpText: null,
      selectionType: 'single',
      sortOrder: 2,
      text: 'Which controls apply?',
    })
    const byCode = await getRequirementSelectionQuestionByIdentifier(
      db as never,
      'SEC-KUF001',
    )

    expect(created.questionCode).toBe('SEC-KUF001')
    expect(byCode?.answers).toHaveLength(1)
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        'INSERT INTO requirement_selection_question_sequences',
      ),
      [1],
    )
  })

  it('rejects question creation for an unknown requirement area', async () => {
    const { db } = createDb({ areaExists: false })

    await expect(
      createRequirementSelectionQuestion(db as never, {
        areaId: 99,
        selectionType: 'multiple',
        text: 'Unknown area question',
      }),
    ).rejects.toMatchObject({
      code: 'validation',
      details: { reason: 'unknown_area' },
    })
  })

  it('updates every editable question field and reports a missing row', async () => {
    const { db, query, state } = createDb()

    const updated = await updateRequirementSelectionQuestion(db as never, 1, {
      helpText: null,
      selectionType: 'multiple',
      sortOrder: 5,
      text: 'Updated question',
    })
    expect(updated?.selectionType).toBe('single')
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('selection_type = @0'),
      expect.arrayContaining(['multiple', 'Updated question', null, 5, 1]),
    )

    state.questionMutationExists = false
    await expect(
      updateRequirementSelectionQuestion(db as never, 1, {}),
    ).resolves.toBeNull()
  })

  it('requires active answers before activating or reactivating a question', async () => {
    const { db, state } = createDb({ activeAnswerCount: 0 })

    await expect(
      setRequirementSelectionQuestionState(db as never, 1, 'activate'),
    ).rejects.toMatchObject({
      details: { reason: 'no_active_answers' },
    })

    state.activeAnswerCount = 1
    await expect(
      setRequirementSelectionQuestionState(db as never, 1, 'reactivate'),
    ).resolves.toMatchObject({ id: 1, isActive: true })
  })

  it('creates linked answers with normalized link ids', async () => {
    const { db, query } = createDb()

    const result = await createRequirementSelectionAnswer(db as never, 1, {
      description: null,
      packageIds: [7, 7],
      requirementIds: [9, 9],
      sortOrder: 3,
      text: 'Encryption',
    })

    expect(result?.id).toBe(1)
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        'INSERT INTO requirement_selection_answer_packages',
      ),
      [4, 7],
    )
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        'INSERT INTO requirement_selection_answer_requirements',
      ),
      [4, 9],
    )
  })

  it('rejects contradictory and invalid answer links', async () => {
    const { db, state } = createDb()

    await expect(
      createRequirementSelectionAnswer(db as never, 1, {
        isNoRequirementSelection: true,
        packageIds: [7],
        text: 'None',
      }),
    ).rejects.toMatchObject({
      details: { reason: 'no_selection_answer_has_links' },
    })

    state.packageIds = []
    await expect(
      createRequirementSelectionAnswer(db as never, 1, {
        packageIds: [7],
        text: 'Missing package',
      }),
    ).rejects.toMatchObject({
      details: { reason: 'invalid_requirement_package_links' },
    })

    state.packageIds = [7]
    state.publishedRequirementIds = []
    await expect(
      createRequirementSelectionAnswer(db as never, 1, {
        requirementIds: [9],
        text: 'Unpublished requirement',
      }),
    ).rejects.toMatchObject({
      details: { reason: 'invalid_requirement_links' },
    })
  })

  it('updates answer content and links while preserving its current selection kind', async () => {
    const { db, query } = createDb()

    const result = await updateRequirementSelectionAnswer(db as never, 1, 4, {
      description: 'Updated description',
      isNoRequirementSelection: false,
      packageIds: [],
      requirementIds: [],
      sortOrder: 7,
      text: 'Updated answer',
    })

    expect(result?.answers[0]?.text).toBe('Encryption')
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE requirement_selection_answers'),
      expect.arrayContaining([
        'Updated answer',
        'Updated description',
        7,
        0,
        4,
        1,
      ]),
    )
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('SET is_historical = 1'),
      expect.arrayContaining([4]),
    )
  })

  it('returns the unchanged question when an answer update target is missing', async () => {
    const { db } = createDb({ answerMutationExists: false })

    await expect(
      updateRequirementSelectionAnswer(db as never, 1, 404, {
        text: 'Missing',
      }),
    ).resolves.toMatchObject({ id: 1 })
  })

  it('guards the last active answer before deactivation', async () => {
    const { db, query } = createDb()
    query.mockImplementationOnce(async (sql: string) => {
      if (sql.includes('remainingActiveAnswerCount')) {
        return [{ questionIsActive: 1, remainingActiveAnswerCount: 0 }]
      }
      return []
    })

    await expect(
      setRequirementSelectionAnswerState(db as never, 1, 4, 'deactivate'),
    ).rejects.toMatchObject({ details: { reason: 'last_active_answer' } })
  })

  it.each([
    [{ answerIsInUse: true }, 'in_use'],
    [{ answerMutationExists: false }, 'not_found'],
    [{}, 'deleted'],
  ] as const)(
    'maps answer deletion state to %s',
    async (overrides, expected) => {
      const { db } = createDb(overrides)
      await expect(
        deleteRequirementSelectionAnswer(db as never, 1, 4),
      ).resolves.toBe(expected)
    },
  )

  it.each([
    [{ questionIsInUse: true }, 'in_use'],
    [{ questionMutationExists: false }, 'not_found'],
    [{}, 'deleted'],
  ] as const)(
    'maps question deletion state to %s and cleans child links',
    async (overrides, expected) => {
      const { db, query } = createDb(overrides)
      await expect(
        deleteRequirementSelectionQuestion(db as never, 1),
      ).resolves.toBe(expected)
      if (expected === 'deleted') {
        expect(query).toHaveBeenCalledWith(
          expect.stringContaining(
            'DELETE FROM requirement_selection_answer_packages WHERE answer_id IN',
          ),
          [4],
        )
      }
    },
  )

  it('duplicates active answers and returns the copied question', async () => {
    const { db, query } = createDb()

    const duplicate = await duplicateRequirementSelectionQuestion(
      db as never,
      1,
    )

    expect(duplicate).toMatchObject({ id: 1, questionCode: 'SEC-KUF001' })
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO requirement_selection_answers'),
      expect.arrayContaining([1, 'Encryption']),
    )
  })

  it('returns null when the duplication source does not exist', async () => {
    const { db } = createDb({ sourceExists: false })
    await expect(
      duplicateRequirementSelectionQuestion(db as never, 404),
    ).resolves.toBeNull()
  })
})

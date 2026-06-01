import {
  getSpecificationById,
  getSpecificationBySlug,
} from '@/lib/dal/requirements-specifications'
import type { SqlServerDatabase } from '@/lib/db'
import { validationError } from '@/lib/requirements/errors'
import { STATUS_PUBLISHED } from '@/lib/requirements/status-constants.mjs'
import { toBoolean, toIsoString } from '@/lib/typeorm/value-mappers'

export type RequirementSelectionType = 'multiple' | 'single'

export interface RequirementSelectionAnswerRow {
  alreadyAddedRequirementCount?: number
  createdAt: string
  description: string | null
  healthState: 'missing_requirement_selection' | 'ok'
  id: number
  isActive: boolean
  isArchived: boolean
  isNoRequirementSelection: boolean
  matchingRequirementCount: number
  matchingRequirements: RequirementSelectionMatchedRequirementRow[]
  packageIds: number[]
  questionId: number
  requirementIds: number[]
  sortOrder: number
  text: string
  updatedAt: string
}

export interface RequirementSelectionQuestionRow {
  answers: RequirementSelectionAnswerRow[]
  areaId: number
  areaName: string
  areaPrefix: string
  createdAt: string
  helpText: string | null
  id: number
  isActive: boolean
  isArchived: boolean
  questionCode: string
  selectionType: RequirementSelectionType
  sortOrder: number
  text: string
  updatedAt: string
}

export interface SpecificationRequirementSelectionQuestionRow
  extends RequirementSelectionQuestionRow {
  savedAnswers: Array<{
    answerId: number
    isFilterActive: boolean
    selectedByDisplayName: string | null
    selectedByHsaId: string | null
    updatedAt: string
  }>
  selectedAnswerIds: number[]
}

export interface RequirementSelectionFilterResult {
  filterActive: boolean
  hasNoRequirementSelection: boolean
  requirementIds: number[]
}

export interface RequirementSelectionCleanupResult {
  affectedAnswerIds: number[]
  affectedRequirementIds: number[]
  removedLinkCount: number
}

export interface RequirementSelectionMatchedRequirementRow {
  description: string | null
  id: number
  uniqueId: string
}

interface QueryExecutor {
  query<T = unknown[]>(sql: string, parameters?: unknown[]): Promise<T>
}

type QuestionDbRow = {
  areaId: number
  areaName: string
  areaPrefix: string
  createdAt: Date | string
  helpText: string | null
  id: number
  isActive: boolean | number | string
  isArchived: boolean | number | string
  questionCode: string
  selectionType: RequirementSelectionType
  sortOrder: number
  text: string
  updatedAt: Date | string
}

type AnswerDbRow = {
  createdAt: Date | string
  description: string | null
  id: number
  isActive: boolean | number | string
  isArchived: boolean | number | string
  isNoRequirementSelection: boolean | number | string
  questionId: number
  sortOrder: number
  text: string
  updatedAt: Date | string
}

function uniquePositiveIntegers(
  values: readonly number[] | undefined,
): number[] {
  const out: number[] = []
  for (const value of values ?? []) {
    if (!Number.isInteger(value) || value < 1) {
      throw validationError('Expected positive integer ids', {
        reason: 'invalid_id',
      })
    }
    if (!out.includes(value)) out.push(value)
  }
  return out
}

function placeholders(values: readonly unknown[], offset = 0): string {
  return values.map((_, index) => `@${index + offset}`).join(', ')
}

function mapQuestionRow(row: QuestionDbRow): RequirementSelectionQuestionRow {
  return {
    answers: [],
    areaId: row.areaId,
    areaName: row.areaName,
    areaPrefix: row.areaPrefix,
    createdAt: toIsoString(row.createdAt),
    helpText: row.helpText,
    id: row.id,
    isActive: toBoolean(row.isActive),
    isArchived: toBoolean(row.isArchived),
    questionCode: row.questionCode,
    selectionType: row.selectionType,
    sortOrder: row.sortOrder,
    text: row.text,
    updatedAt: toIsoString(row.updatedAt),
  }
}

function mapAnswerRow(row: AnswerDbRow): RequirementSelectionAnswerRow {
  return {
    createdAt: toIsoString(row.createdAt),
    description: row.description,
    healthState: 'ok',
    id: row.id,
    isActive: toBoolean(row.isActive),
    isArchived: toBoolean(row.isArchived),
    isNoRequirementSelection: toBoolean(row.isNoRequirementSelection),
    matchingRequirementCount: 0,
    matchingRequirements: [],
    packageIds: [],
    questionId: row.questionId,
    requirementIds: [],
    sortOrder: row.sortOrder,
    text: row.text,
    updatedAt: toIsoString(row.updatedAt),
  }
}

async function listQuestionRows(
  executor: QueryExecutor,
  options: {
    activeOnly?: boolean
    areaId?: number
    includeArchived?: boolean
    includeSavedForSpecificationId?: number
  } = {},
): Promise<RequirementSelectionQuestionRow[]> {
  const params: unknown[] = []
  const conditions: string[] = []
  if (!options.includeArchived) {
    conditions.push('question.is_archived = 0')
  }
  if (options.activeOnly) {
    conditions.push('question.is_active = 1')
  }
  if (options.areaId != null) {
    params.push(options.areaId)
    conditions.push(`question.area_id = @${params.length - 1}`)
  }
  if (options.includeSavedForSpecificationId != null) {
    params.push(options.includeSavedForSpecificationId)
    conditions.push(`(
      (question.is_active = 1 AND question.is_archived = 0)
      OR EXISTS (
        SELECT 1
        FROM specification_requirement_selection_answers saved
        WHERE saved.question_id = question.id
          AND saved.specification_id = @${params.length - 1}
      )
    )`)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const rows = (await executor.query(
    `
      SELECT
        question.id AS id,
        question.question_code AS questionCode,
        question.area_id AS areaId,
        area.prefix AS areaPrefix,
        area.name AS areaName,
        question.selection_type AS selectionType,
        question.question_text AS text,
        question.help_text AS helpText,
        question.sort_order AS sortOrder,
        question.is_active AS isActive,
        question.is_archived AS isArchived,
        question.created_at AS createdAt,
        question.updated_at AS updatedAt
      FROM requirement_selection_questions AS question
      INNER JOIN requirement_areas AS area
        ON area.id = question.area_id
      ${where}
      ORDER BY area.name ASC, question.sort_order ASC, question.question_code ASC
    `,
    params,
  )) as QuestionDbRow[]
  return rows.map(mapQuestionRow)
}

async function hydrateAnswers(
  executor: QueryExecutor,
  questions: RequirementSelectionQuestionRow[],
  options: {
    activeOnly?: boolean
    includeSavedForSpecificationId?: number
  } = {},
): Promise<void> {
  const questionIds = questions.map(question => question.id)
  if (questionIds.length === 0) return

  const params: unknown[] = [...questionIds]
  const conditions = [`answer.question_id IN (${placeholders(questionIds)})`]
  if (options.activeOnly) {
    conditions.push('answer.is_active = 1')
    conditions.push('answer.is_archived = 0')
  }
  if (options.includeSavedForSpecificationId != null) {
    params.push(options.includeSavedForSpecificationId)
    conditions.push(`(
      (answer.is_active = 1 AND answer.is_archived = 0)
      OR EXISTS (
        SELECT 1
        FROM specification_requirement_selection_answers saved
        WHERE saved.answer_id = answer.id
          AND saved.specification_id = @${params.length - 1}
      )
    )`)
  }

  const answerRows = (await executor.query(
    `
      SELECT
        answer.id AS id,
        answer.question_id AS questionId,
        answer.answer_text AS text,
        answer.description AS description,
        answer.sort_order AS sortOrder,
        answer.is_no_requirement_selection AS isNoRequirementSelection,
        answer.is_active AS isActive,
        answer.is_archived AS isArchived,
        answer.created_at AS createdAt,
        answer.updated_at AS updatedAt
      FROM requirement_selection_answers AS answer
      WHERE ${conditions.join(' AND ')}
      ORDER BY answer.sort_order ASC, answer.answer_text ASC
    `,
    params,
  )) as AnswerDbRow[]
  const answers = answerRows.map(mapAnswerRow)
  const answersByQuestion = new Map<number, RequirementSelectionAnswerRow[]>()
  for (const answer of answers) {
    const bucket = answersByQuestion.get(answer.questionId) ?? []
    bucket.push(answer)
    answersByQuestion.set(answer.questionId, bucket)
  }

  const answerById = new Map(answers.map(answer => [answer.id, answer]))
  const answerIds = answers.map(answer => answer.id)
  if (answerIds.length > 0) {
    const packageRows = (await executor.query(
      `
        SELECT answer_id AS answerId, requirement_package_id AS packageId
        FROM requirement_selection_answer_packages
        WHERE answer_id IN (${placeholders(answerIds)})
        ORDER BY requirement_package_id ASC
      `,
      answerIds,
    )) as Array<{ answerId: number; packageId: number }>
    for (const row of packageRows) {
      answerById.get(row.answerId)?.packageIds.push(row.packageId)
    }

    const requirementRows = (await executor.query(
      `
        SELECT answer_id AS answerId, requirement_id AS requirementId
        FROM requirement_selection_answer_requirements
        WHERE answer_id IN (${placeholders(answerIds)})
        ORDER BY requirement_id ASC
      `,
      answerIds,
    )) as Array<{ answerId: number; requirementId: number }>
    for (const row of requirementRows) {
      answerById.get(row.answerId)?.requirementIds.push(row.requirementId)
    }

    await hydrateAnswerRequirementMatches(executor, answers)
  }

  for (const question of questions) {
    question.answers = answersByQuestion.get(question.id) ?? []
  }
}

async function hydrateAnswerRequirementMatches(
  executor: QueryExecutor,
  answers: RequirementSelectionAnswerRow[],
): Promise<void> {
  const answerIds = answers.map(answer => answer.id)
  if (answerIds.length === 0) return

  const firstAnswerPlaceholders = placeholders(answerIds)
  const secondAnswerOffset = answerIds.length
  const secondAnswerPlaceholders = placeholders(answerIds, secondAnswerOffset)
  const explicitStatusParam = answerIds.length * 2
  const packageStatusParam = explicitStatusParam + 1
  const descriptionStatusParam = packageStatusParam + 1
  const rows = (await executor.query(
    `
      SELECT DISTINCT
        source.answerId AS answerId,
        requirement.id AS id,
        requirement.unique_id AS uniqueId,
        published.description AS description
      FROM (
        SELECT
          answer_requirement.answer_id AS answerId,
          answer_requirement.requirement_id AS requirementId
        FROM requirement_selection_answer_requirements AS answer_requirement
        WHERE answer_requirement.answer_id IN (${firstAnswerPlaceholders})
          AND EXISTS (
            SELECT 1
            FROM requirement_versions AS explicit_version
            WHERE explicit_version.requirement_id = answer_requirement.requirement_id
              AND explicit_version.requirement_status_id = @${explicitStatusParam}
          )

        UNION

        SELECT
          answer_package.answer_id AS answerId,
          version.requirement_id AS requirementId
        FROM requirement_selection_answer_packages AS answer_package
        INNER JOIN requirement_version_requirement_packages AS version_package
          ON version_package.requirement_package_id = answer_package.requirement_package_id
        INNER JOIN requirement_versions AS version
          ON version.id = version_package.requirement_version_id
         AND version.requirement_status_id = @${packageStatusParam}
        WHERE answer_package.answer_id IN (${secondAnswerPlaceholders})
      ) AS source
      INNER JOIN requirements AS requirement
        ON requirement.id = source.requirementId
      OUTER APPLY (
        SELECT TOP (1) description
        FROM requirement_versions AS published_version
        WHERE published_version.requirement_id = requirement.id
          AND published_version.requirement_status_id = @${descriptionStatusParam}
        ORDER BY published_version.version_number DESC
      ) AS published
      ORDER BY source.answerId ASC, requirement.unique_id ASC
    `,
    [
      ...answerIds,
      ...answerIds,
      STATUS_PUBLISHED,
      STATUS_PUBLISHED,
      STATUS_PUBLISHED,
    ],
  )) as Array<RequirementSelectionMatchedRequirementRow & { answerId: number }>

  const byAnswer = new Map<
    number,
    RequirementSelectionMatchedRequirementRow[]
  >()
  for (const row of rows) {
    const bucket = byAnswer.get(row.answerId) ?? []
    bucket.push({
      description: row.description,
      id: row.id,
      uniqueId: row.uniqueId,
    })
    byAnswer.set(row.answerId, bucket)
  }

  for (const answer of answers) {
    answer.matchingRequirements = byAnswer.get(answer.id) ?? []
    answer.matchingRequirementCount = answer.matchingRequirements.length
    answer.healthState =
      !answer.isNoRequirementSelection &&
      answer.isActive &&
      !answer.isArchived &&
      answer.matchingRequirementCount === 0
        ? 'missing_requirement_selection'
        : 'ok'
  }
}

export async function listRequirementSelectionQuestions(
  db: SqlServerDatabase,
  options: { areaId?: number; includeArchived?: boolean } = {},
): Promise<RequirementSelectionQuestionRow[]> {
  const questions = await listQuestionRows(db, {
    areaId: options.areaId,
    includeArchived: options.includeArchived ?? true,
  })
  await hydrateAnswers(db, questions)
  return questions
}

export async function getRequirementSelectionQuestionById(
  db: SqlServerDatabase,
  id: number,
): Promise<RequirementSelectionQuestionRow | null> {
  const questions = await listQuestionRows(db, { includeArchived: true })
  const question = questions.find(item => item.id === id)
  if (!question) return null
  await hydrateAnswers(db, [question])
  return question
}

export async function resolveRequirementSelectionQuestionId(
  executor: QueryExecutor,
  idOrCode: number | string,
): Promise<number | null> {
  if (typeof idOrCode === 'number' || /^\d+$/.test(idOrCode)) {
    const id = Number(idOrCode)
    if (!Number.isInteger(id) || id < 1) return null
    const rows = (await executor.query(
      `
        SELECT id
        FROM requirement_selection_questions
        WHERE id = @0
      `,
      [id],
    )) as Array<{ id: number }>
    return rows[0]?.id ?? null
  }

  const rows = (await executor.query(
    `
      SELECT id
      FROM requirement_selection_questions
      WHERE question_code = @0
    `,
    [idOrCode],
  )) as Array<{ id: number }>
  return rows[0]?.id ?? null
}

export async function getRequirementSelectionQuestionByIdentifier(
  db: SqlServerDatabase,
  idOrCode: number | string,
): Promise<RequirementSelectionQuestionRow | null> {
  const id = await resolveRequirementSelectionQuestionId(db, idOrCode)
  return id == null ? null : getRequirementSelectionQuestionById(db, id)
}

async function areaPrefix(
  executor: QueryExecutor,
  areaId: number,
): Promise<string> {
  const rows = (await executor.query(
    `
      SELECT prefix
      FROM requirement_areas
      WHERE id = @0
    `,
    [areaId],
  )) as Array<{ prefix: string }>
  const prefix = rows[0]?.prefix
  if (!prefix) {
    throw validationError('Requirement area does not exist', {
      areaId,
      reason: 'unknown_area',
    })
  }
  return prefix
}

async function nextQuestionCode(
  executor: QueryExecutor,
  areaId: number,
): Promise<string> {
  const prefix = await areaPrefix(executor, areaId)
  const updated = (await executor.query(
    `
      UPDATE requirement_selection_question_sequences
      SET next_sequence = next_sequence + 1
      OUTPUT deleted.next_sequence AS sequence
      WHERE area_id = @0
    `,
    [areaId],
  )) as Array<{ sequence: number }>
  const sequence = updated[0]?.sequence ?? 1
  if (updated.length === 0) {
    await executor.query(
      `
        INSERT INTO requirement_selection_question_sequences (
          area_id,
          next_sequence
        ) VALUES (@0, 2)
      `,
      [areaId],
    )
  }
  return `${prefix}-KUF${String(sequence).padStart(3, '0')}`
}

export async function createRequirementSelectionQuestion(
  db: SqlServerDatabase,
  data: {
    areaId: number
    helpText?: string | null
    selectionType: RequirementSelectionType
    sortOrder?: number
    text: string
  },
): Promise<RequirementSelectionQuestionRow> {
  const createdId = await db.transaction('SERIALIZABLE', async manager => {
    const questionCode = await nextQuestionCode(manager, data.areaId)
    const now = new Date()
    const rows = (await manager.query(
      `
        INSERT INTO requirement_selection_questions (
          question_code,
          area_id,
          selection_type,
          question_text,
          help_text,
          sort_order,
          is_active,
          is_archived,
          created_at,
          updated_at
        )
        OUTPUT inserted.id AS id
        VALUES (@0, @1, @2, @3, @4, @5, 0, 0, @6, @6)
      `,
      [
        questionCode,
        data.areaId,
        data.selectionType,
        data.text,
        data.helpText ?? null,
        data.sortOrder ?? 0,
        now,
      ],
    )) as Array<{ id: number }>
    return rows[0].id
  })
  const question = await getRequirementSelectionQuestionById(db, createdId)
  if (!question)
    throw new Error('Created requirement selection question missing')
  return question
}

export async function updateRequirementSelectionQuestion(
  db: SqlServerDatabase,
  id: number,
  data: {
    helpText?: string | null
    selectionType?: RequirementSelectionType
    sortOrder?: number
    text?: string
  },
): Promise<RequirementSelectionQuestionRow | null> {
  const sets: string[] = []
  const params: unknown[] = []
  if (data.selectionType !== undefined) {
    params.push(data.selectionType)
    sets.push(`selection_type = @${params.length - 1}`)
  }
  if (data.text !== undefined) {
    params.push(data.text)
    sets.push(`question_text = @${params.length - 1}`)
  }
  if (data.helpText !== undefined) {
    params.push(data.helpText)
    sets.push(`help_text = @${params.length - 1}`)
  }
  if (data.sortOrder !== undefined) {
    params.push(data.sortOrder)
    sets.push(`sort_order = @${params.length - 1}`)
  }
  params.push(new Date())
  sets.push(`updated_at = @${params.length - 1}`)
  params.push(id)
  const rows = (await db.query(
    `
      UPDATE requirement_selection_questions
      SET ${sets.join(', ')}
      OUTPUT inserted.id AS id
      WHERE id = @${params.length - 1}
    `,
    params,
  )) as Array<{ id: number }>
  if (rows.length === 0) return null
  return getRequirementSelectionQuestionById(db, id)
}

async function markQuestionSelectionsHistorical(
  executor: QueryExecutor,
  questionId: number,
): Promise<void> {
  await executor.query(
    `
      UPDATE specification_requirement_selection_answers
      SET is_filter_active = 0,
          changed_at = @1
      WHERE question_id = @0
        AND is_filter_active = 1
    `,
    [questionId, new Date()],
  )
}

async function markAnswerSelectionsHistorical(
  executor: QueryExecutor,
  answerId: number,
): Promise<void> {
  await executor.query(
    `
      UPDATE specification_requirement_selection_answers
      SET is_filter_active = 0,
          changed_at = @1
      WHERE answer_id = @0
        AND is_filter_active = 1
    `,
    [answerId, new Date()],
  )
}

async function assertQuestionCanActivate(
  executor: QueryExecutor,
  questionId: number,
): Promise<void> {
  const rows = (await executor.query(
    `
      SELECT COUNT(1) AS activeAnswerCount
      FROM requirement_selection_answers
      WHERE question_id = @0
        AND is_active = 1
        AND is_archived = 0
    `,
    [questionId],
  )) as Array<{ activeAnswerCount: number }>
  if (Number(rows[0]?.activeAnswerCount ?? 0) < 1) {
    throw validationError('Question needs at least one active answer', {
      questionId,
      reason: 'no_active_answers',
    })
  }
}

export async function setRequirementSelectionQuestionState(
  db: SqlServerDatabase,
  id: number,
  operation: 'activate' | 'archive' | 'deactivate' | 'reactivate',
): Promise<RequirementSelectionQuestionRow | null> {
  await db.transaction(async manager => {
    if (operation === 'activate') {
      await assertQuestionCanActivate(manager, id)
    }
    if (operation === 'reactivate') {
      await assertQuestionCanActivate(manager, id)
    }
    if (operation === 'deactivate' || operation === 'archive') {
      await markQuestionSelectionsHistorical(manager, id)
    }
    const activeValue =
      operation === 'activate' || operation === 'reactivate' ? 1 : 0
    const archivedValue = operation === 'archive' ? 1 : 0
    await manager.query(
      `
        UPDATE requirement_selection_questions
        SET is_active = @0,
            is_archived = @1,
            updated_at = @2
        WHERE id = @3
      `,
      [activeValue, archivedValue, new Date(), id],
    )
  })
  return getRequirementSelectionQuestionById(db, id)
}

async function assertPackageIdsActive(
  executor: QueryExecutor,
  packageIds: readonly number[],
): Promise<void> {
  if (packageIds.length === 0) return
  const rows = (await executor.query(
    `
      SELECT id
      FROM requirement_packages
      WHERE id IN (${placeholders(packageIds)})
        AND is_archived = 0
    `,
    [...packageIds],
  )) as Array<{ id: number }>
  const found = new Set(rows.map(row => row.id))
  const missing = packageIds.filter(id => !found.has(id))
  if (missing.length > 0) {
    throw validationError(
      'Requirement package links must reference active packages',
      {
        packageIds: missing,
        reason: 'invalid_requirement_package_links',
      },
    )
  }
}

async function assertRequirementIdsPublished(
  executor: QueryExecutor,
  requirementIds: readonly number[],
): Promise<void> {
  if (requirementIds.length === 0) return
  const rows = (await executor.query(
    `
      SELECT DISTINCT requirement_id AS id
      FROM requirement_versions
      WHERE requirement_id IN (${placeholders(requirementIds)})
        AND requirement_status_id = @${requirementIds.length}
    `,
    [...requirementIds, STATUS_PUBLISHED],
  )) as Array<{ id: number }>
  const found = new Set(rows.map(row => row.id))
  const missing = requirementIds.filter(id => !found.has(id))
  if (missing.length > 0) {
    throw validationError(
      'Requirement links must reference published requirements',
      {
        reason: 'invalid_requirement_links',
        requirementIds: missing,
      },
    )
  }
}

async function replaceAnswerLinks(
  executor: QueryExecutor,
  answerId: number,
  data: {
    isNoRequirementSelection: boolean
    packageIds?: number[]
    requirementIds?: number[]
  },
): Promise<void> {
  const packageIds = uniquePositiveIntegers(data.packageIds)
  const requirementIds = uniquePositiveIntegers(data.requirementIds)
  if (
    data.isNoRequirementSelection &&
    (packageIds.length > 0 || requirementIds.length > 0)
  ) {
    throw validationError(
      'No-requirement-selection answers cannot have links',
      {
        reason: 'no_selection_answer_has_links',
      },
    )
  }
  await assertPackageIdsActive(executor, packageIds)
  await assertRequirementIdsPublished(executor, requirementIds)
  await executor.query(
    'DELETE FROM requirement_selection_answer_packages WHERE answer_id = @0',
    [answerId],
  )
  await executor.query(
    'DELETE FROM requirement_selection_answer_requirements WHERE answer_id = @0',
    [answerId],
  )
  for (const packageId of packageIds) {
    await executor.query(
      `
        INSERT INTO requirement_selection_answer_packages (
          answer_id,
          requirement_package_id
        ) VALUES (@0, @1)
      `,
      [answerId, packageId],
    )
  }
  for (const requirementId of requirementIds) {
    await executor.query(
      `
        INSERT INTO requirement_selection_answer_requirements (
          answer_id,
          requirement_id
        ) VALUES (@0, @1)
      `,
      [answerId, requirementId],
    )
  }
}

export async function createRequirementSelectionAnswer(
  db: SqlServerDatabase,
  questionId: number,
  data: {
    description?: string | null
    isNoRequirementSelection?: boolean
    packageIds?: number[]
    requirementIds?: number[]
    sortOrder?: number
    text: string
  },
): Promise<RequirementSelectionQuestionRow | null> {
  await db.transaction(async manager => {
    const now = new Date()
    const rows = (await manager.query(
      `
        INSERT INTO requirement_selection_answers (
          question_id,
          answer_text,
          description,
          sort_order,
          is_no_requirement_selection,
          is_active,
          is_archived,
          created_at,
          updated_at
        )
        OUTPUT inserted.id AS id
        VALUES (@0, @1, @2, @3, @4, 1, 0, @5, @5)
      `,
      [
        questionId,
        data.text,
        data.description ?? null,
        data.sortOrder ?? 0,
        data.isNoRequirementSelection ? 1 : 0,
        now,
      ],
    )) as Array<{ id: number }>
    await replaceAnswerLinks(manager, rows[0].id, {
      isNoRequirementSelection: data.isNoRequirementSelection ?? false,
      packageIds: data.packageIds,
      requirementIds: data.requirementIds,
    })
  })
  return getRequirementSelectionQuestionById(db, questionId)
}

export async function updateRequirementSelectionAnswer(
  db: SqlServerDatabase,
  questionId: number,
  answerId: number,
  data: {
    description?: string | null
    isNoRequirementSelection?: boolean
    packageIds?: number[]
    requirementIds?: number[]
    sortOrder?: number
    text?: string
  },
): Promise<RequirementSelectionQuestionRow | null> {
  await db.transaction(async manager => {
    const existingRows = (await manager.query(
      `
        SELECT is_no_requirement_selection AS isNoRequirementSelection
        FROM requirement_selection_answers
        WHERE id = @0 AND question_id = @1
      `,
      [answerId, questionId],
    )) as Array<{ isNoRequirementSelection: boolean | number | string }>
    if (existingRows.length === 0) return
    const sets: string[] = []
    const params: unknown[] = []
    if (data.text !== undefined) {
      params.push(data.text)
      sets.push(`answer_text = @${params.length - 1}`)
    }
    if (data.description !== undefined) {
      params.push(data.description)
      sets.push(`description = @${params.length - 1}`)
    }
    if (data.sortOrder !== undefined) {
      params.push(data.sortOrder)
      sets.push(`sort_order = @${params.length - 1}`)
    }
    if (data.isNoRequirementSelection !== undefined) {
      params.push(data.isNoRequirementSelection ? 1 : 0)
      sets.push(`is_no_requirement_selection = @${params.length - 1}`)
    }
    params.push(new Date())
    sets.push(`updated_at = @${params.length - 1}`)
    params.push(answerId, questionId)
    await manager.query(
      `
        UPDATE requirement_selection_answers
        SET ${sets.join(', ')}
        WHERE id = @${params.length - 2}
          AND question_id = @${params.length - 1}
      `,
      params,
    )
    const nextIsNoRequirementSelection =
      data.isNoRequirementSelection ??
      toBoolean(existingRows[0].isNoRequirementSelection)
    if (
      data.packageIds !== undefined ||
      data.requirementIds !== undefined ||
      data.isNoRequirementSelection !== undefined
    ) {
      await replaceAnswerLinks(manager, answerId, {
        isNoRequirementSelection: nextIsNoRequirementSelection,
        packageIds: data.packageIds,
        requirementIds: data.requirementIds,
      })
      await markAnswerSelectionsHistorical(manager, answerId)
    }
  })
  return getRequirementSelectionQuestionById(db, questionId)
}

async function assertAnswerStateChangeKeepsActiveQuestionUsable(
  executor: QueryExecutor,
  questionId: number,
  answerId: number,
): Promise<void> {
  const rows = (await executor.query(
    `
      SELECT
        question.is_active AS questionIsActive,
        (
          SELECT COUNT(1)
          FROM requirement_selection_answers other_answer
          WHERE other_answer.question_id = question.id
            AND other_answer.id <> @1
            AND other_answer.is_active = 1
            AND other_answer.is_archived = 0
        ) AS remainingActiveAnswerCount
      FROM requirement_selection_questions question
      WHERE question.id = @0
    `,
    [questionId, answerId],
  )) as Array<{
    questionIsActive: boolean | number | string
    remainingActiveAnswerCount: number
  }>
  const row = rows[0]
  if (
    row &&
    toBoolean(row.questionIsActive) &&
    Number(row.remainingActiveAnswerCount) < 1
  ) {
    throw validationError(
      'Active questions must keep at least one active answer',
      {
        answerId,
        questionId,
        reason: 'last_active_answer',
      },
    )
  }
}

export async function setRequirementSelectionAnswerState(
  db: SqlServerDatabase,
  questionId: number,
  answerId: number,
  operation: 'activate' | 'archive' | 'deactivate' | 'reactivate',
): Promise<RequirementSelectionQuestionRow | null> {
  await db.transaction(async manager => {
    if (operation === 'deactivate' || operation === 'archive') {
      await assertAnswerStateChangeKeepsActiveQuestionUsable(
        manager,
        questionId,
        answerId,
      )
      await markAnswerSelectionsHistorical(manager, answerId)
    }
    const activeValue =
      operation === 'activate' || operation === 'reactivate' ? 1 : 0
    const archivedValue = operation === 'archive' ? 1 : 0
    await manager.query(
      `
        UPDATE requirement_selection_answers
        SET is_active = @0,
            is_archived = @1,
            updated_at = @2
        WHERE id = @3
          AND question_id = @4
      `,
      [activeValue, archivedValue, new Date(), answerId, questionId],
    )
  })
  return getRequirementSelectionQuestionById(db, questionId)
}

export async function deleteRequirementSelectionAnswer(
  db: SqlServerDatabase,
  questionId: number,
  answerId: number,
): Promise<'deleted' | 'in_use' | 'not_found'> {
  return db.transaction(async manager => {
    const saved = (await manager.query(
      `
        SELECT TOP 1 1 AS found
        FROM specification_requirement_selection_answers
        WHERE answer_id = @0
      `,
      [answerId],
    )) as Array<{ found: number }>
    if (saved.length > 0) return 'in_use'
    await manager.query(
      'DELETE FROM requirement_selection_answer_packages WHERE answer_id = @0',
      [answerId],
    )
    await manager.query(
      'DELETE FROM requirement_selection_answer_requirements WHERE answer_id = @0',
      [answerId],
    )
    const rows = (await manager.query(
      `
        DELETE FROM requirement_selection_answers
        OUTPUT deleted.id AS id
        WHERE id = @0
          AND question_id = @1
      `,
      [answerId, questionId],
    )) as Array<{ id: number }>
    return rows.length > 0 ? 'deleted' : 'not_found'
  })
}

export async function deleteRequirementSelectionQuestion(
  db: SqlServerDatabase,
  id: number,
): Promise<'deleted' | 'in_use' | 'not_found'> {
  return db.transaction(async manager => {
    const saved = (await manager.query(
      `
        SELECT TOP 1 1 AS found
        FROM specification_requirement_selection_answers
        WHERE question_id = @0
      `,
      [id],
    )) as Array<{ found: number }>
    if (saved.length > 0) return 'in_use'
    const answerRows = (await manager.query(
      `
        SELECT id
        FROM requirement_selection_answers
        WHERE question_id = @0
      `,
      [id],
    )) as Array<{ id: number }>
    const answerIds = answerRows.map(row => row.id)
    if (answerIds.length > 0) {
      await manager.query(
        `DELETE FROM requirement_selection_answer_packages WHERE answer_id IN (${placeholders(answerIds)})`,
        answerIds,
      )
      await manager.query(
        `DELETE FROM requirement_selection_answer_requirements WHERE answer_id IN (${placeholders(answerIds)})`,
        answerIds,
      )
      await manager.query(
        `DELETE FROM requirement_selection_answers WHERE question_id = @0`,
        [id],
      )
    }
    const rows = (await manager.query(
      `
        DELETE FROM requirement_selection_questions
        OUTPUT deleted.id AS id
        WHERE id = @0
      `,
      [id],
    )) as Array<{ id: number }>
    return rows.length > 0 ? 'deleted' : 'not_found'
  })
}

export async function duplicateRequirementSelectionQuestion(
  db: SqlServerDatabase,
  id: number,
): Promise<RequirementSelectionQuestionRow | null> {
  return db.transaction('SERIALIZABLE', async manager => {
    const source = await getQuestionWithExecutor(manager, id)
    if (!source) return null
    const questionCode = await nextQuestionCode(manager, source.areaId)
    const now = new Date()
    const createdRows = (await manager.query(
      `
        INSERT INTO requirement_selection_questions (
          question_code,
          area_id,
          selection_type,
          question_text,
          help_text,
          sort_order,
          is_active,
          is_archived,
          created_at,
          updated_at
        )
        OUTPUT inserted.id AS id
        VALUES (@0, @1, @2, @3, @4, @5, 0, 0, @6, @6)
      `,
      [
        questionCode,
        source.areaId,
        source.selectionType,
        `${source.text} (kopia)`,
        source.helpText,
        source.sortOrder,
        now,
      ],
    )) as Array<{ id: number }>
    const duplicateId = createdRows[0].id
    for (const answer of source.answers.filter(
      item => item.isActive && !item.isArchived,
    )) {
      const answerRows = (await manager.query(
        `
          INSERT INTO requirement_selection_answers (
            question_id,
            answer_text,
            description,
            sort_order,
            is_no_requirement_selection,
            is_active,
            is_archived,
            created_at,
            updated_at
          )
          OUTPUT inserted.id AS id
          VALUES (@0, @1, @2, @3, @4, @5, 0, @6, @6)
        `,
        [
          duplicateId,
          answer.text,
          answer.description,
          answer.sortOrder,
          answer.isNoRequirementSelection ? 1 : 0,
          answer.isActive ? 1 : 0,
          now,
        ],
      )) as Array<{ id: number }>
      await replaceAnswerLinks(manager, answerRows[0].id, {
        isNoRequirementSelection: answer.isNoRequirementSelection,
        packageIds: answer.packageIds,
        requirementIds: answer.requirementIds,
      })
    }
    return getQuestionWithExecutor(manager, duplicateId)
  })
}

async function getQuestionWithExecutor(
  executor: QueryExecutor,
  id: number,
): Promise<RequirementSelectionQuestionRow | null> {
  const questions = await listQuestionRows(executor, { includeArchived: true })
  const question = questions.find(item => item.id === id)
  if (!question) return null
  await hydrateAnswers(executor, [question])
  return question
}

export async function resolveSpecificationId(
  db: SqlServerDatabase,
  idOrSlug: string,
): Promise<number | null> {
  if (/^\d+$/.test(idOrSlug)) {
    return (await getSpecificationById(db, Number(idOrSlug)))?.id ?? null
  }
  return (await getSpecificationBySlug(db, idOrSlug))?.id ?? null
}

export async function listSpecificationRequirementSelectionQuestions(
  db: SqlServerDatabase,
  specificationId: number,
): Promise<SpecificationRequirementSelectionQuestionRow[]> {
  const questions = (await listQuestionRows(db, {
    includeArchived: true,
    includeSavedForSpecificationId: specificationId,
  })) as SpecificationRequirementSelectionQuestionRow[]
  await hydrateAnswers(db, questions, {
    includeSavedForSpecificationId: specificationId,
  })
  const savedRows = (await db.query(
    `
      SELECT
        answer_id AS answerId,
        question_id AS questionId,
        is_filter_active AS isFilterActive,
        changed_by_hsa_id AS selectedByHsaId,
        changed_by_display_name AS selectedByDisplayName,
        changed_at AS updatedAt
      FROM specification_requirement_selection_answers
      WHERE specification_id = @0
      ORDER BY question_id ASC, answer_id ASC
    `,
    [specificationId],
  )) as Array<{
    answerId: number
    isFilterActive: boolean | number | string
    questionId: number
    selectedByDisplayName: string | null
    selectedByHsaId: string | null
    updatedAt: Date | string
  }>
  const savedByQuestion = new Map<
    number,
    SpecificationRequirementSelectionQuestionRow['savedAnswers']
  >()
  for (const row of savedRows) {
    const bucket = savedByQuestion.get(row.questionId) ?? []
    bucket.push({
      answerId: row.answerId,
      isFilterActive: toBoolean(row.isFilterActive),
      selectedByDisplayName: row.selectedByDisplayName,
      selectedByHsaId: row.selectedByHsaId,
      updatedAt: toIsoString(row.updatedAt),
    })
    savedByQuestion.set(row.questionId, bucket)
  }
  for (const question of questions) {
    question.savedAnswers = savedByQuestion.get(question.id) ?? []
    question.selectedAnswerIds = question.savedAnswers
      .filter(answer => answer.isFilterActive)
      .map(answer => answer.answerId)
  }
  const existingRequirementIds = new Set(
    await getExistingSpecificationRequirementIds(db, specificationId),
  )
  for (const answer of questions.flatMap(question => question.answers)) {
    answer.alreadyAddedRequirementCount = answer.matchingRequirements.filter(
      requirement => existingRequirementIds.has(requirement.id),
    ).length
  }
  return questions
}

export async function replaceSpecificationRequirementSelectionAnswers(
  db: SqlServerDatabase,
  specificationId: number,
  questionId: number,
  answerIdsInput: number[],
  actor: { displayName: string; hsaId: string | null },
): Promise<SpecificationRequirementSelectionQuestionRow[]> {
  const answerIds = uniquePositiveIntegers(answerIdsInput)
  await db.transaction(async manager => {
    const questionRows = (await manager.query(
      `
        SELECT selection_type AS selectionType
        FROM requirement_selection_questions
        WHERE id = @0
          AND is_active = 1
          AND is_archived = 0
      `,
      [questionId],
    )) as Array<{ selectionType: RequirementSelectionType }>
    const question = questionRows[0]
    if (!question && answerIds.length > 0) {
      throw validationError('Question is not active', {
        questionId,
        reason: 'inactive_question',
      })
    }
    if (question?.selectionType === 'single' && answerIds.length > 1) {
      throw validationError('Single-choice questions accept one answer', {
        questionId,
        reason: 'single_choice_multiple_answers',
      })
    }
    if (answerIds.length > 0) {
      const answerRows = (await manager.query(
        `
          SELECT id, is_no_requirement_selection AS isNoRequirementSelection
          FROM requirement_selection_answers
          WHERE question_id = @0
            AND id IN (${placeholders(answerIds, 1)})
            AND is_active = 1
            AND is_archived = 0
        `,
        [questionId, ...answerIds],
      )) as Array<{
        id: number
        isNoRequirementSelection: boolean | number | string
      }>
      if (answerRows.length !== answerIds.length) {
        throw validationError(
          'All saved answers must be active answers on the question',
          {
            answerIds,
            questionId,
            reason: 'invalid_saved_answers',
          },
        )
      }
      const noSelectionCount = answerRows.filter(row =>
        toBoolean(row.isNoRequirementSelection),
      ).length
      if (noSelectionCount > 0 && answerIds.length > 1) {
        throw validationError(
          'No-requirement-selection answers are exclusive',
          {
            questionId,
            reason: 'no_selection_exclusive',
          },
        )
      }
    }
    await manager.query(
      `
        DELETE FROM specification_requirement_selection_answers
        WHERE specification_id = @0
          AND question_id = @1
      `,
      [specificationId, questionId],
    )
    const now = new Date()
    for (const answerId of answerIds) {
      await manager.query(
        `
          INSERT INTO specification_requirement_selection_answers (
            specification_id,
            question_id,
            answer_id,
            is_filter_active,
            changed_at,
            changed_by_hsa_id,
            changed_by_display_name
          ) VALUES (@0, @1, @2, 1, @3, @4, @5)
        `,
        [
          specificationId,
          questionId,
          answerId,
          now,
          actor.hsaId,
          actor.displayName,
        ],
      )
    }
  })
  return listSpecificationRequirementSelectionQuestions(db, specificationId)
}

export async function getRequirementSelectionFilterForSpecification(
  db: SqlServerDatabase,
  specificationId: number,
): Promise<RequirementSelectionFilterResult> {
  const rows = (await db.query(
    `
      SELECT
        answer.id AS answerId,
        answer.is_no_requirement_selection AS isNoRequirementSelection
      FROM specification_requirement_selection_answers saved
      INNER JOIN requirement_selection_questions question
        ON question.id = saved.question_id
       AND question.is_active = 1
       AND question.is_archived = 0
      INNER JOIN requirement_selection_answers answer
        ON answer.id = saved.answer_id
       AND answer.is_active = 1
       AND answer.is_archived = 0
      WHERE saved.specification_id = @0
        AND saved.is_filter_active = 1
    `,
    [specificationId],
  )) as Array<{
    answerId: number
    isNoRequirementSelection: boolean | number | string
  }>
  if (rows.length === 0) {
    return {
      filterActive: false,
      hasNoRequirementSelection: false,
      requirementIds: [],
    }
  }
  const hasNoRequirementSelection = rows.some(row =>
    toBoolean(row.isNoRequirementSelection),
  )
  const answerIds = rows
    .filter(row => !toBoolean(row.isNoRequirementSelection))
    .map(row => row.answerId)
  if (answerIds.length === 0) {
    return {
      filterActive: false,
      hasNoRequirementSelection,
      requirementIds: [],
    }
  }
  const requirementRows = (await db.query(
    `
      SELECT DISTINCT answer_requirement.requirement_id AS requirementId
      FROM requirement_selection_answer_requirements AS answer_requirement
      WHERE answer_requirement.answer_id IN (${placeholders(answerIds)})
        AND EXISTS (
          SELECT 1
          FROM requirement_versions AS explicit_version
          WHERE explicit_version.requirement_id = answer_requirement.requirement_id
            AND explicit_version.requirement_status_id = @${answerIds.length}
        )

      UNION

      SELECT DISTINCT versions.requirement_id AS requirementId
      FROM requirement_selection_answer_packages answer_package
      INNER JOIN requirement_version_requirement_packages version_package
        ON version_package.requirement_package_id = answer_package.requirement_package_id
      INNER JOIN requirement_versions versions
        ON versions.id = version_package.requirement_version_id
       AND versions.requirement_status_id = @${answerIds.length}
      WHERE answer_package.answer_id IN (${placeholders(answerIds)})
    `,
    [...answerIds, STATUS_PUBLISHED],
  )) as Array<{ requirementId: number }>
  return {
    filterActive: true,
    hasNoRequirementSelection,
    requirementIds: requirementRows.map(row => row.requirementId),
  }
}

export async function getExistingSpecificationRequirementIds(
  db: SqlServerDatabase,
  specificationId: number,
): Promise<number[]> {
  const rows = (await db.query(
    `
      SELECT DISTINCT version.requirement_id AS requirementId
      FROM requirements_specification_items item
      INNER JOIN requirement_versions version
        ON version.id = item.requirement_version_id
      WHERE item.requirements_specification_id = @0
        AND item.requirement_version_id IS NOT NULL
    `,
    [specificationId],
  )) as Array<{ requirementId: number }>
  return rows.map(row => row.requirementId)
}

function emptyCleanupResult(): RequirementSelectionCleanupResult {
  return {
    affectedAnswerIds: [],
    affectedRequirementIds: [],
    removedLinkCount: 0,
  }
}

function cleanupResult(
  rows: Array<{ answerId: number; requirementId?: number | null }>,
): RequirementSelectionCleanupResult {
  return {
    affectedAnswerIds: Array.from(new Set(rows.map(row => row.answerId))).sort(
      (a, b) => a - b,
    ),
    affectedRequirementIds: Array.from(
      new Set(
        rows
          .map(row => row.requirementId)
          .filter((id): id is number => typeof id === 'number'),
      ),
    ).sort((a, b) => a - b),
    removedLinkCount: rows.length,
  }
}

export async function cleanupRequirementSelectionPackageLinks(
  executor: QueryExecutor,
  packageIdsInput: readonly number[],
): Promise<RequirementSelectionCleanupResult> {
  const packageIds = uniquePositiveIntegers(packageIdsInput)
  if (packageIds.length === 0) return emptyCleanupResult()
  const rows = (await executor.query(
    `
      DELETE answer_package
      OUTPUT
        deleted.answer_id AS answerId,
        NULL AS requirementId
      FROM requirement_selection_answer_packages AS answer_package
      WHERE answer_package.requirement_package_id IN (${placeholders(packageIds)})
    `,
    packageIds,
  )) as Array<{ answerId: number; requirementId: null }>
  return cleanupResult(rows)
}

export async function cleanupRequirementSelectionRequirementLinksWithoutPublishedVersion(
  executor: QueryExecutor,
  requirementIdsInput?: readonly number[],
): Promise<RequirementSelectionCleanupResult> {
  const requirementIds =
    requirementIdsInput === undefined
      ? undefined
      : uniquePositiveIntegers(requirementIdsInput)
  if (requirementIds !== undefined && requirementIds.length === 0) {
    return emptyCleanupResult()
  }
  const params: unknown[] = []
  const conditions = [
    `NOT EXISTS (
      SELECT 1
      FROM requirement_versions AS version
      WHERE version.requirement_id = answer_requirement.requirement_id
        AND version.requirement_status_id = @0
    )`,
  ]
  params.push(STATUS_PUBLISHED)
  if (requirementIds !== undefined) {
    conditions.push(
      `answer_requirement.requirement_id IN (${placeholders(
        requirementIds,
        params.length,
      )})`,
    )
    params.push(...requirementIds)
  }
  const rows = (await executor.query(
    `
      DELETE answer_requirement
      OUTPUT
        deleted.answer_id AS answerId,
        deleted.requirement_id AS requirementId
      FROM requirement_selection_answer_requirements AS answer_requirement
      WHERE ${conditions.join(' AND ')}
    `,
    params,
  )) as Array<{ answerId: number; requirementId: number }>
  return cleanupResult(rows)
}

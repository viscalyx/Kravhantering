import {
  getSpecificationById,
  getSpecificationBySlug,
} from '@/lib/dal/requirements-specifications'
import type { SqlServerDatabase } from '@/lib/db'
import { conflictError, validationError } from '@/lib/requirements/errors'
import { STATUS_PUBLISHED } from '@/lib/requirements/status-constants.mjs'
import { toBoolean, toIsoString } from '@/lib/typeorm/value-mappers'

export type RequirementSelectionType = 'multiple' | 'single'

export interface RequirementSelectionAnswerRow {
  alreadyAddedRequirementCount?: number
  archivedAt: string | null
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

export interface RequirementSelectionVisibilityConditionRow {
  answerId: number
  answerIsActive: boolean
  answerIsArchived: boolean
  answerText: string
  id: number
  parentAreaName: string
  parentQuestionCode: string
  parentQuestionId: number
  parentQuestionIsActive: boolean
  parentQuestionIsArchived: boolean
  parentQuestionText: string
}

export interface RequirementSelectionVisibilityGroupRow {
  conditions: RequirementSelectionVisibilityConditionRow[]
  id: number
  sortOrder: number
}

export interface RequirementSelectionVisibilityInputGroup {
  conditions: Array<{
    answerIds: number[]
    parentQuestionId: number
  }>
}

export interface HiddenRequirementSelectionImpactRow {
  answerTexts: string[]
  questionCode: string
  questionId: number
  questionText: string
}

export interface RequirementSelectionQuestionRow {
  answers: RequirementSelectionAnswerRow[]
  archivedAt: string | null
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
  visibilityGroups: RequirementSelectionVisibilityGroupRow[]
}

export interface SpecificationRequirementSelectionQuestionRow
  extends RequirementSelectionQuestionRow {
  isVisible: boolean
  savedAnswers: Array<{
    answerId: number
    isHistorical: boolean
    selectedByDisplayName: string | null
    selectedByHsaId: string | null
    updatedAt: string
  }>
  selectedAnswerIds: number[]
  visibilityState: 'hidden' | 'hidden_with_historical_answers' | 'visible'
}

export interface RequirementSelectionFilterResult {
  hasCurrentAnswers: boolean
  hasNoRequirementSelection: boolean
  hasRequirementSelection: boolean
  requirementIds: number[]
}

export interface RequirementSelectionCleanupResult {
  affectedAnswerIds: number[]
  affectedRequirementIds: number[]
  removedLinkCount: number
}

export interface RequirementSelectionMatchedRequirementSourcePackage {
  id: number
  name: string
}

export interface RequirementSelectionMatchedRequirementRow {
  description: string | null
  direct: boolean
  id: number
  sourcePackages: RequirementSelectionMatchedRequirementSourcePackage[]
  uniqueId: string
}

interface QueryExecutor {
  query<T = unknown[]>(sql: string, parameters?: unknown[]): Promise<T>
}

type QuestionDbRow = {
  areaId: number
  areaName: string
  areaPrefix: string
  archivedAt: Date | string | null
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
  archivedAt: Date | string | null
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

type VisibilityConditionDbRow = {
  answerId: number
  answerIsActive: boolean | number | string
  answerIsArchived: boolean | number | string
  answerText: string
  groupId: number
  id: number
  parentAreaName: string
  parentQuestionCode: string
  parentQuestionId: number
  parentQuestionIsActive: boolean | number | string
  parentQuestionIsArchived: boolean | number | string
  parentQuestionText: string
  questionId: number
  sortOrder: number
}

type MatchedRequirementSourceDbRow = {
  description: string | null
  id: number
  isDirect: boolean | number | string
  packageId: number | null
  packageName: string | null
  uniqueId: string
}

type AnswerMatchedRequirementSourceDbRow = MatchedRequirementSourceDbRow & {
  answerId: number
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
    archivedAt: row.archivedAt == null ? null : toIsoString(row.archivedAt),
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
    visibilityGroups: [],
  }
}

function mapAnswerRow(row: AnswerDbRow): RequirementSelectionAnswerRow {
  return {
    archivedAt: row.archivedAt == null ? null : toIsoString(row.archivedAt),
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
        question.archived_at AS archivedAt,
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

async function hydrateVisibilityGroups(
  executor: QueryExecutor,
  questions: RequirementSelectionQuestionRow[],
): Promise<void> {
  const questionIds = questions.map(question => question.id)
  if (questionIds.length === 0) return

  const rows = (await executor.query(
    `
      SELECT
        visibility_group.question_id AS questionId,
        visibility_group.id AS groupId,
        visibility_group.sort_order AS sortOrder,
        condition.id AS id,
        condition.parent_question_id AS parentQuestionId,
        parent_question.question_code AS parentQuestionCode,
        parent_question.question_text AS parentQuestionText,
        parent_question.is_active AS parentQuestionIsActive,
        parent_question.is_archived AS parentQuestionIsArchived,
        parent_area.name AS parentAreaName,
        condition.answer_id AS answerId,
        answer.answer_text AS answerText,
        answer.is_active AS answerIsActive,
        answer.is_archived AS answerIsArchived
      FROM requirement_selection_question_visibility_groups AS visibility_group
      INNER JOIN requirement_selection_question_visibility_conditions AS condition
        ON condition.visibility_group_id = visibility_group.id
      INNER JOIN requirement_selection_questions AS parent_question
        ON parent_question.id = condition.parent_question_id
      INNER JOIN requirement_areas AS parent_area
        ON parent_area.id = parent_question.area_id
      INNER JOIN requirement_selection_answers AS answer
        ON answer.id = condition.answer_id
      WHERE visibility_group.question_id IN (${placeholders(questionIds)})
      ORDER BY
        visibility_group.question_id ASC,
        visibility_group.sort_order ASC,
        visibility_group.id ASC,
        condition.sort_order ASC,
        condition.id ASC
    `,
    questionIds,
  )) as VisibilityConditionDbRow[]

  const groupsByQuestion = new Map<
    number,
    RequirementSelectionVisibilityGroupRow[]
  >()
  const groupById = new Map<number, RequirementSelectionVisibilityGroupRow>()
  for (const row of rows) {
    const group =
      groupById.get(row.groupId) ??
      ({
        conditions: [],
        id: row.groupId,
        sortOrder: row.sortOrder,
      } satisfies RequirementSelectionVisibilityGroupRow)
    group.conditions.push({
      answerId: row.answerId,
      answerIsActive: toBoolean(row.answerIsActive),
      answerIsArchived: toBoolean(row.answerIsArchived),
      answerText: row.answerText,
      id: row.id,
      parentAreaName: row.parentAreaName,
      parentQuestionCode: row.parentQuestionCode,
      parentQuestionId: row.parentQuestionId,
      parentQuestionIsActive: toBoolean(row.parentQuestionIsActive),
      parentQuestionIsArchived: toBoolean(row.parentQuestionIsArchived),
      parentQuestionText: row.parentQuestionText,
    })
    groupById.set(row.groupId, group)
    if (!groupsByQuestion.get(row.questionId)?.some(item => item === group)) {
      const bucket = groupsByQuestion.get(row.questionId) ?? []
      bucket.push(group)
      groupsByQuestion.set(row.questionId, bucket)
    }
  }

  for (const question of questions) {
    question.visibilityGroups = groupsByQuestion.get(question.id) ?? []
  }
}

function selectedAnswersByQuestion(
  questions: SpecificationRequirementSelectionQuestionRow[],
): Map<number, Set<number>> {
  const selected = new Map<number, Set<number>>()
  for (const question of questions) {
    selected.set(question.id, new Set(question.selectedAnswerIds))
  }
  return selected
}

function computeVisibleQuestionIds(
  questions: RequirementSelectionQuestionRow[],
  selectedAnswerIdsByQuestion: Map<number, Set<number>>,
): Set<number> {
  const questionsById = new Map(
    questions.map(question => [question.id, question]),
  )
  const memo = new Map<number, boolean>()
  const visiting = new Set<number>()

  const groupMatches = (
    group: RequirementSelectionVisibilityGroupRow,
  ): boolean => {
    const allowedAnswersByParent = new Map<number, Set<number>>()
    for (const condition of group.conditions) {
      if (
        !condition.parentQuestionIsActive ||
        condition.parentQuestionIsArchived ||
        !condition.answerIsActive ||
        condition.answerIsArchived
      ) {
        continue
      }
      const bucket =
        allowedAnswersByParent.get(condition.parentQuestionId) ?? new Set()
      bucket.add(condition.answerId)
      allowedAnswersByParent.set(condition.parentQuestionId, bucket)
    }
    if (allowedAnswersByParent.size === 0) return false

    for (const [parentQuestionId, allowedAnswerIds] of allowedAnswersByParent) {
      if (!isVisible(parentQuestionId)) return false
      const selectedAnswers = selectedAnswerIdsByQuestion.get(parentQuestionId)
      if (!selectedAnswers) return false
      if (
        !Array.from(allowedAnswerIds).some(answerId =>
          selectedAnswers.has(answerId),
        )
      ) {
        return false
      }
    }
    return true
  }

  const isVisible = (questionId: number): boolean => {
    const cached = memo.get(questionId)
    if (cached !== undefined) return cached
    const question = questionsById.get(questionId)
    if (!question?.isActive || question.isArchived) {
      memo.set(questionId, false)
      return false
    }
    if (question.visibilityGroups.length === 0) {
      memo.set(questionId, true)
      return true
    }
    if (visiting.has(questionId)) {
      memo.set(questionId, false)
      return false
    }

    visiting.add(questionId)
    const visible = question.visibilityGroups.some(groupMatches)
    visiting.delete(questionId)
    memo.set(questionId, visible)
    return visible
  }

  return new Set(
    questions
      .filter(question => isVisible(question.id))
      .map(question => question.id),
  )
}

function mergeMatchedRequirementSourceRow(
  requirementsById: Map<number, RequirementSelectionMatchedRequirementRow>,
  row: MatchedRequirementSourceDbRow,
) {
  const existing = requirementsById.get(row.id)
  const requirement =
    existing ??
    ({
      description: row.description,
      direct: false,
      id: row.id,
      sourcePackages: [],
      uniqueId: row.uniqueId,
    } satisfies RequirementSelectionMatchedRequirementRow)

  if (toBoolean(row.isDirect)) {
    requirement.direct = true
  }

  if (
    row.packageId != null &&
    row.packageName != null &&
    !requirement.sourcePackages.some(pkg => pkg.id === row.packageId)
  ) {
    requirement.sourcePackages.push({
      id: row.packageId,
      name: row.packageName,
    })
  }

  requirementsById.set(row.id, requirement)
}

function sortMatchedRequirements(
  rows: RequirementSelectionMatchedRequirementRow[],
) {
  return rows.sort((left, right) =>
    left.uniqueId.localeCompare(right.uniqueId, 'sv'),
  )
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
        answer.archived_at AS archivedAt,
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
        published.description AS description,
        source.isDirect AS isDirect,
        source.packageId AS packageId,
        source.packageName AS packageName
      FROM (
        SELECT
          answer_requirement.answer_id AS answerId,
          answer_requirement.requirement_id AS requirementId,
          CAST(1 AS bit) AS isDirect,
          CAST(NULL AS int) AS packageId,
          CAST(NULL AS nvarchar(max)) AS packageName
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
          version.requirement_id AS requirementId,
          CAST(0 AS bit) AS isDirect,
          requirement_package.id AS packageId,
          requirement_package.name AS packageName
        FROM requirement_selection_answer_packages AS answer_package
        INNER JOIN requirement_packages AS requirement_package
          ON requirement_package.id = answer_package.requirement_package_id
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
  )) as AnswerMatchedRequirementSourceDbRow[]

  const byAnswer = new Map<
    number,
    Map<number, RequirementSelectionMatchedRequirementRow>
  >()
  for (const row of rows) {
    const bucket = byAnswer.get(row.answerId) ?? new Map()
    mergeMatchedRequirementSourceRow(bucket, row)
    byAnswer.set(row.answerId, bucket)
  }

  for (const answer of answers) {
    answer.matchingRequirements = sortMatchedRequirements([
      ...(byAnswer.get(answer.id)?.values() ?? []),
    ])
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

export async function listRequirementSelectionMatchedRequirements(
  executor: QueryExecutor,
  options: {
    packageIds?: readonly number[]
    requirementIds?: readonly number[]
  } = {},
): Promise<RequirementSelectionMatchedRequirementRow[]> {
  const requirementIds = uniquePositiveIntegers(options.requirementIds)
  const packageIds = uniquePositiveIntegers(options.packageIds)
  if (requirementIds.length === 0 && packageIds.length === 0) return []

  const params: unknown[] = []
  const sources: string[] = []

  if (requirementIds.length > 0) {
    const requirementPlaceholders = placeholders(requirementIds, params.length)
    params.push(...requirementIds)
    const statusParam = params.length
    params.push(STATUS_PUBLISHED)
    sources.push(`
      SELECT
        explicit_requirement.id AS requirementId,
        CAST(1 AS bit) AS isDirect,
        CAST(NULL AS int) AS packageId,
        CAST(NULL AS nvarchar(max)) AS packageName
      FROM requirements AS explicit_requirement
      WHERE explicit_requirement.id IN (${requirementPlaceholders})
        AND EXISTS (
          SELECT 1
          FROM requirement_versions AS explicit_version
          WHERE explicit_version.requirement_id = explicit_requirement.id
            AND explicit_version.requirement_status_id = @${statusParam}
        )
    `)
  }

  if (packageIds.length > 0) {
    const packagePlaceholders = placeholders(packageIds, params.length)
    params.push(...packageIds)
    const statusParam = params.length
    params.push(STATUS_PUBLISHED)
    sources.push(`
      SELECT
        package_version.requirement_id AS requirementId,
        CAST(0 AS bit) AS isDirect,
        requirement_package.id AS packageId,
        requirement_package.name AS packageName
      FROM requirement_version_requirement_packages AS version_package
      INNER JOIN requirement_packages AS requirement_package
        ON requirement_package.id = version_package.requirement_package_id
      INNER JOIN requirement_versions AS package_version
        ON package_version.id = version_package.requirement_version_id
       AND package_version.requirement_status_id = @${statusParam}
      WHERE version_package.requirement_package_id IN (${packagePlaceholders})
    `)
  }

  const descriptionStatusParam = params.length
  params.push(STATUS_PUBLISHED)

  const rows = (await executor.query(
    `
      SELECT
        requirement.id AS id,
        requirement.unique_id AS uniqueId,
        published.description AS description,
        source.isDirect AS isDirect,
        source.packageId AS packageId,
        source.packageName AS packageName
      FROM (
        ${sources.join('\n        UNION ALL\n')}
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
      ORDER BY requirement.unique_id ASC
    `,
    params,
  )) as MatchedRequirementSourceDbRow[]

  const requirementsById = new Map<
    number,
    RequirementSelectionMatchedRequirementRow
  >()
  for (const row of rows) {
    mergeMatchedRequirementSourceRow(requirementsById, row)
  }
  return sortMatchedRequirements([...requirementsById.values()])
}

export async function listRequirementSelectionQuestions(
  db: SqlServerDatabase,
  options: { areaId?: number; includeArchived?: boolean } = {},
): Promise<RequirementSelectionQuestionRow[]> {
  const questions = await listQuestionRows(db, {
    areaId: options.areaId,
    includeArchived: options.includeArchived ?? true,
  })
  await hydrateVisibilityGroups(db, questions)
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
  await hydrateVisibilityGroups(db, [question])
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
      SET is_historical = 1,
          changed_at = @1
      WHERE question_id = @0
        AND is_historical = 0
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
      SET is_historical = 1,
          changed_at = @1
      WHERE answer_id = @0
        AND is_historical = 0
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
    const now = new Date()
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
    const archivedAt = operation === 'archive' ? now : null
    await manager.query(
      `
        UPDATE requirement_selection_questions
        SET is_active = @0,
            is_archived = @1,
            archived_at = @2,
            updated_at = @3
        WHERE id = @4
      `,
      [activeValue, archivedValue, archivedAt, now, id],
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
    const now = new Date()
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
    const archivedAt = operation === 'archive' ? now : null
    await manager.query(
      `
        UPDATE requirement_selection_answers
        SET is_active = @0,
            is_archived = @1,
            archived_at = @2,
            updated_at = @3
        WHERE id = @4
          AND question_id = @5
      `,
      [activeValue, archivedValue, archivedAt, now, answerId, questionId],
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
  await hydrateVisibilityGroups(executor, [question])
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

async function loadSpecificationRequirementSelectionQuestionsForVisibility(
  executor: QueryExecutor,
  specificationId: number,
): Promise<SpecificationRequirementSelectionQuestionRow[]> {
  const questions = (await listQuestionRows(executor, {
    includeArchived: true,
    includeSavedForSpecificationId: specificationId,
  })) as SpecificationRequirementSelectionQuestionRow[]
  await hydrateVisibilityGroups(executor, questions)
  await hydrateAnswers(executor, questions, {
    includeSavedForSpecificationId: specificationId,
  })
  const savedRows = (await executor.query(
    `
      SELECT
        answer_id AS answerId,
        question_id AS questionId,
        is_historical AS isHistorical,
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
    isHistorical: boolean | number | string
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
      isHistorical: toBoolean(row.isHistorical),
      selectedByDisplayName: row.selectedByDisplayName,
      selectedByHsaId: row.selectedByHsaId,
      updatedAt: toIsoString(row.updatedAt),
    })
    savedByQuestion.set(row.questionId, bucket)
  }
  for (const question of questions) {
    question.savedAnswers = savedByQuestion.get(question.id) ?? []
    question.selectedAnswerIds = question.savedAnswers
      .filter(answer => !answer.isHistorical)
      .map(answer => answer.answerId)
  }
  const visibleQuestionIds = computeVisibleQuestionIds(
    questions,
    selectedAnswersByQuestion(questions),
  )
  for (const question of questions) {
    question.isVisible = visibleQuestionIds.has(question.id)
    question.visibilityState = question.isVisible
      ? 'visible'
      : question.savedAnswers.some(answer => answer.isHistorical)
        ? 'hidden_with_historical_answers'
        : 'hidden'
  }
  return questions
}

export async function listSpecificationRequirementSelectionQuestions(
  db: SqlServerDatabase,
  specificationId: number,
): Promise<SpecificationRequirementSelectionQuestionRow[]> {
  const questions =
    await loadSpecificationRequirementSelectionQuestionsForVisibility(
      db,
      specificationId,
    )
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

type NormalizedVisibilityGroup = Array<{
  answerIds: number[]
  parentQuestionId: number
}>

function normalizeVisibilityGroups(
  questionId: number,
  groupsInput: RequirementSelectionVisibilityInputGroup[],
): NormalizedVisibilityGroup[] {
  return groupsInput.map((group, groupIndex) => {
    if (group.conditions.length === 0) {
      throw validationError('Visibility groups need at least one condition', {
        groupIndex,
        reason: 'empty_visibility_group',
      })
    }
    const byParentQuestion = new Map<number, Set<number>>()
    for (const condition of group.conditions) {
      const parentQuestionId = condition.parentQuestionId
      if (!Number.isInteger(parentQuestionId) || parentQuestionId < 1) {
        throw validationError(
          'Visibility parent question IDs must be positive',
          {
            groupIndex,
            reason: 'invalid_visibility_parent_question',
          },
        )
      }
      if (parentQuestionId === questionId) {
        throw validationError('A question cannot depend on itself', {
          groupIndex,
          questionId,
          reason: 'self_visibility_dependency',
        })
      }
      const answerIds = uniquePositiveIntegers(condition.answerIds)
      if (answerIds.length === 0) {
        throw validationError(
          'Visibility conditions need at least one answer',
          {
            groupIndex,
            parentQuestionId,
            reason: 'empty_visibility_condition_answers',
          },
        )
      }
      const bucket = byParentQuestion.get(parentQuestionId) ?? new Set()
      for (const answerId of answerIds) bucket.add(answerId)
      byParentQuestion.set(parentQuestionId, bucket)
    }
    return [...byParentQuestion].map(([parentQuestionId, answerIds]) => ({
      answerIds: [...answerIds].sort((left, right) => left - right),
      parentQuestionId,
    }))
  })
}

async function assertVisibilityAnswersBelongToParents(
  executor: QueryExecutor,
  groups: NormalizedVisibilityGroup[],
): Promise<void> {
  const answerIds = Array.from(
    new Set(groups.flatMap(group => group.flatMap(item => item.answerIds))),
  )
  if (answerIds.length === 0) return

  const rows = (await executor.query(
    `
      SELECT id, question_id AS questionId
      FROM requirement_selection_answers
      WHERE id IN (${placeholders(answerIds)})
    `,
    answerIds,
  )) as Array<{ id: number; questionId: number }>
  const answerQuestionById = new Map(rows.map(row => [row.id, row.questionId]))
  const missing = answerIds.filter(
    answerId => !answerQuestionById.has(answerId),
  )
  if (missing.length > 0) {
    throw validationError('Visibility answers must exist', {
      answerIds: missing,
      reason: 'unknown_visibility_answer',
    })
  }
  for (const group of groups) {
    for (const condition of group) {
      const invalidAnswerIds = condition.answerIds.filter(
        answerId =>
          answerQuestionById.get(answerId) !== condition.parentQuestionId,
      )
      if (invalidAnswerIds.length > 0) {
        throw validationError(
          'Visibility answers must belong to their parent question',
          {
            answerIds: invalidAnswerIds,
            parentQuestionId: condition.parentQuestionId,
            reason: 'visibility_answer_parent_mismatch',
          },
        )
      }
    }
  }
}

async function assertNoVisibilityCycle(
  executor: QueryExecutor,
  questionId: number,
  groups: NormalizedVisibilityGroup[],
): Promise<void> {
  const rows = (await executor.query(
    `
      SELECT
        visibility_group.question_id AS childQuestionId,
        condition.parent_question_id AS parentQuestionId
      FROM requirement_selection_question_visibility_groups AS visibility_group
      INNER JOIN requirement_selection_question_visibility_conditions AS condition
        ON condition.visibility_group_id = visibility_group.id
      WHERE visibility_group.question_id <> @0
    `,
    [questionId],
  )) as Array<{ childQuestionId: number; parentQuestionId: number }>

  const parentsByChild = new Map<number, Set<number>>()
  for (const row of rows) {
    const bucket = parentsByChild.get(row.childQuestionId) ?? new Set()
    bucket.add(row.parentQuestionId)
    parentsByChild.set(row.childQuestionId, bucket)
  }
  const replacementParents = new Set(
    groups.flatMap(group => group.map(condition => condition.parentQuestionId)),
  )
  parentsByChild.set(questionId, replacementParents)

  const reachesQuestion = (startQuestionId: number): boolean => {
    const visited = new Set<number>()
    const stack = [startQuestionId]
    while (stack.length > 0) {
      const current = stack.pop()
      if (!current || visited.has(current)) continue
      if (current === questionId) return true
      visited.add(current)
      for (const parent of parentsByChild.get(current) ?? []) {
        stack.push(parent)
      }
    }
    return false
  }

  for (const parentQuestionId of replacementParents) {
    if (reachesQuestion(parentQuestionId)) {
      throw validationError('Visibility conditions cannot create cycles', {
        parentQuestionId,
        questionId,
        reason: 'visibility_cycle',
      })
    }
  }
}

async function listVisibilityAffectedQuestionIds(
  executor: QueryExecutor,
  questionId: number,
): Promise<number[]> {
  const rows = (await executor.query(
    `
      WITH visibility_descendants AS (
        SELECT
          visibility_group.question_id AS questionId,
          CAST(0 AS int) AS depth
        FROM requirement_selection_question_visibility_groups AS visibility_group
        INNER JOIN requirement_selection_question_visibility_conditions AS condition
          ON condition.visibility_group_id = visibility_group.id
        WHERE condition.parent_question_id = @0

        UNION ALL

        SELECT
          visibility_group.question_id AS questionId,
          descendant.depth + 1 AS depth
        FROM requirement_selection_question_visibility_groups AS visibility_group
        INNER JOIN requirement_selection_question_visibility_conditions AS condition
          ON condition.visibility_group_id = visibility_group.id
        INNER JOIN visibility_descendants AS descendant
          ON descendant.questionId = condition.parent_question_id
        WHERE descendant.depth < 100
      )
      SELECT DISTINCT affected.questionId
      FROM (
        SELECT @0 AS questionId

        UNION ALL

        SELECT questionId
        FROM visibility_descendants
      ) AS affected
      ORDER BY affected.questionId ASC
    `,
    [questionId],
  )) as Array<{ questionId: number }>
  return rows.map(row => row.questionId)
}

async function markHiddenSelectionsHistoricalForAffectedQuestions(
  executor: QueryExecutor,
  affectedQuestionIds: number[],
): Promise<number> {
  if (affectedQuestionIds.length === 0) return 0
  const specificationRows = (await executor.query(
    `
      SELECT DISTINCT specification_id AS specificationId
      FROM specification_requirement_selection_answers
      WHERE question_id IN (${placeholders(affectedQuestionIds)})
        AND is_historical = 0
      ORDER BY specification_id ASC
    `,
    affectedQuestionIds,
  )) as Array<{ specificationId: number }>
  const affectedQuestionIdSet = new Set(affectedQuestionIds)
  let changedCount = 0
  for (const row of specificationRows) {
    const questions =
      await loadSpecificationRequirementSelectionQuestionsForVisibility(
        executor,
        row.specificationId,
      )
    const hiddenQuestionIds = questions
      .filter(
        question =>
          affectedQuestionIdSet.has(question.id) &&
          !question.isVisible &&
          question.selectedAnswerIds.length > 0,
      )
      .map(question => question.id)
    if (hiddenQuestionIds.length === 0) continue
    const updatedRows = (await executor.query(
      `
        UPDATE specification_requirement_selection_answers
        SET is_historical = 1,
            changed_at = @${hiddenQuestionIds.length + 1}
        OUTPUT inserted.question_id AS questionId
        WHERE specification_id = @0
          AND question_id IN (${placeholders(hiddenQuestionIds, 1)})
          AND is_historical = 0
      `,
      [row.specificationId, ...hiddenQuestionIds, new Date()],
    )) as Array<{ questionId: number }>
    changedCount += updatedRows.length
  }
  return changedCount
}

export async function replaceRequirementSelectionQuestionVisibilityGroups(
  db: SqlServerDatabase,
  questionId: number,
  groupsInput: RequirementSelectionVisibilityInputGroup[],
): Promise<RequirementSelectionQuestionRow | null> {
  await db.transaction(async manager => {
    const questionRows = (await manager.query(
      `
        SELECT id
        FROM requirement_selection_questions
        WHERE id = @0
      `,
      [questionId],
    )) as Array<{ id: number }>
    if (questionRows.length === 0) return

    const groups = normalizeVisibilityGroups(questionId, groupsInput)
    await assertVisibilityAnswersBelongToParents(manager, groups)
    await assertNoVisibilityCycle(manager, questionId, groups)

    await manager.query(
      `
        DELETE FROM requirement_selection_question_visibility_groups
        WHERE question_id = @0
      `,
      [questionId],
    )
    const now = new Date()
    for (const [groupIndex, group] of groups.entries()) {
      const groupRows = (await manager.query(
        `
          INSERT INTO requirement_selection_question_visibility_groups (
            question_id,
            sort_order,
            created_at,
            updated_at
          )
          OUTPUT inserted.id AS id
          VALUES (@0, @1, @2, @2)
        `,
        [questionId, groupIndex, now],
      )) as Array<{ id: number }>
      const groupId = groupRows[0]?.id
      if (!groupId) continue
      let sortOrder = 0
      for (const condition of group) {
        for (const answerId of condition.answerIds) {
          await manager.query(
            `
              INSERT INTO requirement_selection_question_visibility_conditions (
                visibility_group_id,
                parent_question_id,
                answer_id,
                sort_order,
                created_at,
                updated_at
              ) VALUES (@0, @1, @2, @3, @4, @4)
            `,
            [groupId, condition.parentQuestionId, answerId, sortOrder, now],
          )
          sortOrder += 1
        }
      }
    }

    await markHiddenSelectionsHistoricalForAffectedQuestions(
      manager,
      await listVisibilityAffectedQuestionIds(manager, questionId),
    )
  })
  return getRequirementSelectionQuestionById(db, questionId)
}

function hiddenCurrentSelectionImpact(
  questions: SpecificationRequirementSelectionQuestionRow[],
  changedQuestionId: number,
  nextAnswerIds: number[],
): HiddenRequirementSelectionImpactRow[] {
  const selectedByQuestion = selectedAnswersByQuestion(questions)
  if (nextAnswerIds.length > 0) {
    selectedByQuestion.set(changedQuestionId, new Set(nextAnswerIds))
  } else {
    selectedByQuestion.delete(changedQuestionId)
  }
  const visibleQuestionIds = computeVisibleQuestionIds(
    questions,
    selectedByQuestion,
  )
  const answerTextById = new Map(
    questions
      .flatMap(question => question.answers)
      .map(answer => [answer.id, answer.text]),
  )

  return questions
    .filter(question => {
      const selectedAnswerIds = selectedByQuestion.get(question.id)
      return (
        selectedAnswerIds != null &&
        selectedAnswerIds.size > 0 &&
        !visibleQuestionIds.has(question.id)
      )
    })
    .map(question => ({
      answerTexts: Array.from(selectedByQuestion.get(question.id) ?? [])
        .map(answerId => answerTextById.get(answerId) ?? String(answerId))
        .sort((left, right) => left.localeCompare(right, 'sv')),
      questionCode: question.questionCode,
      questionId: question.id,
      questionText: question.text,
    }))
}

function assertNoHiddenSelectionImpact(
  impact: HiddenRequirementSelectionImpactRow[],
): void {
  if (impact.length === 0) return
  throw conflictError(
    'Changing this answer hides answered follow-up questions',
    {
      hiddenSelections: impact,
      reason: 'hidden_selection_clear_required',
    },
  )
}

export async function replaceSpecificationRequirementSelectionAnswers(
  db: SqlServerDatabase,
  specificationId: number,
  questionId: number,
  answerIdsInput: number[],
  actor: { displayName: string; hsaId: string | null },
  options: { confirmHiddenAnswerClear?: boolean } = {},
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
    const questionsBeforeChange =
      await loadSpecificationRequirementSelectionQuestionsForVisibility(
        manager,
        specificationId,
      )
    const impact = hiddenCurrentSelectionImpact(
      questionsBeforeChange,
      questionId,
      answerIds,
    )
    if (!options.confirmHiddenAnswerClear) {
      assertNoHiddenSelectionImpact(impact)
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
            is_historical,
            changed_at,
            changed_by_hsa_id,
            changed_by_display_name
          ) VALUES (@0, @1, @2, 0, @3, @4, @5)
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
    if (impact.length > 0) {
      const hiddenQuestionIds = impact.map(item => item.questionId)
      await manager.query(
        `
          UPDATE specification_requirement_selection_answers
          SET is_historical = 1,
              changed_at = @${hiddenQuestionIds.length + 1},
              changed_by_hsa_id = @${hiddenQuestionIds.length + 2},
              changed_by_display_name = @${hiddenQuestionIds.length + 3}
          WHERE specification_id = @0
            AND question_id IN (${placeholders(hiddenQuestionIds, 1)})
            AND is_historical = 0
        `,
        [
          specificationId,
          ...hiddenQuestionIds,
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
  const questions =
    await loadSpecificationRequirementSelectionQuestionsForVisibility(
      db,
      specificationId,
    )
  const answerById = new Map(
    questions
      .flatMap(question => question.answers)
      .filter(answer => answer.isActive && !answer.isArchived)
      .map(answer => [answer.id, answer]),
  )
  const rows = questions
    .filter(
      question =>
        question.isVisible && question.isActive && !question.isArchived,
    )
    .flatMap(question =>
      question.selectedAnswerIds
        .map(answerId => answerById.get(answerId))
        .filter((answer): answer is RequirementSelectionAnswerRow =>
          Boolean(answer),
        )
        .map(answer => ({
          answerId: answer.id,
          isNoRequirementSelection: answer.isNoRequirementSelection,
        })),
    )
  if (rows.length === 0) {
    return {
      hasCurrentAnswers: false,
      hasRequirementSelection: false,
      hasNoRequirementSelection: false,
      requirementIds: [],
    }
  }
  const hasNoRequirementSelection = rows.some(
    row => row.isNoRequirementSelection,
  )
  const answerIds = rows
    .filter(row => !row.isNoRequirementSelection)
    .map(row => row.answerId)
  if (answerIds.length === 0) {
    return {
      hasCurrentAnswers: true,
      hasRequirementSelection: false,
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
    hasCurrentAnswers: true,
    hasRequirementSelection: true,
    hasNoRequirementSelection,
    requirementIds: requirementRows.map(row => row.requirementId),
  }
}

export async function getExistingSpecificationRequirementIds(
  db: QueryExecutor,
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

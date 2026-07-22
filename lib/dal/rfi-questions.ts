import type { SqlServerDatabase } from '@/lib/db'
import {
  conflictError,
  internalError,
  notFoundError,
  validationError,
} from '@/lib/requirements/errors'
import { toBoolean, toIsoString } from '@/lib/typeorm/value-mappers'

export type RfiRelevance = 'not_relevant' | 'relevant'

export const RFI_SUGGESTION_RESOLVED = 1
export const RFI_SUGGESTION_DISMISSED = 2

export interface SqlExecutor {
  query<T = unknown[]>(sql: string, parameters?: unknown[]): Promise<T>
}

export interface ActorSnapshot {
  displayName: string
  hsaId: string
}

export interface RfiQuestionSuggestionCreateData {
  areaId: number
  content: string
  rfiQuestionId?: number | null
  specificationId?: number | null
}

export interface RfiQuestionSuggestionResolutionData {
  resolution: typeof RFI_SUGGESTION_RESOLVED | typeof RFI_SUGGESTION_DISMISSED
  resolutionMotivation: string
}

export interface RfiQuestionSuggestionMutationTarget {
  areaId: number
  id: number
  rfiQuestionId: number | null
  specificationId: number | null
}

export interface RfiQuestionVersionLinks {
  requirementIds: number[]
  requirementPackageIds: number[]
  requirementSelectionQuestionIds: number[]
}

export interface RfiQuestionRow extends RfiQuestionVersionLinks {
  archivedAt: string | null
  areaId: number
  areaName: string
  areaPrefix: string
  createdAt: string
  expectedAnswerFormat: string | null
  helpText: string | null
  id: number
  isArchived: boolean
  questionCode: string
  questionText: string | null
  sortOrder: number
  updatedAt: string
  versionId: number | null
  versionNumber: number | null
}

export interface SpecificationRfiQuestionItemRow
  extends RfiQuestionVersionLinks {
  areaId: number
  areaName: string
  areaPrefix: string
  expectedAnswerFormat: string | null
  helpText: string | null
  isIncluded: boolean
  isVersionStale: boolean
  questionCode: string
  questionId: number
  questionText: string
  relevance: RfiRelevance | null
  sortOrder: number
  versionId: number
  versionNumber: number
}

export interface SpecificationRfiListRow {
  isLocked: boolean
  items: SpecificationRfiQuestionItemRow[]
  lockedAt: string | null
  lockedByDisplayName: string | null
  lockedByHsaId: string | null
  specificationId: number
}

export interface RfiQuestionSuggestionRow {
  areaId: number
  areaName: string
  content: string
  createdAt: string
  createdByDisplayName: string | null
  createdByHsaId: string | null
  id: number
  isReviewRequested: boolean
  questionCode: string | null
  resolution: number | null
  resolutionMotivation: string | null
  resolvedAt: string | null
  resolvedByDisplayName: string | null
  resolvedByHsaId: string | null
  reviewRequestedAt: string | null
  rfiQuestionId: number | null
  sourceSpecificationCode: string | null
  sourceSpecificationName: string | null
  specificationId: number | null
  updatedAt: string | null
}

type RfiQuestionDbRow = {
  areaId: number
  areaName: string
  areaPrefix: string
  archivedAt: Date | string | null
  createdAt: Date | string
  expectedAnswerFormat: string | null
  helpText: string | null
  id: number
  isArchived: boolean | number | string
  questionCode: string
  questionText: string | null
  sortOrder: number
  updatedAt: Date | string
  versionId: number | null
  versionNumber: number | null
}

type SpecificationRfiQuestionItemDbRow = {
  areaId: number
  areaName: string
  areaPrefix: string
  expectedAnswerFormat: string | null
  helpText: string | null
  isIncluded: boolean | number | string
  isVersionStale: boolean | number | string
  questionCode: string
  questionId: number
  questionText: string
  relevance: RfiRelevance | null
  sortOrder: number
  versionId: number
  versionNumber: number
}

type RfiQuestionSuggestionDbRow = {
  areaId: number
  areaName: string
  content: string
  createdAt: Date | string
  createdByDisplayName: string | null
  createdByHsaId: string | null
  id: number
  isReviewRequested: boolean | number | string
  questionCode: string | null
  resolution: number | null
  resolutionMotivation: string | null
  resolvedAt: Date | string | null
  resolvedByDisplayName: string | null
  resolvedByHsaId: string | null
  reviewRequestedAt: Date | string | null
  rfiQuestionId: number | null
  sourceSpecificationName: string | null
  sourceSpecificationCode: string | null
  specificationId: number | null
  updatedAt: Date | string | null
}

type RfiQuestionSuggestionStateDbRow = {
  areaId: number
  id: number
  isReviewRequested: boolean | number | string
  resolution: number | null
  reviewRequestedAt: Date | string | null
  rfiQuestionId: number | null
  specificationId: number | null
}

interface SqlSelection {
  parameters: unknown[]
  sql: string
}

interface RfiQuestionSelectionOptions {
  areaId?: number
  includeArchived?: boolean
  questionId?: number
}

function placeholders(values: readonly unknown[], offset = 0): string {
  return values.map((_, index) => `@${index + offset}`).join(', ')
}

function buildRfiQuestionSelection(
  options: RfiQuestionSelectionOptions = {},
): SqlSelection {
  const parameters: unknown[] = []
  const conditions: string[] = []
  if (options.questionId != null) {
    parameters.push(options.questionId)
    conditions.push(`question.id = @${parameters.length - 1}`)
  }
  if (options.areaId != null) {
    parameters.push(options.areaId)
    conditions.push(`question.area_id = @${parameters.length - 1}`)
  }
  if (!options.includeArchived) {
    conditions.push('question.is_archived = 0')
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  return {
    parameters,
    sql: `
      WITH selected_questions AS (
        SELECT question.id AS questionId, active_version.id AS versionId
        FROM rfi_questions AS question
        OUTER APPLY (
          SELECT TOP (1) version_record.id
          FROM rfi_question_versions AS version_record
          WHERE version_record.rfi_question_id = question.id
            AND version_record.is_active = 1
          ORDER BY version_record.version_number DESC
        ) AS active_version
        ${where}
      ),
      selected_versions AS (
        SELECT versionId
        FROM selected_questions
        WHERE versionId IS NOT NULL
      )
    `,
  }
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

function nullableTrimmed(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function mapRfiQuestionRow(row: RfiQuestionDbRow): RfiQuestionRow {
  return {
    areaId: row.areaId,
    areaName: row.areaName,
    areaPrefix: row.areaPrefix,
    archivedAt: row.archivedAt == null ? null : toIsoString(row.archivedAt),
    createdAt: toIsoString(row.createdAt),
    expectedAnswerFormat: row.expectedAnswerFormat,
    helpText: row.helpText,
    id: row.id,
    isArchived: toBoolean(row.isArchived),
    questionCode: row.questionCode,
    questionText: row.questionText,
    requirementIds: [],
    requirementPackageIds: [],
    requirementSelectionQuestionIds: [],
    sortOrder: row.sortOrder,
    updatedAt: toIsoString(row.updatedAt),
    versionId: row.versionId,
    versionNumber: row.versionNumber,
  }
}

function mapSpecificationRfiQuestionItemRow(
  row: SpecificationRfiQuestionItemDbRow,
): SpecificationRfiQuestionItemRow {
  return {
    areaId: row.areaId,
    areaName: row.areaName,
    areaPrefix: row.areaPrefix,
    expectedAnswerFormat: row.expectedAnswerFormat,
    helpText: row.helpText,
    isIncluded: toBoolean(row.isIncluded),
    isVersionStale: toBoolean(row.isVersionStale),
    questionCode: row.questionCode,
    questionId: row.questionId,
    questionText: row.questionText,
    relevance: row.relevance,
    requirementIds: [],
    requirementPackageIds: [],
    requirementSelectionQuestionIds: [],
    sortOrder: row.sortOrder,
    versionId: row.versionId,
    versionNumber: row.versionNumber,
  }
}

function mapRfiQuestionSuggestionRow(
  row: RfiQuestionSuggestionDbRow,
): RfiQuestionSuggestionRow {
  return {
    areaId: row.areaId,
    areaName: row.areaName,
    content: row.content,
    createdAt: toIsoString(row.createdAt),
    createdByDisplayName: row.createdByDisplayName,
    createdByHsaId: row.createdByHsaId,
    id: row.id,
    isReviewRequested: toBoolean(row.isReviewRequested),
    questionCode: row.questionCode,
    resolution: row.resolution,
    resolutionMotivation: row.resolutionMotivation,
    resolvedAt: row.resolvedAt == null ? null : toIsoString(row.resolvedAt),
    resolvedByDisplayName: row.resolvedByDisplayName,
    resolvedByHsaId: row.resolvedByHsaId,
    reviewRequestedAt:
      row.reviewRequestedAt == null ? null : toIsoString(row.reviewRequestedAt),
    rfiQuestionId: row.rfiQuestionId,
    sourceSpecificationName: row.sourceSpecificationName,
    sourceSpecificationCode: row.sourceSpecificationCode,
    specificationId: row.specificationId,
    updatedAt: row.updatedAt == null ? null : toIsoString(row.updatedAt),
  }
}

async function hydrateVersionLinks<T extends { versionId: number | null }>(
  executor: SqlExecutor,
  rows: T[],
  selection: SqlSelection,
): Promise<void> {
  if (!rows.some(row => row.versionId != null)) return

  const byVersion = new Map<number, T & RfiQuestionVersionLinks>()
  for (const row of rows) {
    if (row.versionId != null) {
      byVersion.set(row.versionId, row as T & RfiQuestionVersionLinks)
    }
  }

  const linkRows = await executor.query<
    Array<{
      id: number
      relationKind: 'package' | 'requirement' | 'selection_question'
      versionId: number
    }>
  >(
    `
      ${selection.sql}
      SELECT links.versionId, links.relationKind, links.id
      FROM (
        SELECT
          selection_link.rfi_question_version_id AS versionId,
          CAST(N'selection_question' AS nvarchar(30)) AS relationKind,
          selection_link.requirement_selection_question_id AS id
        FROM selected_versions
        INNER JOIN rfi_question_version_requirement_selection_questions AS selection_link
          ON selection_link.rfi_question_version_id = selected_versions.versionId

        UNION ALL

        SELECT
          package_link.rfi_question_version_id AS versionId,
          CAST(N'package' AS nvarchar(30)) AS relationKind,
          package_link.requirement_package_id AS id
        FROM selected_versions
        INNER JOIN rfi_question_version_requirement_packages AS package_link
          ON package_link.rfi_question_version_id = selected_versions.versionId

        UNION ALL

        SELECT
          requirement_link.rfi_question_version_id AS versionId,
          CAST(N'requirement' AS nvarchar(30)) AS relationKind,
          requirement_link.requirement_id AS id
        FROM selected_versions
        INNER JOIN rfi_question_version_requirements AS requirement_link
          ON requirement_link.rfi_question_version_id = selected_versions.versionId
      ) AS links
      ORDER BY links.versionId ASC, links.relationKind ASC, links.id ASC
    `,
    selection.parameters,
  )

  for (const row of linkRows) {
    const target = byVersion.get(row.versionId)
    if (!target) continue
    const ids =
      row.relationKind === 'selection_question'
        ? target.requirementSelectionQuestionIds
        : row.relationKind === 'package'
          ? target.requirementPackageIds
          : target.requirementIds
    if (!ids.includes(row.id)) ids.push(row.id)
  }
}

async function replaceVersionLinks(
  executor: SqlExecutor,
  versionId: number,
  links: Partial<RfiQuestionVersionLinks>,
): Promise<void> {
  const selectionQuestionIds = uniquePositiveIntegers(
    links.requirementSelectionQuestionIds,
  )
  const packageIds = uniquePositiveIntegers(links.requirementPackageIds)
  const requirementIds = uniquePositiveIntegers(links.requirementIds)

  await executor.query(
    `DELETE FROM rfi_question_version_requirement_selection_questions WHERE rfi_question_version_id = @0`,
    [versionId],
  )
  for (const id of selectionQuestionIds) {
    await executor.query(
      `
        INSERT INTO rfi_question_version_requirement_selection_questions
          (rfi_question_version_id, requirement_selection_question_id)
        VALUES (@0, @1)
      `,
      [versionId, id],
    )
  }

  await executor.query(
    `DELETE FROM rfi_question_version_requirement_packages WHERE rfi_question_version_id = @0`,
    [versionId],
  )
  for (const id of packageIds) {
    await executor.query(
      `
        INSERT INTO rfi_question_version_requirement_packages
          (rfi_question_version_id, requirement_package_id)
        VALUES (@0, @1)
      `,
      [versionId, id],
    )
  }

  await executor.query(
    `DELETE FROM rfi_question_version_requirements WHERE rfi_question_version_id = @0`,
    [versionId],
  )
  for (const id of requirementIds) {
    await executor.query(
      `
        INSERT INTO rfi_question_version_requirements
          (rfi_question_version_id, requirement_id)
        VALUES (@0, @1)
      `,
      [versionId, id],
    )
  }
}

async function getVersionLinks(
  executor: SqlExecutor,
  versionId: number,
): Promise<RfiQuestionVersionLinks> {
  const [selectionRows, packageRows, requirementRows] = await Promise.all([
    executor.query<Array<{ id: number }>>(
      `
        SELECT requirement_selection_question_id AS id
        FROM rfi_question_version_requirement_selection_questions
        WHERE rfi_question_version_id = @0
        ORDER BY requirement_selection_question_id ASC
      `,
      [versionId],
    ),
    executor.query<Array<{ id: number }>>(
      `
        SELECT requirement_package_id AS id
        FROM rfi_question_version_requirement_packages
        WHERE rfi_question_version_id = @0
        ORDER BY requirement_package_id ASC
      `,
      [versionId],
    ),
    executor.query<Array<{ id: number }>>(
      `
        SELECT requirement_id AS id
        FROM rfi_question_version_requirements
        WHERE rfi_question_version_id = @0
        ORDER BY requirement_id ASC
      `,
      [versionId],
    ),
  ])

  return {
    requirementIds: requirementRows.map(row => row.id),
    requirementPackageIds: packageRows.map(row => row.id),
    requirementSelectionQuestionIds: selectionRows.map(row => row.id),
  }
}

async function getRfiQuestionRows(
  executor: SqlExecutor,
  options: RfiQuestionSelectionOptions = {},
): Promise<RfiQuestionRow[]> {
  const selection = buildRfiQuestionSelection(options)
  const rows = (await executor.query(
    `
      ${selection.sql}
      SELECT
        question.id AS id,
        question.question_code AS questionCode,
        question.area_id AS areaId,
        area.prefix AS areaPrefix,
        area.name AS areaName,
        question.sort_order AS sortOrder,
        question.is_archived AS isArchived,
        question.archived_at AS archivedAt,
        question.created_at AS createdAt,
        question.updated_at AS updatedAt,
        version_record.id AS versionId,
        version_record.version_number AS versionNumber,
        version_record.question_text AS questionText,
        version_record.help_text AS helpText,
        version_record.expected_answer_format AS expectedAnswerFormat
      FROM selected_questions
      INNER JOIN rfi_questions question
        ON question.id = selected_questions.questionId
      INNER JOIN requirement_areas area
        ON area.id = question.area_id
      LEFT JOIN rfi_question_versions version_record
        ON version_record.id = selected_questions.versionId
      ORDER BY area.name ASC, question.sort_order ASC, question.question_code ASC
    `,
    selection.parameters,
  )) as RfiQuestionDbRow[]
  const mapped = rows.map(mapRfiQuestionRow)
  await hydrateVersionLinks(executor, mapped, selection)
  return mapped
}

export async function listRfiQuestions(
  db: SqlServerDatabase,
  options: { areaId?: number; includeArchived?: boolean } = {},
): Promise<RfiQuestionRow[]> {
  return getRfiQuestionRows(db, options)
}

export async function getRfiQuestion(
  db: SqlServerDatabase,
  questionId: number,
): Promise<RfiQuestionRow | null> {
  return (
    (
      await getRfiQuestionRows(db, {
        includeArchived: true,
        questionId,
      })
    )[0] ?? null
  )
}

export async function createRfiQuestion(
  db: SqlServerDatabase,
  data: {
    areaId: number
    expectedAnswerFormat?: string | null
    helpText?: string | null
    questionText: string
    requirementIds?: number[]
    requirementPackageIds?: number[]
    requirementSelectionQuestionIds?: number[]
    sortOrder?: number
  },
  actor?: ActorSnapshot,
): Promise<RfiQuestionRow> {
  const questionText = data.questionText.trim()
  if (!questionText) throw validationError('RFI question text is required')
  const createdId = await db.transaction('SERIALIZABLE', async manager => {
    const areaRows = (await manager.query(
      `
        SELECT TOP (1) id, prefix
        FROM requirement_areas WITH (UPDLOCK, HOLDLOCK)
        WHERE id = @0
      `,
      [data.areaId],
    )) as Array<{ id: number; prefix: string }>
    const area = areaRows[0]
    if (!area) {
      throw validationError('Requirement area not found', {
        areaId: data.areaId,
        reason: 'area_not_found',
      })
    }

    await manager.query(
      `
        IF NOT EXISTS (
          SELECT 1 FROM rfi_question_sequences WHERE area_id = @0
        )
        INSERT INTO rfi_question_sequences (area_id, next_sequence)
        VALUES (@0, 1)
      `,
      [data.areaId],
    )
    const sequenceRows = (await manager.query(
      `
        SELECT TOP (1) next_sequence AS nextSequence
        FROM rfi_question_sequences WITH (UPDLOCK, HOLDLOCK)
        WHERE area_id = @0
      `,
      [data.areaId],
    )) as Array<{ nextSequence: number }>
    const sequence = sequenceRows[0]?.nextSequence ?? 1
    await manager.query(
      `
        UPDATE rfi_question_sequences
        SET next_sequence = @1
        WHERE area_id = @0
      `,
      [data.areaId, sequence + 1],
    )
    const questionCode = `${area.prefix}-RFI${String(sequence).padStart(3, '0')}`
    const questionRows = (await manager.query(
      `
        INSERT INTO rfi_questions
          (question_code, area_id, sort_order, is_archived, created_at, updated_at)
        OUTPUT INSERTED.id AS id
        VALUES (@0, @1, @2, 0, SYSUTCDATETIME(), SYSUTCDATETIME())
      `,
      [questionCode, data.areaId, data.sortOrder ?? 0],
    )) as Array<{ id: number }>
    const questionId = Number(questionRows[0]?.id)
    const versionRows = (await manager.query(
      `
        INSERT INTO rfi_question_versions
          (
            rfi_question_id,
            version_number,
            question_text,
            help_text,
            expected_answer_format,
            is_active,
            created_by_hsa_id,
            created_by_display_name,
            created_at,
            updated_at
          )
        OUTPUT INSERTED.id AS id
        VALUES (@0, 1, @1, @2, @3, 1, @4, @5, SYSUTCDATETIME(), SYSUTCDATETIME())
      `,
      [
        questionId,
        questionText,
        nullableTrimmed(data.helpText),
        nullableTrimmed(data.expectedAnswerFormat),
        actor?.hsaId ?? null,
        actor?.displayName ?? null,
      ],
    )) as Array<{ id: number }>
    await replaceVersionLinks(manager, Number(versionRows[0]?.id), data)
    return questionId
  })
  const question = await getRfiQuestion(db, createdId)
  if (!question) {
    throw validationError('Created RFI question could not be loaded')
  }
  return question
}

export async function updateRfiQuestion(
  db: SqlServerDatabase,
  questionId: number,
  data: {
    expectedAnswerFormat?: string | null
    helpText?: string | null
    questionText?: string
    requirementIds?: number[]
    requirementPackageIds?: number[]
    requirementSelectionQuestionIds?: number[]
    sortOrder?: number
  },
  actor?: ActorSnapshot,
): Promise<RfiQuestionRow | null> {
  const hasVersionChange =
    data.questionText !== undefined ||
    data.helpText !== undefined ||
    data.expectedAnswerFormat !== undefined ||
    data.requirementIds !== undefined ||
    data.requirementPackageIds !== undefined ||
    data.requirementSelectionQuestionIds !== undefined

  const found = await db.transaction('SERIALIZABLE', async manager => {
    const questionRows = (await manager.query(
      `
        SELECT TOP (1) id
        FROM rfi_questions WITH (UPDLOCK, HOLDLOCK)
        WHERE id = @0
      `,
      [questionId],
    )) as Array<{ id: number }>
    if (!questionRows[0]) return false

    if (data.sortOrder !== undefined) {
      await manager.query(
        `
          UPDATE rfi_questions
          SET sort_order = @1,
              updated_at = SYSUTCDATETIME()
          WHERE id = @0
        `,
        [questionId, data.sortOrder],
      )
    }

    if (hasVersionChange) {
      const currentRows = (await manager.query(
        `
          SELECT TOP (1)
            id,
            version_number AS versionNumber,
            question_text AS questionText,
            help_text AS helpText,
            expected_answer_format AS expectedAnswerFormat
          FROM rfi_question_versions WITH (UPDLOCK, HOLDLOCK)
          WHERE rfi_question_id = @0
            AND is_active = 1
          ORDER BY version_number DESC
        `,
        [questionId],
      )) as Array<{
        expectedAnswerFormat: string | null
        helpText: string | null
        id: number
        questionText: string
        versionNumber: number
      }>
      const current = currentRows[0]
      if (!current) {
        throw validationError('RFI question has no active version', {
          questionId,
          reason: 'missing_active_rfi_question_version',
        })
      }
      const nextQuestionText =
        data.questionText === undefined
          ? current.questionText
          : data.questionText.trim()
      if (!nextQuestionText) {
        throw validationError('RFI question text is required')
      }
      const currentLinks = await getVersionLinks(manager, current.id)
      await manager.query(
        `
          UPDATE rfi_question_versions
          SET is_active = 0,
              updated_at = SYSUTCDATETIME()
          WHERE rfi_question_id = @0
            AND is_active = 1
        `,
        [questionId],
      )
      const versionRows = (await manager.query(
        `
          INSERT INTO rfi_question_versions
            (
              rfi_question_id,
              version_number,
              question_text,
              help_text,
              expected_answer_format,
              is_active,
              created_by_hsa_id,
              created_by_display_name,
              created_at,
              updated_at
            )
          OUTPUT INSERTED.id AS id
          VALUES (@0, @1, @2, @3, @4, 1, @5, @6, SYSUTCDATETIME(), SYSUTCDATETIME())
        `,
        [
          questionId,
          current.versionNumber + 1,
          nextQuestionText,
          data.helpText === undefined
            ? current.helpText
            : nullableTrimmed(data.helpText),
          data.expectedAnswerFormat === undefined
            ? current.expectedAnswerFormat
            : nullableTrimmed(data.expectedAnswerFormat),
          actor?.hsaId ?? null,
          actor?.displayName ?? null,
        ],
      )) as Array<{ id: number }>
      await replaceVersionLinks(manager, Number(versionRows[0]?.id), {
        requirementIds: data.requirementIds ?? currentLinks.requirementIds,
        requirementPackageIds:
          data.requirementPackageIds ?? currentLinks.requirementPackageIds,
        requirementSelectionQuestionIds:
          data.requirementSelectionQuestionIds ??
          currentLinks.requirementSelectionQuestionIds,
      })
      await manager.query(
        `
          UPDATE rfi_questions
          SET updated_at = SYSUTCDATETIME()
          WHERE id = @0
        `,
        [questionId],
      )
    }
    return true
  })
  return found ? getRfiQuestion(db, questionId) : null
}

export async function setRfiQuestionArchived(
  db: SqlServerDatabase,
  questionId: number,
  archived: boolean,
): Promise<RfiQuestionRow | null> {
  const rows = (await db.query(
    `
      UPDATE rfi_questions
      SET is_archived = @1,
          archived_at = CASE WHEN @1 = 1 THEN SYSUTCDATETIME() ELSE NULL END,
          updated_at = SYSUTCDATETIME()
      OUTPUT INSERTED.id AS id
      WHERE id = @0
    `,
    [questionId, archived ? 1 : 0],
  )) as Array<{ id: number }>
  return rows[0] ? getRfiQuestion(db, questionId) : null
}

async function ensureSpecificationRfiList(
  executor: SqlExecutor,
  specificationId: number,
): Promise<void> {
  await executor.query(
    `
      IF NOT EXISTS (
        SELECT 1 FROM specification_rfi_lists WHERE specification_id = @0
      )
      INSERT INTO specification_rfi_lists
        (specification_id, is_locked, created_at, updated_at)
      VALUES (@0, 0, SYSUTCDATETIME(), SYSUTCDATETIME())
    `,
    [specificationId],
  )
}

async function getSpecificationRfiListHeader(
  db: SqlExecutor,
  specificationId: number,
): Promise<Omit<SpecificationRfiListRow, 'items'>> {
  const rows = (await db.query(
    `
      SELECT TOP (1)
        specification_id AS specificationId,
        is_locked AS isLocked,
        locked_at AS lockedAt,
        locked_by_hsa_id AS lockedByHsaId,
        locked_by_display_name AS lockedByDisplayName
      FROM specification_rfi_lists
      WHERE specification_id = @0
    `,
    [specificationId],
  )) as Array<{
    isLocked: boolean | number | string
    lockedAt: Date | string | null
    lockedByDisplayName: string | null
    lockedByHsaId: string | null
    specificationId: number
  }>
  const row = rows[0]
  return {
    isLocked: row ? toBoolean(row.isLocked) : false,
    lockedAt: row?.lockedAt == null ? null : toIsoString(row.lockedAt),
    lockedByDisplayName: row?.lockedByDisplayName ?? null,
    lockedByHsaId: row?.lockedByHsaId ?? null,
    specificationId,
  }
}

export async function getSpecificationRfiList(
  db: SqlServerDatabase,
  specificationId: number,
): Promise<SpecificationRfiListRow> {
  const header = await getSpecificationRfiListHeader(db, specificationId)
  const selectedVersions: SqlSelection = header.isLocked
    ? {
        parameters: [specificationId],
        sql: `
          WITH selected_versions AS (
            SELECT item.rfi_question_version_id AS versionId
            FROM specification_rfi_question_items AS item
            WHERE item.specification_id = @0
          )
        `,
      }
    : {
        parameters: [],
        sql: `
          WITH selected_versions AS (
            SELECT version_record.id AS versionId
            FROM rfi_questions AS question
            INNER JOIN rfi_question_versions AS version_record
              ON version_record.rfi_question_id = question.id
             AND version_record.is_active = 1
            WHERE question.is_archived = 0
          )
        `,
      }
  const rows = header.isLocked
    ? ((await db.query(
        `
          SELECT
            question.id AS questionId,
            question.question_code AS questionCode,
            question.area_id AS areaId,
            area.prefix AS areaPrefix,
            area.name AS areaName,
            question.sort_order AS sortOrder,
            version_record.id AS versionId,
            version_record.version_number AS versionNumber,
            version_record.question_text AS questionText,
            version_record.help_text AS helpText,
            version_record.expected_answer_format AS expectedAnswerFormat,
            item.is_included AS isIncluded,
            item.relevance AS relevance,
            0 AS isVersionStale
          FROM specification_rfi_question_items item
          INNER JOIN rfi_questions question
            ON question.id = item.rfi_question_id
          INNER JOIN requirement_areas area
            ON area.id = question.area_id
          INNER JOIN rfi_question_versions version_record
            ON version_record.id = item.rfi_question_version_id
          WHERE item.specification_id = @0
          ORDER BY area.name ASC, question.sort_order ASC, question.question_code ASC
        `,
        [specificationId],
      )) as SpecificationRfiQuestionItemDbRow[])
    : ((await db.query(
        `
          SELECT
            question.id AS questionId,
            question.question_code AS questionCode,
            question.area_id AS areaId,
            area.prefix AS areaPrefix,
            area.name AS areaName,
            question.sort_order AS sortOrder,
            version_record.id AS versionId,
            version_record.version_number AS versionNumber,
            version_record.question_text AS questionText,
            version_record.help_text AS helpText,
            version_record.expected_answer_format AS expectedAnswerFormat,
            COALESCE(item.is_included, 1) AS isIncluded,
            CASE
              WHEN item.rfi_question_version_id = version_record.id
              THEN item.relevance
              ELSE NULL
            END AS relevance,
            CASE
              WHEN item.rfi_question_version_id IS NOT NULL
               AND item.rfi_question_version_id <> version_record.id
              THEN 1
              ELSE 0
            END AS isVersionStale
          FROM rfi_questions question
          INNER JOIN requirement_areas area
            ON area.id = question.area_id
          INNER JOIN rfi_question_versions version_record
            ON version_record.rfi_question_id = question.id
           AND version_record.is_active = 1
          LEFT JOIN specification_rfi_question_items item
            ON item.specification_id = @0
           AND item.rfi_question_id = question.id
          WHERE question.is_archived = 0
          ORDER BY area.name ASC, question.sort_order ASC, question.question_code ASC
        `,
        [specificationId],
      )) as SpecificationRfiQuestionItemDbRow[])
  const items = rows.map(mapSpecificationRfiQuestionItemRow)
  await hydrateVersionLinks(db, items, selectedVersions)
  return { ...header, items }
}

export async function lockSpecificationRfiList(
  db: SqlServerDatabase,
  specificationId: number,
  actor: ActorSnapshot,
): Promise<SpecificationRfiListRow> {
  await db.transaction('SERIALIZABLE', async manager => {
    await ensureSpecificationRfiList(manager, specificationId)
    const activeRows = (await manager.query(
      `
        SELECT
          question.id AS questionId,
          version_record.id AS versionId
        FROM rfi_questions question
        INNER JOIN rfi_question_versions version_record
          ON version_record.rfi_question_id = question.id
         AND version_record.is_active = 1
        WHERE question.is_archived = 0
      `,
    )) as Array<{ questionId: number; versionId: number }>
    const activeQuestionIds = activeRows.map(row => row.questionId)
    if (activeQuestionIds.length > 0) {
      await manager.query(
        `
          DELETE FROM specification_rfi_question_items
          WHERE specification_id = @0
            AND rfi_question_id NOT IN (${placeholders(activeQuestionIds, 1)})
        `,
        [specificationId, ...activeQuestionIds],
      )
    } else {
      await manager.query(
        `DELETE FROM specification_rfi_question_items WHERE specification_id = @0`,
        [specificationId],
      )
    }
    for (const row of activeRows) {
      await manager.query(
        `
          MERGE specification_rfi_question_items AS target
          USING (
            SELECT
              @0 AS specification_id,
              @1 AS rfi_question_id,
              @2 AS rfi_question_version_id
          ) AS source
          ON target.specification_id = source.specification_id
         AND target.rfi_question_id = source.rfi_question_id
          WHEN MATCHED THEN
            UPDATE SET
              rfi_question_version_id = source.rfi_question_version_id,
              relevance = CASE
                WHEN target.rfi_question_version_id = source.rfi_question_version_id
                 AND target.is_included = 1
                THEN target.relevance
                ELSE NULL
              END,
              changed_at = SYSUTCDATETIME(),
              changed_by_hsa_id = @3,
              changed_by_display_name = @4
          WHEN NOT MATCHED THEN
            INSERT (
              specification_id,
              rfi_question_id,
              rfi_question_version_id,
              is_included,
              relevance,
              changed_at,
              changed_by_hsa_id,
              changed_by_display_name
            )
            VALUES (
              source.specification_id,
              source.rfi_question_id,
              source.rfi_question_version_id,
              1,
              NULL,
              SYSUTCDATETIME(),
              @3,
              @4
            );
        `,
        [
          specificationId,
          row.questionId,
          row.versionId,
          actor.hsaId,
          actor.displayName,
        ],
      )
    }
    await manager.query(
      `
        UPDATE specification_rfi_lists
        SET is_locked = 1,
            locked_at = SYSUTCDATETIME(),
            locked_by_hsa_id = @1,
            locked_by_display_name = @2,
            updated_at = SYSUTCDATETIME()
        WHERE specification_id = @0
      `,
      [specificationId, actor.hsaId, actor.displayName],
    )
  })
  return getSpecificationRfiList(db, specificationId)
}

export async function unlockSpecificationRfiList(
  db: SqlServerDatabase,
  specificationId: number,
): Promise<SpecificationRfiListRow> {
  await db.transaction(async manager => {
    await ensureSpecificationRfiList(manager, specificationId)
    await manager.query(
      `
        UPDATE specification_rfi_lists
        SET is_locked = 0,
            locked_at = NULL,
            locked_by_hsa_id = NULL,
            locked_by_display_name = NULL,
            updated_at = SYSUTCDATETIME()
        WHERE specification_id = @0
      `,
      [specificationId],
    )
  })
  return getSpecificationRfiList(db, specificationId)
}

export async function updateSpecificationRfiQuestionItem(
  db: SqlServerDatabase,
  specificationId: number,
  questionId: number,
  data: { isIncluded?: boolean; relevance?: RfiRelevance | null },
  actor: ActorSnapshot,
): Promise<SpecificationRfiListRow> {
  await db.transaction(async manager => {
    await ensureSpecificationRfiList(manager, specificationId)
    const header = await getSpecificationRfiListHeader(manager, specificationId)
    const versionRows = (await manager.query(
      `
        SELECT TOP (1) id
        FROM rfi_question_versions
        WHERE rfi_question_id = @0
          AND is_active = 1
        ORDER BY version_number DESC
      `,
      [questionId],
    )) as Array<{ id: number }>
    const versionId = versionRows[0]?.id
    if (!versionId && !header.isLocked) {
      throw validationError('RFI question has no active version', {
        questionId,
        reason: 'missing_active_rfi_question_version',
      })
    }
    if (data.isIncluded !== undefined && header.isLocked) {
      throw validationError('Locked RFI lists cannot change scope', {
        reason: 'rfi_list_locked',
      })
    }
    if (data.relevance !== undefined && !header.isLocked) {
      throw validationError('RFI relevance requires a locked RFI list', {
        reason: 'rfi_list_not_locked',
      })
    }

    if (header.isLocked) {
      const itemRows = (await manager.query(
        `
          SELECT TOP (1)
            is_included AS isIncluded,
            rfi_question_version_id AS versionId
          FROM specification_rfi_question_items
          WHERE specification_id = @0
            AND rfi_question_id = @1
        `,
        [specificationId, questionId],
      )) as Array<{ isIncluded: boolean | number; versionId: number }>
      if (!itemRows[0]) {
        throw validationError('RFI question is not part of the locked list', {
          questionId,
          reason: 'rfi_question_not_locked',
          specificationId,
        })
      }
      if (
        data.relevance !== undefined &&
        itemRows[0].isIncluded !== true &&
        itemRows[0].isIncluded !== 1
      ) {
        throw validationError(
          'Excluded RFI questions cannot have relevance updated in locked mode',
          {
            questionId,
            reason: 'rfi_question_excluded_from_locked_list',
            specificationId,
          },
        )
      }
    }

    await manager.query(
      `
        MERGE specification_rfi_question_items AS target
        USING (
          SELECT
            @0 AS specification_id,
            @1 AS rfi_question_id
        ) AS source
        ON target.specification_id = source.specification_id
       AND target.rfi_question_id = source.rfi_question_id
        WHEN MATCHED THEN
          UPDATE SET
            rfi_question_version_id = COALESCE(target.rfi_question_version_id, @2),
            is_included = CASE WHEN @3 = 1 THEN @4 ELSE target.is_included END,
            relevance = CASE WHEN @5 = 1 THEN @6 ELSE target.relevance END,
            changed_at = SYSUTCDATETIME(),
            changed_by_hsa_id = @7,
            changed_by_display_name = @8
        WHEN NOT MATCHED THEN
          INSERT (
            specification_id,
            rfi_question_id,
            rfi_question_version_id,
            is_included,
            relevance,
            changed_at,
            changed_by_hsa_id,
            changed_by_display_name
          )
          VALUES (
            @0,
            @1,
            @2,
            CASE WHEN @3 = 1 THEN @4 ELSE 1 END,
            CASE WHEN @5 = 1 THEN @6 ELSE NULL END,
            SYSUTCDATETIME(),
            @7,
            @8
          );
      `,
      [
        specificationId,
        questionId,
        versionId ?? null,
        data.isIncluded === undefined ? 0 : 1,
        data.isIncluded === undefined ? 1 : data.isIncluded ? 1 : 0,
        data.relevance === undefined ? 0 : 1,
        data.relevance === undefined ? null : data.relevance,
        actor.hsaId,
        actor.displayName,
      ],
    )
  })
  return getSpecificationRfiList(db, specificationId)
}

export async function updateSpecificationRfiAreaScope(
  db: SqlServerDatabase,
  specificationId: number,
  areaId: number,
  isIncluded: boolean,
  actor: ActorSnapshot,
): Promise<SpecificationRfiListRow> {
  await db.transaction(async manager => {
    await ensureSpecificationRfiList(manager, specificationId)
    const header = await getSpecificationRfiListHeader(manager, specificationId)
    if (header.isLocked) {
      throw validationError('Locked RFI lists cannot change scope', {
        reason: 'rfi_list_locked',
      })
    }

    const areaRows = (await manager.query(
      `SELECT TOP (1) id FROM requirement_areas WHERE id = @0`,
      [areaId],
    )) as Array<{ id: number }>
    if (!areaRows[0]) {
      throw validationError('Requirement area not found', {
        areaId,
        reason: 'area_not_found',
      })
    }

    await manager.query(
      `
        MERGE specification_rfi_question_items AS target
        USING (
          SELECT
            @0 AS specification_id,
            question.id AS rfi_question_id,
            version_record.id AS rfi_question_version_id
          FROM rfi_questions question
          INNER JOIN rfi_question_versions version_record
            ON version_record.rfi_question_id = question.id
           AND version_record.is_active = 1
          WHERE question.area_id = @1
            AND question.is_archived = 0
        ) AS source
        ON target.specification_id = source.specification_id
       AND target.rfi_question_id = source.rfi_question_id
        WHEN MATCHED THEN
          UPDATE SET
            rfi_question_version_id = COALESCE(
              target.rfi_question_version_id,
              source.rfi_question_version_id
            ),
            is_included = @2,
            changed_at = SYSUTCDATETIME(),
            changed_by_hsa_id = @3,
            changed_by_display_name = @4
        WHEN NOT MATCHED THEN
          INSERT (
            specification_id,
            rfi_question_id,
            rfi_question_version_id,
            is_included,
            relevance,
            changed_at,
            changed_by_hsa_id,
            changed_by_display_name
          )
          VALUES (
            source.specification_id,
            source.rfi_question_id,
            source.rfi_question_version_id,
            @2,
            NULL,
            SYSUTCDATETIME(),
            @3,
            @4
          );
      `,
      [
        specificationId,
        areaId,
        isIncluded ? 1 : 0,
        actor.hsaId,
        actor.displayName,
      ],
    )
  })
  return getSpecificationRfiList(db, specificationId)
}

export async function createRfiQuestionSuggestion(
  db: SqlExecutor,
  data: RfiQuestionSuggestionCreateData,
  actor: ActorSnapshot,
): Promise<RfiQuestionSuggestionRow> {
  const content = data.content.trim()
  if (!content) throw validationError('Suggestion content is required')
  const areaRows = (await db.query(
    `SELECT TOP (1) id FROM requirement_areas WHERE id = @0`,
    [data.areaId],
  )) as Array<{ id: number }>
  if (!areaRows[0]) {
    throw validationError('Requirement area not found', {
      areaId: data.areaId,
      reason: 'area_not_found',
    })
  }
  if (data.rfiQuestionId != null) {
    const questionRows = (await db.query(
      `
        SELECT TOP (1) area_id AS areaId
        FROM rfi_questions
        WHERE id = @0
      `,
      [data.rfiQuestionId],
    )) as Array<{ areaId: number }>
    const question = questionRows[0]
    if (!question) {
      throw validationError('RFI question not found', {
        questionId: data.rfiQuestionId,
        reason: 'rfi_question_not_found',
      })
    }
    if (question.areaId !== data.areaId) {
      throw validationError('RFI question belongs to another area', {
        areaId: data.areaId,
        questionAreaId: question.areaId,
        reason: 'rfi_question_area_mismatch',
      })
    }
  }
  const specificationRows =
    data.specificationId == null
      ? []
      : ((await db.query(
          `
            SELECT TOP (1) id, specification_code AS specificationCode, name
            FROM requirements_specifications
            WHERE id = @0
          `,
          [data.specificationId],
        )) as Array<{ id: number; name: string; specificationCode: string }>)
  if (data.specificationId != null && !specificationRows[0]) {
    throw notFoundError('Specification not found', {
      reason: 'specification_not_found',
      specificationId: data.specificationId,
    })
  }
  const specification = specificationRows[0]
  const rows = (await db.query(
    `
      DECLARE @created TABLE (id int NOT NULL);

      INSERT INTO rfi_question_suggestions
        (
          area_id,
          rfi_question_id,
          specification_id,
          source_specification_code,
          source_specification_name,
          content,
          created_by_hsa_id,
          created_by_display_name,
          created_at
        )
      OUTPUT INSERTED.id INTO @created (id)
      VALUES (@0, @1, @2, @3, @4, @5, @6, @7, SYSUTCDATETIME())

      SELECT id FROM @created
    `,
    [
      data.areaId,
      data.rfiQuestionId ?? null,
      data.specificationId ?? null,
      specification?.specificationCode ?? null,
      specification?.name ?? null,
      content,
      actor.hsaId,
      actor.displayName,
    ],
  )) as Array<{ id: number }>
  const suggestion = await getRfiQuestionSuggestion(db, Number(rows[0]?.id))
  if (!suggestion) {
    throw internalError('Created RFI question suggestion could not be loaded')
  }
  return suggestion
}

export async function getRfiQuestionSuggestion(
  db: SqlExecutor,
  suggestionId: number,
): Promise<RfiQuestionSuggestionRow | null> {
  const suggestions = await listRfiQuestionSuggestions(db, { suggestionId })
  return suggestions[0] ?? null
}

export async function listRfiQuestionSuggestions(
  db: SqlExecutor,
  options: {
    areaId?: number
    specificationId?: number
    suggestionId?: number
  } = {},
): Promise<RfiQuestionSuggestionRow[]> {
  const params: unknown[] = []
  const conditions: string[] = []
  if (options.suggestionId != null) {
    params.push(options.suggestionId)
    conditions.push(`suggestion.id = @${params.length - 1}`)
  }
  if (options.areaId != null) {
    params.push(options.areaId)
    conditions.push(`suggestion.area_id = @${params.length - 1}`)
  }
  if (options.specificationId != null) {
    params.push(options.specificationId)
    conditions.push(`suggestion.specification_id = @${params.length - 1}`)
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const rows = (await db.query(
    `
      SELECT
        suggestion.id AS id,
        suggestion.area_id AS areaId,
        area.name AS areaName,
        suggestion.rfi_question_id AS rfiQuestionId,
        question.question_code AS questionCode,
        suggestion.specification_id AS specificationId,
        suggestion.source_specification_code AS sourceSpecificationCode,
        suggestion.source_specification_name AS sourceSpecificationName,
        suggestion.content AS content,
        suggestion.is_review_requested AS isReviewRequested,
        suggestion.review_requested_at AS reviewRequestedAt,
        suggestion.resolution AS resolution,
        suggestion.resolution_motivation AS resolutionMotivation,
        suggestion.created_by_hsa_id AS createdByHsaId,
        suggestion.created_by_display_name AS createdByDisplayName,
        suggestion.created_at AS createdAt,
        suggestion.updated_at AS updatedAt,
        suggestion.resolved_by_hsa_id AS resolvedByHsaId,
        suggestion.resolved_by_display_name AS resolvedByDisplayName,
        suggestion.resolved_at AS resolvedAt
      FROM rfi_question_suggestions suggestion
      INNER JOIN requirement_areas area
        ON area.id = suggestion.area_id
      LEFT JOIN rfi_questions question
        ON question.id = suggestion.rfi_question_id
      ${where}
      ORDER BY suggestion.created_at DESC, suggestion.id DESC
    `,
    params,
  )) as RfiQuestionSuggestionDbRow[]
  return rows.map(mapRfiQuestionSuggestionRow)
}

export async function deleteRfiQuestionSuggestion(
  db: SqlExecutor,
  suggestionId: number,
): Promise<RfiQuestionSuggestionMutationTarget> {
  const deletedRows = (await db.query(
    `
      DECLARE @deleted TABLE (
        id int NOT NULL,
        areaId int NOT NULL,
        rfiQuestionId int NULL,
        specificationId int NULL
      );

      DELETE FROM rfi_question_suggestions
      OUTPUT
        DELETED.id,
        DELETED.area_id,
        DELETED.rfi_question_id,
        DELETED.specification_id
      INTO @deleted (id, areaId, rfiQuestionId, specificationId)
      WHERE id = @0
        AND is_review_requested = 0
        AND review_requested_at IS NULL
        AND resolution IS NULL
        AND resolution_motivation IS NULL
        AND resolved_at IS NULL
        AND resolved_by_hsa_id IS NULL
        AND resolved_by_display_name IS NULL

      SELECT id, areaId, rfiQuestionId, specificationId
      FROM @deleted
    `,
    [suggestionId],
  )) as RfiQuestionSuggestionMutationTarget[]
  const deleted = deletedRows[0]
  if (deleted) return deleted

  const existing = await getRfiQuestionSuggestionState(db, suggestionId)
  if (!existing) {
    throw notFoundError(`RFI question suggestion ${suggestionId} not found`, {
      suggestionId,
    })
  }
  throw conflictError('Only a draft RFI question suggestion can be deleted', {
    reason: 'rfi_question_suggestion_not_draft',
    suggestionId,
  })
}

async function getRfiQuestionSuggestionState(
  db: SqlExecutor,
  suggestionId: number,
): Promise<RfiQuestionSuggestionStateDbRow | null> {
  const rows = (await db.query(
    `
      SELECT TOP (1)
        area_id AS areaId,
        id,
        is_review_requested AS isReviewRequested,
        resolution,
        review_requested_at AS reviewRequestedAt,
        rfi_question_id AS rfiQuestionId,
        specification_id AS specificationId
      FROM rfi_question_suggestions
      WITH (UPDLOCK, HOLDLOCK)
      WHERE id = @0
    `,
    [suggestionId],
  )) as RfiQuestionSuggestionStateDbRow[]
  return rows[0] ?? null
}

export async function requestRfiQuestionSuggestionReview(
  db: SqlExecutor,
  suggestionId: number,
): Promise<RfiQuestionSuggestionRow> {
  const rows = (await db.query(
    `
      DECLARE @reviewed TABLE (id int NOT NULL);

      UPDATE rfi_question_suggestions
      SET is_review_requested = 1,
          review_requested_at = SYSUTCDATETIME(),
          updated_at = SYSUTCDATETIME()
      OUTPUT INSERTED.id INTO @reviewed (id)
      WHERE id = @0
        AND is_review_requested = 0
        AND review_requested_at IS NULL
        AND resolution IS NULL
        AND resolution_motivation IS NULL
        AND resolved_at IS NULL
        AND resolved_by_hsa_id IS NULL
        AND resolved_by_display_name IS NULL

      SELECT id FROM @reviewed
    `,
    [suggestionId],
  )) as Array<{ id: number }>
  if (rows[0]) {
    const suggestion = await getRfiQuestionSuggestion(db, suggestionId)
    if (suggestion) return suggestion
    throw internalError('Reviewed RFI question suggestion could not be loaded')
  }

  const existing = await getRfiQuestionSuggestionState(db, suggestionId)
  if (!existing) {
    throw notFoundError(`RFI question suggestion ${suggestionId} not found`, {
      suggestionId,
    })
  }
  if (existing.resolution !== null) {
    throw conflictError('RFI question suggestion is already resolved', {
      reason: 'rfi_question_suggestion_already_resolved',
      suggestionId,
    })
  }
  throw conflictError('RFI question suggestion review is already requested', {
    reason: 'rfi_question_suggestion_review_already_requested',
    suggestionId,
  })
}

export async function resolveRfiQuestionSuggestion(
  db: SqlExecutor,
  suggestionId: number,
  data: RfiQuestionSuggestionResolutionData,
  actor: ActorSnapshot,
): Promise<RfiQuestionSuggestionRow> {
  const motivation = data.resolutionMotivation.trim()
  if (!motivation) {
    throw validationError('Resolution motivation is required')
  }
  const rows = (await db.query(
    `
      DECLARE @resolved TABLE (id int NOT NULL);

      UPDATE rfi_question_suggestions
      SET resolution = @1,
          resolution_motivation = @2,
          resolved_by_hsa_id = @3,
          resolved_by_display_name = @4,
          resolved_at = SYSUTCDATETIME(),
          updated_at = SYSUTCDATETIME()
      OUTPUT INSERTED.id INTO @resolved (id)
      WHERE id = @0
        AND is_review_requested = 1
        AND review_requested_at IS NOT NULL
        AND resolution IS NULL
        AND resolution_motivation IS NULL
        AND resolved_at IS NULL
        AND resolved_by_hsa_id IS NULL
        AND resolved_by_display_name IS NULL

      SELECT id FROM @resolved
    `,
    [suggestionId, data.resolution, motivation, actor.hsaId, actor.displayName],
  )) as Array<{ id: number }>
  if (rows[0]) {
    const suggestion = await getRfiQuestionSuggestion(db, suggestionId)
    if (suggestion) return suggestion
    throw internalError('Resolved RFI question suggestion could not be loaded')
  }

  const existing = await getRfiQuestionSuggestionState(db, suggestionId)
  if (!existing) {
    throw notFoundError(`RFI question suggestion ${suggestionId} not found`, {
      suggestionId,
    })
  }
  if (existing.resolution !== null) {
    throw conflictError('RFI question suggestion is already resolved', {
      reason: 'rfi_question_suggestion_already_resolved',
      suggestionId,
    })
  }
  throw conflictError(
    'RFI question suggestion review must be requested before resolution',
    {
      reason: 'rfi_question_suggestion_review_required',
      suggestionId,
    },
  )
}

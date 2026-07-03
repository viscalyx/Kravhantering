import { getAiGenerationSettings } from '@/lib/dal/ai-settings'
import type { SqlServerDatabase, SqlServerEntityManager } from '@/lib/db'
import {
  conflictError,
  notFoundError,
  validationError,
} from '@/lib/requirements/errors'
import { toBoolean } from '@/lib/typeorm/value-mappers'

export const AI_SAFETY_RULE_IDS = [
  'encoded_smuggling',
  'harmful_generation_request',
  'instruction_override',
  'secret_extraction_request',
  'sensitive_backend_leak',
  'system_prompt_extraction',
] as const

export const AI_SAFETY_TERM_DIRECTIONS = [
  'input',
  'output',
  'input_output',
] as const

export const AI_SAFETY_TERM_TYPES = [
  'action',
  'coding',
  'direct_marker',
  'target',
] as const

export type AiSafetyRuleId = (typeof AI_SAFETY_RULE_IDS)[number]
export type AiSafetyTermDirection = (typeof AI_SAFETY_TERM_DIRECTIONS)[number]
export type AiSafetyTermType = (typeof AI_SAFETY_TERM_TYPES)[number]

export interface AiSafetyRuleAdminTerm {
  direction: AiSafetyTermDirection
  id: number
  isActive: boolean
  isStandard: boolean
  normalizedTerm: string
  standardDirection: AiSafetyTermDirection
  termText: string
  termType: AiSafetyTermType
}

export interface AiSafetyRuleAdminItem {
  category: string
  descriptionEn: string | null
  descriptionSv: string | null
  id: number
  nameEn: string
  nameSv: string
  patternKind: AiSafetyRulePatternKind
  ruleId: AiSafetyRuleId
  sortOrder: number
  terms: readonly AiSafetyRuleAdminTerm[]
  windowChars: number | null
}

export type AiSafetyRulePatternKind =
  | 'bidirectional_pair'
  | 'direct_markers'
  | 'paired_terms'

export interface ActiveAiSafetyRuleTerm {
  direction: AiSafetyTermDirection
  termText: string
  termType: AiSafetyTermType
}

export interface ActiveAiSafetyRule {
  category: string
  patternKind: AiSafetyRulePatternKind
  ruleId: AiSafetyRuleId
  terms: readonly ActiveAiSafetyRuleTerm[]
  windowChars: number | null
}

export interface ActiveAiSafetyRuleSet {
  rules: readonly ActiveAiSafetyRule[]
}

export interface RemoveAiSafetyRuleTermsResult {
  deactivatedStandardCount: number
  deletedCustomCount: number
}

interface AiSafetyRuleRow {
  category: string
  descriptionEn: string | null
  descriptionSv: string | null
  id: number | string
  nameEn: string
  nameSv: string
  patternKind: string
  ruleId: string
  sortOrder: number | string
  windowChars: number | string | null
}

interface AiSafetyTermRow {
  direction: string
  id: number | string
  isActive: boolean | number | string
  isStandard: boolean | number | string
  normalizedTerm: string
  ruleDatabaseId: number | string
  ruleId: string
  standardDirection: string
  termText: string
  termType: string
}

interface QueryExecutor {
  query<T = unknown[]>(sql: string, parameters?: unknown[]): Promise<T>
}

interface CachedAiSafetyRuleSet {
  expiresAt: number
  value: ActiveAiSafetyRuleSet
}

const TERM_TEXT_MAX_LENGTH = 255
const REQUIRED_RULE_IDS = new Set<string>(AI_SAFETY_RULE_IDS)

let cachedRuleSet: CachedAiSafetyRuleSet | undefined

export function clearAiSafetyRuleSetCache(): void {
  cachedRuleSet = undefined
}

export function clearAiSafetyRuleSetCacheForTests(): void {
  clearAiSafetyRuleSetCache()
}

export function isAiSafetyRuleId(value: string): value is AiSafetyRuleId {
  return REQUIRED_RULE_IDS.has(value)
}

export function isAiSafetyTermDirection(
  value: string,
): value is AiSafetyTermDirection {
  return (AI_SAFETY_TERM_DIRECTIONS as readonly string[]).includes(value)
}

export function isAiSafetyTermType(value: string): value is AiSafetyTermType {
  return (AI_SAFETY_TERM_TYPES as readonly string[]).includes(value)
}

export function normalizeAiSafetyTerm(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('sv-SE')
}

function assertTermText(termText: string): string {
  const normalized = normalizeAiSafetyTerm(termText)
  if (!normalized) {
    throw validationError('AI safety term text is required', {
      reason: 'term_text_required',
    })
  }
  if (normalized.length > TERM_TEXT_MAX_LENGTH) {
    throw validationError('AI safety term text is too long', {
      maxLength: TERM_TEXT_MAX_LENGTH,
      reason: 'term_text_too_long',
    })
  }
  return normalized
}

function assertTermDirection(
  direction: AiSafetyTermDirection,
): AiSafetyTermDirection {
  if (!isAiSafetyTermDirection(direction)) {
    throw validationError('Invalid AI safety term direction', {
      direction,
      reason: 'invalid_direction',
    })
  }
  return direction
}

function assertTermType(termType: AiSafetyTermType): AiSafetyTermType {
  if (!isAiSafetyTermType(termType)) {
    throw validationError('Invalid AI safety term type', {
      reason: 'invalid_term_type',
      termType,
    })
  }
  return termType
}

function assertPositiveIds(ids: readonly number[]): readonly number[] {
  const uniqueIds = [...new Set(ids.map(id => Math.trunc(id)))]
  if (
    uniqueIds.length === 0 ||
    uniqueIds.some(id => !Number.isInteger(id) || id <= 0)
  ) {
    throw validationError('Expected positive AI safety term ids', {
      reason: 'invalid_term_ids',
    })
  }
  return uniqueIds
}

function mapRuleRow(row: AiSafetyRuleRow): AiSafetyRuleAdminItem {
  if (!isAiSafetyRuleId(row.ruleId)) {
    throw new Error(`Unknown AI safety rule id '${row.ruleId}' loaded from DB.`)
  }
  if (!isPatternKind(row.patternKind)) {
    throw new Error(
      `Unknown AI safety rule pattern '${row.patternKind}' loaded from DB.`,
    )
  }

  return {
    category: row.category,
    descriptionEn: row.descriptionEn,
    descriptionSv: row.descriptionSv,
    id: Number(row.id),
    nameEn: row.nameEn,
    nameSv: row.nameSv,
    patternKind: row.patternKind,
    ruleId: row.ruleId,
    sortOrder: Number(row.sortOrder),
    terms: [],
    windowChars: row.windowChars == null ? null : Number(row.windowChars),
  }
}

function mapTermRow(row: AiSafetyTermRow): AiSafetyRuleAdminTerm {
  if (!isAiSafetyTermType(row.termType)) {
    throw new Error(
      `Unknown AI safety term type '${row.termType}' loaded from DB.`,
    )
  }
  if (!isAiSafetyTermDirection(row.direction)) {
    throw new Error(
      `Unknown AI safety term direction '${row.direction}' loaded from DB.`,
    )
  }
  if (!isAiSafetyTermDirection(row.standardDirection)) {
    throw new Error(
      `Unknown AI safety standard term direction '${row.standardDirection}' loaded from DB.`,
    )
  }

  return {
    direction: row.direction,
    id: Number(row.id),
    isActive: toBoolean(row.isActive),
    isStandard: toBoolean(row.isStandard),
    normalizedTerm: row.normalizedTerm,
    standardDirection: row.standardDirection,
    termText: row.termText,
    termType: row.termType,
  }
}

function isPatternKind(value: string): value is AiSafetyRulePatternKind {
  return (
    value === 'paired_terms' ||
    value === 'bidirectional_pair' ||
    value === 'direct_markers'
  )
}

function assertRequiredRules(rules: readonly { ruleId: string }[]): void {
  const loaded = new Set(rules.map(rule => rule.ruleId))
  const missing = AI_SAFETY_RULE_IDS.filter(ruleId => !loaded.has(ruleId))
  if (missing.length > 0) {
    throw new Error(
      `AI safety rules are not fully seeded in the database: ${missing.join(
        ', ',
      )}.`,
    )
  }
}

function parametersForIds(ids: readonly number[]): string {
  return ids.map((_, index) => `@${index}`).join(', ')
}

async function getRuleDatabaseId(
  executor: QueryExecutor,
  ruleId: AiSafetyRuleId,
): Promise<number> {
  const rows = (await executor.query(
    `
      SELECT TOP (1) [id]
      FROM [ai_safety_rules]
      WHERE [rule_id] = @0
    `,
    [ruleId],
  )) as { id: number | string }[]
  const row = rows[0]
  if (!row) {
    throw notFoundError('AI safety rule not found', { ruleId })
  }
  return Number(row.id)
}

export async function listAiSafetyRulesForAdmin(
  db: SqlServerDatabase,
): Promise<readonly AiSafetyRuleAdminItem[]> {
  const [ruleRows, termRows] = await Promise.all([
    db.query(`
      SELECT
        [id],
        [rule_id] AS ruleId,
        [category],
        [name_sv] AS nameSv,
        [name_en] AS nameEn,
        [description_sv] AS descriptionSv,
        [description_en] AS descriptionEn,
        [pattern_kind] AS patternKind,
        [window_chars] AS windowChars,
        [sort_order] AS sortOrder
      FROM [ai_safety_rules]
      ORDER BY [sort_order], [rule_id]
    `) as Promise<AiSafetyRuleRow[]>,
    db.query(`
      SELECT
        terms.[id],
        terms.[rule_id] AS ruleDatabaseId,
        rules.[rule_id] AS ruleId,
        terms.[term_type] AS termType,
        terms.[term_text] AS termText,
        terms.[normalized_term] AS normalizedTerm,
        terms.[direction],
        terms.[standard_direction] AS standardDirection,
        terms.[is_standard] AS isStandard,
        terms.[is_active] AS isActive
      FROM [ai_safety_rule_terms] terms
      INNER JOIN [ai_safety_rules] rules ON rules.[id] = terms.[rule_id]
      ORDER BY
        rules.[sort_order],
        terms.[term_type],
        terms.[sort_order],
        terms.[term_text]
    `) as Promise<AiSafetyTermRow[]>,
  ])
  assertRequiredRules(ruleRows)

  const rules = ruleRows.map(mapRuleRow)
  const rulesById = new Map(rules.map(rule => [rule.id, rule]))
  const termsByRuleId = new Map<number, AiSafetyRuleAdminTerm[]>()

  for (const termRow of termRows) {
    const ruleDatabaseId = Number(termRow.ruleDatabaseId)
    if (!rulesById.has(ruleDatabaseId)) continue
    const terms = termsByRuleId.get(ruleDatabaseId) ?? []
    terms.push(mapTermRow(termRow))
    termsByRuleId.set(ruleDatabaseId, terms)
  }

  return rules.map(rule => ({
    ...rule,
    terms: termsByRuleId.get(rule.id) ?? [],
  }))
}

export async function getCachedAiSafetyRuleSet(
  db: SqlServerDatabase,
): Promise<ActiveAiSafetyRuleSet> {
  if (cachedRuleSet && cachedRuleSet.expiresAt > Date.now()) {
    return cachedRuleSet.value
  }

  const settings = await getAiGenerationSettings(db)
  const rules = await listAiSafetyRulesForAdmin(db)
  assertRequiredRules(rules)
  const value: ActiveAiSafetyRuleSet = {
    rules: rules.map(rule => ({
      category: rule.category,
      patternKind: rule.patternKind,
      ruleId: rule.ruleId,
      terms: rule.terms
        .filter(term => term.isActive)
        .map(term => ({
          direction: term.direction,
          termText: term.termText,
          termType: term.termType,
        })),
      windowChars: rule.windowChars,
    })),
  }

  cachedRuleSet = {
    expiresAt: Date.now() + settings.aiSafetyRuleCacheTtlSeconds * 1000,
    value,
  }
  return value
}

export async function createAiSafetyRuleTerm(
  db: SqlServerDatabase,
  values: {
    direction: AiSafetyTermDirection
    ruleId: AiSafetyRuleId
    termText: string
    termType: AiSafetyTermType
  },
): Promise<AiSafetyRuleAdminTerm> {
  const normalizedTerm = assertTermText(values.termText)
  const direction = assertTermDirection(values.direction)
  const termType = assertTermType(values.termType)
  const now = new Date().toISOString()
  let insertedId: number | undefined

  await db.transaction(async manager => {
    const ruleDatabaseId = await getRuleDatabaseId(manager, values.ruleId)
    const existing = (await manager.query(
      `
        SELECT TOP (1) [id]
        FROM [ai_safety_rule_terms]
        WHERE [rule_id] = @0
          AND [term_type] = @1
          AND [normalized_term] = @2
      `,
      [ruleDatabaseId, termType, normalizedTerm],
    )) as { id: number | string }[]
    if (existing[0]) {
      throw conflictError('AI safety term already exists', {
        reason: 'duplicate_term',
        termId: Number(existing[0].id),
      })
    }

    const rows = (await manager.query(
      `
        INSERT INTO [ai_safety_rule_terms] (
          [rule_id],
          [term_type],
          [term_text],
          [normalized_term],
          [direction],
          [standard_direction],
          [is_standard],
          [is_active],
          [sort_order],
          [created_at],
          [updated_at]
        )
        OUTPUT inserted.[id]
        SELECT
          @0,
          @1,
          @2,
          @3,
          @4,
          @4,
          0,
          1,
          COALESCE(MAX([sort_order]), 0) + 1,
          @5,
          @5
        FROM [ai_safety_rule_terms]
        WHERE [rule_id] = @0
          AND [term_type] = @1
      `,
      [
        ruleDatabaseId,
        termType,
        values.termText.trim().replace(/\s+/g, ' '),
        normalizedTerm,
        direction,
        now,
      ],
    )) as { id: number | string }[]
    insertedId = Number(rows[0]?.id)
  })

  clearAiSafetyRuleSetCache()
  if (!insertedId) {
    throw new Error('Created AI safety term id was not returned.')
  }
  return getAiSafetyRuleTermById(db, insertedId)
}

export async function updateAiSafetyRuleTerm(
  db: SqlServerDatabase,
  termId: number,
  values: {
    direction?: AiSafetyTermDirection
    isActive?: boolean
  },
): Promise<AiSafetyRuleAdminTerm> {
  if (!Number.isInteger(termId) || termId <= 0) {
    throw validationError('Expected a positive AI safety term id', {
      reason: 'invalid_term_id',
    })
  }
  if (values.direction === undefined && values.isActive === undefined) {
    throw validationError('AI safety term update is empty', {
      reason: 'empty_update',
    })
  }
  if (values.direction !== undefined) assertTermDirection(values.direction)
  const now = new Date().toISOString()

  await db.transaction(async manager => {
    await assertTermExists(manager, termId)
    await manager.query(
      `
        UPDATE [ai_safety_rule_terms]
        SET
          [direction] = COALESCE(@1, [direction]),
          [is_active] = COALESCE(@2, [is_active]),
          [updated_at] = @3
        WHERE [id] = @0
      `,
      [
        termId,
        values.direction ?? null,
        values.isActive === undefined ? null : values.isActive,
        now,
      ],
    )
  })

  clearAiSafetyRuleSetCache()
  return getAiSafetyRuleTermById(db, termId)
}

export async function deleteCustomAiSafetyRuleTerm(
  db: SqlServerDatabase,
  termId: number,
): Promise<AiSafetyRuleAdminTerm> {
  if (!Number.isInteger(termId) || termId <= 0) {
    throw validationError('Expected a positive AI safety term id', {
      reason: 'invalid_term_id',
    })
  }
  let deleted: AiSafetyRuleAdminTerm | undefined

  await db.transaction(async manager => {
    const term = await getAiSafetyRuleTermById(manager, termId)
    if (term.isStandard) {
      throw conflictError('Standard AI safety terms can only be deactivated', {
        reason: 'standard_term_delete_forbidden',
        termId,
      })
    }
    await manager.query(`DELETE FROM [ai_safety_rule_terms] WHERE [id] = @0`, [
      termId,
    ])
    deleted = term
  })

  clearAiSafetyRuleSetCache()
  if (!deleted) throw new Error('Deleted AI safety term was not loaded.')
  return deleted
}

export async function removeAiSafetyRuleTerms(
  db: SqlServerDatabase,
  termIds: readonly number[],
): Promise<RemoveAiSafetyRuleTermsResult> {
  const ids = assertPositiveIds(termIds)
  let result: RemoveAiSafetyRuleTermsResult = {
    deactivatedStandardCount: 0,
    deletedCustomCount: 0,
  }
  const idList = parametersForIds(ids)
  const now = new Date().toISOString()

  await db.transaction(async manager => {
    const rows = (await manager.query(
      `
        SELECT [id], [is_standard] AS isStandard
        FROM [ai_safety_rule_terms]
        WHERE [id] IN (${idList})
      `,
      [...ids],
    )) as { id: number | string; isStandard: boolean | number | string }[]
    if (rows.length !== ids.length) {
      throw notFoundError('One or more AI safety terms were not found', {
        reason: 'term_not_found',
      })
    }

    const standardIds = rows
      .filter(row => toBoolean(row.isStandard))
      .map(row => Number(row.id))
    const customIds = rows
      .filter(row => !toBoolean(row.isStandard))
      .map(row => Number(row.id))

    if (standardIds.length > 0) {
      await manager.query(
        `
          UPDATE [ai_safety_rule_terms]
          SET [is_active] = 0, [updated_at] = @${standardIds.length}
          WHERE [id] IN (${parametersForIds(standardIds)})
        `,
        [...standardIds, now],
      )
    }

    if (customIds.length > 0) {
      await manager.query(
        `
          DELETE FROM [ai_safety_rule_terms]
          WHERE [id] IN (${parametersForIds(customIds)})
        `,
        [...customIds],
      )
    }

    result = {
      deactivatedStandardCount: standardIds.length,
      deletedCustomCount: customIds.length,
    }
  })

  clearAiSafetyRuleSetCache()
  return result
}

export async function restoreAiSafetyRuleDefaults(
  db: SqlServerDatabase,
  ruleId: AiSafetyRuleId,
): Promise<number> {
  let affectedCount = 0
  const now = new Date().toISOString()
  await db.transaction(async manager => {
    const ruleDatabaseId = await getRuleDatabaseId(manager, ruleId)
    const result = (await manager.query(
      `
        UPDATE [ai_safety_rule_terms]
        SET
          [direction] = [standard_direction],
          [is_active] = 1,
          [updated_at] = @1
        WHERE [rule_id] = @0
          AND [is_standard] = 1
      `,
      [ruleDatabaseId, now],
    )) as unknown
    affectedCount = readAffectedCount(result)
  })

  clearAiSafetyRuleSetCache()
  return affectedCount
}

async function assertTermExists(
  executor: QueryExecutor,
  termId: number,
): Promise<void> {
  const rows = (await executor.query(
    `
      SELECT TOP (1) [id]
      FROM [ai_safety_rule_terms]
      WHERE [id] = @0
    `,
    [termId],
  )) as { id: number | string }[]
  if (!rows[0]) {
    throw notFoundError('AI safety term not found', { termId })
  }
}

export async function getAiSafetyRuleTermById(
  executor: QueryExecutor | SqlServerDatabase | SqlServerEntityManager,
  termId: number,
): Promise<AiSafetyRuleAdminTerm> {
  const rows = (await executor.query(
    `
      SELECT TOP (1)
        terms.[id],
        terms.[rule_id] AS ruleDatabaseId,
        rules.[rule_id] AS ruleId,
        terms.[term_type] AS termType,
        terms.[term_text] AS termText,
        terms.[normalized_term] AS normalizedTerm,
        terms.[direction],
        terms.[standard_direction] AS standardDirection,
        terms.[is_standard] AS isStandard,
        terms.[is_active] AS isActive
      FROM [ai_safety_rule_terms] terms
      INNER JOIN [ai_safety_rules] rules ON rules.[id] = terms.[rule_id]
      WHERE terms.[id] = @0
    `,
    [termId],
  )) as AiSafetyTermRow[]
  const row = rows[0]
  if (!row) throw notFoundError('AI safety term not found', { termId })
  return mapTermRow(row)
}

function readAffectedCount(result: unknown): number {
  if (Array.isArray(result)) {
    const record = result.find(
      value =>
        value &&
        typeof value === 'object' &&
        'affectedRows' in value &&
        typeof value.affectedRows === 'number',
    ) as { affectedRows?: number } | undefined
    return record?.affectedRows ?? 0
  }
  if (
    result &&
    typeof result === 'object' &&
    'affected' in result &&
    typeof result.affected === 'number'
  ) {
    return result.affected
  }
  return 0
}

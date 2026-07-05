import { createHash, randomBytes } from 'node:crypto'
import { getCachedMcpRuntimeSettings } from '@/lib/dal/ai-settings'
import { listNormReferences } from '@/lib/dal/norm-references'
import { listPriorityLevels } from '@/lib/dal/priority-levels'
import {
  getAreaById,
  listAreasActorCanAuthor,
  type RequirementAreaRow,
} from '@/lib/dal/requirement-areas'
import { listCategories } from '@/lib/dal/requirement-categories'
import {
  createRequirementImportValidationSession,
  getRequirementImportValidationSessionByTokenHash,
  purgeExpiredRequirementImportValidationSessions,
  type RequirementImportValidationSessionRecord,
  updateRequirementImportValidationSessionExecutionResult,
} from '@/lib/dal/requirement-import-validation-sessions'
import { listRequirementPackages } from '@/lib/dal/requirement-packages'
import {
  listTypes,
  type QualityCharacteristicRow,
} from '@/lib/dal/requirement-types'
import {
  createRequirementsBatch,
  createRequirementsBatchWithExecutor,
  type RequirementMutationData,
} from '@/lib/dal/requirements'
import {
  createSpecificationLocalRequirementsBatch,
  createSpecificationLocalRequirementsBatchWithExecutor,
  getSpecificationById,
  getSpecificationBySlug,
  listSpecificationsForActor,
  type SpecificationLocalRequirementMutationInput,
} from '@/lib/dal/requirements-specifications'
import type { SqlServerDatabase } from '@/lib/db'
import {
  type AuthorizationService,
  type RequestContext,
  requireHumanActorSnapshot,
} from '@/lib/requirements/auth'
import {
  conflictError,
  isRequirementsServiceError,
  notFoundError,
  validationError,
} from '@/lib/requirements/errors'
import {
  buildRequirementsImportJsonSchema,
  type ImportExecuteBody,
  type ImportRequirement,
  type ImportRequirementsPayload,
  type ImportReviewRowInput,
  type JsonSchema,
  REQUIREMENTS_IMPORT_SCHEMA_VERSION,
  requirementsImportPayloadSchema,
} from '@/lib/requirements/import-schema'
import {
  createRequirementsLogger,
  type RequirementsLogger,
} from '@/lib/requirements/logging'
import {
  compareMcpSearchMatches,
  findMcpSearchMatch,
  type McpSearchMatch,
} from '@/lib/requirements/mcp-search'
import { recordSensitiveMutationSucceededWithExecutor } from '@/lib/requirements/security-audit'
import { authorize, withLogging } from '@/lib/requirements/service-shared'

export type RequirementsImportMode = 'library' | 'specification-local'

interface ImportReferenceData {
  categories: Awaited<ReturnType<typeof listCategories>>
  normReferences: Awaited<ReturnType<typeof listNormReferences>>
  priorityLevels: Awaited<ReturnType<typeof listPriorityLevels>>
  qualityCharacteristics: QualityCharacteristicRow[]
  requirementPackages: Awaited<ReturnType<typeof listRequirementPackages>>
  types: Awaited<ReturnType<typeof listTypes>>
}

export interface ImportMessage {
  code: McpImportIssueCode
  field?: string
  level: 'error' | 'info' | 'warning'
  message: string
  originalValue?: string
}

export interface RequirementsImportPreviewRow {
  errors: ImportMessage[]
  infos: ImportMessage[]
  labels: {
    category: string | null
    priorityLevel: string | null
    qualityCharacteristic: string | null
    type: string | null
  }
  proposedNormReferenceKeys: string[]
  reviewRowId: string
  selected: boolean
  sourceIndex: number
  values: {
    acceptanceCriteria: string | null
    categoryId: number | null
    description: string
    needsReferenceId: number | null
    normReferenceIds: number[]
    qualityCharacteristicId: number | null
    requirementPackageIds: number[]
    verifiable: boolean
    priorityLevelId: number | null
    typeId: number | null
    verificationMethod: string | null
  }
  warnings: ImportMessage[]
}

export interface RequirementsImportProposalPreview {
  issuer: string
  key: string
  name: string
  normReferenceId: string | null
  reference: string
  referencedCount: number
  resolvedIsArchived: boolean
  resolvedNormReferenceDbId: number | null
  type: string
  uri: string | null
  version: string | null
  warnings: ImportMessage[]
}

export interface RequirementsImportPreview {
  mode: RequirementsImportMode
  previewToken: string
  proposals: RequirementsImportProposalPreview[]
  rows: RequirementsImportPreviewRow[]
  summary: {
    errorCount: number
    rowCount: number
    warningCount: number
  }
}

export interface RequirementsImportReceiptRow {
  acceptanceCriteria: string | null
  categoryId: number | null
  categoryName: string | null
  createdDatabaseId: number
  createdVisibleId: string
  description: string
  importMode: RequirementsImportMode
  needsReferenceId: number | null
  normReferences: string[]
  priorityLevelId: number | null
  priorityLevelName: string | null
  qualityCharacteristicId: number | null
  qualityCharacteristicName: string | null
  requirementPackageIds: number[]
  requirementPackageNames: string[]
  sourceIndex: number
  targetAreaId: number | null
  targetSpecificationId: number | null
  typeId: number | null
  typeName: string | null
  verifiable: boolean
  verificationMethod: string | null
}

export interface RequirementsImportExecuteResult {
  createdRows: RequirementsImportReceiptRow[]
  mode: RequirementsImportMode
  summary: {
    createdCount: number
  }
}

export type McpImportDestination =
  | {
      areaId: number
      kind: 'requirements_library'
      name: string
      prefix: string
    }
  | {
      kind: 'requirements_specification'
      name: string
      specificationId: number
      uniqueId: string
    }

export type McpImportDestinationRef =
  | {
      areaId: number
      kind: 'requirements_library'
    }
  | {
      kind: 'requirements_specification'
      specificationId: number
    }

export const MCP_IMPORT_ISSUE_CODES = [
  'import_destination_invalid',
  'import_duplicate_norm_references_collapsed',
  'import_duplicate_requirement_packages_collapsed',
  'import_invalid_id_name_used',
  'import_invalid_id_omitted',
  'import_invalid_requirement_package_id',
  'import_name_ambiguous',
  'import_name_disagrees_with_id',
  'import_name_ignored',
  'import_name_unresolved',
  'import_norm_reference_archived',
  'import_norm_reference_unresolved',
  'import_payload_size_cap_exceeded',
  'import_proposed_norm_reference_archived',
  'import_proposed_norm_reference_business_id_unresolved',
  'import_proposed_norm_reference_key_missing',
  'import_proposed_norm_reference_unresolved',
  'import_proposed_norm_reference_unused',
  'import_quality_characteristic_type_mismatch',
  'import_reference_data_stale',
  'import_requirement_package_name_ambiguous',
  'import_requirement_package_name_unresolved',
  'import_requirement_packages_ignored_for_specification_local',
  'import_row_count_cap_exceeded',
  'import_schema_invalid',
  'import_schema_invalid_enum',
  'import_schema_invalid_type',
  'import_schema_missing_required',
  'import_schema_unrecognized_field',
  'import_verification_method_ignored_for_non_verifiable',
  'import_verification_method_required',
] as const

export type McpImportIssueCode = (typeof MCP_IMPORT_ISSUE_CODES)[number]

const MCP_IMPORT_ISSUE_CODE_SET = new Set<string>(MCP_IMPORT_ISSUE_CODES)

function assertMcpImportIssueCode(code: string): McpImportIssueCode {
  if (MCP_IMPORT_ISSUE_CODE_SET.has(code)) {
    return code as McpImportIssueCode
  }

  throw validationError('Unknown MCP import issue code', {
    issueCode: code,
    reason: 'unknown_mcp_import_issue_code',
  })
}

export interface McpImportIssue {
  code: McpImportIssueCode
  details?: Record<string, unknown>
  message: string
  path: string
  severity: 'error' | 'warning'
}

export type McpImportDestinationRow = McpImportDestination & {
  match?: McpSearchMatch
}

interface McpResolvedImportRow {
  acceptanceCriteria?: string | null
  categoryId?: number | null
  description?: string
  normReferenceIds?: string[]
  priorityLevelId?: number | null
  qualityCharacteristicId?: number | null
  requirementPackageIds?: number[]
  typeId?: number | null
  verifiable?: boolean
  verificationMethod?: string
}

interface McpValidatedImportRow {
  issues: McpImportIssue[]
  resolvedRow: McpResolvedImportRow
  reviewRowId: string
  sourceIndex: number
}

interface McpValidatedImportProposal {
  issues: McpImportIssue[]
  key: string
  path: string
  proposalIndex: number
  referencedSourceIndexes: number[]
}

interface McpImportValidationSessionJson {
  proposals: McpValidatedImportProposal[]
  referenceData: {
    includes: string[]
  }
  rows: McpValidatedImportRow[]
  schemaVersion: 'mcp-requirement-import-validation.v1'
}

interface McpImportedSessionRow {
  importedAt: string
  kravId?: string
  localKravId?: string
  reviewRowId: string
  sourceIndex: number
  uniqueId: string
}

interface McpImportExecutionSessionJson {
  importedRows: McpImportedSessionRow[]
  schemaVersion: 'mcp-requirement-import-execution.v1'
}

export type ManageImportInput =
  | {
      kind?: McpImportDestination['kind']
      operation: 'list_destinations'
    }
  | {
      kind?: McpImportDestination['kind']
      operation: 'search_destinations'
      search: string
    }
  | {
      destination: McpImportDestinationRef
      operation: 'validate'
      payload: unknown
    }
  | {
      operation: 'execute'
      validationToken: string
    }
  | {
      operation: 'inspect_validation'
      validationToken: string
    }

export type ManageImportOutput =
  | {
      result: McpImportDestinationRow[]
    }
  | {
      expiresAt?: string
      hasErrors: boolean
      hasWarnings: boolean
      issues: McpImportIssue[]
      validationToken?: string
    }
  | {
      destination: McpImportDestination
      importedRows: McpImportedSessionRow[]
      notImportedRows: Array<{
        issues: McpImportIssue[]
        reviewRowId: string
        sourceIndex: number
      }>
      summary: {
        importedCount: number
        notImportedCount: number
        totalRowCount: number
      }
    }
  | {
      destination: McpImportDestination
      expiresAt: string
      payloadHash: string
      proposals: McpValidatedImportProposal[]
      referenceData: {
        currentFingerprint: string
        includes: Record<string, number>
        isStale: boolean
        storedFingerprint: string
      }
      rows: Array<
        McpValidatedImportRow & {
          imported: boolean
          importedAt?: string
          kravId?: string
          localKravId?: string
          uniqueId?: string
        }
      >
      submittedPayload: ImportRequirementsPayload
    }

export interface ImportWorkflowOptions {
  authorization: AuthorizationService
  db: SqlServerDatabase
  logger?: RequirementsLogger
}

function compactText(value: string | null | undefined): string | null {
  if (value == null) return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeJson)
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalizeJson(nested)]),
    )
  }
  return value
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalizeJson(value))
}

function hashString(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function uniqueNumbers(values: number[]): number[] {
  const seen = new Set<number>()
  const out: number[] = []
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value)
      out.push(value)
    }
  }
  return out
}

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase('sv')
}

function hashStable(value: unknown): string {
  return hashString(canonicalJson(value))
}

function createReviewToken(args: {
  destinationId: number
  mode: RequirementsImportMode
  referenceDataFingerprint: string
}) {
  return hashStable({
    destinationId: args.destinationId,
    mode: args.mode,
    referenceDataFingerprint: args.referenceDataFingerprint,
    schemaVersion: REQUIREMENTS_IMPORT_SCHEMA_VERSION,
  })
}

async function loadImportReferenceData(
  db: SqlServerDatabase,
  options: { includeArchivedNormReferences?: boolean } = {},
): Promise<ImportReferenceData> {
  const [
    categories,
    types,
    priorityLevels,
    requirementPackages,
    normReferences,
  ] = await Promise.all([
    listCategories(db),
    listTypes(db),
    listPriorityLevels(db),
    listRequirementPackages(db),
    listNormReferences(db, {
      includeArchived: options.includeArchivedNormReferences ?? false,
    }),
  ])

  return {
    categories,
    normReferences,
    qualityCharacteristics: types.flatMap(type => type.qualityCharacteristics),
    requirementPackages,
    priorityLevels,
    types,
  }
}

function referenceDataFingerprint(referenceData: ImportReferenceData): string {
  return hashStable({
    categories: referenceData.categories.map(item => ({
      id: item.id,
      nameEn: item.nameEn,
      nameSv: item.nameSv,
    })),
    normReferences: referenceData.normReferences.map(item => ({
      id: item.id,
      isArchived: item.isArchived,
      name: item.name,
      normReferenceId: item.normReferenceId,
      updatedAt: item.updatedAt,
    })),
    qualityCharacteristics: referenceData.qualityCharacteristics.map(item => ({
      id: item.id,
      nameEn: item.nameEn,
      nameSv: item.nameSv,
      parentId: item.parentId,
      requirementTypeId: item.requirementTypeId,
    })),
    requirementPackages: referenceData.requirementPackages.map(item => ({
      id: item.id,
      name: item.name,
      purposeAndScope: item.purposeAndScope,
      updatedAt: item.updatedAt,
    })),
    priorityLevels: referenceData.priorityLevels.map(item => ({
      assessmentCriteriaEn: item.assessmentCriteriaEn,
      assessmentCriteriaSv: item.assessmentCriteriaSv,
      code: item.code,
      descriptionEn: item.descriptionEn,
      descriptionSv: item.descriptionSv,
      id: item.id,
      nameEn: item.nameEn,
      nameSv: item.nameSv,
      sortOrder: item.sortOrder,
    })),
    types: referenceData.types.map(item => ({
      id: item.id,
      nameEn: item.nameEn,
      nameSv: item.nameSv,
    })),
  })
}

type ImportPromptLocale = 'en' | 'sv'

function localizedReferenceName(
  item: { nameEn: string; nameSv: string },
  locale: ImportPromptLocale,
) {
  return locale === 'sv' ? item.nameSv : item.nameEn
}

function importPromptCategories(
  referenceData: ImportReferenceData,
  locale: ImportPromptLocale,
) {
  return referenceData.categories.map(item => ({
    id: item.id,
    name: localizedReferenceName(item, locale),
  }))
}

function importPromptQualityCharacteristicsForType(
  type: { qualityCharacteristics: QualityCharacteristicRow[] },
  locale: ImportPromptLocale,
) {
  return type.qualityCharacteristics
    .filter(item => item.parentId != null)
    .map(item => ({
      chapterId: item.chapterId,
      id: item.id,
      name: localizedReferenceName(item, locale),
    }))
}

function importPromptPriorityLevels(
  referenceData: ImportReferenceData,
  locale: ImportPromptLocale,
) {
  const descriptionKey = locale === 'sv' ? 'descriptionSv' : 'descriptionEn'
  const assessmentCriteriaKey =
    locale === 'sv' ? 'assessmentCriteriaSv' : 'assessmentCriteriaEn'
  return referenceData.priorityLevels.map(item => ({
    assessmentCriteria: item[assessmentCriteriaKey],
    code: item.code,
    description: item[descriptionKey],
    id: item.id,
    name: localizedReferenceName(item, locale),
  }))
}

function importPromptTypes(
  referenceData: ImportReferenceData,
  locale: ImportPromptLocale,
) {
  return referenceData.types.map(item => ({
    id: item.id,
    name: localizedReferenceName(item, locale),
    qualityCharacteristics: importPromptQualityCharacteristicsForType(
      item,
      locale,
    ),
  }))
}

function warning(
  code: McpImportIssueCode,
  message: string,
  options: { field?: string; originalValue?: string } = {},
): ImportMessage {
  return { code, level: 'warning', message, ...options }
}

function info(
  code: McpImportIssueCode,
  message: string,
  options: { field?: string; originalValue?: string } = {},
): ImportMessage {
  return { code, level: 'info', message, ...options }
}

function error(
  code: McpImportIssueCode,
  message: string,
  options: { field?: string; originalValue?: string } = {},
): ImportMessage {
  return { code, level: 'error', message, ...options }
}

function createNameMatcher<
  T extends { id: number; nameEn: string; nameSv: string },
>(items: T[]) {
  return (name: string | null | undefined): T[] => {
    const normalized = compactText(name)
    if (!normalized) return []
    const target = normalizeName(normalized)
    return items.filter(
      item =>
        normalizeName(item.nameEn) === target ||
        normalizeName(item.nameSv) === target,
    )
  }
}

function createPriorityLevelMatcher(
  items: ImportReferenceData['priorityLevels'],
) {
  return (value: string | null | undefined) => {
    const normalized = compactText(value)
    if (!normalized) return []
    const target = normalizeName(normalized)
    return items.filter(
      item =>
        normalizeName(item.code) === target ||
        normalizeName(item.nameEn) === target ||
        normalizeName(item.nameSv) === target,
    )
  }
}

function resolveScalarReference<T extends { id: number }>(args: {
  field: string
  id: number | null | undefined
  items: T[]
  label: string
  name?: string | null
  nameMatches: (name: string | null | undefined) => T[]
  warnings: ImportMessage[]
}): number | null {
  const validId =
    args.id == null ? null : args.items.find(item => item.id === args.id)
  const name = compactText(args.name)
  const matches = args.nameMatches(name)
  const nameMatch = matches.length === 1 ? matches[0] : null

  if (validId) {
    if (name && nameMatch && nameMatch.id !== validId.id) {
      args.warnings.push(
        warning(
          'import_name_disagrees_with_id',
          `${args.field} name points to another ${args.label}; the numeric ID was used.`,
          { field: args.field, originalValue: name },
        ),
      )
    } else if (name && matches.length !== 1) {
      args.warnings.push(
        warning(
          'import_name_ignored',
          `${args.field} name could not be resolved; the numeric ID was used.`,
          { field: args.field, originalValue: name },
        ),
      )
    }
    return validId.id
  }

  if (args.id != null && nameMatch) {
    args.warnings.push(
      warning(
        'import_invalid_id_name_used',
        `${args.field} ID was not found; the matching name was used.`,
        { field: args.field, originalValue: String(args.id) },
      ),
    )
    return nameMatch.id
  }

  if (args.id != null && !nameMatch) {
    args.warnings.push(
      warning(
        'import_invalid_id_omitted',
        `${args.field} ID was not found and will not be saved.`,
        { field: args.field, originalValue: String(args.id) },
      ),
    )
    return null
  }

  if (!name) return null
  if (nameMatch) return nameMatch.id

  args.warnings.push(
    warning(
      matches.length > 1 ? 'import_name_ambiguous' : 'import_name_unresolved',
      `${args.field} name could not be resolved uniquely and will not be saved.`,
      { field: args.field, originalValue: name },
    ),
  )
  return null
}

function resolvePackageIds(
  row: ImportRequirement,
  referenceData: ImportReferenceData,
  warnings: ImportMessage[],
): number[] {
  const ids: number[] = []
  const validPackages = referenceData.requirementPackages
  const packageById = new Map(validPackages.map(item => [item.id, item]))
  for (const id of row.requirementPackageIds ?? []) {
    if (packageById.has(id)) {
      ids.push(id)
    } else {
      warnings.push(
        warning(
          'import_invalid_requirement_package_id',
          'Requirement package ID was not found and will not be saved.',
          { field: 'requirementPackageIds', originalValue: String(id) },
        ),
      )
    }
  }

  for (const rawName of row.requirementPackageNames ?? []) {
    const name = rawName.trim()
    const matches = validPackages.filter(
      item => normalizeName(item.name) === normalizeName(name),
    )
    if (matches.length === 1) {
      ids.push(matches[0].id)
    } else {
      warnings.push(
        warning(
          matches.length > 1
            ? 'import_requirement_package_name_ambiguous'
            : 'import_requirement_package_name_unresolved',
          'Requirement package name could not be resolved uniquely and will not be saved.',
          { field: 'requirementPackageNames', originalValue: name },
        ),
      )
    }
  }

  const unique = uniqueNumbers(ids)
  if (unique.length !== ids.length) {
    warnings.push(
      warning(
        'import_duplicate_requirement_packages_collapsed',
        'Duplicate requirement package links were collapsed.',
        { field: 'requirementPackageIds' },
      ),
    )
  }
  return unique
}

function hasRequirementPackageInput(row: ImportRequirement): boolean {
  return (
    (row.requirementPackageIds?.length ?? 0) > 0 ||
    (row.requirementPackageNames?.some(name => compactText(name) != null) ??
      false)
  )
}

function resolveNormReferenceIds(
  row: ImportRequirement,
  proposalsByKey: Map<string, RequirementsImportProposalPreview>,
  referenceData: ImportReferenceData,
  warnings: ImportMessage[],
): number[] {
  const ids: number[] = []
  const normRefByBusinessId = new Map(
    referenceData.normReferences.map(item => [item.normReferenceId, item]),
  )

  for (const rawBusinessId of row.normReferenceIds ?? []) {
    const businessId = rawBusinessId.trim()
    const match = normRefByBusinessId.get(businessId)
    if (match && !match.isArchived) {
      ids.push(match.id)
    } else if (match?.isArchived) {
      warnings.push(
        warning(
          'import_norm_reference_archived',
          'Norm reference ID is archived and will not be saved.',
          { field: 'normReferenceIds', originalValue: businessId },
        ),
      )
    } else {
      warnings.push(
        warning(
          'import_norm_reference_unresolved',
          'Norm reference ID was not found and will not be saved.',
          { field: 'normReferenceIds', originalValue: businessId },
        ),
      )
    }
  }

  for (const rawKey of row.proposedNormReferenceKeys ?? []) {
    const key = rawKey.trim()
    const proposal = proposalsByKey.get(key)
    if (!proposal) {
      warnings.push(
        warning(
          'import_proposed_norm_reference_key_missing',
          'Proposed norm reference key was not found and will not be saved.',
          { field: 'proposedNormReferenceKeys', originalValue: key },
        ),
      )
      continue
    }
    if (proposal.resolvedIsArchived) {
      warnings.push(
        warning(
          'import_proposed_norm_reference_archived',
          'Proposed norm reference resolves to an archived norm reference and will not be saved.',
          { field: 'proposedNormReferenceKeys', originalValue: key },
        ),
      )
    } else if (proposal.resolvedNormReferenceDbId != null) {
      const match = referenceData.normReferences.find(
        item => item.id === proposal.resolvedNormReferenceDbId,
      )
      if (match && !match.isArchived) {
        ids.push(proposal.resolvedNormReferenceDbId)
      } else {
        warnings.push(
          warning(
            'import_proposed_norm_reference_archived',
            'Proposed norm reference resolves to an archived norm reference and will not be saved.',
            { field: 'proposedNormReferenceKeys', originalValue: key },
          ),
        )
      }
    } else {
      warnings.push(
        warning(
          'import_proposed_norm_reference_unresolved',
          'Proposed norm reference is unresolved and will not be saved.',
          { field: 'proposedNormReferenceKeys', originalValue: key },
        ),
      )
    }
  }

  const unique = uniqueNumbers(ids)
  if (unique.length !== ids.length) {
    warnings.push(
      warning(
        'import_duplicate_norm_references_collapsed',
        'Duplicate norm reference links were collapsed.',
        { field: 'normReferenceIds' },
      ),
    )
  }
  return unique
}

function previewProposals(
  payload: ImportRequirementsPayload,
  referenceData: ImportReferenceData,
): RequirementsImportProposalPreview[] {
  const referencedCounts = new Map<string, number>()
  for (const row of payload.requirements) {
    const seenInRow = new Set<string>()
    for (const rawKey of row.proposedNormReferenceKeys ?? []) {
      const key = rawKey.trim()
      if (seenInRow.has(key)) continue
      seenInRow.add(key)
      referencedCounts.set(key, (referencedCounts.get(key) ?? 0) + 1)
    }
  }

  const normRefByBusinessId = new Map(
    referenceData.normReferences.map(item => [item.normReferenceId, item]),
  )

  return (payload.proposedNormReferences ?? []).map(proposal => {
    const explicitNormReferenceId = compactText(proposal.normReferenceId)
    const resolutionBusinessId = explicitNormReferenceId ?? proposal.key
    const resolved = normRefByBusinessId.get(resolutionBusinessId)
    const resolvedIsArchived = resolved?.isArchived ?? false
    const referencedCount = referencedCounts.get(proposal.key) ?? 0
    const warnings: ImportMessage[] = []
    if (referencedCount === 0) {
      warnings.push(
        warning(
          'import_proposed_norm_reference_unused',
          'Proposed norm reference is not used by any imported row.',
          { field: 'proposedNormReferences', originalValue: proposal.key },
        ),
      )
    }
    if (explicitNormReferenceId && !resolved) {
      warnings.push(
        warning(
          'import_proposed_norm_reference_business_id_unresolved',
          'Proposed norm reference business ID was not found.',
          {
            field: 'proposedNormReferences.normReferenceId',
            originalValue: explicitNormReferenceId,
          },
        ),
      )
    }
    if (resolvedIsArchived) {
      warnings.push(
        warning(
          'import_proposed_norm_reference_archived',
          'Proposed norm reference resolves to an archived norm reference.',
          {
            field: 'proposedNormReferences.normReferenceId',
            originalValue: resolutionBusinessId,
          },
        ),
      )
    }
    return {
      issuer: proposal.issuer,
      key: proposal.key,
      name: proposal.name,
      normReferenceId: explicitNormReferenceId,
      reference: proposal.reference,
      referencedCount,
      resolvedNormReferenceDbId:
        resolved && !resolved.isArchived ? resolved.id : null,
      resolvedIsArchived,
      type: proposal.type,
      uri: compactText(proposal.uri),
      version: compactText(proposal.version),
      warnings,
    }
  })
}

function previewRows(args: {
  locale: 'en' | 'sv'
  mode: RequirementsImportMode
  payload: ImportRequirementsPayload
  proposals: RequirementsImportProposalPreview[]
  referenceData: ImportReferenceData
}): RequirementsImportPreviewRow[] {
  const categoryMatches = createNameMatcher(args.referenceData.categories)
  const typeMatches = createNameMatcher(args.referenceData.types)
  const priorityLevelMatches = createPriorityLevelMatcher(
    args.referenceData.priorityLevels,
  )
  const proposalsByKey = new Map(args.proposals.map(item => [item.key, item]))

  return args.payload.requirements.map((row, sourceIndex) => {
    const warnings: ImportMessage[] = []
    const errors: ImportMessage[] = []
    const infos: ImportMessage[] = []
    const description = row.description.trim()
    const acceptanceCriteria = compactText(row.acceptanceCriteria)
    const explicitVerifiable = row.verifiable
    const verificationMethod = compactText(row.verificationMethod)
    const verifiable =
      explicitVerifiable == null
        ? verificationMethod != null
        : explicitVerifiable
    if (explicitVerifiable === false && verificationMethod != null) {
      warnings.push(
        warning(
          'import_verification_method_ignored_for_non_verifiable',
          'verificationMethod is ignored because verifiable is false.',
          { field: 'verificationMethod' },
        ),
      )
    }

    const typeId = resolveScalarReference({
      field: 'typeId',
      id: row.typeId,
      items: args.referenceData.types,
      label: 'requirement type',
      name: row.typeName,
      nameMatches: typeMatches,
      warnings,
    })
    const qualityCharacteristicMatches = (
      name: string | null | undefined,
    ): QualityCharacteristicRow[] => {
      const normalized = compactText(name)
      if (!normalized) return []
      const target = normalizeName(normalized)
      const matches = args.referenceData.qualityCharacteristics.filter(
        item =>
          normalizeName(item.nameEn) === target ||
          normalizeName(item.nameSv) === target,
      )
      return typeId == null
        ? matches
        : matches.filter(item => item.requirementTypeId === typeId)
    }

    const requirementPackageIds =
      args.mode === 'library'
        ? resolvePackageIds(row, args.referenceData, warnings)
        : []
    if (
      args.mode === 'specification-local' &&
      hasRequirementPackageInput(row)
    ) {
      infos.push(
        info(
          'import_requirement_packages_ignored_for_specification_local',
          'Requirement packages in the import file are not used for specification-local requirements.',
          { field: 'requirementPackageIds' },
        ),
      )
    }

    const values = {
      acceptanceCriteria,
      categoryId: resolveScalarReference({
        field: 'categoryId',
        id: row.categoryId,
        items: args.referenceData.categories,
        label: 'requirement category',
        name: row.categoryName,
        nameMatches: categoryMatches,
        warnings,
      }),
      description,
      needsReferenceId: null,
      normReferenceIds: resolveNormReferenceIds(
        row,
        proposalsByKey,
        args.referenceData,
        warnings,
      ),
      qualityCharacteristicId: resolveScalarReference({
        field: 'qualityCharacteristicId',
        id: row.qualityCharacteristicId,
        items: args.referenceData.qualityCharacteristics,
        label: 'quality characteristic',
        name: row.qualityCharacteristicName,
        nameMatches: qualityCharacteristicMatches,
        warnings,
      }),
      requirementPackageIds,
      verifiable,
      priorityLevelId: resolveScalarReference({
        field: 'priorityLevelId',
        id: row.priorityLevelId,
        items: args.referenceData.priorityLevels,
        label: 'priority level',
        name: row.priorityLevelCode ?? row.priorityLevelName,
        nameMatches: priorityLevelMatches,
        warnings,
      }),
      typeId,
      verificationMethod: verifiable ? verificationMethod : null,
    }
    const selectedQualityCharacteristic =
      values.qualityCharacteristicId == null
        ? null
        : args.referenceData.qualityCharacteristics.find(
            item => item.id === values.qualityCharacteristicId,
          )
    if (
      values.typeId != null &&
      selectedQualityCharacteristic &&
      selectedQualityCharacteristic.requirementTypeId !== values.typeId
    ) {
      errors.push(
        error(
          'import_quality_characteristic_type_mismatch',
          'qualityCharacteristicId must belong to the selected typeId. Search quality_characteristics filtered by typeId and update the row.',
          {
            field: 'qualityCharacteristicId',
            originalValue: String(values.qualityCharacteristicId),
          },
        ),
      )
    }
    const labels = {
      category: receiptName(
        args.referenceData.categories,
        values.categoryId,
        args.locale,
      ),
      priorityLevel: receiptPriorityName(
        args.referenceData.priorityLevels,
        values.priorityLevelId,
        args.locale,
      ),
      qualityCharacteristic: receiptName(
        args.referenceData.qualityCharacteristics,
        values.qualityCharacteristicId,
        args.locale,
      ),
      type: receiptName(args.referenceData.types, values.typeId, args.locale),
    }

    if (values.verifiable && !values.verificationMethod) {
      errors.push(
        error(
          'import_verification_method_required',
          'Verification method is required when verifiable is true.',
          { field: 'verificationMethod' },
        ),
      )
    }

    return {
      errors,
      infos,
      labels,
      proposedNormReferenceKeys: [
        ...new Set(
          (row.proposedNormReferenceKeys ?? []).map(key => key.trim()),
        ),
      ],
      reviewRowId: `row-${sourceIndex}`,
      selected: true,
      sourceIndex,
      values,
      warnings,
    }
  })
}

function validateExecuteRows(args: {
  mode: RequirementsImportMode
  referenceData: ImportReferenceData
  rows: ImportReviewRowInput[]
}) {
  const categories = new Set(args.referenceData.categories.map(item => item.id))
  const normReferences = new Set(
    args.referenceData.normReferences.map(item => item.id),
  )
  const priorityLevels = new Set(
    args.referenceData.priorityLevels.map(item => item.id),
  )
  const requirementPackages = new Set(
    args.referenceData.requirementPackages.map(item => item.id),
  )
  const types = new Set(args.referenceData.types.map(item => item.id))
  const qualityCharacteristics = new Map(
    args.referenceData.qualityCharacteristics.map(item => [item.id, item]),
  )

  const assertScalar = (
    field: string,
    id: number | null | undefined,
    knownIds: Set<number>,
  ) => {
    if (id != null && !knownIds.has(id)) {
      throw validationError(
        `${field} references unknown import reference id ${id}`,
      )
    }
  }

  const assertArray = (field: string, ids: number[], knownIds: Set<number>) => {
    for (const id of ids) {
      if (!knownIds.has(id)) {
        throw validationError(
          `${field} references unknown import reference id ${id}`,
        )
      }
    }
  }

  for (const row of args.rows) {
    assertScalar('categoryId', row.categoryId, categories)
    assertScalar('priorityLevelId', row.priorityLevelId, priorityLevels)
    assertScalar('typeId', row.typeId, types)
    assertArray('normReferenceIds', row.normReferenceIds, normReferences)
    if (args.mode === 'library') {
      assertArray(
        'requirementPackageIds',
        row.requirementPackageIds,
        requirementPackages,
      )
    }

    const qualityCharacteristic =
      row.qualityCharacteristicId == null
        ? null
        : qualityCharacteristics.get(row.qualityCharacteristicId)
    if (row.qualityCharacteristicId != null && !qualityCharacteristic) {
      throw validationError(
        `qualityCharacteristicId references unknown import reference id ${row.qualityCharacteristicId}`,
      )
    }
    if (
      row.typeId != null &&
      qualityCharacteristic &&
      qualityCharacteristic.requirementTypeId !== row.typeId
    ) {
      throw validationError(
        'qualityCharacteristicId must belong to the selected typeId',
      )
    }
    if (row.verifiable && !compactText(row.verificationMethod)) {
      throw validationError(
        'verificationMethod is required when verifiable is true',
      )
    }
  }
}

function previewFromReferenceData(args: {
  destinationId: number
  locale: 'en' | 'sv'
  mode: RequirementsImportMode
  payload: ImportRequirementsPayload
  referenceData: ImportReferenceData
}): RequirementsImportPreview {
  const proposals = previewProposals(args.payload, args.referenceData)
  const rows = previewRows({
    locale: args.locale,
    mode: args.mode,
    payload: args.payload,
    proposals,
    referenceData: args.referenceData,
  })
  const proposalWarningCount = proposals.reduce(
    (count, proposal) => count + proposal.warnings.length,
    0,
  )
  const rowWarningCount = rows.reduce(
    (count, row) => count + row.warnings.length,
    0,
  )
  const errorCount = rows.reduce((count, row) => count + row.errors.length, 0)
  return {
    mode: args.mode,
    previewToken: createReviewToken({
      destinationId: args.destinationId,
      mode: args.mode,
      referenceDataFingerprint: referenceDataFingerprint(args.referenceData),
    }),
    proposals,
    rows,
    summary: {
      errorCount,
      rowCount: rows.length,
      warningCount: proposalWarningCount + rowWarningCount,
    },
  }
}

async function resolveSpecificationId(
  db: SqlServerDatabase,
  idOrSlug: string,
): Promise<number> {
  const specification = /^\d+$/.test(idOrSlug)
    ? await getSpecificationById(db, Number(idOrSlug))
    : await getSpecificationBySlug(db, idOrSlug)
  if (!specification) {
    throw validationError('Specification was not found', {
      reason: 'specification_not_found',
    })
  }
  return specification.id
}

function receiptName<
  T extends { id: number; nameEn?: string; nameSv?: string; name?: string },
>(
  items: T[],
  id: number | null | undefined,
  locale: 'en' | 'sv',
): string | null {
  if (id == null) return null
  const item = items.find(candidate => candidate.id === id)
  if (!item) return null
  if ('name' in item && item.name) return item.name
  return locale === 'sv' ? (item.nameSv ?? null) : (item.nameEn ?? null)
}

function receiptPriorityName(
  items: ImportReferenceData['priorityLevels'],
  id: number | null | undefined,
  locale: 'en' | 'sv',
): string | null {
  if (id == null) return null
  const item = items.find(candidate => candidate.id === id)
  if (!item) return null
  const name = locale === 'sv' ? item.nameSv : item.nameEn
  return `${item.code} - ${name}`
}

function receiptRowsForInputs(args: {
  created: Array<{ id: number; uniqueId: string }>
  destinationId: number
  inputs: ImportReviewRowInput[]
  locale: 'en' | 'sv'
  mode: RequirementsImportMode
  referenceData: ImportReferenceData
}): RequirementsImportReceiptRow[] {
  const normReferenceById = new Map(
    args.referenceData.normReferences.map(item => [item.id, item]),
  )
  const packageById = new Map(
    args.referenceData.requirementPackages.map(item => [item.id, item]),
  )
  return args.inputs.map((input, index) => {
    const requirementPackageIds =
      args.mode === 'library' ? input.requirementPackageIds : []
    return {
      acceptanceCriteria: compactText(input.acceptanceCriteria),
      categoryId: input.categoryId ?? null,
      categoryName: receiptName(
        args.referenceData.categories,
        input.categoryId,
        args.locale,
      ),
      createdDatabaseId: args.created[index]?.id ?? 0,
      createdVisibleId: args.created[index]?.uniqueId ?? '',
      description: input.description.trim(),
      importMode: args.mode,
      needsReferenceId: input.needsReferenceId ?? null,
      normReferences: input.normReferenceIds
        .map(id => normReferenceById.get(id)?.normReferenceId)
        .filter((value): value is string => Boolean(value)),
      qualityCharacteristicId: input.qualityCharacteristicId ?? null,
      qualityCharacteristicName: receiptName(
        args.referenceData.qualityCharacteristics,
        input.qualityCharacteristicId,
        args.locale,
      ),
      requirementPackageIds,
      requirementPackageNames: requirementPackageIds
        .map(id => packageById.get(id)?.name)
        .filter((value): value is string => Boolean(value)),
      verifiable: input.verifiable,
      priorityLevelId: input.priorityLevelId ?? null,
      priorityLevelName: receiptPriorityName(
        args.referenceData.priorityLevels,
        input.priorityLevelId,
        args.locale,
      ),
      sourceIndex: input.sourceIndex,
      targetAreaId: args.mode === 'library' ? args.destinationId : null,
      targetSpecificationId:
        args.mode === 'specification-local' ? args.destinationId : null,
      typeId: input.typeId ?? null,
      typeName: receiptName(
        args.referenceData.types,
        input.typeId,
        args.locale,
      ),
      verificationMethod: input.verifiable
        ? compactText(input.verificationMethod)
        : null,
    }
  })
}

function toRequirementMutationInput(
  row: ImportReviewRowInput,
  areaId: number,
  actor: { displayName: string; hsaId: string },
): RequirementMutationData {
  return {
    acceptanceCriteria: compactText(row.acceptanceCriteria) ?? undefined,
    createdBy: actor.displayName,
    createdByHsaId: actor.hsaId,
    description: row.description.trim(),
    normReferenceIds: row.normReferenceIds,
    qualityCharacteristicId: row.qualityCharacteristicId ?? undefined,
    requirementAreaId: areaId,
    requirementCategoryId: row.categoryId ?? undefined,
    requirementPackageIds: row.requirementPackageIds,
    requirementTypeId: row.typeId ?? undefined,
    verifiable: row.verifiable,
    priorityLevelId: row.priorityLevelId ?? undefined,
    verificationMethod: row.verifiable
      ? (compactText(row.verificationMethod) ?? null)
      : null,
  }
}

function toLocalRequirementMutationInput(
  row: ImportReviewRowInput,
): SpecificationLocalRequirementMutationInput {
  return {
    acceptanceCriteria: compactText(row.acceptanceCriteria),
    description: row.description.trim(),
    needsReferenceId: row.needsReferenceId ?? null,
    normReferenceIds: row.normReferenceIds,
    qualityCharacteristicId: row.qualityCharacteristicId ?? null,
    requirementCategoryId: row.categoryId ?? null,
    requirementTypeId: row.typeId ?? null,
    verifiable: row.verifiable,
    priorityLevelId: row.priorityLevelId ?? null,
    verificationMethod: row.verifiable
      ? (compactText(row.verificationMethod) ?? null)
      : null,
  }
}

function isAdminActor(context: RequestContext): boolean {
  return context.actor.roles.includes('Admin')
}

function destinationMode(destination: McpImportDestinationRef) {
  return destination.kind === 'requirements_library'
    ? 'library'
    : 'specification-local'
}

function destinationId(destination: McpImportDestinationRef): number {
  return destination.kind === 'requirements_library'
    ? destination.areaId
    : destination.specificationId
}

function destinationKindMatches(
  destination: McpImportDestination,
  kind?: McpImportDestination['kind'],
): boolean {
  return kind == null || destination.kind === kind
}

function areaToDestination(area: RequirementAreaRow): McpImportDestination {
  return {
    areaId: area.id,
    kind: 'requirements_library',
    name: area.name,
    prefix: area.prefix,
  }
}

function specificationToDestination(specification: {
  id: number
  name: string
  uniqueId: string
}): McpImportDestination {
  return {
    kind: 'requirements_specification',
    name: specification.name,
    specificationId: specification.id,
    uniqueId: specification.uniqueId,
  }
}

function compareMcpImportDestinations(
  left: McpImportDestination,
  right: McpImportDestination,
): number {
  const leftKindRank = left.kind === 'requirements_specification' ? 0 : 1
  const rightKindRank = right.kind === 'requirements_specification' ? 0 : 1
  return (
    leftKindRank - rightKindRank ||
    left.name.localeCompare(right.name, 'sv') ||
    ('uniqueId' in left ? left.uniqueId : left.prefix).localeCompare(
      'uniqueId' in right ? right.uniqueId : right.prefix,
      'sv',
    )
  )
}

async function listMcpImportDestinations(
  db: SqlServerDatabase,
  context: RequestContext,
  kind?: McpImportDestination['kind'],
): Promise<McpImportDestination[]> {
  const actorHsaId = context.actor.hsaId
  const isAdmin = isAdminActor(context)
  const destinations: McpImportDestination[] = []

  if (kind == null || kind === 'requirements_specification') {
    const specifications = await listSpecificationsForActor(db, {
      actorHsaId,
      canReadAll: isAdmin,
    })
    destinations.push(...specifications.map(specificationToDestination))
  }

  if (kind == null || kind === 'requirements_library') {
    const areas = await listAreasActorCanAuthor(db, actorHsaId, isAdmin)
    destinations.push(...areas.map(areaToDestination))
  }

  return destinations
    .filter(destination => destinationKindMatches(destination, kind))
    .sort(compareMcpImportDestinations)
}

function findDestinationMatch(
  destination: McpImportDestination,
  search: string,
): McpSearchMatch | null {
  if (destination.kind === 'requirements_library') {
    return findMcpSearchMatch(
      {
        areaId: destination.areaId,
        kind: destination.kind,
        name: destination.name,
        prefix: destination.prefix,
      },
      search,
    )
  }

  return findMcpSearchMatch(
    {
      kind: destination.kind,
      name: destination.name,
      specificationId: destination.specificationId,
      uniqueId: destination.uniqueId,
    },
    search,
  )
}

async function resolveDestinationSnapshot(
  db: Pick<SqlServerDatabase, 'query'>,
  destination: McpImportDestinationRef,
): Promise<McpImportDestination> {
  if (destination.kind === 'requirements_library') {
    const area = await getAreaById(db as SqlServerDatabase, destination.areaId)
    if (!area) {
      throw notFoundError('Requirement area not found', {
        areaId: destination.areaId,
      })
    }
    return areaToDestination(area)
  }

  const specification = await getSpecificationById(
    db as SqlServerDatabase,
    destination.specificationId,
  )
  if (!specification) {
    throw notFoundError('Requirements specification not found', {
      specificationId: destination.specificationId,
    })
  }
  return specificationToDestination(specification)
}

function destinationRefFromSnapshot(
  destination: McpImportDestination,
): McpImportDestinationRef {
  return destination.kind === 'requirements_library'
    ? { areaId: destination.areaId, kind: destination.kind }
    : {
        kind: destination.kind,
        specificationId: destination.specificationId,
      }
}

async function assertMcpImportDestinationAuthorized(
  authorization: AuthorizationService,
  context: RequestContext,
  destination: McpImportDestinationRef,
): Promise<void> {
  if (destination.kind === 'requirements_library') {
    await authorization.assertAuthorized(
      {
        areaId: destination.areaId,
        kind: 'manage_requirement',
        operation: 'create',
      },
      context,
    )
    return
  }

  await authorization.assertAuthorized(
    {
      kind: 'manage_specification_local_requirement',
      operation: 'create',
      specificationId: destination.specificationId,
    },
    context,
  )
}

function createValidationToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url')
  return {
    token,
    tokenHash: hashString(token),
  }
}

function validationTokenHash(token: string): string {
  return hashString(token.trim())
}

function pointerSegment(value: string | number): string {
  return String(value).replaceAll('~', '~0').replaceAll('/', '~1')
}

function jsonPointer(segments: Array<string | number>): string {
  return segments.length === 0
    ? ''
    : `/${segments.map(pointerSegment).join('/')}`
}

function fieldPointer(
  root: 'proposedNormReferences' | 'requirements',
  index: number,
  field?: string,
): string {
  const fieldSegments =
    field
      ?.split('.')
      .map(segment => segment.trim())
      .filter(Boolean) ?? []
  return jsonPointer([root, index, ...fieldSegments])
}

function schemaIssuePath(path: readonly (string | number | symbol)[]): string {
  return jsonPointer(path.map(segment => String(segment)))
}

function valueAtSchemaPath(
  input: unknown,
  path: readonly (string | number | symbol)[],
): unknown {
  let current = input
  for (const segment of path) {
    if (typeof segment === 'symbol') return undefined
    if (current == null) return undefined
    if (typeof current !== 'object') return undefined
    current = (current as Record<string | number, unknown>)[segment]
  }
  return current
}

function schemaIssueCode(issue: {
  code: string
  input?: unknown
  message: string
  path: readonly (string | number | symbol)[]
  rootInput?: unknown
}): McpImportIssueCode {
  if (issue.code === 'unrecognized_keys') {
    return 'import_schema_unrecognized_field'
  }
  if (issue.code === 'invalid_value') {
    return 'import_schema_invalid_enum'
  }
  if (issue.code === 'invalid_type') {
    return ('input' in issue
      ? issue.input
      : valueAtSchemaPath(issue.rootInput, issue.path)) === undefined
      ? 'import_schema_missing_required'
      : 'import_schema_invalid_type'
  }
  return 'import_schema_invalid'
}

function schemaIssueToMcpIssue(
  issue: {
    code: string
    input?: unknown
    message: string
    path: readonly (string | number | symbol)[]
  },
  rootInput?: unknown,
): McpImportIssue {
  return {
    code: schemaIssueCode({ ...issue, rootInput }),
    message: issue.message,
    path: schemaIssuePath(issue.path),
    severity: 'error',
  }
}

function messageToMcpIssue(args: {
  message: ImportMessage
  path: string
  severity?: McpImportIssue['severity']
  sourceIndex?: number
}): McpImportIssue {
  const severity =
    args.severity ?? (args.message.level === 'error' ? 'error' : 'warning')
  const details: Record<string, unknown> = {
    level: args.message.level,
  }
  if (args.message.originalValue != null) {
    details.originalValue = args.message.originalValue
  }
  if (args.sourceIndex != null) {
    details.sourceIndex = args.sourceIndex
  }

  return {
    code: assertMcpImportIssueCode(args.message.code),
    details,
    message: args.message.message,
    path: args.path,
    severity,
  }
}

function normReferenceBusinessIds(
  referenceData: ImportReferenceData,
  dbIds: number[],
): string[] {
  const byId = new Map(referenceData.normReferences.map(row => [row.id, row]))
  return dbIds
    .map(id => byId.get(id)?.normReferenceId)
    .filter((value): value is string => Boolean(value))
}

const OMIT_RESOLVED_FIELD_CODES = new Set<McpImportIssueCode>([
  'import_invalid_id_omitted',
  'import_name_ambiguous',
  'import_name_unresolved',
  'import_quality_characteristic_type_mismatch',
  'import_verification_method_ignored_for_non_verifiable',
])

function hasOmittingIssue(
  row: RequirementsImportPreviewRow,
  field: string,
): boolean {
  return [...row.errors, ...row.warnings, ...row.infos].some(
    issue => issue.field === field && OMIT_RESOLVED_FIELD_CODES.has(issue.code),
  )
}

function resolvedRowFromPreviewRow(
  row: RequirementsImportPreviewRow,
  referenceData: ImportReferenceData,
): McpResolvedImportRow {
  const resolvedRow: McpResolvedImportRow = {
    acceptanceCriteria: row.values.acceptanceCriteria,
    description: row.values.description,
    normReferenceIds: normReferenceBusinessIds(
      referenceData,
      row.values.normReferenceIds,
    ),
    requirementPackageIds: row.values.requirementPackageIds,
    verifiable: row.values.verifiable,
  }
  if (!hasOmittingIssue(row, 'categoryId')) {
    resolvedRow.categoryId = row.values.categoryId
  }
  if (!hasOmittingIssue(row, 'priorityLevelId')) {
    resolvedRow.priorityLevelId = row.values.priorityLevelId
  }
  if (!hasOmittingIssue(row, 'qualityCharacteristicId')) {
    resolvedRow.qualityCharacteristicId = row.values.qualityCharacteristicId
  }
  if (!hasOmittingIssue(row, 'typeId')) {
    resolvedRow.typeId = row.values.typeId
  }
  if (
    row.values.verifiable &&
    row.values.verificationMethod != null &&
    !hasOmittingIssue(row, 'verificationMethod')
  ) {
    resolvedRow.verificationMethod = row.values.verificationMethod
  }
  return resolvedRow
}

function proposalReferencedSourceIndexes(
  payload: ImportRequirementsPayload,
  key: string,
): number[] {
  return payload.requirements.flatMap((row, sourceIndex) =>
    (row.proposedNormReferenceKeys ?? [])
      .map(value => value.trim())
      .includes(key)
      ? [sourceIndex]
      : [],
  )
}

function validationJsonFromPreview(args: {
  payload: ImportRequirementsPayload
  preview: RequirementsImportPreview
  referenceData: ImportReferenceData
}): McpImportValidationSessionJson {
  const rows = args.preview.rows.map(row => {
    const rowIssues = [
      ...row.errors.map(message =>
        messageToMcpIssue({
          message,
          path: fieldPointer('requirements', row.sourceIndex, message.field),
          sourceIndex: row.sourceIndex,
        }),
      ),
      ...row.warnings.map(message =>
        messageToMcpIssue({
          message,
          path: fieldPointer('requirements', row.sourceIndex, message.field),
          sourceIndex: row.sourceIndex,
        }),
      ),
      ...row.infos.map(message =>
        messageToMcpIssue({
          message,
          path: fieldPointer('requirements', row.sourceIndex, message.field),
          severity: 'warning',
          sourceIndex: row.sourceIndex,
        }),
      ),
    ]

    return {
      issues: rowIssues,
      resolvedRow: resolvedRowFromPreviewRow(row, args.referenceData),
      reviewRowId: row.reviewRowId,
      sourceIndex: row.sourceIndex,
    }
  })

  const proposals = args.preview.proposals.map((proposal, proposalIndex) => ({
    issues: proposal.warnings.map(message =>
      messageToMcpIssue({
        message,
        path: fieldPointer(
          'proposedNormReferences',
          proposalIndex,
          message.field,
        ),
      }),
    ),
    key: proposal.key,
    path: fieldPointer('proposedNormReferences', proposalIndex),
    proposalIndex,
    referencedSourceIndexes: proposalReferencedSourceIndexes(
      args.payload,
      proposal.key,
    ),
  }))

  return {
    proposals,
    referenceData: {
      includes: Object.keys(currentReferenceDataIncludes(args.referenceData)),
    },
    rows,
    schemaVersion: 'mcp-requirement-import-validation.v1',
  }
}

function validationIssues(
  validation: McpImportValidationSessionJson,
): McpImportIssue[] {
  return [
    ...validation.rows.flatMap(row => row.issues),
    ...validation.proposals.flatMap(proposal => proposal.issues),
  ].sort((left, right) => left.path.localeCompare(right.path, 'sv'))
}

function issueResponse(issue: McpImportIssue): ManageImportOutput {
  return {
    hasErrors: issue.severity === 'error',
    hasWarnings: issue.severity === 'warning',
    issues: [issue],
  }
}

function errorIssueResponse(issue: Omit<McpImportIssue, 'severity'>) {
  return issueResponse({ ...issue, severity: 'error' })
}

function currentReferenceDataIncludes(
  referenceData: ImportReferenceData,
): Record<string, number> {
  return {
    categories: referenceData.categories.length,
    normReferences: referenceData.normReferences.length,
    priorityLevels: referenceData.priorityLevels.length,
    qualityCharacteristics: referenceData.qualityCharacteristics.length,
    requirementPackages: referenceData.requirementPackages.length,
    types: referenceData.types.length,
  }
}

function hashPrefix(value: string | null | undefined): string | null {
  return value ? value.slice(0, 16) : null
}

function issueCodeSummary(
  validation: McpImportValidationSessionJson,
): string | null {
  const codes = [
    ...new Set(
      [
        ...validation.rows.flatMap(row => row.issues.map(issue => issue.code)),
        ...validation.proposals.flatMap(proposal =>
          proposal.issues.map(issue => issue.code),
        ),
      ].sort((left, right) => left.localeCompare(right, 'sv')),
    ),
  ]
  return codes.length > 0 ? codes.join(',') : null
}

function validationSessionDiagnosticFields(args: {
  currentReferenceDataFingerprint?: string
  destination: McpImportDestination
  execution: McpImportExecutionSessionJson
  reason: string
  session: RequirementImportValidationSessionRecord
  validation: McpImportValidationSessionJson
}): Record<string, string | number | boolean | null | undefined> {
  const importedReviewRowIds = args.execution.importedRows
    .map(row => row.reviewRowId)
    .sort((left, right) => left.localeCompare(right, 'sv'))
  const errorRowCount = args.validation.rows.filter(row =>
    row.issues.some(issue => issue.severity === 'error'),
  ).length
  const warningRowCount = args.validation.rows.filter(row =>
    row.issues.some(issue => issue.severity === 'warning'),
  ).length

  return {
    consumed_row_count: args.execution.importedRows.length,
    created_at: args.session.createdAt,
    current_reference_data_fingerprint_prefix: hashPrefix(
      args.currentReferenceDataFingerprint,
    ),
    destination_id: args.session.destinationId,
    destination_kind: args.session.destinationKind,
    destination_name: args.destination.name,
    error_row_count: errorRowCount,
    expires_at: args.session.expiresAt,
    imported_review_row_ids: importedReviewRowIds.join(',') || null,
    issue_codes: issueCodeSummary(args.validation),
    operation: 'execute',
    payload_hash_prefix: hashPrefix(args.session.payloadHash),
    reason: args.reason,
    reference_data_fingerprint_prefix: hashPrefix(
      args.session.referenceDataFingerprint,
    ),
    row_count: args.validation.rows.length,
    session_id: args.session.id,
    submitted_payload_hash_prefix: hashPrefix(args.session.payloadHash),
    token_hash_prefix: hashPrefix(args.session.tokenHash),
    validation_result_hash_prefix: hashPrefix(
      hashString(args.session.validationResultJson),
    ),
    warning_row_count: warningRowCount,
  }
}

function parseSessionJson<T>(value: string, label: string): T {
  try {
    return JSON.parse(value) as T
  } catch {
    throw validationError(
      `Stored import validation session ${label} is invalid`,
    )
  }
}

function parseExecutionSession(
  session: RequirementImportValidationSessionRecord,
): McpImportExecutionSessionJson {
  if (!session.executionResultJson) {
    return {
      importedRows: [],
      schemaVersion: 'mcp-requirement-import-execution.v1',
    }
  }
  return parseSessionJson<McpImportExecutionSessionJson>(
    session.executionResultJson,
    'execution result',
  )
}

function persistedImportedRowsByReviewRowId(
  execution: McpImportExecutionSessionJson,
): Map<string, McpImportedSessionRow> {
  return new Map(execution.importedRows.map(row => [row.reviewRowId, row]))
}

function importReviewRowFromValidationRow(
  row: McpValidatedImportRow,
  referenceData: ImportReferenceData,
  mode: RequirementsImportMode,
): ImportReviewRowInput {
  const description = row.resolvedRow.description?.trim()
  if (!description) {
    throw validationError('Invalid import validation state', {
      reason: 'resolved_description_missing',
      reviewRowId: row.reviewRowId,
      sourceIndex: row.sourceIndex,
    })
  }
  const normReferenceByBusinessId = new Map(
    referenceData.normReferences.map(item => [item.normReferenceId, item.id]),
  )
  const normReferenceIds = (row.resolvedRow.normReferenceIds ?? [])
    .map(normReferenceId => normReferenceByBusinessId.get(normReferenceId))
    .filter((value): value is number => Number.isInteger(value))

  return {
    acceptanceCriteria: row.resolvedRow.acceptanceCriteria ?? null,
    categoryId: row.resolvedRow.categoryId ?? null,
    description,
    needsReferenceId: null,
    normReferenceIds,
    priorityLevelId: row.resolvedRow.priorityLevelId ?? null,
    qualityCharacteristicId: row.resolvedRow.qualityCharacteristicId ?? null,
    requirementPackageIds:
      mode === 'library' ? (row.resolvedRow.requirementPackageIds ?? []) : [],
    reviewRowId: row.reviewRowId,
    sourceIndex: row.sourceIndex,
    typeId: row.resolvedRow.typeId ?? null,
    verifiable: row.resolvedRow.verifiable ?? false,
    verificationMethod: row.resolvedRow.verificationMethod ?? null,
  }
}

function rowHasBlockingErrors(row: McpValidatedImportRow): boolean {
  return row.issues.some(issue => issue.severity === 'error')
}

function notImportedRowsForValidation(
  rows: McpValidatedImportRow[],
  importedRows: Map<string, McpImportedSessionRow>,
) {
  return rows
    .filter(row => !importedRows.has(row.reviewRowId))
    .filter(row => rowHasBlockingErrors(row))
    .map(row => ({
      issues: row.issues.filter(issue => issue.severity === 'error'),
      reviewRowId: row.reviewRowId,
      sourceIndex: row.sourceIndex,
    }))
}

function sessionNotFoundError() {
  return notFoundError('Validation session not found or expired', {
    reason: 'validation_session_not_found_or_expired',
  })
}

function buildStaleReferenceDataIssue(): McpImportIssue {
  return {
    code: 'import_reference_data_stale',
    message:
      'Reference data changed since validation. Run validate again before executing.',
    path: '',
    severity: 'error',
  }
}

function buildDestinationInvalidIssue(
  destination: McpImportDestinationRef,
): McpImportIssue {
  return {
    code: 'import_destination_invalid',
    details: {
      destinationId: destinationId(destination),
      destinationKind: destination.kind,
    },
    message:
      'Import destination is no longer available for import. Choose a valid destination and run validate again.',
    path: '/destination',
    severity: 'error',
  }
}

function destinationFromSession(
  session: RequirementImportValidationSessionRecord,
): McpImportDestination {
  const destination = parseSessionJson<McpImportDestination>(
    session.destinationSnapshotJson,
    'destination snapshot',
  )
  if (
    destination.kind === 'requirements_library' &&
    session.destinationKind === 'requirements_library' &&
    destination.areaId === session.destinationId
  ) {
    return destination
  }
  if (
    destination.kind === 'requirements_specification' &&
    session.destinationKind === 'requirements_specification' &&
    destination.specificationId === session.destinationId
  ) {
    return destination
  }
  throw validationError(
    'Stored import validation session destination is invalid',
  )
}

async function resolveImportableDestinationSnapshot(
  db: Pick<SqlServerDatabase, 'query'>,
  destination: McpImportDestinationRef,
): Promise<McpImportDestination | McpImportIssue> {
  try {
    return await resolveDestinationSnapshot(db, destination)
  } catch (error) {
    if (isRequirementsServiceError(error) && error.code === 'not_found') {
      return buildDestinationInvalidIssue(destination)
    }
    throw error
  }
}

export function createRequirementsImportWorkflow({
  authorization,
  db,
  logger = createRequirementsLogger(),
}: ImportWorkflowOptions) {
  const workflow = {
    async manageImport(
      context: RequestContext,
      input: ManageImportInput,
    ): Promise<ManageImportOutput> {
      await authorize(
        authorization,
        { kind: 'manage_import', operation: input.operation },
        context,
      )

      return withLogging(
        logger,
        context,
        'requirements.manage_import',
        { operation: input.operation },
        async (): Promise<ManageImportOutput> => {
          if (input.operation === 'list_destinations') {
            return {
              result: await listMcpImportDestinations(db, context, input.kind),
            }
          }

          if (input.operation === 'search_destinations') {
            const search = input.search.trim()
            if (!search) {
              throw validationError('Search text is required')
            }
            const destinations = await listMcpImportDestinations(
              db,
              context,
              input.kind,
            )
            const matched = destinations
              .flatMap(
                (
                  destination,
                ): Array<
                  McpImportDestinationRow & { match: McpSearchMatch }
                > => {
                  const match = findDestinationMatch(destination, search)
                  return match ? [{ ...destination, match }] : []
                },
              )
              .sort(
                (left, right) =>
                  compareMcpSearchMatches(left.match, right.match) ||
                  compareMcpImportDestinations(left, right),
              )
            return { result: matched }
          }

          if (input.operation === 'validate') {
            await purgeExpiredRequirementImportValidationSessions(db).catch(
              () => undefined,
            )
            await assertMcpImportDestinationAuthorized(
              authorization,
              context,
              input.destination,
            )
            const destinationOrIssue =
              await resolveImportableDestinationSnapshot(db, input.destination)
            if ('code' in destinationOrIssue) {
              return issueResponse(destinationOrIssue)
            }
            const destination = destinationOrIssue

            const parsed = requirementsImportPayloadSchema.safeParse(
              input.payload,
            )
            if (!parsed.success) {
              const issues = parsed.error.issues.map(issue =>
                schemaIssueToMcpIssue(issue, input.payload),
              )
              return {
                hasErrors: true,
                hasWarnings: false,
                issues,
              }
            }

            const settings = await getCachedMcpRuntimeSettings(db)
            const payload = parsed.data
            const submittedPayloadJson = canonicalJson(payload)
            const submittedPayloadBytes = Buffer.byteLength(
              submittedPayloadJson,
              'utf8',
            )

            if (payload.requirements.length > settings.mcpImportMaxRows) {
              return errorIssueResponse({
                code: 'import_row_count_cap_exceeded',
                details: {
                  maxRows: settings.mcpImportMaxRows,
                  rowCount: payload.requirements.length,
                },
                message: `Import file contains ${payload.requirements.length} rows, which exceeds the configured MCP import limit of ${settings.mcpImportMaxRows}.`,
                path: '/requirements',
              })
            }

            if (submittedPayloadBytes > settings.mcpMaxRequestBytes) {
              return errorIssueResponse({
                code: 'import_payload_size_cap_exceeded',
                details: {
                  maxBytes: settings.mcpMaxRequestBytes,
                  payloadBytes: submittedPayloadBytes,
                },
                message:
                  'Import payload exceeds the configured MCP request payload limit.',
                path: '',
              })
            }

            const referenceData = await loadImportReferenceData(db, {
              includeArchivedNormReferences: true,
            })
            const preview = previewFromReferenceData({
              destinationId: destinationId(input.destination),
              locale: 'en',
              mode: destinationMode(input.destination),
              payload,
              referenceData,
            })
            const validation = validationJsonFromPreview({
              payload,
              preview,
              referenceData,
            })
            const { token, tokenHash } = createValidationToken()
            const expiresAt = new Date(
              Date.now() + settings.mcpImportValidationTtlMinutes * 60 * 1000,
            )
            const session = await createRequirementImportValidationSession(db, {
              destinationId: destinationId(input.destination),
              destinationKind: input.destination.kind,
              destinationSnapshotJson: canonicalJson(destination),
              expiresAt,
              payloadHash: hashString(submittedPayloadJson),
              referenceDataFingerprint: referenceDataFingerprint(referenceData),
              submittedPayloadJson,
              tokenHash,
              validationResultJson: canonicalJson(validation),
            })
            const issues = validationIssues(validation)

            return {
              expiresAt: session.expiresAt,
              hasErrors: issues.some(issue => issue.severity === 'error'),
              hasWarnings: issues.some(issue => issue.severity === 'warning'),
              issues,
              validationToken: token,
            }
          }

          const token = input.validationToken.trim()
          if (!token) {
            throw validationError('validationToken is required')
          }
          await purgeExpiredRequirementImportValidationSessions(db).catch(
            () => undefined,
          )
          const tokenHash = validationTokenHash(token)
          const session =
            await getRequirementImportValidationSessionByTokenHash(
              db,
              tokenHash,
            )
          if (!session) {
            throw sessionNotFoundError()
          }
          const destination = destinationFromSession(session)
          await assertMcpImportDestinationAuthorized(
            authorization,
            context,
            destinationRefFromSnapshot(destination),
          )

          if (input.operation === 'inspect_validation') {
            const referenceData = await loadImportReferenceData(db, {
              includeArchivedNormReferences: true,
            })
            const currentFingerprint = referenceDataFingerprint(referenceData)
            const validation = parseSessionJson<McpImportValidationSessionJson>(
              session.validationResultJson,
              'validation result',
            )
            const execution = parseExecutionSession(session)
            const importedByReviewRowId =
              persistedImportedRowsByReviewRowId(execution)
            const submittedPayload =
              parseSessionJson<ImportRequirementsPayload>(
                session.submittedPayloadJson,
                'submitted payload',
              )

            return {
              destination,
              expiresAt: session.expiresAt,
              payloadHash: session.payloadHash,
              proposals: validation.proposals,
              referenceData: {
                currentFingerprint,
                includes: currentReferenceDataIncludes(referenceData),
                isStale:
                  currentFingerprint !== session.referenceDataFingerprint,
                storedFingerprint: session.referenceDataFingerprint,
              },
              rows: validation.rows.map(row => {
                const imported = importedByReviewRowId.get(row.reviewRowId)
                return {
                  ...row,
                  imported: imported != null,
                  importedAt: imported?.importedAt,
                  kravId: imported?.kravId,
                  localKravId: imported?.localKravId,
                  uniqueId: imported?.uniqueId,
                }
              }),
              submittedPayload,
            }
          }

          const diagnosticValidation =
            parseSessionJson<McpImportValidationSessionJson>(
              session.validationResultJson,
              'validation result',
            )
          const diagnosticExecution = parseExecutionSession(session)
          let diagnosticCurrentFingerprint: string | undefined

          try {
            return await db.transaction('SERIALIZABLE', async manager => {
              const lockedSession =
                await getRequirementImportValidationSessionByTokenHash(
                  manager,
                  tokenHash,
                  { lockForUpdate: true },
                )
              if (!lockedSession) {
                throw sessionNotFoundError()
              }

              const lockedDestination = destinationFromSession(lockedSession)
              const validation =
                parseSessionJson<McpImportValidationSessionJson>(
                  lockedSession.validationResultJson,
                  'validation result',
                )
              const execution = parseExecutionSession(lockedSession)
              const referenceData = await loadImportReferenceData(
                manager as unknown as SqlServerDatabase,
                {
                  includeArchivedNormReferences: true,
                },
              )
              const currentFingerprint = referenceDataFingerprint(referenceData)
              diagnosticCurrentFingerprint = currentFingerprint
              if (
                currentFingerprint !== lockedSession.referenceDataFingerprint
              ) {
                logger.error(
                  'requirements.manage_import.validation_session_diagnostic',
                  validationSessionDiagnosticFields({
                    currentReferenceDataFingerprint: currentFingerprint,
                    destination: lockedDestination,
                    execution,
                    reason: 'reference_data_stale',
                    session: lockedSession,
                    validation,
                  }),
                )
                return issueResponse(buildStaleReferenceDataIssue())
              }

              const currentDestination =
                await resolveImportableDestinationSnapshot(
                  manager,
                  destinationRefFromSnapshot(lockedDestination),
                )
              if ('code' in currentDestination) {
                logger.error(
                  'requirements.manage_import.validation_session_diagnostic',
                  validationSessionDiagnosticFields({
                    currentReferenceDataFingerprint: currentFingerprint,
                    destination: lockedDestination,
                    execution,
                    reason: 'destination_invalid',
                    session: lockedSession,
                    validation,
                  }),
                )
                return issueResponse(currentDestination)
              }

              const importedByReviewRowId =
                persistedImportedRowsByReviewRowId(execution)
              const mode = destinationMode(
                destinationRefFromSnapshot(lockedDestination),
              )
              const eligibleRows = validation.rows.filter(
                row =>
                  !importedByReviewRowId.has(row.reviewRowId) &&
                  !rowHasBlockingErrors(row),
              )
              const reviewRows = eligibleRows.map(row =>
                importReviewRowFromValidationRow(row, referenceData, mode),
              )
              let importedRows: McpImportedSessionRow[] = []

              if (reviewRows.length > 0) {
                const importedAt = new Date().toISOString()
                if (lockedDestination.kind === 'requirements_library') {
                  const actor = requireHumanActorSnapshot(context)
                  const created = await createRequirementsBatchWithExecutor(
                    manager,
                    reviewRows.map(row =>
                      toRequirementMutationInput(
                        row,
                        lockedDestination.areaId,
                        actor,
                      ),
                    ),
                    {
                      audit: (executor, result) =>
                        recordSensitiveMutationSucceededWithExecutor(
                          executor,
                          context,
                          {
                            action: 'requirement.create',
                            operation: 'create',
                            requirementId: result.requirement.id,
                            requirementUniqueId: result.requirement.uniqueId,
                            versionNumber: result.version.versionNumber,
                          },
                        ),
                      batchAudit: (executor, results) =>
                        recordSensitiveMutationSucceededWithExecutor(
                          executor,
                          context,
                          {
                            action: 'requirement_import.execute',
                            operation: 'create',
                            requirementCount: results.length,
                            targetRequirementAreaId: lockedDestination.areaId,
                          },
                        ),
                    },
                  )
                  importedRows = created.map((result, index) => {
                    const eligibleRow = eligibleRows[index]
                    if (!eligibleRow) {
                      throw validationError('Invalid import execution state', {
                        index,
                        reason: 'eligible_row_missing',
                      })
                    }

                    return {
                      importedAt,
                      kravId: result.requirement.uniqueId,
                      reviewRowId: eligibleRow.reviewRowId,
                      sourceIndex: eligibleRow.sourceIndex,
                      uniqueId: result.requirement.uniqueId,
                    }
                  })
                } else {
                  const created =
                    await createSpecificationLocalRequirementsBatchWithExecutor(
                      manager,
                      lockedDestination.specificationId,
                      reviewRows.map(toLocalRequirementMutationInput),
                      {
                        batchAudit: async (executor, createdIds) => {
                          for (const localRequirementId of createdIds) {
                            await recordSensitiveMutationSucceededWithExecutor(
                              executor,
                              context,
                              {
                                action:
                                  'specification_local_requirement.create',
                                localRequirementId,
                                operation: 'create',
                                specificationId:
                                  lockedDestination.specificationId,
                              },
                            )
                          }
                          await recordSensitiveMutationSucceededWithExecutor(
                            executor,
                            context,
                            {
                              action: 'requirement_import.execute',
                              operation: 'create',
                              requirementCount: createdIds.length,
                              specificationId:
                                lockedDestination.specificationId,
                            },
                          )
                        },
                      },
                    )
                  importedRows = created.map((result, index) => {
                    const eligibleRow = eligibleRows[index]
                    if (!eligibleRow) {
                      throw validationError('Invalid import execution state', {
                        index,
                        reason: 'eligible_row_missing',
                      })
                    }

                    return {
                      importedAt,
                      localKravId: result.uniqueId,
                      reviewRowId: eligibleRow.reviewRowId,
                      sourceIndex: eligibleRow.sourceIndex,
                      uniqueId: result.uniqueId,
                    }
                  })
                }
              }

              const nextExecution: McpImportExecutionSessionJson = {
                importedRows: [...execution.importedRows, ...importedRows],
                schemaVersion: 'mcp-requirement-import-execution.v1',
              }
              if (importedRows.length > 0) {
                await updateRequirementImportValidationSessionExecutionResult(
                  manager,
                  lockedSession.id,
                  canonicalJson(nextExecution),
                  new Date(),
                )
              }
              const nextImportedByReviewRowId =
                persistedImportedRowsByReviewRowId(nextExecution)
              const notImportedRows = notImportedRowsForValidation(
                validation.rows,
                nextImportedByReviewRowId,
              )

              return {
                destination: lockedDestination,
                importedRows,
                notImportedRows,
                summary: {
                  importedCount: importedRows.length,
                  notImportedCount: notImportedRows.length,
                  totalRowCount: validation.rows.length,
                },
              }
            })
          } catch (error) {
            logger.error(
              'requirements.manage_import.validation_session_diagnostic',
              {
                ...validationSessionDiagnosticFields({
                  currentReferenceDataFingerprint: diagnosticCurrentFingerprint,
                  destination,
                  execution: diagnosticExecution,
                  reason: 'execution_failed',
                  session,
                  validation: diagnosticValidation,
                }),
                error_name: error instanceof Error ? error.name : 'unknown',
              },
            )
            throw error
          }
        },
      )
    },

    async getImportSchema(
      context: RequestContext,
      input: { locale: 'en' | 'sv' },
    ): Promise<JsonSchema> {
      await authorize(authorization, { kind: 'get_import_schema' }, context)

      return withLogging(
        logger,
        context,
        'requirements.get_import_schema',
        { locale: input.locale },
        async () => buildRequirementsImportJsonSchema(input.locale),
      )
    },

    async getImportInstruction(
      context: RequestContext,
      input: { locale: 'en' | 'sv' },
    ): Promise<{ importInstruction: string }> {
      await authorize(
        authorization,
        { kind: 'get_import_instruction' },
        context,
      )

      return withLogging(
        logger,
        context,
        'requirements.get_import_instruction',
        { locale: input.locale },
        async () => ({
          importInstruction: await workflow.buildImportAiPrompt(input.locale),
        }),
      )
    },

    async buildImportAiPrompt(locale: 'en' | 'sv') {
      const referenceData = await loadImportReferenceData(db)
      const isSv = locale === 'sv'
      return [
        isSv
          ? '# Skapa JSON för kravimport'
          : '# Create JSON for requirements import',
        '',
        isSv ? '## Regler' : '## Rules',
        '',
        isSv
          ? '- Returnera endast ett JSON-objekt som följer det separata JSON Schema som skickas som tvingande svarsformat.'
          : '- Return only a JSON object that follows the separate JSON Schema sent as the mandatory response format.',
        isSv
          ? `- Sätt toppnivåfältet \`schemaVersion\` till \`${REQUIREMENTS_IMPORT_SCHEMA_VERSION}\`.`
          : `- Set the top-level \`schemaVersion\` field to \`${REQUIREMENTS_IMPORT_SCHEMA_VERSION}\`.`,
        isSv
          ? '- Använd inte U+2013 EN DASH i JSON-värden; använd vanligt bindestreck (-) i stället.'
          : '- Do not use U+2013 EN DASH in JSON values; use a plain hyphen (-) instead.',
        isSv
          ? '- Skriv fria textvärden, till exempel `description`, `acceptanceCriteria`, `verificationMethod` och föreslagna normreferenser på svenska om inte användarens indata uttryckligen anger ett annat språk.'
          : "- Write free-text values, such as `description`, `acceptanceCriteria`, `verificationMethod`, and proposed norm references, in English unless the user's input explicitly requests another language.",
        isSv
          ? '- Utelämna frivilliga fält eller sätt dem till `null` när värdet är osäkert.'
          : '- Omit optional fields or set them to `null` when the value is uncertain.',
        '',
        isSv ? '## Konflikter' : '## Conflicts',
        '',
        isSv
          ? '- Följ användarens indata för sakligt behov, omfattning, kravinnehåll och sakvärden.'
          : "- Follow the user's input for factual need, scope, requirement content, and factual values.",
        isSv
          ? '- Följ JSON Schema för tillåtna fält, datatyper, obligatoriska fält och resultatformat.'
          : '- Follow JSON Schema for allowed fields, data types, required fields, and result format.',
        isSv
          ? '- Följ referensdata för kravstruktur, klassificering, ID:n och benämningar.'
          : '- Follow reference data for requirement structure, classification, IDs, and labels.',
        '',
        isSv ? '## Fältval' : '## Field Selection',
        '',
        isSv
          ? '- Använd `description` för kravtext.'
          : '- Use `description` for the requirement text.',
        isSv
          ? '- Använd `acceptanceCriteria` för villkor och nivå av uppfyllelse som måste vara uppnådda för att kravet ska kunna godkännas vid granskning, test eller leverans.'
          : '- Use `acceptanceCriteria` for the conditions and fulfillment level that must be met for the requirement to be approved during review, testing, or delivery.',
        isSv
          ? '- Välj `typeId` innan `qualityCharacteristicId`:'
          : '- Choose `typeId` before `qualityCharacteristicId`:',
        isSv
          ? '  - Använd funktionell typ för krav på systembeteende eller förmåga.'
          : '  - Use the functional type for required system behavior or capability.',
        isSv
          ? '  - Använd icke-funktionell typ för kvalitet, begränsning eller hur väl systemet ska fungera.'
          : '  - Use the non-functional type for quality, constraint, or how well the system must work.',
        isSv
          ? '- Välj bara `qualityCharacteristicId` från den valda typens `qualityCharacteristics` i referensdatan.'
          : "- Choose `qualityCharacteristicId` only from the selected type's `qualityCharacteristics` in the reference data.",
        isSv
          ? '- Använd ID-fält från referensdatan: `categoryId`, `typeId`, `qualityCharacteristicId`, `priorityLevelId` och `requirementPackageIds`.'
          : '- Use ID fields from the reference data: `categoryId`, `typeId`, `qualityCharacteristicId`, `priorityLevelId`, and `requirementPackageIds`.',
        isSv
          ? '- Använd `normReferenceIds` med värden från `normReferences[].normReferenceId`.'
          : '- Use `normReferenceIds` with values from `normReferences[].normReferenceId`.',
        isSv
          ? '- Använd `normReferenceIds` för befintliga normreferenser och `proposedNormReferences` bara för saknade källor.'
          : '- Use `normReferenceIds` for existing norm references and `proposedNormReferences` only for missing sources.',
        isSv
          ? '- Koppla saknade källor med `proposedNormReferences[].key` och radens `proposedNormReferenceKeys`.'
          : "- Link missing sources with `proposedNormReferences[].key` and the row's `proposedNormReferenceKeys`.",
        isSv
          ? '- Välj `priorityLevelId` från `priorityLevels[].id`; jämför kravet med `priorityLevels[].assessmentCriteria` och välj bästa matchning. Använd `description` som stöd för verksamhetsmål, nytta, angelägenhet, kritikalitet, risker och intressenters behov.'
          : '- Choose `priorityLevelId` from `priorityLevels[].id`; compare the requirement with `priorityLevels[].assessmentCriteria` and choose the best match. Use `description` as context for business goals, benefit, urgency, criticality, risks, and stakeholder needs.',
        isSv
          ? '- Välj `requirementPackageIds` från referensdatan genom att jämföra kravets behov, kravtext och acceptanskriterier med `requirementPackages[].purposeAndScope`; välj bara paket där kravet tydligt hör hemma i paketets syfte och avgränsning.'
          : "- Choose `requirementPackageIds` from the reference data by comparing the requirement's need, requirement text, and acceptance criteria with `requirementPackages[].purposeAndScope`; choose only packages where the requirement clearly belongs within the package purpose and scope.",
        isSv
          ? '- Utelämna `requirementPackageIds` eller använd `[]` när inget kravpaket passar tydligt; svaga ordmatchningar mot paketnamn räcker inte.'
          : '- Omit `requirementPackageIds` or use `[]` when no requirement package clearly fits; weak keyword matches against package names are not enough.',
        isSv
          ? '- Vid import av kravunderlagslokala krav ignoreras `requirementPackageIds`.'
          : '- When importing specification-local requirements, `requirementPackageIds` is ignored.',
        isSv
          ? '- Sätt `verifiable` till `true` när kravversionen har objektiva villkor som kan kontrolleras; ange då `verificationMethod`.'
          : '- Set `verifiable` to `true` when the requirement version has objective conditions that can be checked; then provide `verificationMethod`.',
        isSv
          ? '- Använd `verificationMethod` för verifieringssätt, inte för godkännandekriterier.'
          : '- Use `verificationMethod` for the verification method, not acceptance criteria.',
        '',
        '## Reference Data',
        '',
        '```json',
        JSON.stringify(
          {
            categories: importPromptCategories(referenceData, locale),
            normReferences: referenceData.normReferences.map(item => ({
              issuer: item.issuer,
              name: item.name,
              normReferenceId: item.normReferenceId,
              reference: item.reference,
              type: item.type,
              version: item.version,
            })),
            requirementPackages: referenceData.requirementPackages.map(
              item => ({
                id: item.id,
                leadDisplayName: item.leadDisplayName,
                name: item.name,
                purposeAndScope: item.purposeAndScope,
              }),
            ),
            priorityLevels: importPromptPriorityLevels(referenceData, locale),
            types: importPromptTypes(referenceData, locale),
          },
          null,
          2,
        ),
        '```',
      ].join('\n')
    },

    async executeLibraryImport(
      context: RequestContext,
      input: ImportExecuteBody & { areaId: number },
    ): Promise<RequirementsImportExecuteResult> {
      await authorization.assertAuthorized(
        {
          areaId: input.areaId,
          kind: 'manage_requirement',
          operation: 'create',
        },
        context,
      )
      const referenceData = await loadImportReferenceData(db)
      const expectedToken = createReviewToken({
        destinationId: input.areaId,
        mode: 'library',
        referenceDataFingerprint: referenceDataFingerprint(referenceData),
      })
      if (expectedToken !== input.previewToken) {
        throw conflictError('Import preview is stale', {
          reason: 'stale_requirement_import_preview',
        })
      }

      const rows = [...input.rows].sort(
        (left, right) => left.sourceIndex - right.sourceIndex,
      )
      validateExecuteRows({ mode: 'library', referenceData, rows })
      const actor = requireHumanActorSnapshot(context)
      const created = await createRequirementsBatch(
        db,
        rows.map(row => toRequirementMutationInput(row, input.areaId, actor)),
        {
          audit: (executor, result) =>
            recordSensitiveMutationSucceededWithExecutor(executor, context, {
              action: 'requirement.create',
              operation: 'create',
              requirementId: result.requirement.id,
              requirementUniqueId: result.requirement.uniqueId,
              versionNumber: result.version.versionNumber,
            }),
          batchAudit: (executor, results) =>
            recordSensitiveMutationSucceededWithExecutor(executor, context, {
              action: 'requirement_import.execute',
              operation: 'create',
              requirementCount: results.length,
              targetRequirementAreaId: input.areaId,
            }),
        },
      )
      const createdRows = receiptRowsForInputs({
        created: created.map(result => ({
          id: result.requirement.id,
          uniqueId: result.requirement.uniqueId,
        })),
        destinationId: input.areaId,
        inputs: rows,
        locale: input.locale,
        mode: 'library',
        referenceData,
      })
      return {
        createdRows,
        mode: 'library',
        summary: { createdCount: createdRows.length },
      }
    },

    async executeSpecificationLocalImport(
      context: RequestContext,
      input: Omit<ImportExecuteBody, 'areaId'> & {
        specificationIdOrSlug: string
      },
    ): Promise<RequirementsImportExecuteResult> {
      const specificationId = await resolveSpecificationId(
        db,
        input.specificationIdOrSlug,
      )
      await authorization.assertAuthorized(
        {
          kind: 'manage_specification_local_requirement',
          operation: 'create',
          specificationId,
        },
        context,
      )
      const referenceData = await loadImportReferenceData(db)
      const expectedToken = createReviewToken({
        destinationId: specificationId,
        mode: 'specification-local',
        referenceDataFingerprint: referenceDataFingerprint(referenceData),
      })
      if (expectedToken !== input.previewToken) {
        throw conflictError('Import preview is stale', {
          reason: 'stale_requirement_import_preview',
        })
      }

      const rows = [...input.rows].sort(
        (left, right) => left.sourceIndex - right.sourceIndex,
      )
      validateExecuteRows({
        mode: 'specification-local',
        referenceData,
        rows,
      })
      const created = await createSpecificationLocalRequirementsBatch(
        db,
        specificationId,
        rows.map(toLocalRequirementMutationInput),
        {
          batchAudit: async (executor, createdIds) => {
            for (const localRequirementId of createdIds) {
              await recordSensitiveMutationSucceededWithExecutor(
                executor,
                context,
                {
                  action: 'specification_local_requirement.create',
                  localRequirementId,
                  operation: 'create',
                  specificationId,
                },
              )
            }
            await recordSensitiveMutationSucceededWithExecutor(
              executor,
              context,
              {
                action: 'requirement_import.execute',
                operation: 'create',
                requirementCount: createdIds.length,
                specificationId,
              },
            )
          },
        },
      )
      const createdRows = receiptRowsForInputs({
        created: created.map(result => ({
          id: result.id,
          uniqueId: result.uniqueId,
        })),
        destinationId: specificationId,
        inputs: rows,
        locale: input.locale,
        mode: 'specification-local',
        referenceData,
      })
      return {
        createdRows,
        mode: 'specification-local',
        summary: { createdCount: createdRows.length },
      }
    },

    async previewLibraryImport(
      context: RequestContext,
      input: {
        areaId: number
        locale: 'en' | 'sv'
        payload: ImportRequirementsPayload
      },
    ): Promise<RequirementsImportPreview> {
      await authorization.assertAuthorized(
        {
          areaId: input.areaId,
          kind: 'manage_requirement',
          operation: 'create',
        },
        context,
      )
      const referenceData = await loadImportReferenceData(db)
      return previewFromReferenceData({
        destinationId: input.areaId,
        locale: input.locale,
        mode: 'library',
        payload: input.payload,
        referenceData,
      })
    },

    async previewSpecificationLocalImport(
      context: RequestContext,
      input: {
        locale: 'en' | 'sv'
        payload: ImportRequirementsPayload
        specificationIdOrSlug: string
      },
    ): Promise<RequirementsImportPreview> {
      const specificationId = await resolveSpecificationId(
        db,
        input.specificationIdOrSlug,
      )
      await authorization.assertAuthorized(
        {
          kind: 'manage_specification_local_requirement',
          operation: 'create',
          specificationId,
        },
        context,
      )
      const referenceData = await loadImportReferenceData(db)
      return previewFromReferenceData({
        destinationId: specificationId,
        locale: input.locale,
        mode: 'specification-local',
        payload: input.payload,
        referenceData,
      })
    },
  }

  return workflow
}

import { createHash } from 'node:crypto'
import { listNormReferences } from '@/lib/dal/norm-references'
import { listPriorityLevels } from '@/lib/dal/priority-levels'
import { listCategories } from '@/lib/dal/requirement-categories'
import { listRequirementPackages } from '@/lib/dal/requirement-packages'
import {
  listTypes,
  type QualityCharacteristicRow,
} from '@/lib/dal/requirement-types'
import {
  createRequirementsBatch,
  type RequirementMutationData,
} from '@/lib/dal/requirements'
import {
  createSpecificationLocalRequirementsBatch,
  getSpecificationById,
  getSpecificationBySlug,
  type SpecificationLocalRequirementMutationInput,
} from '@/lib/dal/requirements-specifications'
import type { SqlServerDatabase } from '@/lib/db'
import {
  type AuthorizationService,
  type RequestContext,
  requireHumanActorSnapshot,
} from '@/lib/requirements/auth'
import { conflictError, validationError } from '@/lib/requirements/errors'
import {
  buildRequirementsImportJsonSchema,
  type ImportExecuteBody,
  type ImportRequirement,
  type ImportRequirementsPayload,
  type ImportReviewRowInput,
  REQUIREMENTS_IMPORT_SCHEMA_VERSION,
} from '@/lib/requirements/import-schema'
import { recordSensitiveMutationSucceededWithExecutor } from '@/lib/requirements/security-audit'

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
  code: string
  field?: string
  level: 'error' | 'warning'
  message: string
  originalValue?: string
}

export interface RequirementsImportPreviewRow {
  errors: ImportMessage[]
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
    requiresTesting: boolean
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
  requiresTesting: boolean
  sourceIndex: number
  targetAreaId: number | null
  targetSpecificationId: number | null
  typeId: number | null
  typeName: string | null
  verificationMethod: string | null
}

export interface RequirementsImportExecuteResult {
  createdRows: RequirementsImportReceiptRow[]
  mode: RequirementsImportMode
  summary: {
    createdCount: number
  }
}

export interface ImportWorkflowOptions {
  authorization: AuthorizationService
  db: SqlServerDatabase
}

function compactText(value: string | null | undefined): string | null {
  if (value == null) return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
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
  return createHash('sha256')
    .update(JSON.stringify(value), 'utf8')
    .digest('hex')
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
    listNormReferences(db),
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
  code: string,
  message: string,
  options: { field?: string; originalValue?: string } = {},
): ImportMessage {
  return { code, level: 'warning', message, ...options }
}

function error(
  code: string,
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
    if (match) {
      ids.push(match.id)
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
    if (proposal.resolvedNormReferenceDbId != null) {
      ids.push(proposal.resolvedNormReferenceDbId)
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
    return {
      issuer: proposal.issuer,
      key: proposal.key,
      name: proposal.name,
      normReferenceId: explicitNormReferenceId,
      reference: proposal.reference,
      referencedCount,
      resolvedNormReferenceDbId: resolved?.id ?? null,
      type: proposal.type,
      uri: compactText(proposal.uri),
      version: compactText(proposal.version),
      warnings,
    }
  })
}

function previewRows(args: {
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
    const description = row.description.trim()
    const acceptanceCriteria = compactText(row.acceptanceCriteria)
    const explicitRequiresTesting = row.requiresTesting
    const verificationMethod = compactText(row.verificationMethod)
    const requiresTesting =
      explicitRequiresTesting == null
        ? verificationMethod != null
        : explicitRequiresTesting

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
      requirementPackageIds:
        args.mode === 'library'
          ? resolvePackageIds(row, args.referenceData, warnings)
          : [],
      requiresTesting,
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
      verificationMethod: requiresTesting ? verificationMethod : null,
    }

    if (values.requiresTesting && !values.verificationMethod) {
      errors.push(
        error(
          'import_verification_method_required',
          'Verification method is required when requiresTesting is true.',
          { field: 'verificationMethod' },
        ),
      )
    }

    return {
      errors,
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
    if (row.requiresTesting && !compactText(row.verificationMethod)) {
      throw validationError(
        'verificationMethod is required when requiresTesting is true',
      )
    }
  }
}

function previewFromReferenceData(args: {
  destinationId: number
  mode: RequirementsImportMode
  payload: ImportRequirementsPayload
  referenceData: ImportReferenceData
}): RequirementsImportPreview {
  const proposals = previewProposals(args.payload, args.referenceData)
  const rows = previewRows({
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
      requiresTesting: input.requiresTesting,
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
      verificationMethod: input.requiresTesting
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
    requiresTesting: row.requiresTesting,
    priorityLevelId: row.priorityLevelId ?? undefined,
    verificationMethod: row.requiresTesting
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
    requiresTesting: row.requiresTesting,
    priorityLevelId: row.priorityLevelId ?? null,
    verificationMethod: row.requiresTesting
      ? (compactText(row.verificationMethod) ?? null)
      : null,
  }
}

export function createRequirementsImportWorkflow({
  authorization,
  db,
}: ImportWorkflowOptions) {
  return {
    async buildImportAiPrompt(locale: 'en' | 'sv') {
      const referenceData = await loadImportReferenceData(db)
      const schema = buildRequirementsImportJsonSchema(locale)
      const isSv = locale === 'sv'
      return [
        isSv
          ? '# Skapa JSON för kravimport'
          : '# Create JSON for requirements import',
        '',
        isSv ? '## Regler' : '## Rules',
        '',
        isSv
          ? '- Returnera endast ett JSON-objekt som följer JSON Schema nedan.'
          : '- Return only a JSON object that follows the JSON Schema below.',
        isSv
          ? '- Sätt toppnivåfältet `schemaVersion` till `requirement-import.v1`.'
          : '- Set the top-level `schemaVersion` field to `requirement-import.v1`.',
        isSv
          ? '- Använd inte U+2013 EN DASH i JSON-värden; använd vanligt bindestreck (-) i stället.'
          : '- Do not use U+2013 EN DASH in JSON values; use a plain hyphen (-) instead.',
        isSv
          ? '- Använd referensdata för alla taxonomifält.'
          : '- Use reference data for all taxonomy fields.',
        isSv
          ? '- Utelämna frivilliga fält eller sätt dem till `null` när värdet är osäkert.'
          : '- Omit optional fields or set them to `null` when the value is uncertain.',
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
          ? '- Välj alla relevanta `requirementPackageIds`; utelämna fältet eller använd `[]` när inget paket passar.'
          : '- Choose all relevant `requirementPackageIds`; omit the field or use `[]` when no package fits.',
        isSv
          ? '- Sätt `requiresTesting` till `true` när kravet ska verifieras; ange då `verificationMethod`.'
          : '- Set `requiresTesting` to `true` when the requirement should be verified; then provide `verificationMethod`.',
        isSv
          ? '- Använd `verificationMethod` för verifieringssätt, inte för godkännandekriterier.'
          : '- Use `verificationMethod` for the verification method, not acceptance criteria.',
        '',
        '## JSON Schema',
        '',
        '```json',
        JSON.stringify(schema, null, 2),
        '```',
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
        mode: 'specification-local',
        payload: input.payload,
        referenceData,
      })
    },
  }
}

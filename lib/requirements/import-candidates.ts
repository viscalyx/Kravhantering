import { BUSINESS_TEXT_MAX_LENGTH } from '@/lib/http/validation-constants'
import type { RequirementImportBudget } from '@/lib/requirements/import-budget'
import { assertRequirementImportTextSize } from '@/lib/requirements/import-client'
import {
  buildRequirementsImportPayloadSchema,
  type ImportRequirementsPayload,
  type ImportReviewRowInput,
  REQUIREMENTS_IMPORT_SCHEMA_VERSION,
} from '@/lib/requirements/import-schema'

interface CandidateRow {
  proposedNeedsReferenceKey: string | null
  proposedNormReferenceKeys: string[]
  selected: boolean
  sourceIndex: number
  values: Omit<ImportReviewRowInput, 'reviewRowId' | 'sourceIndex'>
}

interface CandidateReview {
  needsReferenceProposals: Array<
    NonNullable<
      ImportRequirementsPayload['proposedNeedsReferences']
    >[number] & {
      resolvedNeedsReferenceId: number | null
    }
  >
  normReferences: Array<{ id: number; normReferenceId: string }>
  proposals: Array<
    NonNullable<ImportRequirementsPayload['proposedNormReferences']>[number] & {
      resolvedNormReferenceDbId: number | null
    }
  >
  rows: CandidateRow[]
}

export class RequirementImportCandidateError extends Error {
  constructor(
    readonly code: 'candidateReferenceUnavailable' | 'candidateSchemaInvalid',
    readonly field: string,
  ) {
    super(`${code}: ${field}`)
    this.name = 'RequirementImportCandidateError'
  }
}

export function serializeRequirementImportCandidates(
  review: CandidateReview,
  budget: RequirementImportBudget,
): string {
  const rows = review.rows.filter(row => row.selected)
  const normIds = new Map(
    review.normReferences.map(reference => [
      reference.id,
      reference.normReferenceId,
    ]),
  )
  const proposals = new Map(
    review.proposals.map(proposal => [proposal.key, proposal]),
  )
  const needsProposals = new Map(
    review.needsReferenceProposals.map(proposal => [proposal.key, proposal]),
  )
  const usedNormKeys = new Set<string>()
  const usedNeedsKeys = new Set<string>()
  const requirements = rows.map(row => {
    const values = row.values
    // The shared validator trims descriptions; the file must fit before trimming.
    if (values.description.length > BUSINESS_TEXT_MAX_LENGTH) {
      throw new RequirementImportCandidateError(
        'candidateSchemaInvalid',
        `requirements[${row.sourceIndex + 1}].description`,
      )
    }
    const normReferenceIds = values.normReferenceIds.map(id => {
      const businessId = normIds.get(id)
      if (!businessId?.trim()) {
        throw new RequirementImportCandidateError(
          'candidateReferenceUnavailable',
          `requirements[${row.sourceIndex + 1}].normReferenceIds (${id})`,
        )
      }
      return businessId
    })
    const proposedNormReferenceKeys = row.proposedNormReferenceKeys.filter(
      key => {
        const proposal = proposals.get(key)
        if (!proposal) {
          throw new RequirementImportCandidateError(
            'candidateReferenceUnavailable',
            `requirements[${row.sourceIndex + 1}].proposedNormReferenceKeys (${key})`,
          )
        }
        // Once resolved, the editable IDs own the association, including removal.
        if (proposal.resolvedNormReferenceDbId != null) return false
        usedNormKeys.add(key)
        return true
      },
    )
    let needsReferenceKey: string | undefined
    if (row.proposedNeedsReferenceKey && values.needsReferenceId == null) {
      const proposal = needsProposals.get(row.proposedNeedsReferenceKey)
      if (!proposal) {
        throw new RequirementImportCandidateError(
          'candidateReferenceUnavailable',
          `requirements[${row.sourceIndex + 1}].needsReferenceKey (${row.proposedNeedsReferenceKey})`,
        )
      }
      if (proposal.resolvedNeedsReferenceId == null) {
        needsReferenceKey = proposal.key
        usedNeedsKeys.add(proposal.key)
      }
    }
    return {
      acceptanceCriteria: values.acceptanceCriteria,
      categoryId: values.categoryId,
      description: values.description,
      needsReferenceId: values.needsReferenceId,
      ...(needsReferenceKey ? { needsReferenceKey } : {}),
      normReferenceIds,
      ...(proposedNormReferenceKeys.length
        ? { proposedNormReferenceKeys }
        : {}),
      priorityLevelId: values.priorityLevelId,
      qualityCharacteristicId: values.qualityCharacteristicId,
      requirementPackageIds: values.requirementPackageIds,
      typeId: values.typeId,
      verifiable: values.verifiable,
      verificationMethod: values.verificationMethod,
    }
  })
  const payload: ImportRequirementsPayload = {
    schemaVersion: REQUIREMENTS_IMPORT_SCHEMA_VERSION,
    requirements,
    ...(usedNormKeys.size
      ? {
          proposedNormReferences: review.proposals
            .filter(proposal => usedNormKeys.has(proposal.key))
            .map(
              ({
                issuer,
                key,
                name,
                normReferenceId,
                reference,
                type,
                uri,
                version,
              }) => ({
                issuer,
                key,
                name,
                normReferenceId,
                reference,
                type,
                uri,
                version,
              }),
            ),
        }
      : {}),
    ...(usedNeedsKeys.size
      ? {
          proposedNeedsReferences: review.needsReferenceProposals
            .filter(proposal => usedNeedsKeys.has(proposal.key))
            .map(({ description, key, text }) => ({ description, key, text })),
        }
      : {}),
  }
  const validation =
    buildRequirementsImportPayloadSchema(budget).safeParse(payload)
  if (!validation.success) {
    const path = [...validation.error.issues[0].path]
    if (path[0] === 'requirements' && typeof path[1] === 'number') {
      path[1] = rows[path[1]].sourceIndex + 1
    }
    throw new RequirementImportCandidateError(
      'candidateSchemaInvalid',
      path.join('.') || 'maxJsonDepth',
    )
  }
  // Validate without replacing edited text with schema-normalized values.
  const json = JSON.stringify(payload, null, 2)
  assertRequirementImportTextSize(json)
  return json
}

import {
  type ConnectedRequirementIdRow,
  getNormReferenceById,
  getNormReferenceByNormReferenceId,
  listConnectedLibraryRequirementIds,
  listNormReferences,
  type NormReferenceCreateData,
  type NormReferenceRow,
} from '@/lib/dal/norm-references'
import type { SqlServerDatabase } from '@/lib/db'
import type {
  AuthorizationService,
  RequestContext,
} from '@/lib/requirements/auth'
import { notFoundError, validationError } from '@/lib/requirements/errors'
import type { RequirementsLogger } from '@/lib/requirements/logging'
import {
  compareMcpSearchMatches,
  findMcpSearchMatch,
  type McpSearchMatch,
} from '@/lib/requirements/mcp-search'
import { createNormReferenceWithAudit } from '@/lib/requirements/norm-reference-mutations'
import type { RequirementsService } from '@/lib/requirements/service'
import { authorize, withLogging } from '@/lib/requirements/service-shared'

export interface McpNormReferenceRow extends NormReferenceRow {
  match?: McpSearchMatch
}

export type ManageNormReferenceInput =
  | {
      includeArchived?: boolean
      operation: 'list'
    }
  | {
      includeArchived?: boolean
      operation: 'search'
      search: string
    }
  | {
      id?: number
      normReferenceId?: string
      operation: 'get'
    }
  | {
      id?: number
      normReferenceId?: string
      operation: 'list_connected_requirement_ids'
    }
  | (NormReferenceCreateData & {
      operation: 'create'
    })

export type ManageNormReferenceOutput =
  | {
      normReference: McpNormReferenceRow
    }
  | {
      requirements: ConnectedRequirementIdRow[]
    }
  | {
      result: McpNormReferenceRow[]
    }

interface NormReferenceWorkflowDependencies {
  authorization: AuthorizationService
  db: SqlServerDatabase
  logger: RequirementsLogger
}

function compareNormReferences(
  left: NormReferenceRow,
  right: NormReferenceRow,
): number {
  return (
    left.issuer.localeCompare(right.issuer, 'sv') ||
    left.name.localeCompare(right.name, 'sv') ||
    left.reference.localeCompare(right.reference, 'sv') ||
    String(left.version ?? '').localeCompare(
      String(right.version ?? ''),
      'sv',
    ) ||
    left.normReferenceId.localeCompare(right.normReferenceId, 'sv')
  )
}

function toMcpNormReferenceRow(
  row: NormReferenceRow,
  match: McpSearchMatch,
): McpNormReferenceRow & { match: McpSearchMatch }
function toMcpNormReferenceRow(
  row: NormReferenceRow,
  match?: McpSearchMatch,
): McpNormReferenceRow
function toMcpNormReferenceRow(
  row: NormReferenceRow,
  match?: McpSearchMatch,
): McpNormReferenceRow {
  const result: McpNormReferenceRow = {
    createdAt: row.createdAt,
    id: row.id,
    isArchived: row.isArchived,
    issuer: row.issuer,
    name: row.name,
    normReferenceId: row.normReferenceId,
    reference: row.reference,
    type: row.type,
    updatedAt: row.updatedAt,
    uri: row.uri,
    version: row.version,
  }
  if (match) {
    result.match = match
  }
  return result
}

function findNormReferenceMatch(
  row: NormReferenceRow,
  search: string,
): McpSearchMatch | null {
  return findMcpSearchMatch(
    {
      issuer: row.issuer,
      name: row.name,
      normReferenceId: row.normReferenceId,
      reference: row.reference,
      type: row.type,
      uri: row.uri,
      version: row.version,
    },
    search,
  )
}

type NormReferenceSelectorInput = Extract<
  ManageNormReferenceInput,
  { operation: 'get' | 'list_connected_requirement_ids' }
>

function getSelectorKind(
  input: ManageNormReferenceInput,
): 'ambiguous' | 'id' | 'none' | 'normReferenceId' {
  const hasId = 'id' in input && input.id != null
  const hasNormReferenceId =
    'normReferenceId' in input && input.normReferenceId != null
  if (hasId && hasNormReferenceId) return 'ambiguous'
  if (hasId) return 'id'
  if (hasNormReferenceId) return 'normReferenceId'
  return 'none'
}

function validateNormReferenceSelector(input: NormReferenceSelectorInput):
  | {
      id: number
      normReferenceId?: never
    }
  | {
      id?: never
      normReferenceId: string
    } {
  const selectorKind = getSelectorKind(input)
  if (selectorKind === 'none' || selectorKind === 'ambiguous') {
    throw validationError('Provide exactly one of id or normReferenceId', {
      reason: 'invalid_norm_reference_selector',
      selectorKind,
    })
  }

  if (selectorKind === 'id') {
    const id = input.id
    if (!Number.isInteger(id) || id == null || id <= 0) {
      throw validationError('Norm reference id must be a positive integer', {
        reason: 'invalid_norm_reference_id',
      })
    }
    return { id }
  }

  const normReferenceId = input.normReferenceId?.trim() ?? ''
  if (!normReferenceId) {
    throw validationError('Norm reference business ID is required', {
      reason: 'invalid_norm_reference_business_id',
    })
  }
  return { normReferenceId }
}

async function resolveNormReference(
  db: SqlServerDatabase,
  input: NormReferenceSelectorInput,
): Promise<NormReferenceRow> {
  const selector = validateNormReferenceSelector(input)
  const row =
    selector.id != null
      ? await getNormReferenceById(db, selector.id)
      : await getNormReferenceByNormReferenceId(db, selector.normReferenceId)

  if (!row) {
    throw notFoundError('Norm reference not found', selector)
  }
  return row
}

export function createNormReferenceWorkflow({
  authorization,
  db,
  logger,
}: NormReferenceWorkflowDependencies): Pick<
  RequirementsService,
  'manageNormReference'
> {
  return {
    async manageNormReference(context: RequestContext, input) {
      await authorize(
        authorization,
        {
          kind: 'manage_norm_reference',
          operation: input.operation,
        },
        context,
      )

      return withLogging(
        logger,
        context,
        'requirements.manage_norm_reference',
        {
          include_archived:
            'includeArchived' in input ? input.includeArchived : null,
          operation: input.operation,
          selector_kind: getSelectorKind(input),
        },
        async (): Promise<ManageNormReferenceOutput> => {
          if (input.operation === 'create') {
            return {
              normReference: toMcpNormReferenceRow(
                await createNormReferenceWithAudit(
                  db,
                  {
                    issuer: input.issuer,
                    name: input.name,
                    normReferenceId: input.normReferenceId,
                    reference: input.reference,
                    type: input.type,
                    uri: input.uri,
                    version: input.version,
                  },
                  context,
                ),
              ),
            }
          }

          if (input.operation === 'get') {
            return {
              normReference: toMcpNormReferenceRow(
                await resolveNormReference(db, input),
              ),
            }
          }

          if (input.operation === 'list_connected_requirement_ids') {
            const normReference = await resolveNormReference(db, input)
            return {
              requirements: await listConnectedLibraryRequirementIds(
                db,
                normReference.id,
              ),
            }
          }

          const search = input.operation === 'search' ? input.search.trim() : ''
          if (input.operation === 'search' && !search) {
            throw validationError('Search text is required')
          }
          const rows = (
            await listNormReferences(db, {
              includeArchived: input.includeArchived ?? false,
            })
          ).sort(compareNormReferences)

          if (input.operation === 'list') {
            return { result: rows.map(row => toMcpNormReferenceRow(row)) }
          }
          const matched = rows
            .flatMap(
              (row): Array<McpNormReferenceRow & { match: McpSearchMatch }> => {
                const match = findNormReferenceMatch(row, search)
                if (!match) {
                  return []
                }
                return [toMcpNormReferenceRow(row, match)]
              },
            )
            .sort(
              (left, right) =>
                compareMcpSearchMatches(left.match, right.match) ||
                compareNormReferences(left, right),
            )

          return { result: matched }
        },
      )
    },
  }
}

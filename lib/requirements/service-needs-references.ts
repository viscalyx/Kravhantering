import {
  createSpecificationNeedsReference,
  getSpecificationNeedsReference,
  listSpecificationNeedsReferences,
  type SpecificationNeedsReferenceSummary,
} from '@/lib/dal/requirements-specifications'
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
import type { RequirementsService } from '@/lib/requirements/service'
import { authorize, withLogging } from '@/lib/requirements/service-shared'

export interface McpNeedsReferenceRow
  extends SpecificationNeedsReferenceSummary {
  match?: McpSearchMatch
}

export type ManageNeedsReferenceInput =
  | {
      operation: 'list'
      specificationId: number
    }
  | {
      operation: 'search'
      search: string
      specificationId: number
    }
  | {
      needsReferenceId: number
      operation: 'get'
      specificationId: number
    }
  | {
      description?: string | null
      operation: 'create'
      specificationId: number
      text: string
    }

export type ManageNeedsReferenceOutput =
  | {
      needsReference: McpNeedsReferenceRow
    }
  | {
      result: McpNeedsReferenceRow[]
    }

interface NeedsReferenceWorkflowDependencies {
  authorization: AuthorizationService
  db: SqlServerDatabase
  logger: RequirementsLogger
}

function compareNeedsReferences(
  left: SpecificationNeedsReferenceSummary,
  right: SpecificationNeedsReferenceSummary,
): number {
  return left.text.localeCompare(right.text, 'sv') || left.id - right.id
}

function toMcpNeedsReferenceRow(
  row: SpecificationNeedsReferenceSummary,
  match: McpSearchMatch,
): McpNeedsReferenceRow & { match: McpSearchMatch }
function toMcpNeedsReferenceRow(
  row: SpecificationNeedsReferenceSummary,
  match?: McpSearchMatch,
): McpNeedsReferenceRow
function toMcpNeedsReferenceRow(
  row: SpecificationNeedsReferenceSummary,
  match?: McpSearchMatch,
): McpNeedsReferenceRow {
  return match ? { ...row, match } : { ...row }
}

function findNeedsReferenceMatch(
  row: SpecificationNeedsReferenceSummary,
  search: string,
): McpSearchMatch | null {
  return findMcpSearchMatch(
    {
      description: row.description,
      id: row.id,
      text: row.text,
    },
    search,
  )
}

async function listNeedsReferences(
  dependencies: NeedsReferenceWorkflowDependencies,
  specificationId: number,
): Promise<SpecificationNeedsReferenceSummary[]> {
  return (
    await listSpecificationNeedsReferences(dependencies.db, specificationId)
  ).sort(compareNeedsReferences)
}

export function createNeedsReferenceWorkflow(
  dependencies: NeedsReferenceWorkflowDependencies,
): Pick<RequirementsService, 'manageNeedsReference'> {
  const { authorization, db, logger } = dependencies
  return {
    async manageNeedsReference(context: RequestContext, input) {
      await authorize(
        authorization,
        {
          kind: 'manage_specification_needs_reference',
          operation: input.operation,
          specificationId: input.specificationId,
          needsReferenceId:
            'needsReferenceId' in input ? input.needsReferenceId : undefined,
        },
        context,
      )

      return withLogging(
        logger,
        context,
        'requirements.manage_needs_reference',
        {
          operation: input.operation,
          specification_id: input.specificationId,
        },
        async (): Promise<ManageNeedsReferenceOutput> => {
          if (input.operation === 'create') {
            return {
              needsReference: toMcpNeedsReferenceRow(
                await createSpecificationNeedsReference(
                  db,
                  input.specificationId,
                  {
                    description: input.description ?? null,
                    text: input.text,
                  },
                ),
              ),
            }
          }

          const search = input.operation === 'search' ? input.search.trim() : ''
          if (input.operation === 'search' && !search) {
            throw validationError('Search text is required')
          }

          if (input.operation === 'get') {
            const row = await getSpecificationNeedsReference(
              db,
              input.specificationId,
              input.needsReferenceId,
            )
            if (!row) {
              throw notFoundError('Needs reference not found', {
                needsReferenceId: input.needsReferenceId,
                specificationId: input.specificationId,
              })
            }
            return { needsReference: toMcpNeedsReferenceRow(row) }
          }

          const rows = await listNeedsReferences(
            dependencies,
            input.specificationId,
          )

          if (input.operation === 'list') {
            return { result: rows.map(row => toMcpNeedsReferenceRow(row)) }
          }

          const matched = rows
            .flatMap(
              (
                row,
              ): Array<McpNeedsReferenceRow & { match: McpSearchMatch }> => {
                const match = findNeedsReferenceMatch(row, search)
                return match ? [toMcpNeedsReferenceRow(row, match)] : []
              },
            )
            .sort(
              (left, right) =>
                compareMcpSearchMatches(left.match, right.match) ||
                compareNeedsReferences(left, right),
            )

          return { result: matched }
        },
      )
    },
  }
}

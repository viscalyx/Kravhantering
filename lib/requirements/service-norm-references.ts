import {
  listNormReferences,
  type NormReferenceCreateData,
  type NormReferenceRow,
} from '@/lib/dal/norm-references'
import type { SqlServerDatabase } from '@/lib/db'
import type {
  AuthorizationService,
  RequestContext,
} from '@/lib/requirements/auth'
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
  | (NormReferenceCreateData & {
      operation: 'create'
    })

export type ManageNormReferenceOutput =
  | {
      normReference: McpNormReferenceRow
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
        },
        async (): Promise<ManageNormReferenceOutput> => {
          if (input.operation === 'create') {
            return {
              normReference: await createNormReferenceWithAudit(
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
            }
          }

          const rows = (
            await listNormReferences(db, {
              includeArchived: input.includeArchived ?? false,
            })
          ).sort(compareNormReferences)

          if (input.operation === 'list') {
            return { result: rows }
          }

          const search = input.search.trim()
          const matched = rows
            .flatMap(
              (row): Array<McpNormReferenceRow & { match: McpSearchMatch }> => {
                const match = findNormReferenceMatch(row, search)
                return match ? [{ ...row, match }] : []
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

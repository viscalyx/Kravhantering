import { NextResponse } from 'next/server'
import { z } from 'zod'
import { recordAllowedActionAuditEvent } from '@/lib/audit/action-audit'
import {
  countLinkedRequirementsByPackage,
  createRequirementPackage,
  listRequirementPackages,
} from '@/lib/dal/requirement-packages'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  customMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import {
  boundedDbStringSchema,
  optionalBusinessTextSchema,
  parseSearchParams,
  queryBooleanSchema,
} from '@/lib/http/validation'
import {
  createRequestContext,
  requireHumanActorSnapshot,
} from '@/lib/requirements/auth'
import { requireRequirementPackageCreatePermission } from '@/lib/requirements/requirement-package-permissions'
import { resolveVerifiedRequirementResponsibilityPerson } from '@/lib/requirements/responsibility-person-verification'

const requirementPackageSchema = z
  .object({
    description: optionalBusinessTextSchema,
    name: boundedDbStringSchema,
  })
  .strict()

const querySchema = z
  .object({
    includeArchived: queryBooleanSchema.optional().default(false),
  })
  .passthrough()

export async function GET(request: Request) {
  const parsedQuery = parseSearchParams(
    new URL(request.url).searchParams,
    querySchema,
  )
  if (!parsedQuery.ok) return parsedQuery.response
  const db = await getRequestSqlServerDataSource()
  const context = await createRequestContext(request, 'rest')
  const isAdmin = context.actor.roles.includes('Admin')
  const actorHsaId = context.actor.hsaId?.trim() ?? null
  const [requirementPackages, counts] = await Promise.all([
    listRequirementPackages(db, {
      includeArchived: parsedQuery.data.includeArchived,
    }),
    countLinkedRequirementsByPackage(db),
  ])
  return NextResponse.json({
    requirementPackages: requirementPackages.map(s => ({
      ...s,
      linkedRequirementCount: counts[s.id] ?? 0,
      owner: null,
      ownerId: null,
      permissions: {
        canManageAssignments: isAdmin || actorHsaId === s.leadHsaId,
      },
    })),
  })
}

export const POST = secureMutationRoute({
  bodySchema: requirementPackageSchema,
  policy: customMutationPolicy('requirement_package.create', async args => {
    const db = await getRequestSqlServerDataSource()
    await requireRequirementPackageCreatePermission(db, args.context)
  }),
  handler: async ({ body, context }) => {
    const db = await getRequestSqlServerDataSource()
    const actor = requireHumanActorSnapshot(context)
    const leadPerson = await resolveVerifiedRequirementResponsibilityPerson(
      db,
      actor.hsaId,
    )
    const requirementPackage = await db.transaction(async manager => {
      const createdRequirementPackage = await createRequirementPackage(
        manager,
        {
          ...body,
          leadHsaId: actor.hsaId,
          leadPerson,
        },
        { useExistingTransaction: true },
      )
      await recordAllowedActionAuditEvent(manager, context, {
        action: 'requirement_package.create',
        details: {
          changedFields: ['leadHsaId', ...Object.keys(body)],
        },
        targetId: createdRequirementPackage.id,
        targetKind: 'requirement_package',
      })
      return createdRequirementPackage
    })
    return NextResponse.json(requirementPackage, { status: 201 })
  },
})

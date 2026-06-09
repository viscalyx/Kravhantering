import { NextResponse } from 'next/server'
import { z } from 'zod'
import { recordAllowedActionAuditEvent } from '@/lib/audit/action-audit'
import { isHsaId } from '@/lib/auth/hsa-id'
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
  ARRAY_INPUT_MAX_ITEMS,
  boundedDbStringSchema,
  optionalBusinessTextSchema,
  parseSearchParams,
  queryBooleanSchema,
} from '@/lib/http/validation'
import { requireHumanActorSnapshot } from '@/lib/requirements/auth'
import { validationError } from '@/lib/requirements/errors'
import { requireRequirementPackageCreatePermission } from '@/lib/requirements/requirement-package-permissions'
import {
  resolveVerifiedRequirementResponsibilityPeople,
  resolveVerifiedRequirementResponsibilityPerson,
} from '@/lib/requirements/responsibility-person-verification'

const hsaIdSchema = boundedDbStringSchema.refine(isHsaId, {
  message: 'Expected a valid HSA-ID',
})

const coAuthorHsaIdsSchema = z
  .array(hsaIdSchema)
  .max(ARRAY_INPUT_MAX_ITEMS)
  .refine(values => new Set(values).size === values.length, {
    message: 'Expected unique HSA-IDs',
  })

const requirementPackageSchema = z
  .object({
    coAuthorHsaIds: coAuthorHsaIdsSchema.optional().default([]),
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
    if (body.coAuthorHsaIds.includes(actor.hsaId)) {
      throw validationError('Package lead cannot also be package co-author', {
        reason: 'package_lead_cannot_be_co_author',
      })
    }
    const leadPerson = await resolveVerifiedRequirementResponsibilityPerson(
      db,
      actor.hsaId,
    )
    const coAuthorPeople = await resolveVerifiedRequirementResponsibilityPeople(
      db,
      body.coAuthorHsaIds,
    )
    const requirementPackage = await createRequirementPackage(db, {
      ...body,
      createdBy: actor,
      coAuthorPeople,
      leadHsaId: actor.hsaId,
      leadPerson,
    })
    await recordAllowedActionAuditEvent(db, context, {
      action: 'requirement_package.create',
      details: {
        changedFields: ['leadHsaId', ...Object.keys(body)],
      },
      targetId: requirementPackage.id,
      targetKind: 'requirement_package',
    })
    return NextResponse.json(requirementPackage, { status: 201 })
  },
})

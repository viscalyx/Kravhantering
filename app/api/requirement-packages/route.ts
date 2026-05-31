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
  boundedDbStringSchema,
  optionalBusinessTextSchema,
  queryBooleanSchema,
} from '@/lib/http/validation'

const requirementPackageSchema = z
  .object({
    description: optionalBusinessTextSchema,
    leadDisplayName: boundedDbStringSchema,
    leadHsaId: boundedDbStringSchema.refine(isHsaId, {
      message: 'Expected a valid HSA-ID',
    }),
    name: boundedDbStringSchema,
  })
  .strict()

const querySchema = z
  .object({
    includeArchived: queryBooleanSchema.optional().default(false),
  })
  .passthrough()

export async function GET(request: Request) {
  const db = await getRequestSqlServerDataSource()
  const query = querySchema.parse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  )
  const [requirementPackages, counts] = await Promise.all([
    listRequirementPackages(db, { includeArchived: query.includeArchived }),
    countLinkedRequirementsByPackage(db),
  ])
  return NextResponse.json({
    requirementPackages: requirementPackages.map(s => ({
      ...s,
      descriptionEn: s.description,
      descriptionSv: s.description,
      linkedRequirementCount: counts[s.id] ?? 0,
      nameEn: s.name,
      nameSv: s.name,
      owner: null,
      ownerId: null,
    })),
  })
}

export const POST = secureMutationRoute({
  bodySchema: requirementPackageSchema,
  policy: customMutationPolicy('requirement_package', () => {}),
  handler: async ({ body, context }) => {
    const db = await getRequestSqlServerDataSource()
    const requirementPackage = await createRequirementPackage(db, body)
    await recordAllowedActionAuditEvent(db, context, {
      action: 'requirement_package.create',
      details: { changedFields: Object.keys(body) },
      targetId: requirementPackage.id,
      targetKind: 'requirement_package',
    })
    return NextResponse.json(requirementPackage, { status: 201 })
  },
})

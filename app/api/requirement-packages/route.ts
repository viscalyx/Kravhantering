import { NextResponse } from 'next/server'
import { z } from 'zod'
import { recordAdminPrivilegedActionSucceeded } from '@/lib/admin/privileged-audit'
import {
  countLinkedRequirementsByPackage,
  createRequirementPackage,
  listRequirementPackages,
} from '@/lib/dal/requirement-packages'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  adminMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import {
  boundedDbStringSchema,
  optionalBusinessTextSchema,
  positiveIntegerSchema,
} from '@/lib/http/validation'

const requirementPackageSchema = z
  .object({
    descriptionEn: optionalBusinessTextSchema,
    descriptionSv: optionalBusinessTextSchema,
    nameEn: boundedDbStringSchema,
    nameSv: boundedDbStringSchema,
    ownerId: positiveIntegerSchema.nullable().optional(),
  })
  .strict()

export async function GET() {
  const db = await getRequestSqlServerDataSource()
  const [requirementPackages, counts] = await Promise.all([
    listRequirementPackages(db),
    countLinkedRequirementsByPackage(db),
  ])
  return NextResponse.json({
    requirementPackages: requirementPackages.map(s => ({
      ...s,
      linkedRequirementCount: counts[s.id] ?? 0,
    })),
  })
}

export const POST = secureMutationRoute({
  bodySchema: requirementPackageSchema,
  policy: adminMutationPolicy(),
  handler: async ({ body, context }) => {
    const db = await getRequestSqlServerDataSource()
    const requirementPackage = await createRequirementPackage(db, body)
    await recordAdminPrivilegedActionSucceeded(context, {
      changedFields: Object.keys(body),
      operation: 'create',
      resourceId: requirementPackage.id,
      resourceType: 'requirement_package',
    })
    return NextResponse.json(requirementPackage, { status: 201 })
  },
})

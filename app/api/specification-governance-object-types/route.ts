import { NextResponse } from 'next/server'
import { z } from 'zod'
import { recordAdminPrivilegedActionSucceeded } from '@/lib/admin/privileged-audit'
import {
  createSpecificationGovernanceObjectType,
  listSpecificationGovernanceObjectTypes,
} from '@/lib/dal/specification-governance-object-types'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  adminMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { boundedDbStringSchema } from '@/lib/http/validation'

const governanceObjectTypeSchema = z
  .object({
    nameEn: boundedDbStringSchema,
    nameSv: boundedDbStringSchema,
  })
  .strict()

export async function GET() {
  const db = await getRequestSqlServerDataSource()
  const governanceObjectTypes = await listSpecificationGovernanceObjectTypes(db)
  return NextResponse.json({ governanceObjectTypes })
}

export const POST = secureMutationRoute({
  bodySchema: governanceObjectTypeSchema,
  policy: adminMutationPolicy(),
  handler: async ({ body, context }) => {
    const db = await getRequestSqlServerDataSource()
    const governanceObjectType = await createSpecificationGovernanceObjectType(
      db,
      body,
    )
    await recordAdminPrivilegedActionSucceeded(context, {
      changedFields: Object.keys(body),
      operation: 'create',
      resourceId: governanceObjectType.id,
      resourceType: 'specification_governance_object_type',
    })
    return NextResponse.json(governanceObjectType, { status: 201 })
  },
})

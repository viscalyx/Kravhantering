import { NextResponse } from 'next/server'
import { z } from 'zod'
import { recordAdminPrivilegedActionSucceeded } from '@/lib/admin/privileged-audit'
import {
  createSpecificationImplementationType,
  listSpecificationImplementationTypes,
} from '@/lib/dal/specification-implementation-types'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  adminMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { boundedDbStringSchema } from '@/lib/http/validation'

export const dynamic = 'force-dynamic'

const implementationTypeSchema = z
  .object({
    nameEn: boundedDbStringSchema,
    nameSv: boundedDbStringSchema,
  })
  .strict()

export async function GET() {
  const db = await getRequestSqlServerDataSource()
  const types = await listSpecificationImplementationTypes(db)
  return NextResponse.json({ types })
}

export const POST = secureMutationRoute({
  bodySchema: implementationTypeSchema,
  policy: adminMutationPolicy(),
  handler: async ({ body, context }) => {
    const db = await getRequestSqlServerDataSource()
    const type = await createSpecificationImplementationType(db, body)
    await recordAdminPrivilegedActionSucceeded(context, {
      changedFields: Object.keys(body),
      operation: 'create',
      resourceId: type.id,
      resourceType: 'specification_implementation_type',
    })
    return NextResponse.json(type, { status: 201 })
  },
})

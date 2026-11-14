import { NextResponse } from 'next/server'
import { z } from 'zod'
import { runPrivilegedMutation } from '@/lib/admin/privileged-audit'
import {
  createSpecificationLifecycleStatus,
  listSpecificationLifecycleStatuses,
} from '@/lib/dal/specification-lifecycle-statuses'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  adminMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { boundedDbStringSchema } from '@/lib/http/validation'

const lifecycleStatusSchema = z
  .object({
    nameEn: boundedDbStringSchema,
    nameSv: boundedDbStringSchema,
  })
  .strict()

export async function GET() {
  const db = await getRequestSqlServerDataSource()
  const statuses = await listSpecificationLifecycleStatuses(db)
  return NextResponse.json({ statuses })
}

export const POST = secureMutationRoute({
  bodySchema: lifecycleStatusSchema,
  policy: adminMutationPolicy(),
  handler: async ({ body, context }) => {
    const db = await getRequestSqlServerDataSource()
    return await runPrivilegedMutation(db, context, async (manager, audit) => {
      const status = await createSpecificationLifecycleStatus(manager, body)
      await audit(manager, {
        changedFields: Object.keys(body),
        operation: 'create',
        resourceId: status.id,
        resourceType: 'specification_lifecycle_status',
      })
      return NextResponse.json(status, { status: 201 })
    })
  },
})

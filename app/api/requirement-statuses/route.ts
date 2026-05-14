import { NextResponse } from 'next/server'
import { z } from 'zod'
import { recordAdminPrivilegedActionSucceeded } from '@/lib/admin/privileged-audit'
import {
  createStatus,
  listStatuses,
  listTransitions,
} from '@/lib/dal/requirement-statuses'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  adminMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import {
  boundedDbStringSchema,
  nonNegativeIntegerSchema,
} from '@/lib/http/validation'

const createStatusSchema = z
  .object({
    color: boundedDbStringSchema,
    isSystem: z.boolean().optional(),
    nameEn: boundedDbStringSchema,
    nameSv: boundedDbStringSchema,
    sortOrder: nonNegativeIntegerSchema,
  })
  .strict()

export async function GET() {
  const db = await getRequestSqlServerDataSource()
  const [statuses, transitions] = await Promise.all([
    listStatuses(db),
    listTransitions(db),
  ])
  return NextResponse.json({ statuses, transitions })
}

export const POST = secureMutationRoute({
  bodySchema: createStatusSchema,
  policy: adminMutationPolicy(),
  handler: async ({ body, context }) => {
    const db = await getRequestSqlServerDataSource()
    const status = await createStatus(db, body)
    recordAdminPrivilegedActionSucceeded(context, {
      changedFields: Object.keys(body),
      operation: 'create',
      resourceId: status.id,
      resourceType: 'requirement_status',
    })
    return NextResponse.json(status, { status: 201 })
  },
})

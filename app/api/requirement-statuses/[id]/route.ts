import { NextResponse } from 'next/server'
import { z } from 'zod'
import { recordAdminPrivilegedActionSucceeded } from '@/lib/admin/privileged-audit'
import { updateStatus } from '@/lib/dal/requirement-statuses'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  adminMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import {
  boundedDbStringSchema,
  idParamSchema,
  nonNegativeIntegerSchema,
} from '@/lib/http/validation'
import { nullableOptionalStatusIconNameSchema } from '@/lib/icons/status-icon-schema'

export const dynamic = 'force-dynamic'

const updateStatusSchema = z
  .object({
    color: boundedDbStringSchema.optional(),
    iconName: nullableOptionalStatusIconNameSchema,
    nameEn: boundedDbStringSchema.optional(),
    nameSv: boundedDbStringSchema.optional(),
    sortOrder: nonNegativeIntegerSchema.optional(),
  })
  .strict()

const nonEmptyUpdateStatusSchema = updateStatusSchema.refine(
  data => Object.keys(data).length > 0,
  {
    message: 'At least one field must be provided',
  },
)

export const PUT = secureMutationRoute({
  bodySchema: nonEmptyUpdateStatusSchema,
  paramsSchema: idParamSchema,
  policy: adminMutationPolicy(),
  handler: async ({ body, context, params }) => {
    const db = await getRequestSqlServerDataSource()
    const updated = await updateStatus(db, params.id, body)
    await recordAdminPrivilegedActionSucceeded(context, {
      changedFields: Object.keys(body),
      operation: 'update',
      resourceId: params.id,
      resourceType: 'requirement_status',
    })
    return NextResponse.json(updated)
  },
})

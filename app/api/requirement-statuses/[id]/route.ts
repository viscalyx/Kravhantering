import { NextResponse } from 'next/server'
import { z } from 'zod'
import { recordAdminPrivilegedActionSucceeded } from '@/lib/admin/privileged-audit'
import { deleteStatus, updateStatus } from '@/lib/dal/requirement-statuses'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { logSanitizedError } from '@/lib/http/safe-errors'
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
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'

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

export const DELETE = secureMutationRoute({
  paramsSchema: idParamSchema,
  policy: adminMutationPolicy(),
  handler: async ({ context, params }) => {
    const db = await getRequestSqlServerDataSource()
    try {
      await deleteStatus(db, params.id)
      await recordAdminPrivilegedActionSucceeded(context, {
        operation: 'delete',
        resourceId: params.id,
        resourceType: 'requirement_status',
      })
      return NextResponse.json({ ok: true })
    } catch (error) {
      const { body, status } = toHttpErrorPayload(error)
      if (body.code === 'internal') {
        logSanitizedError('Failed to delete requirement status', error)
      }
      return NextResponse.json(body, { status })
    }
  },
})

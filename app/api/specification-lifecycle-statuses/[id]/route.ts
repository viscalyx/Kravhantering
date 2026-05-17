import { NextResponse } from 'next/server'
import { z } from 'zod'
import { recordAdminPrivilegedActionSucceeded } from '@/lib/admin/privileged-audit'
import {
  deleteSpecificationLifecycleStatus,
  updateSpecificationLifecycleStatus,
} from '@/lib/dal/specification-lifecycle-statuses'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  INTERNAL_SERVER_ERROR_MESSAGE,
  isForeignKeyViolation,
  logSanitizedError,
} from '@/lib/http/safe-errors'
import {
  adminMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { boundedDbStringSchema, idParamSchema } from '@/lib/http/validation'

export const dynamic = 'force-dynamic'

const updateLifecycleStatusSchema = z
  .object({
    nameEn: boundedDbStringSchema.optional(),
    nameSv: boundedDbStringSchema.optional(),
  })
  .strict()
  .refine(data => data.nameEn !== undefined || data.nameSv !== undefined, {
    message: 'At least one of nameEn or nameSv must be provided',
  })

export const PUT = secureMutationRoute({
  bodySchema: updateLifecycleStatusSchema,
  paramsSchema: idParamSchema,
  policy: adminMutationPolicy(),
  handler: async ({ body, context, params }) => {
    const db = await getRequestSqlServerDataSource()
    try {
      const status = await updateSpecificationLifecycleStatus(
        db,
        params.id,
        body,
      )
      if (!status) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
      await recordAdminPrivilegedActionSucceeded(context, {
        changedFields: Object.keys(body),
        operation: 'update',
        resourceId: params.id,
        resourceType: 'specification_lifecycle_status',
      })
      return NextResponse.json(status)
    } catch (err) {
      logSanitizedError('Failed to update specification lifecycle status', err)
      return NextResponse.json(
        { error: INTERNAL_SERVER_ERROR_MESSAGE },
        { status: 500 },
      )
    }
  },
})

export const DELETE = secureMutationRoute({
  paramsSchema: idParamSchema,
  policy: adminMutationPolicy(),
  handler: async ({ context, params }) => {
    const db = await getRequestSqlServerDataSource()
    try {
      const deletedCount = await deleteSpecificationLifecycleStatus(
        db,
        params.id,
      )
      if (deletedCount === 0) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
      await recordAdminPrivilegedActionSucceeded(context, {
        operation: 'delete',
        resourceId: params.id,
        resourceType: 'specification_lifecycle_status',
      })
      return NextResponse.json({ ok: true })
    } catch (err) {
      if (isForeignKeyViolation(err)) {
        return NextResponse.json(
          { error: 'Cannot delete: lifecycle status is in use' },
          { status: 409 },
        )
      }
      logSanitizedError('Failed to delete specification lifecycle status', err)
      return NextResponse.json(
        { error: INTERNAL_SERVER_ERROR_MESSAGE },
        { status: 500 },
      )
    }
  },
})

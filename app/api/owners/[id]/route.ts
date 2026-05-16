import { NextResponse } from 'next/server'
import { z } from 'zod'
import { recordAdminPrivilegedActionSucceeded } from '@/lib/admin/privileged-audit'
import { isHsaId } from '@/lib/auth/hsa-id'
import { deleteOwner, updateOwner } from '@/lib/dal/owners'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  adminMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { boundedDbStringSchema, idParamSchema } from '@/lib/http/validation'

export const dynamic = 'force-dynamic'

const ownerUpdateSchema = z
  .object({
    email: boundedDbStringSchema.nullable().optional(),
    firstName: boundedDbStringSchema.optional(),
    hsaId: boundedDbStringSchema
      .refine(isHsaId, {
        message:
          'HSA-ID must use format SE<10-digit org no>-<alphanumeric suffix>.',
      })
      .nullable()
      .optional(),
    lastName: boundedDbStringSchema.optional(),
  })
  .strict()

export const PUT = secureMutationRoute({
  bodySchema: ownerUpdateSchema,
  paramsSchema: idParamSchema,
  policy: adminMutationPolicy(),
  handler: async ({ body, context, params }) => {
    const db = await getRequestSqlServerDataSource()
    const owner = await updateOwner(db, params.id, body)
    if (!owner) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await recordAdminPrivilegedActionSucceeded(context, {
      changedFields: Object.keys(body),
      operation: 'update',
      resourceId: params.id,
      resourceType: 'owner',
    })
    return NextResponse.json(owner)
  },
})

export const DELETE = secureMutationRoute({
  paramsSchema: idParamSchema,
  policy: adminMutationPolicy(),
  handler: async ({ context, params }) => {
    const db = await getRequestSqlServerDataSource()
    const deleted = await deleteOwner(db, params.id)
    if (!deleted) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await recordAdminPrivilegedActionSucceeded(context, {
      operation: 'delete',
      resourceId: params.id,
      resourceType: 'owner',
    })
    return NextResponse.json({ ok: true })
  },
})

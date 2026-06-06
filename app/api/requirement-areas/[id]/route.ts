import { NextResponse } from 'next/server'
import { z } from 'zod'
import { recordAdminPrivilegedActionSucceeded } from '@/lib/admin/privileged-audit'
import { isHsaId } from '@/lib/auth/hsa-id'
import { deleteArea, updateArea } from '@/lib/dal/requirement-areas'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  adminMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import {
  boundedDbStringSchema,
  idParamSchema,
  optionalBusinessTextSchema,
} from '@/lib/http/validation'

export const dynamic = 'force-dynamic'

const hsaIdSchema = boundedDbStringSchema.refine(isHsaId, {
  message:
    'HSA-ID must use format <two-letter country code><10-digit org no>-<alphanumeric suffix>.',
})

const updateAreaSchema = z
  .object({
    description: optionalBusinessTextSchema,
    name: boundedDbStringSchema.optional(),
    ownerHsaId: hsaIdSchema.optional(),
  })
  .strict()

export const PUT = secureMutationRoute({
  bodySchema: updateAreaSchema,
  paramsSchema: idParamSchema,
  policy: adminMutationPolicy(),
  handler: async ({ body, context, params }) => {
    const db = await getRequestSqlServerDataSource()
    const area = await updateArea(db, params.id, body)
    if (!area) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await recordAdminPrivilegedActionSucceeded(context, {
      changedFields: Object.keys(body),
      operation: 'update',
      resourceId: params.id,
      resourceType: 'requirement_area',
    })
    return NextResponse.json(area)
  },
})

export const DELETE = secureMutationRoute({
  paramsSchema: idParamSchema,
  policy: adminMutationPolicy(),
  handler: async ({ context, params }) => {
    const db = await getRequestSqlServerDataSource()
    const deletedCount = await deleteArea(db, params.id)
    if (deletedCount === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await recordAdminPrivilegedActionSucceeded(context, {
      operation: 'delete',
      resourceId: params.id,
      resourceType: 'requirement_area',
    })
    return NextResponse.json({ ok: true })
  },
})

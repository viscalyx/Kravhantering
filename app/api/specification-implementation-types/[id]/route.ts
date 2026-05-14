import { NextResponse } from 'next/server'
import { z } from 'zod'
import { recordAdminPrivilegedActionSucceeded } from '@/lib/admin/privileged-audit'
import {
  deleteSpecificationImplementationType,
  updateSpecificationImplementationType,
} from '@/lib/dal/specification-implementation-types'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  adminMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { boundedDbStringSchema, idParamSchema } from '@/lib/http/validation'

export const dynamic = 'force-dynamic'

const updateImplementationTypeSchema = z
  .object({
    nameEn: boundedDbStringSchema.optional(),
    nameSv: boundedDbStringSchema.optional(),
  })
  .strict()
  .refine(data => data.nameEn !== undefined || data.nameSv !== undefined, {
    message: 'At least one of nameEn or nameSv must be provided',
  })

export const PUT = secureMutationRoute({
  bodySchema: updateImplementationTypeSchema,
  paramsSchema: idParamSchema,
  policy: adminMutationPolicy(),
  handler: async ({ body, context, params }) => {
    const db = await getRequestSqlServerDataSource()
    const type = await updateSpecificationImplementationType(
      db,
      params.id,
      body,
    )
    if (!type) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    recordAdminPrivilegedActionSucceeded(context, {
      changedFields: Object.keys(body),
      operation: 'update',
      resourceId: params.id,
      resourceType: 'specification_implementation_type',
    })
    return NextResponse.json(type)
  },
})

export const DELETE = secureMutationRoute({
  paramsSchema: idParamSchema,
  policy: adminMutationPolicy(),
  handler: async ({ context, params }) => {
    const db = await getRequestSqlServerDataSource()
    const deletedCount = await deleteSpecificationImplementationType(
      db,
      params.id,
    )
    if (deletedCount === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    recordAdminPrivilegedActionSucceeded(context, {
      operation: 'delete',
      resourceId: params.id,
      resourceType: 'specification_implementation_type',
    })
    return NextResponse.json({ ok: true })
  },
})

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { recordAdminPrivilegedActionSucceeded } from '@/lib/admin/privileged-audit'
import {
  deleteSpecificationGovernanceObjectType,
  updateSpecificationGovernanceObjectType,
} from '@/lib/dal/specification-governance-object-types'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  adminMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { boundedDbStringSchema, idParamSchema } from '@/lib/http/validation'

export const dynamic = 'force-dynamic'

const updateGovernanceObjectTypeSchema = z
  .object({
    nameEn: boundedDbStringSchema.optional(),
    nameSv: boundedDbStringSchema.optional(),
  })
  .strict()
  .refine(body => body.nameEn !== undefined || body.nameSv !== undefined, {
    message: 'At least one of nameEn or nameSv must be provided',
  })

export const PUT = secureMutationRoute({
  bodySchema: updateGovernanceObjectTypeSchema,
  paramsSchema: idParamSchema,
  policy: adminMutationPolicy(),
  handler: async ({ body, context, params }) => {
    const db = await getRequestSqlServerDataSource()
    const governanceObjectType = await updateSpecificationGovernanceObjectType(
      db,
      params.id,
      body,
    )
    if (governanceObjectType === undefined) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await recordAdminPrivilegedActionSucceeded(context, {
      changedFields: Object.keys(body),
      operation: 'update',
      resourceId: params.id,
      resourceType: 'specification_governance_object_type',
    })
    return NextResponse.json(governanceObjectType)
  },
})

export const DELETE = secureMutationRoute({
  paramsSchema: idParamSchema,
  policy: adminMutationPolicy(),
  handler: async ({ context, params }) => {
    const db = await getRequestSqlServerDataSource()
    const deletedCount = await deleteSpecificationGovernanceObjectType(
      db,
      params.id,
    )
    if (deletedCount === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await recordAdminPrivilegedActionSucceeded(context, {
      operation: 'delete',
      resourceId: params.id,
      resourceType: 'specification_governance_object_type',
    })
    return NextResponse.json({ ok: true })
  },
})

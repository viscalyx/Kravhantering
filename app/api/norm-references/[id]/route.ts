import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { recordAdminPrivilegedActionSucceeded } from '@/lib/admin/privileged-audit'
import {
  deleteNormReference,
  getLinkedRequirements,
  getNormReferenceById,
  updateNormReference,
} from '@/lib/dal/norm-references'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { isForeignKeyViolation } from '@/lib/http/safe-errors'
import {
  adminMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import {
  boundedDbStringSchema,
  idParamSchema,
  optionalBusinessTextSchema,
  parseRouteParams,
} from '@/lib/http/validation'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

const nullableOptionalTextSchema = optionalBusinessTextSchema
  .nullable()
  .transform(value => (value === '' ? null : value))

const normReferenceUpdateSchema = z
  .object({
    issuer: boundedDbStringSchema.optional(),
    name: boundedDbStringSchema.optional(),
    normReferenceId: optionalBusinessTextSchema,
    reference: boundedDbStringSchema.optional(),
    type: boundedDbStringSchema.optional(),
    uri: nullableOptionalTextSchema.optional(),
    version: nullableOptionalTextSchema.optional(),
  })
  .strict()

export async function GET(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, idParamSchema)
  if (!parsedParams.ok) return parsedParams.response
  const { id } = parsedParams.data
  const db = await getRequestSqlServerDataSource()
  const [normReference, linkedRequirements] = await Promise.all([
    getNormReferenceById(db, id),
    getLinkedRequirements(db, id),
  ])
  if (!normReference) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json({ normReference, linkedRequirements })
}

export const PUT = secureMutationRoute({
  bodySchema: normReferenceUpdateSchema,
  paramsSchema: idParamSchema,
  policy: adminMutationPolicy(),
  handler: async ({ body, context, params }) => {
    const db = await getRequestSqlServerDataSource()
    const normReference = await updateNormReference(db, params.id, body)
    if (!normReference) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    recordAdminPrivilegedActionSucceeded(context, {
      changedFields: Object.keys(body),
      operation: 'update',
      resourceId: params.id,
      resourceType: 'norm_reference',
    })
    return NextResponse.json(normReference)
  },
})

export const DELETE = secureMutationRoute({
  paramsSchema: idParamSchema,
  policy: adminMutationPolicy(),
  handler: async ({ context, params }) => {
    const { id } = params
    const db = await getRequestSqlServerDataSource()
    const linked = await getLinkedRequirements(db, id)
    if (linked.length > 0) {
      return NextResponse.json(
        { error: 'Cannot delete norm reference with linked requirements' },
        { status: 409 },
      )
    }
    try {
      const deletedCount = await deleteNormReference(db, id)
      if (deletedCount === 0) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
      recordAdminPrivilegedActionSucceeded(context, {
        operation: 'delete',
        resourceId: id,
        resourceType: 'norm_reference',
      })
      return NextResponse.json({ ok: true })
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        return NextResponse.json(
          { error: 'Cannot delete norm reference with linked requirements' },
          { status: 409 },
        )
      }
      throw error
    }
  },
})

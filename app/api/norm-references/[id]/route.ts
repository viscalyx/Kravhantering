import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { recordAllowedActionAuditEvent } from '@/lib/audit/action-audit'
import {
  deleteNormReference,
  getLinkedRequirements,
  getNormReferenceById,
  getNormReferenceUsage,
  updateNormReference,
} from '@/lib/dal/norm-references'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  customMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import {
  boundedDbStringSchema,
  idParamSchema,
  optionalBusinessTextSchema,
  parseRouteParams,
} from '@/lib/http/validation'
import { requireNormReferencePermission } from '@/lib/requirements/norm-reference-permissions'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

const nullableOptionalTextSchema = optionalBusinessTextSchema
  .nullable()
  .transform(value => (value === '' ? null : value))

const normReferenceUpdateSchema = z
  .object({
    issuer: boundedDbStringSchema.optional(),
    name: boundedDbStringSchema.optional(),
    normReferenceId: optionalBusinessTextSchema.optional(),
    reference: boundedDbStringSchema.optional(),
    type: boundedDbStringSchema.optional(),
    uri: nullableOptionalTextSchema.optional(),
    version: nullableOptionalTextSchema.optional(),
  })
  .strict()
  .refine(
    body =>
      [
        'issuer',
        'name',
        'normReferenceId',
        'reference',
        'type',
        'uri',
        'version',
      ].some(key => Object.hasOwn(body, key)),
    { message: 'At least one field must be provided for update' },
  )

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
  policy: customMutationPolicy('norm_reference.update', ({ context }) => {
    requireNormReferencePermission(context, 'norm_reference.update')
  }),
  handler: async ({ body, context, params }) => {
    const db = await getRequestSqlServerDataSource()
    const normReference = await updateNormReference(db, params.id, body)
    if (!normReference) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await recordAllowedActionAuditEvent(db, context, {
      action: 'norm_reference.update',
      details: { changedFields: Object.keys(body) },
      targetId: params.id,
      targetKind: 'norm_reference',
    })
    return NextResponse.json(normReference)
  },
})

export const DELETE = secureMutationRoute({
  paramsSchema: idParamSchema,
  policy: customMutationPolicy('norm_reference.delete', ({ context }) => {
    requireNormReferencePermission(context, 'norm_reference.delete')
  }),
  handler: async ({ context, params }) => {
    const { id } = params
    const db = await getRequestSqlServerDataSource()
    const deletedCount = await deleteNormReference(db, id)
    if (deletedCount === 0) {
      const existing = await getNormReferenceById(db, id)
      if (!existing) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
      const usage = await getNormReferenceUsage(db, id)
      return NextResponse.json(
        {
          error: 'Norm reference is in use',
          usage,
        },
        { status: 409 },
      )
    }
    await recordAllowedActionAuditEvent(db, context, {
      action: 'norm_reference.delete',
      targetId: id,
      targetKind: 'norm_reference',
    })
    return NextResponse.json({ ok: true })
  },
})

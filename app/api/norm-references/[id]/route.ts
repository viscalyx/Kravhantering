import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  getLinkedRequirements,
  getNormReferenceById,
} from '@/lib/dal/norm-references'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { secureMutationRoute } from '@/lib/http/secure-mutation-route'
import {
  boundedDbStringSchema,
  idParamSchema,
  optionalBusinessTextSchema,
  parseRouteParams,
} from '@/lib/http/validation'
import {
  deleteNormReferenceWithAudit,
  updateNormReferenceWithAudit,
} from '@/lib/requirements/norm-reference-mutations'
import { normReferenceMutationPolicy } from '@/lib/requirements/norm-reference-permissions'

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
  policy: normReferenceMutationPolicy('norm_reference.update'),
  handler: async ({ body, context, params }) => {
    const db = await getRequestSqlServerDataSource()
    const normReference = await updateNormReferenceWithAudit(
      db,
      params.id,
      body,
      context,
    )
    if (!normReference) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json(normReference)
  },
})

export const DELETE = secureMutationRoute({
  paramsSchema: idParamSchema,
  policy: normReferenceMutationPolicy('norm_reference.delete'),
  handler: async ({ context, params }) => {
    const { id } = params
    const db = await getRequestSqlServerDataSource()
    const result = await deleteNormReferenceWithAudit(db, id, context)
    if (result.status === 'not_found') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    if (result.status === 'in_use') {
      return NextResponse.json(
        {
          error: 'Norm reference is in use',
          usage: result.usage,
        },
        { status: 409 },
      )
    }
    return NextResponse.json({ ok: true })
  },
})

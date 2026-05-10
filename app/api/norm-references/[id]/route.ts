import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  deleteNormReference,
  getLinkedRequirements,
  getNormReferenceById,
  updateNormReference,
} from '@/lib/dal/norm-references'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  boundedDbStringSchema,
  idParamSchema,
  optionalBusinessTextSchema,
  parseRouteParams,
  readJsonWithSchema,
} from '@/lib/http/validation'

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

export async function PUT(
  request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, idParamSchema)
  if (!parsedParams.ok) return parsedParams.response
  const parsedBody = await readJsonWithSchema(
    request,
    normReferenceUpdateSchema,
  )
  if (!parsedBody.ok) return parsedBody.response
  const db = await getRequestSqlServerDataSource()
  const normReference = await updateNormReference(
    db,
    parsedParams.data.id,
    parsedBody.data,
  )
  if (!normReference) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json(normReference)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, idParamSchema)
  if (!parsedParams.ok) return parsedParams.response
  const { id } = parsedParams.data
  const db = await getRequestSqlServerDataSource()
  const linked = await getLinkedRequirements(db, id)
  if (linked.length > 0) {
    return NextResponse.json(
      { error: 'Cannot delete norm reference with linked requirements' },
      { status: 409 },
    )
  }
  await deleteNormReference(db, id)
  return NextResponse.json({ ok: true })
}

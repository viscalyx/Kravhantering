import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  deleteSpecificationItemStatus,
  getLinkedSpecificationItems,
  getSpecificationItemStatusById,
  updateSpecificationItemStatus,
} from '@/lib/dal/specification-item-statuses'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  boundedDbStringSchema,
  idParamSchema,
  nonNegativeIntegerSchema,
  nullableBusinessTextSchema,
  parseRouteParams,
  readJsonWithSchema,
} from '@/lib/http/validation'

type Params = Promise<{ id: string }>

const specificationItemStatusUpdateSchema = z
  .object({
    color: boundedDbStringSchema.optional(),
    descriptionEn: nullableBusinessTextSchema.optional(),
    descriptionSv: nullableBusinessTextSchema.optional(),
    nameEn: boundedDbStringSchema.optional(),
    nameSv: boundedDbStringSchema.optional(),
    sortOrder: nonNegativeIntegerSchema.optional(),
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
  const [status, linkedItems] = await Promise.all([
    getSpecificationItemStatusById(db, id),
    getLinkedSpecificationItems(db, id),
  ])
  if (!status) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json({ status, linkedItems })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, idParamSchema)
  if (!parsedParams.ok) return parsedParams.response
  const parsedBody = await readJsonWithSchema(
    request,
    specificationItemStatusUpdateSchema,
  )
  if (!parsedBody.ok) return parsedBody.response
  const db = await getRequestSqlServerDataSource()
  const status = await updateSpecificationItemStatus(
    db,
    parsedParams.data.id,
    parsedBody.data,
  )
  if (!status) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json(status)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, idParamSchema)
  if (!parsedParams.ok) return parsedParams.response
  const db = await getRequestSqlServerDataSource()
  await deleteSpecificationItemStatus(db, parsedParams.data.id)
  return NextResponse.json({ ok: true })
}

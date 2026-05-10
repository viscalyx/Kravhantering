import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { deleteArea, updateArea } from '@/lib/dal/requirement-areas'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  boundedDbStringSchema,
  idParamSchema,
  optionalBusinessTextSchema,
  parseRouteParams,
  positiveIntegerSchema,
  readJsonWithSchema,
} from '@/lib/http/validation'

type Params = Promise<{ id: string }>

const updateAreaSchema = z
  .object({
    description: optionalBusinessTextSchema,
    name: boundedDbStringSchema.optional(),
    ownerId: positiveIntegerSchema.nullable().optional(),
  })
  .strict()

export async function PUT(
  request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, idParamSchema)
  if (!parsedParams.ok) return parsedParams.response
  const parsedBody = await readJsonWithSchema(request, updateAreaSchema)
  if (!parsedBody.ok) return parsedBody.response
  const db = await getRequestSqlServerDataSource()
  const area = await updateArea(db, parsedParams.data.id, parsedBody.data)
  return NextResponse.json(area)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, idParamSchema)
  if (!parsedParams.ok) return parsedParams.response
  const db = await getRequestSqlServerDataSource()
  await deleteArea(db, parsedParams.data.id)
  return NextResponse.json({ ok: true })
}

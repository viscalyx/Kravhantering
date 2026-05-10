import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  deleteSpecificationResponsibilityArea,
  updateSpecificationResponsibilityArea,
} from '@/lib/dal/specification-responsibility-areas'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  boundedDbStringSchema,
  idParamSchema,
  parseRouteParams,
  readJsonWithSchema,
} from '@/lib/http/validation'

type Params = Promise<{ id: string }>

const updateResponsibilityAreaSchema = z
  .object({
    nameEn: boundedDbStringSchema.optional(),
    nameSv: boundedDbStringSchema.optional(),
  })
  .strict()

export async function PUT(
  request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, idParamSchema)
  if (!parsedParams.ok) return parsedParams.response
  const parsedBody = await readJsonWithSchema(
    request,
    updateResponsibilityAreaSchema,
  )
  if (!parsedBody.ok) return parsedBody.response
  const db = await getRequestSqlServerDataSource()
  const area = await updateSpecificationResponsibilityArea(
    db,
    parsedParams.data.id,
    parsedBody.data,
  )
  if (area === undefined) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 })
  }
  return NextResponse.json(area)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, idParamSchema)
  if (!parsedParams.ok) return parsedParams.response
  const db = await getRequestSqlServerDataSource()
  await deleteSpecificationResponsibilityArea(db, parsedParams.data.id)
  return NextResponse.json({ ok: true })
}

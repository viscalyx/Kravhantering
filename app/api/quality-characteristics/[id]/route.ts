import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  deleteQualityCharacteristic,
  listQualityCharacteristics,
  type QualityCharacteristicRow,
  updateQualityCharacteristic,
} from '@/lib/dal/requirement-types'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  boundedDbStringSchema,
  idParamSchema,
  parseRouteParams,
  positiveIntegerSchema,
  readJsonWithSchema,
} from '@/lib/http/validation'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

const qualityCharacteristicUpdateSchema = z
  .object({
    nameEn: boundedDbStringSchema.optional(),
    nameSv: boundedDbStringSchema.optional(),
    parentId: positiveIntegerSchema.nullable().optional(),
    requirementTypeId: positiveIntegerSchema.optional(),
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
    qualityCharacteristicUpdateSchema,
  )
  if (!parsedBody.ok) return parsedBody.response
  const db = await getRequestSqlServerDataSource()
  const category = await updateQualityCharacteristic(
    db,
    parsedParams.data.id,
    parsedBody.data,
  )
  if (!category) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json(category)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, idParamSchema)
  if (!parsedParams.ok) return parsedParams.response
  const { id } = parsedParams.data
  const db = await getRequestSqlServerDataSource()

  const allCategories = await listQualityCharacteristics(db)
  const hasChildren = allCategories.some(
    (category: QualityCharacteristicRow) => category.parentId === id,
  )
  if (hasChildren) {
    return NextResponse.json(
      { error: 'Has sub-characteristics' },
      { status: 409 },
    )
  }

  try {
    const deleted = await deleteQualityCharacteristic(db, id)
    if (!deleted) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/foreign.key/i.test(message) || /constraint/i.test(message)) {
      return NextResponse.json(
        { error: 'In use by requirements' },
        { status: 409 },
      )
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
  return NextResponse.json({ ok: true })
}

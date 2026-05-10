import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  deleteRiskLevel,
  getLinkedRequirements,
  getRiskLevelById,
  updateRiskLevel,
} from '@/lib/dal/risk-levels'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  boundedDbStringSchema,
  idParamSchema,
  nonNegativeIntegerSchema,
  parseRouteParams,
  readJsonWithSchema,
} from '@/lib/http/validation'

type Params = Promise<{ id: string }>

const updateRiskLevelSchema = z
  .object({
    color: boundedDbStringSchema.optional(),
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
  const [riskLevel, linkedRequirements] = await Promise.all([
    getRiskLevelById(db, id),
    getLinkedRequirements(db, id),
  ])
  if (!riskLevel) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json({ riskLevel, linkedRequirements })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, idParamSchema)
  if (!parsedParams.ok) return parsedParams.response
  const parsedBody = await readJsonWithSchema(request, updateRiskLevelSchema)
  if (!parsedBody.ok) return parsedBody.response
  const db = await getRequestSqlServerDataSource()
  const riskLevel = await updateRiskLevel(
    db,
    parsedParams.data.id,
    parsedBody.data,
  )
  if (!riskLevel) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json(riskLevel)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, idParamSchema)
  if (!parsedParams.ok) return parsedParams.response
  const db = await getRequestSqlServerDataSource()
  await deleteRiskLevel(db, parsedParams.data.id)
  return NextResponse.json({ ok: true })
}

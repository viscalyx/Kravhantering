import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  deleteDeviation,
  getDeviation,
  updateDeviation,
} from '@/lib/dal/deviations'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  idParamSchema,
  nullableBusinessTextSchema,
  optionalBusinessTextSchema,
  parseRouteParams,
  readJsonWithSchema,
} from '@/lib/http/validation'
import { isRequirementsServiceError } from '@/lib/requirements/errors'

type Params = Promise<{ id: string }>

const updateDeviationSchema = z
  .object({
    createdBy: nullableBusinessTextSchema.optional(),
    motivation: optionalBusinessTextSchema,
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

  try {
    const deviation = await getDeviation(db, id)
    return NextResponse.json(deviation)
  } catch (error) {
    if (isRequirementsServiceError(error) && error.code === 'not_found') {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    throw error
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, idParamSchema)
  if (!parsedParams.ok) return parsedParams.response
  const parsedBody = await readJsonWithSchema(request, updateDeviationSchema)
  if (!parsedBody.ok) return parsedBody.response
  const db = await getRequestSqlServerDataSource()

  try {
    await updateDeviation(db, parsedParams.data.id, parsedBody.data)
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (isRequirementsServiceError(error)) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      )
    }
    console.error('Failed to update deviation', error)
    return NextResponse.json(
      { error: 'Failed to update deviation' },
      { status: 500 },
    )
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, idParamSchema)
  if (!parsedParams.ok) return parsedParams.response
  const db = await getRequestSqlServerDataSource()

  try {
    await deleteDeviation(db, parsedParams.data.id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (isRequirementsServiceError(error)) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      )
    }
    console.error('Failed to delete deviation', error)
    return NextResponse.json(
      { error: 'Failed to delete deviation' },
      { status: 500 },
    )
  }
}

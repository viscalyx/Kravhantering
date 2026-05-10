import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  deleteSpecificationLifecycleStatus,
  updateSpecificationLifecycleStatus,
} from '@/lib/dal/specification-lifecycle-statuses'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  INTERNAL_SERVER_ERROR_MESSAGE,
  logSanitizedError,
} from '@/lib/http/safe-errors'
import {
  boundedDbStringSchema,
  idParamSchema,
  parseRouteParams,
  readJsonWithSchema,
} from '@/lib/http/validation'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

const updateLifecycleStatusSchema = z
  .object({
    nameEn: boundedDbStringSchema.optional(),
    nameSv: boundedDbStringSchema.optional(),
  })
  .strict()
  .refine(data => data.nameEn !== undefined || data.nameSv !== undefined, {
    message: 'At least one of nameEn or nameSv must be provided',
  })

export async function PUT(
  request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, idParamSchema)
  if (!parsedParams.ok) return parsedParams.response
  const parsedBody = await readJsonWithSchema(
    request,
    updateLifecycleStatusSchema,
  )
  if (!parsedBody.ok) return parsedBody.response
  const db = await getRequestSqlServerDataSource()
  try {
    const status = await updateSpecificationLifecycleStatus(
      db,
      parsedParams.data.id,
      parsedBody.data,
    )
    if (!status) {
      return NextResponse.json(
        { error: 'Lifecycle status not found' },
        { status: 404 },
      )
    }
    return NextResponse.json(status)
  } catch (err) {
    logSanitizedError('Failed to update specification lifecycle status', err)
    return NextResponse.json(
      { error: INTERNAL_SERVER_ERROR_MESSAGE },
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
    const deletedCount = await deleteSpecificationLifecycleStatus(
      db,
      parsedParams.data.id,
    )
    if (deletedCount === 0) {
      return NextResponse.json(
        { error: 'Lifecycle status not found' },
        { status: 404 },
      )
    }
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json(
      { error: 'Cannot delete: lifecycle status is in use' },
      { status: 409 },
    )
  }
}

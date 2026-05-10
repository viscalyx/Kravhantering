import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { deleteStatus, updateStatus } from '@/lib/dal/requirement-statuses'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { logSanitizedError } from '@/lib/http/safe-errors'
import {
  boundedDbStringSchema,
  idParamSchema,
  nonNegativeIntegerSchema,
  parseRouteParams,
  readJsonWithSchema,
} from '@/lib/http/validation'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

const updateStatusSchema = z
  .object({
    color: boundedDbStringSchema.optional(),
    nameEn: boundedDbStringSchema.optional(),
    nameSv: boundedDbStringSchema.optional(),
    sortOrder: nonNegativeIntegerSchema.optional(),
  })
  .strict()

export async function PUT(
  request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, idParamSchema)
  if (!parsedParams.ok) return parsedParams.response
  const parsedBody = await readJsonWithSchema(request, updateStatusSchema)
  if (!parsedBody.ok) return parsedBody.response
  const db = await getRequestSqlServerDataSource()
  const updated = await updateStatus(db, parsedParams.data.id, parsedBody.data)
  return NextResponse.json(updated)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, idParamSchema)
  if (!parsedParams.ok) return parsedParams.response
  const db = await getRequestSqlServerDataSource()
  try {
    await deleteStatus(db, parsedParams.data.id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    const { body, status } = toHttpErrorPayload(error)
    if (body.code === 'internal') {
      logSanitizedError('Failed to delete requirement status', error)
    }
    return NextResponse.json(body, { status })
  }
}

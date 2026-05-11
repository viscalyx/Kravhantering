import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  deleteSpecificationLocalDeviation,
  getSpecificationLocalDeviation,
  updateSpecificationLocalDeviation,
} from '@/lib/dal/deviations'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { logSanitizedError } from '@/lib/http/safe-errors'
import {
  idParamSchema,
  nullableBusinessTextSchema,
  optionalBusinessTextSchema,
  parseRouteParams,
  readJsonWithSchema,
} from '@/lib/http/validation'
import {
  createRequestContext,
  requireHumanActorSnapshot,
} from '@/lib/requirements/auth'
import { isRequirementsServiceError } from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

const updateSpecificationLocalDeviationSchema = z
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
    return NextResponse.json(await getSpecificationLocalDeviation(db, id))
  } catch (error) {
    if (isRequirementsServiceError(error)) {
      const { body, status } = toHttpErrorPayload(error)
      return NextResponse.json(body, { status })
    }

    logSanitizedError('Failed to get specification-local deviation', error)
    return NextResponse.json(
      { error: 'Failed to get specification-local deviation' },
      { status: 500 },
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, idParamSchema)
  if (!parsedParams.ok) return parsedParams.response
  const parsedBody = await readJsonWithSchema(
    request,
    updateSpecificationLocalDeviationSchema,
  )
  if (!parsedBody.ok) return parsedBody.response
  const db = await getRequestSqlServerDataSource()

  try {
    const actor = requireHumanActorSnapshot(
      await createRequestContext(request, 'rest'),
    )
    await updateSpecificationLocalDeviation(db, parsedParams.data.id, {
      motivation: parsedBody.data.motivation,
      createdBy: actor.displayName,
      createdByHsaId: actor.hsaId,
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (isRequirementsServiceError(error)) {
      const { body, status } = toHttpErrorPayload(error)
      return NextResponse.json(body, { status })
    }

    logSanitizedError('Failed to update specification-local deviation', error)
    return NextResponse.json(
      { error: 'Failed to update specification-local deviation' },
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
    await deleteSpecificationLocalDeviation(db, parsedParams.data.id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (isRequirementsServiceError(error)) {
      const { body, status } = toHttpErrorPayload(error)
      return NextResponse.json(body, { status })
    }

    logSanitizedError('Failed to delete specification-local deviation', error)
    return NextResponse.json(
      { error: 'Failed to delete specification-local deviation' },
      { status: 500 },
    )
  }
}

import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  deleteDeviation,
  getDeviation,
  updateDeviation,
} from '@/lib/dal/deviations'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { logSanitizedError } from '@/lib/http/safe-errors'
import {
  customMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import {
  idParamSchema,
  optionalBusinessTextSchema,
  parseRouteParams,
} from '@/lib/http/validation'
import { requireHumanActorSnapshot } from '@/lib/requirements/auth'
import { isRequirementsServiceError } from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

const updateDeviationSchema = z
  .object({
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
      const { body, status } = toHttpErrorPayload(error)
      return NextResponse.json(body, { status })
    }
    throw error
  }
}

export const PUT = secureMutationRoute({
  bodySchema: updateDeviationSchema,
  paramsSchema: idParamSchema,
  policy: customMutationPolicy('deviation.update', ({ context }) => {
    requireHumanActorSnapshot(context)
  }),
  handler: async ({ body, params }) => {
    try {
      const db = await getRequestSqlServerDataSource()
      await updateDeviation(db, params.id, {
        motivation: body.motivation,
      })
      return NextResponse.json({ ok: true })
    } catch (error) {
      if (isRequirementsServiceError(error)) {
        const { body, status } = toHttpErrorPayload(error)
        return NextResponse.json(body, { status })
      }
      logSanitizedError('Failed to update deviation', error)
      return NextResponse.json(
        { error: 'Failed to update deviation' },
        { status: 500 },
      )
    }
  },
})

export const DELETE = secureMutationRoute({
  paramsSchema: idParamSchema,
  policy: customMutationPolicy('deviation.delete', ({ context }) => {
    requireHumanActorSnapshot(context)
  }),
  handler: async ({ params }) => {
    const db = await getRequestSqlServerDataSource()

    try {
      await deleteDeviation(db, params.id)
      return NextResponse.json({ ok: true })
    } catch (error) {
      if (isRequirementsServiceError(error)) {
        const { body, status } = toHttpErrorPayload(error)
        return NextResponse.json(body, { status })
      }
      logSanitizedError('Failed to delete deviation', error)
      return NextResponse.json(
        { error: 'Failed to delete deviation' },
        { status: 500 },
      )
    }
  },
})

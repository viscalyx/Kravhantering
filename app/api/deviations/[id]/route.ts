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
  requirementsMutationPolicy,
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
  errorMessage: 'Failed to update deviation',
  paramsSchema: idParamSchema,
  policy: requirementsMutationPolicy<unknown, { id: number }>(({ params }) => ({
    deviationId: params.id,
    kind: 'manage_deviation',
    operation: 'edit',
  })),
  handler: async ({ body, context, db: authorizedDb, params }) => {
    try {
      requireHumanActorSnapshot(context)
      const db = authorizedDb ?? (await getRequestSqlServerDataSource())
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
  errorMessage: 'Failed to delete deviation',
  paramsSchema: idParamSchema,
  policy: requirementsMutationPolicy<unknown, { id: number }>(({ params }) => ({
    deviationId: params.id,
    kind: 'manage_deviation',
    operation: 'delete',
  })),
  handler: async ({ context, db: authorizedDb, params }) => {
    try {
      requireHumanActorSnapshot(context)
      const db = authorizedDb ?? (await getRequestSqlServerDataSource())
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

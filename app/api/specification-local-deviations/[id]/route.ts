import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  deleteSpecificationLocalDeviation,
  getSpecificationLocalDeviation,
  updateSpecificationLocalDeviation,
} from '@/lib/dal/deviations'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { withRestResponsePolicy } from '@/lib/http/response-policy'
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
import { createRequirementsRestRuntime } from '@/lib/requirements/server'
import { authorize } from '@/lib/requirements/service-shared'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

const updateSpecificationLocalDeviationSchema = z
  .object({
    motivation: optionalBusinessTextSchema,
  })
  .strict()

async function getHandler(
  request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, idParamSchema)
  if (!parsedParams.ok) return parsedParams.response
  const { id } = parsedParams.data
  const runtime = await createRequirementsRestRuntime(request)

  try {
    await authorize(
      runtime.authorization,
      {
        childId: id,
        childKind: 'deviation',
        deviationKind: 'specification-local',
        kind: 'get_specification_child',
      },
      runtime.context,
    )
    return NextResponse.json(
      await getSpecificationLocalDeviation(runtime.db, id),
    )
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

export const GET = withRestResponsePolicy(getHandler)

export const PUT = secureMutationRoute({
  bodySchema: updateSpecificationLocalDeviationSchema,
  errorMessage: 'Failed to update specification-local deviation',
  paramsSchema: idParamSchema,
  policy: requirementsMutationPolicy<unknown, { id: number }>(({ params }) => ({
    deviationKind: 'specification-local',
    deviationId: params.id,
    kind: 'manage_deviation',
    operation: 'edit',
  })),
  handler: async ({ body, context, db: authorizedDb, params }) => {
    try {
      requireHumanActorSnapshot(context)
      const db = authorizedDb ?? (await getRequestSqlServerDataSource())
      await updateSpecificationLocalDeviation(db, params.id, {
        motivation: body.motivation,
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
  },
})

export const DELETE = secureMutationRoute({
  errorMessage: 'Failed to delete specification-local deviation',
  paramsSchema: idParamSchema,
  policy: requirementsMutationPolicy<unknown, { id: number }>(({ params }) => ({
    deviationKind: 'specification-local',
    deviationId: params.id,
    kind: 'manage_deviation',
    operation: 'delete',
  })),
  handler: async ({ context, db: authorizedDb, params }) => {
    try {
      requireHumanActorSnapshot(context)
      const db = authorizedDb ?? (await getRequestSqlServerDataSource())
      await deleteSpecificationLocalDeviation(db, params.id)
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
  },
})

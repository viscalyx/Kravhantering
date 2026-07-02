import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  createDeviation,
  createDeviationForItemRef,
  listDeviationsForSpecificationItem,
  listDeviationsForSpecificationLocalRequirement,
} from '@/lib/dal/deviations'
import { parseSpecificationItemRef } from '@/lib/dal/requirements-specifications'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { logSanitizedError } from '@/lib/http/safe-errors'
import {
  requirementsMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import {
  businessTextSchema,
  invalidRequestResponse,
  parseRouteParams,
  routeSegmentSchema,
  SQL_SERVER_INT_MAX,
} from '@/lib/http/validation'
import {
  type RequirementsAction,
  requireHumanActorSnapshot,
} from '@/lib/requirements/auth'
import {
  isRequirementsServiceError,
  validationError,
} from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'

type Params = Promise<{ itemId: string }>
type ParsedSpecificationItemId =
  | {
      decodedItemId: string
      numericItemId: number | null
      ok: true
      parsedItemRef: ReturnType<typeof parseSpecificationItemRef>
    }
  | { ok: false; response: NextResponse }

const itemDeviationParamSchema = z
  .object({
    itemId: routeSegmentSchema,
  })
  .strict()

const createDeviationSchema = z
  .object({
    motivation: businessTextSchema,
  })
  .strict()

export const dynamic = 'force-dynamic'

function safeDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

function invalidItemIdResponse() {
  return invalidRequestResponse([
    {
      code: 'invalid_format',
      message: 'Invalid itemId',
      path: 'itemId',
    },
  ])
}

function parseItemId(itemId: string): ParsedSpecificationItemId {
  const decodedItemId = safeDecodeURIComponent(itemId)
  if (decodedItemId == null) {
    return { ok: false, response: invalidItemIdResponse() }
  }

  const parsedItemRef = parseSpecificationItemRef(decodedItemId)
  const numericItemId =
    parsedItemRef == null && /^\d+$/.test(decodedItemId)
      ? Number(decodedItemId)
      : parsedItemRef?.kind === 'library'
        ? parsedItemRef.id
        : null

  if (
    parsedItemRef == null &&
    (numericItemId == null ||
      !Number.isInteger(numericItemId) ||
      numericItemId < 1 ||
      numericItemId > SQL_SERVER_INT_MAX)
  ) {
    return { ok: false, response: invalidItemIdResponse() }
  }

  return { decodedItemId, numericItemId, ok: true, parsedItemRef }
}

function createDeviationAction(itemId: string): RequirementsAction {
  const itemIdResult = parseItemId(itemId)
  if (!itemIdResult.ok) {
    throw validationError('Invalid itemId', { reason: 'invalid_item_id' })
  }

  const { numericItemId, parsedItemRef } = itemIdResult
  if (parsedItemRef?.kind === 'specificationLocal') {
    return {
      kind: 'manage_specification_local_requirement',
      localRequirementId: parsedItemRef.id,
      operation: 'create_deviation',
    }
  }

  return {
    kind: 'manage_deviation',
    operation: 'create',
    specificationItemId: parsedItemRef?.id ?? numericItemId ?? 0,
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, itemDeviationParamSchema)
  if (!parsedParams.ok) {
    return parsedParams.response
  }
  const itemIdResult = parseItemId(parsedParams.data.itemId)
  if (!itemIdResult.ok) {
    return itemIdResult.response
  }
  const { parsedItemRef, numericItemId } = itemIdResult
  const db = await getRequestSqlServerDataSource()

  try {
    const deviations =
      parsedItemRef?.kind === 'specificationLocal'
        ? await listDeviationsForSpecificationLocalRequirement(
            db,
            parsedItemRef.id,
          )
        : await listDeviationsForSpecificationItem(db, numericItemId ?? 0)
    return NextResponse.json({ deviations })
  } catch (error) {
    logSanitizedError(
      'Failed to list deviations for requirement application',
      error,
    )
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}

export const POST = secureMutationRoute({
  bodySchema: createDeviationSchema,
  errorMessage: 'Failed to create deviation',
  paramsSchema: itemDeviationParamSchema,
  policy: requirementsMutationPolicy<unknown, { itemId: string }>(
    ({ params }) => createDeviationAction(params.itemId),
  ),
  handler: async ({ body, context, db: authorizedDb, params }) => {
    const itemIdResult = parseItemId(params.itemId)
    if (!itemIdResult.ok) {
      return itemIdResult.response
    }
    const { decodedItemId, parsedItemRef, numericItemId } = itemIdResult
    const { motivation } = body

    try {
      const actor = requireHumanActorSnapshot(context)
      const db = authorizedDb ?? (await getRequestSqlServerDataSource())
      const result =
        parsedItemRef == null
          ? await createDeviation(db, {
              specificationItemId: numericItemId ?? 0,
              motivation,
              createdBy: actor.displayName,
              createdByHsaId: actor.hsaId,
            })
          : await createDeviationForItemRef(db, {
              createdBy: actor.displayName,
              createdByHsaId: actor.hsaId,
              itemRef: decodedItemId,
              motivation,
            })
      return NextResponse.json({ id: result.id, ok: true }, { status: 201 })
    } catch (error) {
      if (isRequirementsServiceError(error)) {
        const { body, status } = toHttpErrorPayload(error)
        return NextResponse.json(body, { status })
      }
      logSanitizedError('Failed to create deviation', error)
      return NextResponse.json(
        { error: 'Failed to create deviation' },
        { status: 500 },
      )
    }
  },
})

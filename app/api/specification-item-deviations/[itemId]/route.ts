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
import {
  boundedDbStringSchema,
  businessTextSchema,
  invalidRequestResponse,
  parseRouteParams,
  readJsonWithSchema,
  routeSegmentSchema,
  SQL_SERVER_INT_MAX,
} from '@/lib/http/validation'
import { isRequirementsServiceError } from '@/lib/requirements/errors'

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
    createdBy: boundedDbStringSchema.optional(),
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
    console.error('Failed to list deviations for specification item', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, itemDeviationParamSchema)
  if (!parsedParams.ok) {
    return parsedParams.response
  }
  const parsedBody = await readJsonWithSchema(request, createDeviationSchema)
  if (!parsedBody.ok) {
    return parsedBody.response
  }
  const itemIdResult = parseItemId(parsedParams.data.itemId)
  if (!itemIdResult.ok) {
    return itemIdResult.response
  }
  const { decodedItemId, parsedItemRef, numericItemId } = itemIdResult
  const { motivation, createdBy } = parsedBody.data
  const db = await getRequestSqlServerDataSource()

  try {
    const result =
      parsedItemRef == null
        ? await createDeviation(db, {
            specificationItemId: numericItemId ?? 0,
            motivation,
            createdBy: typeof createdBy === 'string' ? createdBy : null,
          })
        : await createDeviationForItemRef(db, {
            createdBy: typeof createdBy === 'string' ? createdBy : null,
            itemRef: decodedItemId,
            motivation,
          })
    return NextResponse.json({ id: result.id, ok: true }, { status: 201 })
  } catch (error) {
    if (isRequirementsServiceError(error)) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      )
    }
    console.error('Failed to create deviation', error)
    return NextResponse.json(
      { error: 'Failed to create deviation' },
      { status: 500 },
    )
  }
}

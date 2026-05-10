import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { countDeviationsPerItemRef } from '@/lib/dal/deviations'
import {
  deleteSpecificationItemsByRefs,
  getSpecificationById,
  getSpecificationBySlug,
  listSpecificationItems,
} from '@/lib/dal/requirements-specifications'
import type { SqlServerDatabase } from '@/lib/db'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { logSanitizedError } from '@/lib/http/safe-errors'
import {
  ARRAY_INPUT_MAX_ITEMS,
  nullableBoundedDbStringSchema,
  parseRouteParams,
  positiveIntegerSchema,
  readJsonWithSchema,
  routeSegmentSchema,
  specificationIdOrSlugSchema,
} from '@/lib/http/validation'
import { isRequirementsServiceError } from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

const ADD_REQUIREMENTS_ERROR = 'Failed to add requirements'

const specificationParamSchema = z
  .object({
    id: specificationIdOrSlugSchema,
  })
  .strict()

const requirementIdsSchema = z
  .array(positiveIntegerSchema)
  .min(1)
  .max(ARRAY_INPUT_MAX_ITEMS)
  .refine(values => new Set(values).size === values.length, {
    message: 'Expected unique positive integers',
  })

const itemRefsSchema = z
  .array(routeSegmentSchema)
  .min(1)
  .max(ARRAY_INPUT_MAX_ITEMS)
  .refine(values => new Set(values).size === values.length, {
    message: 'Expected unique item references',
  })

const postItemsSchema = z
  .object({
    needsReferenceId: positiveIntegerSchema.nullable().optional(),
    needsReferenceText: nullableBoundedDbStringSchema.optional(),
    requirementIds: requirementIdsSchema,
  })
  .strict()
  .refine(
    value =>
      value.needsReferenceId == null ||
      value.needsReferenceText == null ||
      value.needsReferenceText.trim() === '',
    {
      message:
        'Provide either needsReferenceId or needsReferenceText, not both',
      path: ['needsReferenceText'],
    },
  )

const deleteItemsSchema = z.union([
  z
    .object({
      itemRefs: itemRefsSchema,
    })
    .strict(),
  z
    .object({
      requirementIds: requirementIdsSchema,
    })
    .strict(),
])

async function resolveSpecificationId(db: SqlServerDatabase, idOrSlug: string) {
  const bySlug = await getSpecificationBySlug(db, idOrSlug)
  if (bySlug) return bySlug.id
  if (/^\d+$/.test(idOrSlug)) {
    const byId = await getSpecificationById(db, Number(idOrSlug))
    return byId?.id ?? null
  }
  return null
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, specificationParamSchema)
  if (!parsedParams.ok) {
    return parsedParams.response
  }
  const { id } = parsedParams.data
  const db = await getRequestSqlServerDataSource()
  const specificationId = await resolveSpecificationId(db, id)
  if (specificationId === null)
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const items = await listSpecificationItems(db, specificationId)
  const deviationCounts = await countDeviationsPerItemRef(db, specificationId)
  const enrichedItems = items.map(item => {
    const dc = item.itemRef ? deviationCounts.get(item.itemRef) : undefined
    return {
      ...item,
      deviationCount: dc?.total ?? 0,
      hasApprovedDeviation: (dc?.approved ?? 0) > 0,
      hasPendingDeviation: (dc?.pending ?? 0) > 0,
    }
  })
  return NextResponse.json({ items: enrichedItems })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, specificationParamSchema)
  if (!parsedParams.ok) {
    return parsedParams.response
  }
  const parsedBody = await readJsonWithSchema(request, postItemsSchema)
  if (!parsedBody.ok) {
    return parsedBody.response
  }
  const { id } = parsedParams.data
  const db = await getRequestSqlServerDataSource()

  const specificationId = await resolveSpecificationId(db, id)
  if (specificationId === null)
    return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { requirementIds, needsReferenceId, needsReferenceText } =
    parsedBody.data

  try {
    const { context, service } = await createRequirementsRestRuntime(request, {
      db,
    })
    const payload = await service.addToSpecification(context, {
      specificationId,
      requirementIds,
      needsReferenceId,
      needsReferenceText,
      responseFormat: 'json',
    })
    return NextResponse.json(
      { addedCount: payload.addedCount, ok: true },
      { status: payload.addedCount > 0 ? 201 : 200 },
    )
  } catch (error) {
    if (isRequirementsServiceError(error)) {
      const { body, status } = toHttpErrorPayload(error)
      return NextResponse.json(body, { status })
    }

    logSanitizedError(
      'Failed to add requirements to requirements specification',
      error,
    )
    return NextResponse.json({ error: ADD_REQUIREMENTS_ERROR }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, specificationParamSchema)
  if (!parsedParams.ok) {
    return parsedParams.response
  }
  const parsedBody = await readJsonWithSchema(request, deleteItemsSchema)
  if (!parsedBody.ok) {
    return parsedBody.response
  }
  const { id } = parsedParams.data
  const db = await getRequestSqlServerDataSource()

  const specificationId = await resolveSpecificationId(db, id)
  if (specificationId === null)
    return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if ('itemRefs' in parsedBody.data) {
    try {
      const { deletedLibraryCount, deletedSpecificationLocalCount } =
        await deleteSpecificationItemsByRefs(
          db,
          specificationId,
          parsedBody.data.itemRefs,
        )
      return NextResponse.json({
        deletedLibraryCount,
        deletedSpecificationLocalCount,
        ok: true,
        removedCount: deletedLibraryCount + deletedSpecificationLocalCount,
      })
    } catch (error) {
      if (isRequirementsServiceError(error)) {
        const { body, status } = toHttpErrorPayload(error)
        return NextResponse.json(body, { status })
      }

      logSanitizedError('Failed to delete specification items by refs', error)
      return NextResponse.json(
        { error: 'Failed to remove items' },
        { status: 500 },
      )
    }
  }

  try {
    const { context, service } = await createRequirementsRestRuntime(request, {
      db,
    })
    const payload = await service.removeFromSpecification(context, {
      specificationId,
      requirementIds: parsedBody.data.requirementIds,
      responseFormat: 'json',
    })
    return NextResponse.json({ ok: true, removedCount: payload.removedCount })
  } catch (error) {
    if (isRequirementsServiceError(error)) {
      const { body, status } = toHttpErrorPayload(error)
      return NextResponse.json(body, { status })
    }

    logSanitizedError('Failed to unlink requirements from specification', error)
    return NextResponse.json(
      { error: 'Failed to unlink requirements' },
      { status: 500 },
    )
  }
}

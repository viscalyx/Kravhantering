import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { countDeviationsPerItemRef } from '@/lib/dal/deviations'
import {
  deleteSpecificationItemsByRefs,
  getSpecificationById,
  getSpecificationBySlug,
  listSpecificationItems,
  updateSpecificationItemFieldsByItemRefs,
} from '@/lib/dal/requirements-specifications'
import type { SqlServerDatabase } from '@/lib/db'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { logSanitizedError } from '@/lib/http/safe-errors'
import {
  customMutationPolicy,
  requirementsMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import {
  ARRAY_INPUT_MAX_ITEMS,
  nullableBoundedDbStringSchema,
  nullableBusinessTextSchema,
  parseRouteParams,
  positiveIntegerSchema,
  routeSegmentSchema,
  specificationIdOrSlugSchema,
} from '@/lib/http/validation'
import { isRequirementsServiceError } from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'
import { authorize } from '@/lib/requirements/service-shared'

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
    needsReferenceDescription: nullableBusinessTextSchema.optional(),
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
  .refine(
    value =>
      value.needsReferenceText != null ||
      value.needsReferenceDescription == null ||
      value.needsReferenceDescription.trim() === '',
    {
      message: 'needsReferenceDescription requires needsReferenceText',
      path: ['needsReferenceDescription'],
    },
  )

const patchItemsSchema = z
  .object({
    itemRefs: itemRefsSchema,
    needsReferenceId: positiveIntegerSchema.nullable(),
  })
  .strict()

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

function specificationActionReference(idOrSlug: string) {
  return /^\d+$/.test(idOrSlug)
    ? { specificationId: Number(idOrSlug) }
    : { specificationSlug: idOrSlug }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, specificationParamSchema)
  if (!parsedParams.ok) {
    return parsedParams.response
  }
  try {
    const { id } = parsedParams.data
    const db = await getRequestSqlServerDataSource()
    const specificationId = await resolveSpecificationId(db, id)
    if (specificationId === null)
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const { authorization, context } = await createRequirementsRestRuntime(
      request,
      { db },
    )
    await authorize(
      authorization,
      {
        kind: 'get_specification_items',
        specificationId,
        specificationSlug: /^\d+$/.test(id) ? undefined : id,
      },
      context,
    )
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
  } catch (error) {
    const { body, status } = toHttpErrorPayload(error)
    return NextResponse.json(body, { status })
  }
}

export const POST = secureMutationRoute({
  bodySchema: postItemsSchema,
  paramsSchema: specificationParamSchema,
  policy: requirementsMutationPolicy<
    z.infer<typeof postItemsSchema>,
    z.infer<typeof specificationParamSchema>
  >(({ body, params }) => ({
    kind: 'add_to_specification',
    requirementIds: body.requirementIds,
    ...specificationActionReference(params.id),
  })),
  handler: async ({ body, context, params, request }) => {
    const { id } = params
    const db = await getRequestSqlServerDataSource()

    const specificationId = await resolveSpecificationId(db, id)
    if (specificationId === null)
      return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { requirementIds, needsReferenceId, needsReferenceText } = body

    try {
      const { service } = await createRequirementsRestRuntime(request, {
        context,
        db,
      })
      const payload = await service.addToSpecification(context, {
        specificationId,
        requirementIds,
        needsReferenceDescription: body.needsReferenceDescription,
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
      return NextResponse.json(
        { error: ADD_REQUIREMENTS_ERROR },
        { status: 500 },
      )
    }
  },
})

export const PATCH = secureMutationRoute({
  bodySchema: patchItemsSchema,
  paramsSchema: specificationParamSchema,
  policy: requirementsMutationPolicy<
    z.infer<typeof patchItemsSchema>,
    z.infer<typeof specificationParamSchema>
  >(({ body, params }) => ({
    kind: 'manage_specification_needs_reference',
    needsReferenceId: body.needsReferenceId ?? undefined,
    operation: 'assign',
    ...specificationActionReference(params.id),
  })),
  handler: async ({ body, params }) => {
    const { id } = params
    const db = await getRequestSqlServerDataSource()

    const specificationId = await resolveSpecificationId(db, id)
    if (specificationId === null) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const updatedCount = await updateSpecificationItemFieldsByItemRefs(
      db,
      specificationId,
      body.itemRefs,
      { needsReferenceId: body.needsReferenceId },
    )

    return NextResponse.json({ ok: true, updatedCount })
  },
})

export const DELETE = secureMutationRoute({
  bodySchema: deleteItemsSchema,
  paramsSchema: specificationParamSchema,
  policy: customMutationPolicy('specification_items.delete', () => {}),
  handler: async ({ body, context, params, request }) => {
    const { id } = params
    const db = await getRequestSqlServerDataSource()

    const specificationId = await resolveSpecificationId(db, id)
    if (specificationId === null)
      return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if ('itemRefs' in body) {
      try {
        const { deletedLibraryCount, deletedSpecificationLocalCount } =
          await deleteSpecificationItemsByRefs(
            db,
            specificationId,
            body.itemRefs,
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

        logSanitizedError(
          'Failed to delete requirement applications by refs',
          error,
        )
        return NextResponse.json(
          { error: 'Failed to remove items' },
          { status: 500 },
        )
      }
    }

    try {
      const { service } = await createRequirementsRestRuntime(request, {
        context,
        db,
      })
      const payload = await service.removeFromSpecification(context, {
        specificationId,
        requirementIds: body.requirementIds,
        responseFormat: 'json',
      })
      return NextResponse.json({ ok: true, removedCount: payload.removedCount })
    } catch (error) {
      if (isRequirementsServiceError(error)) {
        const { body, status } = toHttpErrorPayload(error)
        return NextResponse.json(body, { status })
      }

      logSanitizedError(
        'Failed to unlink requirements from specification',
        error,
      )
      return NextResponse.json(
        { error: 'Failed to unlink requirements' },
        { status: 500 },
      )
    }
  },
})

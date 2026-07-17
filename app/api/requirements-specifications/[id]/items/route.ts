import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  deleteSpecificationItemsByRefs,
  getSpecificationById,
  updateSpecificationItemFieldsByItemRefs,
} from '@/lib/dal/requirements-specifications'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { logSanitizedError } from '@/lib/http/safe-errors'
import {
  customMutationPolicy,
  requirementsMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import {
  ARRAY_INPUT_MAX_ITEMS,
  idParamSchema,
  nullableBoundedDbStringSchema,
  nullableBusinessTextSchema,
  parseRouteParams,
  parseSearchParams,
  positiveIntegerSchema,
  routeSegmentSchema,
} from '@/lib/http/validation'
import { isRequirementsServiceError } from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'
import { specificationItemPageQuerySchema } from '@/lib/requirements/specification-item-query'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

const ADD_REQUIREMENTS_ERROR = 'Failed to add requirements'

const specificationParamSchema = idParamSchema

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

export async function GET(
  request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, specificationParamSchema)
  if (!parsedParams.ok) {
    return parsedParams.response
  }
  const parsedQuery = parseSearchParams(
    new URL(request.url).searchParams,
    specificationItemPageQuerySchema,
  )
  if (!parsedQuery.ok) return parsedQuery.response
  try {
    const { id } = parsedParams.data
    const db = await getRequestSqlServerDataSource()
    const specification = await getSpecificationById(db, id)
    if (!specification)
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const { context, service } = await createRequirementsRestRuntime(request, {
      db,
    })
    const payload = await service.getSpecificationItems(context, {
      ...parsedQuery.data,
      capacitySurface: 'rest',
      responseFormat: 'json',
      specificationId: specification.id,
    })
    return NextResponse.json({
      items: payload.items,
      pagination: payload.pagination,
    })
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
    specificationId: params.id,
  })),
  handler: async ({ body, context, params, request }) => {
    const { id } = params
    const db = await getRequestSqlServerDataSource()

    const specification = await getSpecificationById(db, id)
    if (!specification)
      return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { requirementIds, needsReferenceId, needsReferenceText } = body

    try {
      const { service } = await createRequirementsRestRuntime(request, {
        context,
        db,
      })
      const payload = await service.addToSpecification(context, {
        specificationId: specification.id,
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
    specificationId: params.id,
  })),
  handler: async ({ body, params }) => {
    const { id } = params
    const db = await getRequestSqlServerDataSource()

    const specification = await getSpecificationById(db, id)
    if (!specification) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const updatedCount = await updateSpecificationItemFieldsByItemRefs(
      db,
      specification.id,
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

    const specification = await getSpecificationById(db, id)
    if (!specification)
      return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if ('itemRefs' in body) {
      try {
        const { deletedLibraryCount, deletedSpecificationLocalCount } =
          await deleteSpecificationItemsByRefs(
            db,
            specification.id,
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
        specificationId: specification.id,
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

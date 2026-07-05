import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  getSpecificationItemByRef,
  listSpecificationItems,
  updateSpecificationItemFieldsByItemRef,
} from '@/lib/dal/requirements-specifications'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  customMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import {
  idParamSchema,
  nullableBusinessTextSchema,
  parseRouteParams,
  positiveIntegerSchema,
  positiveIntegerStringSchema,
  routeSegmentSchema,
} from '@/lib/http/validation'
import { isRequirementsServiceError } from '@/lib/requirements/errors'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string; itemId: string }>

const specificationItemParamSchema = z
  .object({
    id: idParamSchema.shape.id,
    itemId: positiveIntegerStringSchema,
  })
  .strict()

const specificationItemRefParamSchema = z
  .object({
    id: idParamSchema.shape.id,
    itemId: routeSegmentSchema,
  })
  .strict()

const patchSpecificationItemSchema = z
  .object({
    needsReferenceId: positiveIntegerSchema.nullable().optional(),
    note: nullableBusinessTextSchema.optional(),
    specificationItemStatusId: positiveIntegerSchema.optional(),
  })
  .strict()
  .refine(
    data =>
      data.needsReferenceId !== undefined ||
      data.note !== undefined ||
      data.specificationItemStatusId !== undefined,
    {
      message:
        'At least one of note, needsReferenceId or specificationItemStatusId must be supplied',
    },
  )

export async function GET(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(
    params,
    specificationItemParamSchema,
  )
  if (!parsedParams.ok) {
    return parsedParams.response
  }
  const { id, itemId: numericItemId } = parsedParams.data
  const db = await getRequestSqlServerDataSource()

  const items = await listSpecificationItems(db, id)
  const item = items.find(
    candidate =>
      candidate.specificationItemId === numericItemId &&
      candidate.kind === 'library',
  )

  if (!item) {
    return NextResponse.json(
      { error: 'Item not found in specification' },
      { status: 404 },
    )
  }

  return NextResponse.json({
    needsReference: item.needsReference ?? null,
    needsReferenceId: item.needsReferenceId ?? null,
    specificationItemId: item.specificationItemId,
    specificationItemStatusColor: item.specificationItemStatusColor ?? null,
    specificationItemStatusIconName:
      item.specificationItemStatusIconName ?? null,
    specificationItemStatusId: item.specificationItemStatusId,
    specificationItemStatusNameEn: item.specificationItemStatusNameEn ?? null,
    specificationItemStatusNameSv: item.specificationItemStatusNameSv ?? null,
  })
}

export const PATCH = secureMutationRoute({
  bodySchema: patchSpecificationItemSchema,
  paramsSchema: specificationItemRefParamSchema,
  policy: customMutationPolicy('specification_item.patch', () => {}),
  handler: async ({ body, params }) => {
    const { id, itemId } = params
    const db = await getRequestSqlServerDataSource()
    let decodedItemRef: string
    try {
      decodedItemRef = decodeURIComponent(itemId)
    } catch (decodeError) {
      if (decodeError instanceof URIError) {
        return NextResponse.json({ error: 'Invalid itemId' }, { status: 400 })
      }
      throw decodeError
    }
    const item = await getSpecificationItemByRef(db, id, decodedItemRef)
    if (!item) {
      return NextResponse.json(
        { error: 'Item not found in specification' },
        { status: 404 },
      )
    }
    try {
      await updateSpecificationItemFieldsByItemRef(db, id, decodedItemRef, body)
    } catch (error) {
      if (isRequirementsServiceError(error) && error.code === 'not_found') {
        return NextResponse.json(
          { error: 'Item not found in specification' },
          { status: 404 },
        )
      }
      throw error
    }
    return NextResponse.json({ ok: true })
  },
})

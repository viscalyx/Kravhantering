import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  getSpecificationById,
  getSpecificationBySlug,
  getSpecificationItemByRef,
  listSpecificationItems,
  updateSpecificationItemFieldsByItemRef,
} from '@/lib/dal/requirements-specifications'
import type { SqlServerDatabase } from '@/lib/db'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  nullableBusinessTextSchema,
  parseRouteParams,
  positiveIntegerSchema,
  positiveIntegerStringSchema,
  readJsonWithSchema,
  routeSegmentSchema,
  specificationIdOrSlugSchema,
} from '@/lib/http/validation'
import { isRequirementsServiceError } from '@/lib/requirements/errors'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string; itemId: string }>

const specificationItemParamSchema = z
  .object({
    id: specificationIdOrSlugSchema,
    itemId: positiveIntegerStringSchema,
  })
  .strict()

const specificationItemRefParamSchema = z
  .object({
    id: specificationIdOrSlugSchema,
    itemId: routeSegmentSchema,
  })
  .strict()

const patchSpecificationItemSchema = z
  .object({
    note: nullableBusinessTextSchema.optional(),
    specificationItemStatusId: positiveIntegerSchema.nullable().optional(),
  })
  .strict()
  .refine(
    data =>
      data.note !== undefined || data.specificationItemStatusId !== undefined,
    {
      message:
        'At least one of note or specificationItemStatusId must be supplied',
    },
  )

async function resolveSpecificationId(idOrSlug: string, db: SqlServerDatabase) {
  const bySlug = await getSpecificationBySlug(db, idOrSlug)
  if (bySlug) {
    return bySlug.id
  }

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
  const parsedParams = await parseRouteParams(
    params,
    specificationItemParamSchema,
  )
  if (!parsedParams.ok) {
    return parsedParams.response
  }
  const { id, itemId: numericItemId } = parsedParams.data
  const db = await getRequestSqlServerDataSource()
  const specificationId = await resolveSpecificationId(id, db)

  if (specificationId === null) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const items = await listSpecificationItems(db, specificationId)
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
    specificationItemStatusId: item.specificationItemStatusId ?? null,
    specificationItemStatusNameEn: item.specificationItemStatusNameEn ?? null,
    specificationItemStatusNameSv: item.specificationItemStatusNameSv ?? null,
  })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(
    params,
    specificationItemRefParamSchema,
  )
  if (!parsedParams.ok) {
    return parsedParams.response
  }
  const parsedBody = await readJsonWithSchema(
    request,
    patchSpecificationItemSchema,
  )
  if (!parsedBody.ok) {
    return parsedBody.response
  }
  const { id, itemId } = parsedParams.data
  const body = parsedBody.data
  const db = await getRequestSqlServerDataSource()
  const specificationId = await resolveSpecificationId(id, db)
  if (specificationId === null) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  let decodedItemRef: string
  try {
    decodedItemRef = decodeURIComponent(itemId)
  } catch (decodeError) {
    if (decodeError instanceof URIError) {
      return NextResponse.json({ error: 'Invalid itemId' }, { status: 400 })
    }
    throw decodeError
  }
  const item = await getSpecificationItemByRef(
    db,
    specificationId,
    decodedItemRef,
  )
  if (!item) {
    return NextResponse.json(
      { error: 'Item not found in specification' },
      { status: 404 },
    )
  }
  try {
    await updateSpecificationItemFieldsByItemRef(
      db,
      specificationId,
      decodedItemRef,
      body,
    )
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
}

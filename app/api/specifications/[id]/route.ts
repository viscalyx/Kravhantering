import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  deleteSpecification,
  getSpecificationById,
  getSpecificationBySlug,
  isSlugTaken,
  updateSpecification,
} from '@/lib/dal/requirements-specifications'
import type { SqlServerDatabase } from '@/lib/db'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  boundedDbStringSchema,
  nullableBusinessTextSchema,
  parseRouteParams,
  positiveIntegerSchema,
  readJsonWithSchema,
  specificationIdOrSlugSchema,
} from '@/lib/http/validation'

type Params = Promise<{ id: string }>

const specificationParamSchema = z
  .object({
    id: specificationIdOrSlugSchema,
  })
  .strict()

const updateSpecificationSchema = z
  .object({
    businessNeedsReference: nullableBusinessTextSchema.optional(),
    name: boundedDbStringSchema.optional(),
    specificationImplementationTypeId: positiveIntegerSchema
      .nullable()
      .optional(),
    specificationLifecycleStatusId: positiveIntegerSchema.nullable().optional(),
    specificationResponsibilityAreaId: positiveIntegerSchema
      .nullable()
      .optional(),
    uniqueId: boundedDbStringSchema.optional(),
  })
  .strict()

async function resolveSpecification(db: SqlServerDatabase, idOrSlug: string) {
  if (/^\d+$/.test(idOrSlug)) return getSpecificationById(db, Number(idOrSlug))
  return getSpecificationBySlug(db, idOrSlug)
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
  const spec = await resolveSpecification(db, id)
  if (!spec) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(spec)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, specificationParamSchema)
  if (!parsedParams.ok) {
    return parsedParams.response
  }
  const parsedBody = await readJsonWithSchema(
    request,
    updateSpecificationSchema,
  )
  if (!parsedBody.ok) {
    return parsedBody.response
  }
  const { id } = parsedParams.data
  const body = parsedBody.data
  const db = await getRequestSqlServerDataSource()

  const spec = await resolveSpecification(db, id)
  if (!spec) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (body.uniqueId && (await isSlugTaken(db, body.uniqueId, spec.id))) {
    return NextResponse.json({ error: 'slug_taken' }, { status: 409 })
  }

  const updated = await updateSpecification(db, spec.id, body)
  return NextResponse.json(updated)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, specificationParamSchema)
  if (!parsedParams.ok) {
    return parsedParams.response
  }
  const { id } = parsedParams.data
  const db = await getRequestSqlServerDataSource()
  const spec = await resolveSpecification(db, id)
  if (!spec) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await deleteSpecification(db, spec.id)
  return NextResponse.json({ ok: true })
}

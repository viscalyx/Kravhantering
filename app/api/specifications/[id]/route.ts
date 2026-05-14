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
  customMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import {
  boundedDbStringSchema,
  nullableBusinessTextSchema,
  parseRouteParams,
  positiveIntegerSchema,
  specificationIdOrSlugSchema,
} from '@/lib/http/validation'

export const dynamic = 'force-dynamic'

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

export const PUT = secureMutationRoute({
  bodySchema: updateSpecificationSchema,
  paramsSchema: specificationParamSchema,
  policy: customMutationPolicy('specification.update', () => {}),
  handler: async ({ body, params }) => {
    const { id } = params
    const db = await getRequestSqlServerDataSource()

    const spec = await resolveSpecification(db, id)
    if (!spec) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (body.uniqueId && (await isSlugTaken(db, body.uniqueId, spec.id))) {
      return NextResponse.json({ error: 'slug_taken' }, { status: 409 })
    }

    const updated = await updateSpecification(db, spec.id, body)
    return NextResponse.json(updated)
  },
})

export const DELETE = secureMutationRoute({
  paramsSchema: specificationParamSchema,
  policy: customMutationPolicy('specification.delete', () => {}),
  handler: async ({ params }) => {
    const { id } = params
    const db = await getRequestSqlServerDataSource()
    const spec = await resolveSpecification(db, id)
    if (!spec) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    await deleteSpecification(db, spec.id)
    return NextResponse.json({ ok: true })
  },
})

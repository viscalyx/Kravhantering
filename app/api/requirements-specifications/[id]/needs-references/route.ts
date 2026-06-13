import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  createSpecificationNeedsReference,
  deleteSpecificationNeedsReference,
  getSpecificationById,
  getSpecificationBySlug,
  listSpecificationNeedsReferences,
  updateSpecificationNeedsReference,
} from '@/lib/dal/requirements-specifications'
import type { SqlServerDatabase } from '@/lib/db'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  requirementsMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import {
  boundedDbStringSchema,
  nullableBusinessTextSchema,
  parseRouteParams,
  positiveIntegerSchema,
  specificationIdOrSlugSchema,
} from '@/lib/http/validation'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'
import { authorize } from '@/lib/requirements/service-shared'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

const specificationParamSchema = z
  .object({
    id: specificationIdOrSlugSchema,
  })
  .strict()

const createNeedsReferenceSchema = z
  .object({
    description: nullableBusinessTextSchema.optional(),
    text: boundedDbStringSchema,
  })
  .strict()

const updateNeedsReferenceSchema = z
  .object({
    description: nullableBusinessTextSchema.optional(),
    id: positiveIntegerSchema,
    text: boundedDbStringSchema,
  })
  .strict()

const deleteNeedsReferenceSchema = z
  .object({
    id: positiveIntegerSchema,
  })
  .strict()

async function resolveSpecificationId(db: SqlServerDatabase, idOrSlug: string) {
  if (/^\d+$/.test(idOrSlug)) {
    const spec = await getSpecificationById(db, Number(idOrSlug))
    return spec?.id ?? null
  }
  const spec = await getSpecificationBySlug(db, idOrSlug)
  return spec?.id ?? null
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
    const { authorization, context, db } =
      await createRequirementsRestRuntime(request)
    const specificationId = await resolveSpecificationId(db, id)
    if (specificationId === null) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await authorize(
      authorization,
      {
        kind: 'get_specification_items',
        specificationId,
        specificationSlug: /^\d+$/.test(id) ? undefined : id,
      },
      context,
    )
    const needsReferences = await listSpecificationNeedsReferences(
      db,
      specificationId,
    )
    return NextResponse.json({ needsReferences })
  } catch (error) {
    const { body, status } = toHttpErrorPayload(error)
    return NextResponse.json(body, { status })
  }
}

export const POST = secureMutationRoute<
  z.infer<typeof createNeedsReferenceSchema>,
  z.infer<typeof specificationParamSchema>
>({
  bodySchema: createNeedsReferenceSchema,
  paramsSchema: specificationParamSchema,
  policy: requirementsMutationPolicy<
    z.infer<typeof createNeedsReferenceSchema>,
    z.infer<typeof specificationParamSchema>
  >(({ params }) => ({
    kind: 'manage_specification_needs_reference',
    operation: 'create',
    ...specificationActionReference(params.id),
  })),
  handler: async ({ body, params }) => {
    const db = await getRequestSqlServerDataSource()
    const specificationId = await resolveSpecificationId(db, params.id)
    if (specificationId === null) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const needsReference = await createSpecificationNeedsReference(
      db,
      specificationId,
      {
        description: body.description ?? null,
        text: body.text,
      },
    )
    return NextResponse.json({ needsReference, ok: true }, { status: 201 })
  },
})

export const PATCH = secureMutationRoute<
  z.infer<typeof updateNeedsReferenceSchema>,
  z.infer<typeof specificationParamSchema>
>({
  bodySchema: updateNeedsReferenceSchema,
  paramsSchema: specificationParamSchema,
  policy: requirementsMutationPolicy<
    z.infer<typeof updateNeedsReferenceSchema>,
    z.infer<typeof specificationParamSchema>
  >(({ body, params }) => ({
    kind: 'manage_specification_needs_reference',
    needsReferenceId: body.id,
    operation: 'update',
    ...specificationActionReference(params.id),
  })),
  handler: async ({ body, params }) => {
    const db = await getRequestSqlServerDataSource()
    const specificationId = await resolveSpecificationId(db, params.id)
    if (specificationId === null) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const needsReference = await updateSpecificationNeedsReference(
      db,
      specificationId,
      body.id,
      {
        description: body.description ?? null,
        text: body.text,
      },
    )
    return NextResponse.json({ needsReference, ok: true })
  },
})

export const DELETE = secureMutationRoute<
  z.infer<typeof deleteNeedsReferenceSchema>,
  z.infer<typeof specificationParamSchema>
>({
  bodySchema: deleteNeedsReferenceSchema,
  paramsSchema: specificationParamSchema,
  policy: requirementsMutationPolicy<
    z.infer<typeof deleteNeedsReferenceSchema>,
    z.infer<typeof specificationParamSchema>
  >(({ body, params }) => ({
    kind: 'manage_specification_needs_reference',
    needsReferenceId: body.id,
    operation: 'delete',
    ...specificationActionReference(params.id),
  })),
  handler: async ({ body, params }) => {
    const db = await getRequestSqlServerDataSource()
    const specificationId = await resolveSpecificationId(db, params.id)
    if (specificationId === null) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const deleted = await deleteSpecificationNeedsReference(
      db,
      specificationId,
      body.id,
    )
    if (!deleted) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json({ ok: true })
  },
})

import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  createSpecificationNeedsReference,
  deleteSpecificationNeedsReference,
  getSpecificationById,
  listSpecificationNeedsReferences,
  updateSpecificationNeedsReference,
} from '@/lib/dal/requirements-specifications'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  requirementsMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import {
  boundedDbStringSchema,
  idParamSchema,
  nullableBusinessTextSchema,
  parseRouteParams,
  positiveIntegerSchema,
} from '@/lib/http/validation'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'
import { authorize } from '@/lib/requirements/service-shared'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

const specificationParamSchema = idParamSchema

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
    const specification = await getSpecificationById(db, id)
    if (!specification) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await authorize(
      authorization,
      {
        kind: 'get_specification_items',
        specificationId: specification.id,
      },
      context,
    )
    const needsReferences = await listSpecificationNeedsReferences(
      db,
      specification.id,
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
    specificationId: params.id,
  })),
  handler: async ({ body, params }) => {
    const db = await getRequestSqlServerDataSource()
    const specification = await getSpecificationById(db, params.id)
    if (!specification) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const needsReference = await createSpecificationNeedsReference(
      db,
      specification.id,
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
    specificationId: params.id,
  })),
  handler: async ({ body, params }) => {
    const db = await getRequestSqlServerDataSource()
    const specification = await getSpecificationById(db, params.id)
    if (!specification) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const needsReference = await updateSpecificationNeedsReference(
      db,
      specification.id,
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
    specificationId: params.id,
  })),
  handler: async ({ body, params }) => {
    const db = await getRequestSqlServerDataSource()
    const specification = await getSpecificationById(db, params.id)
    if (!specification) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const deleted = await deleteSpecificationNeedsReference(
      db,
      specification.id,
      body.id,
    )
    if (!deleted) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json({ ok: true })
  },
})

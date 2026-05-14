import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  createSpecification,
  isSlugTaken,
} from '@/lib/dal/requirements-specifications'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  customMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import {
  boundedDbStringSchema,
  nullableBusinessTextSchema,
  positiveIntegerSchema,
} from '@/lib/http/validation'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'

const createSpecificationSchema = z
  .object({
    businessNeedsReference: nullableBusinessTextSchema.optional(),
    name: boundedDbStringSchema,
    specificationImplementationTypeId: positiveIntegerSchema
      .nullable()
      .optional(),
    specificationLifecycleStatusId: positiveIntegerSchema.nullable().optional(),
    specificationResponsibilityAreaId: positiveIntegerSchema
      .nullable()
      .optional(),
    uniqueId: boundedDbStringSchema,
  })
  .strict()

export async function GET(request: NextRequest) {
  try {
    const { context, service } = await createRequirementsRestRuntime(request)
    const payload = await service.listSpecifications(context, {
      includeRestFields: true,
      responseFormat: 'json',
    })
    return NextResponse.json({ specifications: payload.specifications })
  } catch (error) {
    const { body, status } = toHttpErrorPayload(error)
    return NextResponse.json(body, { status })
  }
}

export const POST = secureMutationRoute({
  bodySchema: createSpecificationSchema,
  policy: customMutationPolicy('specification.create', () => {}),
  handler: async ({ body }) => {
    const db = await getRequestSqlServerDataSource()

    if (await isSlugTaken(db, body.uniqueId)) {
      return NextResponse.json({ error: 'slug_taken' }, { status: 409 })
    }

    const spec = await createSpecification(db, body)
    return NextResponse.json(spec, { status: 201 })
  },
})

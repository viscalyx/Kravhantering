import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  countLinkedRequirements,
  listNormReferences,
} from '@/lib/dal/norm-references'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  authenticatedMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import {
  boundedDbStringSchema,
  optionalBusinessTextSchema,
  optionalQueryArraySchema,
  parseSearchParams,
  positiveIntegerStringSchema,
  queryBooleanSchema,
} from '@/lib/http/validation'
import { createNormReferenceWithAudit } from '@/lib/requirements/norm-reference-mutations'

const nullableOptionalTextSchema = optionalBusinessTextSchema
  .nullable()
  .transform(value => (value === '' ? null : value))

const normReferencesQuerySchema = z
  .object({
    includeArchived: queryBooleanSchema.optional().default(false),
    includeIds: optionalQueryArraySchema(positiveIntegerStringSchema),
    linked: queryBooleanSchema.optional().default(false),
    statuses: optionalQueryArraySchema(positiveIntegerStringSchema),
  })
  .strict()

const normReferenceCreateSchema = z
  .object({
    issuer: boundedDbStringSchema,
    name: boundedDbStringSchema,
    normReferenceId: optionalBusinessTextSchema,
    reference: boundedDbStringSchema,
    type: boundedDbStringSchema,
    uri: nullableOptionalTextSchema.optional(),
    version: nullableOptionalTextSchema.optional(),
  })
  .strict()

export async function GET(request: Request) {
  const parsedQuery = parseSearchParams(
    new URL(request.url).searchParams,
    normReferencesQuerySchema,
  )
  if (!parsedQuery.ok) return parsedQuery.response
  const {
    includeArchived,
    includeIds,
    linked: linkedOnly,
    statuses,
  } = parsedQuery.data
  const db = await getRequestSqlServerDataSource()
  const [normRefs, counts] = await Promise.all([
    listNormReferences(db, { includeArchived, includeIds }),
    countLinkedRequirements(
      db,
      linkedOnly && statuses && statuses.length > 0 ? { statuses } : undefined,
    ),
  ])
  let results = normRefs.map(r => ({
    ...r,
    linkedRequirementCount: counts[r.id] ?? 0,
  }))
  if (linkedOnly) {
    results = results.filter(r => r.linkedRequirementCount > 0)
  }
  return NextResponse.json({ normReferences: results })
}

export const POST = secureMutationRoute({
  bodySchema: normReferenceCreateSchema,
  policy: authenticatedMutationPolicy('norm_reference.create'),
  handler: async ({ body, context }) => {
    const db = await getRequestSqlServerDataSource()
    const normReference = await createNormReferenceWithAudit(db, body, context)
    return NextResponse.json(normReference, { status: 201 })
  },
})

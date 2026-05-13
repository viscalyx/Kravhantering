import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  createAdminPrivilegedAuditContext,
  recordAdminPrivilegedActionSucceeded,
} from '@/lib/admin/privileged-audit'
import {
  countLinkedRequirements,
  createNormReference,
  listNormReferences,
} from '@/lib/dal/norm-references'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  boundedDbStringSchema,
  optionalBusinessTextSchema,
  optionalQueryArraySchema,
  parseSearchParams,
  positiveIntegerStringSchema,
  queryBooleanSchema,
  readJsonWithSchema,
} from '@/lib/http/validation'

const nullableOptionalTextSchema = optionalBusinessTextSchema
  .nullable()
  .transform(value => (value === '' ? null : value))

const normReferencesQuerySchema = z
  .object({
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
  const { linked: linkedOnly, statuses } = parsedQuery.data
  const db = await getRequestSqlServerDataSource()
  const [normRefs, counts] = await Promise.all([
    listNormReferences(db),
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

export async function POST(request: Request) {
  const parsedBody = await readJsonWithSchema(
    request,
    normReferenceCreateSchema,
  )
  if (!parsedBody.ok) return parsedBody.response
  const auditContext = await createAdminPrivilegedAuditContext(request)
  const db = await getRequestSqlServerDataSource()
  try {
    const normReference = await createNormReference(db, parsedBody.data)
    recordAdminPrivilegedActionSucceeded(auditContext, {
      changedFields: Object.keys(parsedBody.data),
      operation: 'create',
      resourceId: normReference.id,
      resourceType: 'norm_reference',
    })
    return NextResponse.json(normReference, { status: 201 })
  } catch {
    return NextResponse.json(
      { error: 'Failed to create norm reference' },
      { status: 500 },
    )
  }
}

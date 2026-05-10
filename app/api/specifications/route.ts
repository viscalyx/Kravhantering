import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  createSpecification,
  isSlugTaken,
  listSpecifications,
} from '@/lib/dal/requirements-specifications'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  boundedDbStringSchema,
  nullableBusinessTextSchema,
  positiveIntegerSchema,
  readJsonWithSchema,
} from '@/lib/http/validation'

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

export async function GET() {
  const db = await getRequestSqlServerDataSource()
  const specifications = await listSpecifications(db)
  return NextResponse.json({ specifications })
}

export async function POST(request: NextRequest) {
  const parsedBody = await readJsonWithSchema(
    request,
    createSpecificationSchema,
  )
  if (!parsedBody.ok) {
    return parsedBody.response
  }

  const db = await getRequestSqlServerDataSource()
  const body = parsedBody.data

  if (await isSlugTaken(db, body.uniqueId)) {
    return NextResponse.json({ error: 'slug_taken' }, { status: 409 })
  }

  const spec = await createSpecification(db, body)
  return NextResponse.json(spec, { status: 201 })
}

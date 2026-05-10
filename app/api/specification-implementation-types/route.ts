import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  createSpecificationImplementationType,
  listSpecificationImplementationTypes,
} from '@/lib/dal/specification-implementation-types'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  boundedDbStringSchema,
  readJsonWithSchema,
} from '@/lib/http/validation'

export const dynamic = 'force-dynamic'

const implementationTypeSchema = z
  .object({
    nameEn: boundedDbStringSchema,
    nameSv: boundedDbStringSchema,
  })
  .strict()

export async function GET() {
  const db = await getRequestSqlServerDataSource()
  const types = await listSpecificationImplementationTypes(db)
  return NextResponse.json({ types })
}

export async function POST(request: Request) {
  const parsedBody = await readJsonWithSchema(request, implementationTypeSchema)
  if (!parsedBody.ok) return parsedBody.response
  const db = await getRequestSqlServerDataSource()
  const type = await createSpecificationImplementationType(db, parsedBody.data)
  return NextResponse.json(type, { status: 201 })
}

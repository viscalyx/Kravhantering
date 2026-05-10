import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  createSpecificationResponsibilityArea,
  listSpecificationResponsibilityAreas,
} from '@/lib/dal/specification-responsibility-areas'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  boundedDbStringSchema,
  readJsonWithSchema,
} from '@/lib/http/validation'

const responsibilityAreaSchema = z
  .object({
    nameEn: boundedDbStringSchema,
    nameSv: boundedDbStringSchema,
  })
  .strict()

export async function GET() {
  const db = await getRequestSqlServerDataSource()
  const areas = await listSpecificationResponsibilityAreas(db)
  return NextResponse.json({ areas })
}

export async function POST(request: Request) {
  const parsedBody = await readJsonWithSchema(request, responsibilityAreaSchema)
  if (!parsedBody.ok) return parsedBody.response
  const db = await getRequestSqlServerDataSource()
  const area = await createSpecificationResponsibilityArea(db, parsedBody.data)
  return NextResponse.json(area, { status: 201 })
}

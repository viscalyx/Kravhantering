import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  createStatus,
  listStatuses,
  listTransitions,
} from '@/lib/dal/requirement-statuses'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  boundedDbStringSchema,
  nonNegativeIntegerSchema,
  readJsonWithSchema,
} from '@/lib/http/validation'

const createStatusSchema = z
  .object({
    color: boundedDbStringSchema,
    isSystem: z.boolean().optional(),
    nameEn: boundedDbStringSchema,
    nameSv: boundedDbStringSchema,
    sortOrder: nonNegativeIntegerSchema,
  })
  .strict()

export async function GET() {
  const db = await getRequestSqlServerDataSource()
  const [statuses, transitions] = await Promise.all([
    listStatuses(db),
    listTransitions(db),
  ])
  return NextResponse.json({ statuses, transitions })
}

export async function POST(request: Request) {
  const parsedBody = await readJsonWithSchema(request, createStatusSchema)
  if (!parsedBody.ok) return parsedBody.response
  const db = await getRequestSqlServerDataSource()
  const status = await createStatus(db, parsedBody.data)
  return NextResponse.json(status, { status: 201 })
}

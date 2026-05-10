import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  countLinkedSpecificationItems,
  createSpecificationItemStatus,
  listSpecificationItemStatuses,
} from '@/lib/dal/specification-item-statuses'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  boundedDbStringSchema,
  nonNegativeIntegerSchema,
  nullableBusinessTextSchema,
  readJsonWithSchema,
} from '@/lib/http/validation'
import { DEVIATED_SPECIFICATION_ITEM_STATUS_ID } from '@/lib/specification-item-status-constants'

const specificationItemStatusCreateSchema = z
  .object({
    color: boundedDbStringSchema,
    descriptionEn: nullableBusinessTextSchema.optional(),
    descriptionSv: nullableBusinessTextSchema.optional(),
    nameEn: boundedDbStringSchema,
    nameSv: boundedDbStringSchema,
    sortOrder: nonNegativeIntegerSchema.optional(),
  })
  .strict()

export async function GET() {
  const db = await getRequestSqlServerDataSource()
  const [statuses, counts] = await Promise.all([
    listSpecificationItemStatuses(db),
    countLinkedSpecificationItems(db),
  ])
  return NextResponse.json({
    statuses: statuses.map(s => ({
      ...s,
      isDeviationStatus: s.id === DEVIATED_SPECIFICATION_ITEM_STATUS_ID,
      linkedItemCount: counts[s.id] ?? 0,
    })),
  })
}

export async function POST(request: Request) {
  const parsedBody = await readJsonWithSchema(
    request,
    specificationItemStatusCreateSchema,
  )
  if (!parsedBody.ok) return parsedBody.response
  try {
    const db = await getRequestSqlServerDataSource()
    const status = await createSpecificationItemStatus(db, parsedBody.data)
    return NextResponse.json(status, { status: 201 })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Internal server error'
    const isDuplicate =
      message.includes('UNIQUE') || message.includes('duplicate')
    return NextResponse.json(
      { error: isDuplicate ? 'Duplicate entry' : 'Internal server error' },
      { status: isDuplicate ? 409 : 500 },
    )
  }
}

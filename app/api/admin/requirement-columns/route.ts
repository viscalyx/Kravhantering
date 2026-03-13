import { getCloudflareContext } from '@opennextjs/cloudflare'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  getRequirementListColumnDefaults,
  updateRequirementListColumnDefaults,
} from '@/lib/dal/ui-settings'
import { getDb } from '@/lib/db'
import { REQUIREMENT_COLUMN_ORDER } from '@/lib/requirements/list-view'

const columnDefaultsEntrySchema = z
  .object({
    columnId: z.enum(REQUIREMENT_COLUMN_ORDER),
    defaultVisible: z.boolean(),
    sortOrder: z.number().int().min(0),
  })
  .strict()

const columnDefaultsPayloadSchema = z
  .object({
    columns: z
      .array(columnDefaultsEntrySchema)
      .length(REQUIREMENT_COLUMN_ORDER.length),
  })
  .strict()

function toValidationError(error: unknown) {
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      {
        error: 'Invalid requirement column payload',
        issues: error.issues,
      },
      { status: 400 },
    )
  }

  return null
}

export async function GET() {
  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)

  return NextResponse.json({
    columns: await getRequirementListColumnDefaults(db),
  })
}

export async function PUT(request: Request) {
  try {
    const body = columnDefaultsPayloadSchema.parse(await request.json())
    const uniqueColumnIds = new Set(body.columns.map(column => column.columnId))
    const uniqueSortOrders = new Set(
      body.columns.map(column => column.sortOrder),
    )

    if (uniqueColumnIds.size !== REQUIREMENT_COLUMN_ORDER.length) {
      return NextResponse.json(
        { error: 'Each requirement column must be provided exactly once.' },
        { status: 400 },
      )
    }

    if (uniqueSortOrders.size !== REQUIREMENT_COLUMN_ORDER.length) {
      return NextResponse.json(
        { error: 'Each requirement column sort order must be unique.' },
        { status: 400 },
      )
    }

    const { env } = await getCloudflareContext({ async: true })
    const db = getDb(env.DB)

    return NextResponse.json({
      columns: await updateRequirementListColumnDefaults(db, body.columns),
    })
  } catch (error) {
    const validationError = toValidationError(error)
    if (validationError) {
      return validationError
    }

    return NextResponse.json(
      { error: 'Failed to save requirement column defaults.' },
      { status: 500 },
    )
  }
}

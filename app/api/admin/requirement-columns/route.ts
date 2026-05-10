import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  formatUiSettingsLoadError,
  getRequirementListColumnDefaults,
  updateRequirementListColumnDefaults,
} from '@/lib/dal/ui-settings'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  invalidRequestResponse,
  readJsonWithSchema,
} from '@/lib/http/validation'
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

export async function GET() {
  try {
    const db = await getRequestSqlServerDataSource()

    return NextResponse.json({
      columns: await getRequirementListColumnDefaults(db),
    })
  } catch (error) {
    console.error(
      'Failed to load stored requirement column defaults',
      formatUiSettingsLoadError(error),
    )
    return NextResponse.json(
      { error: 'Failed to load requirement column defaults.' },
      { status: 500 },
    )
  }
}

export async function PUT(request: Request) {
  try {
    const parsedBody = await readJsonWithSchema(
      request,
      columnDefaultsPayloadSchema,
    )
    if (!parsedBody.ok) return parsedBody.response
    const body = parsedBody.data
    const uniqueColumnIds = new Set(body.columns.map(column => column.columnId))
    const uniqueSortOrders = new Set(
      body.columns.map(column => column.sortOrder),
    )

    if (uniqueColumnIds.size !== REQUIREMENT_COLUMN_ORDER.length) {
      return invalidRequestResponse([
        {
          code: 'custom',
          message: 'Each requirement column must be provided exactly once.',
          path: 'columns',
        },
      ])
    }

    if (uniqueSortOrders.size !== REQUIREMENT_COLUMN_ORDER.length) {
      return invalidRequestResponse([
        {
          code: 'custom',
          message: 'Each requirement column sort order must be unique.',
          path: 'columns',
        },
      ])
    }
    const db = await getRequestSqlServerDataSource()

    return NextResponse.json({
      columns: await updateRequirementListColumnDefaults(db, body.columns),
    })
  } catch {
    return NextResponse.json(
      { error: 'Failed to save requirement column defaults.' },
      { status: 500 },
    )
  }
}

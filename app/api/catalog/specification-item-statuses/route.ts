import { NextResponse } from 'next/server'
import {
  countLinkedPackageItems,
  createSpecificationItemStatus,
  listSpecificationItemStatuses,
} from '@/lib/dal/specification-item-statuses'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { DEVIATED_SPECIFICATION_ITEM_STATUS_ID } from '@/lib/specification-item-status-constants'

export async function GET() {
  const db = await getRequestSqlServerDataSource()
  const [statuses, counts] = await Promise.all([
    listSpecificationItemStatuses(db),
    countLinkedPackageItems(db),
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
  try {
    const db = await getRequestSqlServerDataSource()
    const body = (await request.json()) as Parameters<
      typeof createSpecificationItemStatus
    >[1]
    const status = await createSpecificationItemStatus(db, body)
    return NextResponse.json(status, { status: 201 })
  } catch (error) {
    if (
      error instanceof SyntaxError ||
      (error instanceof Error && error.message.includes('JSON'))
    ) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
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

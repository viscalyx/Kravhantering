import { NextResponse } from 'next/server'
import {
  countLinkedSpecificationItems,
  listSpecificationItemStatuses,
} from '@/lib/dal/specification-item-statuses'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { DEVIATED_SPECIFICATION_ITEM_STATUS_ID } from '@/lib/specification-item-status-constants'

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

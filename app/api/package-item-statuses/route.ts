import { getCloudflareContext } from '@opennextjs/cloudflare'
import { NextResponse } from 'next/server'
import {
  countLinkedPackageItems,
  createPackageItemStatus,
  listPackageItemStatuses,
} from '@/lib/dal/package-item-statuses'
import { DEVIATED_PACKAGE_ITEM_STATUS_ID } from '@/lib/dal/requirement-packages'
import { getDb } from '@/lib/db'

export async function GET() {
  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)
  const [statuses, counts] = await Promise.all([
    listPackageItemStatuses(db),
    countLinkedPackageItems(db),
  ])
  return NextResponse.json({
    statuses: statuses.map(s => ({
      ...s,
      isDeviationStatus: s.id === DEVIATED_PACKAGE_ITEM_STATUS_ID,
      linkedItemCount: counts[s.id] ?? 0,
    })),
  })
}

export async function POST(request: Request) {
  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)
  const body = (await request.json()) as Parameters<
    typeof createPackageItemStatus
  >[1]
  const status = await createPackageItemStatus(db, body)
  return NextResponse.json(status, { status: 201 })
}

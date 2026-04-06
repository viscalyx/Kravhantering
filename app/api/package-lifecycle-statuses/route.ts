import { getCloudflareContext } from '@opennextjs/cloudflare'
import { NextResponse } from 'next/server'
import {
  createPackageLifecycleStatus,
  listPackageLifecycleStatuses,
} from '@/lib/dal/package-lifecycle-statuses'
import { getDb } from '@/lib/db'

export async function GET() {
  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)
  const statuses = await listPackageLifecycleStatuses(db)
  return NextResponse.json({ statuses })
}

export async function POST(request: Request) {
  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)
  const body = (await request.json()) as Parameters<
    typeof createPackageLifecycleStatus
  >[1]
  const status = await createPackageLifecycleStatus(db, body)
  return NextResponse.json(status, { status: 201 })
}

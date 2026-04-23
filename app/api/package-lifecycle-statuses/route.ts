import { NextResponse } from 'next/server'
import {
  createPackageLifecycleStatus,
  listPackageLifecycleStatuses,
} from '@/lib/dal/package-lifecycle-statuses'
import { getRequestSqlServerDataSource } from '@/lib/db'

export async function GET() {
  const db = await getRequestSqlServerDataSource()
  const statuses = await listPackageLifecycleStatuses(db)
  return NextResponse.json({ statuses })
}

export async function POST(request: Request) {
  const db = await getRequestSqlServerDataSource()
  const body = (await request.json()) as Parameters<
    typeof createPackageLifecycleStatus
  >[1]
  const status = await createPackageLifecycleStatus(db, body)
  return NextResponse.json(status, { status: 201 })
}

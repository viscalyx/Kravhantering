import { NextResponse } from 'next/server'
import {
  createSpecificationLifecycleStatus,
  listSpecificationLifecycleStatuses,
} from '@/lib/dal/specification-lifecycle-statuses'
import { getRequestSqlServerDataSource } from '@/lib/db'

export async function GET() {
  const db = await getRequestSqlServerDataSource()
  const statuses = await listSpecificationLifecycleStatuses(db)
  return NextResponse.json({ statuses })
}

export async function POST(request: Request) {
  const db = await getRequestSqlServerDataSource()
  const body = (await request.json()) as Parameters<
    typeof createSpecificationLifecycleStatus
  >[1]
  const status = await createSpecificationLifecycleStatus(db, body)
  return NextResponse.json(status, { status: 201 })
}

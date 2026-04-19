import { NextResponse } from 'next/server'
import {
  createStatus,
  listStatuses,
  listTransitions,
} from '@/lib/dal/requirement-statuses'
import { getRequestDatabase } from '@/lib/db'

export async function GET() {
  const db = await getRequestDatabase()
  const [statuses, transitions] = await Promise.all([
    listStatuses(db),
    listTransitions(db),
  ])
  return NextResponse.json({ statuses, transitions })
}

export async function POST(request: Request) {
  const db = await getRequestDatabase()
  const body = (await request.json()) as Parameters<typeof createStatus>[1]
  const status = await createStatus(db, body)
  return NextResponse.json(status, { status: 201 })
}

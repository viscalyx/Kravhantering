import { NextResponse } from 'next/server'
import { listTypes } from '@/lib/dal/requirement-types'
import { getRequestDatabase } from '@/lib/db'

export async function GET() {
  const db = await getRequestDatabase()
  const types = await listTypes(db)
  return NextResponse.json({ types })
}

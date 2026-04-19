import { NextResponse } from 'next/server'
import { listOwners } from '@/lib/dal/owners'
import { getRequestDatabase } from '@/lib/db'

export async function GET() {
  const db = await getRequestDatabase()
  const owners = await listOwners(db)
  return NextResponse.json({ owners })
}

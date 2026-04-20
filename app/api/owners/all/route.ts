import { NextResponse } from 'next/server'
import { listOwners } from '@/lib/dal/owners'
import { getRequestDatabaseConnection } from '@/lib/db'

export async function GET() {
  const db = await getRequestDatabaseConnection()
  const owners = await listOwners(db)
  return NextResponse.json({ owners })
}

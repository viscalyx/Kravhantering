import { NextResponse } from 'next/server'
import { createOwner, listOwners } from '@/lib/dal/owners'
import { getRequestDatabase } from '@/lib/db'

export async function GET() {
  const db = await getRequestDatabase()
  const ownersList = await listOwners(db)
  return NextResponse.json({
    owners: ownersList.map(o => ({
      id: o.id,
      name: `${o.firstName} ${o.lastName}`,
    })),
  })
}

export async function POST(request: Request) {
  const db = await getRequestDatabase()
  const body = (await request.json()) as Parameters<typeof createOwner>[1]
  const owner = await createOwner(db, body)
  return NextResponse.json(owner, { status: 201 })
}

import { NextResponse } from 'next/server'
import { listOwners } from '@/lib/dal/owners'

export const runtime = 'edge'

export async function GET() {
  const owners = await listOwners()
  return NextResponse.json({
    owners: owners.map(o => ({
      id: o.id,
      name: `${o.firstName} ${o.lastName}`,
    })),
  })
}

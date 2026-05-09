import { NextResponse } from 'next/server'
import { createOwner, listOwners } from '@/lib/dal/owners'
import { getRequestSqlServerDataSource } from '@/lib/db'

const ALLOWED_OWNER_FIELDS = new Set(['firstName', 'lastName', 'email'])

export async function GET() {
  const db = await getRequestSqlServerDataSource()
  const ownersList = await listOwners(db)
  return NextResponse.json({
    owners: ownersList.map(o => ({
      id: o.id,
      name: `${o.firstName} ${o.lastName}`,
    })),
  })
}

export async function POST(request: Request) {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const obj = raw as Record<string, unknown>
  if (Object.keys(obj).some(key => !ALLOWED_OWNER_FIELDS.has(key))) {
    return NextResponse.json({ error: 'Unknown fields' }, { status: 400 })
  }

  if (
    typeof obj.firstName !== 'string' ||
    typeof obj.lastName !== 'string' ||
    typeof obj.email !== 'string'
  ) {
    return NextResponse.json({ error: 'Invalid field types' }, { status: 400 })
  }

  const db = await getRequestSqlServerDataSource()
  const body: Parameters<typeof createOwner>[1] = {
    email: obj.email,
    firstName: obj.firstName,
    lastName: obj.lastName,
  }
  const owner = await createOwner(db, body)
  return NextResponse.json(owner, { status: 201 })
}

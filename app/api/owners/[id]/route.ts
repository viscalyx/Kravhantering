import { type NextRequest, NextResponse } from 'next/server'
import { deleteOwner, updateOwner } from '@/lib/dal/owners'
import { getRequestDatabase } from '@/lib/db'

type Params = Promise<{ id: string }>

export async function PUT(
  request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = await params
  const numericId = Number(id)
  if (!Number.isInteger(numericId) || numericId < 1) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }
  const db = await getRequestDatabase()
  const raw: unknown = await request.json()
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  const obj = raw as Record<string, unknown>
  const allowed = new Set(['firstName', 'lastName', 'email'])
  if (Object.keys(obj).some(k => !allowed.has(k))) {
    return NextResponse.json({ error: 'Unknown fields' }, { status: 400 })
  }
  if (
    ('firstName' in obj && typeof obj.firstName !== 'string') ||
    ('lastName' in obj && typeof obj.lastName !== 'string') ||
    ('email' in obj && typeof obj.email !== 'string')
  ) {
    return NextResponse.json({ error: 'Invalid field types' }, { status: 400 })
  }
  const body: { firstName?: string; lastName?: string; email?: string } = {}
  if (typeof obj.firstName === 'string') body.firstName = obj.firstName
  if (typeof obj.lastName === 'string') body.lastName = obj.lastName
  if (typeof obj.email === 'string') body.email = obj.email
  const owner = await updateOwner(db, numericId, body)
  if (!owner) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json(owner)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = await params
  const numericId = Number(id)
  if (!Number.isInteger(numericId) || numericId < 1) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }
  const db = await getRequestDatabase()
  const deleted = await deleteOwner(db, numericId)
  if (!deleted) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}

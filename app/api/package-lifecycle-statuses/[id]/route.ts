import { type NextRequest, NextResponse } from 'next/server'
import {
  deletePackageLifecycleStatus,
  updatePackageLifecycleStatus,
} from '@/lib/dal/package-lifecycle-statuses'
import { getRequestDatabase } from '@/lib/db'

type Params = Promise<{ id: string }>

function parseId(raw: string): number | null {
  const n = Number(raw)
  return Number.isFinite(n) && Number.isInteger(n) && n > 0 ? n : null
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Params },
) {
  const { id: rawId } = await params
  const id = parseId(rawId)
  if (id === null) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }
  const db = await getRequestDatabase()
  const body = (await request.json()) as Parameters<
    typeof updatePackageLifecycleStatus
  >[2]
  try {
    const status = await updatePackageLifecycleStatus(db, id, body)
    if (!status) {
      return NextResponse.json(
        { error: 'Lifecycle status not found' },
        { status: 404 },
      )
    }
    return NextResponse.json(status)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Validation error'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const { id: rawId } = await params
  const id = parseId(rawId)
  if (id === null) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }
  const db = await getRequestDatabase()
  try {
    const deletedCount = await deletePackageLifecycleStatus(db, id)
    if (deletedCount === 0) {
      return NextResponse.json(
        { error: 'Lifecycle status not found' },
        { status: 404 },
      )
    }
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json(
      { error: 'Cannot delete: lifecycle status is in use' },
      { status: 409 },
    )
  }
}

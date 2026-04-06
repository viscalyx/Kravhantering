import { getCloudflareContext } from '@opennextjs/cloudflare'
import { type NextRequest, NextResponse } from 'next/server'
import {
  deletePackageLifecycleStatus,
  updatePackageLifecycleStatus,
} from '@/lib/dal/package-lifecycle-statuses'
import { getDb } from '@/lib/db'

type Params = Promise<{ id: string }>

export async function PUT(
  request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = await params
  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)
  const body = (await request.json()) as Parameters<
    typeof updatePackageLifecycleStatus
  >[2]
  const status = await updatePackageLifecycleStatus(db, Number(id), body)
  return NextResponse.json(status)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = await params
  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)
  await deletePackageLifecycleStatus(db, Number(id))
  return NextResponse.json({ ok: true })
}

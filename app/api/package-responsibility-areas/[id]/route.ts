import { getCloudflareContext } from '@opennextjs/cloudflare'
import { type NextRequest, NextResponse } from 'next/server'
import {
  deletePackageResponsibilityArea,
  updatePackageResponsibilityArea,
} from '@/lib/dal/package-responsibility-areas'
import { getDb } from '@/lib/db'

export const runtime = 'edge'

type Params = Promise<{ id: string }>

export async function PUT(
  request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = await params
  const { env } = await getCloudflareContext()
  const db = getDb(env.DB)
  const body = (await request.json()) as Parameters<
    typeof updatePackageResponsibilityArea
  >[2]
  const area = await updatePackageResponsibilityArea(db, Number(id), body)
  return NextResponse.json(area)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = await params
  const { env } = await getCloudflareContext()
  const db = getDb(env.DB)
  await deletePackageResponsibilityArea(db, Number(id))
  return NextResponse.json({ ok: true })
}

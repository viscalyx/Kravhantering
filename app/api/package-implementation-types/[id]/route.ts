import { getCloudflareContext } from '@opennextjs/cloudflare'
import { type NextRequest, NextResponse } from 'next/server'
import {
  deletePackageImplementationType,
  updatePackageImplementationType,
} from '@/lib/dal/package-implementation-types'
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
    typeof updatePackageImplementationType
  >[2]
  const type = await updatePackageImplementationType(db, Number(id), body)
  return NextResponse.json(type)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = await params
  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)
  await deletePackageImplementationType(db, Number(id))
  return NextResponse.json({ ok: true })
}

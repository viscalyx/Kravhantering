import { getCloudflareContext } from '@opennextjs/cloudflare'
import { type NextRequest, NextResponse } from 'next/server'
import { deletePackage, updatePackage } from '@/lib/dal/requirement-packages'
import { getDb } from '@/lib/db'

type Params = Promise<{ id: string }>

export async function PUT(
  request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = await params
  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)
  const body = (await request.json()) as Parameters<typeof updatePackage>[2]
  const pkg = await updatePackage(db, Number(id), body)
  return NextResponse.json(pkg)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = await params
  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)
  await deletePackage(db, Number(id))
  return NextResponse.json({ ok: true })
}

import { getCloudflareContext } from '@opennextjs/cloudflare'
import { type NextRequest, NextResponse } from 'next/server'
import { deleteOwner, updateOwner } from '@/lib/dal/owners'
import { getDb } from '@/lib/db'

type Params = Promise<{ id: string }>

export async function PUT(
  request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = await params
  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)
  const body = (await request.json()) as Parameters<typeof updateOwner>[2]
  const owner = await updateOwner(db, Number(id), body)
  return NextResponse.json(owner)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = await params
  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)
  await deleteOwner(db, Number(id))
  return NextResponse.json({ ok: true })
}

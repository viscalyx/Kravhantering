import { getCloudflareContext } from '@opennextjs/cloudflare'
import { type NextRequest, NextResponse } from 'next/server'
import { deleteArea, updateArea } from '@/lib/dal/requirement-areas'
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
  const body = (await request.json()) as Parameters<typeof updateArea>[2]
  const area = await updateArea(db, Number(id), body)
  return NextResponse.json(area)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = await params
  const { env } = await getCloudflareContext()
  const db = getDb(env.DB)
  await deleteArea(db, Number(id))
  return NextResponse.json({ ok: true })
}

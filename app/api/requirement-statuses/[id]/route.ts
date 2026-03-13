import { getCloudflareContext } from '@opennextjs/cloudflare'
import { type NextRequest, NextResponse } from 'next/server'
import { deleteStatus, updateStatus } from '@/lib/dal/requirement-statuses'
import { getDb } from '@/lib/db'

type Params = Promise<{ id: string }>

export async function PUT(
  request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = await params
  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)
  const body = (await request.json()) as Parameters<typeof updateStatus>[2]
  const updated = await updateStatus(db, Number(id), body)
  return NextResponse.json(updated)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = await params
  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)
  try {
    await deleteStatus(db, Number(id))
    return NextResponse.json({ ok: true })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to delete status'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

import { getCloudflareContext } from '@opennextjs/cloudflare'
import { type NextRequest, NextResponse } from 'next/server'
import { updatePackageItemFields } from '@/lib/dal/requirement-packages'
import { getDb } from '@/lib/db'

type Params = Promise<{ id: string; itemId: string }>

export async function PATCH(
  request: NextRequest,
  { params }: { params: Params },
) {
  const { id, itemId } = await params
  const numericItemId = Number(itemId)
  if (!Number.isInteger(numericItemId) || numericItemId < 1) {
    return NextResponse.json({ error: 'Invalid itemId' }, { status: 400 })
  }
  const numericPackageId = Number(id)
  if (!Number.isInteger(numericPackageId) || numericPackageId < 1) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }
  const body = (await request.json()) as {
    packageItemStatusId?: number | null
    note?: string | null
  }
  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)
  await updatePackageItemFields(db, numericItemId, body)
  return NextResponse.json({ ok: true })
}

import { getCloudflareContext } from '@opennextjs/cloudflare'
import { type NextRequest, NextResponse } from 'next/server'
import {
  deleteTypeCategory,
  listTypeCategories,
  updateTypeCategory,
} from '@/lib/dal/requirement-types'
import { getDb } from '@/lib/db'

type Params = Promise<{ id: string }>

export async function PUT(
  request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = await params
  const numericId = Number(id)
  if (!Number.isFinite(numericId) || numericId < 1) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }
  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)
  const body = (await request.json()) as Parameters<
    typeof updateTypeCategory
  >[2]
  const category = await updateTypeCategory(db, numericId, body)
  if (!category) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json(category)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = await params
  const numericId = Number(id)
  if (!Number.isFinite(numericId) || numericId < 1) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }
  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)

  const allCategories = await listTypeCategories(db)
  const hasChildren = allCategories.some(c => c.parentId === numericId)
  if (hasChildren) {
    return NextResponse.json(
      { error: 'Has sub-characteristics' },
      { status: 409 },
    )
  }

  try {
    await deleteTypeCategory(db, numericId)
  } catch {
    return NextResponse.json(
      { error: 'In use by requirements' },
      { status: 409 },
    )
  }
  return NextResponse.json({ ok: true })
}

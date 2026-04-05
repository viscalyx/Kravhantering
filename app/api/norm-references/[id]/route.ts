import { getCloudflareContext } from '@opennextjs/cloudflare'
import { type NextRequest, NextResponse } from 'next/server'
import {
  countLinkedRequirements,
  deleteNormReference,
  getLinkedRequirements,
  getNormReferenceById,
  updateNormReference,
} from '@/lib/dal/norm-references'
import { getDb } from '@/lib/db'

type Params = Promise<{ id: string }>

export async function GET(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = await params
  const numericId = Number(id)
  if (!Number.isInteger(numericId) || numericId < 1) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }
  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)
  const [normReference, linkedRequirements] = await Promise.all([
    getNormReferenceById(db, numericId),
    getLinkedRequirements(db, numericId),
  ])
  if (!normReference) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json({ normReference, linkedRequirements })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = await params
  const numericId = Number(id)
  if (!Number.isInteger(numericId) || numericId < 1) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }
  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)
  const body = (await request.json()) as Parameters<
    typeof updateNormReference
  >[2]
  const normReference = await updateNormReference(db, numericId, body)
  if (!normReference) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json(normReference)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = await params
  const numericId = Number(id)
  if (!Number.isInteger(numericId) || numericId < 1) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }
  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)
  const counts = await countLinkedRequirements(db)
  if ((counts[numericId] ?? 0) > 0) {
    return NextResponse.json(
      { error: 'Cannot delete norm reference with linked requirements' },
      { status: 409 },
    )
  }
  await deleteNormReference(db, numericId)
  return NextResponse.json({ ok: true })
}

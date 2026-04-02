import { getCloudflareContext } from '@opennextjs/cloudflare'
import { type NextRequest, NextResponse } from 'next/server'
import {
  deletePackage,
  getPackageById,
  getPackageBySlug,
  isSlugTaken,
  updatePackage,
} from '@/lib/dal/requirement-packages'
import type { Database } from '@/lib/db'
import { getDb } from '@/lib/db'

type Params = Promise<{ id: string }>

async function resolvePackage(db: Database, idOrSlug: string) {
  if (/^\d+$/.test(idOrSlug)) return getPackageById(db, Number(idOrSlug))
  return getPackageBySlug(db, idOrSlug)
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = await params
  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)
  const pkg = await resolvePackage(db, id)
  if (!pkg) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(pkg)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = await params
  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)

  const pkg = await resolvePackage(db, id)
  if (!pkg) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = (await request.json()) as Parameters<typeof updatePackage>[2]

  if (body.uniqueId && (await isSlugTaken(db, body.uniqueId, pkg.id))) {
    return NextResponse.json({ error: 'slug_taken' }, { status: 409 })
  }

  const updated = await updatePackage(db, pkg.id, body)
  return NextResponse.json(updated)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = await params
  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)
  const pkg = await resolvePackage(db, id)
  if (!pkg) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await deletePackage(db, pkg.id)
  return NextResponse.json({ ok: true })
}

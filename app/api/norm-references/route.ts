import { getCloudflareContext } from '@opennextjs/cloudflare'
import { NextResponse } from 'next/server'
import {
  countLinkedRequirements,
  createNormReference,
  listNormReferences,
} from '@/lib/dal/norm-references'
import { getDb } from '@/lib/db'

export async function GET(request: Request) {
  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)
  const searchParams = new URL(request.url).searchParams
  const linkedOnly = searchParams.get('linked') === 'true'
  const statuses = searchParams
    .getAll('statuses')
    .map(Number)
    .filter(n => !Number.isNaN(n))
  const [normRefs, counts] = await Promise.all([
    listNormReferences(db),
    countLinkedRequirements(
      db,
      linkedOnly && statuses.length > 0 ? { statuses } : undefined,
    ),
  ])
  let results = normRefs.map(r => ({
    ...r,
    linkedRequirementCount: counts[r.id] ?? 0,
  }))
  if (linkedOnly) {
    results = results.filter(r => r.linkedRequirementCount > 0)
  }
  return NextResponse.json({ normReferences: results })
}

export async function POST(request: Request) {
  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)
  const body = (await request.json()) as Parameters<
    typeof createNormReference
  >[1]
  const normReference = await createNormReference(db, body)
  return NextResponse.json(normReference, { status: 201 })
}

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
  const body = (await request.json()) as Record<string, unknown>
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const type = typeof body.type === 'string' ? body.type.trim() : ''
  const reference =
    typeof body.reference === 'string' ? body.reference.trim() : ''
  const issuer = typeof body.issuer === 'string' ? body.issuer.trim() : ''
  if (!name || !type || !reference || !issuer) {
    return NextResponse.json(
      { error: 'Missing required fields: name, type, reference, issuer' },
      { status: 400 },
    )
  }
  try {
    const normReference = await createNormReference(db, {
      normReferenceId:
        typeof body.normReferenceId === 'string'
          ? body.normReferenceId
          : undefined,
      name,
      type,
      reference,
      version: typeof body.version === 'string' ? body.version || null : null,
      issuer,
      uri: typeof body.uri === 'string' ? body.uri.trim() || null : null,
    })
    return NextResponse.json(normReference, { status: 201 })
  } catch {
    return NextResponse.json(
      { error: 'Failed to create norm reference' },
      { status: 500 },
    )
  }
}

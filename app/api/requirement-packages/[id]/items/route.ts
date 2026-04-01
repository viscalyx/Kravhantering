import { getCloudflareContext } from '@opennextjs/cloudflare'
import { type NextRequest, NextResponse } from 'next/server'
import {
  getOrCreatePackageNeedsReference,
  getPackageById,
  getPackageBySlug,
  getPublishedVersionIdForRequirement,
  linkRequirementsToPackage,
  listPackageItems,
  unlinkRequirementsFromPackage,
} from '@/lib/dal/requirement-packages'
import type { Database } from '@/lib/db'
import { getDb } from '@/lib/db'

type Params = Promise<{ id: string }>

async function resolvePackageId(db: Database, idOrSlug: string) {
  if (/^\d+$/.test(idOrSlug)) {
    const pkg = await getPackageById(db, Number(idOrSlug))
    return pkg?.id ?? null
  }
  const pkg = await getPackageBySlug(db, idOrSlug)
  return pkg?.id ?? null
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = await params
  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)
  const packageId = await resolvePackageId(db, id)
  if (packageId === null)
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const items = await listPackageItems(db, packageId)
  return NextResponse.json({ items })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = await params
  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)

  const packageId = await resolvePackageId(db, id)
  if (packageId === null)
    return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = (await request.json()) as {
    requirementIds: number[]
    needsReferenceId?: number | null
    needsReferenceText?: string | null
  }
  const { requirementIds, needsReferenceId, needsReferenceText } = body

  if (!Array.isArray(requirementIds) || requirementIds.length === 0) {
    return NextResponse.json(
      { error: 'requirementIds must be a non-empty array' },
      { status: 400 },
    )
  }

  // Resolve the needs reference ID (text takes priority, creates/reuses entry)
  let resolvedNeedsReferenceId: number | null = needsReferenceId ?? null
  if (needsReferenceText?.trim()) {
    resolvedNeedsReferenceId = await getOrCreatePackageNeedsReference(
      db,
      packageId,
      needsReferenceText.trim(),
    )
  }

  // Resolve published version for each requirement; reject if any has none
  const resolvedItems: {
    requirementId: number
    requirementVersionId: number
    needsReferenceId?: number | null
  }[] = []

  for (const requirementId of requirementIds) {
    const versionId = await getPublishedVersionIdForRequirement(
      db,
      requirementId,
    )
    if (versionId === null) {
      return NextResponse.json(
        {
          error: `Requirement ${requirementId} has no published version and cannot be added to a package`,
        },
        { status: 422 },
      )
    }
    resolvedItems.push({
      requirementId,
      requirementVersionId: versionId,
      needsReferenceId: resolvedNeedsReferenceId,
    })
  }

  await linkRequirementsToPackage(db, packageId, resolvedItems)
  return NextResponse.json({ ok: true }, { status: 201 })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = await params
  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)

  const packageId = await resolvePackageId(db, id)
  if (packageId === null)
    return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = (await request.json()) as { requirementIds: number[] }
  const { requirementIds } = body

  if (!Array.isArray(requirementIds) || requirementIds.length === 0) {
    return NextResponse.json(
      { error: 'requirementIds must be a non-empty array' },
      { status: 400 },
    )
  }

  await unlinkRequirementsFromPackage(db, packageId, requirementIds)
  return NextResponse.json({ ok: true })
}

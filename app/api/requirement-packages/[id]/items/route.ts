import { getCloudflareContext } from '@opennextjs/cloudflare'
import { type NextRequest, NextResponse } from 'next/server'
import {
  getOrCreatePackageNeedsReference,
  getPackageById,
  getPackageBySlug,
  getPackageNeedsReferenceById,
  getPublishedVersionIdForRequirement,
  linkRequirementsToPackage,
  listPackageItems,
  unlinkRequirementsFromPackage,
} from '@/lib/dal/requirement-packages'
import type { Database } from '@/lib/db'
import { getDb } from '@/lib/db'

type Params = Promise<{ id: string }>

class InvalidNeedsReferenceError extends Error {}

async function resolvePackageId(db: Database, idOrSlug: string) {
  const bySlug = await getPackageBySlug(db, idOrSlug)
  if (bySlug) return bySlug.id
  if (/^\d+$/.test(idOrSlug)) {
    const byId = await getPackageById(db, Number(idOrSlug))
    return byId?.id ?? null
  }
  return null
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

  // Resolve published version for each requirement; reject if any has none
  const resolvedVersionIds: { requirementId: number; versionId: number }[] = []

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
    resolvedVersionIds.push({ requirementId, versionId })
  }

  // All items validated — now resolve/create needs reference
  try {
    await db.transaction(async tx => {
      let resolvedNeedsReferenceId: number | null = null

      if (needsReferenceText?.trim()) {
        resolvedNeedsReferenceId = await getOrCreatePackageNeedsReference(
          tx,
          packageId,
          needsReferenceText.trim(),
        )
      } else if (needsReferenceId != null) {
        const existingNeedsReference = await getPackageNeedsReferenceById(
          tx,
          packageId,
          needsReferenceId,
        )
        if (!existingNeedsReference) {
          throw new InvalidNeedsReferenceError(
            'needsReferenceId does not belong to this requirement package',
          )
        }
        resolvedNeedsReferenceId = existingNeedsReference.id
      }

      const resolvedItems = resolvedVersionIds.map(
        ({ requirementId, versionId }) => ({
          requirementId,
          requirementVersionId: versionId,
          needsReferenceId: resolvedNeedsReferenceId,
        }),
      )

      await linkRequirementsToPackage(tx, packageId, resolvedItems)
    })
  } catch (error) {
    if (error instanceof InvalidNeedsReferenceError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    throw error
  }
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

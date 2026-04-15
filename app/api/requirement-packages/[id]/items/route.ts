import { getCloudflareContext } from '@opennextjs/cloudflare'
import { type NextRequest, NextResponse } from 'next/server'
import { countDeviationsPerItemRef } from '@/lib/dal/deviations'
import {
  deletePackageItemsByRefs,
  getPackageById,
  getPackageBySlug,
  getPublishedVersionIdForRequirement,
  linkRequirementsToPackageAtomically,
  listPackageItems,
  unlinkRequirementsFromPackage,
} from '@/lib/dal/requirement-packages'
import type { Database } from '@/lib/db'
import { getDb } from '@/lib/db'
import { isRequirementsServiceError } from '@/lib/requirements/errors'

type Params = Promise<{ id: string }>

const ADD_REQUIREMENTS_ERROR = 'Failed to add requirements'

type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; response: NextResponse<{ error: string }> }

interface ParsedDeleteBody {
  itemRefs?: string[]
  requirementIds: number[]
}

interface ParsedPostBody extends ParsedDeleteBody {
  needsReferenceId?: number | null
  needsReferenceText?: string | null
}

function invalidBody(message: string): ParseResult<never> {
  return {
    ok: false,
    response: NextResponse.json({ error: message }, { status: 400 }),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseRequirementIds(
  value: unknown,
): ParseResult<ParsedDeleteBody['requirementIds']> {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some(
      requirementId =>
        !Number.isInteger(requirementId) || (requirementId as number) <= 0,
    )
  ) {
    return invalidBody(
      'requirementIds must be a non-empty array of positive integers',
    )
  }

  if (new Set(value as number[]).size !== (value as number[]).length) {
    return invalidBody(
      'requirementIds must be a non-empty array of unique positive integers',
    )
  }

  return { ok: true, value: value as number[] }
}

function parseDeleteBody(body: unknown): ParseResult<ParsedDeleteBody> {
  if (!isRecord(body)) {
    return invalidBody('Invalid request body')
  }

  if (Array.isArray(body.itemRefs)) {
    const itemRefs = body.itemRefs
    if (
      itemRefs.length === 0 ||
      itemRefs.some(
        itemRef => typeof itemRef !== 'string' || itemRef.trim().length === 0,
      ) ||
      new Set(itemRefs).size !== itemRefs.length
    ) {
      return invalidBody('itemRefs must be a non-empty array of unique strings')
    }

    return {
      ok: true,
      value: {
        itemRefs,
        requirementIds: [],
      },
    }
  }

  const requirementIds = parseRequirementIds(body.requirementIds)
  if (!requirementIds.ok) {
    return requirementIds
  }

  return {
    ok: true,
    value: {
      requirementIds: requirementIds.value,
    },
  }
}

function parsePostBody(body: unknown): ParseResult<ParsedPostBody> {
  if (!isRecord(body)) {
    return invalidBody('Invalid request body')
  }

  const requirementIds = parseRequirementIds(body.requirementIds)
  if (!requirementIds.ok) {
    return requirementIds
  }

  const needsReferenceId = Object.hasOwn(body, 'needsReferenceId')
    ? body.needsReferenceId
    : undefined
  if (
    needsReferenceId !== undefined &&
    needsReferenceId !== null &&
    (typeof needsReferenceId !== 'number' ||
      !Number.isInteger(needsReferenceId) ||
      needsReferenceId < 0)
  ) {
    return invalidBody(
      'needsReferenceId must be a non-negative integer, null, or undefined',
    )
  }

  const needsReferenceText = Object.hasOwn(body, 'needsReferenceText')
    ? body.needsReferenceText
    : undefined
  if (
    needsReferenceText !== undefined &&
    needsReferenceText !== null &&
    typeof needsReferenceText !== 'string'
  ) {
    return invalidBody(
      'needsReferenceText must be a string, null, or undefined',
    )
  }

  if (
    needsReferenceId !== undefined &&
    needsReferenceId !== null &&
    typeof needsReferenceText === 'string' &&
    needsReferenceText.trim() !== ''
  ) {
    return invalidBody(
      'Provide either needsReferenceId or needsReferenceText, not both',
    )
  }

  return {
    ok: true,
    value: {
      needsReferenceId:
        needsReferenceId === undefined
          ? undefined
          : (needsReferenceId as number | null),
      needsReferenceText:
        needsReferenceText === undefined
          ? undefined
          : (needsReferenceText as string | null),
      requirementIds: requirementIds.value,
    },
  }
}

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
  const deviationCounts = await countDeviationsPerItemRef(db, packageId)
  const enrichedItems = items.map(item => {
    const dc = item.itemRef ? deviationCounts.get(item.itemRef) : undefined
    return {
      ...item,
      deviationCount: dc?.total ?? 0,
      hasApprovedDeviation: (dc?.approved ?? 0) > 0,
      hasPendingDeviation: (dc?.pending ?? 0) > 0,
    }
  })
  return NextResponse.json({ items: enrichedItems })
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

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const parsedBody = parsePostBody(rawBody)
  if (!parsedBody.ok) {
    return parsedBody.response
  }
  const { requirementIds, needsReferenceId, needsReferenceText } =
    parsedBody.value

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

  try {
    const addedCount = await linkRequirementsToPackageAtomically(
      db,
      packageId,
      {
        items: resolvedVersionIds.map(({ requirementId, versionId }) => ({
          requirementId,
          requirementVersionId: versionId,
        })),
        needsReferenceId,
        needsReferenceText,
      },
    )
    return NextResponse.json(
      { addedCount, ok: true },
      { status: addedCount > 0 ? 201 : 200 },
    )
  } catch (error) {
    if (isRequirementsServiceError(error) && error.code === 'validation') {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    console.error('Failed to add requirements to requirement package', error)
    return NextResponse.json({ error: ADD_REQUIREMENTS_ERROR }, { status: 500 })
  }
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

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const parsedBody = parseDeleteBody(rawBody)
  if (!parsedBody.ok) {
    return parsedBody.response
  }

  if (parsedBody.value.itemRefs?.length) {
    try {
      const { deletedLibraryCount, deletedPackageLocalCount } =
        await deletePackageItemsByRefs(db, packageId, parsedBody.value.itemRefs)
      return NextResponse.json({
        deletedLibraryCount,
        deletedPackageLocalCount,
        ok: true,
        removedCount: deletedLibraryCount + deletedPackageLocalCount,
      })
    } catch (error) {
      if (isRequirementsServiceError(error) && error.code === 'validation') {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }

      console.error('Failed to delete package items by refs', error)
      return NextResponse.json(
        { error: 'Failed to remove items' },
        { status: 500 },
      )
    }
  }

  const removedCount = await unlinkRequirementsFromPackage(
    db,
    packageId,
    parsedBody.value.requirementIds,
  )
  return NextResponse.json({ ok: true, removedCount })
}

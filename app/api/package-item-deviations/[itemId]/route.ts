import { type NextRequest, NextResponse } from 'next/server'
import {
  createDeviation,
  createDeviationForItemRef,
  listDeviationsForPackageItem,
  listDeviationsForPackageLocalRequirement,
} from '@/lib/dal/deviations'
import { parsePackageItemRef } from '@/lib/dal/requirement-packages'
import { getRequestDatabase } from '@/lib/db'
import { isRequirementsServiceError } from '@/lib/requirements/errors'

type Params = Promise<{ itemId: string }>

function safeDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const { itemId } = await params
  const decodedItemId = safeDecodeURIComponent(itemId)
  if (decodedItemId == null) {
    return NextResponse.json({ error: 'Invalid itemId' }, { status: 400 })
  }
  const parsedItemRef = parsePackageItemRef(decodedItemId)
  const numericItemId =
    parsedItemRef == null && /^\d+$/.test(decodedItemId)
      ? Number(decodedItemId)
      : parsedItemRef?.kind === 'library'
        ? parsedItemRef.id
        : null
  if (parsedItemRef == null && (numericItemId == null || numericItemId < 1)) {
    return NextResponse.json({ error: 'Invalid itemId' }, { status: 400 })
  }
  const db = await getRequestDatabase()

  try {
    const deviations =
      parsedItemRef?.kind === 'packageLocal'
        ? await listDeviationsForPackageLocalRequirement(db, parsedItemRef.id)
        : await listDeviationsForPackageItem(db, numericItemId ?? 0)
    return NextResponse.json({ deviations })
  } catch (error) {
    console.error('Failed to list deviations for package item', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Params },
) {
  const { itemId } = await params
  const decodedItemId = safeDecodeURIComponent(itemId)
  if (decodedItemId == null) {
    return NextResponse.json({ error: 'Invalid itemId' }, { status: 400 })
  }
  const parsedItemRef = parsePackageItemRef(decodedItemId)
  const numericItemId =
    parsedItemRef == null && /^\d+$/.test(decodedItemId)
      ? Number(decodedItemId)
      : parsedItemRef?.kind === 'library'
        ? parsedItemRef.id
        : null
  if (parsedItemRef == null && (numericItemId == null || numericItemId < 1)) {
    return NextResponse.json({ error: 'Invalid itemId' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    typeof (body as { motivation?: unknown }).motivation !== 'string'
  ) {
    return NextResponse.json(
      { error: 'motivation (string) is required' },
      { status: 400 },
    )
  }

  const { motivation, createdBy } = body as {
    createdBy?: string
    motivation: string
  }
  const db = await getRequestDatabase()

  try {
    const result =
      parsedItemRef == null
        ? await createDeviation(db, {
            packageItemId: numericItemId ?? 0,
            motivation,
            createdBy: typeof createdBy === 'string' ? createdBy : null,
          })
        : await createDeviationForItemRef(db, {
            createdBy: typeof createdBy === 'string' ? createdBy : null,
            itemRef: decodedItemId,
            motivation,
          })
    return NextResponse.json({ id: result.id, ok: true }, { status: 201 })
  } catch (error) {
    if (isRequirementsServiceError(error)) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      )
    }
    console.error('Failed to create deviation', error)
    return NextResponse.json(
      { error: 'Failed to create deviation' },
      { status: 500 },
    )
  }
}

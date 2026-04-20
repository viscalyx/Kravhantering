import { type NextRequest, NextResponse } from 'next/server'
import {
  createSuggestion,
  listSuggestionsForRequirement,
} from '@/lib/dal/improvement-suggestions'
import { getRequestDatabaseConnection } from '@/lib/db'
import { isRequirementsServiceError } from '@/lib/requirements/errors'

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
  const db = await getRequestDatabaseConnection()

  const items = await listSuggestionsForRequirement(db, numericId)
  return NextResponse.json({ suggestions: items })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = await params
  const numericId = Number(id)
  if (!Number.isInteger(numericId) || numericId < 1) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
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
    typeof (body as { content?: unknown }).content !== 'string'
  ) {
    return NextResponse.json(
      { error: 'content (string) is required' },
      { status: 400 },
    )
  }

  const { content, createdBy, requirementVersionId } = body as {
    content: string
    createdBy?: string
    requirementVersionId?: number
  }
  const db = await getRequestDatabaseConnection()

  try {
    const result = await createSuggestion(db, {
      requirementId: numericId,
      requirementVersionId: requirementVersionId ?? null,
      content,
      createdBy: createdBy ?? null,
    })
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    if (isRequirementsServiceError(error)) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      )
    }
    console.error('Failed to create improvement suggestion', error)
    return NextResponse.json(
      { error: 'Failed to create improvement suggestion' },
      { status: 500 },
    )
  }
}

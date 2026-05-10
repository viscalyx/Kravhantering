import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  deleteSuggestion,
  getSuggestion,
  updateSuggestion,
} from '@/lib/dal/improvement-suggestions'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  businessTextSchema,
  idParamSchema,
  parseRouteParams,
  readJsonWithSchema,
} from '@/lib/http/validation'
import { isRequirementsServiceError } from '@/lib/requirements/errors'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

const suggestionUpdateSchema = z
  .object({
    content: businessTextSchema,
  })
  .strict()

export async function GET(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, idParamSchema)
  if (!parsedParams.ok) return parsedParams.response
  const { id } = parsedParams.data
  const db = await getRequestSqlServerDataSource()

  try {
    const item = await getSuggestion(db, id)
    return NextResponse.json(item)
  } catch (error) {
    if (isRequirementsServiceError(error) && error.code === 'not_found') {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    throw error
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, idParamSchema)
  if (!parsedParams.ok) return parsedParams.response
  const parsedBody = await readJsonWithSchema(request, suggestionUpdateSchema)
  if (!parsedBody.ok) return parsedBody.response
  const db = await getRequestSqlServerDataSource()

  try {
    await updateSuggestion(db, parsedParams.data.id, parsedBody.data)
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (isRequirementsServiceError(error)) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      )
    }
    console.error('Failed to update improvement suggestion', error)
    return NextResponse.json(
      { error: 'Failed to update improvement suggestion' },
      { status: 500 },
    )
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, idParamSchema)
  if (!parsedParams.ok) return parsedParams.response
  const db = await getRequestSqlServerDataSource()

  try {
    await deleteSuggestion(db, parsedParams.data.id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (isRequirementsServiceError(error)) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      )
    }
    console.error('Failed to delete improvement suggestion', error)
    return NextResponse.json(
      { error: 'Failed to delete improvement suggestion' },
      { status: 500 },
    )
  }
}

import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  createSuggestion,
  listSuggestionsForRequirement,
} from '@/lib/dal/improvement-suggestions'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { logSanitizedError } from '@/lib/http/safe-errors'
import {
  businessTextSchema,
  idParamSchema,
  nullableBusinessTextSchema,
  parseRouteParams,
  positiveIntegerSchema,
  readJsonWithSchema,
} from '@/lib/http/validation'
import { isRequirementsServiceError } from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

const createSuggestionSchema = z
  .object({
    content: businessTextSchema,
    createdBy: nullableBusinessTextSchema.optional(),
    requirementVersionId: positiveIntegerSchema.nullable().optional(),
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

  const items = await listSuggestionsForRequirement(db, id)
  return NextResponse.json({ suggestions: items })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, idParamSchema)
  if (!parsedParams.ok) return parsedParams.response
  const parsedBody = await readJsonWithSchema(request, createSuggestionSchema)
  if (!parsedBody.ok) return parsedBody.response
  const { content, createdBy, requirementVersionId } = parsedBody.data
  const db = await getRequestSqlServerDataSource()

  try {
    const result = await createSuggestion(db, {
      requirementId: parsedParams.data.id,
      requirementVersionId: requirementVersionId ?? null,
      content,
      createdBy: createdBy ?? null,
    })
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    if (isRequirementsServiceError(error)) {
      const { body, status } = toHttpErrorPayload(error)
      return NextResponse.json(body, { status })
    }
    logSanitizedError('Failed to create improvement suggestion', error)
    return NextResponse.json(
      { error: 'Failed to create improvement suggestion' },
      { status: 500 },
    )
  }
}

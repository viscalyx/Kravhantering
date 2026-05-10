import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
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
import { createRequirementsRestRuntime } from '@/lib/requirements/server'

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
  request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, idParamSchema)
  if (!parsedParams.ok) return parsedParams.response
  const { id } = parsedParams.data

  const { context, service } = await createRequirementsRestRuntime(request)
  const payload = await service.listSuggestions(context, {
    requirementId: id,
    responseFormat: 'json',
  })
  return NextResponse.json({ suggestions: payload.suggestions })
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

  try {
    const { context, service } = await createRequirementsRestRuntime(request)
    const payload = await service.manageSuggestion(context, {
      operation: 'create',
      requirementId: parsedParams.data.id,
      requirementVersionId: requirementVersionId ?? null,
      content,
      createdBy: createdBy ?? null,
      responseFormat: 'json',
    })
    return NextResponse.json(payload.result, { status: 201 })
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

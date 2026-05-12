import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  SUGGESTION_DISMISSED,
  SUGGESTION_RESOLVED,
} from '@/lib/dal/improvement-suggestions'
import { logSanitizedError } from '@/lib/http/safe-errors'
import {
  businessTextSchema,
  idParamSchema,
  parseRouteParams,
  readJsonWithSchema,
} from '@/lib/http/validation'
import { isRequirementsServiceError } from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

const resolutionBodySchema = z
  .object({
    resolution: z.union([
      z.literal(SUGGESTION_RESOLVED),
      z.literal(SUGGESTION_DISMISSED),
    ]),
    resolutionMotivation: businessTextSchema,
    resolvedBy: businessTextSchema.optional(),
  })
  .strict()

export async function POST(
  request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, idParamSchema)
  if (!parsedParams.ok) return parsedParams.response
  const parsedBody = await readJsonWithSchema(request, resolutionBodySchema)
  if (!parsedBody.ok) return parsedBody.response

  try {
    const { context, service } = await createRequirementsRestRuntime(request)
    await service.manageSuggestion(context, {
      operation:
        parsedBody.data.resolution === SUGGESTION_RESOLVED
          ? 'resolve'
          : 'dismiss',
      suggestionId: parsedParams.data.id,
      resolutionMotivation: parsedBody.data.resolutionMotivation,
      resolvedBy: parsedBody.data.resolvedBy,
      responseFormat: 'json',
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (isRequirementsServiceError(error)) {
      const { body, status } = toHttpErrorPayload(error)
      return NextResponse.json(body, { status })
    }
    logSanitizedError('Failed to record suggestion resolution', error)
    return NextResponse.json(
      { error: 'Failed to record resolution' },
      { status: 500 },
    )
  }
}

import { type NextRequest, NextResponse } from 'next/server'
import { logSanitizedError } from '@/lib/http/safe-errors'
import { idParamSchema, parseRouteParams } from '@/lib/http/validation'
import { isRequirementsServiceError } from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

export async function POST(
  request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, idParamSchema)
  if (!parsedParams.ok) return parsedParams.response

  try {
    const { context, service } = await createRequirementsRestRuntime(request)
    await service.manageSuggestion(context, {
      operation: 'revert_to_draft',
      suggestionId: parsedParams.data.id,
      responseFormat: 'json',
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (isRequirementsServiceError(error)) {
      const { body, status } = toHttpErrorPayload(error)
      return NextResponse.json(body, { status })
    }
    logSanitizedError('Failed to revert suggestion to draft', error)
    return NextResponse.json(
      { error: 'Failed to revert to draft' },
      { status: 500 },
    )
  }
}

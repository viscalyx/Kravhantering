import { NextResponse } from 'next/server'
import { logSanitizedError } from '@/lib/http/safe-errors'
import {
  requirementsMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { idParamSchema } from '@/lib/http/validation'
import { isRequirementsServiceError } from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'

export const dynamic = 'force-dynamic'

export const POST = secureMutationRoute({
  paramsSchema: idParamSchema,
  policy: requirementsMutationPolicy<unknown, { id: number }>(({ params }) => ({
    kind: 'manage_suggestion',
    operation: 'revert_to_draft',
    suggestionId: params.id,
  })),
  handler: async ({ context, params, request }) => {
    try {
      const { service } = await createRequirementsRestRuntime(request, {
        context,
      })
      await service.manageSuggestion(context, {
        operation: 'revert_to_draft',
        suggestionId: params.id,
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
  },
})

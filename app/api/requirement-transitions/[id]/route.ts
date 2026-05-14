import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  requirementsMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import {
  positiveIntegerSchema,
  refOrPositiveIntegerSegmentSchema,
} from '@/lib/http/validation'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'
import { toHttpErrorPayload } from '@/lib/requirements/service'
import { parseRequirementRef } from '../../requirements/parse-requirement-ref'

export const dynamic = 'force-dynamic'

const requirementRefParamsSchema = z
  .object({
    id: refOrPositiveIntegerSegmentSchema,
  })
  .strict()

const transitionBodySchema = z
  .object({
    statusId: positiveIntegerSchema,
  })
  .strict()

export const POST = secureMutationRoute({
  bodySchema: transitionBodySchema,
  paramsSchema: requirementRefParamsSchema,
  policy: requirementsMutationPolicy<
    z.infer<typeof transitionBodySchema>,
    z.infer<typeof requirementRefParamsSchema>
  >(({ body, params }) => ({
    ...parseRequirementRef(params.id),
    kind: 'transition_requirement',
    toStatusId: body.statusId,
  })),
  handler: async ({ body, context, params, request }) => {
    try {
      const { service } = await createRequirementsRestRuntime(request, {
        context,
      })
      const { id } = params
      const { statusId } = body
      const ref = parseRequirementRef(id)
      const result = await service.transitionRequirement(context, {
        ...ref,
        responseFormat: 'json',
        toStatusId: statusId,
      })
      return NextResponse.json({
        id: result.detail.id,
        uniqueId: result.detail.uniqueId,
        version: result.version,
      })
    } catch (error) {
      const { body: errorBody, status } = toHttpErrorPayload(error)
      return NextResponse.json(errorBody, { status })
    }
  },
})

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
import { parseRequirementRef } from '../../parse-requirement-ref'

export const dynamic = 'force-dynamic'

const requirementRefParamsSchema = z
  .object({
    id: refOrPositiveIntegerSegmentSchema,
  })
  .strict()

const restoreBodySchema = z
  .object({
    versionNumber: positiveIntegerSchema,
  })
  .strict()

export const POST = secureMutationRoute({
  bodySchema: restoreBodySchema,
  paramsSchema: requirementRefParamsSchema,
  policy: requirementsMutationPolicy<
    z.infer<typeof restoreBodySchema>,
    z.infer<typeof requirementRefParamsSchema>
  >(({ params }) => ({
    ...parseRequirementRef(params.id),
    kind: 'manage_requirement',
    operation: 'restore_version',
  })),
  handler: async ({ body, context, params, request }) => {
    try {
      const { service } = await createRequirementsRestRuntime(request, {
        context,
      })
      const { id } = params
      const { versionNumber } = body
      const ref = parseRequirementRef(id)
      const result = await service.manageRequirement(context, {
        ...ref,
        operation: 'restore_version',
        versionNumber,
      })
      return NextResponse.json({ ok: true, version: result.result })
    } catch (error) {
      const { body: errorBody, status } = toHttpErrorPayload(error)
      return NextResponse.json(errorBody, { status })
    }
  },
})

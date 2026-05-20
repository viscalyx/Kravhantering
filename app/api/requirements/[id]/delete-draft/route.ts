import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  requirementsMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { refOrPositiveIntegerSegmentSchema } from '@/lib/http/validation'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'
import { toHttpErrorPayload } from '@/lib/requirements/service'
import { parseRequirementRef } from '../../parse-requirement-ref'

export const dynamic = 'force-dynamic'

const requirementRefParamsSchema = z
  .object({
    id: refOrPositiveIntegerSegmentSchema,
  })
  .strict()

const deleteDraftResultSchema = z
  .object({
    deleted: z.enum(['requirement', 'version']),
  })
  .loose()

export const POST = secureMutationRoute({
  paramsSchema: requirementRefParamsSchema,
  policy: requirementsMutationPolicy<
    unknown,
    z.infer<typeof requirementRefParamsSchema>
  >(({ params }) => ({
    ...parseRequirementRef(params.id),
    kind: 'manage_requirement',
    operation: 'delete_draft',
  })),
  handler: async ({ context, params, request }) => {
    try {
      const { service } = await createRequirementsRestRuntime(request, {
        context,
      })
      const { id } = params
      const ref = parseRequirementRef(id)
      const result = await service.manageRequirement(context, {
        ...ref,
        operation: 'delete_draft',
      })
      const deleteResult = deleteDraftResultSchema.parse(result.result)
      return NextResponse.json({ deleted: deleteResult.deleted })
    } catch (error) {
      const { body, status } = toHttpErrorPayload(error)
      return NextResponse.json(body, { status })
    }
  },
})

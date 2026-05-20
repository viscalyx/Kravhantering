import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  requirementsMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { refOrPositiveIntegerSegmentSchema } from '@/lib/http/validation'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'
import { toHttpErrorPayload } from '@/lib/requirements/service'
import type { DeleteDraftResult } from '@/lib/requirements/types'
import { parseRequirementRef } from '../../parse-requirement-ref'

export const dynamic = 'force-dynamic'

const requirementRefParamsSchema = z
  .object({
    id: refOrPositiveIntegerSegmentSchema,
  })
  .strict()

const deletedDraftRequirementVersionSchema = z
  .object({
    type: z.literal('draftRequirementVersion'),
    requirementUniqueId: z.string(),
    versionNumber: z.number().int().positive(),
  })
  .strict()

const deletedRequirementSchema = z
  .object({
    type: z.literal('requirement'),
    requirementUniqueId: z.string(),
  })
  .strict()

const deleteDraftResultSchema = z
  .object({
    deleted: z
      .array(
        z.discriminatedUnion('type', [
          deletedDraftRequirementVersionSchema,
          deletedRequirementSchema,
        ]),
      )
      .min(1)
      .max(2),
  })
  .strict()

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
      const deleteResult: DeleteDraftResult = deleteDraftResultSchema.parse(
        result.result,
      )
      return NextResponse.json(deleteResult)
    } catch (error) {
      const { body, status } = toHttpErrorPayload(error)
      return NextResponse.json(body, { status })
    }
  },
})

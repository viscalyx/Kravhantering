import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  customMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import {
  idParamSchema,
  positiveIntegerSchema,
  positiveIntegerStringSchema,
} from '@/lib/http/validation'
import { requireHumanActorSnapshot } from '@/lib/requirements/auth'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'

export const dynamic = 'force-dynamic'

const graduateParamSchema = z
  .object({
    id: idParamSchema.shape.id,
    localRequirementId: positiveIntegerStringSchema,
  })
  .strict()

const graduateBodySchema = z
  .object({
    requirementAreaId: positiveIntegerSchema,
  })
  .strict()

export const POST = secureMutationRoute({
  bodySchema: graduateBodySchema,
  paramsSchema: graduateParamSchema,
  policy: customMutationPolicy(
    'specification_local_requirement.graduate',
    ({ context }) => {
      requireHumanActorSnapshot(context)
    },
  ),
  handler: async ({ body, context, params, request }) => {
    const { service } = await createRequirementsRestRuntime(request, {
      context,
    })
    const payload = await service.graduateSpecificationLocalRequirement(
      context,
      {
        localRequirementId: params.localRequirementId,
        requirementAreaId: body.requirementAreaId,
        responseFormat: 'json',
        specificationId: params.id,
      },
    )

    return NextResponse.json(
      {
        detail: payload.detail,
        newRequirementId: payload.detail.id,
        newRequirementUniqueId: payload.detail.uniqueId,
        newRequirementVersionNumber: payload.result.version.versionNumber,
        ok: true,
        requirementResourceUri: payload.requirementResourceUri,
        requirementViewUri: payload.requirementViewUri,
      },
      { status: 201 },
    )
  },
})

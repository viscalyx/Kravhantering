import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  createSpecificationLocalRequirement,
  getSpecificationById,
} from '@/lib/dal/requirements-specifications'
import { logSanitizedError } from '@/lib/http/safe-errors'
import {
  requirementsMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { specificationLocalRequirementSchema } from '@/lib/http/specification-local-requirement-validation'
import { idParamSchema } from '@/lib/http/validation'
import { isRequirementsServiceError } from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'

export const dynamic = 'force-dynamic'

const specificationParamSchema = z
  .object({
    id: idParamSchema.shape.id,
  })
  .strict()

export const POST = secureMutationRoute({
  bodySchema: specificationLocalRequirementSchema,
  paramsSchema: specificationParamSchema,
  policy: requirementsMutationPolicy<
    z.infer<typeof specificationLocalRequirementSchema>,
    z.infer<typeof specificationParamSchema>
  >(({ params }) => ({
    kind: 'manage_specification_local_requirement',
    operation: 'create',
    specificationId: params.id,
  })),
  handler: async ({ body, db, params }) => {
    const { id } = params
    if (!db) {
      throw new Error('Missing authorized database context')
    }

    const specification = await getSpecificationById(db, id)
    if (!specification) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    try {
      const localRequirement = await createSpecificationLocalRequirement(
        db,
        specification.id,
        {
          acceptanceCriteria: body.acceptanceCriteria ?? null,
          description: body.description,
          needsReferenceId: body.needsReferenceId ?? null,
          normReferenceIds: body.normReferenceIds,
          qualityCharacteristicId: body.qualityCharacteristicId ?? null,
          requirementCategoryId: body.requirementCategoryId ?? null,
          requirementTypeId: body.requirementTypeId ?? null,
          verifiable: body.verifiable,
          priorityLevelId: body.priorityLevelId ?? null,
          verificationMethod: body.verificationMethod ?? null,
        },
      )

      return NextResponse.json({ localRequirement, ok: true }, { status: 201 })
    } catch (error) {
      if (isRequirementsServiceError(error)) {
        const { body, status } = toHttpErrorPayload(error)
        return NextResponse.json(body, { status })
      }

      logSanitizedError(
        'Failed to create specification-local requirement',
        error,
      )
      return NextResponse.json(
        { error: 'Failed to create specification-local requirement' },
        { status: 500 },
      )
    }
  },
})

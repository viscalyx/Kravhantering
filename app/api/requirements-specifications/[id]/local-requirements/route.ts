import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  createSpecificationLocalRequirement,
  getSpecificationById,
  getSpecificationBySlug,
} from '@/lib/dal/requirements-specifications'
import type { SqlServerDatabase } from '@/lib/db'
import { logSanitizedError } from '@/lib/http/safe-errors'
import {
  requirementsMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { specificationLocalRequirementSchema } from '@/lib/http/specification-local-requirement-validation'
import { specificationIdOrSlugSchema } from '@/lib/http/validation'
import { isRequirementsServiceError } from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'

export const dynamic = 'force-dynamic'

const specificationParamSchema = z
  .object({
    id: specificationIdOrSlugSchema,
  })
  .strict()

async function resolveSpecificationId(
  db: SqlServerDatabase,
  idOrSlug: string,
): Promise<number | null> {
  if (/^\d+$/.test(idOrSlug)) {
    return (await getSpecificationById(db, Number(idOrSlug)))?.id ?? null
  }

  return (await getSpecificationBySlug(db, idOrSlug))?.id ?? null
}

export const POST = secureMutationRoute({
  bodySchema: specificationLocalRequirementSchema,
  paramsSchema: specificationParamSchema,
  policy: requirementsMutationPolicy<
    z.infer<typeof specificationLocalRequirementSchema>,
    z.infer<typeof specificationParamSchema>
  >(({ params }) => ({
    kind: 'manage_specification_local_requirement',
    operation: 'create',
    specificationSlug: /^\d+$/.test(params.id) ? undefined : params.id,
    specificationId: /^\d+$/.test(params.id) ? Number(params.id) : undefined,
  })),
  handler: async ({ body, db, params }) => {
    const { id } = params
    if (!db) {
      throw new Error('Missing authorized database context')
    }

    const specificationId = await resolveSpecificationId(db, id)
    if (specificationId === null) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    try {
      const localRequirement = await createSpecificationLocalRequirement(
        db,
        specificationId,
        {
          acceptanceCriteria: body.acceptanceCriteria ?? null,
          description: body.description,
          needsReferenceId: body.needsReferenceId ?? null,
          normReferenceIds: body.normReferenceIds,
          qualityCharacteristicId: body.qualityCharacteristicId ?? null,
          requirementCategoryId: body.requirementCategoryId ?? null,
          requirementPackageIds: body.requirementPackageIds,
          requirementTypeId: body.requirementTypeId ?? null,
          requiresTesting: body.requiresTesting,
          riskLevelId: body.riskLevelId ?? null,
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

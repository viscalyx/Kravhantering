import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  createSpecificationLocalRequirement,
  getSpecificationById,
  getSpecificationBySlug,
} from '@/lib/dal/requirements-specifications'
import type { SqlServerDatabase } from '@/lib/db'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { logSanitizedError } from '@/lib/http/safe-errors'
import {
  customMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import {
  ARRAY_INPUT_MAX_ITEMS,
  businessTextSchema,
  nullableBusinessTextSchema,
  positiveIntegerSchema,
  specificationIdOrSlugSchema,
} from '@/lib/http/validation'
import { isRequirementsServiceError } from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'

export const dynamic = 'force-dynamic'

const specificationParamSchema = z
  .object({
    id: specificationIdOrSlugSchema,
  })
  .strict()

const uniquePositiveIntegerArrayFieldSchema = z
  .array(positiveIntegerSchema)
  .max(ARRAY_INPUT_MAX_ITEMS)
  .refine(values => new Set(values).size === values.length, {
    message: 'Expected unique positive integers',
  })

const specificationLocalRequirementSchema = z
  .object({
    acceptanceCriteria: nullableBusinessTextSchema.optional(),
    description: businessTextSchema,
    needsReferenceId: positiveIntegerSchema.nullable().optional(),
    normReferenceIds: uniquePositiveIntegerArrayFieldSchema
      .optional()
      .default([]),
    qualityCharacteristicId: positiveIntegerSchema.nullable().optional(),
    requirementAreaId: positiveIntegerSchema.nullable().optional(),
    requirementCategoryId: positiveIntegerSchema.nullable().optional(),
    requirementPackageIds: uniquePositiveIntegerArrayFieldSchema
      .optional()
      .default([]),
    requirementTypeId: positiveIntegerSchema.nullable().optional(),
    requiresTesting: z.boolean().optional().default(false),
    riskLevelId: positiveIntegerSchema.nullable().optional(),
    verificationMethod: nullableBusinessTextSchema.optional(),
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
  policy: customMutationPolicy(
    'specification_local_requirement.create',
    () => {},
  ),
  handler: async ({ body, params }) => {
    const { id } = params
    const db = await getRequestSqlServerDataSource()

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
          requirementAreaId: body.requirementAreaId ?? null,
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

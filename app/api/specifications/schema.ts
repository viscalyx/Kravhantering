import { type RefinementCtx, z } from 'zod'
import { HSA_ID_MAX_LENGTH, isHsaId } from '@/lib/auth/hsa-id'
import {
  boundedDbStringSchema,
  nullableBusinessTextSchema,
  positiveIntegerSchema,
} from '@/lib/http/validation'
import {
  normalizeResponsibleHsaId,
  normalizeSpecificationResponsiblePersonInput,
  type SpecificationResponsiblePersonInput,
} from '@/lib/specifications/responsible-person'

const optionalNullableResponsibleHsaIdSchema = z.preprocess(
  value => (typeof value === 'string' && value.trim() === '' ? null : value),
  z
    .string()
    .trim()
    .max(HSA_ID_MAX_LENGTH)
    .refine(isHsaId, {
      message:
        'Expected HSA-ID format <two-letter country code><10-digit org no>-<alphanumeric suffix>',
    })
    .nullable()
    .optional(),
)

const optionalNullableResponsibleDisplayNameSchema = z.preprocess(
  value => (typeof value === 'string' && value.trim() === '' ? null : value),
  nullableBusinessTextSchema.optional(),
)

export const specificationSlugSchema = boundedDbStringSchema
  .regex(/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/, {
    message:
      'Expected uppercase letters, digits, and single hyphens between segments',
  })
  .refine(value => !/^\d+$/.test(value), {
    message: 'Expected a non-numeric specification slug',
  })

function hasResponsibleField(input: object) {
  return (
    Object.hasOwn(input, 'responsibleHsaId') ||
    Object.hasOwn(input, 'responsibleDisplayName')
  )
}

function validateResponsiblePerson(
  data: SpecificationResponsiblePersonInput,
  ctx: RefinementCtx,
) {
  const hsaId = normalizeResponsibleHsaId(data.responsibleHsaId)

  if (data.canResponsibleGenerateAi === true && hsaId == null) {
    ctx.addIssue({
      code: 'custom',
      message: 'Specification lead HSA-ID is required for AI permission',
      path: hasResponsibleField(data)
        ? ['responsibleHsaId']
        : ['canResponsibleGenerateAi'],
    })
  }
}

export const createSpecificationSchema = z
  .object({
    businessNeedsReference: nullableBusinessTextSchema.optional(),
    canResponsibleGenerateAi: z.boolean().optional(),
    name: boundedDbStringSchema,
    responsibleDisplayName: optionalNullableResponsibleDisplayNameSchema,
    responsibleHsaId: optionalNullableResponsibleHsaIdSchema,
    specificationImplementationTypeId: positiveIntegerSchema
      .nullable()
      .optional(),
    specificationLifecycleStatusId: positiveIntegerSchema.nullable().optional(),
    specificationGovernanceObjectTypeId: positiveIntegerSchema
      .nullable()
      .optional(),
    uniqueId: specificationSlugSchema,
  })
  .strict()
  .superRefine(validateResponsiblePerson)
  .transform(data => normalizeSpecificationResponsiblePersonInput(data))

export const updateSpecificationSchema = z
  .object({
    businessNeedsReference: nullableBusinessTextSchema.optional(),
    canResponsibleGenerateAi: z.boolean().optional(),
    name: boundedDbStringSchema.optional(),
    responsibleDisplayName: optionalNullableResponsibleDisplayNameSchema,
    responsibleHsaId: optionalNullableResponsibleHsaIdSchema,
    specificationImplementationTypeId: positiveIntegerSchema
      .nullable()
      .optional(),
    specificationLifecycleStatusId: positiveIntegerSchema.nullable().optional(),
    specificationGovernanceObjectTypeId: positiveIntegerSchema
      .nullable()
      .optional(),
    uniqueId: specificationSlugSchema.optional(),
  })
  .strict()
  .superRefine(validateResponsiblePerson)
  .transform(data =>
    normalizeSpecificationResponsiblePersonInput(data, {
      preserveOmittedFields: true,
    }),
  )

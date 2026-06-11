import { z } from 'zod'
import { HSA_ID_MAX_LENGTH, isHsaId } from '@/lib/auth/hsa-id'
import {
  boundedDbStringSchema,
  nullableBusinessTextSchema,
  positiveIntegerSchema,
} from '@/lib/http/validation'
import { normalizeSpecificationResponsiblePersonInput } from '@/lib/specifications/responsible-person'

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

export const createSpecificationSchema = z
  .object({
    businessNeedsReference: nullableBusinessTextSchema.optional(),
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
  .transform(data => normalizeSpecificationResponsiblePersonInput(data))

export const updateSpecificationSchema = z
  .object({
    businessNeedsReference: nullableBusinessTextSchema.optional(),
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
  .transform(data =>
    normalizeSpecificationResponsiblePersonInput(data, {
      preserveOmittedFields: true,
    }),
  )

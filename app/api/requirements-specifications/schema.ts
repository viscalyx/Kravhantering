import { z } from 'zod'
import { HSA_ID_MAX_LENGTH, isHsaId } from '@/lib/auth/hsa-id'
import {
  boundedDbStringSchema,
  nullableBusinessTextSchema,
  positiveIntegerSchema,
} from '@/lib/http/validation'

const responsibleHsaIdSchema = z
  .string()
  .trim()
  .max(HSA_ID_MAX_LENGTH)
  .refine(isHsaId, {
    message:
      'Expected HSA-id format <two-letter country code><10-digit org no>-<alphanumeric suffix>',
  })

const optionalNullableResponsibleHsaIdSchema = z.preprocess(
  value => (typeof value === 'string' && value.trim() === '' ? null : value),
  responsibleHsaIdSchema.nullable().optional(),
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
    specificationImplementationTypeId: positiveIntegerSchema
      .nullable()
      .optional(),
    specificationLifecycleStatusId: positiveIntegerSchema,
    specificationGovernanceObjectTypeId: positiveIntegerSchema
      .nullable()
      .optional(),
    responsibleHsaId: optionalNullableResponsibleHsaIdSchema,
    uniqueId: specificationSlugSchema,
  })
  .strict()

export const updateSpecificationSchema = z
  .object({
    businessNeedsReference: nullableBusinessTextSchema.optional(),
    name: boundedDbStringSchema.optional(),
    specificationImplementationTypeId: positiveIntegerSchema
      .nullable()
      .optional(),
    specificationLifecycleStatusId: positiveIntegerSchema.optional(),
    specificationGovernanceObjectTypeId: positiveIntegerSchema
      .nullable()
      .optional(),
    uniqueId: specificationSlugSchema.optional(),
  })
  .strict()

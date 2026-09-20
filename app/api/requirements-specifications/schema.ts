import { z } from 'zod'
import { HSA_ID_MAX_LENGTH, isHsaId } from '@/lib/auth/hsa-id'
import {
  boundedDbStringSchema,
  positiveIntegerSchema,
} from '@/lib/http/validation'

import {
  SPECIFICATION_DESCRIPTION_MAX_LENGTH,
  SPECIFICATION_NAME_MAX_LENGTH,
} from '@/lib/specifications/text-limits'

const specificationNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(SPECIFICATION_NAME_MAX_LENGTH)
const specificationDescriptionSchema = z
  .string()
  .trim()
  .max(SPECIFICATION_DESCRIPTION_MAX_LENGTH)
  .nullable()

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

export const specificationCodeSchema = boundedDbStringSchema
  .regex(/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/, {
    message:
      'Expected uppercase letters, digits, and single hyphens between segments',
  })
  .refine(value => !/^\d+$/.test(value), {
    message: 'Expected a non-numeric specification code',
  })

export const createSpecificationSchema = z
  .object({
    businessNeedsReference: specificationDescriptionSchema.optional(),
    name: specificationNameSchema,
    specificationImplementationTypeId: positiveIntegerSchema
      .nullable()
      .optional(),
    specificationLifecycleStatusId: positiveIntegerSchema,
    specificationGovernanceObjectTypeId: positiveIntegerSchema
      .nullable()
      .optional(),
    responsibleHsaId: optionalNullableResponsibleHsaIdSchema,
    specificationCode: specificationCodeSchema,
  })
  .strict()

export const updateSpecificationSchema = z
  .object({
    businessNeedsReference: specificationDescriptionSchema.optional(),
    name: specificationNameSchema.optional(),
    specificationImplementationTypeId: positiveIntegerSchema
      .nullable()
      .optional(),
    specificationLifecycleStatusId: positiveIntegerSchema.optional(),
    specificationGovernanceObjectTypeId: positiveIntegerSchema
      .nullable()
      .optional(),
    specificationCode: specificationCodeSchema.optional(),
  })
  .strict()

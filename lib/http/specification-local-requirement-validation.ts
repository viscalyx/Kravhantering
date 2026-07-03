import { z } from 'zod'
import {
  ARRAY_INPUT_MAX_ITEMS,
  businessTextSchema,
  nullableBusinessTextSchema,
  positiveIntegerSchema,
} from '@/lib/http/validation'

export const uniquePositiveIntegerArrayFieldSchema = z
  .array(positiveIntegerSchema)
  .max(ARRAY_INPUT_MAX_ITEMS)
  .refine(values => new Set(values).size === values.length, {
    message: 'Expected unique positive integers',
  })

export const specificationLocalRequirementSchema = z
  .object({
    acceptanceCriteria: nullableBusinessTextSchema.optional(),
    description: businessTextSchema,
    needsReferenceId: positiveIntegerSchema.nullable().optional(),
    normReferenceIds: uniquePositiveIntegerArrayFieldSchema
      .optional()
      .default([]),
    qualityCharacteristicId: positiveIntegerSchema.nullable().optional(),
    requirementCategoryId: positiveIntegerSchema.nullable().optional(),
    requirementTypeId: positiveIntegerSchema.nullable().optional(),
    verifiable: z.boolean().optional(),
    priorityLevelId: positiveIntegerSchema.nullable().optional(),
    verificationMethod: nullableBusinessTextSchema.optional(),
  })
  .strict()

import { z } from 'zod'
import {
  boundedDbStringSchema,
  nonNegativeIntegerSchema,
  optionalBusinessTextSchema,
  positiveIntegerSchema,
  refOrPositiveIntegerSegmentSchema,
} from '@/lib/http/validation'

export const selectionTypeSchema = z.enum(['single', 'multiple'])

export const questionCreateSchema = z
  .object({
    areaId: positiveIntegerSchema,
    helpText: optionalBusinessTextSchema,
    selectionType: selectionTypeSchema,
    sortOrder: nonNegativeIntegerSchema.optional(),
    text: boundedDbStringSchema,
  })
  .strict()

export const questionUpdateSchema = z
  .object({
    helpText: optionalBusinessTextSchema,
    selectionType: selectionTypeSchema.optional(),
    sortOrder: nonNegativeIntegerSchema.optional(),
    text: boundedDbStringSchema.optional(),
  })
  .strict()

export const visibilityUpdateSchema = z
  .object({
    groups: z
      .array(
        z
          .object({
            conditions: z
              .array(
                z
                  .object({
                    answerIds: z.array(positiveIntegerSchema).min(1).max(200),
                    parentQuestionId: positiveIntegerSchema,
                  })
                  .strict(),
              )
              .min(1)
              .max(50),
          })
          .strict(),
      )
      .max(50),
  })
  .strict()

export const answerSchema = z
  .object({
    description: optionalBusinessTextSchema,
    isNoRequirementSelection: z.boolean().optional(),
    packageIds: z.array(positiveIntegerSchema).max(200).optional(),
    requirementIds: z.array(positiveIntegerSchema).max(200).optional(),
    sortOrder: nonNegativeIntegerSchema.optional(),
    text: boundedDbStringSchema,
  })
  .strict()

export const answerUpdateSchema = z
  .object({
    description: optionalBusinessTextSchema,
    isNoRequirementSelection: z.boolean().optional(),
    packageIds: z.array(positiveIntegerSchema).max(200).optional(),
    requirementIds: z.array(positiveIntegerSchema).max(200).optional(),
    sortOrder: nonNegativeIntegerSchema.optional(),
    text: boundedDbStringSchema.optional(),
  })
  .strict()

export const answerRouteParamsSchema = z
  .object({
    answerId: z
      .string()
      .trim()
      .regex(/^[1-9]\d*$/, 'Expected a positive integer')
      .transform(value => Number(value))
      .pipe(positiveIntegerSchema),
    id: refOrPositiveIntegerSegmentSchema,
  })
  .strict()

export const questionRouteParamsSchema = z
  .object({
    id: refOrPositiveIntegerSegmentSchema,
  })
  .strict()

import { z } from 'zod'
import {
  boundedDbStringSchema,
  businessTextSchema,
  localeSchema,
  nonNegativeIntegerSchema,
  optionalBusinessTextSchema,
  positiveIntegerSchema,
  positiveIntegerStringSchema,
  queryBooleanSchema,
  specificationIdOrSlugSchema,
} from '@/lib/http/validation'

const idArraySchema = z.array(positiveIntegerSchema).max(200).optional()

export const rfiQuestionCreateSchema = z
  .object({
    areaId: positiveIntegerSchema,
    expectedAnswerFormat: optionalBusinessTextSchema,
    helpText: optionalBusinessTextSchema,
    questionText: businessTextSchema,
    requirementIds: idArraySchema,
    requirementPackageIds: idArraySchema,
    requirementSelectionQuestionIds: idArraySchema,
    sortOrder: nonNegativeIntegerSchema.optional(),
  })
  .strict()

export const rfiQuestionUpdateSchema = z
  .object({
    expectedAnswerFormat: optionalBusinessTextSchema,
    helpText: optionalBusinessTextSchema,
    questionText: businessTextSchema.optional(),
    requirementIds: idArraySchema,
    requirementPackageIds: idArraySchema,
    requirementSelectionQuestionIds: idArraySchema,
    sortOrder: nonNegativeIntegerSchema.optional(),
  })
  .strict()

export const rfiQuestionQuerySchema = z
  .object({
    areaId: positiveIntegerStringSchema.optional(),
    includeArchived: queryBooleanSchema.optional().default(false),
  })
  .strict()

export const rfiQuestionParamsSchema = z
  .object({
    id: positiveIntegerStringSchema,
  })
  .strict()

export const rfiListItemUpdateSchema = z
  .object({
    isIncluded: z.boolean().optional(),
    relevance: z.enum(['relevant', 'not_relevant']).nullable().optional(),
  })
  .strict()

export const specificationRfiListParamsSchema = z
  .object({
    id: specificationIdOrSlugSchema,
  })
  .strict()

export const specificationRfiListItemParamsSchema = z
  .object({
    id: specificationIdOrSlugSchema,
    questionId: positiveIntegerStringSchema,
  })
  .strict()

export const rfiListExportQuerySchema = z
  .object({
    format: z.enum(['csv', 'pdf']).default('csv'),
    locale: localeSchema.optional().default('en'),
  })
  .strict()

export const rfiQuestionSuggestionCreateSchema = z
  .object({
    areaId: positiveIntegerSchema,
    content: businessTextSchema,
    rfiQuestionId: positiveIntegerSchema.nullable().optional(),
    specificationId: positiveIntegerSchema.optional(),
    specificationSlug: boundedDbStringSchema.optional(),
  })
  .strict()
  .refine(
    value =>
      value.specificationId === undefined ||
      value.specificationSlug === undefined,
    {
      message: 'Use either specificationId or specificationSlug',
      path: ['specificationId'],
    },
  )

export const rfiQuestionSuggestionQuerySchema = z
  .object({
    areaId: positiveIntegerStringSchema.optional(),
    specificationId: positiveIntegerStringSchema.optional(),
  })
  .strict()

export const rfiQuestionSuggestionParamsSchema = z
  .object({
    id: positiveIntegerStringSchema,
  })
  .strict()

export const rfiQuestionSuggestionResolutionSchema = z
  .object({
    resolution: z.enum(['resolved', 'dismissed']),
    resolutionMotivation: businessTextSchema,
  })
  .strict()

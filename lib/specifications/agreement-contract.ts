import { z } from 'zod'
import { positiveIntegerSchema } from '@/lib/http/validation'

const reason = z.string().trim().min(1).max(10000)
const agreementReference = z.string().trim().min(1).max(450)
const effectiveDate = z.iso.date()
const itemRef = z.string().regex(/^(lib|local):[1-9]\d*$/)
const targetVersionId = positiveIntegerSchema
const localContent = z
  .object({
    description: z.string().trim().min(1).max(100000),
    acceptanceCriteria: z.string().max(100000).nullable().optional(),
    verificationMethod: z.string().max(100000).nullable().optional(),
    verifiable: z.boolean().optional(),
    requirementCategoryId: positiveIntegerSchema.nullable().optional(),
    requirementTypeId: positiveIntegerSchema.nullable().optional(),
    qualityCharacteristicId: positiveIntegerSchema.nullable().optional(),
    priorityLevelId: positiveIntegerSchema.nullable().optional(),
    needsReferenceId: positiveIntegerSchema.nullable().optional(),
    normReferenceIds: z.array(positiveIntegerSchema).max(100).optional(),
  })
  .strict()

export const agreementMutationSchema = z.discriminatedUnion('operation', [
  z
    .object({
      operation: z.literal('end'),
      agreementId: positiveIntegerSchema,
      endDate: effectiveDate,
      reason,
    })
    .strict(),
  z
    .object({
      operation: z.literal('cancel'),
      agreementId: positiveIntegerSchema,
      reason,
    })
    .strict(),
  z
    .object({
      operation: z.literal('discard'),
      agreementId: positiveIntegerSchema,
    })
    .strict(),
  z
    .object({
      operation: z.literal('correct'),
      agreementId: positiveIntegerSchema,
      agreementReference,
      effectiveDate,
      description: z.string().trim().max(10000).optional(),
      confirmImmediateActivation: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      operation: z.literal('add_library'),
      agreementId: positiveIntegerSchema,
      targetVersionId,
    })
    .strict(),
  z
    .object({
      operation: z.literal('add_local'),
      agreementId: positiveIntegerSchema,
      content: localContent,
    })
    .strict(),
  z
    .object({
      operation: z.literal('undo_requirement'),
      agreementId: positiveIntegerSchema,
      itemRef,
      authorizeDeviationEndings: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      operation: z.literal('remove_requirement'),
      agreementId: positiveIntegerSchema,
      itemRef,
      authorizeDeviationEndings: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      operation: z.literal('save_requirement'),
      agreementId: positiveIntegerSchema,
      itemRef,
      content: localContent,
      authorizeDeviationEndings: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      operation: z.literal('confirm'),
      agreementId: positiveIntegerSchema,
      authorizeDeviationEndings: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      operation: z.literal('create_draft'),
      agreementReference,
      effectiveDate,
      description: z.string().trim().max(10000).optional(),
    })
    .strict(),
  z
    .object({
      operation: z.literal('establish'),
      description: z.string().trim().max(10000).optional(),
      agreementReference,
      effectiveDate,
    })
    .strict(),
  z
    .object({
      operation: z.literal('adopt'),
      itemRef,
      targetVersionId,
      agreementId: positiveIntegerSchema.optional(),
      authorizeDeviationEndings: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      operation: z.literal('cancel_deviation'),
      agreementId: positiveIntegerSchema.optional(),
      itemRef,
      deviationId: positiveIntegerSchema,
      reason,
    })
    .strict(),
])

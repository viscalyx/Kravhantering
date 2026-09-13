import { z } from 'zod'
import { positiveIntegerSchema } from '@/lib/http/validation'

const reason = z.string().trim().min(1).max(10000)
const agreementReference = z.string().trim().min(1).max(2000)
const effectiveDate = z.iso.date()
const itemRef = z.string().regex(/^(lib|local):[1-9]\d*$/)
const targetVersionId = positiveIntegerSchema
const amendmentId = positiveIntegerSchema

export const amendmentChangeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('add_local'), description: reason }).strict(),
  z.object({ kind: z.literal('add_library'), targetVersionId }).strict(),
  z
    .object({ kind: z.literal('replace_library'), itemRef, targetVersionId })
    .strict(),
  z
    .object({ kind: z.literal('change_local'), itemRef, description: reason })
    .strict(),
  z.object({ kind: z.literal('remove'), itemRef }).strict(),
])

export const agreementMutationSchema = z.discriminatedUnion('operation', [
  z
    .object({
      operation: z.literal('establish'),
      reason,
      agreementReference,
      effectiveDate,
    })
    .strict(),
  z.object({ operation: z.literal('confirm_editable'), reason }).strict(),
  z
    .object({ operation: z.literal('adopt'), reason, itemRef, targetVersionId })
    .strict(),
  z
    .object({
      operation: z.literal('prepare_amendment'),
      reason,
      agreementReference,
      effectiveDate,
      replacesAmendmentId: amendmentId.optional(),
      changes: z.array(amendmentChangeSchema).min(1).max(100),
    })
    .strict(),
  z.object({ operation: z.literal('decide_amendment'), amendmentId }).strict(),
  z
    .object({ operation: z.literal('cancel_amendment'), amendmentId, reason })
    .strict(),
  z
    .object({
      operation: z.literal('cancel_deviation'),
      itemRef,
      deviationId: positiveIntegerSchema,
      reason,
    })
    .strict(),
  z
    .object({
      operation: z.literal('reassess'),
      itemRef,
      reason,
      specificationItemStatusId: z.number().int().min(1).max(6),
    })
    .strict(),
  z
    .object({ operation: z.literal('end_agreement'), reason, effectiveDate })
    .strict(),
])

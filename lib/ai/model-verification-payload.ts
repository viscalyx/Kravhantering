import { z } from 'zod'
import { aiIdentifierSchema, aiRevisionTokenSchema } from './admin-contracts'
import type { AiAdminCandidateVerificationResult } from './admin-service'
import { AI_CAPABILITY_KEYS } from './capability-keys'
import { AI_RUN_PROFILE_KEYS } from './profile-resolver'
import { aiReasoningConfigurationSchema } from './reasoning'

export const aiModelVerificationSnapshotSchema = z
  .object({
    name: z.string().trim().max(300).optional().default(''),
    description: z
      .string()
      .trim()
      .max(20_000)
      .nullable()
      .optional()
      .default(null),
    externalModelId: z.string().trim().min(1).max(450),
    externalModelVersion: z.string().trim().max(200).nullable(),
    reasoning: aiReasoningConfigurationSchema,
    modelId: aiIdentifierSchema.nullable().optional().default(null),
    modelToken: aiRevisionTokenSchema.nullable().optional().default(null),
  })
  .strict()
  .refine(value => (value.modelId === null) === (value.modelToken === null), {
    path: ['modelToken'],
    message: 'Model reference and concurrency token must be supplied together.',
  })

const code = z
  .string()
  .max(160)
  .regex(/^[a-z][a-z0-9_:]*$/u)
  .nullable()
const check = z
  .object({
    diagnosticCode: code,
    failureCategory: code,
    outcome: z.enum([
      'inconclusive',
      'not_checked',
      'not_verified',
      'verified',
    ]),
  })
  .strict()
const verificationSchema = z
  .object({
    baseline: check,
    canonicalExternalModelVersion: z.string().max(200).nullable(),
    capabilities: z.record(z.enum(AI_CAPABILITY_KEYS), check),
    connection: check,
    profileCompatibility: z.record(
      z.enum(AI_RUN_PROFILE_KEYS),
      check
        .extend({
          missingCapabilities: z
            .array(z.enum(AI_CAPABILITY_KEYS))
            .max(AI_CAPABILITY_KEYS.length),
          supported: z.boolean(),
        })
        .strict(),
    ),
    reasoning: aiReasoningConfigurationSchema,
    saveable: z.literal(true),
    testSuiteVersion: z
      .string()
      .max(100)
      .regex(/^[a-zA-Z0-9_-]+$/u),
  })
  .strict()

export interface AiModelVerificationPayload {
  candidate: z.infer<typeof aiModelVerificationSnapshotSchema>
  verification: AiAdminCandidateVerificationResult
}

const payloadSchema = z
  .object({
    candidate: aiModelVerificationSnapshotSchema,
    verification: verificationSchema,
  })
  .strict()

export function parseAiModelVerificationPayload(
  value: unknown,
): AiModelVerificationPayload {
  const parsed = payloadSchema.safeParse(value)
  if (!parsed.success) throw new Error('Invalid model verification payload.')
  return parsed.data
}

import { z } from 'zod'
import { AI_CONNECTION_AUTHENTICATION_TYPES } from './connection-trust'
import { AI_RUN_PROFILE_KEYS } from './profile-resolver'
import { aiReasoningConfigurationSchema } from './reasoning'

export const aiIdentifierSchema = z.string().uuid()
export const aiRevisionTokenSchema = z.string().uuid()

const boundedText = (maximum: number): z.ZodString =>
  z.string().trim().min(1).max(maximum)
const optionalText = (maximum: number): z.ZodNullable<z.ZodString> =>
  z.string().trim().max(maximum).nullable()

export const aiCapabilitySchema = z
  .object({
    reasoning: z.boolean(),
    reasoningControl: z.boolean(),
    aiAnalysis: z.boolean(),
    cost: z.boolean(),
    imageInput: z.boolean(),
    jsonSchemaSteering: z.boolean(),
    streaming: z.boolean(),
    tokenUsage: z.boolean(),
    validatableJson: z.boolean(),
  })
  .strict()

export const createAiConnectionSchema = z
  .object({
    adapterKey: boundedText(100),
    adapterVersion: boundedText(100),
    administrationName: boundedText(200),
    agentRuntimeKey: optionalText(100).optional().default(null),
    agentRuntimeVersion: optionalText(100).optional().default(null),
    authenticationType: z.enum(AI_CONNECTION_AUTHENTICATION_TYPES),
    dataPolicySummary: boundedText(1000),
    description: optionalText(20_000).optional().default(null),
    egressPolicyKey: boundedText(100),
    endpointUrl: boundedText(2048),
    maximumConcurrency: z.number().int().min(1).max(100),
    publicName: boundedText(200),
    tlsPolicyKey: boundedText(100),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      (value.agentRuntimeKey === null) !==
      (value.agentRuntimeVersion === null)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Agent runtime key and version must be supplied together.',
        path: ['agentRuntimeKey'],
      })
    }
    try {
      const endpoint = new URL(value.endpointUrl)
      if (
        !['https:', 'wss:'].includes(endpoint.protocol) ||
        endpoint.username ||
        endpoint.password ||
        endpoint.search ||
        endpoint.hash
      ) {
        throw new Error('forbidden endpoint')
      }
    } catch {
      context.addIssue({
        code: 'custom',
        message:
          'Endpoint must be an HTTPS or WSS URL without credentials, query, or fragment.',
        path: ['endpointUrl'],
      })
    }
  })

export const updateAiConnectionSchema = createAiConnectionSchema.safeExtend({
  revisionToken: aiRevisionTokenSchema,
})

export const aiConnectionParamsSchema = z
  .object({ connectionId: aiIdentifierSchema })
  .strict()

export const saveAiAttestationSchema = z
  .object({
    decisionReference: optionalText(1000),
    incidentResponseReference: aiIdentifierSchema.nullable(),
    isPersonalDataProcessed: z.boolean().nullable(),
    isTrainingAllowed: z.boolean().nullable(),
    maximumInformationClass: optionalText(100),
    maximumRetentionDays: z.number().int().min(0).max(36_500).nullable(),
    processingRegions: z.array(boundedText(100)).max(100).nullable(),
    providerName: optionalText(300),
    purpose: optionalText(20_000),
    responsibleOrganizationUnitReference: aiIdentifierSchema.nullable(),
    reviewDueAt: z.string().datetime().nullable(),
    reviewedAt: z.string().datetime().nullable(),
    revisionToken: aiRevisionTokenSchema.nullable().optional().default(null),
    subprocessors: z.array(boundedText(300)).max(100).nullable(),
  })
  .strict()

export const saveAiModelRevisionSchema = z
  .object({
    attemptId: aiIdentifierSchema,
    reasoning: aiReasoningConfigurationSchema,
    description: optionalText(20_000).optional().default(null),
    externalModelId: boundedText(450),
    externalModelVersion: optionalText(200).optional().default(null),
    modelId: aiIdentifierSchema.nullable().optional().default(null),
    modelToken: aiRevisionTokenSchema.nullable().optional().default(null),
    name: boundedText(300),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.modelId === null) !== (value.modelToken === null)) {
      context.addIssue({
        code: 'custom',
        message:
          'Existing model ID and revision token must be supplied together.',
        path: ['modelToken'],
      })
    }
  })

export const saveAiRunProfileSchema = z
  .object({
    inactivityTimeBudgetSeconds: z.number().int().min(300).max(3600),
    maximumBufferedEvents: z.number().int().min(1).max(1024),
    maximumOutputBytes: z.number().int().min(1).max(67_108_864),
    maximumOutputTokens: z.number().int().min(1).max(1_000_000),
    maximumRetainedMemoryBytes: z.number().int().min(1).max(134_217_728),
    modelRevisionId: aiIdentifierSchema.nullable(),
    queueCapacity: z.number().int().min(0).max(100),
    revisionToken: aiRevisionTokenSchema,
    totalTimeBudgetSeconds: z.number().int().min(300).max(3600),
  })
  .strict()
  .refine(
    value => value.inactivityTimeBudgetSeconds <= value.totalTimeBudgetSeconds,
    {
      message: 'Inactivity budget cannot exceed the total time budget.',
      path: ['inactivityTimeBudgetSeconds'],
    },
  )

export const aiRunProfileParamsSchema = z
  .object({ profileKey: z.enum(AI_RUN_PROFILE_KEYS) })
  .strict()

const connectionLifecycleActionSchema = z
  .object({
    action: z.literal('set_lifecycle'),
    revisionToken: aiRevisionTokenSchema,
    status: z.enum(['active', 'suspended', 'retired']),
  })
  .strict()

export const aiConnectionActionSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('activate_secret'),
      connectionConfigurationVersion: z.number().int().min(1),
      connectionRevisionToken: aiRevisionTokenSchema,
      secretVersionId: aiIdentifierSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('confirm_secret_revocation'),
      secretVersionId: aiIdentifierSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('delete_secret_candidate'),
      secretVersionId: aiIdentifierSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('delete_model_revision'),
      modelRevisionId: aiIdentifierSchema,
      revisionToken: aiRevisionTokenSchema,
    })
    .strict(),
  z.object({ action: z.literal('fetch_catalog') }).strict(),
  z
    .object({
      action: z.literal('discard_model_verification'),
      attemptId: aiIdentifierSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('probe_health'),
      modelRevisionId: aiIdentifierSchema,
      revisionToken: aiRevisionTokenSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('attest'),
      attestation: saveAiAttestationSchema,
      currentAttestationRevisionToken: aiRevisionTokenSchema.nullable(),
    })
    .strict(),
  z
    .object({
      action: z.literal('save_attestation'),
      attestation: saveAiAttestationSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('discard_attestation_draft'),
      currentAttestationRevisionToken: aiRevisionTokenSchema,
      draftAttestationId: aiIdentifierSchema,
      draftAttestationRevisionToken: aiRevisionTokenSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('end_model_revision'),
      modelRevisionId: aiIdentifierSchema,
      revisionToken: aiRevisionTokenSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('save_model_revision'),
      modelRevision: saveAiModelRevisionSchema,
    })
    .strict(),
  connectionLifecycleActionSchema,
  z
    .object({
      action: z.literal('verify_model_candidate'),
      reasoning: aiReasoningConfigurationSchema,
      externalModelId: boundedText(450),
      externalModelVersion: optionalText(200),
    })
    .strict(),
  z
    .object({
      action: z.literal('verify_live_path'),
      expectedEnvironmentId: boundedText(160).regex(/^[A-Za-z0-9._:-]+$/u),
      modelRevisionId: aiIdentifierSchema,
      profileKey: z.enum(AI_RUN_PROFILE_KEYS),
    })
    .strict(),
  z
    .object({
      action: z.literal('write_secret'),
      secret: z.string().min(1).max(16_384),
    })
    .strict(),
])

export const aiRunProfileActionSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('set_operational_status'),
      revisionToken: aiRevisionTokenSchema,
      status: z.enum(['enabled', 'suspended']),
    })
    .strict(),
])

export type AiCapability = z.infer<typeof aiCapabilitySchema>
export type AiConnectionAction = z.infer<typeof aiConnectionActionSchema>
export type CreateAiConnection = z.infer<typeof createAiConnectionSchema>
export type SaveAiAttestation = z.infer<typeof saveAiAttestationSchema>
export type SaveAiModelRevision = z.infer<typeof saveAiModelRevisionSchema>
export type SaveAiRunProfile = z.infer<typeof saveAiRunProfileSchema>

import { z } from 'zod'

/** Immutable application policy; provider dialects belong to adapters. */
export const aiReasoningConfigurationSchema = z.discriminatedUnion('mode', [
  z
    .object({
      mode: z.literal('explicit_control'),
      effort: z.enum(['low', 'medium', 'high']),
    })
    .strict(),
  z.object({ mode: z.literal('model_default'), effort: z.null() }).strict(),
])

export type AiReasoningConfiguration = z.infer<
  typeof aiReasoningConfigurationSchema
>

/** Content-free observations; control does not attest exact internal effort. */
export interface AiReasoningEvidence {
  activity: boolean
  control: boolean
}

export function parseAiReasoningConfiguration(
  value: unknown,
): AiReasoningConfiguration | null {
  const parsed = aiReasoningConfigurationSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

export function requireAiReasoningConfiguration(
  value: unknown,
): AiReasoningConfiguration {
  const configuration = parseAiReasoningConfiguration(value)
  if (!configuration)
    throw new Error('The model revision reasoning configuration is invalid.')
  return configuration
}

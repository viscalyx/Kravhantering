export const AI_CAPABILITY_KEYS = [
  'aiAnalysis',
  'cost',
  'imageInput',
  'jsonSchemaSteering',
  'streaming',
  'tokenUsage',
  'validatableJson',
] as const

export type AiCapabilityKey = (typeof AI_CAPABILITY_KEYS)[number]

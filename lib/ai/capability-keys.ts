import type { AiCapability } from './admin-contracts'

export const AI_CAPABILITY_KEYS = [
  'reasoning',
  'reasoningControl',
  'aiAnalysis',
  'cost',
  'imageInput',
  'jsonSchemaSteering',
  'streaming',
  'tokenUsage',
  'validatableJson',
] as const satisfies readonly (keyof AiCapability)[]

export type AiCapabilityKey = (typeof AI_CAPABILITY_KEYS)[number]

type Assert<T extends true> = T

export type AiCapabilityKeysAreComplete = Assert<
  keyof AiCapability extends AiCapabilityKey ? true : false
>

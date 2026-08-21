export const AI_ADMIN_BLOCKER_CODES = [
  'active_secret_missing',
  'attestation_incomplete',
  'attestation_invalid',
  'capability_policy_invalid',
  'connection_inactive',
  'connection_verification_missing',
  'data_policy_blocked',
  'data_policy_missing',
  'egress_policy_blocked',
  'model_revision_missing',
  'model_revision_unverified',
  'optimistic_concurrency_conflict',
] as const

export const AI_ADMIN_BLOCKER_FIELDS = [
  'aiAnalysis',
  'connection',
  'imageInput',
  'jsonSchema',
  'streaming',
  'usageMetadata',
  'validatableJson',
] as const

export type AiAdminBlockerCode = (typeof AI_ADMIN_BLOCKER_CODES)[number]
export type AiAdminBlockerField = (typeof AI_ADMIN_BLOCKER_FIELDS)[number]

export interface AiAdminBlocker {
  code: AiAdminBlockerCode
  field?: AiAdminBlockerField
}

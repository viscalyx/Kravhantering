import type {
  AiCapabilitySelection,
  AiConnectionId,
  AiConnectionModelRevisionId,
  AiResolvedConnection,
  AiResolvedConnectionModelRevision,
  AiRunProfileRevisionId,
  AiRunType,
} from './run-contracts'

export const AI_RUN_PROFILE_KEYS = [
  'generation_without_images',
  'generation_with_images',
  'invalid_json_repair',
] as const

export type AiRunProfileKey = (typeof AI_RUN_PROFILE_KEYS)[number]
export type AiRunProfileOperationalStatus = 'enabled' | 'suspended'
export type AiPersistedRunProfileRevisionStatus =
  | 'active'
  | 'draft'
  | 'superseded'
export type AiPersistedConnectionLifecycleStatus =
  | 'active'
  | 'draft'
  | 'retired'
  | 'suspended'
  | 'verification_required'
export type AiPersistedModelRevisionStatus =
  | 'draft'
  | 'retired'
  | 'verification_required'
  | 'verified'

export interface AiPersistedRunProfile {
  adapterType: string
  adapterVersion: string
  capabilityPolicyJson: string
  connectionAgentRuntimeVersion: string | null
  connectionConfiguration?: Readonly<Record<string, unknown>>
  connectionConfigurationVersion: number
  connectionId: string
  connectionLifecycleStatus: AiPersistedConnectionLifecycleStatus
  externalModelId: string
  modelRevisionAgentRuntimeVersion: string | null
  modelRevisionConfiguration?: Readonly<Record<string, unknown>>
  modelRevisionConnectionConfigurationVersion: number
  modelRevisionId: string
  modelRevisionStatus: AiPersistedModelRevisionStatus
  operationalStatus: AiRunProfileOperationalStatus
  profileRevisionId: string
  profileRevisionStatus: AiPersistedRunProfileRevisionStatus
  verifiedCapabilitiesJson: string | null
}

export interface AiRunProfileSource {
  findActiveRevision(
    profileKey: AiRunProfileKey,
  ): Promise<AiPersistedRunProfile | null>
}

export interface AiResolvedAdapterConfiguration {
  connection: unknown
  modelRevision: unknown
}

export type AiAdapterConfigurationResolver = (
  profile: Readonly<AiPersistedRunProfile>,
) => Promise<AiResolvedAdapterConfiguration>

export interface AiResolvedRunProfile {
  adapterType: string
  adapterVersion: string
  connection: Readonly<AiResolvedConnection>
  modelRevision: Readonly<AiResolvedConnectionModelRevision>
  profileRevisionId: AiRunProfileRevisionId
  selectedCapabilities: Readonly<AiCapabilitySelection>
}

export interface AiRunProfileResolver {
  resolve(type: AiRunType): Promise<Readonly<AiResolvedRunProfile>>
}

export const AI_RUN_PROFILE_RESOLUTION_ERROR_CODES = [
  'profile_missing',
  'profile_suspended',
  'profile_blocked',
  'run_type_unsupported',
] as const

export type AiRunProfileResolutionErrorCode =
  (typeof AI_RUN_PROFILE_RESOLUTION_ERROR_CODES)[number]

const ERROR_LOCALIZATION_KEYS = {
  profile_blocked: 'ai.runProfile.profileBlocked',
  profile_missing: 'ai.runProfile.profileMissing',
  profile_suspended: 'ai.runProfile.profileSuspended',
  run_type_unsupported: 'ai.runProfile.runTypeUnsupported',
} as const satisfies Record<AiRunProfileResolutionErrorCode, string>

export class AiRunProfileResolutionError extends Error {
  readonly code: AiRunProfileResolutionErrorCode
  readonly localizationKey: (typeof ERROR_LOCALIZATION_KEYS)[AiRunProfileResolutionErrorCode]
  readonly safeMessage = 'The configured AI run profile is unavailable.'

  constructor(code: AiRunProfileResolutionErrorCode) {
    super('The configured AI run profile is unavailable.')
    this.name = 'AiRunProfileResolutionError'
    this.code = code
    this.localizationKey = ERROR_LOCALIZATION_KEYS[code]
  }
}

type AiCapabilityPolicyMode = 'allowed' | 'disabled' | 'required'

interface AiRunProfileCapabilityPolicy {
  aiAnalysis: AiCapabilityPolicyMode
  imageInput: AiCapabilityPolicyMode
  jsonSchema: AiCapabilityPolicyMode
  streaming: AiCapabilityPolicyMode
  usageMetadata: AiCapabilityPolicyMode
  validatableJson: AiCapabilityPolicyMode
}

interface AiVerifiedCapabilities extends AiCapabilitySelection {
  validatableJson: boolean
}

const POLICY_KEYS = [
  'aiAnalysis',
  'imageInput',
  'jsonSchema',
  'streaming',
  'usageMetadata',
  'validatableJson',
] as const satisfies readonly (keyof AiRunProfileCapabilityPolicy)[]

const VERIFIED_CAPABILITY_KEYS = [
  'aiAnalysis',
  'cost',
  'imageInput',
  'jsonSchemaSteering',
  'streaming',
  'tokenUsage',
  'validatableJson',
] as const satisfies readonly (keyof AiVerifiedCapabilities)[]

const PROFILE_KEY_BY_RUN_TYPE = {
  generate_with_images: 'generation_with_images',
  generate_without_images: 'generation_without_images',
  repair_invalid_import_json: 'invalid_json_repair',
} as const satisfies Record<AiRunType, AiRunProfileKey>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseJsonRecord(value: string | null): Record<string, unknown> | null {
  if (value === null) return null
  try {
    const parsed: unknown = JSON.parse(value)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function isPolicyMode(value: unknown): value is AiCapabilityPolicyMode {
  return value === 'allowed' || value === 'disabled' || value === 'required'
}

function readCapabilityPolicy(
  value: string,
): AiRunProfileCapabilityPolicy | null {
  const parsed = parseJsonRecord(value)
  if (
    !parsed ||
    Object.keys(parsed).length !== POLICY_KEYS.length ||
    !POLICY_KEYS.every(key => isPolicyMode(parsed[key]))
  ) {
    return null
  }
  return parsed as unknown as AiRunProfileCapabilityPolicy
}

function readVerifiedCapabilities(
  value: string | null,
): AiVerifiedCapabilities | null {
  const parsed = parseJsonRecord(value)
  if (
    !parsed ||
    !VERIFIED_CAPABILITY_KEYS.every(key => typeof parsed[key] === 'boolean')
  ) {
    return null
  }
  return parsed as unknown as AiVerifiedCapabilities
}

function satisfiesLockedPolicy(
  type: AiRunType,
  policy: AiRunProfileCapabilityPolicy,
): boolean {
  if (
    policy.validatableJson !== 'required' ||
    policy.usageMetadata === 'required'
  ) {
    return false
  }
  if (type === 'repair_invalid_import_json') {
    return (
      policy.streaming === 'disabled' &&
      policy.imageInput === 'disabled' &&
      policy.aiAnalysis === 'disabled'
    )
  }
  return (
    policy.streaming === 'required' &&
    policy.imageInput ===
      (type === 'generate_with_images' ? 'required' : 'disabled')
  )
}

function selectCapability(
  mode: AiCapabilityPolicyMode,
  isVerified: boolean,
): boolean | null {
  if (mode === 'disabled') return false
  if (mode === 'allowed') return isVerified
  return isVerified ? true : null
}

function selectCapabilities(
  policy: AiRunProfileCapabilityPolicy,
  verified: AiVerifiedCapabilities,
): AiCapabilitySelection | null {
  const aiAnalysis = selectCapability(policy.aiAnalysis, verified.aiAnalysis)
  const imageInput = selectCapability(policy.imageInput, verified.imageInput)
  const jsonSchemaSteering = selectCapability(
    policy.jsonSchema,
    verified.jsonSchemaSteering,
  )
  const streaming = selectCapability(policy.streaming, verified.streaming)
  const cost = selectCapability(policy.usageMetadata, verified.cost)
  const tokenUsage = selectCapability(policy.usageMetadata, verified.tokenUsage)
  if (
    aiAnalysis === null ||
    imageInput === null ||
    jsonSchemaSteering === null ||
    streaming === null ||
    cost === null ||
    tokenUsage === null ||
    !verified.validatableJson
  ) {
    return null
  }
  return {
    aiAnalysis,
    cost,
    imageInput,
    jsonSchemaSteering,
    streaming,
    tokenUsage,
  }
}

function hasValidDependencies(profile: AiPersistedRunProfile): boolean {
  return (
    profile.profileRevisionStatus === 'active' &&
    profile.connectionLifecycleStatus === 'active' &&
    profile.modelRevisionStatus === 'verified' &&
    profile.modelRevisionConnectionConfigurationVersion ===
      profile.connectionConfigurationVersion &&
    profile.modelRevisionAgentRuntimeVersion ===
      profile.connectionAgentRuntimeVersion
  )
}

function blocked(): AiRunProfileResolutionError {
  return new AiRunProfileResolutionError('profile_blocked')
}

export interface CreateAiRunProfileResolverOptions {
  profileSource: AiRunProfileSource
  resolveAdapterConfiguration: AiAdapterConfigurationResolver
}

export function createAiRunProfileResolver(
  options: CreateAiRunProfileResolverOptions,
): AiRunProfileResolver {
  return {
    async resolve(type: AiRunType): Promise<Readonly<AiResolvedRunProfile>> {
      const profileKey = PROFILE_KEY_BY_RUN_TYPE[type]
      if (!profileKey) {
        throw new AiRunProfileResolutionError('run_type_unsupported')
      }

      let profile: AiPersistedRunProfile | null
      try {
        profile = await options.profileSource.findActiveRevision(profileKey)
      } catch {
        throw blocked()
      }
      if (!profile) {
        throw new AiRunProfileResolutionError('profile_missing')
      }
      if (profile.operationalStatus === 'suspended') {
        throw new AiRunProfileResolutionError('profile_suspended')
      }
      if (!hasValidDependencies(profile)) throw blocked()

      const policy = readCapabilityPolicy(profile.capabilityPolicyJson)
      const verified = readVerifiedCapabilities(
        profile.verifiedCapabilitiesJson,
      )
      if (!policy || !verified || !satisfiesLockedPolicy(type, policy)) {
        throw blocked()
      }
      const selectedCapabilities = selectCapabilities(policy, verified)
      if (!selectedCapabilities) throw blocked()

      let configuration: AiResolvedAdapterConfiguration
      try {
        configuration = await options.resolveAdapterConfiguration(
          Object.freeze({ ...profile }),
        )
      } catch {
        throw blocked()
      }

      const connection = Object.freeze({
        configuration: configuration.connection,
        id: profile.connectionId as AiConnectionId,
      })
      const modelRevision = Object.freeze({
        configuration: configuration.modelRevision,
        externalModelId: profile.externalModelId,
        id: profile.modelRevisionId as AiConnectionModelRevisionId,
        verifiedCapabilities: Object.freeze({
          aiAnalysis: verified.aiAnalysis,
          cost: verified.cost,
          imageInput: verified.imageInput,
          jsonSchemaSteering: verified.jsonSchemaSteering,
          streaming: verified.streaming,
          tokenUsage: verified.tokenUsage,
        }),
      })

      return Object.freeze({
        adapterType: profile.adapterType,
        adapterVersion: profile.adapterVersion,
        connection,
        modelRevision,
        profileRevisionId: profile.profileRevisionId as AiRunProfileRevisionId,
        selectedCapabilities: Object.freeze(selectedCapabilities),
      })
    },
  }
}

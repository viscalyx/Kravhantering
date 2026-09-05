import { AI_CAPABILITY_KEYS } from './capability-keys'
import type { AiConnectionTrustConfiguration } from './connection-trust'
import {
  type AiReasoningConfiguration,
  parseAiReasoningConfiguration,
} from './reasoning'
import type {
  AiCapabilitySelection,
  AiConnectionId,
  AiConnectionModelRevisionId,
  AiResolvedConnection,
  AiResolvedConnectionModelRevision,
  AiRunProfileId,
  AiRunType,
} from './run-contracts'

export const AI_RUN_PROFILE_KEYS = [
  'generation_without_images',
  'generation_with_images',
  'invalid_json_repair',
] as const

export type AiRunProfileKey = (typeof AI_RUN_PROFILE_KEYS)[number]
export type AiRunProfileOperationalStatus = 'enabled' | 'suspended'
export type AiPersistedConnectionLifecycleStatus =
  | 'active'
  | 'draft'
  | 'retired'
  | 'suspended'
  | 'verification_required'
export type AiPersistedModelRevisionStatus =
  | 'ended'
  | 'new_revision_required'
  | 'verified'

export interface AiPersistedRunProfile {
  adapterType: string
  adapterVersion: string
  connectionAgentRuntimeVersion: string | null
  connectionConfiguration?: Readonly<Record<string, unknown>>
  connectionConfigurationVersion: number
  connectionDataPolicySummary: string
  connectionId: string
  connectionLifecycleStatus: AiPersistedConnectionLifecycleStatus
  connectionMaximumConcurrency: number
  connectionPublicName: string
  externalModelId: string
  inactivityTimeBudgetSeconds: number
  maximumBufferedEvents: number
  maximumOutputBytes: number
  maximumOutputTokens: number
  maximumRetainedMemoryBytes: number
  modelRevisionAgentRuntimeVersion: string | null
  modelRevisionConfiguration?: Readonly<Record<string, unknown>>
  modelRevisionConnectionConfigurationVersion: number
  modelRevisionId: string
  modelRevisionMaximumConcurrency: number | null
  modelRevisionStatus: AiPersistedModelRevisionStatus
  operationalStatus: AiRunProfileOperationalStatus
  profileConfigurationVersion: number
  profileId: string
  queueCapacity: number
  reasoning: AiReasoningConfiguration | null
  totalTimeBudgetSeconds: number
  trustConfiguration: Readonly<AiConnectionTrustConfiguration> | null
  verifiedCapabilitiesJson: string | null
}

export interface AiRunProfileSource {
  findProfile(
    profileKey: AiRunProfileKey,
  ): Promise<AiPersistedRunProfile | null>
}

export interface AiResolvedAdapterConfiguration {
  connection: unknown
  modelRevision: unknown
}

export type AiAdapterConfigurationResolver = (
  profile: Readonly<AiPersistedRunProfile>,
  use: (
    configuration: Readonly<AiResolvedAdapterConfiguration>,
  ) => Promise<void>,
) => Promise<void>

export interface AiAdapterReadyRunProfile {
  connection: Readonly<AiResolvedConnection>
  modelRevision: Readonly<AiResolvedConnectionModelRevision>
}

export interface AiResolvedRunProfile {
  adapterType: string
  adapterVersion: string
  connectionId: AiConnectionId
  limits: Readonly<{
    maxBufferedEvents: number
    maxOutputBytes: number
    maxOutputTokens: number
    maxRetainedMemoryBytes: number
  }>
  modelRevisionId: AiConnectionModelRevisionId
  profileConfigurationVersion: number
  profileId: AiRunProfileId
  publicMetadata: Readonly<{
    connectionName: string
    dataPolicySummary: string
  }>
  runtime: Readonly<{
    inactivityTimeBudgetMs: number
    maximumConcurrency: number
    queueCapacity: number
    totalTimeBudgetMs: number
  }>
  selectedCapabilities: Readonly<AiCapabilitySelection>
  trustConfiguration: Readonly<AiConnectionTrustConfiguration>
  withAdapterConfiguration(
    use: (profile: Readonly<AiAdapterReadyRunProfile>) => Promise<void>,
  ): Promise<void>
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
  readonly adapterType?: string
  readonly adapterVersion?: string
  readonly code: AiRunProfileResolutionErrorCode
  readonly localizationKey: (typeof ERROR_LOCALIZATION_KEYS)[AiRunProfileResolutionErrorCode]
  readonly safeMessage = 'The configured AI run profile is unavailable.'
  readonly identity?: {
    aiConnectionId: string
    aiConnectionModelRevisionId: string
    aiRunProfileConfigurationVersion: number
    aiRunProfileId: string
  }

  constructor(
    code: AiRunProfileResolutionErrorCode,
    identity?: AiRunProfileResolutionError['identity'],
    adapterVersion?: string,
    adapterType?: string,
  ) {
    super('The configured AI run profile is unavailable.')
    this.name = 'AiRunProfileResolutionError'
    this.code = code
    this.localizationKey = ERROR_LOCALIZATION_KEYS[code]
    this.identity = identity
    this.adapterVersion = adapterVersion
    this.adapterType = adapterType
  }
}

interface AiVerifiedCapabilities extends AiCapabilitySelection {
  validatableJson: boolean
}

const VERIFIED_CAPABILITY_KEYS = AI_CAPABILITY_KEYS

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

function selectCapabilities(
  type: AiRunType,
  verified: AiVerifiedCapabilities,
): AiCapabilitySelection | null {
  const requiresImages = type === 'generate_with_images'
  const requiresStreaming = type !== 'repair_invalid_import_json'
  if (
    !verified.reasoning ||
    !verified.validatableJson ||
    (requiresImages && !verified.imageInput) ||
    (requiresStreaming && !verified.streaming)
  ) {
    return null
  }
  return {
    reasoning: true,
    reasoningControl: verified.reasoningControl,
    aiAnalysis:
      type === 'repair_invalid_import_json' ? false : verified.aiAnalysis,
    cost: verified.cost,
    imageInput: requiresImages,
    jsonSchemaSteering: verified.jsonSchemaSteering,
    streaming: requiresStreaming,
    tokenUsage: verified.tokenUsage,
    validatableJson: true,
  }
}

function hasValidDependencies(profile: AiPersistedRunProfile): boolean {
  return (
    profile.connectionLifecycleStatus === 'active' &&
    profile.modelRevisionStatus === 'verified' &&
    profile.modelRevisionConnectionConfigurationVersion ===
      profile.connectionConfigurationVersion &&
    profile.modelRevisionAgentRuntimeVersion ===
      profile.connectionAgentRuntimeVersion &&
    profile.trustConfiguration !== null
  )
}

function hasValidRuntimePolicy(profile: AiPersistedRunProfile): boolean {
  return (
    Number.isInteger(profile.totalTimeBudgetSeconds) &&
    profile.totalTimeBudgetSeconds >= 300 &&
    profile.totalTimeBudgetSeconds <= 3600 &&
    Number.isInteger(profile.inactivityTimeBudgetSeconds) &&
    profile.inactivityTimeBudgetSeconds >= 300 &&
    profile.inactivityTimeBudgetSeconds <= profile.totalTimeBudgetSeconds &&
    Number.isInteger(profile.queueCapacity) &&
    profile.queueCapacity >= 0 &&
    profile.queueCapacity <= 100 &&
    Number.isInteger(profile.connectionMaximumConcurrency) &&
    profile.connectionMaximumConcurrency >= 1 &&
    profile.connectionMaximumConcurrency <= 100 &&
    (profile.modelRevisionMaximumConcurrency === null ||
      (Number.isInteger(profile.modelRevisionMaximumConcurrency) &&
        profile.modelRevisionMaximumConcurrency >= 1 &&
        profile.modelRevisionMaximumConcurrency <= 100)) &&
    Number.isInteger(profile.maximumOutputTokens) &&
    profile.maximumOutputTokens >= 1 &&
    profile.maximumOutputTokens <= 1_000_000 &&
    Number.isInteger(profile.maximumOutputBytes) &&
    profile.maximumOutputBytes >= 1 &&
    profile.maximumOutputBytes <= 67_108_864 &&
    Number.isInteger(profile.maximumRetainedMemoryBytes) &&
    profile.maximumRetainedMemoryBytes >= 1 &&
    profile.maximumRetainedMemoryBytes <= 134_217_728 &&
    Number.isInteger(profile.maximumBufferedEvents) &&
    profile.maximumBufferedEvents >= 1 &&
    profile.maximumBufferedEvents <= 1_024
  )
}

function blocked(profile?: AiPersistedRunProfile): AiRunProfileResolutionError {
  return new AiRunProfileResolutionError(
    'profile_blocked',
    profile
      ? {
          aiConnectionId: profile.connectionId,
          aiConnectionModelRevisionId: profile.modelRevisionId,
          aiRunProfileConfigurationVersion: profile.profileConfigurationVersion,
          aiRunProfileId: profile.profileId,
        }
      : undefined,
    profile?.adapterVersion,
    profile?.adapterType,
  )
}

function freezePersistedProfile(
  profile: AiPersistedRunProfile,
): Readonly<AiPersistedRunProfile> {
  return Object.freeze({
    ...profile,
    reasoning: profile.reasoning
      ? Object.freeze({ ...profile.reasoning })
      : null,
    connectionConfiguration: profile.connectionConfiguration
      ? Object.freeze({ ...profile.connectionConfiguration })
      : undefined,
    modelRevisionConfiguration: profile.modelRevisionConfiguration
      ? Object.freeze({ ...profile.modelRevisionConfiguration })
      : undefined,
  })
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
        profile = await options.profileSource.findProfile(profileKey)
      } catch {
        throw blocked()
      }
      if (!profile) {
        throw new AiRunProfileResolutionError('profile_missing')
      }
      if (profile.operationalStatus === 'suspended') {
        throw new AiRunProfileResolutionError('profile_suspended')
      }
      if (!hasValidDependencies(profile) || !hasValidRuntimePolicy(profile)) {
        throw blocked(profile)
      }

      const verified = readVerifiedCapabilities(
        profile.verifiedCapabilitiesJson,
      )
      const reasoning = parseAiReasoningConfiguration(profile.reasoning)
      if (
        !verified ||
        !reasoning ||
        (reasoning.mode === 'explicit_control' && !verified.reasoningControl)
      )
        throw blocked(profile)
      const selectedCapabilities = selectCapabilities(type, verified)
      if (!selectedCapabilities) throw blocked(profile)

      const connectionId = profile.connectionId as AiConnectionId
      const modelRevisionId =
        profile.modelRevisionId as AiConnectionModelRevisionId
      const profileSnapshot = freezePersistedProfile(profile)
      const trustConfiguration = profileSnapshot.trustConfiguration
      if (!trustConfiguration) throw blocked(profileSnapshot)
      const verifiedCapabilities = Object.freeze({
        reasoning: verified.reasoning,
        reasoningControl: verified.reasoningControl,
        aiAnalysis: verified.aiAnalysis,
        cost: verified.cost,
        imageInput: verified.imageInput,
        jsonSchemaSteering: verified.jsonSchemaSteering,
        streaming: verified.streaming,
        tokenUsage: verified.tokenUsage,
        validatableJson: verified.validatableJson,
      })
      const limits = Object.freeze({
        maxBufferedEvents: profile.maximumBufferedEvents,
        maxOutputBytes: profile.maximumOutputBytes,
        maxOutputTokens: profile.maximumOutputTokens,
        maxRetainedMemoryBytes: profile.maximumRetainedMemoryBytes,
      })
      const runtime = Object.freeze({
        inactivityTimeBudgetMs: profile.inactivityTimeBudgetSeconds * 1_000,
        maximumConcurrency: Math.min(
          profile.connectionMaximumConcurrency,
          profile.modelRevisionMaximumConcurrency ??
            profile.connectionMaximumConcurrency,
        ),
        queueCapacity: profile.queueCapacity,
        totalTimeBudgetMs: profile.totalTimeBudgetSeconds * 1_000,
      })
      const withAdapterConfiguration = async (
        use: (profile: Readonly<AiAdapterReadyRunProfile>) => Promise<void>,
      ): Promise<void> => {
        let callbackCount = 0
        try {
          await options.resolveAdapterConfiguration(
            profileSnapshot,
            async configuration => {
              callbackCount += 1
              if (callbackCount !== 1) throw blocked(profileSnapshot)
              await use(
                Object.freeze({
                  connection: Object.freeze({
                    configuration: configuration.connection,
                    id: connectionId,
                  }),
                  modelRevision: Object.freeze({
                    reasoning: Object.freeze({ ...reasoning }),
                    configuration: configuration.modelRevision,
                    externalModelId: profileSnapshot.externalModelId,
                    id: modelRevisionId,
                    verifiedCapabilities,
                  }),
                }),
              )
            },
          )
          if (callbackCount !== 1) throw blocked(profileSnapshot)
        } catch {
          throw blocked(profileSnapshot)
        }
      }

      return Object.freeze({
        adapterType: profile.adapterType,
        adapterVersion: profile.adapterVersion,
        connectionId,
        limits,
        modelRevisionId,
        profileConfigurationVersion: profile.profileConfigurationVersion,
        profileId: profile.profileId as AiRunProfileId,
        publicMetadata: Object.freeze({
          connectionName: profile.connectionPublicName,
          dataPolicySummary: profile.connectionDataPolicySummary,
        }),
        runtime,
        selectedCapabilities: Object.freeze(selectedCapabilities),
        trustConfiguration: Object.freeze({
          ...trustConfiguration,
          dataPolicy: trustConfiguration.dataPolicy
            ? Object.freeze({
                ...trustConfiguration.dataPolicy,
                processingRegions: Object.freeze([
                  ...trustConfiguration.dataPolicy.processingRegions,
                ]),
                subprocessors: Object.freeze([
                  ...trustConfiguration.dataPolicy.subprocessors,
                ]),
              })
            : null,
        }),
        withAdapterConfiguration,
      })
    },
  }
}

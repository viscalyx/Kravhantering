import { describe, expect, it, vi } from 'vitest'
import {
  type AiPersistedRunProfile,
  type AiRunProfileKey,
  AiRunProfileResolutionError,
  createAiRunProfileResolver,
} from '@/lib/ai/profile-resolver'
import type { AiRunType } from '@/lib/ai/run-contracts'

const VERIFIED_CAPABILITIES = {
  aiAnalysis: true,
  cost: false,
  imageInput: true,
  jsonSchemaSteering: true,
  streaming: true,
  tokenUsage: true,
  validatableJson: true,
}

function capabilityPolicy(type: AiRunType): string {
  if (type === 'repair_invalid_import_json') {
    return JSON.stringify({
      aiAnalysis: 'disabled',
      imageInput: 'disabled',
      jsonSchema: 'allowed',
      streaming: 'disabled',
      usageMetadata: 'allowed',
      validatableJson: 'required',
    })
  }
  return JSON.stringify({
    aiAnalysis: 'allowed',
    imageInput: type === 'generate_with_images' ? 'required' : 'disabled',
    jsonSchema: 'allowed',
    streaming: 'required',
    usageMetadata: 'allowed',
    validatableJson: 'required',
  })
}

function persistedProfile(
  type: AiRunType = 'generate_without_images',
): AiPersistedRunProfile {
  return {
    adapterType: 'controlled_test',
    adapterVersion: '1',
    connectionAgentRuntimeVersion: null,
    connectionConfigurationVersion: 7,
    connectionId: 'connection-17',
    connectionLifecycleStatus: 'active',
    connectionMaximumConcurrency: 4,
    connectionPublicName: 'Test connection',
    connectionDataPolicySummary: 'Test data policy',
    externalModelId: 'controlled/model-v1',
    modelRevisionAgentRuntimeVersion: null,
    modelRevisionConnectionConfigurationVersion: 7,
    modelRevisionId: 'model-revision-23',
    modelRevisionMaximumConcurrency: null,
    modelRevisionStatus: 'verified',
    operationalStatus: 'enabled',
    inactivityTimeBudgetSeconds: 300,
    maximumBufferedEvents: 32,
    maximumOutputBytes: 4_194_304,
    maximumOutputTokens: 8_192,
    maximumRetainedMemoryBytes: 8_388_608,
    profileRevisionId: 'profile-revision-31',
    profileRevisionStatus: 'active',
    trustConfiguration: {
      authenticationType: 'static_secret',
      dataPolicy: {
        isPersonalDataProcessed: false,
        isTrainingAllowed: false,
        maximumInformationClass: 'internal',
        maximumRetentionDays: 0,
        processingRegions: ['SE'],
        subprocessors: [],
      },
      egressPolicyKey: 'controlled_test',
      endpointUrl: 'https://adapter.invalid/v1',
      tlsPolicyKey: 'public_web_pki',
    },
    queueCapacity: 10,
    totalTimeBudgetSeconds: 1_200,
    capabilityPolicyJson: capabilityPolicy(type),
    verifiedCapabilitiesJson: JSON.stringify(VERIFIED_CAPABILITIES),
  }
}

function setup(profile: AiPersistedRunProfile | null) {
  const findActiveRevision = vi.fn(async (_key: AiRunProfileKey) => profile)
  const resolveAdapterConfiguration = vi.fn(async (_profile, use) => {
    await use({
      connection: { scenario: 'opaque' },
      modelRevision: { option: 'opaque' },
    })
  })
  const resolver = createAiRunProfileResolver({
    profileSource: { findActiveRevision },
    resolveAdapterConfiguration,
  })
  return { findActiveRevision, resolveAdapterConfiguration, resolver }
}

describe('AI run profile resolver', () => {
  it.each([
    ['generate_without_images', 'generation_without_images'],
    ['generate_with_images', 'generation_with_images'],
    ['repair_invalid_import_json', 'invalid_json_repair'],
  ] as const)('maps %s to its only fixed profile slot', async (type, key) => {
    const profile = persistedProfile(type)
    const { findActiveRevision, resolver } = setup(profile)

    await expect(resolver.resolve(type)).resolves.toMatchObject({
      adapterType: 'controlled_test',
      adapterVersion: '1',
      connectionId: 'connection-17',
      modelRevisionId: 'model-revision-23',
      profileRevisionId: 'profile-revision-31',
    })
    expect(findActiveRevision).toHaveBeenCalledWith(key)
  })

  it('exposes adapter-ready configuration only inside its callback scope', async () => {
    let scopeActive = false
    const resolveAdapterConfiguration = vi.fn(async (_profile, use) => {
      scopeActive = true
      try {
        await use({ connection: { secret: 'transient' }, modelRevision: {} })
      } finally {
        scopeActive = false
      }
    })
    const resolver = createAiRunProfileResolver({
      profileSource: { findActiveRevision: async () => persistedProfile() },
      resolveAdapterConfiguration,
    })

    const resolved = await resolver.resolve('generate_without_images')

    expect(resolveAdapterConfiguration).not.toHaveBeenCalled()
    expect(resolved).not.toHaveProperty('connection')
    await resolved.withAdapterConfiguration(async configured => {
      expect(scopeActive).toBe(true)
      expect(configured).toMatchObject({
        connection: {
          configuration: { secret: 'transient' },
          id: 'connection-17',
        },
        modelRevision: { id: 'model-revision-23' },
      })
      await Promise.resolve()
      expect(scopeActive).toBe(true)
    })
    expect(scopeActive).toBe(false)
  })

  it('applies disabled, allowed, and required modes from verified revision capabilities', async () => {
    const { resolver } = setup(persistedProfile())

    await expect(
      resolver.resolve('generate_without_images'),
    ).resolves.toMatchObject({
      selectedCapabilities: {
        aiAnalysis: true,
        cost: false,
        imageInput: false,
        jsonSchemaSteering: true,
        streaming: true,
        tokenUsage: true,
      },
    })
  })

  it('forbids optional capabilities selected as disabled', async () => {
    const profile = persistedProfile()
    profile.capabilityPolicyJson = JSON.stringify({
      ...JSON.parse(profile.capabilityPolicyJson),
      aiAnalysis: 'disabled',
      jsonSchema: 'disabled',
      usageMetadata: 'disabled',
    })
    const { resolver } = setup(profile)

    await expect(
      resolver.resolve('generate_without_images'),
    ).resolves.toMatchObject({
      selectedCapabilities: {
        aiAnalysis: false,
        cost: false,
        jsonSchemaSteering: false,
        tokenUsage: false,
      },
    })
  })

  it('does not block when an allowed capability lacks verified support', async () => {
    const profile = persistedProfile()
    profile.verifiedCapabilitiesJson = JSON.stringify({
      ...VERIFIED_CAPABILITIES,
      aiAnalysis: false,
      jsonSchemaSteering: false,
      tokenUsage: false,
    })
    const { resolver } = setup(profile)

    await expect(
      resolver.resolve('generate_without_images'),
    ).resolves.toMatchObject({
      selectedCapabilities: {
        aiAnalysis: false,
        jsonSchemaSteering: false,
        tokenUsage: false,
      },
    })
  })

  it('blocks before resolving adapter configuration when a required capability is not verified', async () => {
    const profile = persistedProfile('generate_with_images')
    profile.verifiedCapabilitiesJson = JSON.stringify({
      ...VERIFIED_CAPABILITIES,
      imageInput: false,
    })
    const { resolveAdapterConfiguration, resolver } = setup(profile)

    await expect(
      resolver.resolve('generate_with_images'),
    ).rejects.toMatchObject({
      code: 'profile_blocked',
      localizationKey: 'ai.runProfile.profileBlocked',
      safeMessage: 'The configured AI run profile is unavailable.',
    })
    expect(resolveAdapterConfiguration).not.toHaveBeenCalled()
  })

  it('blocks when a selectable capability is required but not verified', async () => {
    const profile = persistedProfile()
    profile.capabilityPolicyJson = JSON.stringify({
      ...JSON.parse(profile.capabilityPolicyJson),
      aiAnalysis: 'required',
    })
    profile.verifiedCapabilitiesJson = JSON.stringify({
      ...VERIFIED_CAPABILITIES,
      aiAnalysis: false,
    })
    const { resolver } = setup(profile)

    await expect(
      resolver.resolve('generate_without_images'),
    ).rejects.toMatchObject({
      code: 'profile_blocked',
    })
  })

  it('always blocks when validatable JSON was not verified, even with JSON Schema steering', async () => {
    const profile = persistedProfile()
    profile.verifiedCapabilitiesJson = JSON.stringify({
      ...VERIFIED_CAPABILITIES,
      jsonSchemaSteering: true,
      validatableJson: false,
    })
    const { resolver } = setup(profile)

    await expect(
      resolver.resolve('generate_without_images'),
    ).rejects.toMatchObject({
      code: 'profile_blocked',
    })
  })

  it.each([
    {
      expectedCode: 'profile_missing',
      expectedKey: 'ai.runProfile.profileMissing',
      mutate: () => null,
    },
    {
      expectedCode: 'profile_suspended',
      expectedKey: 'ai.runProfile.profileSuspended',
      mutate: () => ({
        ...persistedProfile(),
        operationalStatus: 'suspended' as const,
      }),
    },
    {
      expectedCode: 'profile_blocked',
      expectedKey: 'ai.runProfile.profileBlocked',
      mutate: () => ({
        ...persistedProfile(),
        connectionLifecycleStatus: 'verification_required' as const,
      }),
    },
  ])(
    'returns a stable, localizable, safe $expectedCode error before adapter configuration',
    async ({ expectedCode, expectedKey, mutate }) => {
      const { resolveAdapterConfiguration, resolver } = setup(mutate())

      await expect(
        resolver.resolve('generate_without_images'),
      ).rejects.toMatchObject({
        code: expectedCode,
        localizationKey: expectedKey,
        safeMessage: 'The configured AI run profile is unavailable.',
      })
      expect(resolveAdapterConfiguration).not.toHaveBeenCalled()
    },
  )

  it.each([
    ['profile revision is not active', { profileRevisionStatus: 'draft' }],
    ['model revision is not verified', { modelRevisionStatus: 'retired' }],
    [
      'model verification targets an older connection configuration',
      { modelRevisionConnectionConfigurationVersion: 6 },
    ],
    [
      'model verification targets another agent runtime',
      { modelRevisionAgentRuntimeVersion: 'agent-v0' },
    ],
    ['capability policy is malformed', { capabilityPolicyJson: '{}' }],
    [
      'verified capabilities are malformed',
      { verifiedCapabilitiesJson: '{"streaming":"yes"}' },
    ],
  ])('derives blocked when the %s', async (_name, patch) => {
    const profile = Object.assign(persistedProfile(), patch)
    const { resolver } = setup(profile)

    await expect(
      resolver.resolve('generate_without_images'),
    ).rejects.toMatchObject({
      code: 'profile_blocked',
    })
  })

  it('keeps transport abort and deadline invariants outside profile policy', async () => {
    const profile = persistedProfile()
    profile.capabilityPolicyJson = JSON.stringify({
      ...JSON.parse(profile.capabilityPolicyJson),
      transportCancellation: 'disabled',
    })
    const { resolver } = setup(profile)

    await expect(
      resolver.resolve('generate_without_images'),
    ).rejects.toMatchObject({
      code: 'profile_blocked',
    })
  })

  it.each(['profile source', 'adapter configuration'] as const)(
    'normalizes an internal %s failure to a safe blocked-profile error',
    async boundary => {
      const profileSource = {
        findActiveRevision:
          boundary === 'profile source'
            ? async () => {
                throw new Error('Server=private;Password=secret')
              }
            : async () => persistedProfile(),
      }
      const resolver = createAiRunProfileResolver({
        profileSource,
        resolveAdapterConfiguration: async (_profile, use) => {
          if (boundary === 'adapter configuration') {
            throw new Error('provider secret is unavailable')
          }
          await use({ connection: {}, modelRevision: {} })
        },
      })

      const error = await (async (): Promise<unknown> => {
        try {
          const resolved = await resolver.resolve('generate_without_images')
          await resolved.withAdapterConfiguration(async () => undefined)
          return resolved
        } catch (caught) {
          return caught
        }
      })()

      expect(error).toMatchObject({
        code: 'profile_blocked',
        localizationKey: 'ai.runProfile.profileBlocked',
        message: 'The configured AI run profile is unavailable.',
      })
      expect(JSON.stringify(error)).not.toMatch(/Password|secret/u)
    },
  )

  it('rejects policy that weakens a locked run-type minimum', async () => {
    const profile = persistedProfile()
    profile.capabilityPolicyJson = JSON.stringify({
      ...JSON.parse(profile.capabilityPolicyJson),
      streaming: 'allowed',
    })
    const { resolver } = setup(profile)

    await expect(
      resolver.resolve('generate_without_images'),
    ).rejects.toMatchObject({
      code: 'profile_blocked',
    })
  })

  it('rejects unsupported run types without reading persistence', async () => {
    const { findActiveRevision, resolver } = setup(persistedProfile())

    await expect(
      resolver.resolve('arbitrary_profile' as AiRunType),
    ).rejects.toBeInstanceOf(AiRunProfileResolutionError)
    expect(findActiveRevision).not.toHaveBeenCalled()
  })

  it('returns an immutable selection detached from mutable persistence JSON', async () => {
    const profile = persistedProfile()
    const { resolver } = setup(profile)
    const resolved = await resolver.resolve('generate_without_images')

    profile.profileRevisionId = 'changed-after-resolution'
    profile.verifiedCapabilitiesJson = JSON.stringify({
      ...VERIFIED_CAPABILITIES,
      streaming: false,
    })

    expect(Object.isFrozen(resolved)).toBe(true)
    expect(Object.isFrozen(resolved.selectedCapabilities)).toBe(true)
    expect(resolved).not.toHaveProperty('connection')
    expect(resolved).not.toHaveProperty('modelRevision')
    expect(resolved.profileRevisionId).toBe('profile-revision-31')
    expect(resolved.selectedCapabilities.streaming).toBe(true)
  })
})

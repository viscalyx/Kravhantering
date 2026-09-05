import { describe, expect, it, vi } from 'vitest'
import {
  type AiPersistedRunProfile,
  type AiRunProfileKey,
  AiRunProfileResolutionError,
  createAiRunProfileResolver,
} from '@/lib/ai/profile-resolver'
import type { AiRunType } from '@/lib/ai/run-contracts'

const VERIFIED_CAPABILITIES = {
  reasoning: true,
  reasoningControl: true,
  aiAnalysis: true,
  cost: false,
  imageInput: true,
  jsonSchemaSteering: true,
  streaming: true,
  tokenUsage: true,
  validatableJson: true,
}

function persistedProfile(): AiPersistedRunProfile {
  return {
    reasoning: { mode: 'explicit_control' as const, effort: 'high' as const },
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
    profileConfigurationVersion: 1,
    profileId: 'profile-31',
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
    verifiedCapabilitiesJson: JSON.stringify(VERIFIED_CAPABILITIES),
  }
}

function setup(profile: AiPersistedRunProfile | null) {
  const findProfile = vi.fn(async (_key: AiRunProfileKey) => profile)
  const resolveAdapterConfiguration = vi.fn(async (_profile, use) => {
    await use({
      connection: { scenario: 'opaque' },
      modelRevision: { option: 'opaque' },
    })
  })
  const resolver = createAiRunProfileResolver({
    profileSource: { findProfile },
    resolveAdapterConfiguration,
  })
  return { findProfile, resolveAdapterConfiguration, resolver }
}

describe('AI run profile resolver', () => {
  it.each([
    'generate_without_images',
    'generate_with_images',
    'repair_invalid_import_json',
  ] as const)(
    'requires reasoning evidence for %s while allowing model default without control',
    async type => {
      const profile = persistedProfile()
      profile.reasoning = { mode: 'model_default', effort: null }
      profile.verifiedCapabilitiesJson = JSON.stringify({
        ...VERIFIED_CAPABILITIES,
        reasoning: true,
        reasoningControl: false,
        aiAnalysis: false,
      })
      const { resolver } = setup(profile)
      const resolved = await resolver.resolve(type)
      await resolved.withAdapterConfiguration(async ready => {
        expect(ready.modelRevision.reasoning).toEqual({
          mode: 'model_default',
          effort: null,
        })
      })
      profile.verifiedCapabilitiesJson = JSON.stringify({
        ...VERIFIED_CAPABILITIES,
        reasoning: false,
      })
      await expect(resolver.resolve(type)).rejects.toMatchObject({
        code: 'profile_blocked',
      })
    },
  )

  it('freezes admitted reasoning even when the stored profile is subsequently changed', async () => {
    const profile = persistedProfile()
    profile.reasoning = { mode: 'explicit_control', effort: 'low' }
    const { resolver } = setup(profile)
    const admitted = await resolver.resolve('generate_without_images')
    profile.reasoning.effort = 'high'
    await admitted.withAdapterConfiguration(async ready => {
      expect(ready.modelRevision.reasoning).toEqual({
        mode: 'explicit_control',
        effort: 'low',
      })
      expect(Object.isFrozen(ready.modelRevision.reasoning)).toBe(true)
    })
  })

  it.each([
    null,
    { mode: 'explicit_control', effort: 'none' },
    { mode: 'model_default', effort: 'high' },
  ])(
    'blocks a revision with missing or invalid reasoning %j',
    async reasoning => {
      const profile = persistedProfile()
      profile.reasoning = reasoning as never
      await expect(
        setup(profile).resolver.resolve('generate_without_images'),
      ).rejects.toMatchObject({ code: 'profile_blocked' })
    },
  )

  it.each([
    ['generate_without_images', 'generation_without_images'],
    ['generate_with_images', 'generation_with_images'],
    ['repair_invalid_import_json', 'invalid_json_repair'],
  ] as const)('maps %s to its only fixed profile slot', async (type, key) => {
    const profile = persistedProfile()
    const { findProfile, resolver } = setup(profile)

    await expect(resolver.resolve(type)).resolves.toMatchObject({
      adapterType: 'controlled_test',
      adapterVersion: '1',
      connectionId: 'connection-17',
      modelRevisionId: 'model-revision-23',
      profileConfigurationVersion: 1,
      profileId: 'profile-31',
    })
    expect(findProfile).toHaveBeenCalledWith(key)
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
      profileSource: { findProfile: async () => persistedProfile() },
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
        reasoning: true,
        reasoningControl: true,
        aiAnalysis: true,
        cost: false,
        imageInput: false,
        jsonSchemaSteering: true,
        streaming: true,
        tokenUsage: true,
      },
    })
  })

  it('does not block when an allowed capability lacks verified support', async () => {
    const profile = persistedProfile()
    profile.verifiedCapabilitiesJson = JSON.stringify({
      ...VERIFIED_CAPABILITIES,
      reasoning: true,
      reasoningControl: true,
      aiAnalysis: false,
      jsonSchemaSteering: false,
      tokenUsage: false,
    })
    const { resolver } = setup(profile)

    await expect(
      resolver.resolve('generate_without_images'),
    ).resolves.toMatchObject({
      selectedCapabilities: {
        reasoning: true,
        reasoningControl: true,
        aiAnalysis: false,
        jsonSchemaSteering: false,
        tokenUsage: false,
      },
    })
  })

  it('blocks before resolving adapter configuration when a required capability is not verified', async () => {
    const profile = persistedProfile()
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
    ['model revision is not verified', { modelRevisionStatus: 'ended' }],
    [
      'model revision requires new verification',
      { modelRevisionStatus: 'new_revision_required' },
    ],
    [
      'model verification targets an older connection configuration',
      { modelRevisionConnectionConfigurationVersion: 6 },
    ],
    [
      'model verification targets another agent runtime',
      { modelRevisionAgentRuntimeVersion: 'agent-v0' },
    ],
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

  it('retains profile identity when a trust snapshot becomes unavailable', async () => {
    const profile = persistedProfile()
    const trustConfiguration = profile.trustConfiguration
    let reads = 0
    Object.defineProperty(profile, 'trustConfiguration', {
      enumerable: true,
      get: () => {
        reads += 1
        return reads === 1 ? trustConfiguration : null
      },
    })
    const { resolver } = setup(profile)

    await expect(
      resolver.resolve('generate_without_images'),
    ).rejects.toMatchObject({
      code: 'profile_blocked',
      identity: {
        aiConnectionId: profile.connectionId,
        aiConnectionModelRevisionId: profile.modelRevisionId,
        aiRunProfileConfigurationVersion: 1,
        aiRunProfileId: profile.profileId,
      },
    })
  })

  it.each(['profile source', 'adapter configuration'] as const)(
    'normalizes an internal %s failure to a safe blocked-profile error',
    async boundary => {
      const profileSource = {
        findProfile:
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

  it('rejects unsupported run types without reading persistence', async () => {
    const { findProfile, resolver } = setup(persistedProfile())

    await expect(
      resolver.resolve('arbitrary_profile' as AiRunType),
    ).rejects.toBeInstanceOf(AiRunProfileResolutionError)
    expect(findProfile).not.toHaveBeenCalled()
  })

  it('returns an immutable selection detached from mutable persistence JSON', async () => {
    const profile = persistedProfile()
    const { resolver } = setup(profile)
    const resolved = await resolver.resolve('generate_without_images')

    profile.profileId = 'changed-after-resolution'
    profile.verifiedCapabilitiesJson = JSON.stringify({
      ...VERIFIED_CAPABILITIES,
      streaming: false,
    })

    expect(Object.isFrozen(resolved)).toBe(true)
    expect(Object.isFrozen(resolved.selectedCapabilities)).toBe(true)
    expect(resolved).not.toHaveProperty('connection')
    expect(resolved).not.toHaveProperty('modelRevision')
    expect(resolved.profileId).toBe('profile-31')
    expect(resolved.selectedCapabilities.streaming).toBe(true)
  })
})

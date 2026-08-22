import { describe, expect, it } from 'vitest'
import { __testing } from '@/lib/dal/ai-connection-admin'

describe('AI connection administration persistence mapping', () => {
  it.each([
    [null, 'suspended', 'unconfigured', 'unconfigured'],
    ['MODEL', 'suspended', 'configured', 'paused'],
    ['MODEL', 'suspended', 'blocked', 'paused'],
    ['MODEL', 'enabled', 'blocked', 'blocked'],
    ['MODEL', 'enabled', 'configured', 'active'],
  ] as const)(
    'derives %s / %s / %s as the single %s administrative status',
    (modelRevisionId, operationalStatus, configurationStatus, administrativeStatus) => {
      expect(
        __testing.mapProfile({
          activeSecretAvailable: configurationStatus === 'configured',
          authenticationType: 'static_secret',
          connectionActive: configurationStatus === 'configured',
          connectionEvidenceAvailable: configurationStatus === 'configured',
          configurationStatus,
          configurationVersion: 4,
          inactivityTimeBudgetSeconds: 300,
          maximumBufferedEvents: 32,
          maximumOutputBytes: 4_194_304,
          maximumOutputTokens: 8_192,
          maximumRetainedMemoryBytes: 8_388_608,
          modelRevisionId,
          modelRevisionVerified: configurationStatus === 'configured',
          operationalStatus,
          profileId: 'PROFILE',
          profileKey: 'generation_without_images',
          profileToken: 'TOKEN',
          queueCapacity: 10,
          totalTimeBudgetSeconds: 1_200,
          validAttestation: configurationStatus === 'configured',
        } as never),
      ).toMatchObject({ administrativeStatus })
    },
  )

  it('maps a stable directly configured run profile', () => {
    expect(
      __testing.mapProfile({
        activeSecretAvailable: true,
        authenticationType: 'static_secret',
        connectionActive: true,
        connectionEvidenceAvailable: true,
        configurationStatus: 'configured',
        configurationVersion: '4',
        inactivityTimeBudgetSeconds: '300',
        maximumBufferedEvents: '32',
        maximumOutputBytes: '4194304',
        maximumOutputTokens: '8192',
        maximumRetainedMemoryBytes: '8388608',
        modelRevisionId: 'MODEL',
        modelRevisionVerified: true,
        operationalStatus: 'enabled',
        profileId: 'PROFILE',
        profileKey: 'generation_without_images',
        profileToken: 'TOKEN',
        queueCapacity: '10',
        totalTimeBudgetSeconds: '1200',
        validAttestation: true,
      } as never),
    ).toEqual({
      administrativeStatus: 'active',
      blockers: [],
      configurationStatus: 'configured',
      configurationVersion: 4,
      id: 'PROFILE',
      inactivityTimeBudgetSeconds: 300,
      maximumBufferedEvents: 32,
      maximumOutputBytes: 4_194_304,
      maximumOutputTokens: 8192,
      maximumRetainedMemoryBytes: 8_388_608,
      modelRevisionId: 'MODEL',
      operationalStatus: 'enabled',
      profileKey: 'generation_without_images',
      queueCapacity: 10,
      revisionToken: 'TOKEN',
      totalTimeBudgetSeconds: 1200,
    })
  })

  it('maps exact blockers for a selected profile that is no longer usable', () => {
    expect(
      __testing.mapProfile({
        activeSecretAvailable: false,
        authenticationType: 'static_secret',
        connectionActive: false,
        connectionEvidenceAvailable: false,
        configurationStatus: 'blocked',
        configurationVersion: 4,
        inactivityTimeBudgetSeconds: 300,
        maximumBufferedEvents: 32,
        maximumOutputBytes: 4_194_304,
        maximumOutputTokens: 8_192,
        maximumRetainedMemoryBytes: 8_388_608,
        modelRevisionId: 'MODEL',
        modelRevisionVerified: false,
        operationalStatus: 'enabled',
        profileId: 'PROFILE',
        profileKey: 'generation_without_images',
        profileToken: 'TOKEN',
        queueCapacity: 10,
        totalTimeBudgetSeconds: 1_200,
        validAttestation: false,
      } as never),
    ).toMatchObject({
      administrativeStatus: 'blocked',
      blockers: [
        { code: 'connection_inactive' },
        { code: 'attestation_invalid' },
        { code: 'active_secret_missing' },
        { code: 'connection_verification_missing' },
        { code: 'model_revision_unverified' },
      ],
      configurationStatus: 'blocked',
    })
  })
})

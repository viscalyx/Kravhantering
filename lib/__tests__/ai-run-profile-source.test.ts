import { describe, expect, it, vi } from 'vitest'
import { createSqlServerAiRunProfileSource } from '@/lib/dal/ai-run-profiles'
import type { SqlServerDatabase } from '@/lib/db'

describe('SQL Server AI run profile source', () => {
  it('loads one exact stable profile configuration and its persisted model revision', async () => {
    const query = vi.fn().mockResolvedValue([
      {
        adapterType: 'controlled_test',
        adapterVersion: '1',
        agentRuntimeKey: 'controlled_runtime',
        attestationIsPersonalDataProcessed: false,
        attestationIsTrainingAllowed: false,
        attestationMaximumInformationClass: 'internal',
        attestationMaximumRetentionDays: 0,
        attestationProcessingRegionsJson: '["SE"]',
        attestationSubprocessorsJson: '[]',
        connectionAgentRuntimeVersion: 'runtime-v2',
        connectionConfigurationVersion: 7,
        connectionId: 'connection-17',
        connectionLifecycleStatus: 'active',
        connectionMaximumConcurrency: 4,
        connectionPublicName: 'Approved test connection',
        dataPolicySummary: 'Approved for test data.',
        egressPolicyKey: 'controlled_test',
        endpointUrl: 'https://adapter.invalid/v1',
        externalModelId: 'controlled/model-v1',
        externalModelVersion: 'model-v1',
        modelRevisionAgentRuntimeVersion: 'runtime-v2',
        modelRevisionConnectionConfigurationVersion: 7,
        modelRevisionId: 'model-revision-23',
        modelRevisionMaximumConcurrency: 2,
        modelRevisionStatus: 'verified',
        operationalStatus: 'enabled',
        inactivityTimeBudgetSeconds: 300,
        maximumBufferedEvents: 32,
        maximumOutputBytes: 4194304,
        maximumOutputTokens: 8192,
        maximumRetainedMemoryBytes: 8388608,
        profileConfigurationVersion: 31,
        profileId: 'profile-31',
        queueCapacity: 10,
        tlsPolicyKey: 'public_web_pki',
        totalTimeBudgetSeconds: 1200,
        authenticationType: 'static_secret',
        verifiedCapabilitiesJson: '{"validatableJson":true}',
      },
    ])
    const db = { query } as unknown as SqlServerDatabase
    const source = createSqlServerAiRunProfileSource(db)

    await expect(source.findProfile('generation_with_images')).resolves.toEqual(
      {
        adapterType: 'controlled_test',
        adapterVersion: '1',
        connectionAgentRuntimeVersion: 'runtime-v2',
        connectionConfiguration: {
          agentRuntimeKey: 'controlled_runtime',
          agentRuntimeVersion: 'runtime-v2',
          authenticationType: 'static_secret',
          dataPolicySummary: 'Approved for test data.',
          egressPolicyKey: 'controlled_test',
          endpointUrl: 'https://adapter.invalid/v1',
          tlsPolicyKey: 'public_web_pki',
        },
        connectionConfigurationVersion: 7,
        connectionDataPolicySummary: 'Approved for test data.',
        connectionId: 'connection-17',
        connectionLifecycleStatus: 'active',
        connectionMaximumConcurrency: 4,
        connectionPublicName: 'Approved test connection',
        externalModelId: 'controlled/model-v1',
        modelRevisionAgentRuntimeVersion: 'runtime-v2',
        modelRevisionConfiguration: { externalModelVersion: 'model-v1' },
        modelRevisionConnectionConfigurationVersion: 7,
        modelRevisionId: 'model-revision-23',
        modelRevisionMaximumConcurrency: 2,
        modelRevisionStatus: 'verified',
        operationalStatus: 'enabled',
        inactivityTimeBudgetSeconds: 300,
        maximumBufferedEvents: 32,
        maximumOutputBytes: 4194304,
        maximumOutputTokens: 8192,
        maximumRetainedMemoryBytes: 8388608,
        profileConfigurationVersion: 31,
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
        totalTimeBudgetSeconds: 1200,
        verifiedCapabilitiesJson: '{"validatableJson":true}',
      },
    )
    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(
        /FROM \[ai_run_profiles\][\s\S]*JOIN \[ai_connection_model_revisions\][\s\S]*JOIN \[ai_connection_models\][\s\S]*JOIN \[ai_connections\]/u,
      ),
      ['generation_with_images'],
    )
    expect(query.mock.calls[0]?.[0]).toContain(
      '[profile].[configuration_version]',
    )
    expect(query.mock.calls[0]?.[0]).toContain('[profile].[profile_key] = @0')
    expect(query.mock.calls[0]?.[0]).toContain('[model].[deleted_at] IS NULL')
  })

  it('returns null when the fixed slot is unconfigured', async () => {
    const query = vi.fn().mockResolvedValue([])
    const db = { query } as unknown as SqlServerDatabase

    await expect(
      createSqlServerAiRunProfileSource(db).findProfile('invalid_json_repair'),
    ).resolves.toBeNull()
  })

  it('fails closed when attestation policy JSON is malformed', async () => {
    const query = vi.fn().mockResolvedValue([
      {
        attestationProcessingRegionsJson: 'not JSON',
        attestationSubprocessorsJson: '[]',
      },
    ])
    const db = { query } as unknown as SqlServerDatabase

    await expect(
      createSqlServerAiRunProfileSource(db).findProfile(
        'generation_without_images',
      ),
    ).resolves.toMatchObject({ trustConfiguration: null })
  })

  it('preserves a null optional model concurrency limit', async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValue([{ modelRevisionMaximumConcurrency: null }]),
    } as unknown as SqlServerDatabase

    await expect(
      createSqlServerAiRunProfileSource(db).findProfile(
        'generation_without_images',
      ),
    ).resolves.toMatchObject({ modelRevisionMaximumConcurrency: null })
  })
})

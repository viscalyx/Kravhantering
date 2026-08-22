import type {
  AiPersistedConnectionLifecycleStatus,
  AiPersistedModelRevisionStatus,
  AiPersistedRunProfile,
  AiRunProfileKey,
  AiRunProfileOperationalStatus,
  AiRunProfileSource,
} from '@/lib/ai/profile-resolver'
import type { SqlServerDatabase } from '@/lib/db'

interface AiRunProfileRow {
  adapterType: string
  adapterVersion: string
  agentRuntimeKey: string | null
  attestationIsPersonalDataProcessed: boolean
  attestationIsTrainingAllowed: boolean
  attestationMaximumInformationClass: string
  attestationMaximumRetentionDays: number
  attestationProcessingRegionsJson: string
  attestationSubprocessorsJson: string
  authenticationType: string
  connectionAgentRuntimeVersion: string | null
  connectionConfigurationVersion: number
  connectionId: string
  connectionLifecycleStatus: AiPersistedConnectionLifecycleStatus
  connectionMaximumConcurrency: number
  connectionPublicName: string
  dataPolicySummary: string
  egressPolicyKey: string
  endpointUrl: string
  externalModelId: string
  externalModelVersion: string | null
  inactivityTimeBudgetSeconds: number
  maximumBufferedEvents: number
  maximumOutputBytes: number
  maximumOutputTokens: number
  maximumRetainedMemoryBytes: number
  modelRevisionAgentRuntimeVersion: string | null
  modelRevisionConnectionConfigurationVersion: number
  modelRevisionId: string
  modelRevisionMaximumConcurrency: number | null
  modelRevisionStatus: AiPersistedModelRevisionStatus
  operationalStatus: AiRunProfileOperationalStatus
  profileConfigurationVersion: number
  profileId: string
  queueCapacity: number
  tlsPolicyKey: string
  totalTimeBudgetSeconds: number
  verifiedCapabilitiesJson: string | null
}

const RUN_PROFILE_QUERY = `
  SELECT TOP (1)
    [profile].[id] AS [profileId],
    [profile].[configuration_version] AS [profileConfigurationVersion],
    [profile].[operational_status] AS [operationalStatus],
    [profile].[total_time_budget_seconds] AS [totalTimeBudgetSeconds],
    [profile].[inactivity_time_budget_seconds]
      AS [inactivityTimeBudgetSeconds],
    [profile].[queue_capacity] AS [queueCapacity],
    [profile].[maximum_output_tokens] AS [maximumOutputTokens],
    [profile].[maximum_output_bytes] AS [maximumOutputBytes],
    [profile].[maximum_retained_memory_bytes] AS [maximumRetainedMemoryBytes],
    [profile].[maximum_buffered_events] AS [maximumBufferedEvents],
    [model_revision].[id] AS [modelRevisionId],
    [model_revision].[maximum_concurrency] AS [modelRevisionMaximumConcurrency],
    [model_revision].[status] AS [modelRevisionStatus],
    [model_revision].[connection_configuration_version]
      AS [modelRevisionConnectionConfigurationVersion],
    [model_revision].[external_model_id] AS [externalModelId],
    [model_revision].[external_model_version] AS [externalModelVersion],
    [model_revision].[agent_runtime_version]
      AS [modelRevisionAgentRuntimeVersion],
    [model_revision].[verified_capabilities_json] AS [verifiedCapabilitiesJson],
    [connection].[id] AS [connectionId],
    [connection].[lifecycle_status] AS [connectionLifecycleStatus],
    [connection].[configuration_version] AS [connectionConfigurationVersion],
    [connection].[maximum_concurrency] AS [connectionMaximumConcurrency],
    [connection].[public_name] AS [connectionPublicName],
    [connection].[adapter_key] AS [adapterType],
    [connection].[adapter_version] AS [adapterVersion],
    [connection].[endpoint_url] AS [endpointUrl],
    [connection].[authentication_type] AS [authenticationType],
    [connection].[tls_policy_key] AS [tlsPolicyKey],
    [connection].[egress_policy_key] AS [egressPolicyKey],
    [connection].[agent_runtime_key] AS [agentRuntimeKey],
    [connection].[agent_runtime_version] AS [connectionAgentRuntimeVersion],
    [connection].[data_policy_summary] AS [dataPolicySummary],
    [attestation].[maximum_information_class]
      AS [attestationMaximumInformationClass],
    [attestation].[is_personal_data_processed]
      AS [attestationIsPersonalDataProcessed],
    [attestation].[subprocessors_json] AS [attestationSubprocessorsJson],
    [attestation].[processing_regions_json]
      AS [attestationProcessingRegionsJson],
    [attestation].[is_training_allowed] AS [attestationIsTrainingAllowed],
    [attestation].[maximum_retention_days]
      AS [attestationMaximumRetentionDays]
  FROM [ai_run_profiles] AS [profile]
  INNER JOIN [ai_connection_model_revisions] AS [model_revision]
    ON [model_revision].[id] = [profile].[ai_connection_model_revision_id]
  INNER JOIN [ai_connection_models] AS [model]
    ON [model].[id] = [model_revision].[ai_connection_model_id]
    AND [model].[deleted_at] IS NULL
  INNER JOIN [ai_connections] AS [connection]
    ON [connection].[id] = [model].[ai_connection_id]
  INNER JOIN [ai_connection_attestations] AS [attestation]
    ON [attestation].[ai_connection_id] = [connection].[id]
    AND [attestation].[status] = N'valid'
    AND ([attestation].[review_due_at] IS NULL
      OR [attestation].[review_due_at] > SYSUTCDATETIME())
  WHERE [profile].[profile_key] = @0
`

function stringArray(value: string): readonly string[] | null {
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) &&
      parsed.every(item => typeof item === 'string' && item.length > 0)
      ? parsed
      : null
  } catch {
    return null
  }
}

function mapRow(row: AiRunProfileRow): AiPersistedRunProfile {
  const processingRegions = stringArray(row.attestationProcessingRegionsJson)
  const subprocessors = stringArray(row.attestationSubprocessorsJson)
  return {
    adapterType: row.adapterType,
    adapterVersion: row.adapterVersion,
    connectionAgentRuntimeVersion: row.connectionAgentRuntimeVersion,
    connectionConfiguration: Object.freeze({
      agentRuntimeKey: row.agentRuntimeKey,
      agentRuntimeVersion: row.connectionAgentRuntimeVersion,
      authenticationType: row.authenticationType,
      dataPolicySummary: row.dataPolicySummary,
      egressPolicyKey: row.egressPolicyKey,
      endpointUrl: row.endpointUrl,
      tlsPolicyKey: row.tlsPolicyKey,
    }),
    connectionConfigurationVersion: Number(row.connectionConfigurationVersion),
    connectionDataPolicySummary: row.dataPolicySummary,
    connectionId: row.connectionId,
    connectionLifecycleStatus: row.connectionLifecycleStatus,
    connectionMaximumConcurrency: Number(row.connectionMaximumConcurrency),
    connectionPublicName: row.connectionPublicName,
    externalModelId: row.externalModelId,
    inactivityTimeBudgetSeconds: Number(row.inactivityTimeBudgetSeconds),
    maximumBufferedEvents: Number(row.maximumBufferedEvents),
    maximumOutputBytes: Number(row.maximumOutputBytes),
    maximumOutputTokens: Number(row.maximumOutputTokens),
    maximumRetainedMemoryBytes: Number(row.maximumRetainedMemoryBytes),
    modelRevisionAgentRuntimeVersion: row.modelRevisionAgentRuntimeVersion,
    modelRevisionConfiguration: Object.freeze({
      externalModelVersion: row.externalModelVersion,
    }),
    modelRevisionConnectionConfigurationVersion: Number(
      row.modelRevisionConnectionConfigurationVersion,
    ),
    modelRevisionId: row.modelRevisionId,
    modelRevisionMaximumConcurrency:
      row.modelRevisionMaximumConcurrency === null
        ? null
        : Number(row.modelRevisionMaximumConcurrency),
    modelRevisionStatus: row.modelRevisionStatus,
    operationalStatus: row.operationalStatus,
    profileConfigurationVersion: Number(row.profileConfigurationVersion),
    profileId: row.profileId,
    queueCapacity: Number(row.queueCapacity),
    totalTimeBudgetSeconds: Number(row.totalTimeBudgetSeconds),
    trustConfiguration:
      processingRegions && subprocessors
        ? Object.freeze({
            authenticationType: row.authenticationType as
              | 'mtls'
              | 'none'
              | 'oauth2_client_credentials'
              | 'static_secret',
            dataPolicy: Object.freeze({
              isPersonalDataProcessed: Boolean(
                row.attestationIsPersonalDataProcessed,
              ),
              isTrainingAllowed: Boolean(row.attestationIsTrainingAllowed),
              maximumInformationClass: row.attestationMaximumInformationClass,
              maximumRetentionDays: Number(row.attestationMaximumRetentionDays),
              processingRegions: Object.freeze([...processingRegions]),
              subprocessors: Object.freeze([...subprocessors]),
            }),
            egressPolicyKey: row.egressPolicyKey,
            endpointUrl: row.endpointUrl,
            tlsPolicyKey: row.tlsPolicyKey,
          })
        : null,
    verifiedCapabilitiesJson: row.verifiedCapabilitiesJson,
  }
}

export function createSqlServerAiRunProfileSource(
  db: SqlServerDatabase,
): AiRunProfileSource {
  return {
    async findProfile(
      profileKey: AiRunProfileKey,
    ): Promise<AiPersistedRunProfile | null> {
      const rows = (await db.query(RUN_PROFILE_QUERY, [
        profileKey,
      ])) as AiRunProfileRow[]
      return rows[0] ? mapRow(rows[0]) : null
    },
  }
}

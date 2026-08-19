import type {
  AiPersistedConnectionLifecycleStatus,
  AiPersistedModelRevisionStatus,
  AiPersistedRunProfile,
  AiPersistedRunProfileRevisionStatus,
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
  capabilityPolicyJson: string
  connectionAgentRuntimeVersion: string | null
  connectionConfigurationVersion: number
  connectionId: string
  connectionLifecycleStatus: AiPersistedConnectionLifecycleStatus
  dataPolicySummary: string
  egressPolicyKey: string
  endpointUrl: string
  externalModelId: string
  externalModelVersion: string | null
  modelRevisionAgentRuntimeVersion: string | null
  modelRevisionConnectionConfigurationVersion: number
  modelRevisionId: string
  modelRevisionStatus: AiPersistedModelRevisionStatus
  operationalStatus: AiRunProfileOperationalStatus
  profileRevisionId: string
  profileRevisionStatus: AiPersistedRunProfileRevisionStatus
  tlsPolicyKey: string
  verifiedCapabilitiesJson: string | null
}

const ACTIVE_RUN_PROFILE_QUERY = `
  SELECT TOP (1)
    [profile].[operational_status] AS [operationalStatus],
    [revision].[id] AS [profileRevisionId],
    [revision].[status] AS [profileRevisionStatus],
    [revision].[capability_policy_json] AS [capabilityPolicyJson],
    [model_revision].[id] AS [modelRevisionId],
    [model_revision].[status] AS [modelRevisionStatus],
    [model_revision].[connection_configuration_version]
      AS [modelRevisionConnectionConfigurationVersion],
    [model_revision].[external_model_id] AS [externalModelId],
    [model_revision].[external_model_version] AS [externalModelVersion],
    [model_revision].[agent_runtime_version]
      AS [modelRevisionAgentRuntimeVersion],
    [model_revision].[verified_capabilities_json]
      AS [verifiedCapabilitiesJson],
    [connection].[id] AS [connectionId],
    [connection].[lifecycle_status] AS [connectionLifecycleStatus],
    [connection].[configuration_version] AS [connectionConfigurationVersion],
    [connection].[adapter_key] AS [adapterType],
    [connection].[adapter_version] AS [adapterVersion],
    [connection].[endpoint_url] AS [endpointUrl],
    [connection].[authentication_type] AS [authenticationType],
    [connection].[tls_policy_key] AS [tlsPolicyKey],
    [connection].[egress_policy_key] AS [egressPolicyKey],
    [connection].[agent_runtime_key] AS [agentRuntimeKey],
    [connection].[agent_runtime_version] AS [connectionAgentRuntimeVersion],
    [connection].[data_policy_summary] AS [dataPolicySummary]
    ,[attestation].[maximum_information_class]
      AS [attestationMaximumInformationClass]
    ,[attestation].[is_personal_data_processed]
      AS [attestationIsPersonalDataProcessed]
    ,[attestation].[subprocessors_json] AS [attestationSubprocessorsJson]
    ,[attestation].[processing_regions_json]
      AS [attestationProcessingRegionsJson]
    ,[attestation].[is_training_allowed] AS [attestationIsTrainingAllowed]
    ,[attestation].[maximum_retention_days]
      AS [attestationMaximumRetentionDays]
  FROM [ai_run_profiles] AS [profile]
  INNER JOIN [ai_run_profile_revisions] AS [revision]
    ON [revision].[ai_run_profile_id] = [profile].[id]
  INNER JOIN [ai_connection_model_revisions] AS [model_revision]
    ON [model_revision].[id] = [revision].[ai_connection_model_revision_id]
  INNER JOIN [ai_connection_models] AS [model]
    ON [model].[id] = [model_revision].[ai_connection_model_id]
  INNER JOIN [ai_connections] AS [connection]
    ON [connection].[id] = [model].[ai_connection_id]
  INNER JOIN [ai_connection_attestations] AS [attestation]
    ON [attestation].[ai_connection_id] = [connection].[id]
    AND [attestation].[status] = N'valid'
    AND ([attestation].[review_due_at] IS NULL
      OR [attestation].[review_due_at] > SYSUTCDATETIME())
  WHERE [profile].[profile_key] = @0
    AND [revision].[status] = N'active'
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
    capabilityPolicyJson: row.capabilityPolicyJson,
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
    connectionId: row.connectionId,
    connectionLifecycleStatus: row.connectionLifecycleStatus,
    externalModelId: row.externalModelId,
    modelRevisionAgentRuntimeVersion: row.modelRevisionAgentRuntimeVersion,
    modelRevisionConfiguration: Object.freeze({
      externalModelVersion: row.externalModelVersion,
    }),
    modelRevisionConnectionConfigurationVersion: Number(
      row.modelRevisionConnectionConfigurationVersion,
    ),
    modelRevisionId: row.modelRevisionId,
    modelRevisionStatus: row.modelRevisionStatus,
    operationalStatus: row.operationalStatus,
    profileRevisionId: row.profileRevisionId,
    profileRevisionStatus: row.profileRevisionStatus,
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
    async findActiveRevision(
      profileKey: AiRunProfileKey,
    ): Promise<AiPersistedRunProfile | null> {
      const rows = (await db.query(ACTIVE_RUN_PROFILE_QUERY, [
        profileKey,
      ])) as AiRunProfileRow[]
      return rows[0] ? mapRow(rows[0]) : null
    },
  }
}

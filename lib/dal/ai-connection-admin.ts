import { createHash, randomUUID } from 'node:crypto'
import {
  type AiCapability,
  aiCapabilitySchema,
  type CreateAiConnection,
} from '@/lib/ai/admin-contracts'
import {
  type AiAdminActivationSnapshot,
  type AiAdminAttestationRecord,
  type AiAdminAudit,
  type AiAdminBlocker,
  type AiAdminConnectionDetail,
  type AiAdminConnectionSummary,
  type AiAdminModelRecord,
  type AiAdminModelRevisionRecord,
  type AiAdminRunProfileRecord,
  type AiAdminStore,
  type AiAdminStoredConnectionDetail,
  deriveAiRunProfileAdministrativeStatus,
} from '@/lib/ai/admin-service'
import type { AiRunProfileKey } from '@/lib/ai/profile-resolver'
import type { SqlServerDatabase, SqlServerEntityManager } from '@/lib/db'
import { conflictError } from '@/lib/requirements/errors'

interface ConnectionRow {
  activeSecretId: string | null
  activeSecretRootKeyVersion: string | null
  adapterKey: string
  adapterVersion: string
  administrationName: string
  agentRuntimeKey: string | null
  agentRuntimeVersion: string | null
  authenticationType: AiAdminConnectionDetail['authenticationType']
  configurationVersion: number | string
  connectionEvidenceId: string | null
  dataPolicySummary: string
  description: string | null
  egressPolicyKey: string
  endpointUrl: string
  hasValidAttestation: boolean | number
  hasVerifiedModel: boolean | number
  id: string
  lifecycleStatus: AiAdminConnectionSummary['lifecycleStatus']
  maximumConcurrency: number | string
  operationalHealth: AiAdminConnectionSummary['operationalHealth'] | null
  publicName: string
  revisionToken: string
  tlsPolicyKey: string
}

interface AttestationRow {
  connectionId: string
  decisionReference: string | null
  id: string
  incidentResponseReference: string | null
  isPersonalDataProcessed: boolean | null
  isTrainingAllowed: boolean | null
  maximumInformationClass: string | null
  maximumRetentionDays: number | string | null
  processingRegionsJson: string | null
  providerName: string | null
  purpose: string | null
  responsibleOrganizationUnitReference: string | null
  reviewDueAt: Date | string | null
  reviewedAt: Date | string | null
  revisionNumber: number | string
  revisionToken: string
  status: AiAdminAttestationRecord['status']
  subprocessorsJson: string | null
}

interface ModelRow {
  agentRuntimeVersion: string | null
  connectionConfigurationVersion: number | string
  connectionId: string
  declaredCapabilitiesJson: string
  description: string | null
  discoveredCapabilitiesJson: string | null
  externalModelId: string
  externalModelVersion: string | null
  modelId: string
  modelName: string
  modelRevisionToken: string
  modelToken: string
  profileCompatibilityJson: string | null
  revisionId: string
  revisionNumber: number | string
  status: AiAdminModelRevisionRecord['status']
  testSuiteVersion: string | null
  verifiedAt: Date | string | null
  verifiedCapabilitiesJson: string | null
}

interface ProfileRow {
  activeSecretAvailable: boolean
  authenticationType: AiAdminStoredConnectionDetail['authenticationType'] | null
  configurationStatus: AiAdminRunProfileRecord['configurationStatus']
  configurationVersion: number | string
  connectionActive: boolean
  connectionEvidenceAvailable: boolean
  inactivityTimeBudgetSeconds: number | string
  maximumBufferedEvents: number | string
  maximumOutputBytes: number | string
  maximumOutputTokens: number | string
  maximumRetainedMemoryBytes: number | string
  modelRevisionId: string | null
  modelRevisionVerified: boolean
  operationalStatus: AiAdminRunProfileRecord['operationalStatus']
  profileId: string
  profileKey: AiRunProfileKey
  profileToken: string
  queueCapacity: number | string
  totalTimeBudgetSeconds: number | string
  validAttestation: boolean
}

const CONNECTION_COLUMNS = `
  [connection].[id],
  [connection].[administration_name] AS [administrationName],
  [connection].[public_name] AS [publicName],
  [connection].[description],
  [connection].[adapter_key] AS [adapterKey],
  [connection].[adapter_version] AS [adapterVersion],
  [connection].[endpoint_url] AS [endpointUrl],
  [connection].[authentication_type] AS [authenticationType],
  [connection].[tls_policy_key] AS [tlsPolicyKey],
  [connection].[egress_policy_key] AS [egressPolicyKey],
  [connection].[agent_runtime_key] AS [agentRuntimeKey],
  [connection].[agent_runtime_version] AS [agentRuntimeVersion],
  [connection].[data_policy_summary] AS [dataPolicySummary],
  [connection].[lifecycle_status] AS [lifecycleStatus],
  [connection].[configuration_version] AS [configurationVersion],
  [connection].[maximum_concurrency] AS [maximumConcurrency],
  [connection].[revision_token] AS [revisionToken],
  [secret].[id] AS [activeSecretId],
  [secret].[root_key_version] AS [activeSecretRootKeyVersion],
  [evidence].[id] AS [connectionEvidenceId],
  CAST(CASE WHEN [attestation].[id] IS NULL THEN 0 ELSE 1 END AS bit)
    AS [hasValidAttestation],
  CAST(CASE WHEN EXISTS (
    SELECT 1
    FROM [ai_connection_models] AS [model]
    INNER JOIN [ai_connection_model_revisions] AS [model_revision]
      ON [model_revision].[ai_connection_model_id] = [model].[id]
    WHERE [model].[ai_connection_id] = [connection].[id]
      AND [model].[deleted_at] IS NULL
      AND [model_revision].[status] = N'verified'
      AND [model_revision].[connection_configuration_version]
        = [connection].[configuration_version]
  ) THEN 1 ELSE 0 END AS bit) AS [hasVerifiedModel],
  COALESCE((
    SELECT CASE
      WHEN SUM(CASE WHEN [state].[health_status] = N'unavailable' THEN 1 ELSE 0 END) > 0
        THEN N'unavailable'
      WHEN SUM(CASE WHEN [state].[health_status] = N'degraded' THEN 1 ELSE 0 END) > 0
        THEN N'degraded'
      WHEN SUM(CASE WHEN [state].[health_status] = N'healthy' THEN 1 ELSE 0 END) > 0
        THEN N'healthy'
      ELSE N'unknown'
    END
    FROM [ai_connection_models] AS [health_model]
    INNER JOIN [ai_connection_model_revisions] AS [health_revision]
      ON [health_revision].[ai_connection_model_id] = [health_model].[id]
    INNER JOIN [ai_connection_model_operational_states] AS [state]
      ON [state].[ai_connection_model_revision_id] = [health_revision].[id]
    WHERE [health_model].[ai_connection_id] = [connection].[id]
      AND [health_model].[deleted_at] IS NULL
      AND [health_revision].[connection_configuration_version]
        = [connection].[configuration_version]
  ), N'unknown') AS [operationalHealth]`

const CONNECTION_JOINS = `
  OUTER APPLY (
    SELECT TOP (1) [candidate].[id], [candidate].[root_key_version]
    FROM [ai_provider_secret_versions] AS [candidate]
    WHERE [candidate].[ai_connection_id] = [connection].[id]
      AND [candidate].[status] = N'active'
      AND [candidate].[ciphertext] IS NOT NULL
  ) AS [secret]
  OUTER APPLY (
    SELECT TOP (1)
      CASE WHEN [candidate].[outcome] = N'passed'
        AND ([candidate].[expires_at] IS NULL
          OR [candidate].[expires_at] > SYSUTCDATETIME())
        THEN [candidate].[id] ELSE NULL END AS [id]
    FROM [ai_connection_verification_evidence] AS [candidate]
    WHERE [candidate].[ai_connection_id] = [connection].[id]
      AND [candidate].[connection_configuration_version]
        = [connection].[configuration_version]
      AND [candidate].[adapter_version] = [connection].[adapter_version]
      AND ([candidate].[agent_runtime_version] = [connection].[agent_runtime_version]
        OR ([candidate].[agent_runtime_version] IS NULL
          AND [connection].[agent_runtime_version] IS NULL))
      AND ([candidate].[outcome] = N'passed'
        OR [candidate].[failure_category]
          IN (N'authentication_failed', N'runtime_health_contradiction'))
    ORDER BY [candidate].[verified_at] DESC, [candidate].[id] DESC
  ) AS [evidence]
  OUTER APPLY (
    SELECT TOP (1) [candidate].[id]
    FROM [ai_connection_attestations] AS [candidate]
    WHERE [candidate].[ai_connection_id] = [connection].[id]
      AND [candidate].[status] = N'valid'
      AND ([candidate].[review_due_at] IS NULL
        OR [candidate].[review_due_at] > SYSUTCDATETIME())
  ) AS [attestation]`

function jsonArray(value: string | null): string[] | null {
  if (value === null) return null
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) &&
      parsed.every(item => typeof item === 'string')
      ? parsed
      : null
  } catch {
    return null
  }
}

function jsonCapability(value: string | null): AiCapability | null {
  if (value === null) return null
  try {
    const parsed = aiCapabilitySchema.safeParse(JSON.parse(value) as unknown)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

function iso(value: Date | string | null): string | null {
  if (value === null) return null
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString()
}

function sameId(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase())
}

function blockers(row: ConnectionRow): AiAdminBlocker[] {
  const result: AiAdminBlocker[] = []
  if (!row.hasValidAttestation) result.push({ code: 'attestation_invalid' })
  if (row.authenticationType !== 'none' && !row.activeSecretId) {
    result.push({ code: 'active_secret_missing' })
  }
  if (!row.connectionEvidenceId) {
    result.push({ code: 'connection_verification_missing' })
  }
  if (!row.hasVerifiedModel) {
    result.push({ code: 'model_revision_unverified' })
  }
  return result
}

function summary(row: ConnectionRow): AiAdminConnectionSummary {
  return {
    administrationName: row.administrationName,
    configurationVersion: Number(row.configurationVersion),
    id: row.id,
    lifecycleStatus: row.lifecycleStatus,
    operationalHealth: row.operationalHealth ?? 'unknown',
    publicName: row.publicName,
    revisionToken: row.revisionToken,
  }
}

function activeSecret(
  row: ConnectionRow,
): AiAdminStoredConnectionDetail['activeSecret'] {
  return row.activeSecretId && row.activeSecretRootKeyVersion
    ? {
        available: true,
        rootKeyVersion: row.activeSecretRootKeyVersion,
        secretVersionId: row.activeSecretId,
      }
    : { available: false, reason: 'secret_missing' }
}

function attestation(row: AttestationRow): AiAdminAttestationRecord {
  return {
    decisionReference: row.decisionReference,
    id: row.id,
    incidentResponseReference: row.incidentResponseReference,
    isPersonalDataProcessed: row.isPersonalDataProcessed,
    isTrainingAllowed: row.isTrainingAllowed,
    maximumInformationClass: row.maximumInformationClass,
    maximumRetentionDays:
      row.maximumRetentionDays === null
        ? null
        : Number(row.maximumRetentionDays),
    processingRegions: jsonArray(row.processingRegionsJson),
    providerName: row.providerName,
    purpose: row.purpose,
    responsibleOrganizationUnitReference:
      row.responsibleOrganizationUnitReference,
    reviewDueAt: iso(row.reviewDueAt),
    reviewedAt: iso(row.reviewedAt),
    revisionNumber: Number(row.revisionNumber),
    revisionToken: row.revisionToken,
    status: row.status,
    subprocessors: jsonArray(row.subprocessorsJson),
  }
}

function models(rows: readonly ModelRow[]): AiAdminModelRecord[] {
  const byId = new Map<string, AiAdminModelRecord>()
  for (const row of rows) {
    let model = byId.get(row.modelId)
    if (!model) {
      model = {
        description: row.description,
        id: row.modelId,
        name: row.modelName,
        revisionToken: row.modelToken,
        revisions: [],
      }
      byId.set(row.modelId, model)
    }
    ;(model.revisions as AiAdminModelRevisionRecord[]).push({
      agentRuntimeVersion: row.agentRuntimeVersion,
      connectionConfigurationVersion: Number(
        row.connectionConfigurationVersion,
      ),
      declaredCapabilities:
        jsonCapability(row.declaredCapabilitiesJson) ?? emptyCapabilities(),
      discoveredCapabilities: jsonCapability(row.discoveredCapabilitiesJson),
      externalModelId: row.externalModelId,
      externalModelVersion: row.externalModelVersion,
      id: row.revisionId,
      profileCompatibility: row.profileCompatibilityJson
        ? (JSON.parse(
            row.profileCompatibilityJson,
          ) as AiAdminModelRevisionRecord['profileCompatibility'])
        : null,
      revisionNumber: Number(row.revisionNumber),
      revisionToken: row.modelRevisionToken,
      status: row.status,
      testSuiteVersion: row.testSuiteVersion,
      verifiedAt: iso(row.verifiedAt),
      verifiedCapabilities: jsonCapability(row.verifiedCapabilitiesJson),
    })
  }
  return [...byId.values()]
}

function emptyCapabilities(): AiCapability {
  return {
    aiAnalysis: false,
    cost: false,
    imageInput: false,
    jsonSchemaSteering: false,
    streaming: false,
    tokenUsage: false,
    validatableJson: false,
  }
}

async function loadConnection(
  executor: SqlServerDatabase | SqlServerEntityManager,
  connectionId: string,
): Promise<AiAdminStoredConnectionDetail | null> {
  return (await loadConnections(executor, [connectionId]))[0] ?? null
}

async function loadConnections(
  executor: SqlServerDatabase | SqlServerEntityManager,
  connectionIds: readonly string[],
): Promise<AiAdminStoredConnectionDetail[]> {
  if (connectionIds.length === 0) return []
  const idsJson = JSON.stringify([...new Set(connectionIds)])
  const connectionRows = await executor.query<ConnectionRow[]>(
    `SELECT ${CONNECTION_COLUMNS}
     FROM [ai_connections] AS [connection]
     ${CONNECTION_JOINS}
     WHERE [connection].[id] IN (
       SELECT TRY_CONVERT(uniqueidentifier, [value]) FROM OPENJSON(@0)
     )`,
    [idsJson],
  )
  const [attestationRows, modelRows] = await Promise.all([
    executor.query<AttestationRow[]>(
      `SELECT [ai_connection_id] AS [connectionId], [id],
         [revision_number] AS [revisionNumber], [status],
         [responsible_organization_unit_reference]
           AS [responsibleOrganizationUnitReference],
         [purpose], [maximum_information_class] AS [maximumInformationClass],
         [is_personal_data_processed] AS [isPersonalDataProcessed],
         [provider_name] AS [providerName],
         [subprocessors_json] AS [subprocessorsJson],
         [processing_regions_json] AS [processingRegionsJson],
         [is_training_allowed] AS [isTrainingAllowed],
         [maximum_retention_days] AS [maximumRetentionDays],
         [incident_response_reference] AS [incidentResponseReference],
         [decision_reference] AS [decisionReference],
         [reviewed_at] AS [reviewedAt], [review_due_at] AS [reviewDueAt],
         [revision_token] AS [revisionToken]
       FROM [ai_connection_attestations]
       WHERE [ai_connection_id] IN (
         SELECT TRY_CONVERT(uniqueidentifier, [value]) FROM OPENJSON(@0)
       )
       ORDER BY [ai_connection_id],
         CASE WHEN [status] = N'valid' THEN 0 ELSE 1 END,
         [revision_number] DESC`,
      [idsJson],
    ),
    executor.query<ModelRow[]>(
      `SELECT [model].[ai_connection_id] AS [connectionId],
         [model].[id] AS [modelId], [model].[name] AS [modelName],
         [model].[description], [model].[revision_token] AS [modelToken],
         [revision].[id] AS [revisionId],
         [revision].[revision_number] AS [revisionNumber],
         [revision].[connection_configuration_version]
           AS [connectionConfigurationVersion],
         [revision].[status],
         [revision].[external_model_id] AS [externalModelId],
         [revision].[external_model_version] AS [externalModelVersion],
         [revision].[agent_runtime_version] AS [agentRuntimeVersion],
         [revision].[declared_capabilities_json] AS [declaredCapabilitiesJson],
         [revision].[discovered_capabilities_json]
           AS [discoveredCapabilitiesJson],
         [revision].[verified_capabilities_json]
           AS [verifiedCapabilitiesJson],
         [revision].[revision_token] AS [modelRevisionToken]
         , [model_evidence].[profile_compatibility_json]
             AS [profileCompatibilityJson]
         , [model_evidence].[test_suite_version] AS [testSuiteVersion]
         , [model_evidence].[verified_at] AS [verifiedAt]
       FROM [ai_connection_models] AS [model]
       INNER JOIN [ai_connection_model_revisions] AS [revision]
         ON [revision].[ai_connection_model_id] = [model].[id]
       OUTER APPLY (
         SELECT TOP (1) [candidate].[profile_compatibility_json],
           [candidate].[test_suite_version], [candidate].[verified_at]
         FROM [ai_connection_model_verification_evidence] AS [candidate]
         WHERE [candidate].[ai_connection_model_revision_id] = [revision].[id]
         ORDER BY [candidate].[verified_at] DESC, [candidate].[id] DESC
       ) AS [model_evidence]
       WHERE [model].[ai_connection_id] IN (
         SELECT TRY_CONVERT(uniqueidentifier, [value]) FROM OPENJSON(@0)
       )
         AND [model].[deleted_at] IS NULL
       ORDER BY [model].[ai_connection_id], [model].[created_at],
         [revision].[revision_number]`,
      [idsJson],
    ),
  ])
  return connectionRows.map(row => {
    const connectionAttestations = attestationRows.filter(candidate =>
      sameId(candidate.connectionId, row.id),
    )
    const validAttestationRow = connectionAttestations.find(
      candidate => candidate.status === 'valid',
    )
    const draftAttestationRow = connectionAttestations.find(
      candidate => candidate.status === 'draft',
    )
    const attestationRow =
      validAttestationRow ?? draftAttestationRow ?? connectionAttestations[0]
    return {
      ...summary(row),
      activeSecret: activeSecret(row),
      adapterKey: row.adapterKey,
      adapterVersion: row.adapterVersion,
      agentRuntimeKey: row.agentRuntimeKey,
      agentRuntimeVersion: row.agentRuntimeVersion,
      attestation: attestationRow ? attestation(attestationRow) : null,
      attestationDraft: draftAttestationRow
        ? attestation(draftAttestationRow)
        : null,
      authenticationType: row.authenticationType,
      blockers: blockers(row),
      connectionEvidenceId: row.connectionEvidenceId,
      dataPolicySummary: row.dataPolicySummary,
      description: row.description,
      egressPolicyKey: row.egressPolicyKey,
      endpointUrl: row.endpointUrl,
      maximumConcurrency: Number(row.maximumConcurrency),
      models: models(
        modelRows.filter(candidate => sameId(candidate.connectionId, row.id)),
      ),
      tlsPolicyKey: row.tlsPolicyKey,
    }
  })
}

function requireLoaded<T>(value: T | null, message: string): T {
  if (value === null) throw new Error(message)
  return value
}

function connectionParameters(input: CreateAiConnection): unknown[] {
  return [
    input.administrationName,
    input.publicName,
    input.description,
    input.adapterKey,
    input.adapterVersion,
    input.endpointUrl,
    input.authenticationType,
    input.tlsPolicyKey,
    input.egressPolicyKey,
    input.agentRuntimeKey,
    input.agentRuntimeVersion,
    input.dataPolicySummary,
    input.maximumConcurrency,
  ]
}

function mapProfile(row: ProfileRow): AiAdminRunProfileRecord {
  const profileBlockers: AiAdminBlocker[] = []
  if (row.modelRevisionId) {
    if (!row.connectionActive) {
      profileBlockers.push({ code: 'connection_inactive' })
    }
    if (!row.validAttestation) {
      profileBlockers.push({ code: 'attestation_invalid' })
    }
    if (
      row.authenticationType !== null &&
      row.authenticationType !== 'none' &&
      !row.activeSecretAvailable
    ) {
      profileBlockers.push({ code: 'active_secret_missing' })
    }
    if (!row.connectionEvidenceAvailable) {
      profileBlockers.push({ code: 'connection_verification_missing' })
    }
    if (!row.modelRevisionVerified) {
      profileBlockers.push({ code: 'model_revision_unverified' })
    }
  } else {
    profileBlockers.push({ code: 'model_revision_missing' })
  }
  const profile: AiAdminRunProfileRecord = {
    administrativeStatus: 'unconfigured',
    blockers: profileBlockers,
    configurationStatus: row.configurationStatus,
    configurationVersion: Number(row.configurationVersion),
    id: row.profileId,
    inactivityTimeBudgetSeconds: Number(row.inactivityTimeBudgetSeconds),
    maximumBufferedEvents: Number(row.maximumBufferedEvents),
    maximumOutputBytes: Number(row.maximumOutputBytes),
    maximumOutputTokens: Number(row.maximumOutputTokens),
    maximumRetainedMemoryBytes: Number(row.maximumRetainedMemoryBytes),
    modelRevisionId: row.modelRevisionId,
    operationalStatus: row.operationalStatus,
    profileKey: row.profileKey,
    queueCapacity: Number(row.queueCapacity),
    revisionToken: row.profileToken,
    totalTimeBudgetSeconds: Number(row.totalTimeBudgetSeconds),
  }
  profile.administrativeStatus = deriveAiRunProfileAdministrativeStatus(profile)
  return profile
}

async function loadProfiles(
  executor: SqlServerDatabase | SqlServerEntityManager,
  profileKey?: AiRunProfileKey,
): Promise<AiAdminRunProfileRecord[]> {
  const rows = await executor.query<ProfileRow[]>(
    `SELECT [profile].[id] AS [profileId],
       [profile].[profile_key] AS [profileKey],
       [profile].[operational_status] AS [operationalStatus],
       [profile].[revision_token] AS [profileToken],
       [profile].[configuration_version] AS [configurationVersion],
       [profile].[ai_connection_model_revision_id] AS [modelRevisionId],
       [profile].[total_time_budget_seconds] AS [totalTimeBudgetSeconds],
       [profile].[inactivity_time_budget_seconds] AS [inactivityTimeBudgetSeconds],
       [profile].[queue_capacity] AS [queueCapacity],
       [profile].[maximum_output_tokens] AS [maximumOutputTokens],
       [profile].[maximum_output_bytes] AS [maximumOutputBytes],
       [profile].[maximum_retained_memory_bytes] AS [maximumRetainedMemoryBytes],
       [profile].[maximum_buffered_events] AS [maximumBufferedEvents],
       [connection].[authentication_type] AS [authenticationType],
       CAST(CASE WHEN [connection].[lifecycle_status] = N'active'
         THEN 1 ELSE 0 END AS bit) AS [connectionActive],
       CAST(CASE WHEN [attestation].[id] IS NOT NULL
         THEN 1 ELSE 0 END AS bit) AS [validAttestation],
       CAST(CASE WHEN [secret].[id] IS NOT NULL
         THEN 1 ELSE 0 END AS bit) AS [activeSecretAvailable],
       CAST(CASE WHEN [connection_evidence].[id] IS NOT NULL
         THEN 1 ELSE 0 END AS bit) AS [connectionEvidenceAvailable],
       CAST(CASE WHEN [revision].[status] = N'verified'
         AND [revision].[connection_configuration_version]
           = [connection].[configuration_version]
         AND [model].[deleted_at] IS NULL
         AND [model_evidence].[id] IS NOT NULL
         THEN 1 ELSE 0 END AS bit) AS [modelRevisionVerified],
       CASE
         WHEN [profile].[ai_connection_model_revision_id] IS NULL
           THEN N'unconfigured'
         WHEN [revision].[status] = N'verified'
           AND [revision].[connection_configuration_version]
             = [connection].[configuration_version]
           AND [model].[deleted_at] IS NULL
           AND [connection].[lifecycle_status] = N'active'
           AND [attestation].[id] IS NOT NULL
           AND ([connection].[authentication_type] = N'none'
             OR [secret].[id] IS NOT NULL)
           AND [connection_evidence].[id] IS NOT NULL
           AND [model_evidence].[id] IS NOT NULL THEN N'configured'
         ELSE N'blocked'
       END AS [configurationStatus]
     FROM [ai_run_profiles] AS [profile]
     LEFT JOIN [ai_connection_model_revisions] AS [revision]
       ON [revision].[id] = [profile].[ai_connection_model_revision_id]
     LEFT JOIN [ai_connection_models] AS [model]
       ON [model].[id] = [revision].[ai_connection_model_id]
     LEFT JOIN [ai_connections] AS [connection]
       ON [connection].[id] = [model].[ai_connection_id]
     OUTER APPLY (
       SELECT TOP (1) [candidate].[id]
       FROM [ai_connection_attestations] AS [candidate]
       WHERE [candidate].[ai_connection_id] = [connection].[id]
         AND [candidate].[status] = N'valid'
         AND [candidate].[reviewed_at] <= SYSUTCDATETIME()
         AND ([candidate].[review_due_at] IS NULL
           OR [candidate].[review_due_at] > SYSUTCDATETIME())
       ORDER BY [candidate].[revision_number] DESC
     ) AS [attestation]
     OUTER APPLY (
       SELECT TOP (1) [candidate].[id]
       FROM [ai_provider_secret_versions] AS [candidate]
       WHERE [candidate].[ai_connection_id] = [connection].[id]
         AND [candidate].[status] = N'active'
         AND [candidate].[ciphertext] IS NOT NULL
         AND [candidate].[provider_revoked_at] IS NULL
     ) AS [secret]
     OUTER APPLY (
       SELECT TOP (1) [candidate].[id]
       FROM [ai_connection_verification_evidence] AS [candidate]
       WHERE [candidate].[ai_connection_id] = [connection].[id]
         AND [candidate].[connection_configuration_version]
           = [connection].[configuration_version]
         AND [candidate].[outcome] = N'passed'
         AND ([candidate].[expires_at] IS NULL
           OR [candidate].[expires_at] > SYSUTCDATETIME())
       ORDER BY [candidate].[verified_at] DESC
     ) AS [connection_evidence]
     OUTER APPLY (
       SELECT TOP (1) [candidate].[id]
       FROM [ai_connection_model_verification_evidence] AS [candidate]
       WHERE [candidate].[ai_connection_model_revision_id] = [revision].[id]
         AND [candidate].[outcome] = N'passed'
         AND JSON_VALUE([candidate].[profile_compatibility_json],
           CONCAT('$.', [profile].[profile_key], '.supported')) = N'true'
       ORDER BY [candidate].[verified_at] DESC
     ) AS [model_evidence]
     WHERE (@0 IS NULL OR [profile].[profile_key] = @0)
     ORDER BY [profile].[profile_key]`,
    [profileKey ?? null],
  )
  return rows.map(mapProfile)
}

async function loadRunProfileSnapshot(
  executor: SqlServerDatabase | SqlServerEntityManager,
  profileKey: AiRunProfileKey,
): Promise<AiAdminActivationSnapshot | null> {
  const profile = (await loadProfiles(executor, profileKey))[0]
  if (!profile?.modelRevisionId) return null
  const rows = await executor.query<Array<{ connectionId: string }>>(
    `SELECT [model].[ai_connection_id] AS [connectionId]
     FROM [ai_connection_model_revisions] AS [revision]
     INNER JOIN [ai_connection_models] AS [model]
       ON [model].[id] = [revision].[ai_connection_model_id]
     WHERE [revision].[id] = @0`,
    [profile.modelRevisionId],
  )
  const connectionId = rows[0]?.connectionId
  if (!connectionId) return null
  const connection = await loadConnection(executor, connectionId)
  if (!connection) return null
  const modelRevision =
    connection.models
      .flatMap(model => model.revisions)
      .find(revision => sameId(revision.id, profile.modelRevisionId)) ?? null
  return {
    attestationRevisionToken:
      connection.attestation?.status === 'valid'
        ? connection.attestation.revisionToken
        : null,
    connection,
    connectionEvidenceId: connection.connectionEvidenceId,
    modelRevision,
    profile,
    secretVersionId: connection.activeSecret.available
      ? connection.activeSecret.secretVersionId
      : null,
  }
}

function configurationFingerprint(
  connection: AiAdminStoredConnectionDetail,
): string {
  const value = JSON.stringify({
    adapterKey: connection.adapterKey,
    adapterVersion: connection.adapterVersion,
    agentRuntimeVersion: connection.agentRuntimeVersion,
    authenticationType: connection.authenticationType,
    egressPolicyKey: connection.egressPolicyKey,
    endpointUrl: connection.endpointUrl,
    tlsPolicyKey: connection.tlsPolicyKey,
  })
  return createHash('sha256').update(value).digest('hex')
}

export function createSqlServerAiAdminStore(
  db: SqlServerDatabase,
  audit: AiAdminAudit,
): AiAdminStore {
  return {
    async listConnections() {
      const rows = await db.query<ConnectionRow[]>(
        `SELECT ${CONNECTION_COLUMNS}
         FROM [ai_connections] AS [connection]
         ${CONNECTION_JOINS}
         ORDER BY [connection].[administration_name]`,
      )
      return rows.map(summary)
    },

    getConnection(connectionId) {
      return loadConnection(db, connectionId)
    },

    async createConnection(input) {
      const id = randomUUID()
      return db.transaction('SERIALIZABLE', async manager => {
        await manager.query(
          `INSERT INTO [ai_connections] (
           [id], [administration_name], [public_name], [description],
           [adapter_key], [adapter_version], [endpoint_url],
           [authentication_type], [tls_policy_key], [egress_policy_key],
           [agent_runtime_key], [agent_runtime_version], [data_policy_summary],
           [lifecycle_status], [configuration_version], [maximum_concurrency],
           [created_at], [updated_at]
         ) VALUES (
           @0, @1, @2, @3, @4, @5, @6, @7, @8, @9, @10, @11, @12,
           N'draft', 1, @13, SYSUTCDATETIME(), SYSUTCDATETIME()
         )`,
          [id, ...connectionParameters(input)],
        )
        const created = requireLoaded(
          await loadConnection(manager, id),
          'AI connection was not created.',
        )
        await audit(
          {
            operation: 'create',
            resourceId: id,
            resourceType: 'ai_connection',
          },
          manager,
        )
        return created
      })
    },

    async updateConnection(input) {
      return db.transaction('SERIALIZABLE', async manager => {
        const parameters = connectionParameters(input.connection)
        const rows = await manager.query<Array<{ technicalChanged: boolean }>>(
          `DECLARE @technical_changed bit = 0;
           SELECT @technical_changed = CASE WHEN
             [adapter_key] <> @4 OR [adapter_version] <> @5
             OR [endpoint_url] <> @6 OR [authentication_type] <> @7
             OR [tls_policy_key] <> @8 OR [egress_policy_key] <> @9
             OR ISNULL([agent_runtime_key], N'') <> ISNULL(@10, N'')
             OR ISNULL([agent_runtime_version], N'') <> ISNULL(@11, N'')
             THEN 1 ELSE 0 END
           FROM [ai_connections] WITH (UPDLOCK, HOLDLOCK)
           WHERE [id] = @0 AND [revision_token] = @14
             AND [lifecycle_status] <> N'retired';

           UPDATE [ai_connections]
           SET [administration_name] = @1, [public_name] = @2,
             [description] = @3, [adapter_key] = @4, [adapter_version] = @5,
             [endpoint_url] = @6, [authentication_type] = @7,
             [tls_policy_key] = @8, [egress_policy_key] = @9,
             [agent_runtime_key] = @10, [agent_runtime_version] = @11,
             [data_policy_summary] = @12, [maximum_concurrency] = @13,
             [configuration_version] = [configuration_version]
               + CASE WHEN @technical_changed = 1 THEN 1 ELSE 0 END,
             [lifecycle_status] = CASE
               WHEN @technical_changed = 1 AND [lifecycle_status] <> N'draft'
                 THEN N'verification_required'
               ELSE [lifecycle_status]
             END,
             [updated_at] = SYSUTCDATETIME(), [revision_token] = NEWID()
           WHERE [id] = @0 AND [revision_token] = @14
             AND [lifecycle_status] <> N'retired';

           IF @@ROWCOUNT = 0 RETURN;

           IF @technical_changed = 1
             UPDATE [revision]
             SET [status] = N'new_revision_required',
               [updated_at] = SYSUTCDATETIME(), [revision_token] = NEWID()
             FROM [ai_connection_model_revisions] AS [revision]
             INNER JOIN [ai_connection_models] AS [model]
               ON [model].[id] = [revision].[ai_connection_model_id]
             WHERE [model].[ai_connection_id] = @0
               AND [model].[deleted_at] IS NULL
               AND [revision].[status] = N'verified';

           SELECT @technical_changed AS [technicalChanged];`,
          [input.connectionId, ...parameters, input.revisionToken],
        )
        if (!rows?.[0]) return null
        const updated = await loadConnection(manager, input.connectionId)
        if (!updated) return null
        await audit(
          {
            changedFields: Object.keys(input.connection),
            operation: 'update',
            resourceId: input.connectionId,
            resourceType: 'ai_connection',
          },
          manager,
        )
        return updated
      })
    },

    async saveAttestation(input) {
      return db.transaction('SERIALIZABLE', async manager => {
        const id = randomUUID()
        let targetId: string = id
        const value = input.attestation
        const parameters = [
          value.responsibleOrganizationUnitReference,
          value.purpose,
          value.maximumInformationClass,
          value.isPersonalDataProcessed,
          value.providerName,
          value.subprocessors === null
            ? null
            : JSON.stringify(value.subprocessors),
          value.processingRegions === null
            ? null
            : JSON.stringify(value.processingRegions),
          value.isTrainingAllowed,
          value.maximumRetentionDays,
          value.incidentResponseReference,
          value.decisionReference,
          value.reviewedAt,
          value.reviewDueAt,
        ]
        if (input.makeValid) {
          const current = await manager.query<Array<{ revisionToken: string }>>(
            `SELECT [revision_token] AS [revisionToken]
             FROM [ai_connection_attestations] WITH (UPDLOCK, HOLDLOCK)
             WHERE [ai_connection_id] = @0 AND [status] = N'valid'`,
            [input.connectionId],
          )
          if (
            (current[0]?.revisionToken ?? null) !==
            input.currentAttestationRevisionToken
          ) {
            throw conflictError(
              'The current AI attestation changed. Reload and try again.',
            )
          }
        }
        if (value.revisionToken) {
          const updated = await manager.query<Array<{ id: string }>>(
            `UPDATE [ai_connection_attestations] WITH (UPDLOCK, HOLDLOCK)
             SET [responsible_organization_unit_reference] = @2,
               [purpose] = @3, [maximum_information_class] = @4,
               [is_personal_data_processed] = @5, [provider_name] = @6,
               [subprocessors_json] = @7, [processing_regions_json] = @8,
               [is_training_allowed] = @9, [maximum_retention_days] = @10,
               [incident_response_reference] = @11,
               [decision_reference] = @12, [reviewed_at] = @13,
               [review_due_at] = @14, [revision_token] = NEWID()
             OUTPUT INSERTED.[id]
             WHERE [ai_connection_id] = @0 AND [revision_token] = @1
               AND [status] = N'draft';`,
            [input.connectionId, value.revisionToken, ...parameters],
          )
          if (!updated[0]) {
            throw conflictError(
              'AI attestation revision changed. Reload and try again.',
            )
          }
          targetId = updated[0].id
        } else {
          await manager.query(
            `DECLARE @revision_number int = (
               SELECT COALESCE(MAX([revision_number]), 0) + 1
               FROM [ai_connection_attestations] WITH (UPDLOCK, HOLDLOCK)
               WHERE [ai_connection_id] = @0
             );
             INSERT INTO [ai_connection_attestations] (
               [id], [ai_connection_id], [revision_number], [status],
               [responsible_organization_unit_reference], [purpose],
               [maximum_information_class], [is_personal_data_processed],
               [provider_name], [subprocessors_json], [processing_regions_json],
               [is_training_allowed], [maximum_retention_days],
               [incident_response_reference], [decision_reference],
               [reviewed_at], [review_due_at], [created_at]
             ) VALUES (
               @1, @0, @revision_number, N'draft', @2, @3, @4, @5, @6, @7,
               @8, @9, @10, @11, @12, @13, @14, SYSUTCDATETIME()
             );`,
            [input.connectionId, id, ...parameters],
          )
        }
        if (input.makeValid) {
          await manager.query(
            `UPDATE [ai_connection_attestations]
             SET [status] = N'superseded', [revision_token] = NEWID()
             WHERE [ai_connection_id] = @0 AND [status] = N'valid';
             UPDATE [ai_connection_attestations]
             SET [status] = N'valid', [revision_token] = NEWID()
             WHERE [id] = @1 AND [status] = N'draft';`,
            [input.connectionId, targetId],
          )
        }
        const rows = await manager.query<AttestationRow[]>(
          `SELECT [id], [revision_number] AS [revisionNumber], [status],
             [responsible_organization_unit_reference]
               AS [responsibleOrganizationUnitReference],
             [purpose], [maximum_information_class] AS [maximumInformationClass],
             [is_personal_data_processed] AS [isPersonalDataProcessed],
             [provider_name] AS [providerName],
             [subprocessors_json] AS [subprocessorsJson],
             [processing_regions_json] AS [processingRegionsJson],
             [is_training_allowed] AS [isTrainingAllowed],
             [maximum_retention_days] AS [maximumRetentionDays],
             [incident_response_reference] AS [incidentResponseReference],
             [decision_reference] AS [decisionReference],
             [reviewed_at] AS [reviewedAt], [review_due_at] AS [reviewDueAt],
             [revision_token] AS [revisionToken]
           FROM [ai_connection_attestations]
           WHERE [id] = @0 AND [ai_connection_id] = @1`,
          [targetId, input.connectionId],
        )
        if (!rows?.[0]) throw new Error('AI attestation was not saved.')
        const saved = attestation(rows[0])
        await audit(
          {
            changedFields: Object.keys(input.attestation).filter(
              field => field !== 'revisionToken',
            ),
            operation: input.makeValid ? 'activate' : 'save',
            resourceId: targetId,
            resourceType: 'ai_connection_attestation',
          },
          manager,
        )
        return saved
      })
    },

    async discardAttestationDraft(input) {
      return db.transaction('SERIALIZABLE', async manager => {
        const admitted = await manager.query<Array<{ id: string }>>(
          `SELECT [draft].[id]
           FROM [ai_connection_attestations] AS [draft]
             WITH (UPDLOCK, HOLDLOCK)
           WHERE [draft].[ai_connection_id] = @0
             AND [draft].[id] = @1
             AND [draft].[revision_token] = @2
             AND [draft].[status] = N'draft'
             AND EXISTS (
               SELECT 1
               FROM [ai_connection_attestations] AS [valid]
                 WITH (UPDLOCK, HOLDLOCK)
               WHERE [valid].[ai_connection_id] = @0
                 AND [valid].[status] = N'valid'
                 AND [valid].[revision_token] = @3
             );`,
          [
            input.connectionId,
            input.draftAttestationId,
            input.draftAttestationRevisionToken,
            input.currentAttestationRevisionToken,
          ],
        )
        if (!admitted[0]) return false
        await manager.query(
          `UPDATE [ai_connection_attestations]
           SET [status] = N'superseded', [revision_token] = NEWID()
           WHERE [ai_connection_id] = @0 AND [status] = N'draft';`,
          [input.connectionId],
        )
        await audit(
          {
            operation: 'discard',
            resourceId: input.draftAttestationId,
            resourceType: 'ai_connection_attestation',
          },
          manager,
        )
        return true
      })
    },

    async saveModelRevision(input) {
      return db.transaction('SERIALIZABLE', async manager => {
        const value = input.modelRevision
        const verifiedCapabilities = Object.fromEntries(
          Object.entries(input.verification.capabilities).map(
            ([key, result]) => [key, result.outcome === 'verified'],
          ),
        ) as AiCapability
        if (
          !input.verification.saveable ||
          !Object.values(input.verification.profileCompatibility).some(
            result => result.supported,
          )
        ) {
          throw conflictError('AI model verification is incomplete.')
        }
        const duplicates = await manager.query<Array<{ id: string }>>(
          `SELECT TOP (1) [revision].[id]
           FROM [ai_connection_model_revisions] AS [revision]
             WITH (UPDLOCK, HOLDLOCK)
           INNER JOIN [ai_connection_models] AS [model]
             WITH (UPDLOCK, HOLDLOCK)
             ON [model].[id] = [revision].[ai_connection_model_id]
           WHERE [model].[ai_connection_id] = @0
             AND [model].[deleted_at] IS NULL
             AND (@3 IS NULL OR [model].[id] <> @3)
             AND [revision].[external_model_id] = @1
             AND (
               [revision].[external_model_version] = @2
               OR ([revision].[external_model_version] IS NULL AND @2 IS NULL)
             );`,
          [
            input.connectionId,
            value.externalModelId,
            value.externalModelVersion,
            value.modelId,
          ],
        )
        if (duplicates[0]) {
          throw conflictError(
            'The external AI model is already registered on this connection.',
          )
        }
        const modelRevisionId = randomUUID()
        let modelId = value.modelId
        if (!modelId) {
          modelId = randomUUID()
          await manager.query(
            `INSERT INTO [ai_connection_models] (
               [id], [ai_connection_id], [name], [description],
               [created_at], [updated_at]
             ) VALUES (@0, @1, @2, @3, SYSUTCDATETIME(), SYSUTCDATETIME())`,
            [modelId, input.connectionId, value.name, value.description],
          )
        } else {
          const models = await manager.query<Array<{ id: string }>>(
            `UPDATE [ai_connection_models] WITH (UPDLOCK, HOLDLOCK)
             SET [name] = @2, [description] = @3,
               [updated_at] = SYSUTCDATETIME(), [revision_token] = NEWID()
             OUTPUT INSERTED.[id]
             WHERE [id] = @0 AND [ai_connection_id] = @1
               AND [revision_token] = @4 AND [deleted_at] IS NULL`,
            [
              modelId,
              input.connectionId,
              value.name,
              value.description,
              value.modelToken,
            ],
          )
          if (!models[0]) {
            throw conflictError(
              'AI connection model changed. Reload and try again.',
            )
          }
        }
        const capabilitiesJson = JSON.stringify(verifiedCapabilities)
        const connectionEvidenceId = randomUUID()
        const compatibilityJson = JSON.stringify(
          input.verification.profileCompatibility,
        )
        const detailsJson = JSON.stringify({
          baseline: input.verification.baseline,
          capabilities: input.verification.capabilities,
          connection: input.verification.connection,
        })
        const evidenceFingerprint = createHash('sha256')
          .update(
            JSON.stringify({
              capabilities: verifiedCapabilities,
              compatibility: input.verification.profileCompatibility,
              connectionConfigurationVersion:
                input.connection.configurationVersion,
              externalModelId: value.externalModelId,
              externalModelVersion: value.externalModelVersion,
              suite: input.verification.testSuiteVersion,
            }),
          )
          .digest('hex')
        await manager.query(
          `DECLARE @configuration_version int;
           SELECT @configuration_version = [configuration_version]
           FROM [ai_connections] WITH (UPDLOCK, HOLDLOCK)
           WHERE [id] = @0
             AND [configuration_version] = @7
             AND [revision_token] = @8;
           IF @configuration_version IS NULL
             THROW 51230, 'AI connection changed before model save.', 1;
           INSERT INTO [ai_connection_verification_evidence] (
             [id], [ai_connection_id], [connection_configuration_version],
             [outcome], [test_suite_version], [adapter_version],
             [agent_runtime_version], [configuration_fingerprint],
             [failure_category], [details_json], [verified_at], [expires_at]
           ) VALUES (
             @9, @0, @configuration_version, N'passed', @10, @11, @12,
             @13, NULL, @14, SYSUTCDATETIME(), NULL
           );
           DECLARE @revision_number int = (
             SELECT COALESCE(MAX([revision_number]), 0) + 1
             FROM [ai_connection_model_revisions] WITH (UPDLOCK, HOLDLOCK)
             WHERE [ai_connection_model_id] = @1
           );
           INSERT INTO [ai_connection_model_revisions] (
             [id], [ai_connection_model_id], [revision_number],
             [connection_configuration_version], [status],
             [external_model_id], [external_model_version],
             [agent_runtime_version], [declared_capabilities_json],
             [discovered_capabilities_json], [verified_capabilities_json],
             [verified_at], [created_at], [updated_at]
           )
           SELECT @2, @1, @revision_number, @configuration_version,
             N'verified', @3, COALESCE(@5, @4), [agent_runtime_version],
             @6, NULL, @6, SYSUTCDATETIME(), SYSUTCDATETIME(), SYSUTCDATETIME()
           FROM [ai_connections] WHERE [id] = @0;
           INSERT INTO [ai_connection_model_verification_evidence] (
             [id], [ai_connection_model_revision_id],
             [ai_connection_verification_evidence_id], [outcome],
             [test_suite_version], [verified_capabilities_json],
             [profile_compatibility_json], [evidence_fingerprint],
             [failure_category], [details_json], [verified_at]
           ) VALUES (
             @15, @2, @9, N'passed', @10, @6, @16, @17, NULL, @18,
             SYSUTCDATETIME()
           );
           INSERT INTO [ai_connection_model_operational_states] (
             [ai_connection_model_revision_id], [updated_at]
           ) VALUES (@2, SYSUTCDATETIME());`,
          [
            input.connectionId,
            modelId,
            modelRevisionId,
            value.externalModelId,
            value.externalModelVersion,
            input.verification.canonicalExternalModelVersion,
            capabilitiesJson,
            input.connection.configurationVersion,
            input.connection.revisionToken,
            connectionEvidenceId,
            input.verification.testSuiteVersion,
            input.connection.adapterVersion,
            input.connection.agentRuntimeVersion,
            configurationFingerprint(input.connection),
            JSON.stringify({ baseline: input.verification.baseline }),
            randomUUID(),
            compatibilityJson,
            evidenceFingerprint,
            detailsJson,
          ],
        )
        const loaded = await loadConnection(manager, input.connectionId)
        const model = loaded?.models.find(candidate =>
          sameId(candidate.id, modelId),
        )
        if (!model) throw new Error('AI connection model was not saved.')
        await audit(
          {
            changedFields: [
              'name',
              'description',
              'externalModelId',
              'externalModelVersion',
            ],
            operation: 'save',
            resourceId: modelRevisionId,
            resourceType: 'ai_connection_model_revision',
          },
          manager,
        )
        return model
      })
    },

    async endModelRevision(input) {
      return db.transaction('SERIALIZABLE', async manager => {
        const dependencies = await manager.query<
          Array<{ profileKey: string | null; runCount: number | string }>
        >(
          `SELECT [profile].[profile_key] AS [profileKey],
             (SELECT COUNT(*) FROM [ai_run_coordination_entries] AS [entry]
              WHERE [entry].[ai_connection_model_revision_id] = @0
                AND [entry].[status] IN (N'queued', N'retry_wait', N'running'))
               AS [runCount]
           FROM [ai_connection_model_revisions] AS [revision]
             WITH (UPDLOCK, HOLDLOCK)
           LEFT JOIN [ai_run_profiles] AS [profile] WITH (UPDLOCK, HOLDLOCK)
             ON [profile].[ai_connection_model_revision_id] = [revision].[id]
           WHERE [revision].[id] = @0;`,
          [input.modelRevisionId],
        )
        const profileKeys = dependencies.flatMap(row =>
          row.profileKey ? [row.profileKey] : [],
        )
        const runCount = Number(dependencies[0]?.runCount ?? 0)
        if (profileKeys.length > 0 || runCount > 0) {
          throw conflictError('AI model revision is still in use.', {
            profileKeys,
            runCount,
          })
        }
        const rows = await manager.query<Array<{ id: string }>>(
          `DECLARE @updated TABLE ([id] uniqueidentifier NOT NULL);

           UPDATE [revision] WITH (UPDLOCK, HOLDLOCK)
           SET [status] = N'ended', [ended_at] = SYSUTCDATETIME(),
             [updated_at] = SYSUTCDATETIME(),
             [revision_token] = NEWID()
           OUTPUT INSERTED.[id] INTO @updated ([id])
           FROM [ai_connection_model_revisions] AS [revision]
           INNER JOIN [ai_connection_models] AS [model]
             ON [model].[id] = [revision].[ai_connection_model_id]
           WHERE [revision].[id] = @0 AND [revision].[revision_token] = @1
             AND [revision].[status]
               IN (N'verified', N'new_revision_required')
             AND [model].[ai_connection_id] = @2
             AND [model].[deleted_at] IS NULL
             AND NOT EXISTS (SELECT 1 FROM [ai_run_profiles] AS [profile]
               WHERE [profile].[ai_connection_model_revision_id] = [revision].[id])
             AND NOT EXISTS (SELECT 1 FROM [ai_run_coordination_entries] AS [entry]
               WHERE [entry].[ai_connection_model_revision_id] = [revision].[id]
                 AND [entry].[status] IN (N'queued', N'retry_wait', N'running'));

           SELECT [id] FROM @updated;`,
          [input.modelRevisionId, input.revisionToken, input.connectionId],
        )
        if (!rows?.[0]) return null
        const loaded = await loadConnection(manager, input.connectionId)
        const revision =
          loaded?.models
            .flatMap(model => model.revisions)
            .find(revision => sameId(revision.id, input.modelRevisionId)) ??
          null
        if (!revision) return null
        await audit(
          {
            operation: 'retire',
            resourceId: input.modelRevisionId,
            resourceType: 'ai_connection_model_revision',
          },
          manager,
        )
        return revision
      })
    },

    async deleteModelRevision(input) {
      return db.transaction('SERIALIZABLE', async manager => {
        const rows = await manager.query<Array<{ modelId: string }>>(
          `SELECT [model].[id] AS [modelId]
           FROM [ai_connection_model_revisions] AS [revision]
             WITH (UPDLOCK, HOLDLOCK)
           INNER JOIN [ai_connection_models] AS [model] WITH (UPDLOCK, HOLDLOCK)
             ON [model].[id] = [revision].[ai_connection_model_id]
           WHERE [revision].[id] = @0 AND [revision].[revision_token] = @1
             AND [revision].[status] = N'ended'
             AND [model].[ai_connection_id] = @2
             AND NOT EXISTS (SELECT 1 FROM [ai_run_profiles] AS [profile]
               WHERE [profile].[ai_connection_model_revision_id] = [revision].[id])
             AND NOT EXISTS (SELECT 1 FROM [ai_run_coordination_entries] AS [entry]
               WHERE [entry].[ai_connection_model_revision_id] = [revision].[id]
                 AND [entry].[status] IN (N'queued', N'retry_wait', N'running'));`,
          [input.modelRevisionId, input.revisionToken, input.connectionId],
        )
        if (!rows[0]) return false
        await manager.query(
          `DECLARE @connection_evidence TABLE ([id] uniqueidentifier PRIMARY KEY);
           DELETE FROM [ai_run_coordination_entries]
           WHERE [ai_connection_model_revision_id] = @0;
           DELETE FROM [ai_connection_model_verification_evidence]
           OUTPUT DELETED.[ai_connection_verification_evidence_id]
             INTO @connection_evidence ([id])
           WHERE [ai_connection_model_revision_id] = @0;
           DELETE FROM [connection_evidence]
           FROM [ai_connection_verification_evidence] AS [connection_evidence]
           INNER JOIN @connection_evidence AS [deleted_evidence]
             ON [deleted_evidence].[id] = [connection_evidence].[id]
           WHERE NOT EXISTS (
             SELECT 1 FROM [ai_connection_model_verification_evidence] AS [model_evidence]
             WHERE [model_evidence].[ai_connection_verification_evidence_id]
               = [connection_evidence].[id]
           );
           DELETE FROM [ai_connection_model_operational_states]
           WHERE [ai_connection_model_revision_id] = @0;
           DELETE FROM [ai_connection_model_revisions] WHERE [id] = @0;
           DELETE FROM [ai_connection_models]
           WHERE [id] = @1 AND NOT EXISTS (
             SELECT 1 FROM [ai_connection_model_revisions]
             WHERE [ai_connection_model_id] = @1
           );`,
          [input.modelRevisionId, rows[0].modelId],
        )
        await audit(
          {
            operation: 'delete',
            resourceId: input.modelRevisionId,
            resourceType: 'ai_connection_model_revision',
          },
          manager,
        )
        return true
      })
    },

    async recordHealth(input) {
      return db.transaction('SERIALIZABLE', async manager => {
        const rows = await manager.query<Array<{ id: string }>>(
          `IF NOT EXISTS (
             SELECT 1
             FROM [ai_connection_model_revisions] AS [revision]
               WITH (UPDLOCK, HOLDLOCK)
             INNER JOIN [ai_connection_models] AS [model]
               ON [model].[id] = [revision].[ai_connection_model_id]
             INNER JOIN [ai_connections] AS [connection]
               WITH (UPDLOCK, HOLDLOCK)
               ON [connection].[id] = [model].[ai_connection_id]
             WHERE [revision].[id] = @1
               AND [revision].[revision_token] = @2
               AND [revision].[status] = N'verified'
               AND [model].[ai_connection_id] = @0
               AND [model].[deleted_at] IS NULL
               AND [connection].[revision_token] = @5
               AND [connection].[configuration_version] = @6
               AND [revision].[connection_configuration_version]
                 = @6
           ) RETURN;

           MERGE [ai_connection_model_operational_states] AS [target]
           USING (
             SELECT @1 AS [model_revision_id]
           ) AS [source]
           ON [target].[ai_connection_model_revision_id]
             = [source].[model_revision_id]
           WHEN MATCHED THEN UPDATE SET
             [health_status] = @3, [last_health_evidence_at] = SYSUTCDATETIME(),
             [updated_at] = SYSUTCDATETIME(), [revision_token] = NEWID()
           WHEN NOT MATCHED THEN INSERT (
             [ai_connection_model_revision_id], [health_status],
             [last_health_evidence_at], [updated_at]
           ) VALUES (
             [source].[model_revision_id], @3,
             SYSUTCDATETIME(), SYSUTCDATETIME()
           );

           IF @4 = N'model'
           BEGIN
             UPDATE [ai_connection_model_revisions]
             SET [status] = N'new_revision_required',
               [updated_at] = SYSUTCDATETIME(), [revision_token] = NEWID()
             WHERE [id] = @1 AND [revision_token] = @2
               AND [status] = N'verified';
           END;

           IF @4 = N'connection'
           BEGIN
             INSERT INTO [ai_connection_verification_evidence] (
               [id], [ai_connection_id], [connection_configuration_version],
               [outcome], [test_suite_version], [adapter_version],
               [agent_runtime_version], [configuration_fingerprint],
               [failure_category], [details_json], [verified_at], [expires_at]
             )
             SELECT TOP (1) NEWID(), [evidence].[ai_connection_id],
               [evidence].[connection_configuration_version], N'failed',
               N'runtime-health-v1', [evidence].[adapter_version],
               [evidence].[agent_runtime_version],
               [evidence].[configuration_fingerprint],
               N'runtime_health_contradiction',
               N'{"source":"runtime_health"}', SYSUTCDATETIME(),
               DATEADD(day, 30, SYSUTCDATETIME())
             FROM [ai_connection_verification_evidence] AS [evidence]
             INNER JOIN [ai_connections] AS [connection]
               ON [connection].[id] = [evidence].[ai_connection_id]
             WHERE [evidence].[ai_connection_id] = @0
               AND [evidence].[connection_configuration_version] = @6
               AND [evidence].[outcome] = N'passed'
               AND [connection].[revision_token] = @5
               AND [connection].[configuration_version] = @6
             ORDER BY [evidence].[verified_at] DESC, [evidence].[id] DESC;

             UPDATE [revision]
             SET [status] = N'new_revision_required',
               [updated_at] = SYSUTCDATETIME(), [revision_token] = NEWID()
             FROM [ai_connection_model_revisions] AS [revision]
             INNER JOIN [ai_connection_models] AS [model]
               ON [model].[id] = [revision].[ai_connection_model_id]
             INNER JOIN [ai_connections] AS [connection]
               ON [connection].[id] = [model].[ai_connection_id]
             WHERE [model].[ai_connection_id] = @0
               AND [model].[deleted_at] IS NULL
               AND [revision].[connection_configuration_version]
                 = @6
               AND [connection].[revision_token] = @5
               AND [connection].[configuration_version] = @6
               AND [revision].[status] = N'verified';

             UPDATE [ai_connections]
             SET [lifecycle_status] = CASE
                 WHEN [lifecycle_status] = N'draft' THEN N'draft'
                 WHEN [lifecycle_status] = N'retired' THEN N'retired'
                 ELSE N'verification_required'
               END,
               [updated_at] = SYSUTCDATETIME(), [revision_token] = NEWID()
             WHERE [id] = @0
               AND [revision_token] = @5
               AND [configuration_version] = @6;
           END;

           SELECT @1 AS [id];`,
          [
            input.connectionId,
            input.modelRevisionId,
            input.modelRevisionToken,
            input.health,
            input.invalidationScope,
            input.connectionRevisionToken,
            input.connectionConfigurationVersion,
          ],
        )
        if (!rows?.[0]) {
          throw conflictError(
            'AI model revision changed. Reload and try again.',
          )
        }
        const updated = requireLoaded(
          await loadConnection(manager, input.connectionId),
          'AI connection health was not recorded.',
        )
        await audit(
          {
            operation: 'probe',
            resourceId: input.modelRevisionId,
            resourceType: 'ai_connection_model_revision',
          },
          manager,
        )
        return updated
      })
    },

    listRunProfiles() {
      return loadProfiles(db)
    },

    getRunProfileSnapshot(profileKey) {
      return loadRunProfileSnapshot(db, profileKey)
    },

    async getModelRevisionConnection(modelRevisionId) {
      const rows = await db.query<Array<{ connectionId: string }>>(
        `SELECT TOP (1) [model].[ai_connection_id] AS [connectionId]
         FROM [ai_connection_model_revisions] AS [revision]
         INNER JOIN [ai_connection_models] AS [model]
           ON [model].[id] = [revision].[ai_connection_model_id]
         WHERE [revision].[id] = @0 AND [model].[deleted_at] IS NULL`,
        [modelRevisionId],
      )
      return rows[0] ? loadConnection(db, rows[0].connectionId) : null
    },

    async saveRunProfile(input) {
      return db.transaction('SERIALIZABLE', async manager => {
        const value = input.profile
        if (value.modelRevisionId) {
          const selectedModel = await manager.query<Array<{ id: string }>>(
            `SELECT TOP (1) [revision].[id]
             FROM [ai_connection_model_revisions] AS [revision]
               WITH (UPDLOCK, HOLDLOCK)
             INNER JOIN [ai_connection_models] AS [model]
               WITH (UPDLOCK, HOLDLOCK)
               ON [model].[id] = [revision].[ai_connection_model_id]
             INNER JOIN [ai_connections] AS [connection] WITH (UPDLOCK, HOLDLOCK)
               ON [connection].[id] = [model].[ai_connection_id]
             WHERE [revision].[id] = @0 AND [revision].[status] = N'verified'
               AND [model].[deleted_at] IS NULL
               AND [connection].[lifecycle_status] = N'active'
               AND EXISTS (
                 SELECT 1 FROM [ai_connection_model_verification_evidence] AS [evidence]
                 WHERE [evidence].[ai_connection_model_revision_id] = [revision].[id]
                   AND [evidence].[outcome] = N'passed'
                   AND JSON_VALUE([evidence].[profile_compatibility_json], @1) = N'true'
               )
               AND EXISTS (
                 SELECT 1 FROM [ai_connection_verification_evidence] AS [connection_evidence]
                 WHERE [connection_evidence].[ai_connection_id] = [connection].[id]
                   AND [connection_evidence].[connection_configuration_version]
                     = [connection].[configuration_version]
                   AND [connection_evidence].[outcome] = N'passed'
               )
               AND EXISTS (
                 SELECT 1 FROM [ai_connection_attestations] AS [attestation]
                 WHERE [attestation].[ai_connection_id] = [connection].[id]
                   AND [attestation].[status] = N'valid'
                   AND ([attestation].[review_due_at] IS NULL
                     OR [attestation].[review_due_at] > SYSUTCDATETIME())
               )
               AND ([connection].[authentication_type] = N'none' OR EXISTS (
                 SELECT 1 FROM [ai_provider_secret_versions] AS [secret]
                 WHERE [secret].[ai_connection_id] = [connection].[id]
                   AND [secret].[status] = N'active'
                   AND [secret].[ciphertext] IS NOT NULL
               ))`,
            [value.modelRevisionId, `$.${input.profileKey}.supported`],
          )
          if (!selectedModel[0]) {
            throw conflictError(
              'AI connection model revision is no longer available. Reload and try again.',
            )
          }
        }
        const rows = await manager.query<
          Array<{ id: string; previousModelRevisionId: string | null }>
        >(
          `UPDATE [ai_run_profiles] WITH (UPDLOCK, HOLDLOCK)
           SET [ai_connection_model_revision_id] = @2,
             [operational_status] = CASE WHEN @2 IS NULL
               THEN N'enabled' ELSE [operational_status] END,
             [configuration_version] = [configuration_version] + 1,
             [total_time_budget_seconds] = @3,
             [inactivity_time_budget_seconds] = @4,
             [queue_capacity] = @5,
             [maximum_output_tokens] = @6,
             [maximum_output_bytes] = @7,
             [maximum_retained_memory_bytes] = @8,
             [maximum_buffered_events] = @9,
             [updated_at] = SYSUTCDATETIME(), [revision_token] = NEWID()
           OUTPUT INSERTED.[id],
             DELETED.[ai_connection_model_revision_id] AS [previousModelRevisionId]
           WHERE [profile_key] = @0 AND [revision_token] = @1`,
          [
            input.profileKey,
            value.revisionToken,
            value.modelRevisionId,
            value.totalTimeBudgetSeconds,
            value.inactivityTimeBudgetSeconds,
            value.queueCapacity,
            value.maximumOutputTokens,
            value.maximumOutputBytes,
            value.maximumRetainedMemoryBytes,
            value.maximumBufferedEvents,
          ],
        )
        if (!rows[0]) {
          throw conflictError('AI run profile changed. Reload and try again.')
        }
        const profile = (await loadProfiles(manager, input.profileKey))[0]
        if (!profile) throw new Error('AI run profile was not saved.')
        await audit(
          {
            changedFields: Object.keys(input.profile).filter(
              field => field !== 'revisionToken',
            ),
            operation: 'save',
            resourceId: profile.id,
            resourceType: 'ai_run_profile',
          },
          manager,
        )
        if (
          rows[0].previousModelRevisionId === null &&
          profile.administrativeStatus === 'active'
        ) {
          await audit(
            {
              operation: 'activate',
              resourceId: profile.id,
              resourceType: 'ai_run_profile',
            },
            manager,
          )
        }
        return profile
      })
    },

    async setConnectionLifecycle(input) {
      return db.transaction('SERIALIZABLE', async manager => {
        const rows = await manager.query<Array<{ id: string }>>(
          `UPDATE [ai_connections] WITH (UPDLOCK, HOLDLOCK)
           SET [lifecycle_status] = @2, [updated_at] = SYSUTCDATETIME(),
             [revision_token] = NEWID()
           OUTPUT INSERTED.[id]
           WHERE [id] = @0 AND [revision_token] = @1
             AND [lifecycle_status] <> N'retired'`,
          [input.connectionId, input.revisionToken, input.status],
        )
        if (!rows?.[0]) return null
        if (input.status === 'suspended' || input.status === 'retired') {
          await manager.query(
            `UPDATE [ai_run_coordination_entries]
             SET [cancellation_requested_at] = SYSUTCDATETIME(),
               [cancellation_reason] = CASE WHEN @1 = N'retired'
                 THEN N'connection_retired' ELSE N'connection_suspended' END,
               [updated_at] = SYSUTCDATETIME()
             WHERE [ai_connection_id] = @0
               AND [status] IN (N'queued', N'retry_wait', N'running')
               AND [cancellation_requested_at] IS NULL`,
            [input.connectionId, input.status],
          )
        }
        const loaded = await loadConnection(manager, input.connectionId)
        if (!loaded) return null
        await audit(
          {
            operation: input.status === 'retired' ? 'retire' : 'suspend',
            resourceId: input.connectionId,
            resourceType: 'ai_connection',
          },
          manager,
        )
        return summaryFromDetail(loaded)
      })
    },

    async activateConnection(input) {
      return db.transaction('SERIALIZABLE', async manager => {
        const rows = await manager.query<Array<{ id: string }>>(
          `UPDATE [connection] WITH (UPDLOCK, HOLDLOCK)
           SET [lifecycle_status] = N'active',
             [updated_at] = SYSUTCDATETIME(), [revision_token] = NEWID()
           OUTPUT INSERTED.[id]
           FROM [ai_connections] AS [connection]
           WHERE [connection].[id] = @0
             AND [connection].[revision_token] = @1
             AND [connection].[lifecycle_status]
               IN (N'draft', N'verification_required', N'suspended')
             AND EXISTS (
               SELECT 1 FROM [ai_connection_attestations] AS [attestation]
               WHERE [attestation].[id] = @6
                 AND [attestation].[revision_token] = @7
                 AND [attestation].[ai_connection_id] = [connection].[id]
                 AND [attestation].[status] = N'valid'
                 AND ([attestation].[review_due_at] IS NULL
                   OR [attestation].[review_due_at] > SYSUTCDATETIME())
             )
             AND EXISTS (
               SELECT 1 FROM [ai_connection_verification_evidence] AS [evidence]
               WHERE [evidence].[id] = @2
                 AND [evidence].[ai_connection_id] = [connection].[id]
                 AND [evidence].[connection_configuration_version]
                   = [connection].[configuration_version]
                 AND [evidence].[outcome] = N'passed'
                 AND ([evidence].[expires_at] IS NULL
                   OR [evidence].[expires_at] > SYSUTCDATETIME())
             )
             AND EXISTS (
               SELECT 1
               FROM [ai_connection_model_revisions] AS [revision]
               INNER JOIN [ai_connection_models] AS [model]
                 ON [model].[id] = [revision].[ai_connection_model_id]
               WHERE [revision].[id] = @3
                 AND [revision].[revision_token] = @4
                 AND [revision].[status] = N'verified'
                 AND [revision].[connection_configuration_version]
                   = [connection].[configuration_version]
                 AND [model].[ai_connection_id] = [connection].[id]
                 AND [model].[deleted_at] IS NULL
             )
             AND (
               [connection].[authentication_type] = N'none'
               OR EXISTS (
                 SELECT 1 FROM [ai_provider_secret_versions] AS [secret]
                 WHERE [secret].[id] = @5
                   AND [secret].[ai_connection_id] = [connection].[id]
                   AND [secret].[status] = N'active'
                   AND [secret].[ciphertext] IS NOT NULL
               )
             );`,
          [
            input.connectionId,
            input.connectionRevisionToken,
            input.connectionEvidenceId,
            input.modelRevisionId,
            input.modelRevisionToken,
            input.secretVersionId,
            input.attestationId,
            input.attestationRevisionToken,
          ],
        )
        if (!rows?.[0]) return null
        const loaded = await loadConnection(manager, input.connectionId)
        if (!loaded) return null
        await audit(
          {
            operation: 'activate',
            resourceId: input.connectionId,
            resourceType: 'ai_connection',
          },
          manager,
        )
        return summaryFromDetail(loaded)
      })
    },

    async setRunProfileOperationalStatus(input) {
      return db.transaction('SERIALIZABLE', async manager => {
        const rows = await manager.query<Array<{ id: string }>>(
          `UPDATE [ai_run_profiles] WITH (UPDLOCK, HOLDLOCK)
           SET [operational_status] = @2, [updated_at] = SYSUTCDATETIME(),
             [revision_token] = NEWID()
           OUTPUT INSERTED.[id]
           WHERE [profile_key] = @0 AND [revision_token] = @1
             AND (@2 = N'enabled'
               OR [ai_connection_model_revision_id] IS NOT NULL)`,
          [input.profileKey, input.revisionToken, input.status],
        )
        if (!rows?.[0]) return null
        if (input.status === 'suspended') {
          await manager.query(
            `UPDATE [entry]
             SET [cancellation_requested_at] = SYSUTCDATETIME(),
               [cancellation_reason] = N'profile_suspended',
               [updated_at] = SYSUTCDATETIME()
             FROM [ai_run_coordination_entries] AS [entry]
             INNER JOIN [ai_run_profiles] AS [profile]
               ON [profile].[id] = [entry].[ai_run_profile_id]
             WHERE [profile].[profile_key] = @0
               AND [entry].[status] IN (N'queued', N'retry_wait', N'running')
               AND [entry].[cancellation_requested_at] IS NULL`,
            [input.profileKey],
          )
        }
        const profile =
          (await loadProfiles(manager, input.profileKey))[0] ?? null
        if (!profile) return null
        await audit(
          {
            operation: input.status === 'suspended' ? 'suspend' : 'activate',
            resourceId: profile.id,
            resourceType: 'ai_run_profile',
          },
          manager,
        )
        return profile
      })
    },
  }
}

function summaryFromDetail(
  connection: AiAdminStoredConnectionDetail,
): AiAdminConnectionSummary {
  return {
    administrationName: connection.administrationName,
    configurationVersion: connection.configurationVersion,
    id: connection.id,
    lifecycleStatus: connection.lifecycleStatus,
    operationalHealth: connection.operationalHealth,
    publicName: connection.publicName,
    revisionToken: connection.revisionToken,
  }
}

export const __testing = {
  CONNECTION_COLUMNS,
  CONNECTION_JOINS,
  activeSecret,
  attestation,
  blockers,
  emptyCapabilities,
  iso,
  jsonArray,
  jsonCapability,
  mapProfile,
  models,
  requireLoaded,
  sameId,
  summary,
  summaryFromDetail,
}

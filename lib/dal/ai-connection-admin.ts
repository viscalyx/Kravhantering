import { createHash, randomUUID } from 'node:crypto'
import {
  type AiCapability,
  aiCapabilityPolicySchema,
  aiCapabilitySchema,
  type CreateAiConnection,
} from '@/lib/ai/admin-contracts'
import type {
  AiAdminAttestationRecord,
  AiAdminAudit,
  AiAdminBlocker,
  AiAdminConnectionDetail,
  AiAdminConnectionSummary,
  AiAdminModelRecord,
  AiAdminModelRevisionRecord,
  AiAdminModelVerificationResult,
  AiAdminProfileActivationEntry,
  AiAdminRunProfileRecord,
  AiAdminRunProfileRevisionRecord,
  AiAdminStore,
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
  revisionId: string
  revisionNumber: number | string
  status: AiAdminModelRevisionRecord['status']
  verifiedCapabilitiesJson: string | null
}

interface ProfileRow {
  activeRevisionId: string | null
  capabilityPolicyJson: string | null
  draftRevisionId: string | null
  inactivityTimeBudgetSeconds: number | string | null
  modelRevisionId: string | null
  operationalStatus: AiAdminRunProfileRecord['operationalStatus']
  profileId: string
  profileKey: AiRunProfileKey
  profileRevisionNumber: number | string | null
  profileRevisionToken: string | null
  profileToken: string
  queueCapacity: number | string | null
  totalTimeBudgetSeconds: number | string | null
}

interface ProfileRevisionRow {
  capabilityPolicyJson: string
  connectionId?: string
  id: string
  inactivityTimeBudgetSeconds: number | string
  modelRevisionId: string | null
  profileKey?: AiRunProfileKey
  queueCapacity: number | string
  revisionNumber: number | string
  revisionToken: string
  status: AiAdminRunProfileRevisionRecord['status']
  totalTimeBudgetSeconds: number | string
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
    SELECT TOP (1) [candidate].[id]
    FROM [ai_connection_verification_evidence] AS [candidate]
    WHERE [candidate].[ai_connection_id] = [connection].[id]
      AND [candidate].[connection_configuration_version]
        = [connection].[configuration_version]
      AND [candidate].[adapter_version] = [connection].[adapter_version]
      AND ([candidate].[agent_runtime_version] = [connection].[agent_runtime_version]
        OR ([candidate].[agent_runtime_version] IS NULL
          AND [connection].[agent_runtime_version] IS NULL))
      AND [candidate].[outcome] = N'passed'
      AND ([candidate].[expires_at] IS NULL
        OR [candidate].[expires_at] > SYSUTCDATETIME())
    ORDER BY [candidate].[verified_at] DESC
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
): AiAdminConnectionDetail['activeSecret'] {
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
      revisionNumber: Number(row.revisionNumber),
      revisionToken: row.modelRevisionToken,
      status: row.status,
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
): Promise<AiAdminConnectionDetail | null> {
  return (await loadConnections(executor, [connectionId]))[0] ?? null
}

async function loadConnections(
  executor: SqlServerDatabase | SqlServerEntityManager,
  connectionIds: readonly string[],
): Promise<AiAdminConnectionDetail[]> {
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
       FROM [ai_connection_models] AS [model]
       INNER JOIN [ai_connection_model_revisions] AS [revision]
         ON [revision].[ai_connection_model_id] = [model].[id]
       WHERE [model].[ai_connection_id] IN (
         SELECT TRY_CONVERT(uniqueidentifier, [value]) FROM OPENJSON(@0)
       )
       ORDER BY [model].[ai_connection_id], [model].[created_at],
         [revision].[revision_number]`,
      [idsJson],
    ),
  ])
  return connectionRows.map(row => {
    const attestationRow = attestationRows.find(candidate =>
      sameId(candidate.connectionId, row.id),
    )
    return {
      ...summary(row),
      activeSecret: activeSecret(row),
      adapterKey: row.adapterKey,
      adapterVersion: row.adapterVersion,
      agentRuntimeKey: row.agentRuntimeKey,
      agentRuntimeVersion: row.agentRuntimeVersion,
      attestation: attestationRow ? attestation(attestationRow) : null,
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
  let draftRevision: AiAdminRunProfileRevisionRecord | null = null
  if (
    row.draftRevisionId &&
    row.capabilityPolicyJson &&
    row.profileRevisionToken &&
    row.profileRevisionNumber !== null &&
    row.totalTimeBudgetSeconds !== null &&
    row.inactivityTimeBudgetSeconds !== null &&
    row.queueCapacity !== null
  ) {
    let rawPolicy: unknown
    try {
      rawPolicy = JSON.parse(row.capabilityPolicyJson) as unknown
    } catch {
      rawPolicy = null
    }
    const parsed = aiCapabilityPolicySchema.safeParse(rawPolicy)
    if (parsed.success) {
      draftRevision = {
        capabilityPolicy: parsed.data,
        id: row.draftRevisionId,
        inactivityTimeBudgetSeconds: Number(row.inactivityTimeBudgetSeconds),
        modelRevisionId: row.modelRevisionId,
        queueCapacity: Number(row.queueCapacity),
        revisionNumber: Number(row.profileRevisionNumber),
        revisionToken: row.profileRevisionToken,
        status: 'draft',
        totalTimeBudgetSeconds: Number(row.totalTimeBudgetSeconds),
      }
    }
  }
  const profile: AiAdminRunProfileRecord = {
    activeRevisionId: row.activeRevisionId,
    blockers: [],
    draftRevision,
    id: row.profileId,
    operationalStatus: row.operationalStatus,
    profileKey: row.profileKey,
    revisionToken: row.profileToken,
  }
  return profile
}

async function loadProfileRevisions(
  executor: SqlServerDatabase | SqlServerEntityManager,
  profileKey: AiRunProfileKey,
  revisionId: string | null = null,
): Promise<AiAdminRunProfileRevisionRecord[]> {
  const rows = await executor.query<ProfileRevisionRow[]>(
    `SELECT [revision].[id], [revision].[revision_number] AS [revisionNumber],
       [revision].[status],
       [revision].[ai_connection_model_revision_id] AS [modelRevisionId],
       [revision].[capability_policy_json] AS [capabilityPolicyJson],
       [revision].[total_time_budget_seconds] AS [totalTimeBudgetSeconds],
       [revision].[inactivity_time_budget_seconds]
         AS [inactivityTimeBudgetSeconds],
       [revision].[queue_capacity] AS [queueCapacity],
       [revision].[revision_token] AS [revisionToken]
     FROM [ai_run_profile_revisions] AS [revision]
     INNER JOIN [ai_run_profiles] AS [profile]
       ON [profile].[id] = [revision].[ai_run_profile_id]
     WHERE (@0 IS NULL OR [revision].[id] = @0)
       AND [profile].[profile_key] = @1
     ORDER BY [revision].[revision_number] DESC`,
    [revisionId, profileKey],
  )
  return rows.flatMap(mapProfileRevisionRow)
}

function mapProfileRevisionRow(
  row: ProfileRevisionRow,
): AiAdminRunProfileRevisionRecord[] {
  let rawPolicy: unknown
  try {
    rawPolicy = JSON.parse(row.capabilityPolicyJson) as unknown
  } catch {
    return []
  }
  const policy = aiCapabilityPolicySchema.safeParse(rawPolicy)
  if (!policy.success) return []
  return [
    {
      capabilityPolicy: policy.data,
      id: row.id,
      inactivityTimeBudgetSeconds: Number(row.inactivityTimeBudgetSeconds),
      modelRevisionId: row.modelRevisionId,
      queueCapacity: Number(row.queueCapacity),
      revisionNumber: Number(row.revisionNumber),
      revisionToken: row.revisionToken,
      status: row.status,
      totalTimeBudgetSeconds: Number(row.totalTimeBudgetSeconds),
    },
  ]
}

async function loadProfileRevision(
  executor: SqlServerDatabase | SqlServerEntityManager,
  profileKey: AiRunProfileKey,
  revisionId: string,
): Promise<AiAdminRunProfileRevisionRecord | null> {
  return (
    (await loadProfileRevisions(executor, profileKey, revisionId))[0] ?? null
  )
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
       [draft].[id] AS [draftRevisionId],
       [draft].[revision_number] AS [profileRevisionNumber],
       [draft].[ai_connection_model_revision_id] AS [modelRevisionId],
       [draft].[capability_policy_json] AS [capabilityPolicyJson],
       [draft].[total_time_budget_seconds] AS [totalTimeBudgetSeconds],
       [draft].[inactivity_time_budget_seconds] AS [inactivityTimeBudgetSeconds],
       [draft].[queue_capacity] AS [queueCapacity],
       [draft].[revision_token] AS [profileRevisionToken],
       [active].[id] AS [activeRevisionId]
     FROM [ai_run_profiles] AS [profile]
     LEFT JOIN [ai_run_profile_revisions] AS [draft]
       ON [draft].[ai_run_profile_id] = [profile].[id]
       AND [draft].[status] = N'draft'
     LEFT JOIN [ai_run_profile_revisions] AS [active]
       ON [active].[ai_run_profile_id] = [profile].[id]
       AND [active].[status] = N'active'
     WHERE (@0 IS NULL OR [profile].[profile_key] = @0)
     ORDER BY [profile].[profile_key]`,
    [profileKey ?? null],
  )
  return rows.map(mapProfile)
}

async function loadProfileActivationEntries(
  executor: SqlServerDatabase | SqlServerEntityManager,
): Promise<AiAdminProfileActivationEntry[]> {
  const profiles = await loadProfiles(executor)
  const rows = await executor.query<ProfileRevisionRow[]>(
    `SELECT [profile].[profile_key] AS [profileKey],
       [revision].[id], [revision].[revision_number] AS [revisionNumber],
       [revision].[status],
       [revision].[ai_connection_model_revision_id] AS [modelRevisionId],
       [revision].[capability_policy_json] AS [capabilityPolicyJson],
       [revision].[total_time_budget_seconds] AS [totalTimeBudgetSeconds],
       [revision].[inactivity_time_budget_seconds]
         AS [inactivityTimeBudgetSeconds],
       [revision].[queue_capacity] AS [queueCapacity],
       [revision].[revision_token] AS [revisionToken],
       [model].[ai_connection_id] AS [connectionId]
     FROM [ai_run_profiles] AS [profile]
     INNER JOIN [ai_run_profile_revisions] AS [revision]
       ON [revision].[id] = COALESCE(
         (SELECT TOP (1) [active].[id]
          FROM [ai_run_profile_revisions] AS [active]
          WHERE [active].[ai_run_profile_id] = [profile].[id]
            AND [active].[status] = N'active'),
         (SELECT TOP (1) [draft].[id]
          FROM [ai_run_profile_revisions] AS [draft]
          WHERE [draft].[ai_run_profile_id] = [profile].[id]
            AND [draft].[status] = N'draft'
          ORDER BY [draft].[revision_number] DESC)
       )
     INNER JOIN [ai_connection_model_revisions] AS [model_revision]
       ON [model_revision].[id] = [revision].[ai_connection_model_revision_id]
     INNER JOIN [ai_connection_models] AS [model]
       ON [model].[id] = [model_revision].[ai_connection_model_id]`,
  )
  const connections = await loadConnections(
    executor,
    rows.flatMap(row => (row.connectionId ? [row.connectionId] : [])),
  )
  return profiles.map(profile => {
    const row = rows.find(
      candidate => candidate.profileKey === profile.profileKey,
    )
    const profileRevision = row ? mapProfileRevisionRow(row)[0] : undefined
    const connection = connections.find(candidate =>
      sameId(candidate.id, row?.connectionId),
    )
    const modelRevision = connection?.models
      .flatMap(model => model.revisions)
      .find(revision => sameId(revision.id, profileRevision?.modelRevisionId))
    if (!profileRevision || !connection || !modelRevision) {
      return { profile, snapshot: null }
    }
    return {
      profile,
      snapshot: {
        attestationRevisionToken:
          connection.attestation?.status === 'valid'
            ? connection.attestation.revisionToken
            : null,
        connection,
        connectionEvidenceId: connection.connectionEvidenceId,
        modelRevision,
        profile,
        profileRevision,
        secretVersionId: connection.activeSecret.available
          ? connection.activeSecret.secretVersionId
          : null,
      },
    }
  })
}

function configurationFingerprint(connection: AiAdminConnectionDetail): string {
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
             SET [status] = N'verification_required',
               [verified_capabilities_json] = NULL, [verified_at] = NULL,
               [updated_at] = SYSUTCDATETIME(), [revision_token] = NEWID()
             FROM [ai_connection_model_revisions] AS [revision]
             INNER JOIN [ai_connection_models] AS [model]
               ON [model].[id] = [revision].[ai_connection_model_id]
             WHERE [model].[ai_connection_id] = @0
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

    async saveModelRevision(input) {
      return db.transaction('SERIALIZABLE', async manager => {
        const value = input.modelRevision
        const modelRevisionId = randomUUID()
        let technicalChanged = true
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
               AND [revision_token] = @4`,
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
          const currentRows = await manager.query<
            Array<{
              agentRuntimeVersion: string | null
              currentAgentRuntimeVersion: string | null
              declaredCapabilitiesJson: string
              discoveredCapabilitiesJson: string | null
              externalModelId: string
              externalModelVersion: string | null
            }>
          >(
            `SELECT TOP (1)
               [revision].[external_model_id] AS [externalModelId],
               [revision].[external_model_version] AS [externalModelVersion],
               [revision].[agent_runtime_version] AS [agentRuntimeVersion],
               [connection].[agent_runtime_version]
                 AS [currentAgentRuntimeVersion],
               [revision].[declared_capabilities_json]
                 AS [declaredCapabilitiesJson],
               [revision].[discovered_capabilities_json]
                 AS [discoveredCapabilitiesJson]
             FROM [ai_connection_model_revisions] AS [revision]
               WITH (UPDLOCK, HOLDLOCK)
             INNER JOIN [ai_connection_models] AS [model]
               ON [model].[id] = [revision].[ai_connection_model_id]
             INNER JOIN [ai_connections] AS [connection]
               ON [connection].[id] = [model].[ai_connection_id]
             WHERE [model].[id] = @0 AND [model].[ai_connection_id] = @1
             ORDER BY [revision].[revision_number] DESC`,
            [modelId, input.connectionId],
          )
          const current = currentRows[0]
          technicalChanged =
            !current ||
            current.externalModelId !== value.externalModelId ||
            current.externalModelVersion !== value.externalModelVersion ||
            current.agentRuntimeVersion !==
              current.currentAgentRuntimeVersion ||
            current.declaredCapabilitiesJson !==
              JSON.stringify(value.declaredCapabilities) ||
            current.discoveredCapabilitiesJson !==
              (value.discoveredCapabilities === null
                ? null
                : JSON.stringify(value.discoveredCapabilities))
        }
        if (technicalChanged) {
          await manager.query(
            `DECLARE @configuration_version int = (
               SELECT [configuration_version]
               FROM [ai_connections] WITH (UPDLOCK, HOLDLOCK)
               WHERE [id] = @0
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
               [discovered_capabilities_json], [created_at], [updated_at]
             )
             SELECT @2, @1, @revision_number, [configuration_version], N'draft',
               @3, @4, [agent_runtime_version], @5, @6,
               SYSUTCDATETIME(), SYSUTCDATETIME()
             FROM [ai_connections]
             WHERE [id] = @0;`,
            [
              input.connectionId,
              modelId,
              modelRevisionId,
              value.externalModelId,
              value.externalModelVersion,
              JSON.stringify(value.declaredCapabilities),
              value.discoveredCapabilities === null
                ? null
                : JSON.stringify(value.discoveredCapabilities),
            ],
          )
        }
        const loaded = await loadConnection(manager, input.connectionId)
        const model = loaded?.models.find(candidate =>
          sameId(candidate.id, modelId),
        )
        if (!model) throw new Error('AI connection model was not saved.')
        await audit(
          {
            changedFields: technicalChanged
              ? Object.keys(input.modelRevision).filter(
                  field => !field.toLowerCase().includes('token'),
                )
              : ['name', 'description'],
            operation: 'save',
            resourceId: technicalChanged ? modelRevisionId : modelId,
            resourceType: technicalChanged
              ? 'ai_connection_model_revision'
              : 'ai_connection_model',
          },
          manager,
        )
        return model
      })
    },

    async recordConnectionVerification({ connection, result }) {
      const evidenceId = randomUUID()
      return db.transaction('SERIALIZABLE', async manager => {
        await manager.query(
          `IF NOT EXISTS (
             SELECT 1 FROM [ai_connections] WITH (UPDLOCK, HOLDLOCK)
             WHERE [id] = @1 AND [configuration_version] = @2
               AND [revision_token] = @10
           )
             THROW 51120, 'AI connection changed during verification.', 1;

           INSERT INTO [ai_connection_verification_evidence] (
             [id], [ai_connection_id], [connection_configuration_version],
             [outcome], [test_suite_version], [adapter_version],
             [agent_runtime_version], [configuration_fingerprint],
             [failure_category], [details_json], [verified_at], [expires_at]
           ) VALUES (
             @0, @1, @2, @3, @4, @5, @6, @7, @8, @9,
             SYSUTCDATETIME(), DATEADD(day, 30, SYSUTCDATETIME())
           );
           IF @3 = N'failed' AND @8 = N'authentication_failed'
           BEGIN
             UPDATE [ai_connection_verification_evidence]
             SET [expires_at] = SYSUTCDATETIME()
             WHERE [ai_connection_id] = @1
               AND [connection_configuration_version] = @2
               AND [outcome] = N'passed'
               AND ([expires_at] IS NULL OR [expires_at] > SYSUTCDATETIME());

             UPDATE [ai_connections]
             SET [lifecycle_status] = CASE
                 WHEN [lifecycle_status] = N'draft' THEN N'draft'
                 WHEN [lifecycle_status] = N'retired' THEN N'retired'
                 ELSE N'verification_required'
               END,
               [updated_at] = SYSUTCDATETIME(), [revision_token] = NEWID()
             WHERE [id] = @1 AND [configuration_version] = @2
               AND [revision_token] = @10;

             UPDATE [revision]
             SET [status] = N'verification_required',
               [verified_capabilities_json] = NULL, [verified_at] = NULL,
               [updated_at] = SYSUTCDATETIME(), [revision_token] = NEWID()
             FROM [ai_connection_model_revisions] AS [revision]
             INNER JOIN [ai_connection_models] AS [model]
               ON [model].[id] = [revision].[ai_connection_model_id]
             WHERE [model].[ai_connection_id] = @1
               AND [revision].[status] = N'verified';
           END;`,
          [
            evidenceId,
            connection.id,
            connection.configurationVersion,
            result.outcome,
            result.testSuiteVersion,
            connection.adapterVersion,
            connection.agentRuntimeVersion,
            configurationFingerprint(connection),
            result.failureCategory,
            JSON.stringify(result.details),
            connection.revisionToken,
          ],
        )
        const updated = requireLoaded(
          await loadConnection(manager, connection.id),
          'AI connection verification was not recorded.',
        )
        await audit(
          {
            operation: 'verify',
            resourceId: connection.id,
            resourceType: 'ai_connection',
          },
          manager,
        )
        return updated
      })
    },

    async recordModelVerification(input) {
      const result = input.result
      const evidenceId = randomUUID()
      return db.transaction('SERIALIZABLE', async manager => {
        const rows = await manager.query<Array<{ id: string }>>(
          `DECLARE @updated TABLE ([id] uniqueidentifier NOT NULL);

           IF NOT EXISTS (
             SELECT 1
             FROM [ai_connection_model_revisions] AS [revision]
               WITH (UPDLOCK, HOLDLOCK)
             INNER JOIN [ai_connection_models] AS [model]
               ON [model].[id] = [revision].[ai_connection_model_id]
             INNER JOIN [ai_connections] AS [connection]
               WITH (UPDLOCK, HOLDLOCK)
               ON [connection].[id] = [model].[ai_connection_id]
             INNER JOIN [ai_connection_verification_evidence] AS [connection_evidence]
               WITH (UPDLOCK, HOLDLOCK)
               ON [connection_evidence].[id] = @2
             WHERE [revision].[id] = @1
               AND [revision].[revision_token] = @9
               AND [revision].[status] IN (N'draft', N'verification_required')
               AND [revision].[connection_configuration_version]
                 = [connection].[configuration_version]
               AND [connection].[id] = @10
               AND [connection].[configuration_version] = @11
               AND [connection].[revision_token] = @12
               AND [connection_evidence].[ai_connection_id] = [connection].[id]
               AND [connection_evidence].[connection_configuration_version]
                 = [connection].[configuration_version]
               AND [connection_evidence].[outcome] = N'passed'
               AND ([connection_evidence].[expires_at] IS NULL
                 OR [connection_evidence].[expires_at] > SYSUTCDATETIME())
           ) RETURN;

           INSERT INTO [ai_connection_model_verification_evidence] (
             [id], [ai_connection_model_revision_id],
             [ai_connection_verification_evidence_id], [outcome],
             [test_suite_version], [verified_capabilities_json],
             [evidence_fingerprint], [failure_category], [details_json],
             [verified_at]
           ) VALUES (
             @0, @1, @2, @3, @4, @5, @6, @7, @8, SYSUTCDATETIME()
           );
           UPDATE [ai_connection_model_revisions] WITH (UPDLOCK, HOLDLOCK)
           SET [status] = CASE WHEN @3 = N'passed' THEN N'verified'
               ELSE N'verification_required' END,
             [verified_capabilities_json] = CASE WHEN @3 = N'passed' THEN @5
               ELSE NULL END,
             [verified_at] = CASE WHEN @3 = N'passed' THEN SYSUTCDATETIME()
               ELSE NULL END,
             [updated_at] = SYSUTCDATETIME(), [revision_token] = NEWID()
           OUTPUT INSERTED.[id] INTO @updated ([id])
           WHERE [id] = @1 AND [revision_token] = @9
             AND [status] IN (N'draft', N'verification_required');

           SELECT [id] FROM @updated;`,
          [
            evidenceId,
            input.modelRevision.id,
            input.connectionEvidenceId,
            result.outcome,
            result.testSuiteVersion,
            JSON.stringify(result.verifiedCapabilities),
            configurationFingerprintForModel(input.modelRevision, result),
            result.failureCategory,
            JSON.stringify(result.details),
            input.modelRevision.revisionToken,
            input.connection.id,
            input.connection.configurationVersion,
            input.connection.revisionToken,
          ],
        )
        if (!rows?.[0]) {
          throw conflictError(
            'AI model revision changed. Reload and try again.',
          )
        }
        const connectionRows = await manager.query<
          Array<{ connectionId: string }>
        >(
          `SELECT [model].[ai_connection_id] AS [connectionId]
           FROM [ai_connection_model_revisions] AS [revision]
           INNER JOIN [ai_connection_models] AS [model]
             ON [model].[id] = [revision].[ai_connection_model_id]
           WHERE [revision].[id] = @0`,
          [input.modelRevision.id],
        )
        const loaded = connectionRows[0]
          ? await loadConnection(manager, connectionRows[0].connectionId)
          : null
        const revision = loaded?.models
          .flatMap(model => model.revisions)
          .find(candidate => sameId(candidate.id, input.modelRevision.id))
        if (!revision)
          throw new Error('AI model verification was not recorded.')
        await audit(
          {
            operation: 'verify',
            resourceId: revision.id,
            resourceType: 'ai_connection_model_revision',
          },
          manager,
        )
        return revision
      })
    },

    async retireModelRevision(input) {
      return db.transaction('SERIALIZABLE', async manager => {
        const rows = await manager.query<Array<{ id: string }>>(
          `DECLARE @updated TABLE ([id] uniqueidentifier NOT NULL);

           UPDATE [revision] WITH (UPDLOCK, HOLDLOCK)
           SET [status] = N'retired', [verified_capabilities_json] = NULL,
             [verified_at] = NULL, [retired_at] = SYSUTCDATETIME(),
             [updated_at] = SYSUTCDATETIME(),
             [revision_token] = NEWID()
           OUTPUT INSERTED.[id] INTO @updated ([id])
           FROM [ai_connection_model_revisions] AS [revision]
           INNER JOIN [ai_connection_models] AS [model]
             ON [model].[id] = [revision].[ai_connection_model_id]
           WHERE [revision].[id] = @0 AND [revision].[revision_token] = @1
             AND [revision].[status]
               IN (N'verified', N'verification_required')
             AND [model].[ai_connection_id] = @2;

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

    async recordHealth(input) {
      return db.transaction('SERIALIZABLE', async manager => {
        const rows = await manager.query<Array<{ id: string }>>(
          `IF NOT EXISTS (
             SELECT 1
             FROM [ai_connection_model_revisions] AS [revision]
               WITH (UPDLOCK, HOLDLOCK)
             INNER JOIN [ai_connection_models] AS [model]
               ON [model].[id] = [revision].[ai_connection_model_id]
             WHERE [revision].[id] = @1
               AND [revision].[revision_token] = @2
               AND [revision].[status] = N'verified'
               AND [model].[ai_connection_id] = @0
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

           IF @4 = 1
           BEGIN
             UPDATE [ai_connection_model_revisions]
             SET [status] = N'verification_required',
               [verified_capabilities_json] = NULL, [verified_at] = NULL,
               [updated_at] = SYSUTCDATETIME(), [revision_token] = NEWID()
             WHERE [id] = @1 AND [revision_token] = @2
               AND [status] = N'verified';
           END;

           SELECT @1 AS [id];`,
          [
            input.connectionId,
            input.modelRevisionId,
            input.modelRevisionToken,
            input.health,
            input.invalidatesVerification ? 1 : 0,
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

    listRunProfileActivationEntries() {
      return loadProfileActivationEntries(db)
    },

    listRunProfileRevisions(profileKey) {
      return loadProfileRevisions(db, profileKey)
    },

    async saveRunProfileRevision(input) {
      return db.transaction('SERIALIZABLE', async manager => {
        const profiles = await manager.query<Array<{ id: string }>>(
          `SELECT [id] FROM [ai_run_profiles] WITH (UPDLOCK, HOLDLOCK)
           WHERE [profile_key] = @0`,
          [input.profileKey],
        )
        const profileId = profiles[0]?.id
        if (!profileId) throw new Error('AI run profile does not exist.')
        const value = input.revision
        if (value.revisionToken) {
          const rows = await manager.query<Array<{ id: string }>>(
            `DECLARE @updated TABLE ([id] uniqueidentifier NOT NULL);

             UPDATE [ai_run_profile_revisions]
             SET [ai_connection_model_revision_id] = @2,
               [capability_policy_json] = @3,
               [total_time_budget_seconds] = @4,
               [inactivity_time_budget_seconds] = @5,
               [queue_capacity] = @6, [revision_token] = NEWID()
             OUTPUT INSERTED.[id] INTO @updated ([id])
             WHERE [ai_run_profile_id] = @0 AND [revision_token] = @1
               AND [status] = N'draft';

             SELECT [id] FROM @updated;`,
            [
              profileId,
              value.revisionToken,
              value.modelRevisionId,
              JSON.stringify(value.capabilityPolicy),
              value.totalTimeBudgetSeconds,
              value.inactivityTimeBudgetSeconds,
              value.queueCapacity,
            ],
          )
          if (!rows?.[0]) {
            throw conflictError(
              'AI run profile revision changed. Reload and try again.',
            )
          }
        } else {
          await manager.query(
            `DECLARE @revision_number int = (
               SELECT COALESCE(MAX([revision_number]), 0) + 1
               FROM [ai_run_profile_revisions] WITH (UPDLOCK, HOLDLOCK)
               WHERE [ai_run_profile_id] = @0
             );
             INSERT INTO [ai_run_profile_revisions] (
               [id], [ai_run_profile_id], [ai_connection_model_revision_id],
               [revision_number], [status], [capability_policy_json],
               [total_time_budget_seconds], [inactivity_time_budget_seconds],
               [queue_capacity], [created_at]
             ) VALUES (
               @1, @0, @2, @revision_number, N'draft', @3, @4, @5, @6,
               SYSUTCDATETIME()
             );`,
            [
              profileId,
              randomUUID(),
              value.modelRevisionId,
              JSON.stringify(value.capabilityPolicy),
              value.totalTimeBudgetSeconds,
              value.inactivityTimeBudgetSeconds,
              value.queueCapacity,
            ],
          )
        }
        const profile = (await loadProfiles(manager, input.profileKey))[0]
        if (!profile) throw new Error('AI run profile revision was not saved.')
        await audit(
          {
            changedFields: Object.keys(input.revision).filter(
              field => field !== 'revisionToken',
            ),
            operation: 'save',
            resourceId: profile.draftRevision?.id ?? profile.id,
            resourceType: 'ai_run_profile_revision',
          },
          manager,
        )
        return profile
      })
    },

    async getActivationSnapshot(input) {
      const profiles = await loadProfiles(db, input.profileKey)
      const profile = profiles[0]
      if (!profile) return null
      const profileRevision = await loadProfileRevision(
        db,
        input.profileKey,
        input.profileRevisionId,
      )
      if (!profileRevision) return null
      const rows = await db.query<Array<{ connectionId: string }>>(
        `SELECT [model].[ai_connection_id] AS [connectionId]
         FROM [ai_connection_model_revisions] AS [revision]
         INNER JOIN [ai_connection_models] AS [model]
           ON [model].[id] = [revision].[ai_connection_model_id]
         WHERE [revision].[id] = @0`,
        [profileRevision.modelRevisionId],
      )
      const connectionId = rows?.[0]?.connectionId
      if (!connectionId) return null
      const connection = await loadConnection(db, connectionId)
      if (!connection) return null
      const modelRevision =
        connection.models
          .flatMap(model => model.revisions)
          .find(revision =>
            sameId(revision.id, profileRevision.modelRevisionId),
          ) ?? null
      return {
        attestationRevisionToken:
          connection.attestation?.status === 'valid'
            ? connection.attestation.revisionToken
            : null,
        connection,
        connectionEvidenceId: connection.connectionEvidenceId,
        modelRevision,
        profile,
        profileRevision,
        secretVersionId: connection.activeSecret.available
          ? connection.activeSecret.secretVersionId
          : null,
      }
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

    async activateRunProfileRevision(input) {
      return db.transaction('SERIALIZABLE', async manager => {
        const rows = await manager.query<
          Array<{ profileKey: AiRunProfileKey }>
        >(
          `DECLARE @now datetime2(3) = SYSUTCDATETIME();
           DECLARE @profile_id uniqueidentifier;

           SELECT @profile_id = [profile].[id]
           FROM [ai_run_profile_revisions] AS [candidate] WITH (UPDLOCK, HOLDLOCK)
           INNER JOIN [ai_run_profiles] AS [profile] WITH (UPDLOCK, HOLDLOCK)
             ON [profile].[id] = [candidate].[ai_run_profile_id]
           INNER JOIN [ai_connection_model_revisions] AS [model_revision] WITH (UPDLOCK, HOLDLOCK)
             ON [model_revision].[id]
               = [candidate].[ai_connection_model_revision_id]
           INNER JOIN [ai_connection_models] AS [model] WITH (UPDLOCK, HOLDLOCK)
             ON [model].[id] = [model_revision].[ai_connection_model_id]
           INNER JOIN [ai_connections] AS [connection] WITH (UPDLOCK, HOLDLOCK)
             ON [connection].[id] = [model].[ai_connection_id]
           INNER JOIN [ai_connection_attestations] AS [attestation] WITH (UPDLOCK, HOLDLOCK)
             ON [attestation].[ai_connection_id] = [connection].[id]
             AND [attestation].[status] = N'valid'
           INNER JOIN [ai_connection_verification_evidence] AS [evidence] WITH (UPDLOCK, HOLDLOCK)
             ON [evidence].[id] = @5
             AND [evidence].[ai_connection_id] = [connection].[id]
           WHERE [candidate].[id] = @0
             AND [candidate].[status] IN (N'draft', N'superseded')
             AND [profile].[revision_token] = @7
             AND [candidate].[revision_token] = @1
             AND [model_revision].[revision_token] = @2
             AND [model_revision].[status] = N'verified'
             AND [connection].[revision_token] = @3
             AND [connection].[lifecycle_status] = N'active'
             AND [attestation].[revision_token] = @4
             AND ([attestation].[review_due_at] IS NULL
               OR [attestation].[review_due_at] > @now)
             AND [evidence].[connection_configuration_version]
               = [connection].[configuration_version]
             AND [evidence].[outcome] = N'passed'
             AND ([evidence].[expires_at] IS NULL OR [evidence].[expires_at] > @now)
             AND [model_revision].[connection_configuration_version]
               = [connection].[configuration_version]
             AND (
               [connection].[authentication_type] = N'none'
               OR EXISTS (
                 SELECT 1 FROM [ai_provider_secret_versions] AS [secret]
                 WHERE [secret].[id] = @6
                   AND [secret].[ai_connection_id] = [connection].[id]
                   AND [secret].[status] = N'active'
                   AND [secret].[ciphertext] IS NOT NULL
               )
             );

           IF @profile_id IS NULL RETURN;

           UPDATE [ai_run_profile_revisions]
           SET [status] = N'superseded', [superseded_at] = @now,
             [revision_token] = NEWID()
           WHERE [ai_run_profile_id] = @profile_id AND [status] = N'active';

           UPDATE [ai_run_profile_revisions]
           SET [status] = N'active', [activated_at] = @now,
             [superseded_at] = NULL, [revision_token] = NEWID()
           WHERE [id] = @0 AND [status] IN (N'draft', N'superseded');

           UPDATE [ai_run_profiles]
           SET [updated_at] = @now, [revision_token] = NEWID()
           WHERE [id] = @profile_id AND [revision_token] = @7;

           SELECT [profile_key] AS [profileKey]
           FROM [ai_run_profiles] WHERE [id] = @profile_id;`,
          [
            input.profileRevisionId,
            input.profileRevisionToken,
            input.modelRevisionToken,
            input.connectionRevisionToken,
            input.attestationRevisionToken,
            input.connectionEvidenceId,
            input.secretVersionId,
            input.profileToken,
          ],
        )
        const profileKey = rows?.[0]?.profileKey
        if (!profileKey) return null
        const profile = (await loadProfiles(manager, profileKey))[0] ?? null
        if (!profile) return null
        await audit(
          {
            operation: 'activate',
            resourceId: input.profileRevisionId,
            resourceType: 'ai_run_profile_revision',
          },
          manager,
        )
        return profile
      })
    },

    async setRunProfileOperationalStatus(input) {
      return db.transaction('SERIALIZABLE', async manager => {
        const rows = await manager.query<Array<{ id: string }>>(
          `UPDATE [ai_run_profiles] WITH (UPDLOCK, HOLDLOCK)
           SET [operational_status] = @2, [updated_at] = SYSUTCDATETIME(),
             [revision_token] = NEWID()
           OUTPUT INSERTED.[id]
           WHERE [profile_key] = @0 AND [revision_token] = @1`,
          [input.profileKey, input.revisionToken, input.status],
        )
        if (!rows?.[0]) return null
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

function configurationFingerprintForModel(
  revision: AiAdminModelRevisionRecord,
  result: AiAdminModelVerificationResult,
): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        connectionConfigurationVersion: revision.connectionConfigurationVersion,
        declaredCapabilities: revision.declaredCapabilities,
        externalModelId: revision.externalModelId,
        externalModelVersion: revision.externalModelVersion,
        result: result.verifiedCapabilities,
      }),
    )
    .digest('hex')
}

function summaryFromDetail(
  connection: AiAdminConnectionDetail,
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
  mapProfileRevisionRow,
  models,
  requireLoaded,
  sameId,
  summary,
  summaryFromDetail,
}

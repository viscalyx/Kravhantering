import { createHash } from 'node:crypto'
import type { SqlServerEntityManager } from '@/lib/db'
import {
  conflictError,
  notFoundError,
  validationError,
} from '@/lib/requirements/errors'
import type { AiAdminBlocker } from './admin-blockers'
import type {
  AiCapability,
  CreateAiConnection,
  SaveAiAttestation,
  SaveAiModelRevision,
  SaveAiRunProfile,
} from './admin-contracts'
import {
  AiModelVerificationAttemptError,
  type AiModelVerificationAttemptLease,
  type AiModelVerificationAttemptStore,
  createAiModelVerificationAttemptStore,
} from './model-verification-attempts'
import type { AiRunProfileKey } from './profile-resolver'
import type {
  AiProviderSecretAvailability,
  AiProviderSecretVersionMetadata,
} from './provider-secret-service'
import { AI_ADMIN_FUNCTIONAL_PROBE_VERSION } from './provider-secret-service'
import { assertAiStagingLiveVerificationAllowed } from './staging-live-policy'

export type {
  AiAdminBlocker,
  AiAdminBlockerCode,
  AiAdminBlockerField,
} from './admin-blockers'
export {
  AI_ADMIN_BLOCKER_CODES,
  AI_ADMIN_BLOCKER_FIELDS,
} from './admin-blockers'

export interface AiAdminConnectionSummary {
  administrationName: string
  configurationVersion: number
  id: string
  lifecycleStatus:
    | 'active'
    | 'draft'
    | 'retired'
    | 'suspended'
    | 'verification_required'
  operationalHealth: 'degraded' | 'healthy' | 'unavailable' | 'unknown'
  publicName: string
  revisionToken: string
}

export interface AiAdminStoredConnectionDetail
  extends AiAdminConnectionSummary {
  activeSecret: AiProviderSecretAvailability
  adapterKey: string
  adapterVersion: string
  agentRuntimeKey: string | null
  agentRuntimeVersion: string | null
  attestation: AiAdminAttestationRecord | null
  attestationDraft: AiAdminAttestationRecord | null
  authenticationType:
    | 'mtls'
    | 'none'
    | 'oauth2_client_credentials'
    | 'static_secret'
  blockers: readonly AiAdminBlocker[]
  connectionEvidenceId: string | null
  dataPolicySummary: string
  description: string | null
  egressPolicyKey: string
  endpointUrl: string
  maximumConcurrency: number
  models: readonly AiAdminModelRecord[]
  tlsPolicyKey: string
}

export interface AiAdminConnectionDetail extends AiAdminStoredConnectionDetail {
  adapterAvailability: AiAdminAdapterAvailability
}

export interface AiAdminAttestationRecord extends SaveAiAttestation {
  id: string
  revisionNumber: number
  revisionToken: string
  status: 'draft' | 'expired' | 'revoked' | 'superseded' | 'valid'
}

export interface AiAdminModelRevisionRecord {
  agentRuntimeVersion: string | null
  connectionConfigurationVersion: number
  declaredCapabilities: AiCapability
  discoveredCapabilities: AiCapability | null
  externalModelId: string
  externalModelVersion: string | null
  id: string
  profileCompatibility: Readonly<
    Record<AiRunProfileKey, AiAdminProfileCompatibility>
  > | null
  revisionNumber: number
  revisionToken: string
  status: 'ended' | 'new_revision_required' | 'verified'
  testSuiteVersion: string | null
  verifiedAt: string | null
  verifiedCapabilities: AiCapability | null
}

export interface AiAdminModelRecord {
  description: string | null
  id: string
  name: string
  revisions: readonly AiAdminModelRevisionRecord[]
  revisionToken: string
}

export interface AiAdminRunProfileRecord {
  administrativeStatus: 'active' | 'blocked' | 'paused' | 'unconfigured'
  blockers: readonly AiAdminBlocker[]
  configurationStatus: 'blocked' | 'configured' | 'unconfigured'
  configurationVersion: number
  id: string
  inactivityTimeBudgetSeconds: number
  maximumBufferedEvents: number
  maximumOutputBytes: number
  maximumOutputTokens: number
  maximumRetainedMemoryBytes: number
  modelRevisionId: string | null
  operationalStatus: 'enabled' | 'suspended'
  profileKey: AiRunProfileKey
  queueCapacity: number
  revisionToken: string
  totalTimeBudgetSeconds: number
}

export function deriveAiRunProfileAdministrativeStatus(
  profile: Pick<
    AiAdminRunProfileRecord,
    'configurationStatus' | 'modelRevisionId' | 'operationalStatus'
  >,
): AiAdminRunProfileRecord['administrativeStatus'] {
  if (profile.modelRevisionId === null) return 'unconfigured'
  if (profile.operationalStatus === 'suspended') return 'paused'
  return profile.configurationStatus === 'configured' ? 'active' : 'blocked'
}

export interface AiAdminHealthProbeResult {
  failureCategory: string | null
  health: 'degraded' | 'healthy' | 'unavailable'
  invalidationScope: 'connection' | 'model' | 'none'
}

export type AiAdminVerificationOutcome =
  | 'inconclusive'
  | 'not_checked'
  | 'not_verified'
  | 'verified'

export interface AiAdminCapabilityVerification {
  diagnosticCode: string | null
  failureCategory: string | null
  outcome: AiAdminVerificationOutcome
}

export interface AiAdminModelVerificationCandidate {
  externalModelId: string
  externalModelVersion: string | null
}

export interface AiAdminProfileCompatibility {
  diagnosticCode: string | null
  failureCategory: string | null
  missingCapabilities: readonly (keyof AiCapability)[]
  outcome: AiAdminVerificationOutcome
  supported: boolean
}

export interface AiAdminCandidateVerificationResult {
  baseline: AiAdminCapabilityVerification
  canonicalExternalModelVersion: string | null
  capabilities: Readonly<
    Record<keyof AiCapability, AiAdminCapabilityVerification>
  >
  connection: AiAdminCapabilityVerification
  profileCompatibility: Readonly<
    Record<AiRunProfileKey, AiAdminProfileCompatibility>
  >
  saveable: boolean
  testSuiteVersion: string
}

export interface AiAdminCandidateVerificationAttemptResult
  extends AiAdminCandidateVerificationResult {
  attemptExpiresAt: string | null
  attemptId: string | null
}

export type AiAdminVerificationCheck =
  | 'baseline_model_access'
  | 'connection_authentication'
  | 'summary'
  | `capability:${keyof AiCapability}`
  | `profile:${AiRunProfileKey}`

export interface AiAdminVerificationProgress {
  check: AiAdminVerificationCheck
  diagnosticCode: string | null
  failureCategory: string | null
  outcome: AiAdminVerificationOutcome
  state: 'completed' | 'running'
}

export interface AiAdminLivePathExternalResult {
  adapterType: string
  adapterVersion: string
  executionId: string
  externalLiveCallMade: boolean
  failureCategory: string | null
  outcome: 'failed' | 'passed'
  testSuiteVersion: string
}

export interface AiAdminLivePathVerificationResult
  extends AiAdminLivePathExternalResult {
  aiConnectionId: string
  aiConnectionModelRevisionId: string
  aiRunProfileConfigurationVersion: number
  aiRunProfileId: string
  connectionRevisionToken: string
  modelRevisionToken: string
  profileToken: string
}

export interface AiAdminLivePathSelection {
  adapterType: string
  adapterVersion: string
  aiConnectionId: string
  aiConnectionModelRevisionId: string
  aiRunProfileConfigurationVersion: number
  aiRunProfileId: string
  connectionRevisionToken: string
  expectedEnvironmentId: string
  modelRevisionToken: string
  profileKey: AiRunProfileKey
  profileToken: string
}

export interface AiAdminCatalogItem {
  capabilities: AiCapability
  capabilitySupport?: AiAdminCapabilitySupportMap
  externalModelId: string
  externalModelVersion: string | null
  inputPricePerMillionTokens: AiAdminCatalogPrice | null
  modelProviderName: string | null
  name: string
  outputPricePerMillionTokens: AiAdminCatalogPrice | null
}

export type AiAdminCapabilitySupport = 'supported' | 'unsupported' | 'unknown'

export type AiAdminCapabilitySupportMap = Readonly<
  Record<keyof AiCapability, AiAdminCapabilitySupport>
>

export interface AiAdminCatalogPrice {
  amount: string
  currency: string
}

export type AiAdminAdapterAvailability =
  | { available: true }
  | { available: false; reason: 'adapter_not_registered' }

export interface AiAdminExternalOperations {
  adapterAvailability(
    connection: Readonly<
      Pick<AiAdminStoredConnectionDetail, 'adapterKey' | 'adapterVersion'>
    >,
  ): AiAdminAdapterAvailability
  authorizeConnectionTarget(
    connection: Readonly<AiAdminConnectionDetail>,
  ): Promise<boolean>
  authorizeRunProfile(
    connection: Readonly<AiAdminConnectionDetail>,
    profileKey: AiRunProfileKey,
  ): Promise<
    | 'authorized'
    | 'data_policy_blocked'
    | 'data_policy_missing'
    | 'egress_policy_blocked'
  >
  fetchCatalog(
    connection: Readonly<AiAdminConnectionDetail>,
  ): Promise<readonly AiAdminCatalogItem[]>
  probeHealth(
    connection: Readonly<AiAdminConnectionDetail>,
    revision: Readonly<AiAdminModelRevisionRecord>,
  ): Promise<Readonly<AiAdminHealthProbeResult>>
  verifyLivePath(
    connection: Readonly<AiAdminConnectionDetail>,
    revision: Readonly<AiAdminModelRevisionRecord>,
    selection: Readonly<AiAdminLivePathSelection>,
  ): Promise<Readonly<AiAdminLivePathExternalResult>>
  verifyModelCandidate(
    connection: Readonly<AiAdminConnectionDetail>,
    candidate: Readonly<AiAdminModelVerificationCandidate>,
    options: Readonly<{
      onProgress?: (
        progress: Readonly<AiAdminVerificationProgress>,
      ) => Promise<void> | void
      signal: AbortSignal
    }>,
  ): Promise<Readonly<AiAdminCandidateVerificationResult>>
  verifySecretCandidate(
    connection: Readonly<AiAdminConnectionDetail>,
    context: Readonly<{ connectionId: string; secretVersionId: string }>,
    plaintext: string,
  ): Promise<void>
}

export interface AiAdminSecretOperations {
  activateCandidate(input: {
    connection: Readonly<AiAdminConnectionDetail>
    connectionConfigurationVersion: number
    connectionId: string
    connectionRevisionToken: string
    secretVersionId: string
  }): Promise<AiProviderSecretVersionMetadata>
  availabilities(
    connectionIds: readonly string[],
  ): Promise<ReadonlyMap<string, AiProviderSecretAvailability>>
  availability(connectionId: string): Promise<AiProviderSecretAvailability>
  confirmRevocation(input: {
    connectionId: string
    secretVersionId: string
  }): Promise<AiProviderSecretVersionMetadata>
  deleteCandidate(input: {
    connectionId: string
    secretVersionId: string
  }): Promise<boolean>
  writeCandidate(input: {
    connectionId: string
    plaintext: string
  }): Promise<AiProviderSecretVersionMetadata>
}

export interface AiAdminActivationSnapshot {
  attestationRevisionToken: string | null
  connection: AiAdminStoredConnectionDetail
  connectionEvidenceId: string | null
  modelRevision: AiAdminModelRevisionRecord | null
  profile: AiAdminRunProfileRecord
  secretVersionId: string | null
}

export interface AiAdminStore {
  activateConnection(input: {
    attestationId: string
    attestationRevisionToken: string
    connectionEvidenceId: string
    connectionId: string
    connectionRevisionToken: string
    modelRevisionId: string
    modelRevisionToken: string
    secretVersionId: string | null
  }): Promise<AiAdminConnectionSummary | null>
  createConnection(
    input: CreateAiConnection,
  ): Promise<AiAdminStoredConnectionDetail>
  deleteModelRevision(input: {
    connectionId: string
    modelRevisionId: string
    revisionToken: string
  }): Promise<boolean>
  discardAttestationDraft(input: {
    connectionId: string
    currentAttestationRevisionToken: string
    draftAttestationId: string
    draftAttestationRevisionToken: string
  }): Promise<boolean>
  endModelRevision(input: {
    connectionId: string
    modelRevisionId: string
    revisionToken: string
  }): Promise<AiAdminModelRevisionRecord | null>
  getConnection(
    connectionId: string,
  ): Promise<AiAdminStoredConnectionDetail | null>
  getModelRevisionConnection(
    modelRevisionId: string,
  ): Promise<AiAdminStoredConnectionDetail | null>
  getRunProfileSnapshot(
    profileKey: AiRunProfileKey,
  ): Promise<AiAdminActivationSnapshot | null>
  listConnections(): Promise<readonly AiAdminConnectionSummary[]>
  listRunProfiles(): Promise<readonly AiAdminRunProfileRecord[]>
  recordHealth(input: {
    connectionConfigurationVersion: number
    connectionId: string
    connectionRevisionToken: string
    health: 'degraded' | 'healthy' | 'unavailable'
    invalidationScope: 'connection' | 'model' | 'none'
    modelRevisionId: string
    modelRevisionToken: string
  }): Promise<AiAdminStoredConnectionDetail>
  saveAttestation(input: {
    attestation: SaveAiAttestation
    connectionId: string
    currentAttestationRevisionToken: string | null
    makeValid: boolean
  }): Promise<AiAdminAttestationRecord>
  saveModelRevision(input: {
    connection: AiAdminStoredConnectionDetail
    connectionId: string
    modelRevision: SaveAiModelRevision
    verification: Readonly<AiAdminCandidateVerificationResult>
  }): Promise<AiAdminModelRecord>
  saveRunProfile(input: {
    profileKey: AiRunProfileKey
    profile: SaveAiRunProfile
  }): Promise<AiAdminRunProfileRecord>
  setConnectionLifecycle(input: {
    connectionId: string
    revisionToken: string
    status: 'retired' | 'suspended'
  }): Promise<AiAdminConnectionSummary | null>
  setRunProfileOperationalStatus(input: {
    profileKey: AiRunProfileKey
    revisionToken: string
    status: 'enabled' | 'suspended'
  }): Promise<AiAdminRunProfileRecord | null>
  updateConnection(input: {
    connection: CreateAiConnection
    connectionId: string
    revisionToken: string
  }): Promise<AiAdminStoredConnectionDetail | null>
}

export interface AiAdminAuditDetail {
  changedFields?: readonly string[]
  operation:
    | 'activate'
    | 'create'
    | 'delete'
    | 'discard'
    | 'probe'
    | 'retire'
    | 'rotate'
    | 'save'
    | 'suspend'
    | 'update'
    | 'verify'
  resourceId: string
  resourceType:
    | 'ai_connection'
    | 'ai_connection_attestation'
    | 'ai_connection_model'
    | 'ai_connection_model_revision'
    | 'ai_provider_secret'
    | 'ai_run_profile'
}

export type AiAdminAudit = (
  detail: Readonly<AiAdminAuditDetail>,
  executor?: SqlServerEntityManager,
) => Promise<void>

function completeAttestation(attestation: SaveAiAttestation): boolean {
  return (
    attestation.responsibleOrganizationUnitReference !== null &&
    attestation.purpose !== null &&
    attestation.maximumInformationClass !== null &&
    attestation.isPersonalDataProcessed !== null &&
    attestation.providerName !== null &&
    attestation.subprocessors !== null &&
    attestation.processingRegions !== null &&
    attestation.processingRegions.length > 0 &&
    attestation.isTrainingAllowed !== null &&
    attestation.maximumRetentionDays !== null &&
    attestation.incidentResponseReference !== null &&
    attestation.decisionReference !== null &&
    attestation.reviewedAt !== null
  )
}

function currentAttestation(attestation: SaveAiAttestation): boolean {
  if (!attestation.reviewedAt) return false
  const now = Date.now()
  const reviewedAt = Date.parse(attestation.reviewedAt)
  const reviewDueAt = attestation.reviewDueAt
    ? Date.parse(attestation.reviewDueAt)
    : null
  return (
    Number.isFinite(reviewedAt) &&
    reviewedAt <= now &&
    (reviewDueAt === null ||
      (Number.isFinite(reviewDueAt) && reviewDueAt > now))
  )
}

function connectionBlockers(
  connection: AiAdminStoredConnectionDetail,
): AiAdminBlocker[] {
  return [...connection.blockers]
}

function profileActivationBlockers(
  snapshot: AiAdminActivationSnapshot,
): AiAdminBlocker[] {
  return [
    ...connectionBlockers(snapshot.connection),
    ...(snapshot.connection.lifecycleStatus === 'active'
      ? []
      : [{ code: 'connection_inactive' as const }]),
    ...(snapshot.modelRevision?.status === 'verified'
      ? []
      : [{ code: 'model_revision_unverified' as const }]),
    ...snapshot.profile.blockers,
  ]
}

function activationConflict(): never {
  throw conflictError(
    'AI administration state changed. Reload and try again.',
    {
      blocker: 'optimistic_concurrency_conflict',
    },
  )
}

function assertNoBlockers(blockers: readonly AiAdminBlocker[]): void {
  if (blockers.length > 0) {
    throw validationError('AI configuration cannot be activated.', {
      blockers,
    })
  }
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function livePathActivationFence(snapshot: AiAdminActivationSnapshot): string {
  const connection = snapshot.connection
  const modelRevision = snapshot.modelRevision
  return fingerprint({
    attestationRevisionToken: snapshot.attestationRevisionToken,
    connection: {
      activeSecretVersionId: connection.activeSecret.available
        ? connection.activeSecret.secretVersionId
        : null,
      adapterKey: connection.adapterKey,
      adapterVersion: connection.adapterVersion,
      agentRuntimeKey: connection.agentRuntimeKey,
      agentRuntimeVersion: connection.agentRuntimeVersion,
      authenticationType: connection.authenticationType,
      blockers: connection.blockers,
      configurationVersion: connection.configurationVersion,
      dataPolicySummary: connection.dataPolicySummary,
      egressPolicyKey: connection.egressPolicyKey,
      endpointUrl: connection.endpointUrl,
      id: connection.id,
      lifecycleStatus: connection.lifecycleStatus,
      maximumConcurrency: connection.maximumConcurrency,
      revisionToken: connection.revisionToken,
      tlsPolicyKey: connection.tlsPolicyKey,
    },
    connectionEvidenceId: snapshot.connectionEvidenceId,
    modelRevision,
    profile: snapshot.profile,
    secretVersionId: snapshot.secretVersionId,
  })
}

function isCurrentLivePathActivation(
  expected: AiAdminActivationSnapshot,
  current: AiAdminActivationSnapshot,
): boolean {
  return (
    current.connection.lifecycleStatus === 'active' &&
    current.modelRevision?.status === 'verified' &&
    current.profile.operationalStatus === 'enabled' &&
    current.profile.configurationStatus === 'configured' &&
    current.profile.blockers.length === 0 &&
    profileActivationBlockers(current).length === 0 &&
    livePathActivationFence(current) === livePathActivationFence(expected)
  )
}

const aiModelVerificationAttempts =
  createAiModelVerificationAttemptStore<AiAdminCandidateVerificationResult>()

export class AiConnectionAdministrationService {
  readonly #actorKey: string
  readonly #audit: AiAdminAudit
  readonly #external: AiAdminExternalOperations
  readonly #secrets: AiAdminSecretOperations
  readonly #store: AiAdminStore
  readonly #verificationAttempts: AiModelVerificationAttemptStore<AiAdminCandidateVerificationResult>

  constructor(input: {
    actorKey: string
    audit: AiAdminAudit
    external: AiAdminExternalOperations
    secrets: AiAdminSecretOperations
    store: AiAdminStore
    verificationAttempts?: AiModelVerificationAttemptStore<AiAdminCandidateVerificationResult>
  }) {
    this.#actorKey = input.actorKey
    this.#audit = input.audit
    this.#external = input.external
    this.#secrets = input.secrets
    this.#store = input.store
    this.#verificationAttempts =
      input.verificationAttempts ?? aiModelVerificationAttempts
  }

  async #withSecretAvailability(
    connection: AiAdminStoredConnectionDetail,
    resolvedAvailability?: AiProviderSecretAvailability,
  ): Promise<AiAdminConnectionDetail> {
    const activeSecret =
      connection.authenticationType === 'none'
        ? connection.activeSecret
        : (resolvedAvailability ??
          (await this.#secrets.availability(connection.id)))
    const secretMissing =
      connection.authenticationType !== 'none' && !activeSecret.available
    const blockers = connection.blockers.filter(
      blocker => blocker.code !== 'active_secret_missing' || secretMissing,
    )
    if (
      secretMissing &&
      !blockers.some(blocker => blocker.code === 'active_secret_missing')
    ) {
      const verificationIndex = blockers.findIndex(
        blocker =>
          blocker.code === 'connection_verification_missing' ||
          blocker.code === 'model_revision_unverified',
      )
      blockers.splice(
        verificationIndex === -1 ? blockers.length : verificationIndex,
        0,
        { code: 'active_secret_missing' },
      )
    }
    return {
      ...connection,
      activeSecret,
      adapterAvailability: this.#external.adapterAvailability(connection),
      blockers,
    }
  }

  async #assertAuthorizedTarget(
    connection: AiAdminConnectionDetail,
  ): Promise<void> {
    if (!(await this.#external.authorizeConnectionTarget(connection))) {
      throw validationError('The AI connection target is not authorized.', {
        blockers: [{ code: 'egress_policy_blocked' }],
      })
    }
  }

  async #assertAuthorizedProfile(
    connection: AiAdminConnectionDetail,
    profileKey: AiRunProfileKey,
  ): Promise<void> {
    const result = await this.#external.authorizeRunProfile(
      connection,
      profileKey,
    )
    if (result !== 'authorized') {
      throw validationError(
        'The AI run profile trust policy is not satisfied.',
        {
          blockers: [{ code: result }],
        },
      )
    }
  }

  listConnections(): Promise<readonly AiAdminConnectionSummary[]> {
    return this.#store.listConnections()
  }

  async listRunProfiles(): Promise<readonly AiAdminRunProfileRecord[]> {
    return this.#store.listRunProfiles()
  }

  async getConnection(connectionId: string): Promise<AiAdminConnectionDetail> {
    const connection = await this.#store.getConnection(connectionId)
    if (!connection) throw notFoundError('AI connection not found.')
    return this.#withSecretAvailability(connection)
  }

  async createConnection(
    input: CreateAiConnection,
  ): Promise<AiAdminConnectionDetail> {
    return this.#withSecretAvailability(
      await this.#store.createConnection(input),
    )
  }

  async updateConnection(input: {
    connection: CreateAiConnection
    connectionId: string
    revisionToken: string
  }): Promise<AiAdminConnectionDetail> {
    const stored = await this.#store.updateConnection(input)
    if (!stored) activationConflict()
    return this.#withSecretAvailability(stored)
  }

  async saveAttestation(input: {
    attestation: SaveAiAttestation
    connectionId: string
    currentAttestationRevisionToken?: string | null
    makeValid: boolean
  }): Promise<AiAdminAttestationRecord> {
    if (input.makeValid && !completeAttestation(input.attestation)) {
      throw validationError('The AI connection attestation is incomplete.', {
        blockers: [{ code: 'attestation_incomplete' }],
      })
    }
    if (input.makeValid && !currentAttestation(input.attestation)) {
      throw validationError('The AI connection attestation is not current.', {
        blockers: [{ code: 'attestation_invalid' }],
      })
    }
    if (input.makeValid && !input.attestation.revisionToken) {
      throw validationError('Save the AI connection attestation draft first.', {
        blockers: [{ code: 'attestation_incomplete' }],
      })
    }
    return this.#store.saveAttestation({
      ...input,
      currentAttestationRevisionToken:
        input.currentAttestationRevisionToken ?? null,
    })
  }

  async discardAttestationDraft(input: {
    connectionId: string
    currentAttestationRevisionToken: string
    draftAttestationId: string
    draftAttestationRevisionToken: string
  }): Promise<void> {
    if (!(await this.#store.discardAttestationDraft(input))) {
      activationConflict()
    }
  }

  async writeSecret(
    connectionId: string,
    plaintext: string,
  ): Promise<AiProviderSecretVersionMetadata> {
    return this.#secrets.writeCandidate({
      connectionId,
      plaintext,
    })
  }

  async activateSecret(input: {
    connectionConfigurationVersion: number
    connectionId: string
    connectionRevisionToken: string
    secretVersionId: string
  }): Promise<AiProviderSecretVersionMetadata> {
    const connection = await this.getConnection(input.connectionId)
    if (
      connection.configurationVersion !==
        input.connectionConfigurationVersion ||
      connection.revisionToken !== input.connectionRevisionToken
    ) {
      activationConflict()
    }
    await this.#assertAuthorizedTarget(connection)
    return this.#secrets.activateCandidate({
      connection,
      ...input,
    })
  }

  async confirmSecretRevocation(
    connectionId: string,
    secretVersionId: string,
  ): Promise<AiProviderSecretVersionMetadata> {
    return this.#secrets.confirmRevocation({
      connectionId,
      secretVersionId,
    })
  }

  async deleteSecretCandidate(
    connectionId: string,
    secretVersionId: string,
  ): Promise<void> {
    if (
      !(await this.#secrets.deleteCandidate({
        connectionId,
        secretVersionId,
      }))
    ) {
      throw notFoundError('AI provider-secret candidate not found.')
    }
  }

  async fetchCatalog(
    connectionId: string,
  ): Promise<readonly AiAdminCatalogItem[]> {
    const connection = await this.getConnection(connectionId)
    await this.#assertAuthorizedTarget(connection)
    const catalog = await this.#external.fetchCatalog(connection)
    await this.#audit({
      operation: 'probe',
      resourceId: connectionId,
      resourceType: 'ai_connection',
    })
    return catalog
  }

  async verifyModelCandidate(input: {
    candidate: AiAdminModelVerificationCandidate
    connectionId: string
    onProgress?: (
      progress: Readonly<AiAdminVerificationProgress>,
    ) => Promise<void> | void
    signal: AbortSignal
  }): Promise<AiAdminCandidateVerificationAttemptResult> {
    const connection = await this.getConnection(input.connectionId)
    await this.#assertAuthorizedTarget(connection)
    const result = await this.#external.verifyModelCandidate(
      connection,
      input.candidate,
      { onProgress: input.onProgress, signal: input.signal },
    )
    input.signal.throwIfAborted()
    const verificationFingerprint = fingerprint({
      connection: {
        adapterKey: connection.adapterKey,
        adapterVersion: connection.adapterVersion,
        agentRuntimeKey: connection.agentRuntimeKey,
        agentRuntimeVersion: connection.agentRuntimeVersion,
        authenticationType: connection.authenticationType,
        configurationVersion: connection.configurationVersion,
        egressPolicyKey: connection.egressPolicyKey,
        endpointUrl: connection.endpointUrl,
        tlsPolicyKey: connection.tlsPolicyKey,
      },
      model: input.candidate,
      testSuiteVersion: result.testSuiteVersion,
    })
    const attempt = result.saveable
      ? this.#verificationAttempts.create({
          actorKey: this.#actorKey,
          connectionId: connection.id,
          fingerprint: verificationFingerprint,
          result,
        })
      : null
    await this.#audit({
      operation: 'verify',
      resourceId: connection.id,
      resourceType: 'ai_connection',
    })
    return {
      ...result,
      attemptExpiresAt: attempt?.expiresAt ?? null,
      attemptId: attempt?.id ?? null,
    }
  }

  discardModelVerification(attemptId: string): void {
    this.#verificationAttempts.discard({
      actorKey: this.#actorKey,
      attemptId,
    })
  }

  async probeHealth(input: {
    connectionId: string
    modelRevisionId: string
    revisionToken: string
  }): Promise<AiAdminConnectionDetail> {
    const connection = await this.getConnection(input.connectionId)
    const modelRevision = connection.models
      .flatMap(model => model.revisions)
      .find(revision => revision.id === input.modelRevisionId)
    if (!modelRevision)
      throw notFoundError('AI connection model revision not found.')
    if (modelRevision.revisionToken !== input.revisionToken)
      activationConflict()
    await this.#assertAuthorizedTarget(connection)
    const result = await this.#external.probeHealth(connection, modelRevision)
    return this.#withSecretAvailability(
      await this.#store.recordHealth({
        connectionConfigurationVersion: connection.configurationVersion,
        connectionId: input.connectionId,
        connectionRevisionToken: connection.revisionToken,
        health: result.health,
        invalidationScope: result.invalidationScope,
        modelRevisionId: input.modelRevisionId,
        modelRevisionToken: input.revisionToken,
      }),
    )
  }

  async saveModelRevision(input: {
    connectionId: string
    modelRevision: SaveAiModelRevision
  }): Promise<AiAdminModelRecord> {
    if (!input.modelRevision.attemptId) {
      throw validationError('Verify the AI model before saving it.')
    }
    const connection = await this.getConnection(input.connectionId)
    const verificationFingerprint = fingerprint({
      connection: {
        adapterKey: connection.adapterKey,
        adapterVersion: connection.adapterVersion,
        agentRuntimeKey: connection.agentRuntimeKey,
        agentRuntimeVersion: connection.agentRuntimeVersion,
        authenticationType: connection.authenticationType,
        configurationVersion: connection.configurationVersion,
        egressPolicyKey: connection.egressPolicyKey,
        endpointUrl: connection.endpointUrl,
        tlsPolicyKey: connection.tlsPolicyKey,
      },
      model: {
        externalModelId: input.modelRevision.externalModelId,
        externalModelVersion: input.modelRevision.externalModelVersion,
      },
      testSuiteVersion: AI_ADMIN_FUNCTIONAL_PROBE_VERSION,
    })
    let lease: AiModelVerificationAttemptLease<AiAdminCandidateVerificationResult>
    try {
      lease = this.#verificationAttempts.reserve({
        actorKey: this.#actorKey,
        attemptId: input.modelRevision.attemptId,
        connectionId: connection.id,
        fingerprint: verificationFingerprint,
      })
    } catch (error) {
      if (error instanceof AiModelVerificationAttemptError) {
        throw conflictError(
          error.code === 'attempt_expired'
            ? 'The model verification attempt expired. Verify again.'
            : 'The connection or model configuration changed. Verify again.',
          { blocker: error.code },
        )
      }
      throw error
    }
    try {
      const verification = lease.attempt.result
      if (!verification.saveable) {
        throw validationError('The AI model verification is not saveable.')
      }
      const saved = await this.#store.saveModelRevision({
        connection,
        connectionId: input.connectionId,
        modelRevision: input.modelRevision,
        verification,
      })
      lease.commit()
      return saved
    } catch (error) {
      lease.release()
      throw error
    }
  }

  async verifyLivePath(input: {
    connectionId: string
    expectedEnvironmentId: string
    modelRevisionId: string
    profileKey: AiRunProfileKey
  }): Promise<AiAdminLivePathVerificationResult> {
    assertAiStagingLiveVerificationAllowed(input.expectedEnvironmentId)
    const connection = await this.getConnection(input.connectionId)
    const modelRevision = connection.models
      .flatMap(model => model.revisions)
      .find(revision => revision.id === input.modelRevisionId)
    const snapshot = await this.#store.getRunProfileSnapshot(input.profileKey)
    if (!modelRevision || !snapshot) {
      throw notFoundError('The exact active AI path was not found.')
    }
    const exactSnapshot = {
      ...snapshot,
      connection,
      modelRevision,
      profile: snapshot.profile,
    }
    if (
      connection.lifecycleStatus !== 'active' ||
      modelRevision.status !== 'verified' ||
      snapshot.profile.operationalStatus !== 'enabled' ||
      snapshot.profile.configurationStatus !== 'configured' ||
      snapshot.connection.id !== connection.id ||
      snapshot.modelRevision?.id !== modelRevision.id ||
      snapshot.profile.modelRevisionId !== input.modelRevisionId
    ) {
      throw validationError('The exact AI path is not active and verified.')
    }
    assertNoBlockers(profileActivationBlockers(exactSnapshot))
    await this.#assertAuthorizedProfile(connection, snapshot.profile.profileKey)
    const selection = Object.freeze({
      adapterType: connection.adapterKey,
      adapterVersion: connection.adapterVersion,
      aiConnectionId: connection.id,
      aiConnectionModelRevisionId: modelRevision.id,
      aiRunProfileConfigurationVersion: snapshot.profile.configurationVersion,
      aiRunProfileId: snapshot.profile.id,
      connectionRevisionToken: connection.revisionToken,
      expectedEnvironmentId: input.expectedEnvironmentId,
      modelRevisionToken: modelRevision.revisionToken,
      profileKey: snapshot.profile.profileKey,
      profileToken: snapshot.profile.revisionToken,
    })
    assertAiStagingLiveVerificationAllowed(input.expectedEnvironmentId)
    const result = await this.#external.verifyLivePath(
      connection,
      modelRevision,
      selection,
    )
    assertAiStagingLiveVerificationAllowed(input.expectedEnvironmentId)
    const referenced = await this.#store.getRunProfileSnapshot(
      snapshot.profile.profileKey,
    )
    if (
      !referenced ||
      !isCurrentLivePathActivation(exactSnapshot, referenced)
    ) {
      throw validationError('The exact AI path changed during verification.')
    }
    await this.#audit({
      operation: 'verify',
      resourceId: snapshot.profile.id,
      resourceType: 'ai_run_profile',
    })
    return {
      ...result,
      aiConnectionId: selection.aiConnectionId,
      aiConnectionModelRevisionId: selection.aiConnectionModelRevisionId,
      aiRunProfileConfigurationVersion:
        selection.aiRunProfileConfigurationVersion,
      aiRunProfileId: selection.aiRunProfileId,
      connectionRevisionToken: selection.connectionRevisionToken,
      modelRevisionToken: selection.modelRevisionToken,
      profileToken: selection.profileToken,
    }
  }

  async endModelRevision(input: {
    connectionId: string
    modelRevisionId: string
    revisionToken: string
  }): Promise<AiAdminModelRevisionRecord> {
    const result = await this.#store.endModelRevision(input)
    if (!result) activationConflict()
    return result
  }

  async deleteModelRevision(input: {
    connectionId: string
    modelRevisionId: string
    revisionToken: string
  }): Promise<void> {
    const deleted = await this.#store.deleteModelRevision(input)
    if (!deleted) activationConflict()
  }

  async setConnectionLifecycle(input: {
    connectionId: string
    revisionToken: string
    status: 'active' | 'retired' | 'suspended'
  }): Promise<AiAdminConnectionSummary> {
    if (input.status !== 'active') {
      const updated = await this.#store.setConnectionLifecycle({
        ...input,
        status: input.status,
      })
      if (!updated) activationConflict()
      return updated
    }
    const connection = await this.getConnection(input.connectionId)
    assertNoBlockers(connectionBlockers(connection))
    const modelRevision = connection.models
      .flatMap(model => model.revisions)
      .find(revision => revision.status === 'verified')
    if (!modelRevision) {
      throw validationError('A verified AI connection model is required.', {
        blockers: [{ code: 'model_revision_unverified' }],
      })
    }
    const connectionEvidenceId = connection.connectionEvidenceId
    if (!connectionEvidenceId) {
      throw validationError('The AI connection must be verified first.', {
        blockers: [{ code: 'connection_verification_missing' }],
      })
    }
    const attestation = connection.attestation
    if (attestation?.status !== 'valid') {
      throw validationError('A valid AI connection attestation is required.', {
        blockers: [{ code: 'attestation_invalid' }],
      })
    }
    await this.#assertAuthorizedTarget(connection)
    const updated = await this.#store.activateConnection({
      attestationId: attestation.id,
      attestationRevisionToken: attestation.revisionToken,
      connectionEvidenceId,
      connectionId: input.connectionId,
      connectionRevisionToken: input.revisionToken,
      modelRevisionId: modelRevision.id,
      modelRevisionToken: modelRevision.revisionToken,
      secretVersionId: connection.activeSecret.available
        ? connection.activeSecret.secretVersionId
        : null,
    })
    if (!updated) activationConflict()
    return updated
  }

  async saveRunProfile(input: {
    profileKey: AiRunProfileKey
    profile: SaveAiRunProfile
  }): Promise<AiAdminRunProfileRecord> {
    if (input.profile.modelRevisionId) {
      const connection = await this.#store.getModelRevisionConnection(
        input.profile.modelRevisionId,
      )
      if (!connection) {
        throw validationError(
          'AI connection model revision is no longer available.',
          { blockers: [{ code: 'model_revision_unverified' }] },
        )
      }
      await this.#assertAuthorizedProfile(
        await this.#withSecretAvailability(connection),
        input.profileKey,
      )
    }
    return this.#store.saveRunProfile(input)
  }

  async setRunProfileOperationalStatus(input: {
    profileKey: AiRunProfileKey
    revisionToken: string
    status: 'enabled' | 'suspended'
  }): Promise<AiAdminRunProfileRecord> {
    if (input.status === 'suspended') {
      const profile = (await this.#store.listRunProfiles()).find(
        candidate => candidate.profileKey === input.profileKey,
      )
      if (!profile) activationConflict()
      if (profile.modelRevisionId === null) {
        throw validationError(
          'An unconfigured AI run profile cannot be paused.',
          {
            blockers: [{ code: 'model_revision_missing' }],
          },
        )
      }
    }
    const result = await this.#store.setRunProfileOperationalStatus(input)
    if (!result) activationConflict()
    return result
  }
}

export const __testing = {
  completeAttestation,
  currentAttestation,
  profileActivationBlockers,
}

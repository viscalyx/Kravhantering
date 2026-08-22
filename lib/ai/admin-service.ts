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
  AiCapabilityPolicy,
  CreateAiConnection,
  SaveAiAttestation,
  SaveAiModelRevision,
  SaveAiRunProfileRevision,
} from './admin-contracts'
import type { AiRunProfileKey } from './profile-resolver'
import type {
  AiProviderSecretAvailability,
  AiProviderSecretVersionMetadata,
} from './provider-secret-service'
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
  revisionNumber: number
  revisionToken: string
  status: 'draft' | 'retired' | 'verification_required' | 'verified'
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
  activeRevisionId: string | null
  blockers: readonly AiAdminBlocker[]
  draftRevision: AiAdminRunProfileRevisionRecord | null
  id: string
  operationalStatus: 'enabled' | 'suspended'
  profileKey: AiRunProfileKey
  revisionToken: string
}

export interface AiAdminRunProfileRevisionRecord
  extends SaveAiRunProfileRevision {
  id: string
  revisionNumber: number
  revisionToken: string
  status: 'active' | 'draft' | 'superseded'
}

export interface AiAdminConnectionVerificationResult {
  details: Readonly<Record<string, boolean | number | string>>
  failureCategory: string | null
  outcome: 'failed' | 'passed'
  testSuiteVersion: string
}

export interface AiAdminHealthProbeResult {
  failureCategory: string | null
  health: 'degraded' | 'healthy' | 'unavailable'
  invalidationScope: 'connection' | 'model' | 'none'
}

export interface AiAdminModelVerificationResult {
  details: Readonly<Record<string, boolean | number | string>>
  failureCategory: string | null
  outcome: 'failed' | 'passed'
  testSuiteVersion: string
  verifiedCapabilities: AiCapability
}

export type AiAdminModelVerificationCheck =
  | 'adapterConformance'
  | 'cancellationHandled'
  | 'completed'
  | 'schemaValid'

export interface AiAdminModelVerificationActionResult {
  revision: AiAdminModelRevisionRecord
  verification: {
    failedCapabilities: readonly (keyof AiCapability)[]
    failedChecks: readonly AiAdminModelVerificationCheck[]
    failureCategory: string | null
    outcome: 'failed' | 'passed'
    testSuiteVersion: string
    unevaluatedCapabilities: readonly (keyof AiCapability)[]
  }
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
  aiRunProfileRevisionId: string
  connectionRevisionToken: string
  modelRevisionToken: string
  profileRevisionToken: string
}

export interface AiAdminLivePathSelection {
  adapterType: string
  adapterVersion: string
  aiConnectionId: string
  aiConnectionModelRevisionId: string
  aiRunProfileRevisionId: string
  connectionRevisionToken: string
  expectedEnvironmentId: string
  modelRevisionToken: string
  profileKey: AiRunProfileKey
  profileRevisionToken: string
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

export interface AiAdminCapabilityDiscoveryResult {
  assessments: Readonly<
    Record<
      keyof AiCapability,
      Readonly<{
        failureCategory: string | null
        support: AiAdminCapabilitySupport
      }>
    >
  >
  capabilities: AiCapability
}

export interface AiAdminCapabilityDiscoveryTarget {
  capabilities: readonly (keyof AiCapability)[]
  externalModelId: string
  externalModelVersion: string | null
}

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
  discoverModelCapabilities(
    connection: Readonly<AiAdminConnectionDetail>,
    target: Readonly<AiAdminCapabilityDiscoveryTarget>,
  ): Promise<Readonly<AiAdminCapabilityDiscoveryResult>>
  fetchCatalog(
    connection: Readonly<AiAdminConnectionDetail>,
  ): Promise<readonly AiAdminCatalogItem[]>
  probeConnection(
    connection: Readonly<AiAdminConnectionDetail>,
  ): Promise<Readonly<AiAdminConnectionVerificationResult>>
  probeHealth(
    connection: Readonly<AiAdminConnectionDetail>,
    revision: Readonly<AiAdminModelRevisionRecord>,
  ): Promise<Readonly<AiAdminHealthProbeResult>>
  verifyLivePath(
    connection: Readonly<AiAdminConnectionDetail>,
    revision: Readonly<AiAdminModelRevisionRecord>,
    selection: Readonly<AiAdminLivePathSelection>,
  ): Promise<Readonly<AiAdminLivePathExternalResult>>
  verifyModelRevision(
    connection: Readonly<AiAdminConnectionDetail>,
    revision: Readonly<AiAdminModelRevisionRecord>,
  ): Promise<Readonly<AiAdminModelVerificationResult>>
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
  profileRevision: AiAdminRunProfileRevisionRecord
  secretVersionId: string | null
}

export interface AiAdminProfileActivationEntry {
  profile: AiAdminRunProfileRecord
  snapshot: AiAdminActivationSnapshot | null
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
  activateRunProfileRevision(input: {
    attestationRevisionToken: string
    connectionEvidenceId: string
    connectionRevisionToken: string
    modelRevisionToken: string
    profileRevisionId: string
    profileRevisionToken: string
    profileToken: string
    secretVersionId: string | null
  }): Promise<AiAdminRunProfileRecord | null>
  createConnection(
    input: CreateAiConnection,
  ): Promise<AiAdminStoredConnectionDetail>
  discardAttestationDraft(input: {
    connectionId: string
    currentAttestationRevisionToken: string
    draftAttestationId: string
    draftAttestationRevisionToken: string
  }): Promise<boolean>
  getActivationSnapshot(input: {
    profileKey: AiRunProfileKey
    profileRevisionId: string
  }): Promise<AiAdminActivationSnapshot | null>
  getConnection(
    connectionId: string,
  ): Promise<AiAdminStoredConnectionDetail | null>
  listConnections(): Promise<readonly AiAdminConnectionSummary[]>
  listRunProfileActivationEntries(): Promise<
    readonly AiAdminProfileActivationEntry[]
  >
  listRunProfileRevisions(
    profileKey: AiRunProfileKey,
  ): Promise<readonly AiAdminRunProfileRevisionRecord[]>
  listRunProfiles(): Promise<readonly AiAdminRunProfileRecord[]>
  recordConnectionVerification(input: {
    connection: AiAdminStoredConnectionDetail
    result: Readonly<AiAdminConnectionVerificationResult>
  }): Promise<AiAdminStoredConnectionDetail>
  recordHealth(input: {
    connectionConfigurationVersion: number
    connectionId: string
    connectionRevisionToken: string
    health: 'degraded' | 'healthy' | 'unavailable'
    invalidationScope: 'connection' | 'model' | 'none'
    modelRevisionId: string
    modelRevisionToken: string
  }): Promise<AiAdminStoredConnectionDetail>
  recordModelVerification(input: {
    connection: AiAdminStoredConnectionDetail
    connectionEvidenceId: string
    modelRevision: AiAdminModelRevisionRecord
    result: Readonly<AiAdminModelVerificationResult>
  }): Promise<AiAdminModelRevisionRecord>
  retireModelRevision(input: {
    connectionId: string
    modelRevisionId: string
    revisionToken: string
  }): Promise<AiAdminModelRevisionRecord | null>
  saveAttestation(input: {
    attestation: SaveAiAttestation
    connectionId: string
    currentAttestationRevisionToken: string | null
    makeValid: boolean
  }): Promise<AiAdminAttestationRecord>
  saveModelRevision(input: {
    connectionId: string
    modelRevision: SaveAiModelRevision
  }): Promise<AiAdminModelRecord>
  saveRunProfileRevision(input: {
    profileKey: AiRunProfileKey
    revision: SaveAiRunProfileRevision
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
    | 'ai_run_profile_revision'
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

function capabilityPolicyBlockers(
  profileKey: AiRunProfileKey,
  policy: AiCapabilityPolicy,
  verified: AiCapability | null,
): AiAdminBlocker[] {
  const blockers: AiAdminBlocker[] = []
  const requireMode = (
    field: keyof AiCapabilityPolicy,
    mode: 'disabled' | 'required',
  ): void => {
    if (policy[field] !== mode) {
      blockers.push({ code: 'capability_policy_invalid', field })
    }
  }
  requireMode('validatableJson', 'required')
  if (profileKey === 'invalid_json_repair') {
    requireMode('streaming', 'disabled')
    requireMode('imageInput', 'disabled')
    requireMode('aiAnalysis', 'disabled')
  } else {
    requireMode('streaming', 'required')
    requireMode(
      'imageInput',
      profileKey === 'generation_with_images' ? 'required' : 'disabled',
    )
  }
  if (!verified) {
    blockers.push({ code: 'model_revision_unverified' })
    return blockers
  }
  const supported = (field: keyof AiCapabilityPolicy): boolean => {
    if (field === 'jsonSchema') return verified.jsonSchemaSteering
    if (field === 'usageMetadata') return verified.cost || verified.tokenUsage
    return verified[field]
  }
  for (const [field, mode] of Object.entries(policy) as Array<
    [keyof AiCapabilityPolicy, AiCapabilityPolicy[keyof AiCapabilityPolicy]]
  >) {
    if (mode === 'required' && !supported(field)) {
      blockers.push({ code: 'capability_policy_invalid', field })
    }
  }
  return blockers
}

function connectionBlockers(
  connection: AiAdminStoredConnectionDetail,
): AiAdminBlocker[] {
  return [...connection.blockers]
}

function profileActivationBlockers(
  profileKey: AiRunProfileKey,
  snapshot: AiAdminActivationSnapshot,
): AiAdminBlocker[] {
  return [
    ...connectionBlockers(snapshot.connection),
    ...(snapshot.connection.lifecycleStatus === 'active'
      ? []
      : [{ code: 'connection_inactive' as const }]),
    ...(snapshot.modelRevision
      ? capabilityPolicyBlockers(
          profileKey,
          snapshot.profileRevision.capabilityPolicy,
          snapshot.modelRevision.verifiedCapabilities,
        )
      : [{ code: 'model_revision_missing' as const }]),
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
    profile: {
      activeRevisionId: snapshot.profile.activeRevisionId,
      blockers: snapshot.profile.blockers,
      id: snapshot.profile.id,
      operationalStatus: snapshot.profile.operationalStatus,
      profileKey: snapshot.profile.profileKey,
      revisionToken: snapshot.profile.revisionToken,
    },
    profileRevision: snapshot.profileRevision,
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
    current.profile.activeRevisionId === current.profileRevision.id &&
    current.profile.blockers.length === 0 &&
    current.profileRevision.status === 'active' &&
    profileActivationBlockers(current.profile.profileKey, current).length ===
      0 &&
    livePathActivationFence(current) === livePathActivationFence(expected)
  )
}

export class AiConnectionAdministrationService {
  readonly #audit: AiAdminAudit
  readonly #external: AiAdminExternalOperations
  readonly #secrets: AiAdminSecretOperations
  readonly #store: AiAdminStore

  constructor(input: {
    audit: AiAdminAudit
    external: AiAdminExternalOperations
    secrets: AiAdminSecretOperations
    store: AiAdminStore
  }) {
    this.#audit = input.audit
    this.#external = input.external
    this.#secrets = input.secrets
    this.#store = input.store
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
    const entries = await this.#store.listRunProfileActivationEntries()
    const authenticatedConnectionIds = [
      ...new Set(
        entries.flatMap(({ snapshot }) =>
          snapshot && snapshot.connection.authenticationType !== 'none'
            ? [snapshot.connection.id.toLowerCase()]
            : [],
        ),
      ),
    ]
    const availabilities = await this.#secrets.availabilities(
      authenticatedConnectionIds,
    )
    return Promise.all(
      entries.map(async ({ profile, snapshot: storedSnapshot }) => {
        if (!storedSnapshot) {
          return {
            ...profile,
            blockers: [{ code: 'model_revision_missing' as const }],
          }
        }
        const snapshot = {
          ...storedSnapshot,
          connection: await this.#withSecretAvailability(
            storedSnapshot.connection,
            availabilities.get(storedSnapshot.connection.id.toLowerCase()),
          ),
        }
        return {
          ...profile,
          blockers: profileActivationBlockers(profile.profileKey, snapshot),
        }
      }),
    )
  }

  listRunProfileRevisions(
    profileKey: AiRunProfileKey,
  ): Promise<readonly AiAdminRunProfileRevisionRecord[]> {
    return this.#store.listRunProfileRevisions(profileKey)
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

  async verifyConnection(
    connectionId: string,
  ): Promise<AiAdminConnectionDetail> {
    const connection = await this.getConnection(connectionId)
    await this.#assertAuthorizedTarget(connection)
    const result = await this.#external.probeConnection(connection)
    return this.#withSecretAvailability(
      await this.#store.recordConnectionVerification({
        connection,
        result: {
          ...result,
          details: {
            ...result.details,
            configurationFingerprint: fingerprint({
              adapterKey: connection.adapterKey,
              adapterVersion: connection.adapterVersion,
              agentRuntimeVersion: connection.agentRuntimeVersion,
              authenticationType: connection.authenticationType,
              egressPolicyKey: connection.egressPolicyKey,
              endpointUrl: connection.endpointUrl,
              tlsPolicyKey: connection.tlsPolicyKey,
            }),
          },
        },
      }),
    )
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

  async discoverModelCapabilities(input: {
    capabilities: readonly (keyof AiCapability)[]
    connectionId: string
    externalModelId: string
    externalModelVersion: string | null
  }): Promise<AiAdminCapabilityDiscoveryResult> {
    const connection = await this.getConnection(input.connectionId)
    if (!connection.connectionEvidenceId) {
      throw validationError('The AI connection must be verified first.', {
        blockers: [{ code: 'connection_verification_missing' }],
      })
    }
    await this.#assertAuthorizedTarget(connection)
    const result = await this.#external.discoverModelCapabilities(connection, {
      capabilities: input.capabilities,
      externalModelId: input.externalModelId,
      externalModelVersion: input.externalModelVersion,
    })
    const current = await this.getConnection(input.connectionId)
    if (
      current.revisionToken !== connection.revisionToken ||
      current.configurationVersion !== connection.configurationVersion ||
      current.connectionEvidenceId !== connection.connectionEvidenceId
    ) {
      activationConflict()
    }
    await this.#audit({
      operation: 'probe',
      resourceId: input.connectionId,
      resourceType: 'ai_connection',
    })
    return result
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
    return this.#store.saveModelRevision(input)
  }

  async verifyModelRevision(input: {
    connectionId: string
    modelRevisionId: string
    revisionToken: string
  }): Promise<AiAdminModelVerificationActionResult> {
    const connection = await this.getConnection(input.connectionId)
    const modelRevision = connection.models
      .flatMap(model => model.revisions)
      .find(revision => revision.id === input.modelRevisionId)
    if (!modelRevision)
      throw notFoundError('AI connection model revision not found.')
    if (modelRevision.revisionToken !== input.revisionToken)
      activationConflict()
    const connectionEvidenceId = connection.connectionEvidenceId
    if (!connectionEvidenceId) {
      throw validationError('The AI connection must be verified first.', {
        blockers: [{ code: 'connection_verification_missing' }],
      })
    }
    await this.#assertAuthorizedTarget(connection)
    const result = await this.#external.verifyModelRevision(
      connection,
      modelRevision,
    )
    const revision = await this.#store.recordModelVerification({
      connection,
      connectionEvidenceId,
      modelRevision,
      result,
    })
    const capabilityKeys = Object.keys(
      modelRevision.declaredCapabilities,
    ) as (keyof AiCapability)[]
    const declaredCapabilityKeys = capabilityKeys.filter(
      capability => modelRevision.declaredCapabilities[capability],
    )
    const capabilitiesEvaluated =
      result.outcome === 'passed' || result.details.completed === true
    const verificationChecks = [
      'adapterConformance',
      'cancellationHandled',
      'completed',
      'schemaValid',
    ] as const satisfies readonly AiAdminModelVerificationCheck[]
    return {
      revision,
      verification: {
        failedCapabilities: capabilitiesEvaluated
          ? declaredCapabilityKeys.filter(
              capability => !result.verifiedCapabilities[capability],
            )
          : [],
        failedChecks: verificationChecks.filter(
          check => result.details[check] === false,
        ),
        failureCategory: result.failureCategory,
        outcome: result.outcome,
        testSuiteVersion: result.testSuiteVersion,
        unevaluatedCapabilities: capabilitiesEvaluated
          ? []
          : declaredCapabilityKeys,
      },
    }
  }

  async verifyLivePath(input: {
    connectionId: string
    expectedEnvironmentId: string
    modelRevisionId: string
    profileRevisionId: string
  }): Promise<AiAdminLivePathVerificationResult> {
    assertAiStagingLiveVerificationAllowed(input.expectedEnvironmentId)
    const connection = await this.getConnection(input.connectionId)
    const modelRevision = connection.models
      .flatMap(model => model.revisions)
      .find(revision => revision.id === input.modelRevisionId)
    const entry = (await this.#store.listRunProfileActivationEntries()).find(
      candidate =>
        candidate.profile.activeRevisionId === input.profileRevisionId,
    )
    const snapshot = entry?.snapshot
    if (!modelRevision || !entry || !snapshot) {
      throw notFoundError('The exact active AI path was not found.')
    }
    const exactSnapshot = {
      ...snapshot,
      connection,
      modelRevision,
      profile: entry.profile,
    }
    if (
      connection.lifecycleStatus !== 'active' ||
      modelRevision.status !== 'verified' ||
      entry.profile.operationalStatus !== 'enabled' ||
      snapshot.connection.id !== connection.id ||
      snapshot.modelRevision?.id !== modelRevision.id ||
      snapshot.profileRevision.id !== input.profileRevisionId ||
      snapshot.profileRevision.status !== 'active'
    ) {
      throw validationError('The exact AI path is not active and verified.')
    }
    assertNoBlockers(
      profileActivationBlockers(entry.profile.profileKey, exactSnapshot),
    )
    await this.#assertAuthorizedProfile(connection, entry.profile.profileKey)
    const selection = Object.freeze({
      adapterType: connection.adapterKey,
      adapterVersion: connection.adapterVersion,
      aiConnectionId: connection.id,
      aiConnectionModelRevisionId: modelRevision.id,
      aiRunProfileRevisionId: snapshot.profileRevision.id,
      connectionRevisionToken: connection.revisionToken,
      expectedEnvironmentId: input.expectedEnvironmentId,
      modelRevisionToken: modelRevision.revisionToken,
      profileKey: entry.profile.profileKey,
      profileRevisionToken: snapshot.profileRevision.revisionToken,
    })
    assertAiStagingLiveVerificationAllowed(input.expectedEnvironmentId)
    const result = await this.#external.verifyLivePath(
      connection,
      modelRevision,
      selection,
    )
    assertAiStagingLiveVerificationAllowed(input.expectedEnvironmentId)
    const referenced = await this.#store.getActivationSnapshot({
      profileKey: entry.profile.profileKey,
      profileRevisionId: snapshot.profileRevision.id,
    })
    if (
      !referenced ||
      !isCurrentLivePathActivation(exactSnapshot, referenced)
    ) {
      throw validationError('The exact AI path changed during verification.')
    }
    await this.#audit({
      operation: 'verify',
      resourceId: input.profileRevisionId,
      resourceType: 'ai_run_profile_revision',
    })
    return {
      ...result,
      aiConnectionId: selection.aiConnectionId,
      aiConnectionModelRevisionId: selection.aiConnectionModelRevisionId,
      aiRunProfileRevisionId: selection.aiRunProfileRevisionId,
      connectionRevisionToken: selection.connectionRevisionToken,
      modelRevisionToken: selection.modelRevisionToken,
      profileRevisionToken: selection.profileRevisionToken,
    }
  }

  async retireModelRevision(input: {
    connectionId: string
    modelRevisionId: string
    revisionToken: string
  }): Promise<AiAdminModelRevisionRecord> {
    const result = await this.#store.retireModelRevision(input)
    if (!result) activationConflict()
    return result
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

  async saveRunProfileRevision(input: {
    profileKey: AiRunProfileKey
    revision: SaveAiRunProfileRevision
  }): Promise<AiAdminRunProfileRecord> {
    return this.#store.saveRunProfileRevision(input)
  }

  async activateRunProfileRevision(input: {
    connectionRevisionToken: string
    modelRevisionToken: string
    profileKey: AiRunProfileKey
    profileRevisionId: string
    profileRevisionToken: string
    profileToken: string
  }): Promise<AiAdminRunProfileRecord> {
    const storedSnapshot = await this.#store.getActivationSnapshot(input)
    if (!storedSnapshot)
      throw notFoundError('AI run profile revision not found.')
    const connection = await this.#withSecretAvailability(
      storedSnapshot.connection,
    )
    const snapshot = { ...storedSnapshot, connection }
    if (snapshot.profileRevision.status === 'active') {
      throw validationError('The AI run profile revision is already active.')
    }
    if (
      snapshot.connection.revisionToken !== input.connectionRevisionToken ||
      snapshot.modelRevision?.revisionToken !== input.modelRevisionToken ||
      snapshot.profile.revisionToken !== input.profileToken ||
      snapshot.profileRevision.revisionToken !== input.profileRevisionToken
    ) {
      activationConflict()
    }
    const blockers = profileActivationBlockers(input.profileKey, snapshot)
    assertNoBlockers(blockers)
    await this.#assertAuthorizedProfile(snapshot.connection, input.profileKey)
    if (!snapshot.attestationRevisionToken || !snapshot.connectionEvidenceId) {
      throw validationError('AI run profile dependencies are incomplete.', {
        blockers: [{ code: 'attestation_invalid' }],
      })
    }
    const updated = await this.#store.activateRunProfileRevision({
      attestationRevisionToken: snapshot.attestationRevisionToken,
      connectionEvidenceId: snapshot.connectionEvidenceId,
      connectionRevisionToken: input.connectionRevisionToken,
      modelRevisionToken: input.modelRevisionToken,
      profileRevisionId: input.profileRevisionId,
      profileRevisionToken: input.profileRevisionToken,
      profileToken: input.profileToken,
      secretVersionId: snapshot.connection.activeSecret.available
        ? snapshot.connection.activeSecret.secretVersionId
        : null,
    })
    if (!updated) activationConflict()
    return updated
  }

  async setRunProfileOperationalStatus(input: {
    profileKey: AiRunProfileKey
    revisionToken: string
    status: 'enabled' | 'suspended'
  }): Promise<AiAdminRunProfileRecord> {
    const result = await this.#store.setRunProfileOperationalStatus(input)
    if (!result) activationConflict()
    return result
  }
}

export const __testing = {
  capabilityPolicyBlockers,
  completeAttestation,
  currentAttestation,
  profileActivationBlockers,
}

import { randomUUID } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { createSqlServerAiRunProfileSource } from '@/lib/dal/ai-run-profiles'
import type { SqlServerDatabase } from '@/lib/db'
import {
  type AiAdminConnectionAdapterRegistry,
  createAiAdminConnectionAdapterRegistry,
} from './admin-adapter'
import type {
  AiAdminConnectionDetail,
  AiAdminExternalOperations,
  AiAdminLivePathExternalResult,
  AiAdminLivePathSelection,
} from './admin-service'
import {
  type AiConnectionTrustConfiguration,
  type AiDeploymentTrustPolicy,
  type AiEgressPolicy,
  type AiRunDataPolicyRequirement,
  authorizeAiConnectionTarget,
  createAiEgressTransport,
  enforceAiDataPolicy,
} from './connection-trust'
import { controlledTestAdminAdapterRegistration } from './controlled-test-admin-adapter'
import { openRouterAdminAdapterRegistration } from './openrouter-admin-adapter'
import { createPinnedHttpsFetch } from './pinned-https-transport'
import {
  type AiProductionRuntimeCompositionOverrides,
  createProductionAiRuntimeComposition,
} from './production-runtime-composition'
import type { AiRunProfileKey } from './profile-resolver'
import type { AiProviderSecretKeyring } from './provider-secret-keyring'
import {
  AI_ADMIN_FUNCTIONAL_PROBE_VERSION,
  AiProviderSecretAdminService,
} from './provider-secret-service'
import type {
  AiEgressTransport,
  AiRunIdentity,
  AiRunType,
} from './run-contracts'
import { assertAiStagingLiveVerificationAllowed } from './staging-live-policy'

const PROFILE_RUN_TYPE = {
  generation_with_images: 'generate_with_images',
  generation_without_images: 'generate_without_images',
  invalid_json_repair: 'repair_invalid_import_json',
} as const satisfies Record<AiRunProfileKey, AiRunType>

const LIVE_PATH_TASK = Object.freeze({
  content: Object.freeze([
    Object.freeze({
      text: 'Return exactly one JSON object with {"status":"ok"}.',
      type: 'text' as const,
    }),
  ]),
  instructions: 'Fixed synthetic staging live-path verification.',
  responseSchema: Object.freeze({
    additionalProperties: false,
    properties: Object.freeze({ status: Object.freeze({ const: 'ok' }) }),
    required: Object.freeze(['status']),
    type: 'object',
  }),
  validationSchema: Object.freeze({
    additionalProperties: false,
    properties: Object.freeze({ status: Object.freeze({ const: 'ok' }) }),
    required: Object.freeze(['status']),
    type: 'object',
  }),
})

export interface AiAdminExactLivePathRunner {
  run(selection: Readonly<AiAdminLivePathSelection>): Promise<{
    failureCategory: string | null
    outcome: 'failed' | 'passed'
  }>
}

export function createExactLivePathRunner(
  db: SqlServerDatabase,
  keyring: () => AiProviderSecretKeyring,
  deployment: AiDeploymentTrustPolicy,
  overrides: AiProductionRuntimeCompositionOverrides = {},
): AiAdminExactLivePathRunner {
  const persistedSource = (
    overrides.createProfileSource ?? createSqlServerAiRunProfileSource
  )(db)
  return {
    async run(selection) {
      assertAiStagingLiveVerificationAllowed(selection.expectedEnvironmentId)
      const persisted = await persistedSource.findProfile(selection.profileKey)
      if (
        !persisted ||
        persisted.adapterType !== selection.adapterType ||
        persisted.adapterVersion !== selection.adapterVersion ||
        persisted.connectionId !== selection.aiConnectionId ||
        persisted.modelRevisionId !== selection.aiConnectionModelRevisionId ||
        persisted.profileId !== selection.aiRunProfileId ||
        persisted.profileConfigurationVersion !==
          selection.aiRunProfileConfigurationVersion
      ) {
        return { failureCategory: 'exact_profile_changed', outcome: 'failed' }
      }
      assertAiStagingLiveVerificationAllowed(selection.expectedEnvironmentId)
      const composition = createProductionAiRuntimeComposition({
        db,
        deployment,
        keyring: keyring(),
        overrides,
        profileSource: {
          async findProfile(profileKey) {
            return profileKey === selection.profileKey ? persisted : null
          },
        },
      })
      const abort = new AbortController()
      const deadline = setTimeout(() => abort.abort(), 30_000)
      try {
        let terminal:
          | {
              failure?: { category: string }
              identity: AiRunIdentity
              type: 'completed' | 'failed'
            }
          | undefined
        assertAiStagingLiveVerificationAllowed(selection.expectedEnvironmentId)
        for await (const event of composition.integration.run({
          context: {
            abortSignal: abort.signal,
            applicationRunId: `staging_live_${randomUUID()}`,
            correlationId: `staging_live_${randomUUID()}`,
            deadlineAt: new Date(Date.now() + 30_000).toISOString(),
          },
          task: LIVE_PATH_TASK,
          type: PROFILE_RUN_TYPE[selection.profileKey],
        })) {
          if (event.type === 'completed' || event.type === 'failed') {
            terminal = event
          }
        }
        return terminal?.type === 'completed' &&
          terminal.identity.aiConnectionId === selection.aiConnectionId &&
          terminal.identity.aiConnectionModelRevisionId ===
            selection.aiConnectionModelRevisionId &&
          terminal.identity.aiRunProfileId === selection.aiRunProfileId &&
          terminal.identity.aiRunProfileConfigurationVersion ===
            selection.aiRunProfileConfigurationVersion
          ? { failureCategory: null, outcome: 'passed' }
          : {
              failureCategory:
                terminal?.type === 'failed'
                  ? (terminal.failure?.category ?? 'exact_path_failed')
                  : 'exact_path_failed',
              outcome: 'failed',
            }
      } finally {
        clearTimeout(deadline)
      }
    },
  }
}

function jsonRecord<Value>(name: string): Readonly<Record<string, Value>> {
  const raw = process.env[name]
  if (!raw) return {}
  const value: unknown = JSON.parse(raw)
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${name} must be a JSON object.`)
  }
  return value as Readonly<Record<string, Value>>
}

export function loadAiDeploymentTrustPolicy(): AiDeploymentTrustPolicy {
  const egressPolicies = jsonRecord<AiEgressPolicy>(
    'AI_CONNECTION_EGRESS_POLICIES_JSON',
  )
  const dataPolicies = jsonRecord<AiRunDataPolicyRequirement>(
    'AI_CONNECTION_DATA_POLICIES_JSON',
  )
  const tlsSources = jsonRecord<'deployment_private_ca' | 'public_web_pki'>(
    'AI_CONNECTION_TLS_POLICIES_JSON',
  )
  return {
    dataPolicies,
    developmentLocalOrigin: process.env.AI_CONNECTION_DEVELOPMENT_LOCAL_ORIGIN,
    egressPolicies,
    environment:
      process.env.NODE_ENV === 'production'
        ? 'production'
        : process.env.NODE_ENV === 'test'
          ? 'test'
          : 'development',
    resolveHostname: async hostname =>
      (await lookup(hostname, { all: true, verbatim: true })).map(
        result => result.address,
      ),
    tlsPolicies: Object.fromEntries(
      Object.entries(tlsSources).map(([policyKey, trustSource]) => {
        if (trustSource !== 'public_web_pki') {
          throw new Error(
            `AI connection TLS policy ${policyKey} requires a deployment-owned transport.`,
          )
        }
        return [
          policyKey,
          {
            certificateValidation: 'required' as const,
            fetchPinned: createPinnedHttpsFetch(),
            trustSource,
          },
        ]
      }),
    ),
  }
}

function trustConfiguration(
  connection: Readonly<AiAdminConnectionDetail>,
): AiConnectionTrustConfiguration {
  const attestation = connection.attestation
  return {
    authenticationType: connection.authenticationType,
    dataPolicy:
      attestation &&
      attestation.isPersonalDataProcessed !== null &&
      attestation.isTrainingAllowed !== null &&
      attestation.maximumInformationClass !== null &&
      attestation.maximumRetentionDays !== null &&
      attestation.processingRegions !== null &&
      attestation.subprocessors !== null
        ? {
            isPersonalDataProcessed: attestation.isPersonalDataProcessed,
            isTrainingAllowed: attestation.isTrainingAllowed,
            maximumInformationClass: attestation.maximumInformationClass,
            maximumRetentionDays: attestation.maximumRetentionDays,
            processingRegions: attestation.processingRegions,
            subprocessors: attestation.subprocessors,
          }
        : null,
    egressPolicyKey: connection.egressPolicyKey,
    endpointUrl: connection.endpointUrl,
    tlsPolicyKey: connection.tlsPolicyKey,
  }
}

export function createProductionAiAdminExternalOperations(
  db: SqlServerDatabase,
  keyring: () => AiProviderSecretKeyring,
  options: {
    deployment?: AiDeploymentTrustPolicy
    exactLivePathRunner?: AiAdminExactLivePathRunner
    registry?: AiAdminConnectionAdapterRegistry
  } = {},
): AiAdminExternalOperations {
  const deployment = options.deployment ?? loadAiDeploymentTrustPolicy()
  const registry =
    options.registry ??
    createAiAdminConnectionAdapterRegistry([
      openRouterAdminAdapterRegistration,
      controlledTestAdminAdapterRegistration,
    ])
  const secrets = (): AiProviderSecretAdminService =>
    new AiProviderSecretAdminService(db, keyring())
  const exactLivePathRunner =
    options.exactLivePathRunner ??
    createExactLivePathRunner(db, keyring, deployment)
  const prepared = async (connection: Readonly<AiAdminConnectionDetail>) => {
    const target = await authorizeAiConnectionTarget(
      trustConfiguration(connection),
      deployment,
    )
    return {
      registration: registry.resolveRegistration(
        connection.adapterKey,
        connection.adapterVersion,
      ),
      egress: createAiEgressTransport(target, deployment),
    }
  }
  return {
    adapterAvailability(connection) {
      return registry.isRegistered(
        connection.adapterKey,
        connection.adapterVersion,
      )
        ? { available: true }
        : { available: false, reason: 'adapter_not_registered' }
    },
    async authorizeConnectionTarget(connection) {
      await prepared(connection)
      return true
    },
    async authorizeRunProfile(connection, profileKey) {
      try {
        await prepared(connection)
      } catch {
        return 'egress_policy_blocked'
      }
      const runType = PROFILE_RUN_TYPE[profileKey]
      if (!deployment.dataPolicies[runType]) {
        return 'data_policy_missing'
      }
      try {
        enforceAiDataPolicy(trustConfiguration(connection), runType, deployment)
        return 'authorized'
      } catch {
        return 'data_policy_blocked'
      }
    },
    async fetchCatalog(connection) {
      const { egress, registration } = await prepared(connection)
      return secrets().fetchCatalog(registration.adapter, connection, egress)
    },
    async probeHealth(connection, revision) {
      const { egress, registration } = await prepared(connection)
      return secrets().probeHealth(
        registration.adapter,
        connection,
        egress,
        revision,
      )
    },
    async verifyLivePath(connection, revision, selection) {
      assertAiStagingLiveVerificationAllowed(selection.expectedEnvironmentId)
      const { egress, registration } = await prepared(connection)
      const executionId = randomUUID()
      if (registration.executionKind !== 'external_live') {
        return {
          adapterType: registration.adapterType,
          adapterVersion: registration.adapterVersion,
          executionId,
          externalLiveCallMade: false,
          failureCategory: 'controlled_adapter_forbidden',
          outcome: 'failed',
          testSuiteVersion: AI_ADMIN_FUNCTIONAL_PROBE_VERSION,
        } satisfies AiAdminLivePathExternalResult
      }
      let externalLiveCallMade = false
      const observedEgress: AiEgressTransport = {
        fetch: (input, init) => {
          externalLiveCallMade = true
          return egress.fetch(input, init)
        },
      }
      assertAiStagingLiveVerificationAllowed(selection.expectedEnvironmentId)
      const result = await secrets().verifyModelCandidate(
        registration.adapter,
        connection,
        observedEgress,
        {
          externalModelId: revision.externalModelId,
          externalModelVersion: revision.externalModelVersion,
        },
        {
          signal: AbortSignal.timeout(60_000),
        },
      )
      assertAiStagingLiveVerificationAllowed(selection.expectedEnvironmentId)
      const exactResult = result.saveable
        ? await exactLivePathRunner.run(selection)
        : {
            failureCategory:
              result.baseline.failureCategory ??
              result.connection.failureCategory ??
              'capability_mismatch',
            outcome: 'failed' as const,
          }
      return {
        adapterType: registration.adapterType,
        adapterVersion: registration.adapterVersion,
        executionId,
        externalLiveCallMade,
        failureCategory: exactResult.failureCategory,
        outcome: exactResult.outcome,
        testSuiteVersion: result.testSuiteVersion,
      } satisfies AiAdminLivePathExternalResult
    },
    async verifyModelCandidate(connection, candidate, verificationOptions) {
      const { egress, registration } = await prepared(connection)
      return secrets().verifyModelCandidate(
        registration.adapter,
        connection,
        egress,
        candidate,
        verificationOptions,
      )
    },
    async verifySecretCandidate(connection, _context, plaintext) {
      const { egress, registration } = await prepared(connection)
      return secrets().verifySecretCandidate(
        registration.adapter,
        connection,
        egress,
        plaintext,
      )
    },
  }
}

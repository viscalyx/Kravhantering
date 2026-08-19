import { lookup } from 'node:dns/promises'
import type { SqlServerDatabase } from '@/lib/db'
import {
  type AiAdminConnectionAdapterRegistry,
  createAiAdminConnectionAdapterRegistry,
} from './admin-adapter'
import type {
  AiAdminConnectionDetail,
  AiAdminExternalOperations,
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
import type { AiRunProfileKey } from './profile-resolver'
import type { AiProviderSecretKeyring } from './provider-secret-keyring'
import { AiProviderSecretAdminService } from './provider-secret-service'
import type { AiRunType } from './run-contracts'

const PROFILE_RUN_TYPE = {
  generation_with_images: 'generate_with_images',
  generation_without_images: 'generate_without_images',
  invalid_json_repair: 'repair_invalid_import_json',
} as const satisfies Record<AiRunProfileKey, AiRunType>

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
  const prepared = async (connection: Readonly<AiAdminConnectionDetail>) => {
    const target = await authorizeAiConnectionTarget(
      trustConfiguration(connection),
      deployment,
    )
    return {
      adapter: registry.resolve(
        connection.adapterKey,
        connection.adapterVersion,
      ),
      egress: createAiEgressTransport(target, deployment),
    }
  }
  return {
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
      try {
        enforceAiDataPolicy(
          trustConfiguration(connection),
          PROFILE_RUN_TYPE[profileKey],
          deployment,
        )
        return 'authorized'
      } catch {
        return 'data_policy_blocked'
      }
    },
    async fetchCatalog(connection) {
      const { adapter, egress } = await prepared(connection)
      return secrets().fetchCatalog(adapter, connection, egress)
    },
    async probeConnection(connection) {
      const { adapter, egress } = await prepared(connection)
      return secrets().probeConnection(adapter, connection, egress)
    },
    async probeHealth(connection, revision) {
      const { adapter, egress } = await prepared(connection)
      return secrets().probeHealth(adapter, connection, egress, revision)
    },
    async verifyModelRevision(connection, revision) {
      const { adapter, egress } = await prepared(connection)
      return secrets().verifyModelRevision(
        adapter,
        connection,
        egress,
        revision,
      )
    },
    async verifySecretCandidate(connection, _context, plaintext) {
      const { adapter, egress } = await prepared(connection)
      return secrets().verifySecretCandidate(
        adapter,
        connection,
        egress,
        plaintext,
      )
    },
  }
}

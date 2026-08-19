import type {
  AiAdminCatalogItem,
  AiAdminConnectionDetail,
  AiAdminConnectionVerificationResult,
  AiAdminModelRevisionRecord,
} from './admin-service'
import type {
  AiCapabilitySelection,
  AiEgressTransport,
  AiRunEvent,
  AiTaskEnvelope,
} from './run-contracts'

export interface AiAdminAdapterContext {
  connection: Readonly<AiAdminConnectionDetail>
  credential: string | null
  egress: AiEgressTransport
}

export interface AiAdminFunctionalProbe {
  abortSignal: AbortSignal
  deadlineAt: string
  selectedCapabilities: Readonly<AiCapabilitySelection>
  task: Readonly<AiTaskEnvelope>
}

export interface AiAdminConnectionAdapter {
  fetchCatalog(
    context: Readonly<AiAdminAdapterContext>,
  ): Promise<readonly AiAdminCatalogItem[]>
  probeConnection(
    context: Readonly<AiAdminAdapterContext>,
  ): Promise<Readonly<AiAdminConnectionVerificationResult>>
  runFunctionalProbe(
    context: Readonly<AiAdminAdapterContext>,
    revision: Readonly<AiAdminModelRevisionRecord>,
    probe: Readonly<AiAdminFunctionalProbe>,
  ): AsyncIterable<AiRunEvent>
  verifySecretCandidate(context: Readonly<AiAdminAdapterContext>): Promise<void>
}

export interface AiAdminConnectionAdapterRegistration {
  adapter: AiAdminConnectionAdapter
  adapterType: string
  adapterVersion: string
}

export interface AiAdminConnectionAdapterRegistry {
  resolve(adapterType: string, adapterVersion: string): AiAdminConnectionAdapter
}

function key(adapterType: string, adapterVersion: string): string {
  return JSON.stringify([adapterType, adapterVersion])
}

export function createAiAdminConnectionAdapterRegistry(
  registrations: readonly AiAdminConnectionAdapterRegistration[],
): AiAdminConnectionAdapterRegistry {
  const adapters = new Map<string, AiAdminConnectionAdapter>()
  for (const registration of registrations) {
    const registrationKey = key(
      registration.adapterType,
      registration.adapterVersion,
    )
    if (adapters.has(registrationKey)) {
      throw new Error(
        `Duplicate AI administration adapter: ${registration.adapterType}@${registration.adapterVersion}`,
      )
    }
    adapters.set(registrationKey, registration.adapter)
  }
  return {
    resolve(adapterType, adapterVersion) {
      const adapter = adapters.get(key(adapterType, adapterVersion))
      if (!adapter) {
        throw new Error(
          `Unknown AI administration adapter: ${adapterType}@${adapterVersion}`,
        )
      }
      return adapter
    },
  }
}

import type {
  AiAdminCatalogItem,
  AiAdminConnectionDetail,
  AiAdminModelRevisionRecord,
} from './admin-service'
import type {
  AiCapabilitySelection,
  AiEgressTransport,
  AiRunEvent,
  AiRunLimits,
  AiTaskEnvelope,
} from './run-contracts'

export const AI_ADMIN_PROBE_LIMITS = Object.freeze({
  maxBufferedEvents: 16,
  maxOutputBytes: 65_536,
  maxOutputTokens: 1_536,
  maxRetainedMemoryBytes: 131_072,
}) satisfies Readonly<AiRunLimits>

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

export interface AiAdminConnectionProbeResult {
  details: Readonly<Record<string, boolean>>
  diagnosticCode: string | null
  failureCategory: string | null
  outcome: 'failed' | 'passed'
  testSuiteVersion: string
}

export interface AiAdminConnectionProbe {
  abortSignal: AbortSignal
  deadlineAt: string
}

export type AiAdminNegativeProbeCase =
  | 'prohibited_callback'
  | 'prohibited_function_call'
  | 'prohibited_tool_calls'
  | 'safe_provider_error'

export interface AiAdminConnectionAdapter {
  fetchCatalog(
    context: Readonly<AiAdminAdapterContext>,
  ): Promise<readonly AiAdminCatalogItem[]>
  probeConnection(
    context: Readonly<AiAdminAdapterContext>,
    probe?: Readonly<AiAdminConnectionProbe>,
  ): Promise<Readonly<AiAdminConnectionProbeResult>>
  runActivationCancellationProbe(
    context: Readonly<AiAdminAdapterContext>,
    revision: Readonly<AiAdminModelRevisionRecord>,
    probe: Readonly<AiAdminFunctionalProbe>,
  ): AsyncIterable<AiRunEvent>
  runActivationNegativeProbe(
    context: Readonly<AiAdminAdapterContext>,
    revision: Readonly<AiAdminModelRevisionRecord>,
    probe: Readonly<AiAdminFunctionalProbe>,
    negativeCase: AiAdminNegativeProbeCase,
  ): AsyncIterable<AiRunEvent>
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
  executionKind: 'controlled_offline' | 'external_live'
}

export interface AiAdminConnectionAdapterRegistry {
  isRegistered(adapterType: string, adapterVersion: string): boolean
  resolve(adapterType: string, adapterVersion: string): AiAdminConnectionAdapter
  resolveRegistration(
    adapterType: string,
    adapterVersion: string,
  ): AiAdminConnectionAdapterRegistration
}

function key(adapterType: string, adapterVersion: string): string {
  return JSON.stringify([adapterType, adapterVersion])
}

export function createAiAdminConnectionAdapterRegistry(
  registrations: readonly AiAdminConnectionAdapterRegistration[],
): AiAdminConnectionAdapterRegistry {
  const adapters = new Map<string, AiAdminConnectionAdapterRegistration>()
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
    adapters.set(registrationKey, registration)
  }
  return {
    isRegistered(adapterType, adapterVersion) {
      return adapters.has(key(adapterType, adapterVersion))
    },
    resolve(adapterType, adapterVersion) {
      return this.resolveRegistration(adapterType, adapterVersion).adapter
    },
    resolveRegistration(adapterType, adapterVersion) {
      const registration = adapters.get(key(adapterType, adapterVersion))
      if (!registration) {
        throw new Error(
          `Unknown AI administration adapter: ${adapterType}@${adapterVersion}`,
        )
      }
      return registration
    },
  }
}

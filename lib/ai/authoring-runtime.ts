import { createSqlServerAiRunProfileSource } from '@/lib/dal/ai-run-profiles'
import type { SqlServerDatabase } from '@/lib/db'
import { aiRunTelemetry } from '@/lib/observability/ai-runs'
import { createAiConnectionAdapterRegistry } from './adapter-registry'
import { loadAiDeploymentTrustPolicy } from './admin-external'
import { controlledTestAdapterRegistration } from './controlled-test-adapter'
import {
  type AiIntegrationLayerWithSafeInvalidOutput,
  createAiIntegrationLayer,
} from './integration-layer'
import { openRouterAdapterRegistration } from './openrouter-adapter'
import type {
  AiResolvedRunProfile,
  AiRunProfileResolver,
} from './profile-resolver'
import {
  AiRunProfileResolutionError,
  createAiRunProfileResolver,
} from './profile-resolver'
import { loadAiProviderSecretKeyring } from './provider-secret-keyring'
import { createAiRuntimeAdapterConfigurationResolver } from './provider-secret-service'
import type {
  AIIntegrationLayer,
  AiIntegrationRunRequest,
  AiRunEvent,
  AiRunType,
  AiRunUsage,
  AiRunValidationIssue,
} from './run-contracts'
import { createSqlServerAiRunCoordinationStore } from './run-coordination-store'
import { createAiRunCoordinator } from './run-coordinator'
import { createAiRunTrustBoundary } from './run-trust-boundary'
import { screenAiInput, screenAiOutput } from './safety'

export type AiAuthoringProfileUnavailableReason =
  | 'blocked'
  | 'missing'
  | 'suspended'

export type AiAuthoringProfileDescription =
  | {
      available: true
      connectionName: string
      dataPolicySummary: string
    }
  | {
      available: false
      reason: AiAuthoringProfileUnavailableReason
    }

export type AiAuthoringRunEvent =
  | AiRunEvent
  | {
      analysis: string | null
      identity: Extract<AiRunEvent, { type: 'failed' }>['identity']
      issues: readonly AiRunValidationIssue[]
      rawOutput: string
      type: 'invalid_output'
      usage: AiRunUsage
    }

export interface AiAuthoringRuntime {
  describe(type: AiRunType): Promise<AiAuthoringProfileDescription>
  run(request: AiIntegrationRunRequest): AsyncIterable<AiAuthoringRunEvent>
}

export interface CreateAiAuthoringRuntimeOptions {
  integration: AIIntegrationLayer &
    Partial<
      Pick<AiIntegrationLayerWithSafeInvalidOutput, 'takeSafeInvalidOutput'>
    >
  profileResolver: AiRunProfileResolver
}

function unavailableReason(
  error: AiRunProfileResolutionError,
): AiAuthoringProfileUnavailableReason {
  if (error.code === 'profile_missing') return 'missing'
  if (error.code === 'profile_suspended') return 'suspended'
  return 'blocked'
}

async function verifyAdapterConfiguration(
  profile: Readonly<AiResolvedRunProfile>,
): Promise<void> {
  await profile.withAdapterConfiguration(async () => undefined)
}

export function createAiAuthoringRuntime(
  options: CreateAiAuthoringRuntimeOptions,
): AiAuthoringRuntime {
  return Object.freeze({
    async describe(type: AiRunType): Promise<AiAuthoringProfileDescription> {
      try {
        const profile = await options.profileResolver.resolve(type)
        await verifyAdapterConfiguration(profile)
        return Object.freeze({
          available: true,
          connectionName: profile.publicMetadata.connectionName,
          dataPolicySummary: profile.publicMetadata.dataPolicySummary,
        })
      } catch (error) {
        return Object.freeze({
          available: false,
          reason:
            error instanceof AiRunProfileResolutionError
              ? unavailableReason(error)
              : 'blocked',
        })
      }
    },
    async *run(
      request: AiIntegrationRunRequest,
    ): AsyncIterable<AiAuthoringRunEvent> {
      for await (const event of options.integration.run(request)) {
        if (event.type === 'failed') {
          const invalidOutput =
            options.integration.takeSafeInvalidOutput?.(event)
          if (invalidOutput) {
            yield {
              ...invalidOutput,
              identity: event.identity,
              type: 'invalid_output',
            }
            continue
          }
        }
        yield event
      }
    },
  })
}

const runtimeCache = new WeakMap<SqlServerDatabase, AiAuthoringRuntime>()

export function createProductionAiAuthoringRuntime(
  db: SqlServerDatabase,
): AiAuthoringRuntime {
  const cached = runtimeCache.get(db)
  if (cached) return cached
  const profileResolver = createAiRunProfileResolver({
    profileSource: createSqlServerAiRunProfileSource(db),
    resolveAdapterConfiguration: createAiRuntimeAdapterConfigurationResolver(
      db,
      loadAiProviderSecretKeyring(),
    ),
  })
  const runCoordinator = createAiRunCoordinator({
    coordination: createSqlServerAiRunCoordinationStore(db),
    telemetry: aiRunTelemetry,
  })
  const integration = createAiIntegrationLayer({
    adapterRegistry: createAiConnectionAdapterRegistry([
      openRouterAdapterRegistration,
      controlledTestAdapterRegistration,
    ]),
    profileResolver,
    runCoordinator,
    telemetry: aiRunTelemetry,
    trustBoundary: createAiRunTrustBoundary({
      deployment: loadAiDeploymentTrustPolicy(),
      imageLimits: Object.freeze({
        maximumBytes: 10 * 1024 * 1024,
        maximumFrames: 1,
        maximumHeight: 8192,
        maximumPixels: 32 * 1024 * 1024,
        maximumWidth: 8192,
      }),
      safetyFilter: {
        async screenInput(textParts) {
          return screenAiInput(db, textParts)
        },
        async screenOutput(textParts) {
          return screenAiOutput(db, textParts)
        },
      },
    }),
  })
  const runtime = createAiAuthoringRuntime({ integration, profileResolver })
  runtimeCache.set(db, runtime)
  return runtime
}

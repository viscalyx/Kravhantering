import type { SqlServerDatabase } from '@/lib/db'
import { loadAiDeploymentTrustPolicy } from './admin-external'
import type { AiIntegrationLayerWithSafeInvalidOutput } from './integration-layer'
import { createProductionAiRuntimeComposition } from './production-runtime-composition'
import type {
  AiResolvedRunProfile,
  AiRunProfileResolver,
} from './profile-resolver'
import { AiRunProfileResolutionError } from './profile-resolver'
import { loadAiProviderSecretKeyring } from './provider-secret-keyring'
import type {
  AIIntegrationLayer,
  AiIntegrationRunRequest,
  AiRunEvent,
  AiRunType,
  AiRunUsage,
  AiRunValidationIssue,
} from './run-contracts'

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
  const { integration, profileResolver } = createProductionAiRuntimeComposition(
    {
      db,
      deployment: loadAiDeploymentTrustPolicy(),
      keyring: loadAiProviderSecretKeyring(),
    },
  )
  const runtime = createAiAuthoringRuntime({ integration, profileResolver })
  runtimeCache.set(db, runtime)
  return runtime
}

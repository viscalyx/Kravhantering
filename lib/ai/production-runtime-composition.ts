import { createSqlServerAiRunProfileSource } from '@/lib/dal/ai-run-profiles'
import type { SqlServerDatabase } from '@/lib/db'
import { aiRunTelemetry } from '@/lib/observability/ai-runs'
import { createAiConnectionAdapterRegistry } from './adapter-registry'
import type { AiDeploymentTrustPolicy } from './connection-trust'
import { controlledTestAdapterRegistration } from './controlled-test-adapter'
import { createAiIntegrationLayer } from './integration-layer'
import { openRouterAdapterRegistration } from './openrouter-adapter'
import {
  type AiRunProfileResolver,
  type AiRunProfileSource,
  createAiRunProfileResolver,
} from './profile-resolver'
import type { AiProviderSecretKeyring } from './provider-secret-keyring'
import { createAiRuntimeAdapterConfigurationResolver } from './provider-secret-service'
import type { AIIntegrationLayer } from './run-contracts'
import { createSqlServerAiRunCoordinationStore } from './run-coordination-store'
import { createAiRunCoordinator } from './run-coordinator'
import { createAiRunTrustBoundary } from './run-trust-boundary'
import { screenAiInput, screenAiOutput } from './safety'

export interface AiProductionRuntimeComposition {
  integration: AIIntegrationLayer
  profileResolver: AiRunProfileResolver
}

export interface AiProductionRuntimeCompositionOverrides {
  createIntegration?: typeof createAiIntegrationLayer
  createProfileSource?: typeof createSqlServerAiRunProfileSource
  screenInput?: typeof screenAiInput
  screenOutput?: typeof screenAiOutput
}

export function createProductionAiRuntimeComposition(input: {
  db: SqlServerDatabase
  deployment: AiDeploymentTrustPolicy
  keyring: AiProviderSecretKeyring
  overrides?: AiProductionRuntimeCompositionOverrides
  profileSource?: AiRunProfileSource
}): AiProductionRuntimeComposition {
  const overrides = input.overrides ?? {}
  const profileResolver = createAiRunProfileResolver({
    profileSource:
      input.profileSource ??
      (overrides.createProfileSource ?? createSqlServerAiRunProfileSource)(
        input.db,
      ),
    resolveAdapterConfiguration: createAiRuntimeAdapterConfigurationResolver(
      input.db,
      input.keyring,
    ),
  })
  const integration = (overrides.createIntegration ?? createAiIntegrationLayer)(
    {
      adapterRegistry: createAiConnectionAdapterRegistry([
        openRouterAdapterRegistration,
        controlledTestAdapterRegistration,
      ]),
      profileResolver,
      runCoordinator: createAiRunCoordinator({
        coordination: createSqlServerAiRunCoordinationStore(input.db),
        telemetry: aiRunTelemetry,
      }),
      telemetry: aiRunTelemetry,
      trustBoundary: createAiRunTrustBoundary({
        deployment: input.deployment,
        imageLimits: Object.freeze({
          maximumBytes: 10 * 1024 * 1024,
          maximumFrames: 1,
          maximumHeight: 8192,
          maximumPixels: 32 * 1024 * 1024,
          maximumWidth: 8192,
        }),
        safetyFilter: {
          async screenInput(textParts) {
            return (overrides.screenInput ?? screenAiInput)(input.db, textParts)
          },
          async screenOutput(textParts) {
            return (overrides.screenOutput ?? screenAiOutput)(
              input.db,
              textParts,
            )
          },
        },
      }),
    },
  )
  return Object.freeze({ integration, profileResolver })
}

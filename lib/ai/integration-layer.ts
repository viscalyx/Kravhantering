import type { AiConnectionAdapterRegistry } from './adapter-registry'
import {
  AiRunProfileResolutionError,
  type AiRunProfileResolver,
} from './profile-resolver'
import type {
  AIConnectionAdapter,
  AIIntegrationLayer,
  AiIntegrationRunRequest,
  AiRunEvent,
  AiRunIdentity,
} from './run-contracts'
import {
  createAiAdapterRunContext,
  guardAiRunEventStream,
} from './run-contracts'

export interface CreateAiIntegrationLayerOptions {
  adapterRegistry: AiConnectionAdapterRegistry
  profileResolver: AiRunProfileResolver
}

function adapterFailure(identity: AiRunIdentity): AiRunEvent {
  return {
    failure: {
      category: 'adapter_failure',
      diagnosticCode: 'adapter_run_threw',
      retryable: false,
    },
    identity,
    type: 'failed',
  }
}

function resolveExactAdapter(
  registry: AiConnectionAdapterRegistry,
  adapterType: string,
  adapterVersion: string,
): AIConnectionAdapter {
  try {
    return registry.resolve(adapterType, adapterVersion)
  } catch {
    throw new AiRunProfileResolutionError('profile_blocked')
  }
}

export function createAiIntegrationLayer(
  options: CreateAiIntegrationLayerOptions,
): AIIntegrationLayer {
  return {
    async *run(request: AiIntegrationRunRequest): AsyncIterable<AiRunEvent> {
      const profile = await options.profileResolver.resolve(request.type)
      const adapter = resolveExactAdapter(
        options.adapterRegistry,
        profile.adapterType,
        profile.adapterVersion,
      )
      const identity: AiRunIdentity = Object.freeze({
        aiConnectionId: profile.connection.id,
        aiConnectionModelRevisionId: profile.modelRevision.id,
        aiRunProfileRevisionId: profile.profileRevisionId,
      })
      let stream: AsyncIterable<AiRunEvent>
      try {
        stream = adapter.run({
          connection: profile.connection,
          context: createAiAdapterRunContext(request.context),
          modelRevision: profile.modelRevision,
          runProfileRevisionId: profile.profileRevisionId,
          selectedCapabilities: profile.selectedCapabilities,
          task: request.task,
        })
      } catch {
        yield adapterFailure(identity)
        return
      }
      yield* guardAiRunEventStream(stream, identity)
    },
  }
}

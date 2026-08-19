import type { AiConnectionAdapterRegistry } from './adapter-registry'
import {
  type AiResolvedRunProfile,
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

interface Deferred<T> {
  promise: Promise<T>
  reject(reason?: unknown): void
  resolve(value: T): void
}

function deferred<T>(): Deferred<T> {
  let reject: Deferred<T>['reject'] = () => undefined
  let resolve: Deferred<T>['resolve'] = () => undefined
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    reject = rejectPromise
    resolve = resolvePromise
  })
  return { promise, reject, resolve }
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

async function* runInAdapterConfigurationScope(
  adapter: AIConnectionAdapter,
  profile: Readonly<AiResolvedRunProfile>,
  request: AiIntegrationRunRequest,
  identity: AiRunIdentity,
): AsyncIterable<AiRunEvent> {
  const iteratorReady = deferred<AsyncIterator<AiRunEvent>>()
  const releaseScope = deferred<void>()
  let scopeEntered = false
  const scopedRun = profile
    .withAdapterConfiguration(async configuredProfile => {
      scopeEntered = true
      let stream: AsyncIterable<AiRunEvent>
      try {
        stream = adapter.run({
          connection: configuredProfile.connection,
          context: createAiAdapterRunContext(request.context),
          modelRevision: configuredProfile.modelRevision,
          runProfileRevisionId: profile.profileRevisionId,
          selectedCapabilities: profile.selectedCapabilities,
          task: request.task,
        })
      } catch {
        stream = (async function* failedRun() {
          yield adapterFailure(identity)
        })()
      }
      iteratorReady.resolve(
        guardAiRunEventStream(stream, identity)[Symbol.asyncIterator](),
      )
      await releaseScope.promise
    })
    .catch(error => {
      if (!scopeEntered) iteratorReady.reject(error)
      throw error
    })

  let iterator: AsyncIterator<AiRunEvent> | undefined
  try {
    iterator = await iteratorReady.promise
    while (true) {
      const result = await iterator.next()
      if (result.done) return
      yield result.value
    }
  } finally {
    await iterator?.return?.()
    releaseScope.resolve()
    await scopedRun
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
        aiConnectionId: profile.connectionId,
        aiConnectionModelRevisionId: profile.modelRevisionId,
        aiRunProfileRevisionId: profile.profileRevisionId,
      })
      yield* runInAdapterConfigurationScope(adapter, profile, request, identity)
    },
  }
}

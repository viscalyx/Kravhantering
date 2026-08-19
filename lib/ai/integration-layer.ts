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
import type { AiPreparedRun, AiRunTrustBoundary } from './run-trust-boundary'

export interface CreateAiIntegrationLayerOptions {
  adapterRegistry: AiConnectionAdapterRegistry
  profileResolver: AiRunProfileResolver
  trustBoundary: AiRunTrustBoundary
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

function adapterConfigurationScopeFailure(identity: AiRunIdentity): AiRunEvent {
  return {
    failure: {
      category: 'adapter_failure',
      diagnosticCode: 'adapter_configuration_scope_failed',
      retryable: false,
    },
    identity,
    type: 'failed',
  }
}

function trustBoundaryFailure(
  identity: AiRunIdentity,
  diagnosticCode: 'final_safety_gate_blocked' | 'trust_boundary_blocked',
): AiRunEvent {
  return {
    failure: {
      category: 'request_rejected',
      diagnosticCode,
      retryable: false,
    },
    identity,
    type: 'failed',
  }
}

function isTerminalEvent(
  event: AiRunEvent,
): event is Extract<
  AiRunEvent,
  { type: 'cancelled' | 'completed' | 'failed' }
> {
  return (
    event.type === 'cancelled' ||
    event.type === 'completed' ||
    event.type === 'failed'
  )
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
  prepared: Readonly<AiPreparedRun>,
  quarantine: (text: string) => void,
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
          context: createAiAdapterRunContext(request.context, prepared.egress),
          modelRevision: configuredProfile.modelRevision,
          runProfileRevisionId: profile.profileRevisionId,
          selectedCapabilities: profile.selectedCapabilities,
          task: prepared.task,
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
  let iteratorCompleted = false
  let iterationError: unknown
  let scopeError: unknown
  let terminalEvent: AiRunEvent | undefined
  try {
    iterator = await iteratorReady.promise
    while (true) {
      const result = await iterator.next()
      if (result.done) {
        iteratorCompleted = true
        break
      }
      if (isTerminalEvent(result.value)) {
        terminalEvent = result.value
      } else {
        quarantine(result.value.delta)
      }
    }
  } catch (error) {
    iterationError = error
  } finally {
    try {
      if (!iteratorCompleted) await iterator?.return?.()
    } catch {
      // Adapter cleanup details must not escape or strand transient config.
    } finally {
      releaseScope.resolve()
      try {
        await scopedRun
      } catch (error) {
        scopeError = error
      }
    }
  }

  if (!scopeEntered) throw scopeError ?? iterationError
  if (scopeError || iterationError || !terminalEvent) {
    yield adapterConfigurationScopeFailure(identity)
    return
  }
  yield terminalEvent
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
      let prepared: Readonly<AiPreparedRun>
      try {
        prepared = await options.trustBoundary.prepareRun({
          runType: request.type,
          task: request.task,
          trustConfiguration: profile.trustConfiguration,
        })
      } catch {
        yield trustBoundaryFailure(identity, 'trust_boundary_blocked')
        return
      }
      const quarantinedText: string[] = []
      for await (const event of runInAdapterConfigurationScope(
        adapter,
        profile,
        request,
        identity,
        prepared,
        text => quarantinedText.push(text),
      )) {
        if (event.type !== 'completed') {
          yield event
          continue
        }
        try {
          await options.trustBoundary.approveCompleted({
            analysis: event.analysis,
            quarantinedText,
            rawOutput: event.rawOutput,
            responseSchema: prepared.task.responseSchema,
          })
        } catch {
          yield trustBoundaryFailure(identity, 'final_safety_gate_blocked')
          return
        }
        yield event
      }
    },
  }
}

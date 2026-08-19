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
import type { AiRunCoordinator, AiRunTelemetry } from './run-coordinator'

const HEALTH_PROBE_PROMPT_VERSION = 'ai-health-probe-v1'
const HEALTH_PROBE_TASK = Object.freeze({
  content: Object.freeze([
    Object.freeze({
      text: 'Return a JSON object whose status property is "ok".',
      type: 'text' as const,
    }),
  ]),
  instructions: `Synthetic health probe ${HEALTH_PROBE_PROMPT_VERSION}.`,
  responseSchema: Object.freeze({
    additionalProperties: false,
    properties: Object.freeze({ status: Object.freeze({ const: 'ok' }) }),
    required: Object.freeze(['status']),
    type: 'object',
  }),
})

export interface CreateAiIntegrationLayerOptions {
  adapterRegistry: AiConnectionAdapterRegistry
  profileResolver: AiRunProfileResolver
  trustBoundary: AiRunTrustBoundary
  runCoordinator: AiRunCoordinator
  telemetry?: AiRunTelemetry
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

function settledTrue(): true {
  return true
}

function isSuccessfulHealthProbeOutput(rawOutput: string): boolean {
  try {
    const value: unknown = JSON.parse(rawOutput)
    return (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      Object.keys(value).length === 1 &&
      (value as { status?: unknown }).status === 'ok'
    )
  } catch {
    return false
  }
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
  attemptContext: {
    abortSignal: AbortSignal
    deadlineAt: string
  },
  onAdapterContext: (
    context: ReturnType<typeof createAiAdapterRunContext>,
  ) => void,
): AsyncIterable<AiRunEvent> {
  const iteratorReady = deferred<AsyncIterator<AiRunEvent>>()
  const releaseScope = deferred<void>()
  let scopeEntered = false
  const scopedRun = profile
    .withAdapterConfiguration(async configuredProfile => {
      scopeEntered = true
      let stream: AsyncIterable<AiRunEvent>
      try {
        const context = createAiAdapterRunContext(
          {
            ...request.context,
            abortSignal: attemptContext.abortSignal,
            deadlineAt: attemptContext.deadlineAt,
          },
          prepared.egress,
        )
        onAdapterContext(context)
        stream = adapter.run({
          connection: configuredProfile.connection,
          context,
          limits: profile.limits,
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
        yield result.value
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
  options.runCoordinator.startAutomaticRecovery(
    async (target, probeRunId, abortSignal) => {
      let profile: Readonly<AiResolvedRunProfile>
      try {
        profile = await options.profileResolver.resolve(target.runType)
      } catch {
        return {
          failure: {
            category: 'capability_mismatch',
            diagnosticCode: 'health_probe_profile_unavailable',
            retryable: false,
          },
          succeeded: false,
        }
      }
      if (
        profile.connectionId !== target.identity.aiConnectionId ||
        profile.modelRevisionId !==
          target.identity.aiConnectionModelRevisionId ||
        profile.profileRevisionId !== target.identity.aiRunProfileRevisionId
      ) {
        return {
          failure: {
            category: 'capability_mismatch',
            diagnosticCode: 'health_probe_profile_changed',
            retryable: false,
          },
          succeeded: false,
        }
      }
      const adapter = resolveExactAdapter(
        options.adapterRegistry,
        profile.adapterType,
        profile.adapterVersion,
      )
      let forceClose: (() => void) | undefined
      const request: AiIntegrationRunRequest = {
        context: {
          abortSignal,
          applicationRunId: probeRunId,
          correlationId: probeRunId,
          deadlineAt: new Date(
            Date.now() + target.totalTimeBudgetMs,
          ).toISOString(),
          requestId: probeRunId,
        },
        task: HEALTH_PROBE_TASK,
        type: target.runType,
      }
      const stream = runInAdapterConfigurationScope(
        adapter,
        profile,
        request,
        target.identity,
        {
          abortSignal,
          deadlineAt: request.context.deadlineAt,
        },
        context => {
          forceClose = () => adapter.forceClose(context.externalRunId)
        },
      )
      const iterator = stream[Symbol.asyncIterator]()
      let outputBytes = 0
      let retainedBytes = 0
      const encoder = new TextEncoder()
      try {
        while (!abortSignal.aborted) {
          let onAbort = (): void => undefined
          let inactivityTimer: ReturnType<typeof setTimeout> | undefined
          const pulled = await Promise.race([
            iterator
              .next()
              .then(result => ({ result, type: 'event' as const })),
            new Promise<{ type: 'abort' }>(resolve => {
              onAbort = () => resolve({ type: 'abort' })
              abortSignal.addEventListener('abort', onAbort, { once: true })
            }),
            new Promise<{ type: 'inactivity' }>(resolve => {
              inactivityTimer = setTimeout(
                () => resolve({ type: 'inactivity' }),
                target.inactivityTimeBudgetMs,
              )
            }),
          ])
          if (inactivityTimer) clearTimeout(inactivityTimer)
          abortSignal.removeEventListener('abort', onAbort)
          if (pulled.type === 'abort') break
          if (pulled.type === 'inactivity') {
            return {
              failure: {
                category: 'deadline_exceeded',
                diagnosticCode: 'health_probe_inactivity_budget_exceeded',
                retryable: false,
              },
              succeeded: false,
            }
          }
          const { result } = pulled
          if (result.done) break
          const event = result.value
          if (event.type === 'analysis_delta') {
            retainedBytes += encoder.encode(event.delta).byteLength
          } else if (event.type === 'output_delta') {
            const bytes = encoder.encode(event.delta).byteLength
            outputBytes += bytes
            retainedBytes += bytes
          } else if (event.type === 'completed') {
            const finalOutputBytes = encoder.encode(event.rawOutput).byteLength
            const finalRetainedBytes =
              finalOutputBytes + encoder.encode(event.analysis ?? '').byteLength
            const outputTokens = event.usage.outputTokens
            const tokenCount =
              outputTokens.status === 'reported' ||
              outputTokens.status === 'calculated'
                ? outputTokens.value
                : null
            if (
              finalOutputBytes > profile.limits.maxOutputBytes ||
              finalRetainedBytes > profile.limits.maxRetainedMemoryBytes ||
              (tokenCount !== null &&
                tokenCount > profile.limits.maxOutputTokens)
            ) {
              return {
                failure: {
                  category: 'invalid_response',
                  diagnosticCode: 'health_probe_limit_exceeded',
                  retryable: false,
                },
                succeeded: false,
              }
            }
            if (!isSuccessfulHealthProbeOutput(event.rawOutput)) {
              return {
                failure: {
                  category: 'invalid_response',
                  diagnosticCode: 'health_probe_schema_invalid',
                  retryable: false,
                },
                succeeded: false,
              }
            }
            return { succeeded: true, usage: event.usage }
          } else if (event.type === 'failed') {
            return { failure: event.failure, succeeded: false }
          } else if (event.type === 'cancelled') {
            return {
              failure: {
                category: 'connection_unavailable',
                diagnosticCode: 'health_probe_cancelled',
                retryable: true,
              },
              succeeded: false,
            }
          }
          if (
            outputBytes > profile.limits.maxOutputBytes ||
            retainedBytes > profile.limits.maxRetainedMemoryBytes
          ) {
            return {
              failure: {
                category: 'invalid_response',
                diagnosticCode: 'health_probe_limit_exceeded',
                retryable: false,
              },
              succeeded: false,
            }
          }
        }
        return {
          failure: {
            category: abortSignal.aborted
              ? 'deadline_exceeded'
              : 'invalid_response',
            diagnosticCode: abortSignal.aborted
              ? 'health_probe_deadline_exceeded'
              : 'health_probe_silent_eof',
            retryable: false,
          },
          succeeded: false,
        }
      } finally {
        let cleanupTimer: ReturnType<typeof setTimeout> | undefined
        const settled = await Promise.race([
          Promise.resolve(iterator.return?.()).then(settledTrue, settledTrue),
          new Promise<false>(resolve => {
            cleanupTimer = setTimeout(() => resolve(false), 5_000)
          }),
        ])
        if (cleanupTimer) clearTimeout(cleanupTimer)
        if (!settled) forceClose?.()
      }
    },
  )
  return {
    async *run(request: AiIntegrationRunRequest): AsyncIterable<AiRunEvent> {
      let profile: Readonly<AiResolvedRunProfile>
      try {
        profile = await options.profileResolver.resolve(request.type)
      } catch (error) {
        if (
          error instanceof AiRunProfileResolutionError &&
          error.code === 'profile_blocked' &&
          error.identity
        ) {
          try {
            await options.telemetry?.emit({
              ...error.identity,
              adapterVersion: error.adapterVersion ?? 'unresolved',
              applicationRunId: request.context.applicationRunId,
              correlationId: request.context.correlationId,
              name: 'ai_alarm_active_profile_blocked',
              requestId:
                request.context.requestId ?? request.context.correlationId,
              runType: request.type,
            })
          } catch {
            // Alarm transport failure must not replace the safe profile error.
          }
        }
        throw error
      }
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
      let forceCloseAttempt: (() => void) | undefined
      const coordinated = options.runCoordinator.coordinate(
        {
          adapterVersion: profile.adapterVersion,
          abortSignal: request.context.abortSignal,
          applicationRunId: request.context.applicationRunId,
          correlationId: request.context.correlationId,
          identity,
          limits: profile.limits,
          profile: profile.runtime,
          requestId: request.context.requestId ?? request.context.correlationId,
          runType: request.type,
        },
        (_attempt, abortSignal, deadlineAt) =>
          runInAdapterConfigurationScope(
            adapter,
            profile,
            request,
            identity,
            prepared,
            {
              abortSignal,
              deadlineAt,
            },
            context => {
              forceCloseAttempt = () =>
                adapter.forceClose(context.externalRunId)
            },
          ),
        () => forceCloseAttempt?.(),
      )
      for await (const event of coordinated) {
        if (event.type === 'analysis_delta' || event.type === 'output_delta') {
          quarantinedText.push(event.delta)
          continue
        }
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

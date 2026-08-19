import { randomUUID } from 'node:crypto'
import type {
  AiRunEvent,
  AiRunFailure,
  AiRunIdentity,
  AiRunLimits,
  AiRunType,
  AiRunUsage,
} from './run-contracts'

const CANCELLATION_GRACE_MS = 5_000
const DEFAULT_LEASE_MS = 30_000
const DEFAULT_POLL_MS = 100

export interface AiRunCoordinationProfile {
  inactivityTimeBudgetMs: number
  queueCapacity: number
  totalTimeBudgetMs: number
}

export interface AiCoordinatedRunRequest {
  abortSignal: AbortSignal
  adapterVersion: string
  applicationRunId: string
  identity: AiRunIdentity
  limits: AiRunLimits
  profile: AiRunCoordinationProfile
  runType: AiRunType
}

export type AiRunAdmissionResult =
  | { status: 'queued' }
  | { retryAfterSeconds: number; status: 'queue_full' }
  | { retryAfterSeconds?: number; status: 'breaker_open' }

export type AiRunAcquireResult =
  | { activeConcurrency?: number; queueDepth?: number; status: 'acquired' }
  | {
      retryAfterSeconds?: number
      status: 'breaker_open' | 'expired' | 'waiting'
    }

export interface AiRunCoordinationStore {
  acquire(input: {
    applicationRunId: string
    leaseDurationMs: number
    leaseOwnerId: string
  }): Promise<AiRunAcquireResult>
  enqueue(input: {
    applicationRunId: string
    identity: AiRunIdentity
    queueCapacity: number
    totalDeadlineAt: Date
  }): Promise<AiRunAdmissionResult>
  finish(input: {
    applicationRunId: string
    failure?: AiRunFailure
    outcome: 'cancelled' | 'completed' | 'failed'
  }): Promise<{ breakerOpened: boolean } | undefined>
  renew(input: {
    applicationRunId: string
    leaseDurationMs: number
    leaseOwnerId: string
  }): Promise<boolean>
  requeueForRetry(input: {
    applicationRunId: string
    notBefore: Date
  }): Promise<void>
}

export type AiRunTelemetryName =
  | 'ai_alarm_authentication_failed'
  | 'ai_alarm_breaker_opened'
  | 'ai_alarm_active_profile_blocked'
  | 'ai_attempt_terminal'
  | 'ai_run_started'
  | 'ai_run_terminal'

export interface AiRunTelemetryEvent {
  activeConcurrency?: number
  adapterVersion: string
  aiConnectionId: string
  aiConnectionModelRevisionId: string
  aiRunProfileRevisionId: string
  applicationRunId: string
  attempt?: number
  cancellationReason?: string
  durationMs?: number
  failureCategory?: AiRunFailure['category']
  name: AiRunTelemetryName
  outcome?: 'cancelled' | 'completed' | 'failed'
  queueDepth?: number
  queueWaitMs?: number
  retryCount?: number
  runType: AiRunType
  timeToFirstAnalysisDeltaMs?: number
  timeToFirstDeltaMs?: number
  timeToFirstOutputDeltaMs?: number
  usage?: AiRunUsage
}

export interface AiRunTelemetry {
  emit(event: Readonly<AiRunTelemetryEvent>): void | Promise<void>
}

export interface AiRunCoordinator {
  coordinate(
    request: Readonly<AiCoordinatedRunRequest>,
    executeAttempt: (
      attempt: number,
      abortSignal: AbortSignal,
      totalDeadlineAt: string,
    ) => AsyncIterable<AiRunEvent>,
  ): AsyncIterable<AiRunEvent>
}

interface CreateAiRunCoordinatorOptions {
  coordination: AiRunCoordinationStore
  delay?: (milliseconds: number, signal: AbortSignal) => Promise<void>
  leaseOwnerId?: string
  now?: () => number
  pollIntervalMs?: number
  random?: () => number
  telemetry?: AiRunTelemetry
}

function failure(
  identity: AiRunIdentity,
  category: AiRunFailure['category'],
  diagnosticCode: string,
  retryable: boolean,
  retryAfterSeconds?: number,
): Extract<AiRunEvent, { type: 'failed' }> {
  return {
    failure: {
      category,
      diagnosticCode,
      ...(retryAfterSeconds ? { retryAfterSeconds } : {}),
      retryable,
    },
    identity,
    type: 'failed',
  }
}

function cancellation(identity: AiRunIdentity): AiRunEvent {
  return { identity, reason: 'application_cancelled', type: 'cancelled' }
}

function terminal(event: AiRunEvent): boolean {
  return (
    event.type === 'cancelled' ||
    event.type === 'completed' ||
    event.type === 'failed'
  )
}

function terminalOutcome(
  event: AiRunEvent,
): 'cancelled' | 'completed' | 'failed' {
  return terminal(event)
    ? (event.type as 'cancelled' | 'completed' | 'failed')
    : 'failed'
}

function defaultDelay(
  milliseconds: number,
  signal: AbortSignal,
): Promise<void> {
  return new Promise(resolve => {
    if (signal.aborted) return resolve()
    const finish = (): void => {
      clearTimeout(timer)
      signal.removeEventListener('abort', finish)
      resolve()
    }
    const timer = setTimeout(finish, milliseconds)
    signal.addEventListener('abort', finish, { once: true })
  })
}

async function settleWithinGrace(promise: Promise<unknown>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  await Promise.race([
    promise.catch(() => undefined),
    new Promise<void>(resolve => {
      timer = setTimeout(resolve, CANCELLATION_GRACE_MS)
    }),
  ])
  if (timer) clearTimeout(timer)
}

function outputTokenCount(event: AiRunEvent): number | null {
  if (event.type !== 'completed') return null
  const metric = event.usage.outputTokens
  return metric.status === 'reported' || metric.status === 'calculated'
    ? metric.value
    : null
}

function retainedEventBytes(event: AiRunEvent): number {
  const encoder = new TextEncoder()
  if (event.type === 'analysis_delta' || event.type === 'output_delta') {
    return encoder.encode(event.delta).byteLength
  }
  if (event.type === 'completed') {
    return (
      encoder.encode(event.rawOutput).byteLength +
      encoder.encode(event.analysis ?? '').byteLength
    )
  }
  return 0
}

function completedOutputBytes(
  event: Extract<AiRunEvent, { type: 'completed' }>,
): number {
  return new TextEncoder().encode(event.rawOutput).byteLength
}

function mayRetry(
  event: AiRunEvent,
  sawDelta: boolean,
  attempt: number,
): boolean {
  if (
    attempt !== 1 ||
    sawDelta ||
    event.type !== 'failed' ||
    !event.failure.retryable
  ) {
    return false
  }
  return (
    event.failure.retryDisposition === 'safe_before_acceptance' ||
    event.failure.retryDisposition === 'explicit_retryable_status' ||
    event.failure.retryDisposition === 'idempotent'
  )
}

function retryDelayMs(
  event: Extract<AiRunEvent, { type: 'failed' }>,
  random: () => number,
): number {
  return event.failure.retryAfterSeconds
    ? event.failure.retryAfterSeconds * 1_000
    : 1_000 + Math.floor(random() * 2_001)
}

export function createAiRunCoordinator(
  options: CreateAiRunCoordinatorOptions,
): AiRunCoordinator {
  const now = options.now ?? Date.now
  const delay = options.delay ?? defaultDelay
  const random = options.random ?? Math.random
  const leaseOwnerId = options.leaseOwnerId ?? randomUUID()
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_MS

  return {
    async *coordinate(request, executeAttempt): AsyncIterable<AiRunEvent> {
      const startedAt = now()
      const totalDeadline = startedAt + request.profile.totalTimeBudgetMs
      const totalDeadlineAt = new Date(totalDeadline)
      const controller = new AbortController()
      const onAbort = (): void => controller.abort()
      request.abortSignal.addEventListener('abort', onAbort, { once: true })
      if (request.abortSignal.aborted) controller.abort()
      let finished = false
      let finalEvent: AiRunEvent | undefined
      const emit = async (event: AiRunTelemetryEvent): Promise<void> => {
        try {
          await options.telemetry?.emit(Object.freeze(event))
        } catch {
          // Observability must remain content-free and cannot change run outcome.
        }
      }
      const telemetryBase = {
        adapterVersion: request.adapterVersion,
        aiConnectionId: request.identity.aiConnectionId,
        aiConnectionModelRevisionId:
          request.identity.aiConnectionModelRevisionId,
        aiRunProfileRevisionId: request.identity.aiRunProfileRevisionId,
        applicationRunId: request.applicationRunId,
        runType: request.runType,
      }

      await emit({ ...telemetryBase, name: 'ai_run_started' })
      let lastAcquisition:
        | Extract<AiRunAcquireResult, { status: 'acquired' }>
        | undefined
      let queueWaitMs: number | undefined
      let attemptsRun = 0
      try {
        const admission = await options.coordination.enqueue({
          applicationRunId: request.applicationRunId,
          identity: request.identity,
          queueCapacity: request.profile.queueCapacity,
          totalDeadlineAt,
        })
        if (admission.status !== 'queued') {
          finalEvent = failure(
            request.identity,
            admission.status === 'queue_full'
              ? 'rate_limited'
              : 'connection_unavailable',
            admission.status,
            admission.status === 'queue_full',
            admission.retryAfterSeconds,
          )
          yield finalEvent
          return
        }

        for (let attempt = 1; attempt <= 2; attempt += 1) {
          let acquired = false
          while (!controller.signal.aborted && now() < totalDeadline) {
            const result = await options.coordination.acquire({
              applicationRunId: request.applicationRunId,
              leaseDurationMs: DEFAULT_LEASE_MS,
              leaseOwnerId,
            })
            if (result.status === 'acquired') {
              acquired = true
              lastAcquisition = result
              queueWaitMs ??= Math.max(0, now() - startedAt)
              break
            }
            if (result.status === 'breaker_open') {
              finalEvent = failure(
                request.identity,
                'connection_unavailable',
                'circuit_breaker_open',
                Boolean(result.retryAfterSeconds),
                result.retryAfterSeconds,
              )
              yield finalEvent
              return
            }
            if (result.status === 'expired') break
            await delay(
              Math.min(pollIntervalMs, totalDeadline - now()),
              controller.signal,
            )
          }
          if (!acquired) {
            finalEvent = controller.signal.aborted
              ? cancellation(request.identity)
              : failure(
                  request.identity,
                  'deadline_exceeded',
                  'total_budget_exceeded',
                  true,
                )
            yield finalEvent
            return
          }

          const attemptController = new AbortController()
          const abortAttempt = (): void => attemptController.abort()
          controller.signal.addEventListener('abort', abortAttempt, {
            once: true,
          })
          let sawDelta = false
          attemptsRun = attempt
          let timeToFirstAnalysisDeltaMs: number | undefined
          let timeToFirstDeltaMs: number | undefined
          let timeToFirstOutputDeltaMs: number | undefined
          let retainedBytes = 0
          let outputBytes = 0
          let attemptTerminal: AiRunEvent | undefined
          let leaseLost = false
          let idleDeadline = Math.min(
            totalDeadline,
            now() + request.profile.inactivityTimeBudgetMs,
          )
          const iterator = executeAttempt(
            attempt,
            attemptController.signal,
            totalDeadlineAt.toISOString(),
          )[Symbol.asyncIterator]()
          const leaseRenewal = setInterval(() => {
            void options.coordination
              .renew({
                applicationRunId: request.applicationRunId,
                leaseDurationMs: DEFAULT_LEASE_MS,
                leaseOwnerId,
              })
              .then(renewed => {
                if (!renewed) {
                  leaseLost = true
                  attemptController.abort()
                }
              })
              .catch(() => {
                leaseLost = true
                attemptController.abort()
              })
          }, DEFAULT_LEASE_MS / 3)
          try {
            while (!attemptTerminal) {
              if (controller.signal.aborted) {
                attemptController.abort()
                attemptTerminal = cancellation(request.identity)
                break
              }
              const remaining = Math.min(totalDeadline, idleDeadline) - now()
              if (remaining <= 0) {
                attemptController.abort()
                attemptTerminal = failure(
                  request.identity,
                  'deadline_exceeded',
                  now() >= totalDeadline
                    ? 'total_budget_exceeded'
                    : 'inactivity_budget_exceeded',
                  true,
                )
                break
              }
              let timer: ReturnType<typeof setTimeout> | undefined
              let resolveAbort = (): void => undefined
              const abort = new Promise<{ kind: 'abort' }>(resolve => {
                resolveAbort = () => resolve({ kind: 'abort' })
                if (attemptController.signal.aborted) resolveAbort()
                else {
                  attemptController.signal.addEventListener(
                    'abort',
                    resolveAbort,
                    { once: true },
                  )
                }
              })
              const pull = await Promise.race([
                iterator
                  .next()
                  .then(result => ({ kind: 'event' as const, result })),
                new Promise<{ kind: 'budget' }>(resolve => {
                  timer = setTimeout(
                    () => resolve({ kind: 'budget' }),
                    remaining,
                  )
                }),
                abort,
              ])
              if (timer) clearTimeout(timer)
              attemptController.signal.removeEventListener(
                'abort',
                resolveAbort,
              )
              if (pull.kind === 'abort') {
                attemptTerminal = leaseLost
                  ? failure(
                      request.identity,
                      'connection_unavailable',
                      'coordination_lease_lost',
                      true,
                    )
                  : cancellation(request.identity)
                break
              }
              if (pull.kind === 'budget') {
                attemptController.abort()
                attemptTerminal = failure(
                  request.identity,
                  'deadline_exceeded',
                  now() >= totalDeadline
                    ? 'total_budget_exceeded'
                    : 'inactivity_budget_exceeded',
                  true,
                )
                break
              }
              const result = pull.result
              if (result.done) {
                attemptController.abort()
                attemptTerminal = failure(
                  request.identity,
                  'invalid_response',
                  'silent_eof',
                  false,
                )
                break
              }
              const event = result.value
              if (event.type === 'heartbeat') {
                yield event
                continue
              }
              idleDeadline = Math.min(
                totalDeadline,
                now() + request.profile.inactivityTimeBudgetMs,
              )
              const bytes = retainedEventBytes(event)
              if (
                event.type === 'analysis_delta' ||
                event.type === 'output_delta'
              ) {
                timeToFirstDeltaMs ??= Math.max(0, now() - startedAt)
                if (event.type === 'analysis_delta') {
                  timeToFirstAnalysisDeltaMs ??= Math.max(0, now() - startedAt)
                } else {
                  timeToFirstOutputDeltaMs ??= Math.max(0, now() - startedAt)
                }
                sawDelta = true
                retainedBytes += bytes
                if (event.type === 'output_delta') outputBytes += bytes
                if (outputBytes > request.limits.maxOutputBytes) {
                  attemptController.abort()
                  attemptTerminal = failure(
                    request.identity,
                    'invalid_response',
                    'output_byte_limit_exceeded',
                    false,
                  )
                  break
                }
                if (retainedBytes > request.limits.maxRetainedMemoryBytes) {
                  attemptController.abort()
                  attemptTerminal = failure(
                    request.identity,
                    'invalid_response',
                    'retained_memory_limit_exceeded',
                    false,
                  )
                  break
                }
                yield event
                continue
              }
              if (event.type === 'completed') {
                const completedBytes = retainedEventBytes(event)
                const outputBytesAtCompletion = completedOutputBytes(event)
                const tokens = outputTokenCount(event)
                if (outputBytesAtCompletion > request.limits.maxOutputBytes) {
                  attemptController.abort()
                  attemptTerminal = failure(
                    request.identity,
                    'invalid_response',
                    'output_byte_limit_exceeded',
                    false,
                  )
                } else if (
                  completedBytes > request.limits.maxRetainedMemoryBytes
                ) {
                  attemptController.abort()
                  attemptTerminal = failure(
                    request.identity,
                    'invalid_response',
                    'retained_memory_limit_exceeded',
                    false,
                  )
                } else if (
                  tokens !== null &&
                  tokens > request.limits.maxOutputTokens
                ) {
                  attemptController.abort()
                  attemptTerminal = failure(
                    request.identity,
                    'invalid_response',
                    'output_token_limit_exceeded',
                    false,
                  )
                } else {
                  attemptTerminal = event
                }
              } else {
                attemptTerminal = event
              }
            }
          } finally {
            clearInterval(leaseRenewal)
            controller.signal.removeEventListener('abort', abortAttempt)
            if (attemptTerminal?.type !== 'completed') {
              attemptController.abort()
            }
            await settleWithinGrace(
              Promise.resolve().then(() => iterator.return?.()),
            )
          }

          const currentTerminal =
            attemptTerminal ??
            failure(request.identity, 'invalid_response', 'silent_eof', false)
          await emit({
            ...telemetryBase,
            attempt,
            failureCategory:
              currentTerminal.type === 'failed'
                ? currentTerminal.failure.category
                : undefined,
            name: 'ai_attempt_terminal',
            outcome: terminalOutcome(currentTerminal),
            timeToFirstAnalysisDeltaMs,
            timeToFirstDeltaMs,
            timeToFirstOutputDeltaMs,
            usage:
              currentTerminal.type === 'completed'
                ? currentTerminal.usage
                : undefined,
          })
          if (
            currentTerminal.type === 'failed' &&
            mayRetry(currentTerminal, sawDelta, attempt)
          ) {
            const waitMs = retryDelayMs(currentTerminal, random)
            const remainingAfterWait = totalDeadline - now() - waitMs
            const retryAfterNeedsFiveMinutes =
              currentTerminal.failure.retryAfterSeconds !== undefined
            if (
              remainingAfterWait > 0 &&
              (!retryAfterNeedsFiveMinutes || remainingAfterWait >= 300_000)
            ) {
              await options.coordination.requeueForRetry({
                applicationRunId: request.applicationRunId,
                notBefore: new Date(now() + waitMs),
              })
              await delay(waitMs, controller.signal)
              continue
            }
          }
          finalEvent = currentTerminal
          yield currentTerminal
          return
        }
      } catch {
        if (!finalEvent) {
          controller.abort()
          finalEvent = failure(
            request.identity,
            'adapter_failure',
            'run_coordination_failed',
            false,
          )
          yield finalEvent
        }
      } finally {
        request.abortSignal.removeEventListener('abort', onAbort)
        if (!finalEvent) {
          controller.abort()
          finalEvent = cancellation(request.identity)
        }
        if (!finished) {
          finished = true
          const outcome = terminalOutcome(finalEvent)
          let coordinationResult: { breakerOpened: boolean } | undefined
          try {
            coordinationResult = await options.coordination.finish({
              applicationRunId: request.applicationRunId,
              ...(finalEvent.type === 'failed'
                ? { failure: finalEvent.failure }
                : {}),
              outcome,
            })
          } catch {
            coordinationResult = undefined
          }
          if (
            finalEvent.type === 'failed' &&
            finalEvent.failure.category === 'authentication_failed'
          ) {
            await emit({
              ...telemetryBase,
              name: 'ai_alarm_authentication_failed',
            })
          }
          if (coordinationResult?.breakerOpened) {
            await emit({ ...telemetryBase, name: 'ai_alarm_breaker_opened' })
          }
          await emit({
            ...telemetryBase,
            activeConcurrency: lastAcquisition?.activeConcurrency,
            cancellationReason:
              finalEvent.type === 'cancelled' ? finalEvent.reason : undefined,
            durationMs: Math.max(0, now() - startedAt),
            failureCategory:
              finalEvent.type === 'failed'
                ? finalEvent.failure.category
                : undefined,
            name: 'ai_run_terminal',
            outcome,
            queueDepth: lastAcquisition?.queueDepth,
            queueWaitMs,
            retryCount: Math.max(0, attemptsRun - 1),
            usage:
              finalEvent.type === 'completed' ? finalEvent.usage : undefined,
          })
        }
      }
    },
  }
}

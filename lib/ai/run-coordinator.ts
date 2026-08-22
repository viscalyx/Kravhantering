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
const ADMINISTRATIVE_CANCELLATION_POLL_MS = 1_000

export type AiAdministrativeCancellationReason =
  | 'connection_retired'
  | 'connection_suspended'
  | 'profile_suspended'

export interface AiAdministrativeCancellationRequest {
  reason: AiAdministrativeCancellationReason
  requestedAt: Date
}

export interface AiRunCoordinationProfile {
  inactivityTimeBudgetMs: number
  queueCapacity: number
  totalTimeBudgetMs: number
}

export interface AiCoordinatedRunRequest {
  abortSignal: AbortSignal
  adapterType: string
  adapterVersion: string
  applicationRunId: string
  correlationId: string
  identity: AiRunIdentity
  limits: AiRunLimits
  profile: AiRunCoordinationProfile
  requestId: string
  runType: AiRunType
}

export type AiRunAdmissionResult =
  | { status: 'queued' }
  | {
      activeConcurrency: number
      queueDepth: number
      retryAfterSeconds: number
      status: 'queue_full'
    }
  | { retryAfterSeconds?: number; status: 'breaker_open' }

export type AiRunAcquireResult =
  | { activeConcurrency?: number; queueDepth?: number; status: 'acquired' }
  | (AiAdministrativeCancellationRequest & { status: 'cancelled' })
  | {
      retryAfterSeconds?: number
      status: 'breaker_open' | 'expired' | 'waiting'
    }

export interface AiRecoveryProbeTarget {
  adapterType: string
  adapterVersion: string
  identity: AiRunIdentity
  inactivityTimeBudgetMs: number
  runType: AiRunType
  totalTimeBudgetMs: number
}

export interface AiHealthProbeResult {
  failure?: AiRunFailure
  succeeded: boolean
  usage?: AiRunUsage
}

export interface AiRecoveryProbeLeaseInput {
  identity: AiRunIdentity
  leaseDurationMs: number
  leaseOwnerId: string
  modelRevisionId: string
  probeRunId: string
}

export interface AiManualRecoveryProbeAcquisition {
  breakerStatus: NonNullable<AiOperationalStateTransition['breakerStatus']>
  healthStatus: NonNullable<AiOperationalStateTransition['healthStatus']>
}

export interface AiRecoveryProbeResultInput {
  failure?: AiRunFailure
  leaseOwnerId: string
  modelRevisionId: string
  probeRunId: string
  succeeded: boolean
}

export interface AiOperationalStateTransition {
  breakerOpened: boolean
  breakerStatus?: 'closed' | 'half_open' | 'open'
  healthStateChanged: boolean
  healthStatus?: 'degraded' | 'healthy' | 'unavailable' | 'unknown'
}

export interface AiRunCoordinationStore {
  abandon(input: {
    applicationRunId: string
    fencingToken: string
  }): Promise<void>
  acquire(input: {
    applicationRunId: string
    fencingToken: string
    leaseDurationMs: number
    leaseOwnerId: string
  }): Promise<AiRunAcquireResult>
  acquireManualRecoveryProbe(
    input: AiRecoveryProbeLeaseInput,
  ): Promise<AiManualRecoveryProbeAcquisition | null>
  acquireRecoveryProbe(input: AiRecoveryProbeLeaseInput): Promise<boolean>
  cancellationRequested?(input: {
    applicationRunId: string
    fencingToken: string
    leaseOwnerId?: string
  }): Promise<AiAdministrativeCancellationRequest | null>
  enqueue(input: {
    applicationRunId: string
    fencingToken: string
    identity: AiRunIdentity
    queueCapacity: number
    totalDeadlineAt: Date
  }): Promise<AiRunAdmissionResult>
  finish(input: {
    applicationRunId: string
    fencingToken: string
    failure?: AiRunFailure
    leaseOwnerId: string
    outcome: 'cancelled' | 'completed' | 'failed'
  }): Promise<AiOperationalStateTransition | undefined>
  finishRecoveryProbe(
    input: AiRecoveryProbeResultInput,
  ): Promise<AiOperationalStateTransition | undefined>
  listDueRecoveryProbes(limit: number): Promise<AiRecoveryProbeTarget[]>
  renew(input: {
    applicationRunId: string
    fencingToken: string
    leaseDurationMs: number
    leaseOwnerId: string
  }): Promise<boolean>
  requeueForRetry(input: {
    applicationRunId: string
    fencingToken: string
    leaseOwnerId: string
    notBefore: Date
  }): Promise<'applied' | 'lease_lost'>
}

export type AiRunTelemetryName =
  | 'admin_health_check'
  | 'ai_alarm_authentication_failed'
  | 'ai_alarm_breaker_opened'
  | 'ai_alarm_active_profile_blocked'
  | 'ai_attempt_terminal'
  | 'ai_health_probe_started'
  | 'ai_health_probe_terminal'
  | 'ai_health_state_changed'
  | 'ai_run_started'
  | 'ai_run_terminal'

export interface AiRunTelemetryEvent {
  activeConcurrency?: number
  actorId?: string
  adapterType: string
  adapterVersion: string
  aiConnectionId: string
  aiConnectionModelRevisionId: string
  aiRunProfileConfigurationVersion: number
  aiRunProfileId: string
  applicationRunId: string
  attempt?: number
  breakerStatus?: AiOperationalStateTransition['breakerStatus']
  cancellationReason?: string
  correlationId: string
  durationMs?: number
  failureCategory?: AiRunFailure['category']
  healthStatus?: AiOperationalStateTransition['healthStatus']
  name: AiRunTelemetryName
  outcome?: 'cancelled' | 'completed' | 'failed'
  probeKind?: 'automatic' | 'manual'
  queueDepth?: number
  queueWaitMs?: number
  requestId: string
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

export interface AiCompletedRunDecisionContext {
  abortSignal: AbortSignal
  totalDeadlineAt: string
}

export interface AiRunCoordinator {
  coordinate(
    request: Readonly<AiCoordinatedRunRequest>,
    executeAttempt: (
      attempt: number,
      abortSignal: AbortSignal,
      totalDeadlineAt: string,
    ) => AsyncIterable<AiRunEvent>,
    forceCloseAttempt: (applicationRunId: string) => void,
    decideCompleted?: (
      event: Readonly<Extract<AiRunEvent, { type: 'completed' }>>,
      attempt: number,
      context: Readonly<AiCompletedRunDecisionContext>,
    ) => Promise<
      Readonly<Extract<AiRunEvent, { type: 'completed' | 'failed' }>>
    >,
  ): AsyncIterable<AiRunEvent>
  runDueRecoveryProbes(
    executeProbe: (
      target: Readonly<AiRecoveryProbeTarget>,
      probeRunId: string,
      abortSignal: AbortSignal,
    ) => Promise<AiHealthProbeResult>,
  ): Promise<void>
  runManualHealthProbe(
    target: Readonly<AiRecoveryProbeTarget>,
    actorId: string,
    executeProbe: (
      target: Readonly<AiRecoveryProbeTarget>,
      probeRunId: string,
      abortSignal: AbortSignal,
    ) => Promise<AiHealthProbeResult>,
  ): Promise<AiHealthProbeResult>
  startAutomaticRecovery(
    executeProbe: (
      target: Readonly<AiRecoveryProbeTarget>,
      probeRunId: string,
      abortSignal: AbortSignal,
    ) => Promise<AiHealthProbeResult>,
  ): () => void
}

interface CreateAiRunCoordinatorOptions {
  coordination: AiRunCoordinationStore
  delay?: (milliseconds: number, signal: AbortSignal) => Promise<void>
  leaseOwnerId?: string
  now?: () => number
  pollIntervalMs?: number
  random?: () => number
  recoveryPollIntervalMs?: number
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

async function completionDecisionWithinBudget(
  decide: () => Promise<
    Readonly<Extract<AiRunEvent, { type: 'completed' | 'failed' }>>
  >,
  abortSignal: AbortSignal,
  remainingMs: number,
): Promise<
  | { kind: 'aborted' }
  | { kind: 'deadline' }
  | {
      event: Readonly<Extract<AiRunEvent, { type: 'completed' | 'failed' }>>
      kind: 'decided'
    }
> {
  if (abortSignal.aborted) return { kind: 'aborted' }
  if (remainingMs <= 0) return { kind: 'deadline' }
  let active = true
  let abortSettled = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let onAbort = (): void => undefined
  const aborted = new Promise<{ kind: 'aborted' }>(resolve => {
    onAbort = () => {
      if (!active || abortSettled) return
      abortSettled = true
      resolve({ kind: 'aborted' })
    }
    abortSignal.addEventListener('abort', onAbort, { once: true })
    if (abortSignal.aborted) onAbort()
  })
  const deadline = new Promise<{ kind: 'deadline' }>(resolve => {
    timer = setTimeout(() => {
      if (active) resolve({ kind: 'deadline' })
    }, remainingMs)
  })
  try {
    const decision = decide()
    return await Promise.race([
      decision.then(event => ({ event, kind: 'decided' as const })),
      aborted,
      deadline,
    ])
  } finally {
    active = false
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
    abortSignal.removeEventListener('abort', onAbort)
    onAbort = () => undefined
  }
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

async function settleWithinGrace(
  promise: Promise<unknown>,
  forceClose: () => void,
  graceMs = CANCELLATION_GRACE_MS,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const settled = await Promise.race([
    promise.then(
      () => true,
      () => true,
    ),
    new Promise<false>(resolve => {
      timer = setTimeout(() => resolve(false), Math.max(0, graceMs))
    }),
  ])
  if (timer) clearTimeout(timer)
  if (!settled) forceClose()
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
  if (
    event.failure.category === 'authentication_failed' ||
    event.failure.category === 'deadline_exceeded' ||
    event.failure.category === 'invalid_response' ||
    event.failure.category === 'capability_mismatch'
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
  const recoveryPollIntervalMs = options.recoveryPollIntervalMs ?? 60_000

  const emit = async (event: AiRunTelemetryEvent): Promise<void> => {
    try {
      await options.telemetry?.emit(Object.freeze(event))
    } catch {
      // Observability must remain content-free and cannot change run outcome.
    }
  }

  const runDueRecoveryProbes: AiRunCoordinator['runDueRecoveryProbes'] =
    async executeProbe => {
      const targets = await options.coordination.listDueRecoveryProbes(10)
      for (const target of targets) {
        const probeRunId = randomUUID()
        const acquired = await options.coordination.acquireRecoveryProbe({
          identity: target.identity,
          leaseDurationMs: target.totalTimeBudgetMs + CANCELLATION_GRACE_MS,
          leaseOwnerId,
          modelRevisionId: target.identity.aiConnectionModelRevisionId,
          probeRunId,
        })
        if (!acquired) continue
        const startedAt = now()
        const telemetryBase = {
          adapterType: target.adapterType,
          adapterVersion: target.adapterVersion,
          aiConnectionId: target.identity.aiConnectionId,
          aiConnectionModelRevisionId:
            target.identity.aiConnectionModelRevisionId,
          aiRunProfileConfigurationVersion:
            target.identity.aiRunProfileConfigurationVersion,
          aiRunProfileId: target.identity.aiRunProfileId,
          applicationRunId: probeRunId,
          correlationId: probeRunId,
          probeKind: 'automatic' as const,
          requestId: probeRunId,
          runType: target.runType,
        }
        await emit({ ...telemetryBase, name: 'ai_health_probe_started' })
        await emit({
          ...telemetryBase,
          breakerStatus: 'half_open',
          healthStatus: 'unavailable',
          name: 'ai_health_state_changed',
        })
        const controller = new AbortController()
        const timeout = setTimeout(
          () => controller.abort(),
          target.totalTimeBudgetMs,
        )
        let result: AiHealthProbeResult
        try {
          result = await executeProbe(target, probeRunId, controller.signal)
        } catch {
          result = {
            failure: {
              category: 'adapter_failure',
              diagnosticCode: 'automatic_health_probe_failed',
              retryable: false,
            },
            succeeded: false,
          }
        } finally {
          clearTimeout(timeout)
        }
        let transition: AiOperationalStateTransition | undefined
        try {
          transition = await options.coordination.finishRecoveryProbe({
            ...(result.failure ? { failure: result.failure } : {}),
            leaseOwnerId,
            modelRevisionId: target.identity.aiConnectionModelRevisionId,
            probeRunId,
            succeeded: result.succeeded,
          })
        } finally {
          await emit({
            ...telemetryBase,
            durationMs: Math.max(0, now() - startedAt),
            failureCategory: result.failure?.category,
            name: 'ai_health_probe_terminal',
            outcome: result.succeeded ? 'completed' : 'failed',
            usage: result.usage,
          })
        }
        if (transition?.breakerOpened) {
          await emit({ ...telemetryBase, name: 'ai_alarm_breaker_opened' })
        }
        if (transition?.healthStateChanged) {
          await emit({
            ...telemetryBase,
            breakerStatus: transition.breakerStatus,
            healthStatus: transition.healthStatus,
            name: 'ai_health_state_changed',
          })
        }
      }
    }

  const runManualHealthProbe: AiRunCoordinator['runManualHealthProbe'] = async (
    target,
    actorId,
    executeProbe,
  ) => {
    const probeRunId = randomUUID()
    const acquisition = await options.coordination.acquireManualRecoveryProbe({
      identity: target.identity,
      leaseDurationMs: target.totalTimeBudgetMs + CANCELLATION_GRACE_MS,
      leaseOwnerId,
      modelRevisionId: target.identity.aiConnectionModelRevisionId,
      probeRunId,
    })
    if (!acquisition) {
      return {
        failure: {
          category: 'connection_unavailable',
          diagnosticCode: 'manual_health_probe_unavailable',
          retryable: false,
        },
        succeeded: false,
      }
    }
    const startedAt = now()
    const telemetryBase = {
      actorId,
      adapterType: target.adapterType,
      adapterVersion: target.adapterVersion,
      aiConnectionId: target.identity.aiConnectionId,
      aiConnectionModelRevisionId: target.identity.aiConnectionModelRevisionId,
      aiRunProfileConfigurationVersion:
        target.identity.aiRunProfileConfigurationVersion,
      aiRunProfileId: target.identity.aiRunProfileId,
      applicationRunId: probeRunId,
      correlationId: probeRunId,
      probeKind: 'manual' as const,
      requestId: probeRunId,
      runType: target.runType,
    }
    await emit({
      ...telemetryBase,
      breakerStatus: acquisition.breakerStatus,
      healthStatus: acquisition.healthStatus,
      name: 'ai_health_probe_started',
    })
    const controller = new AbortController()
    const timeout = setTimeout(
      () => controller.abort(),
      target.totalTimeBudgetMs,
    )
    let result: AiHealthProbeResult
    try {
      result = await executeProbe(target, probeRunId, controller.signal)
    } catch {
      result = {
        failure: {
          category: 'adapter_failure',
          diagnosticCode: 'manual_health_probe_failed',
          retryable: false,
        },
        succeeded: false,
      }
    } finally {
      clearTimeout(timeout)
    }
    const transition = await options.coordination.finishRecoveryProbe({
      ...(result.failure ? { failure: result.failure } : {}),
      leaseOwnerId,
      modelRevisionId: target.identity.aiConnectionModelRevisionId,
      probeRunId,
      succeeded: result.succeeded,
    })
    await emit({
      ...telemetryBase,
      durationMs: Math.max(0, now() - startedAt),
      failureCategory: result.failure?.category,
      name: 'admin_health_check',
      outcome: result.succeeded ? 'completed' : 'failed',
      usage: result.usage,
    })
    if (transition?.breakerOpened) {
      await emit({ ...telemetryBase, name: 'ai_alarm_breaker_opened' })
    }
    if (transition?.healthStateChanged) {
      await emit({
        ...telemetryBase,
        breakerStatus: transition.breakerStatus,
        healthStatus: transition.healthStatus,
        name: 'ai_health_state_changed',
      })
    }
    return result
  }

  return {
    async *coordinate(
      request,
      executeAttempt,
      forceCloseAttempt,
      decideCompleted,
    ): AsyncIterable<AiRunEvent> {
      const startedAt = now()
      const fencingToken = randomUUID()
      const totalDeadline = startedAt + request.profile.totalTimeBudgetMs
      const totalDeadlineAt = new Date(totalDeadline)
      const controller = new AbortController()
      const onAbort = (): void => controller.abort()
      request.abortSignal.addEventListener('abort', onAbort, { once: true })
      if (request.abortSignal.aborted) controller.abort()
      let finished = false
      let coordinationState:
        | 'lost'
        | 'none'
        | 'queued'
        | 'retry_wait'
        | 'running' = 'none'
      let finalEvent: AiRunEvent | undefined
      let administrativeCancellationReason:
        | AiAdministrativeCancellationReason
        | undefined
      let administrativeCancellationRequestedAt: Date | undefined
      const telemetryBase = {
        adapterType: request.adapterType,
        adapterVersion: request.adapterVersion,
        aiConnectionId: request.identity.aiConnectionId,
        aiConnectionModelRevisionId:
          request.identity.aiConnectionModelRevisionId,
        aiRunProfileConfigurationVersion:
          request.identity.aiRunProfileConfigurationVersion,
        aiRunProfileId: request.identity.aiRunProfileId,
        applicationRunId: request.applicationRunId,
        correlationId: request.correlationId,
        requestId: request.requestId,
        runType: request.runType,
      }

      await emit({ ...telemetryBase, name: 'ai_run_started' })
      let observedCapacity:
        | { activeConcurrency?: number; queueDepth?: number }
        | undefined
      let queueWaitMs: number | undefined
      let attemptsRun = 0
      try {
        const admission = await options.coordination.enqueue({
          applicationRunId: request.applicationRunId,
          fencingToken,
          identity: request.identity,
          queueCapacity: request.profile.queueCapacity,
          totalDeadlineAt,
        })
        if (admission.status !== 'queued') {
          if (admission.status === 'queue_full') {
            observedCapacity = {
              activeConcurrency: admission.activeConcurrency,
              queueDepth: admission.queueDepth,
            }
          }
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
        coordinationState = 'queued'

        for (let attempt = 1; attempt <= 2; attempt += 1) {
          let acquired = false
          while (!controller.signal.aborted && now() < totalDeadline) {
            const result = await options.coordination.acquire({
              applicationRunId: request.applicationRunId,
              fencingToken,
              leaseDurationMs: DEFAULT_LEASE_MS,
              leaseOwnerId,
            })
            if (result.status === 'acquired') {
              acquired = true
              coordinationState = 'running'
              observedCapacity = result
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
            if (result.status === 'cancelled') {
              administrativeCancellationReason = result.reason
              administrativeCancellationRequestedAt = result.requestedAt
              finalEvent = cancellation(request.identity)
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
          let renewalActive = true
          let idleDeadline = Math.min(
            totalDeadline,
            now() + request.profile.inactivityTimeBudgetMs,
          )
          const iterator = executeAttempt(
            attempt,
            attemptController.signal,
            totalDeadlineAt.toISOString(),
          )[Symbol.asyncIterator]()
          const leaseHeartbeat = setInterval(() => {
            void Promise.all([
              options.coordination.renew({
                applicationRunId: request.applicationRunId,
                fencingToken,
                leaseDurationMs: DEFAULT_LEASE_MS,
                leaseOwnerId,
              }),
              options.coordination.cancellationRequested?.({
                applicationRunId: request.applicationRunId,
                fencingToken,
                leaseOwnerId,
              }) ?? Promise.resolve(null),
            ])
              .then(([renewed, cancellationRequest]) => {
                if (!renewalActive) return
                if (cancellationRequest) {
                  administrativeCancellationReason = cancellationRequest.reason
                  administrativeCancellationRequestedAt =
                    cancellationRequest.requestedAt
                  attemptController.abort()
                } else if (!renewed) {
                  leaseLost = true
                  coordinationState = 'lost'
                  attemptController.abort()
                }
              })
              .catch(() => {
                if (renewalActive) {
                  leaseLost = true
                  coordinationState = 'lost'
                  attemptController.abort()
                }
              })
          }, ADMINISTRATIVE_CANCELLATION_POLL_MS)
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
                attemptTerminal = administrativeCancellationReason
                  ? cancellation(request.identity)
                  : leaseLost
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
              idleDeadline = Math.min(
                totalDeadline,
                now() + request.profile.inactivityTimeBudgetMs,
              )
              if (event.type === 'heartbeat') {
                yield event
                continue
              }
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
                  if (!decideCompleted) {
                    attemptTerminal = event
                  } else {
                    const decision = await completionDecisionWithinBudget(
                      () =>
                        decideCompleted(event, attempt, {
                          abortSignal: attemptController.signal,
                          totalDeadlineAt: totalDeadlineAt.toISOString(),
                        }),
                      attemptController.signal,
                      totalDeadline - now(),
                    )
                    if (decision.kind === 'decided') {
                      attemptTerminal = decision.event
                    } else if (decision.kind === 'aborted') {
                      attemptTerminal = leaseLost
                        ? failure(
                            request.identity,
                            'connection_unavailable',
                            'coordination_lease_lost',
                            true,
                          )
                        : cancellation(request.identity)
                    } else {
                      attemptController.abort()
                      attemptTerminal = failure(
                        request.identity,
                        'deadline_exceeded',
                        'total_budget_exceeded',
                        true,
                      )
                    }
                  }
                }
              } else {
                attemptTerminal = event
              }
            }
          } finally {
            renewalActive = false
            clearInterval(leaseHeartbeat)
            controller.signal.removeEventListener('abort', abortAttempt)
            if (attemptTerminal?.type !== 'completed') {
              attemptController.abort()
            }
            await settleWithinGrace(
              Promise.resolve().then(() => iterator.return?.()),
              () => forceCloseAttempt(request.applicationRunId),
              administrativeCancellationRequestedAt
                ? administrativeCancellationRequestedAt.getTime() +
                    CANCELLATION_GRACE_MS -
                    now()
                : CANCELLATION_GRACE_MS,
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
              const requeueResult = await options.coordination.requeueForRetry({
                applicationRunId: request.applicationRunId,
                fencingToken,
                leaseOwnerId,
                notBefore: new Date(now() + waitMs),
              })
              if (requeueResult === 'lease_lost') {
                coordinationState = 'lost'
                finalEvent = failure(
                  request.identity,
                  'connection_unavailable',
                  'coordination_lease_lost',
                  true,
                )
                yield finalEvent
                return
              }
              coordinationState = 'retry_wait'
              let remainingRetryWaitMs = waitMs
              while (!controller.signal.aborted && remainingRetryWaitMs > 0) {
                const cancellationRequest =
                  await options.coordination.cancellationRequested?.({
                    applicationRunId: request.applicationRunId,
                    fencingToken,
                  })
                if (cancellationRequest) {
                  administrativeCancellationReason = cancellationRequest.reason
                  administrativeCancellationRequestedAt =
                    cancellationRequest.requestedAt
                  finalEvent = cancellation(request.identity)
                  yield finalEvent
                  return
                }
                const waitSliceMs = Math.min(
                  ADMINISTRATIVE_CANCELLATION_POLL_MS,
                  remainingRetryWaitMs,
                )
                await delay(waitSliceMs, controller.signal)
                remainingRetryWaitMs -= waitSliceMs
              }
              continue
            }
            if (retryAfterNeedsFiveMinutes) {
              finalEvent = failure(
                request.identity,
                'rate_limited',
                'retry_after_exceeds_remaining_budget',
                true,
                currentTerminal.failure.retryAfterSeconds,
              )
              yield finalEvent
              return
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
          let coordinationResult: AiOperationalStateTransition | undefined
          if (coordinationState === 'running') {
            try {
              coordinationResult = await options.coordination.finish({
                applicationRunId: request.applicationRunId,
                fencingToken,
                leaseOwnerId,
                ...(finalEvent.type === 'failed'
                  ? { failure: finalEvent.failure }
                  : {}),
                outcome,
              })
            } catch {
              coordinationResult = undefined
            }
          } else if (
            coordinationState === 'queued' ||
            coordinationState === 'retry_wait'
          ) {
            try {
              await options.coordination.abandon({
                applicationRunId: request.applicationRunId,
                fencingToken,
              })
            } catch {
              // Cleanup failure must not replace the application terminal.
            }
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
          if (coordinationResult?.healthStateChanged) {
            await emit({
              ...telemetryBase,
              healthStatus: coordinationResult.healthStatus,
              breakerStatus: coordinationResult.breakerStatus,
              name: 'ai_health_state_changed',
            })
          }
          await emit({
            ...telemetryBase,
            activeConcurrency: observedCapacity?.activeConcurrency,
            cancellationReason:
              finalEvent.type === 'cancelled'
                ? (administrativeCancellationReason ?? finalEvent.reason)
                : undefined,
            durationMs: Math.max(0, now() - startedAt),
            failureCategory:
              finalEvent.type === 'failed'
                ? finalEvent.failure.category
                : undefined,
            name: 'ai_run_terminal',
            outcome,
            queueDepth: observedCapacity?.queueDepth,
            queueWaitMs,
            retryCount: Math.max(0, attemptsRun - 1),
            usage:
              finalEvent.type === 'completed' ? finalEvent.usage : undefined,
          })
        }
      }
    },
    runDueRecoveryProbes,
    runManualHealthProbe,
    startAutomaticRecovery(executeProbe): () => void {
      let running = false
      const tick = (): void => {
        if (running) return
        running = true
        void runDueRecoveryProbes(executeProbe)
          .catch(() => undefined)
          .finally(() => {
            running = false
          })
      }
      tick()
      const interval = setInterval(tick, recoveryPollIntervalMs)
      interval.unref?.()
      return () => clearInterval(interval)
    },
  }
}

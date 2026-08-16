import { apiFetch } from '@/lib/http/api-fetch'
import type { RequirementDetailResponse } from '@/lib/requirements/types'
import type {
  SpecificationLocalRequirementDetail,
  SpecificationLocalRequirementKey,
} from '@/lib/specifications/local-requirement-detail'

export type RequirementDetailResource =
  | 'library-requirement'
  | 'specification-local-requirement'

export type RequirementDetailSurface =
  | 'requirements-library'
  | 'specification-left'
  | 'specification-right'

export interface RequirementDetailPrefetchContext {
  resource: RequirementDetailResource
  surface: RequirementDetailSurface
}

export type RequirementDetailPrefetchTrigger = 'focus' | 'pointer'

export interface RequirementDetailSpeculativeContext
  extends RequirementDetailPrefetchContext {
  trigger: RequirementDetailPrefetchTrigger
}

export interface DetailPrefetchIntentTarget
  extends RequirementDetailSpeculativeContext {
  key: string
}

export interface DetailPrefetchTarget extends RequirementDetailPrefetchContext {
  key: string
}

export type RequirementDetailPrefetchOutcome =
  | 'capacity-evicted-unused'
  | 'cleared-unused'
  | 'expired-unused'
  | 'failed-unused'
  | 'invalidated-unused'
  | 'page-disposed-unused'
  | 'used'

export class DetailFetchError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'DetailFetchError'
    this.status = status
  }
}

export type RequirementDetailPrefetchEvent =
  RequirementDetailPrefetchContext & {
    durationMs?: number
    key: string
    outcome?: RequirementDetailPrefetchOutcome
    prefetchId?: number
    timestamp: number
    trigger?: DetailPrefetchIntentTarget['trigger']
    type:
      | 'click-reused-in-flight'
      | 'click-reused-cache'
      | 'click-to-usable-content'
      | 'failed'
      | 'invalidated'
      | 'intent-to-click'
      | 'prefetch-started'
      | 'prefetch-outcome'
      | 'timer-cancelled'
      | 'timer-started'
      | 'unused'
  }

let requirementDetailPrefetchSequence = 0

const DETAIL_CACHE_MAX_COMPLETED_ENTRIES = 32
const DETAIL_CACHE_TTL_MS = 30_000
const DETAIL_REQUEST_TIMEOUT_MS = 30_000

interface PendingIntent {
  startedAt: number
  target: DetailPrefetchIntentTarget
  timer: ReturnType<typeof setTimeout>
}

interface DetailPrefetchIntentControllerOptions {
  onEvent?: (event: RequirementDetailPrefetchEvent) => void
}

export class DetailPrefetchIntentController {
  private readonly latestIntent = new Map<
    string,
    Pick<PendingIntent, 'startedAt' | 'target'>
  >()
  private readonly onEvent: NonNullable<
    DetailPrefetchIntentControllerOptions['onEvent']
  >
  private readonly pending = new Map<string, PendingIntent>()

  constructor(options: DetailPrefetchIntentControllerOptions = {}) {
    this.onEvent = options.onEvent ?? emitRequirementDetailPrefetchEvent
  }

  schedule(
    target: DetailPrefetchIntentTarget,
    prefetch: (target: DetailPrefetchIntentTarget) => void,
  ): void {
    const intentKey = intentTargetKey(target)
    if (this.pending.has(intentKey)) return

    const startedAt = performance.now()
    const timer = setTimeout(() => {
      this.pending.delete(intentKey)
      prefetch(target)
    }, 150)
    this.pending.set(intentKey, { startedAt, target, timer })
    this.latestIntent.set(intentKey, { startedAt, target })
    this.emit('timer-started', target)
  }

  cancel(target: DetailPrefetchIntentTarget): void {
    this.cancelPending(target)
    this.latestIntent.delete(intentTargetKey(target))
  }

  activate(target: DetailPrefetchTarget): void {
    const intents = (['pointer', 'focus'] as const)
      .flatMap(trigger => {
        const intentTarget = { ...target, trigger }
        const intent = this.latestIntent.get(intentTargetKey(intentTarget))
        return intent ? [intent] : []
      })
      .sort((left, right) => left.startedAt - right.startedAt)

    for (const trigger of ['pointer', 'focus'] as const) {
      const intentTarget = { ...target, trigger }
      this.cancelPending(intentTarget)
      this.latestIntent.delete(intentTargetKey(intentTarget))
    }

    const intent = intents[0]
    if (intent) {
      this.emit(
        'intent-to-click',
        intent.target,
        performance.now() - intent.startedAt,
      )
    }
  }

  dispose(): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
    }
    this.pending.clear()
    this.latestIntent.clear()
  }

  private cancelPending(target: DetailPrefetchIntentTarget): void {
    const intentKey = intentTargetKey(target)
    const pending = this.pending.get(intentKey)
    if (!pending) return
    clearTimeout(pending.timer)
    this.pending.delete(intentKey)
    this.emit('timer-cancelled', target, performance.now() - pending.startedAt)
  }

  private emit(
    type: RequirementDetailPrefetchEvent['type'],
    target: DetailPrefetchIntentTarget,
    durationMs?: number,
  ): void {
    this.onEvent({
      durationMs,
      key: target.key,
      resource: target.resource,
      surface: target.surface,
      timestamp: Date.now(),
      trigger: target.trigger,
      type,
    })
  }
}

function intentTargetKey(target: DetailPrefetchIntentTarget): string {
  return `${target.surface}:${target.resource}:${target.key}:${target.trigger}`
}

export function emitRequirementDetailPrefetchEvent(
  event: RequirementDetailPrefetchEvent,
): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent<RequirementDetailPrefetchEvent>(
      'krav:requirement-detail-prefetch',
      { detail: event },
    ),
  )
}

interface DetailResourceCacheOptions<Key, Value> {
  fetchDetail: (key: Key, signal: AbortSignal) => Promise<Value>
  keyOf: (key: Key) => string
  onEvent?: (event: RequirementDetailPrefetchEvent) => void
}

interface InFlightEntry<Value> {
  activatedAt: number | null
  controller: AbortController
  expiresAt: number | null
  expiryTimer: ReturnType<typeof setTimeout> | null
  lastUsed: number
  pendingTimer: ReturnType<typeof setTimeout> | null
  prefetchId: number | null
  prefetchOutcomeRecorded: boolean
  prefetchStartedAt: number | null
  promise: Promise<Value>
  startContext:
    | RequirementDetailPrefetchContext
    | RequirementDetailSpeculativeContext
  startedAsPrefetch: boolean
  state: 'fulfilled' | 'pending'
  used: boolean
}

export class DetailResourceCache<Key, Value> {
  private accessSequence = 0
  private readonly entries = new Map<string, InFlightEntry<Value>>()
  private readonly fetchDetail: DetailResourceCacheOptions<
    Key,
    Value
  >['fetchDetail']
  private readonly keyOf: DetailResourceCacheOptions<Key, Value>['keyOf']
  private readonly onEvent: NonNullable<
    DetailResourceCacheOptions<Key, Value>['onEvent']
  >
  constructor(options: DetailResourceCacheOptions<Key, Value>) {
    this.fetchDetail = options.fetchDetail
    this.keyOf = options.keyOf
    this.onEvent = options.onEvent ?? emitRequirementDetailPrefetchEvent
  }

  load(
    key: Key,
    mode: 'prefetch',
    context: RequirementDetailSpeculativeContext,
  ): Promise<Value>
  load(
    key: Key,
    mode: 'activate' | 'refresh',
    context: RequirementDetailPrefetchContext,
  ): Promise<Value>
  load(
    key: Key,
    mode: 'activate' | 'prefetch' | 'refresh',
    context:
      | RequirementDetailPrefetchContext
      | RequirementDetailSpeculativeContext,
  ): Promise<Value> {
    const cacheKey = this.keyOf(key)
    if (mode === 'refresh') {
      this.invalidate(key, context)
    }
    const existing = this.entries.get(cacheKey)
    if (existing) {
      if (
        existing.state === 'fulfilled' &&
        existing.expiresAt !== null &&
        existing.expiresAt <= performance.now()
      ) {
        if (existing.expiryTimer) clearTimeout(existing.expiryTimer)
        this.settlePrefetch(existing, cacheKey, 'expired-unused')
        this.entries.delete(cacheKey)
      } else {
        existing.lastUsed = ++this.accessSequence
        if (mode === 'activate') {
          existing.used = true
          existing.activatedAt = performance.now()
          if (existing.state === 'pending') {
            this.emit('click-reused-in-flight', cacheKey, context)
            this.settlePrefetch(existing, cacheKey, 'used')
            if (existing.startedAsPrefetch) {
              return existing.promise.catch(error => {
                if (isRetryableSpeculativeFailure(error)) {
                  return this.load(key, 'activate', context)
                }
                throw error
              })
            }
          } else {
            this.emit('click-reused-cache', cacheKey, context)
            this.settlePrefetch(existing, cacheKey, 'used')
          }
        }
        return existing.promise
      }
    }

    const controller = new AbortController()
    const prefetchId =
      mode === 'prefetch' ? ++requirementDetailPrefetchSequence : null
    const entry: InFlightEntry<Value> = {
      activatedAt: mode === 'activate' ? performance.now() : null,
      controller,
      expiresAt: null,
      expiryTimer: null,
      lastUsed: ++this.accessSequence,
      pendingTimer: null,
      promise: Promise.resolve(undefined as Value),
      prefetchId,
      prefetchOutcomeRecorded: false,
      prefetchStartedAt: mode === 'prefetch' ? performance.now() : null,
      startedAsPrefetch: mode === 'prefetch',
      startContext: context,
      state: 'pending',
      used: mode === 'activate' || mode === 'refresh',
    }
    if (prefetchId !== null) {
      this.emit('prefetch-started', cacheKey, context, { prefetchId })
    }
    entry.pendingTimer = setTimeout(() => {
      if (this.entries.get(cacheKey) !== entry || entry.state !== 'pending') {
        return
      }
      entry.pendingTimer = null
      this.settlePrefetch(entry, cacheKey, 'failed-unused')
      this.entries.delete(cacheKey)
      controller.abort()
      this.emit('failed', cacheKey, entry.startContext)
    }, DETAIL_REQUEST_TIMEOUT_MS)
    entry.promise = this.fetchDetail(key, controller.signal)
      .then(value => {
        if (entry.pendingTimer) {
          clearTimeout(entry.pendingTimer)
          entry.pendingTimer = null
        }
        if (this.entries.get(cacheKey) !== entry) {
          throw new DOMException('Detail request was invalidated', 'AbortError')
        }
        entry.expiresAt = performance.now() + DETAIL_CACHE_TTL_MS
        entry.state = 'fulfilled'
        entry.lastUsed = ++this.accessSequence
        entry.expiryTimer = setTimeout(() => {
          if (this.entries.get(cacheKey) !== entry) {
            return
          }
          this.entries.delete(cacheKey)
          if (entry.startedAsPrefetch && !entry.used) {
            this.settlePrefetch(entry, cacheKey, 'expired-unused')
          }
        }, DETAIL_CACHE_TTL_MS)
        this.enforceCompletedCapacity()
        return value
      })
      .catch(error => {
        if (entry.pendingTimer) {
          clearTimeout(entry.pendingTimer)
          entry.pendingTimer = null
        }
        if (error instanceof DetailFetchError && error.status === 401) {
          this.clear()
        } else if (this.entries.get(cacheKey) === entry) {
          this.settlePrefetch(entry, cacheKey, 'failed-unused')
          this.entries.delete(cacheKey)
        }
        if (!controller.signal.aborted) {
          this.emit('failed', cacheKey, entry.startContext)
        }
        throw error
      })
    this.entries.set(cacheKey, entry)
    return entry.promise
  }

  invalidate(key: Key, context: RequirementDetailPrefetchContext): void {
    const cacheKey = this.keyOf(key)
    const entry = this.entries.get(cacheKey)
    if (entry) {
      this.settlePrefetch(entry, cacheKey, 'invalidated-unused')
    }
    entry?.controller.abort()
    if (entry?.expiryTimer) clearTimeout(entry.expiryTimer)
    if (entry?.pendingTimer) clearTimeout(entry.pendingTimer)
    this.entries.delete(cacheKey)
    this.emit('invalidated', cacheKey, context)
  }

  markUsable(key: Key, context: RequirementDetailPrefetchContext): void {
    const entry = this.entries.get(this.keyOf(key))
    if (!entry || entry.activatedAt === null) return
    const activatedAt = entry.activatedAt
    entry.activatedAt = null
    this.emit('click-to-usable-content', this.keyOf(key), context, {
      durationMs: performance.now() - activatedAt,
    })
  }

  clear(outcome: RequirementDetailPrefetchOutcome = 'cleared-unused'): void {
    const entries = [...this.entries.entries()]
    this.entries.clear()
    for (const [key, entry] of entries) {
      this.settlePrefetch(entry, key, outcome)
      entry.controller.abort()
      if (entry.expiryTimer) clearTimeout(entry.expiryTimer)
      if (entry.pendingTimer) clearTimeout(entry.pendingTimer)
      this.emit('invalidated', key, entry.startContext)
    }
  }

  dispose(): void {
    this.clear('page-disposed-unused')
  }

  private enforceCompletedCapacity(): void {
    const completed = [...this.entries.entries()]
      .filter(([, entry]) => entry.state === 'fulfilled')
      .sort(([, left], [, right]) => left.lastUsed - right.lastUsed)

    for (const [key, entry] of completed.slice(
      0,
      -DETAIL_CACHE_MAX_COMPLETED_ENTRIES,
    )) {
      if (entry.expiryTimer) clearTimeout(entry.expiryTimer)
      this.entries.delete(key)
      if (entry.startedAsPrefetch && !entry.used) {
        this.settlePrefetch(entry, key, 'capacity-evicted-unused')
      }
    }
  }

  private emit(
    type: RequirementDetailPrefetchEvent['type'],
    key: string,
    context:
      | RequirementDetailPrefetchContext
      | RequirementDetailSpeculativeContext,
    detail: Pick<
      RequirementDetailPrefetchEvent,
      'durationMs' | 'outcome' | 'prefetchId'
    > = {},
  ): void {
    this.onEvent({
      ...context,
      ...detail,
      key,
      timestamp: Date.now(),
      type,
    })
  }

  private settlePrefetch(
    entry: InFlightEntry<Value>,
    key: string,
    outcome: RequirementDetailPrefetchOutcome,
  ): void {
    if (
      entry.prefetchId === null ||
      entry.prefetchOutcomeRecorded ||
      entry.prefetchStartedAt === null
    ) {
      return
    }
    entry.prefetchOutcomeRecorded = true
    const detail = {
      durationMs: performance.now() - entry.prefetchStartedAt,
      outcome,
      prefetchId: entry.prefetchId,
    }
    this.emit('prefetch-outcome', key, entry.startContext, detail)
    if (outcome !== 'used') {
      this.emit('unused', key, entry.startContext, detail)
    }
  }
}

function isRetryableSpeculativeFailure(error: unknown): boolean {
  return !(
    error instanceof DetailFetchError &&
    (error.status === 401 || error.status === 403 || error.status === 404)
  )
}

async function readDetailResponse<Value>(
  path: string,
  signal: AbortSignal,
): Promise<Value> {
  const response = await apiFetch(path, { signal })
  if (!response.ok) {
    throw new DetailFetchError(
      response.status,
      response.statusText || `Detail request failed (${response.status})`,
    )
  }
  return (await response.json()) as Value
}

export type LibraryRequirementDetailCache = DetailResourceCache<
  number,
  RequirementDetailResponse
>

export type SpecificationLocalRequirementDetailCache = DetailResourceCache<
  SpecificationLocalRequirementKey,
  SpecificationLocalRequirementDetail
>

export function createLibraryRequirementDetailCache(): LibraryRequirementDetailCache {
  return new DetailResourceCache<number, RequirementDetailResponse>({
    fetchDetail: (requirementId, signal) =>
      readDetailResponse<RequirementDetailResponse>(
        `/api/requirements/${requirementId}`,
        signal,
      ),
    keyOf: String,
  })
}

export function createSpecificationLocalRequirementDetailCache(): SpecificationLocalRequirementDetailCache {
  return new DetailResourceCache<
    SpecificationLocalRequirementKey,
    SpecificationLocalRequirementDetail
  >({
    fetchDetail: ({ localRequirementId, specificationId }, signal) =>
      readDetailResponse<SpecificationLocalRequirementDetail>(
        `/api/requirements-specifications/${specificationId}/local-requirements/${localRequirementId}`,
        signal,
      ),
    keyOf: ({ localRequirementId, specificationId }) =>
      `${specificationId}:${localRequirementId}`,
  })
}

import { randomUUID } from 'node:crypto'

export const AI_RUN_TYPES = [
  'generate_without_images',
  'generate_with_images',
  'repair_invalid_import_json',
] as const

export type AiRunType = (typeof AI_RUN_TYPES)[number]

export interface AiTextTaskContentPart {
  text: string
  type: 'text'
}

export interface AiImageTaskContentPart {
  data: Uint8Array
  mediaType: string
  type: 'image'
}

export type AiTaskContentPart = AiImageTaskContentPart | AiTextTaskContentPart

export interface AiTaskEnvelope {
  content: readonly AiTaskContentPart[]
  instructions: string
  /** Provider-compatible schema used only to steer generation. */
  responseSchema: Readonly<Record<string, unknown>>
  /** Canonical application contract used to approve completed output. */
  validationSchema: Readonly<Record<string, unknown>>
}

export interface AiRunTechnicalContext {
  abortSignal: AbortSignal
  applicationRunId: string
  correlationId: string
  deadlineAt: string
  requestId?: string
}

declare const aiExternalRunIdBrand: unique symbol
export type AiExternalRunId = string & {
  readonly [aiExternalRunIdBrand]: true
}

/** Adapter-safe context. Internal application and correlation IDs are absent. */
export interface AiAdapterRunContext {
  abortSignal: AbortSignal
  deadlineAt: string
  egress: AiEgressTransport
  externalRunId: AiExternalRunId
}

export interface AiEgressTransport {
  fetch(input: string, init: RequestInit): Promise<Response>
}

export interface AiCapabilitySelection {
  aiAnalysis: boolean
  cost: boolean
  imageInput: boolean
  jsonSchemaSteering: boolean
  streaming: boolean
  tokenUsage: boolean
  validatableJson: boolean
}

/** Server-owned minimum. Callers and adapter configuration cannot weaken it. */
export interface AiRequestPrivacyPolicy {
  allowDataCollection: false
  requireZeroDataRetention: true
}

export const AI_REQUEST_PRIVACY_MINIMUM: Readonly<AiRequestPrivacyPolicy> =
  Object.freeze({
    allowDataCollection: false,
    requireZeroDataRetention: true,
  })

export function satisfiesAiRequestPrivacyMinimum(
  value: unknown,
): value is AiRequestPrivacyPolicy {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Partial<AiRequestPrivacyPolicy>).allowDataCollection === false &&
    (value as Partial<AiRequestPrivacyPolicy>).requireZeroDataRetention === true
  )
}

export const AI_OPTIONAL_CAPABILITIES = [
  'streaming',
  'imageInput',
  'jsonSchemaSteering',
  'aiAnalysis',
  'tokenUsage',
  'cost',
  'validatableJson',
] as const satisfies readonly (keyof AiCapabilitySelection)[]

declare const aiStableIdBrand: unique symbol
type AiStableId<Kind extends string> = string & {
  readonly [aiStableIdBrand]: Kind
}

export type AiConnectionId = AiStableId<'ai_connection'>
export type AiConnectionModelRevisionId =
  AiStableId<'ai_connection_model_revision'>
export type AiRunProfileId = AiStableId<'ai_run_profile'>

export interface AiResolvedConnection {
  /** Adapter-owned, versioned configuration interpreted only by that adapter. */
  configuration: unknown
  id: AiConnectionId
}

export interface AiResolvedConnectionModelRevision {
  /** Adapter-owned, immutable model configuration for this exact revision. */
  configuration: unknown
  externalModelId: string
  id: AiConnectionModelRevisionId
  verifiedCapabilities: Readonly<AiCapabilitySelection>
}

export interface AiRunIdentity {
  aiConnectionId: AiConnectionId
  aiConnectionModelRevisionId: AiConnectionModelRevisionId
  aiRunProfileConfigurationVersion: number
  aiRunProfileId: AiRunProfileId
}

export interface AiConnectionAdapterRunRequest {
  connection: AiResolvedConnection
  context: AiAdapterRunContext
  limits: Readonly<AiRunLimits>
  modelRevision: AiResolvedConnectionModelRevision
  /** Map exactly at the provider boundary; reject before egress if unsupported. */
  privacyPolicy: Readonly<AiRequestPrivacyPolicy>
  runProfileConfigurationVersion: number
  runProfileId: AiRunProfileId
  selectedCapabilities: Readonly<AiCapabilitySelection>
  task: AiTaskEnvelope
}

export interface AiIntegrationRunRequest {
  context: AiRunTechnicalContext
  task: AiTaskEnvelope
  type: AiRunType
}

export interface AIIntegrationLayer {
  run(request: AiIntegrationRunRequest): AsyncIterable<AiRunEvent>
}

export interface AIConnectionAdapter {
  forceClose(externalRunId: AiExternalRunId): void
  run(request: AiConnectionAdapterRunRequest): AsyncIterable<AiRunEvent>
}

export interface AiConnectionAdapterRegistration {
  adapter: AIConnectionAdapter
  adapterType: string
  adapterVersion: string
}

export const AI_RUN_FAILURE_CATEGORIES = [
  'authentication_failed',
  'rate_limited',
  'connection_unavailable',
  'request_rejected',
  'deadline_exceeded',
  'invalid_response',
  'capability_mismatch',
  'adapter_failure',
] as const

export type AiRunFailureCategory = (typeof AI_RUN_FAILURE_CATEGORIES)[number]

export interface AiRunFailure {
  category: AiRunFailureCategory
  diagnosticCode?: string
  retryAfterSeconds?: number
  retryable: boolean
  retryDisposition?:
    | 'explicit_retryable_status'
    | 'idempotent'
    | 'safe_before_acceptance'
}

export interface AiRunLimits {
  maxBufferedEvents: number
  maxOutputBytes: number
  maxOutputTokens: number
  maxRetainedMemoryBytes: number
}

export const AI_UNAVAILABLE_USAGE_REASONS = [
  'not_supported',
  'not_reported',
  'cannot_calculate',
  'unknown_currency',
  'unknown_price',
  'unknown_usage',
] as const

export type AiUnavailableUsageReason =
  (typeof AI_UNAVAILABLE_USAGE_REASONS)[number]

export type AiUsageMetric<T> =
  | { status: 'calculated'; calculatedAt: string; value: T }
  | { status: 'reported'; value: T }
  | { reason: AiUnavailableUsageReason; status: 'unavailable' }

export interface AiRunCost {
  amount: string
  currency: string
}

export interface AiRunUsage {
  analysisTokens: AiUsageMetric<number>
  cost: AiUsageMetric<AiRunCost>
  inputTokens: AiUsageMetric<number>
  outputTokens: AiUsageMetric<number>
  totalTokens: AiUsageMetric<number>
}

export interface AiRunValidationIssue {
  code: string
  message: string
  path: string
}

export const AI_RUN_CANCELLATION_REASONS = [
  'user_cancelled',
  'client_disconnected',
  'application_cancelled',
] as const

export type AiRunCancellationReason =
  (typeof AI_RUN_CANCELLATION_REASONS)[number]

/** Shared internal port stream; downstream client projections omit output_delta. */
export type AiRunEvent =
  | { type: 'heartbeat' }
  | { delta: string; type: 'analysis_delta' }
  | { delta: string; type: 'output_delta'; visibility: 'internal' }
  | {
      analysis: string | null
      identity: AiRunIdentity
      rawOutput: string
      type: 'completed'
      usage: AiRunUsage
    }
  | {
      identity: AiRunIdentity
      reason: AiRunCancellationReason
      type: 'cancelled'
    }
  | { failure: AiRunFailure; identity: AiRunIdentity; type: 'failed' }

type AiRunTerminalEvent = Extract<
  AiRunEvent,
  { type: 'cancelled' | 'completed' | 'failed' }
>

export function createAiAdapterRunContext(
  context: AiRunTechnicalContext,
  egress: AiEgressTransport,
): AiAdapterRunContext {
  return {
    abortSignal: context.abortSignal,
    deadlineAt: context.deadlineAt,
    egress,
    externalRunId: `airun_${randomUUID()}` as AiExternalRunId,
  }
}

function hasRunIdentity(
  actual: AiRunIdentity,
  expected: AiRunIdentity,
): boolean {
  return (
    actual.aiConnectionId === expected.aiConnectionId &&
    actual.aiConnectionModelRevisionId ===
      expected.aiConnectionModelRevisionId &&
    actual.aiRunProfileId === expected.aiRunProfileId &&
    actual.aiRunProfileConfigurationVersion ===
      expected.aiRunProfileConfigurationVersion
  )
}

export async function* guardAiRunEventStream(
  source: AsyncIterable<AiRunEvent>,
  identity: AiRunIdentity,
): AsyncIterable<AiRunEvent> {
  let terminal: AiRunTerminalEvent | undefined
  let invalidAfterTerminal = false
  let terminalIdentityMismatch = false
  try {
    for await (const event of source) {
      if (terminal) {
        invalidAfterTerminal = true
        continue
      }
      if (
        event.type === 'cancelled' ||
        event.type === 'completed' ||
        event.type === 'failed'
      ) {
        terminal = event
        terminalIdentityMismatch = !hasRunIdentity(event.identity, identity)
        continue
      }
      yield event
    }
  } catch {
    yield {
      failure: {
        category: 'adapter_failure',
        diagnosticCode: 'adapter_stream_threw',
        retryable: false,
      },
      identity,
      type: 'failed',
    }
    return
  }

  if (invalidAfterTerminal) {
    yield {
      failure: {
        category: 'invalid_response',
        diagnosticCode: 'multiple_terminal_events',
        retryable: false,
      },
      identity,
      type: 'failed',
    }
  } else if (terminalIdentityMismatch) {
    yield {
      failure: {
        category: 'invalid_response',
        diagnosticCode: 'terminal_identity_mismatch',
        retryable: false,
      },
      identity,
      type: 'failed',
    }
  } else if (terminal) {
    yield terminal
  } else {
    yield {
      failure: {
        category: 'invalid_response',
        diagnosticCode: 'silent_eof',
        retryable: false,
      },
      identity,
      type: 'failed',
    }
  }
}

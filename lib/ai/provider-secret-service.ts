import { randomUUID } from 'node:crypto'
import type { SqlServerDatabase } from '@/lib/db'
import { conflictError } from '@/lib/requirements/errors'
import type {
  AiAdminAdapterContext,
  AiAdminConnectionAdapter,
  AiAdminNegativeProbeCase,
} from './admin-adapter'
import type { AiCapability } from './admin-contracts'
import type {
  AiAdminCandidateVerificationResult,
  AiAdminCapabilityVerification,
  AiAdminCatalogItem,
  AiAdminConnectionDetail,
  AiAdminHealthProbeResult,
  AiAdminModelRevisionRecord,
  AiAdminModelVerificationCandidate,
  AiAdminVerificationProgress,
} from './admin-service'
import { AI_CAPABILITY_KEYS } from './capability-keys'
import {
  AI_RUN_PROFILE_KEYS,
  type AiAdapterConfigurationResolver,
  type AiRunProfileKey,
} from './profile-resolver'
import {
  AiProviderSecretCryptoError,
  type AiProviderSecretEnvelope,
  decryptAiProviderSecret,
  encryptAiProviderSecret,
} from './provider-secret-crypto.ts'
import {
  type AiProviderSecretKeyring,
  AiProviderSecretKeyringError,
} from './provider-secret-keyring.ts'
import { SAFE_AI_TECHNICAL_CODE } from './requirement-prompt'
import {
  AI_RUN_CANCELLATION_REASONS,
  AI_RUN_FAILURE_CATEGORIES,
  AI_UNAVAILABLE_USAGE_REASONS,
  type AiCapabilitySelection,
  type AiConnectionId,
  type AiConnectionModelRevisionId,
  type AiEgressTransport,
  type AiRunEvent,
  type AiRunIdentity,
  type AiRunProfileId,
  type AiTaskEnvelope,
  guardAiRunEventStream,
} from './run-contracts'

export const AI_ADMIN_FUNCTIONAL_PROBE_VERSION =
  'ai-admin-functional-probe-v1' as const
const ADMIN_PROBE_TIMEOUT_MS = 30_000
const ADMIN_CANCELLATION_GRACE_MS = 5_000
const ADMIN_PROBE_PROFILE_ID =
  '00000000-0000-4000-8000-000000000865' as AiRunProfileId
const ADMIN_PROBE_IMAGE = new Uint8Array(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  ),
)

type AdminProbeTerminal = Extract<
  AiRunEvent,
  { type: 'cancelled' | 'completed' | 'failed' }
>

interface AdminFunctionalProbeResult {
  capabilities: AiCapability
  completed: boolean
  diagnosticCode: string | null
  failureCategory: string | null
  schemaValid: boolean
}

// cspell:ignore callbackurl functioncall toolcall toolcalls
const PROHIBITED_PROTOCOL_KEYS = new Set([
  'callback',
  'callback_url',
  'callbackurl',
  'function_call',
  'functioncall',
  'recipient',
  'tool_call',
  'tool_call_id',
  'tool_calls',
  'toolcall',
  'toolcalls',
])
const ADMIN_NEGATIVE_PROBE_CASES = [
  'safe_provider_error',
  'prohibited_callback',
  'prohibited_function_call',
  'prohibited_tool_calls',
] as const satisfies readonly AiAdminNegativeProbeCase[]

function containsProhibitedProtocol(value: unknown, depth = 0): boolean {
  if (depth > 8 || value === null || typeof value !== 'object') return false
  if (Array.isArray(value))
    return value.some(item => containsProhibitedProtocol(item, depth + 1))
  return Object.entries(value).some(
    ([key, item]) =>
      PROHIBITED_PROTOCOL_KEYS.has(key.toLowerCase()) ||
      containsProhibitedProtocol(item, depth + 1),
  )
}

function hasOnlyKeys(
  value: unknown,
  allowed: ReadonlySet<string>,
): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).every(key => allowed.has(key))
  )
}

function isRunIdentity(value: unknown): boolean {
  return (
    hasOnlyKeys(
      value,
      new Set([
        'aiConnectionId',
        'aiConnectionModelRevisionId',
        'aiRunProfileConfigurationVersion',
        'aiRunProfileId',
      ]),
    ) &&
    typeof value.aiConnectionId === 'string' &&
    typeof value.aiConnectionModelRevisionId === 'string' &&
    typeof value.aiRunProfileConfigurationVersion === 'number' &&
    Number.isInteger(value.aiRunProfileConfigurationVersion) &&
    typeof value.aiRunProfileId === 'string'
  )
}

function isUsageMetric(
  value: unknown,
  isValue: (candidate: unknown) => boolean,
): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    return false
  const metric = value as Record<string, unknown>
  if (metric.status === 'unavailable')
    return (
      hasOnlyKeys(metric, new Set(['reason', 'status'])) &&
      AI_UNAVAILABLE_USAGE_REASONS.some(reason => reason === metric.reason)
    )
  if (metric.status === 'reported')
    return (
      hasOnlyKeys(metric, new Set(['status', 'value'])) && isValue(metric.value)
    )
  return (
    metric.status === 'calculated' &&
    hasOnlyKeys(metric, new Set(['calculatedAt', 'status', 'value'])) &&
    typeof metric.calculatedAt === 'string' &&
    Number.isFinite(Date.parse(metric.calculatedAt)) &&
    isValue(metric.value)
  )
}

function isTokenCount(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isCost(value: unknown): boolean {
  return (
    hasOnlyKeys(value, new Set(['amount', 'currency'])) &&
    typeof value.amount === 'string' &&
    /^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(value.amount) &&
    typeof value.currency === 'string' &&
    /^[A-Z]{3}$/u.test(value.currency)
  )
}

function isRunUsage(value: unknown): boolean {
  return (
    hasOnlyKeys(
      value,
      new Set([
        'analysisTokens',
        'cost',
        'inputTokens',
        'outputTokens',
        'totalTokens',
      ]),
    ) &&
    isUsageMetric(value.analysisTokens, isTokenCount) &&
    isUsageMetric(value.cost, isCost) &&
    isUsageMetric(value.inputTokens, isTokenCount) &&
    isUsageMetric(value.outputTokens, isTokenCount) &&
    isUsageMetric(value.totalTokens, isTokenCount)
  )
}

function isNormalizedAdminProbeEvent(value: unknown): value is AiRunEvent {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    return false
  const event = value as Record<string, unknown>
  if (event.type === 'analysis_delta')
    return (
      hasOnlyKeys(event, new Set(['delta', 'type'])) &&
      typeof event.delta === 'string'
    )
  if (event.type === 'output_delta')
    return (
      hasOnlyKeys(event, new Set(['delta', 'type', 'visibility'])) &&
      typeof event.delta === 'string' &&
      event.visibility === 'internal'
    )
  if (event.type === 'completed')
    return (
      hasOnlyKeys(
        event,
        new Set(['analysis', 'identity', 'rawOutput', 'type', 'usage']),
      ) &&
      (event.analysis === null || typeof event.analysis === 'string') &&
      isRunIdentity(event.identity) &&
      typeof event.rawOutput === 'string' &&
      isRunUsage(event.usage)
    )
  if (event.type === 'cancelled')
    return (
      hasOnlyKeys(event, new Set(['identity', 'reason', 'type'])) &&
      isRunIdentity(event.identity) &&
      AI_RUN_CANCELLATION_REASONS.some(reason => reason === event.reason)
    )
  if (event.type !== 'failed') return false
  if (
    !hasOnlyKeys(event, new Set(['failure', 'identity', 'type'])) ||
    !isRunIdentity(event.identity) ||
    !hasOnlyKeys(
      event.failure,
      new Set([
        'category',
        'diagnosticCode',
        'retryAfterSeconds',
        'retryDisposition',
        'retryable',
      ]),
    )
  ) {
    return false
  }
  const failure = event.failure
  return (
    AI_RUN_FAILURE_CATEGORIES.some(category => category === failure.category) &&
    (failure.diagnosticCode === undefined ||
      (typeof failure.diagnosticCode === 'string' &&
        SAFE_AI_TECHNICAL_CODE.test(failure.diagnosticCode))) &&
    (failure.retryAfterSeconds === undefined ||
      (typeof failure.retryAfterSeconds === 'number' &&
        Number.isSafeInteger(failure.retryAfterSeconds) &&
        failure.retryAfterSeconds > 0)) &&
    (failure.retryDisposition === undefined ||
      failure.retryDisposition === 'explicit_retryable_status' ||
      failure.retryDisposition === 'idempotent' ||
      failure.retryDisposition === 'safe_before_acceptance') &&
    typeof failure.retryable === 'boolean'
  )
}

async function* rejectProhibitedProtocolEvents(
  source: AsyncIterable<AiRunEvent>,
): AsyncIterable<AiRunEvent> {
  for await (const candidate of source as AsyncIterable<unknown>) {
    if (
      !isNormalizedAdminProbeEvent(candidate) ||
      containsProhibitedProtocol(candidate)
    ) {
      throw new Error('The AI adapter emitted a prohibited protocol field.')
    }
    yield candidate
  }
}

function healthInvalidationScope(
  category: string | null,
): AiAdminHealthProbeResult['invalidationScope'] {
  if (category === 'authentication_failed') return 'connection'
  return category === 'capability_mismatch' ||
    category === 'invalid_response' ||
    category === 'request_rejected'
    ? 'model'
    : 'none'
}

function selectedCapabilities(
  capabilities: AiCapability,
): AiCapabilitySelection {
  return {
    aiAnalysis: capabilities.aiAnalysis,
    cost: capabilities.cost,
    imageInput: capabilities.imageInput,
    jsonSchemaSteering: capabilities.jsonSchemaSteering,
    streaming: capabilities.streaming,
    tokenUsage: capabilities.tokenUsage,
    validatableJson: capabilities.validatableJson,
  }
}

function probeTask(capabilities: AiCapability): AiTaskEnvelope {
  const analysisProbe = capabilities.aiAnalysis
  const expectedProbe = capabilities.imageInput ? 'black-pixel' : 'ok'
  return {
    content: [
      {
        text: analysisProbe
          ? 'Determine whether 19 multiplied by 23 equals 437, then return the required probe object.'
          : capabilities.imageInput
            ? 'Inspect the attached one-pixel image. Return the image result only if you observed the black pixel.'
            : 'Return the required probe object.',
        type: 'text',
      },
      ...(capabilities.imageInput
        ? ([
            {
              data: ADMIN_PROBE_IMAGE,
              mediaType: 'image/png',
              type: 'image',
            },
          ] as const)
        : []),
    ],
    instructions: analysisProbe
      ? `This is a fixed administrative capability probe. Use the provider reasoning mode for the arithmetic check. Do not put reasoning in the JSON response or expose a private chain of thought. If supported, return a concise visible analysis summary only through the provider analysis field. Return exactly {"probe":"${expectedProbe}"}.`
      : capabilities.jsonSchemaSteering
        ? `This is a fixed administrative capability probe. Return exactly {"probe":"${expectedProbe}","schemaMustRemoveThis":true}.`
        : `This is a fixed administrative capability probe. Return exactly {"probe":"${expectedProbe}"}.`,
    responseSchema: {
      additionalProperties: false,
      properties: { probe: { const: expectedProbe, type: 'string' } },
      required: ['probe'],
      type: 'object',
    },
    validationSchema: {
      additionalProperties: false,
      properties: { probe: { const: expectedProbe, type: 'string' } },
      required: ['probe'],
      type: 'object',
    },
  }
}

function validProbeOutput(
  rawOutput: string,
  capabilities: Readonly<AiCapability>,
): boolean {
  try {
    const parsed: unknown = JSON.parse(rawOutput)
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed) &&
      Object.keys(parsed).length === 1 &&
      (parsed as { probe?: unknown }).probe ===
        (capabilities.imageInput ? 'black-pixel' : 'ok')
    )
  } catch {
    return false
  }
}

function emptyCapabilities(): AiCapability {
  return {
    aiAnalysis: false,
    cost: false,
    imageInput: false,
    jsonSchemaSteering: false,
    streaming: false,
    tokenUsage: false,
    validatableJson: false,
  }
}

async function runAdminFunctionalProbe(
  adapter: AiAdminConnectionAdapter,
  context: Readonly<AiAdminAdapterContext>,
  revision: Readonly<AiAdminModelRevisionRecord>,
  capabilities: AiCapability,
  deadline: number,
  parentSignal: AbortSignal,
): Promise<AdminFunctionalProbeResult> {
  const deadlineAt = new Date(deadline).toISOString()
  const identity: AiRunIdentity = {
    aiConnectionId: context.connection.id as AiConnectionId,
    aiConnectionModelRevisionId: revision.id as AiConnectionModelRevisionId,
    aiRunProfileConfigurationVersion: 1,
    aiRunProfileId: ADMIN_PROBE_PROFILE_ID,
  }
  let terminal: AdminProbeTerminal | undefined
  let observedOutputDelta = false
  try {
    const stream = adapter.runFunctionalProbe(context, revision, {
      abortSignal: parentSignal,
      deadlineAt,
      selectedCapabilities: selectedCapabilities(capabilities),
      task: probeTask(capabilities),
    })
    for await (const event of guardAiRunEventStream(
      rejectProhibitedProtocolEvents(stream),
      identity,
    )) {
      if (event.type === 'output_delta') observedOutputDelta = true
      if (
        event.type === 'completed' ||
        event.type === 'failed' ||
        event.type === 'cancelled'
      ) {
        terminal = event
      }
    }
  } catch {
    terminal = undefined
  }

  if (terminal?.type !== 'completed') {
    return {
      capabilities: emptyCapabilities(),
      completed: false,
      diagnosticCode:
        terminal?.type === 'failed'
          ? (terminal.failure.diagnosticCode ?? null)
          : null,
      failureCategory:
        terminal?.type === 'failed'
          ? terminal.failure.category
          : terminal?.type === 'cancelled'
            ? 'cancelled'
            : 'adapter_failure',
      schemaValid: false,
    }
  }

  const schemaValid = validProbeOutput(terminal.rawOutput, capabilities)
  const verified: AiCapability = {
    aiAnalysis: capabilities.aiAnalysis && terminal.analysis !== null,
    cost: capabilities.cost && terminal.usage.cost.status !== 'unavailable',
    imageInput: capabilities.imageInput,
    jsonSchemaSteering: capabilities.jsonSchemaSteering && schemaValid,
    streaming: capabilities.streaming && observedOutputDelta,
    tokenUsage:
      capabilities.tokenUsage &&
      terminal.usage.totalTokens.status !== 'unavailable',
    validatableJson: capabilities.validatableJson && schemaValid,
  }
  return {
    capabilities: verified,
    completed: true,
    diagnosticCode: null,
    failureCategory: schemaValid ? null : 'invalid_response',
    schemaValid,
  }
}

async function runAdminCancellationProbe(
  adapter: AiAdminConnectionAdapter,
  context: Readonly<AiAdminAdapterContext>,
  revision: Readonly<AiAdminModelRevisionRecord>,
  parentSignal: AbortSignal,
  deadline: number,
): Promise<boolean> {
  const controller = new AbortController()
  const abortFromParent = (): void => controller.abort()
  if (parentSignal.aborted) controller.abort()
  else parentSignal.addEventListener('abort', abortFromParent, { once: true })
  const identity: AiRunIdentity = {
    aiConnectionId: context.connection.id as AiConnectionId,
    aiConnectionModelRevisionId: revision.id as AiConnectionModelRevisionId,
    aiRunProfileConfigurationVersion: 1,
    aiRunProfileId: ADMIN_PROBE_PROFILE_ID,
  }
  let grace: ReturnType<typeof setTimeout> | undefined
  let handoffTimeout: ReturnType<typeof setTimeout> | undefined
  let signalObservedResolve: (() => void) | undefined
  const signalObserved = new Promise<void>(resolve => {
    signalObservedResolve = resolve
  })
  try {
    const stream = adapter.runActivationCancellationProbe(context, revision, {
      get abortSignal() {
        signalObservedResolve?.()
        return controller.signal
      },
      deadlineAt: new Date(deadline).toISOString(),
      selectedCapabilities: selectedCapabilities(emptyCapabilities()),
      task: probeTask(emptyCapabilities()),
    })
    const outcome = (async (): Promise<boolean> => {
      for await (const event of guardAiRunEventStream(
        rejectProhibitedProtocolEvents(stream),
        identity,
      )) {
        if (event.type === 'cancelled') return true
        if (event.type === 'completed' || event.type === 'failed') return false
      }
      return false
    })()
    const handoff = await Promise.race([
      signalObserved.then(() => 'signal_observed' as const),
      outcome.then(() => 'terminal_observed' as const),
      new Promise<'handoff_timeout'>(resolve => {
        handoffTimeout = setTimeout(
          () => resolve('handoff_timeout'),
          Math.max(0, deadline - Date.now()),
        )
      }),
    ])
    if (handoff === 'terminal_observed') return await outcome
    controller.abort()
    return await Promise.race([
      outcome,
      new Promise<boolean>(resolve => {
        grace = setTimeout(
          () => resolve(false),
          Math.min(
            ADMIN_CANCELLATION_GRACE_MS,
            Math.max(0, deadline - Date.now()),
          ),
        )
      }),
    ])
  } catch {
    return false
  } finally {
    controller.abort()
    parentSignal.removeEventListener('abort', abortFromParent)
    if (grace) clearTimeout(grace)
    if (handoffTimeout) clearTimeout(handoffTimeout)
  }
}

async function runAdminNegativeProbes(
  adapter: AiAdminConnectionAdapter,
  context: Readonly<AiAdminAdapterContext>,
  revision: Readonly<AiAdminModelRevisionRecord>,
  signal: AbortSignal,
  deadline: number,
): Promise<boolean> {
  const identity: AiRunIdentity = {
    aiConnectionId: context.connection.id as AiConnectionId,
    aiConnectionModelRevisionId: revision.id as AiConnectionModelRevisionId,
    aiRunProfileConfigurationVersion: 1,
    aiRunProfileId: ADMIN_PROBE_PROFILE_ID,
  }
  const checkCase = async (
    negativeCase: AiAdminNegativeProbeCase,
  ): Promise<boolean> => {
    let terminal: AdminProbeTerminal | undefined
    try {
      const stream = adapter.runActivationNegativeProbe(
        context,
        revision,
        {
          abortSignal: signal,
          deadlineAt: new Date(deadline).toISOString(),
          selectedCapabilities: selectedCapabilities(emptyCapabilities()),
          task: probeTask(emptyCapabilities()),
        },
        negativeCase,
      )
      for await (const event of guardAiRunEventStream(
        rejectProhibitedProtocolEvents(stream),
        identity,
      )) {
        if (
          event.type === 'completed' ||
          event.type === 'failed' ||
          event.type === 'cancelled'
        ) {
          terminal = event
        }
      }
    } catch {
      return false
    }
    const expectedCategory =
      negativeCase === 'safe_provider_error'
        ? 'connection_unavailable'
        : 'invalid_response'
    if (
      terminal?.type !== 'failed' ||
      terminal.failure.category !== expectedCategory
    ) {
      return false
    }
    return true
  }
  return (await Promise.all(ADMIN_NEGATIVE_PROBE_CASES.map(checkCase))).every(
    Boolean,
  )
}

function satisfiesDeclaredCapabilities(
  declared: AiCapability,
  verified: AiCapability,
): boolean {
  return (Object.keys(declared) as (keyof AiCapability)[]).every(
    capability => !declared[capability] || verified[capability],
  )
}

const ADMIN_VERIFICATION_TOTAL_BUDGET_MS = 60_000
const TRANSIENT_ADMIN_FAILURES = new Set([
  'connection_unavailable',
  'deadline_exceeded',
  'provider_unavailable',
  'rate_limited',
])

const FIXED_PROFILE_CAPABILITIES: Readonly<
  Record<AiRunProfileKey, readonly (keyof AiCapability)[]>
> = Object.freeze({
  generation_with_images: Object.freeze([
    'imageInput' as const,
    'streaming' as const,
    'validatableJson' as const,
  ]),
  generation_without_images: Object.freeze([
    'streaming' as const,
    'validatableJson' as const,
  ]),
  invalid_json_repair: Object.freeze(['validatableJson' as const]),
})

function capabilityAssessment(
  result: Readonly<AdminFunctionalProbeResult>,
  capability: keyof AiCapability,
): AiAdminCapabilityVerification {
  if (
    result.completed &&
    result.schemaValid &&
    result.capabilities[capability]
  ) {
    return {
      diagnosticCode: null,
      failureCategory: null,
      outcome: 'verified',
    }
  }
  if (
    (result.completed && result.schemaValid) ||
    result.failureCategory === 'capability_mismatch' ||
    result.failureCategory === 'request_rejected'
  ) {
    return {
      diagnosticCode: result.diagnosticCode,
      failureCategory: result.failureCategory ?? 'capability_mismatch',
      outcome: 'not_verified',
    }
  }
  return {
    diagnosticCode: result.diagnosticCode,
    failureCategory: result.failureCategory ?? 'invalid_response',
    outcome: 'inconclusive',
  }
}

function verificationAssessment(
  passed: boolean,
  failureCategory: string | null,
  diagnosticCode: string | null = null,
): AiAdminCapabilityVerification {
  if (passed)
    return {
      diagnosticCode: null,
      failureCategory: null,
      outcome: 'verified',
    }
  return {
    diagnosticCode,
    failureCategory: failureCategory ?? 'invalid_response',
    outcome:
      failureCategory === 'authentication_failed' ||
      failureCategory === 'request_rejected'
        ? 'not_verified'
        : 'inconclusive',
  }
}

function selectedCapabilitySet(
  capabilities: readonly (keyof AiCapability)[],
): AiCapability {
  const selected = emptyCapabilities()
  for (const capability of capabilities) selected[capability] = true
  return selected
}

export interface AiProviderSecretMutationExecutor {
  query<T = unknown[]>(sql: string, parameters?: unknown[]): Promise<T>
}

export type AiProviderSecretBeforeCommit = (
  executor: AiProviderSecretMutationExecutor,
) => Promise<void>

export type AiProviderSecretVersionStatus =
  | 'active'
  | 'candidate'
  | 'superseded'

interface AiProviderSecretRow {
  activatedAt: Date | string | null
  authenticationTag: Buffer | null
  ciphertext: Buffer | null
  ciphertextDeletedAt?: Date | string | null
  connectionId: string
  createdAt: Date | string
  formatVersion: number
  id: string
  nonce: Buffer | null
  providerRevokedAt?: Date | string | null
  revisionNumber: number | string
  revisionToken: string
  rootKeyVersion: string
  status: AiProviderSecretVersionStatus
  verifiedAt: Date | string | null
}

export interface AiProviderSecretVersionMetadata {
  activatedAt: string | null
  ciphertextDeletedAt: string | null
  connectionId: string
  createdAt: string
  id: string
  providerRevokedAt: string | null
  revisionNumber: number
  revisionToken: string
  rootKeyVersion: string
  status: AiProviderSecretVersionStatus
  verifiedAt: string | null
}

export type AiProviderSecretUnavailableReason =
  | 'authentication_failed'
  | 'encrypted_material_deleted'
  | 'root_key_version_missing'
  | 'secret_missing'

export type AiProviderSecretAvailability =
  | {
      available: true
      rootKeyVersion: string
      secretVersionId: string
    }
  | {
      available: false
      reason: AiProviderSecretUnavailableReason
      rootKeyVersion?: string
      secretVersionId?: string
    }

export interface AiProviderSecretRestoreVerificationResult {
  available: boolean
  connectionId: string
  reason?: AiProviderSecretUnavailableReason
  rootKeyVersion: string
  secretVersionId: string
}

export interface AiProviderSecretRestoreVerificationReport {
  batchSize: number
  checkedSecretVersionCount: number
  compatible: boolean
  failedSecretVersionCount: number
  failureSample: readonly AiProviderSecretRestoreVerificationResult[]
  failureSampleLimit: number
  failureSampleTruncated: boolean
  omittedRootKeyVersion: string | null
  referencedRootKeyVersions: readonly string[]
  referencedRootKeyVersionsTruncated: boolean
  safeToRemoveOmittedRootKeyVersion: boolean | null
}

export class AiProviderSecretUnavailableError extends Error {
  readonly connectionId: string
  readonly reason: AiProviderSecretUnavailableReason
  readonly rootKeyVersion?: string
  readonly secretVersionId?: string

  constructor(
    connectionId: string,
    availability: Extract<AiProviderSecretAvailability, { available: false }>,
  ) {
    super(`AI provider secret is unavailable: ${availability.reason}`)
    this.name = 'AiProviderSecretUnavailableError'
    this.connectionId = connectionId
    this.reason = availability.reason
    this.rootKeyVersion = availability.rootKeyVersion
    this.secretVersionId = availability.secretVersionId
  }
}

export interface WriteAiProviderSecretCandidateInput {
  connectionId: string
  plaintext: string
}

export interface ActivateAiProviderSecretVersionInput {
  connectionConfigurationVersion: number
  connectionId: string
  connectionRevisionToken: string
  secretVersionId: string
}

/**
 * Trusted provider integration installed once at the service composition root.
 * Request handlers and other ordinary callers must only receive the opaque
 * {@link AiProviderSecretService} methods, never this dependency.
 */
export interface TrustedAiProviderSecretCandidateVerifier {
  verifyCandidate(
    context: Readonly<{ connectionId: string; secretVersionId: string }>,
    plaintext: string,
  ): Promise<void>
}

export interface ConfirmAiProviderSecretRevocationInput {
  connectionId: string
  secretVersionId: string
}

export interface DeleteAiProviderSecretCandidateInput {
  connectionId: string
  secretVersionId: string
}

function iso(value: Date | string | null | undefined): string | null {
  if (value == null) return null
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString()
}

function metadata(row: AiProviderSecretRow): AiProviderSecretVersionMetadata {
  return {
    activatedAt: iso(row.activatedAt),
    ciphertextDeletedAt: iso(row.ciphertextDeletedAt),
    connectionId: row.connectionId,
    createdAt: iso(row.createdAt) as string,
    id: row.id,
    providerRevokedAt: iso(row.providerRevokedAt),
    revisionNumber: Number(row.revisionNumber),
    revisionToken: row.revisionToken,
    rootKeyVersion: row.rootKeyVersion,
    status: row.status,
    verifiedAt: iso(row.verifiedAt),
  }
}

function envelope(row: AiProviderSecretRow): AiProviderSecretEnvelope | null {
  if (!row.ciphertext || !row.nonce || !row.authenticationTag) return null
  return {
    authenticationTag: row.authenticationTag,
    ciphertext: row.ciphertext,
    formatVersion: row.formatVersion as 1,
    nonce: row.nonce,
    rootKeyVersion: row.rootKeyVersion,
  }
}

async function selectActiveSecret(
  executor: AiProviderSecretMutationExecutor,
  connectionId: string,
): Promise<AiProviderSecretRow | undefined> {
  const rows = await executor.query<AiProviderSecretRow[]>(
    `SELECT [id], [ai_connection_id] AS [connectionId],
       [revision_number] AS [revisionNumber], [status],
       [ciphertext], [nonce], [authentication_tag] AS [authenticationTag],
       [cipher_format_version] AS [formatVersion],
       [root_key_version] AS [rootKeyVersion],
       [created_at] AS [createdAt], [verified_at] AS [verifiedAt],
       [activated_at] AS [activatedAt],
       [provider_revoked_at] AS [providerRevokedAt],
       [ciphertext_deleted_at] AS [ciphertextDeletedAt],
       [revision_token] AS [revisionToken]
     FROM [ai_provider_secret_versions]
     WHERE [ai_connection_id] = @0 AND [status] = N'active'`,
    [connectionId],
  )
  return rows[0]
}

async function selectActivatableSecret(
  executor: AiProviderSecretMutationExecutor,
  connectionId: string,
  secretVersionId: string,
): Promise<AiProviderSecretRow | undefined> {
  const rows = await executor.query<AiProviderSecretRow[]>(
    `SELECT [id], [ai_connection_id] AS [connectionId],
       [revision_number] AS [revisionNumber], [status],
       [ciphertext], [nonce], [authentication_tag] AS [authenticationTag],
       [cipher_format_version] AS [formatVersion],
       [root_key_version] AS [rootKeyVersion],
       [created_at] AS [createdAt], [verified_at] AS [verifiedAt],
       [activated_at] AS [activatedAt],
       [provider_revoked_at] AS [providerRevokedAt],
       [ciphertext_deleted_at] AS [ciphertextDeletedAt],
       [revision_token] AS [revisionToken]
     FROM [ai_provider_secret_versions]
     WHERE [id] = @0 AND [ai_connection_id] = @1
       AND [status] IN (N'candidate', N'superseded')`,
    [secretVersionId, connectionId],
  )
  return rows[0]
}

function decryptRow(
  keyring: AiProviderSecretKeyring,
  row: AiProviderSecretRow,
): string {
  const encrypted = envelope(row)
  if (!encrypted) {
    throw new AiProviderSecretUnavailableError(row.connectionId, {
      available: false,
      reason: 'encrypted_material_deleted',
      rootKeyVersion: row.rootKeyVersion,
      secretVersionId: row.id,
    })
  }
  try {
    return decryptAiProviderSecret(
      keyring,
      { connectionId: row.connectionId, secretVersionId: row.id },
      encrypted,
    )
  } catch (error) {
    const reason =
      error instanceof AiProviderSecretCryptoError &&
      error.code === 'root_key_version_missing'
        ? 'root_key_version_missing'
        : 'authentication_failed'
    throw new AiProviderSecretUnavailableError(row.connectionId, {
      available: false,
      reason,
      rootKeyVersion: row.rootKeyVersion,
      secretVersionId: row.id,
    })
  }
}

export async function writeAiProviderSecretCandidate(
  db: SqlServerDatabase,
  keyring: AiProviderSecretKeyring,
  input: WriteAiProviderSecretCandidateInput,
  beforeCommit?: AiProviderSecretBeforeCommit,
): Promise<AiProviderSecretVersionMetadata> {
  const secretVersionId = randomUUID()
  const encrypted = encryptAiProviderSecret(
    keyring,
    { connectionId: input.connectionId, secretVersionId },
    input.plaintext,
  )
  const row = await db.transaction('SERIALIZABLE', async manager => {
    const rows = await manager.query<AiProviderSecretRow[]>(
      `IF NOT EXISTS (
         SELECT 1 FROM [ai_connections] WITH (UPDLOCK, HOLDLOCK)
         WHERE [id] = @0
       )
         THROW 51100, 'AI connection does not exist.', 1;

       DECLARE @revision_number int = (
         SELECT COALESCE(MAX([revision_number]), 0) + 1
         FROM [ai_provider_secret_versions] WITH (UPDLOCK, HOLDLOCK)
         WHERE [ai_connection_id] = @0
       );

       INSERT INTO [ai_provider_secret_versions] (
         [id], [ai_connection_id], [revision_number], [status], [ciphertext],
         [nonce], [authentication_tag], [cipher_format_version],
         [root_key_version], [created_at]
       )
       OUTPUT INSERTED.[id], INSERTED.[ai_connection_id] AS [connectionId],
         INSERTED.[revision_number] AS [revisionNumber], INSERTED.[status],
         INSERTED.[root_key_version] AS [rootKeyVersion],
         INSERTED.[created_at] AS [createdAt],
         INSERTED.[verified_at] AS [verifiedAt],
         INSERTED.[activated_at] AS [activatedAt],
         INSERTED.[provider_revoked_at] AS [providerRevokedAt],
         INSERTED.[ciphertext_deleted_at] AS [ciphertextDeletedAt],
         INSERTED.[revision_token] AS [revisionToken]
       VALUES (
         @1, @0, @revision_number, N'candidate', @2, @3, @4, @5, @6,
         SYSUTCDATETIME()
       );`,
      [
        input.connectionId,
        secretVersionId,
        encrypted.ciphertext,
        encrypted.nonce,
        encrypted.authenticationTag,
        encrypted.formatVersion,
        encrypted.rootKeyVersion,
      ],
    )
    const saved = rows[0]
    if (!saved) throw new Error('AI provider-secret candidate was not created')
    await beforeCommit?.(manager)
    return saved
  })
  return metadata(row)
}

export async function getAiProviderSecretAvailability(
  db: SqlServerDatabase,
  keyring: AiProviderSecretKeyring,
  connectionId: string,
): Promise<AiProviderSecretAvailability> {
  const row = await selectActiveSecret(db, connectionId)
  if (!row) return { available: false, reason: 'secret_missing' }
  try {
    decryptRow(keyring, row)
    return {
      available: true,
      rootKeyVersion: row.rootKeyVersion,
      secretVersionId: row.id,
    }
  } catch (error) {
    if (error instanceof AiProviderSecretUnavailableError) {
      return {
        available: false,
        reason: error.reason,
        ...(error.rootKeyVersion
          ? { rootKeyVersion: error.rootKeyVersion }
          : {}),
        ...(error.secretVersionId
          ? { secretVersionId: error.secretVersionId }
          : {}),
      }
    }
    throw error
  }
}

export async function getAiProviderSecretAvailabilities(
  db: SqlServerDatabase,
  keyring: AiProviderSecretKeyring,
  connectionIds: readonly string[],
): Promise<ReadonlyMap<string, AiProviderSecretAvailability>> {
  const normalizedIds = [
    ...new Set(connectionIds.map(connectionId => connectionId.toLowerCase())),
  ]
  if (normalizedIds.length === 0) return new Map()
  const rows = await db.query<AiProviderSecretRow[]>(
    `SELECT [secret].[id],
       [secret].[ai_connection_id] AS [connectionId],
       [secret].[revision_number] AS [revisionNumber], [secret].[status],
       [secret].[ciphertext], [secret].[nonce],
       [secret].[authentication_tag] AS [authenticationTag],
       [secret].[cipher_format_version] AS [formatVersion],
       [secret].[root_key_version] AS [rootKeyVersion],
       [secret].[created_at] AS [createdAt],
       [secret].[verified_at] AS [verifiedAt],
       [secret].[activated_at] AS [activatedAt],
       [secret].[provider_revoked_at] AS [providerRevokedAt],
       [secret].[ciphertext_deleted_at] AS [ciphertextDeletedAt],
       [secret].[revision_token] AS [revisionToken]
     FROM OPENJSON(@0) WITH ([id] uniqueidentifier '$') AS [requested]
     INNER JOIN [ai_provider_secret_versions] AS [secret]
       ON [secret].[ai_connection_id] = [requested].[id]
       AND [secret].[status] = N'active'`,
    [JSON.stringify(normalizedIds)],
  )
  const byConnection = new Map(
    rows.map(row => [row.connectionId.toLowerCase(), row] as const),
  )
  return new Map<string, AiProviderSecretAvailability>(
    normalizedIds.map(connectionId => {
      const row = byConnection.get(connectionId)
      if (!row) {
        return [
          connectionId,
          { available: false, reason: 'secret_missing' } as const,
        ]
      }
      try {
        decryptRow(keyring, row)
        return [
          connectionId,
          {
            available: true,
            rootKeyVersion: row.rootKeyVersion,
            secretVersionId: row.id,
          } as const,
        ]
      } catch (error) {
        if (!(error instanceof AiProviderSecretUnavailableError)) throw error
        return [
          connectionId,
          {
            available: false,
            reason: error.reason,
            ...(error.rootKeyVersion
              ? { rootKeyVersion: error.rootKeyVersion }
              : {}),
            ...(error.secretVersionId
              ? { secretVersionId: error.secretVersionId }
              : {}),
          } as const,
        ]
      }
    }),
  )
}

async function activateAiProviderSecretVersion(
  db: SqlServerDatabase,
  keyring: AiProviderSecretKeyring,
  verifier: TrustedAiProviderSecretCandidateVerifier,
  input: ActivateAiProviderSecretVersionInput,
  beforeCommit?: AiProviderSecretBeforeCommit,
): Promise<AiProviderSecretVersionMetadata> {
  const candidate = await selectActivatableSecret(
    db,
    input.connectionId,
    input.secretVersionId,
  )
  if (!candidate) {
    throw new AiProviderSecretUnavailableError(input.connectionId, {
      available: false,
      reason: 'secret_missing',
      secretVersionId: input.secretVersionId,
    })
  }
  await verifier.verifyCandidate(
    { connectionId: candidate.connectionId, secretVersionId: candidate.id },
    decryptRow(keyring, candidate),
  )

  const active = await db.transaction('SERIALIZABLE', async manager => {
    const rows =
      (await manager.query<AiProviderSecretRow[]>(
        `DECLARE @now datetime2(3) = SYSUTCDATETIME();
       DECLARE @activated TABLE (
         [id] uniqueidentifier NOT NULL,
         [connectionId] uniqueidentifier NOT NULL,
         [revisionNumber] int NOT NULL,
         [status] nvarchar(24) NOT NULL,
         [rootKeyVersion] nvarchar(120) NOT NULL,
         [createdAt] datetime2(3) NOT NULL,
         [verifiedAt] datetime2(3) NULL,
         [activatedAt] datetime2(3) NULL,
         [providerRevokedAt] datetime2(3) NULL,
         [ciphertextDeletedAt] datetime2(3) NULL,
         [revisionToken] uniqueidentifier NOT NULL
       );

       IF NOT EXISTS (
         SELECT 1 FROM [ai_connections] WITH (UPDLOCK, HOLDLOCK)
         WHERE [id] = @1 AND [configuration_version] = @3
           AND [revision_token] = @4
       ) RETURN;

       IF NOT EXISTS (
         SELECT 1 FROM [ai_provider_secret_versions] WITH (UPDLOCK, HOLDLOCK)
         WHERE [id] = @0 AND [ai_connection_id] = @1
           AND [revision_token] = @2
           AND [status] IN (N'candidate', N'superseded')
           AND [ciphertext] IS NOT NULL AND [provider_revoked_at] IS NULL
       )
         THROW 51101, 'AI provider-secret version is no longer activatable.', 1;

       UPDATE [ai_provider_secret_versions]
       SET [status] = N'superseded', [deactivated_at] = @now,
         [revision_token] = NEWID()
       WHERE [ai_connection_id] = @1 AND [status] = N'active';

       UPDATE [ai_provider_secret_versions]
       SET [status] = N'active', [verified_at] = @now,
         [activated_at] = COALESCE([activated_at], @now),
         [deactivated_at] = NULL, [revision_token] = NEWID()
       OUTPUT INSERTED.[id], INSERTED.[ai_connection_id] AS [connectionId],
         INSERTED.[revision_number] AS [revisionNumber], INSERTED.[status],
         INSERTED.[root_key_version] AS [rootKeyVersion],
         INSERTED.[created_at] AS [createdAt],
         INSERTED.[verified_at] AS [verifiedAt],
         INSERTED.[activated_at] AS [activatedAt],
         INSERTED.[provider_revoked_at] AS [providerRevokedAt],
         INSERTED.[ciphertext_deleted_at] AS [ciphertextDeletedAt],
         INSERTED.[revision_token] AS [revisionToken]
       INTO @activated
       WHERE [id] = @0 AND [ai_connection_id] = @1;

       UPDATE [ai_connections]
       SET [configuration_version] = [configuration_version] + 1,
         [lifecycle_status] = CASE
           WHEN [lifecycle_status] = N'draft' THEN N'draft'
           ELSE N'verification_required'
         END,
         [updated_at] = @now, [revision_token] = NEWID()
       WHERE [id] = @1 AND [configuration_version] = @3
         AND [revision_token] = @4;

       UPDATE [revision]
       SET [status] = N'new_revision_required',
         [updated_at] = @now, [revision_token] = NEWID()
       FROM [ai_connection_model_revisions] AS [revision]
       INNER JOIN [ai_connection_models] AS [model]
         ON [model].[id] = [revision].[ai_connection_model_id]
       WHERE [model].[ai_connection_id] = @1
         AND [revision].[status] = N'verified';

       SELECT * FROM @activated;`,
        [
          input.secretVersionId,
          input.connectionId,
          candidate.revisionToken,
          input.connectionConfigurationVersion,
          input.connectionRevisionToken,
        ],
      )) ?? []
    const saved = rows[0]
    if (!saved) {
      throw conflictError(
        'AI connection or provider-secret state changed. Reload and try again.',
      )
    }
    await beforeCommit?.(manager)
    return saved
  })
  return metadata(active)
}

/**
 * Purpose-specific provider-secret boundary. Ordinary callers can request
 * candidate activation using opaque identifiers, but cannot provide code that
 * receives decrypted material or retrieve plaintext from a result. The trusted
 * verifier is fixed once when the service is composed.
 *
 * Runtime adapter execution intentionally remains unavailable until its trusted
 * integration owns another purpose-specific operation.
 */
export class AiProviderSecretService {
  readonly #db: SqlServerDatabase
  readonly #keyring: AiProviderSecretKeyring
  readonly #verifier: TrustedAiProviderSecretCandidateVerifier
  readonly #beforeCommit?: AiProviderSecretBeforeCommit

  constructor(
    db: SqlServerDatabase,
    keyring: AiProviderSecretKeyring,
    verifier: TrustedAiProviderSecretCandidateVerifier,
    beforeCommit?: AiProviderSecretBeforeCommit,
  ) {
    this.#db = db
    this.#keyring = keyring
    this.#verifier = verifier
    this.#beforeCommit = beforeCommit
  }

  activateCandidate(
    input: ActivateAiProviderSecretVersionInput,
  ): Promise<AiProviderSecretVersionMetadata> {
    return activateAiProviderSecretVersion(
      this.#db,
      this.#keyring,
      this.#verifier,
      input,
      this.#beforeCommit,
    )
  }
}

/**
 * Purpose-specific administrative provider boundary. It permits the trusted
 * adapter to consume an active credential transiently without exposing a
 * plaintext-returning API to routes or business services.
 */
export class AiProviderSecretAdminService {
  readonly #db: SqlServerDatabase
  readonly #keyring: AiProviderSecretKeyring

  constructor(db: SqlServerDatabase, keyring: AiProviderSecretKeyring) {
    this.#db = db
    this.#keyring = keyring
  }

  async #execute<Result>(
    connection: Readonly<AiAdminConnectionDetail>,
    egress: AiEgressTransport,
    operation: (context: Readonly<AiAdminAdapterContext>) => Promise<Result>,
  ): Promise<Result> {
    if (connection.authenticationType === 'none') {
      return operation({ connection, credential: null, egress })
    }
    const row = await selectActiveSecret(this.#db, connection.id)
    if (!row) {
      throw new AiProviderSecretUnavailableError(connection.id, {
        available: false,
        reason: 'secret_missing',
      })
    }
    return operation({
      connection,
      credential: decryptRow(this.#keyring, row),
      egress,
    })
  }

  fetchCatalog(
    adapter: AiAdminConnectionAdapter,
    connection: Readonly<AiAdminConnectionDetail>,
    egress: AiEgressTransport,
  ): Promise<readonly AiAdminCatalogItem[]> {
    return this.#execute(connection, egress, context =>
      adapter.fetchCatalog(context),
    )
  }

  verifyModelCandidate(
    adapter: AiAdminConnectionAdapter,
    connection: Readonly<AiAdminConnectionDetail>,
    egress: AiEgressTransport,
    candidate: Readonly<AiAdminModelVerificationCandidate>,
    options: Readonly<{
      onProgress?: (
        progress: Readonly<AiAdminVerificationProgress>,
      ) => Promise<void> | void
      signal: AbortSignal
    }>,
  ): Promise<Readonly<AiAdminCandidateVerificationResult>> {
    return this.#execute(connection, egress, async context => {
      const deadline = Date.now() + ADMIN_VERIFICATION_TOTAL_BUDGET_MS
      const suiteSignal = AbortSignal.any([
        options.signal,
        AbortSignal.timeout(ADMIN_VERIFICATION_TOTAL_BUDGET_MS),
      ])
      const emit = async (
        check: AiAdminVerificationProgress['check'],
        state: AiAdminVerificationProgress['state'],
        assessment: AiAdminCapabilityVerification = {
          diagnosticCode: null,
          failureCategory: null,
          outcome: 'not_checked',
        },
      ): Promise<void> => {
        await options.onProgress?.({ check, state, ...assessment })
      }
      const assertActive = (): void => {
        if (suiteSignal.aborted) {
          throw new DOMException('Verification cancelled.', 'AbortError')
        }
        if (Date.now() >= deadline) {
          throw new DOMException(
            'Verification deadline exceeded.',
            'TimeoutError',
          )
        }
      }
      const revision = (
        selected: AiCapability,
      ): AiAdminModelRevisionRecord => ({
        agentRuntimeVersion: connection.agentRuntimeVersion,
        connectionConfigurationVersion: connection.configurationVersion,
        declaredCapabilities: selected,
        discoveredCapabilities: null,
        externalModelId: candidate.externalModelId,
        externalModelVersion: candidate.externalModelVersion,
        id: randomUUID(),
        profileCompatibility: null,
        revisionNumber: 0,
        revisionToken: randomUUID(),
        status: 'verified',
        testSuiteVersion: null,
        verifiedAt: null,
        verifiedCapabilities: null,
      })
      const runProbe = async (
        selected: AiCapability,
      ): Promise<AdminFunctionalProbeResult> => {
        let result: AdminFunctionalProbeResult | undefined
        for (let attempt = 0; attempt < 2; attempt += 1) {
          assertActive()
          const remaining = deadline - Date.now()
          if (remaining <= 0) {
            return {
              capabilities: emptyCapabilities(),
              completed: false,
              diagnosticCode: 'admin_probe_deadline_exceeded',
              failureCategory: 'deadline_exceeded',
              schemaValid: false,
            }
          }
          result = await runAdminFunctionalProbe(
            adapter,
            context,
            revision(selected),
            selected,
            deadline,
            suiteSignal,
          )
          if (
            !result.failureCategory ||
            !TRANSIENT_ADMIN_FAILURES.has(result.failureCategory)
          ) {
            return result
          }
        }
        return result as AdminFunctionalProbeResult
      }
      const unknownCapabilities = Object.fromEntries(
        AI_CAPABILITY_KEYS.map(capability => [
          capability,
          {
            diagnosticCode: null,
            failureCategory: null,
            outcome: 'not_checked' as const,
          },
        ]),
      ) as Record<keyof AiCapability, AiAdminCapabilityVerification>
      const uncheckedProfiles = Object.fromEntries(
        AI_RUN_PROFILE_KEYS.map(profileKey => [
          profileKey,
          {
            diagnosticCode: null,
            failureCategory: null,
            missingCapabilities: FIXED_PROFILE_CAPABILITIES[profileKey],
            outcome: 'not_checked' as const,
            supported: false,
          },
        ]),
      ) as AiAdminCandidateVerificationResult['profileCompatibility']

      await emit('connection_authentication', 'running')
      assertActive()
      let connectionResult = await adapter.probeConnection(context, {
        abortSignal: suiteSignal,
        deadlineAt: new Date(deadline).toISOString(),
      })
      if (
        connectionResult.outcome === 'failed' &&
        connectionResult.failureCategory &&
        TRANSIENT_ADMIN_FAILURES.has(connectionResult.failureCategory)
      ) {
        assertActive()
        connectionResult = await adapter.probeConnection(context, {
          abortSignal: suiteSignal,
          deadlineAt: new Date(deadline).toISOString(),
        })
      }
      const connectionAssessment = verificationAssessment(
        connectionResult.outcome === 'passed',
        connectionResult.failureCategory,
        connectionResult.diagnosticCode,
      )
      await emit('connection_authentication', 'completed', connectionAssessment)
      if (connectionAssessment.outcome !== 'verified') {
        await emit('summary', 'running')
        await emit('summary', 'completed', connectionAssessment)
        return {
          baseline: {
            diagnosticCode: null,
            failureCategory: null,
            outcome: 'not_checked',
          },
          canonicalExternalModelVersion: candidate.externalModelVersion,
          capabilities: unknownCapabilities,
          connection: connectionAssessment,
          profileCompatibility: uncheckedProfiles,
          saveable: false,
          testSuiteVersion: AI_ADMIN_FUNCTIONAL_PROBE_VERSION,
        }
      }

      await emit('baseline_model_access', 'running')
      const baselineResult = await runProbe(emptyCapabilities())
      let baselineAssessment = verificationAssessment(
        baselineResult.completed && baselineResult.schemaValid,
        baselineResult.failureCategory,
        baselineResult.diagnosticCode,
      )
      if (baselineAssessment.outcome === 'verified') {
        const baselineRevision = revision(emptyCapabilities())
        const [cancellationHandled, negativeCasesPassed] = await Promise.all([
          runAdminCancellationProbe(
            adapter,
            context,
            baselineRevision,
            suiteSignal,
            deadline,
          ),
          runAdminNegativeProbes(
            adapter,
            context,
            baselineRevision,
            suiteSignal,
            deadline,
          ),
        ])
        baselineAssessment = verificationAssessment(
          cancellationHandled && negativeCasesPassed,
          cancellationHandled && negativeCasesPassed ? null : 'adapter_failure',
          cancellationHandled && negativeCasesPassed
            ? null
            : 'admin_adapter_contract_failed',
        )
      }
      await emit('baseline_model_access', 'completed', baselineAssessment)
      if (baselineAssessment.outcome !== 'verified') {
        await emit('summary', 'running')
        await emit('summary', 'completed', baselineAssessment)
        return {
          baseline: baselineAssessment,
          canonicalExternalModelVersion: candidate.externalModelVersion,
          capabilities: unknownCapabilities,
          connection: connectionAssessment,
          profileCompatibility: uncheckedProfiles,
          saveable: false,
          testSuiteVersion: AI_ADMIN_FUNCTIONAL_PROBE_VERSION,
        }
      }

      const capabilities = { ...unknownCapabilities }
      for (const capability of AI_CAPABILITY_KEYS) {
        const check = `capability:${capability}` as const
        await emit(check, 'running')
        const selected = selectedCapabilitySet([capability])
        let result = await runProbe(selected)
        let assessment = capabilityAssessment(result, capability)
        if (
          (capability === 'aiAnalysis' ||
            capability === 'cost' ||
            capability === 'tokenUsage') &&
          assessment.outcome === 'not_verified' &&
          result.completed &&
          result.schemaValid
        ) {
          result = await runProbe(selected)
          assessment = capabilityAssessment(result, capability)
        }
        capabilities[capability] = assessment
        await emit(check, 'completed', assessment)
      }

      const profileCompatibility = {} as Record<
        AiRunProfileKey,
        AiAdminCandidateVerificationResult['profileCompatibility'][AiRunProfileKey]
      >
      for (const profileKey of AI_RUN_PROFILE_KEYS) {
        const check = `profile:${profileKey}` as const
        await emit(check, 'running')
        const required = FIXED_PROFILE_CAPABILITIES[profileKey]
        const missingCapabilities = required.filter(
          capability => capabilities[capability].outcome !== 'verified',
        )
        const result = await runProbe(selectedCapabilitySet(required))
        const combinedPassed =
          result.completed &&
          result.schemaValid &&
          missingCapabilities.length === 0 &&
          satisfiesDeclaredCapabilities(
            selectedCapabilitySet(required),
            result.capabilities,
          )
        const assessment = verificationAssessment(
          combinedPassed,
          result.failureCategory ??
            (missingCapabilities.length > 0 ? 'capability_mismatch' : null),
          result.diagnosticCode,
        )
        profileCompatibility[profileKey] = {
          diagnosticCode: assessment.diagnosticCode,
          failureCategory: assessment.failureCategory,
          missingCapabilities,
          outcome: assessment.outcome,
          supported: combinedPassed,
        }
        await emit(check, 'completed', assessment)
      }

      const capabilityAssessmentsDecisive = Object.values(capabilities).every(
        assessment =>
          assessment.outcome === 'verified' ||
          assessment.outcome === 'not_verified',
      )
      const saveable =
        baselineAssessment.outcome === 'verified' &&
        Object.values(profileCompatibility).some(profile => profile.supported)
      const summaryDiagnosticCode = [
        baselineAssessment,
        ...Object.values(capabilities),
        ...Object.values(profileCompatibility),
      ].find(assessment => assessment.diagnosticCode)?.diagnosticCode
      const summaryAssessment: AiAdminCapabilityVerification = {
        diagnosticCode: saveable ? null : (summaryDiagnosticCode ?? null),
        failureCategory: saveable
          ? null
          : (baselineAssessment.failureCategory ??
            (capabilityAssessmentsDecisive
              ? 'capability_mismatch'
              : 'inconclusive_capability')),
        outcome: saveable
          ? 'verified'
          : capabilityAssessmentsDecisive
            ? 'not_verified'
            : 'inconclusive',
      }
      await emit('summary', 'running')
      await emit('summary', 'completed', summaryAssessment)
      return {
        baseline: baselineAssessment,
        canonicalExternalModelVersion: candidate.externalModelVersion,
        capabilities,
        connection: connectionAssessment,
        profileCompatibility,
        saveable,
        testSuiteVersion: AI_ADMIN_FUNCTIONAL_PROBE_VERSION,
      }
    })
  }

  async probeHealth(
    adapter: AiAdminConnectionAdapter,
    connection: Readonly<AiAdminConnectionDetail>,
    egress: AiEgressTransport,
    revision: Readonly<AiAdminModelRevisionRecord>,
  ): Promise<Readonly<AiAdminHealthProbeResult>> {
    const expectedCapabilities =
      revision.verifiedCapabilities ?? revision.declaredCapabilities
    const deadline = Date.now() + ADMIN_PROBE_TIMEOUT_MS
    const result = await this.#execute(connection, egress, context =>
      runAdminFunctionalProbe(
        adapter,
        context,
        revision,
        expectedCapabilities,
        deadline,
        AbortSignal.timeout(ADMIN_PROBE_TIMEOUT_MS),
      ),
    )
    const healthy =
      result.completed &&
      result.schemaValid &&
      satisfiesDeclaredCapabilities(expectedCapabilities, result.capabilities)
    if (healthy) {
      return {
        failureCategory: null,
        health: 'healthy',
        invalidationScope: 'none',
      }
    }
    const failureCategory = result.failureCategory ?? 'capability_mismatch'
    const invalidationScope = healthInvalidationScope(failureCategory)
    return {
      failureCategory,
      health: invalidationScope === 'none' ? 'unavailable' : 'degraded',
      invalidationScope,
    }
  }

  verifySecretCandidate(
    adapter: AiAdminConnectionAdapter,
    connection: Readonly<AiAdminConnectionDetail>,
    egress: AiEgressTransport,
    plaintext: string,
  ): Promise<void> {
    return adapter.verifySecretCandidate({
      connection,
      credential: plaintext,
      egress,
    })
  }
}

export async function confirmAiProviderSecretRevocation(
  db: SqlServerDatabase,
  input: ConfirmAiProviderSecretRevocationInput,
  beforeCommit?: AiProviderSecretBeforeCommit,
): Promise<AiProviderSecretVersionMetadata> {
  const row = await db.transaction('SERIALIZABLE', async manager => {
    const rows = await manager.query<AiProviderSecretRow[]>(
      `DECLARE @now datetime2(3) = SYSUTCDATETIME();
       DECLARE @revoked TABLE (
         [id] uniqueidentifier NOT NULL,
         [connectionId] uniqueidentifier NOT NULL,
         [revisionNumber] int NOT NULL,
         [status] nvarchar(24) NOT NULL,
         [rootKeyVersion] nvarchar(120) NOT NULL,
         [createdAt] datetime2(3) NOT NULL,
         [verifiedAt] datetime2(3) NULL,
         [activatedAt] datetime2(3) NULL,
         [providerRevokedAt] datetime2(3) NULL,
         [ciphertextDeletedAt] datetime2(3) NULL,
         [revisionToken] uniqueidentifier NOT NULL
       );
       UPDATE [ai_provider_secret_versions] WITH (UPDLOCK, HOLDLOCK)
       SET [ciphertext] = NULL, [nonce] = NULL,
         [authentication_tag] = NULL, [provider_revoked_at] = @now,
         [ciphertext_deleted_at] = @now, [revision_token] = NEWID()
       OUTPUT INSERTED.[id], INSERTED.[ai_connection_id] AS [connectionId],
         INSERTED.[revision_number] AS [revisionNumber], INSERTED.[status],
         INSERTED.[root_key_version] AS [rootKeyVersion],
         INSERTED.[created_at] AS [createdAt],
         INSERTED.[verified_at] AS [verifiedAt],
         INSERTED.[activated_at] AS [activatedAt],
         INSERTED.[provider_revoked_at] AS [providerRevokedAt],
         INSERTED.[ciphertext_deleted_at] AS [ciphertextDeletedAt],
         INSERTED.[revision_token] AS [revisionToken]
       INTO @revoked
       WHERE [id] = @0 AND [ai_connection_id] = @1
         AND [status] = N'superseded' AND [ciphertext] IS NOT NULL;
       SELECT * FROM @revoked;`,
      [input.secretVersionId, input.connectionId],
    )
    const saved = rows[0]
    if (!saved) {
      throw new Error(
        'Only a superseded, encrypted AI provider-secret version can be confirmed revoked',
      )
    }
    await beforeCommit?.(manager)
    return saved
  })
  return metadata(row)
}

export async function deleteAiProviderSecretCandidate(
  db: SqlServerDatabase,
  input: DeleteAiProviderSecretCandidateInput,
  beforeCommit?: AiProviderSecretBeforeCommit,
): Promise<boolean> {
  return db.transaction('SERIALIZABLE', async manager => {
    const rows = await manager.query<Array<{ deletedId: string }>>(
      `DECLARE @deleted TABLE ([deletedId] uniqueidentifier NOT NULL);
       DELETE FROM [ai_provider_secret_versions] WITH (UPDLOCK, HOLDLOCK)
       OUTPUT DELETED.[id] INTO @deleted
       WHERE [id] = @0 AND [ai_connection_id] = @1
         AND [status] = N'candidate';
       SELECT [deletedId] FROM @deleted;`,
      [input.secretVersionId, input.connectionId],
    )
    const deleted = rows[0]?.deletedId === input.secretVersionId
    if (deleted) await beforeCommit?.(manager)
    return deleted
  })
}

export async function reencryptAiProviderSecrets(
  db: SqlServerDatabase,
  keyring: AiProviderSecretKeyring,
  input: { batchSize?: number; fromRootKeyVersion: string },
): Promise<{
  fromRootKeyVersion: string
  reencryptedCount: number
  skippedCount: number
  toRootKeyVersion: string
}> {
  const batchSize = input.batchSize ?? 100
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 1_000) {
    throw new Error('AI provider-secret rotation batch size must be 1-1000')
  }
  const toRootKeyVersion = keyring.activeWriteVersion
  if (input.fromRootKeyVersion === toRootKeyVersion) {
    return {
      fromRootKeyVersion: input.fromRootKeyVersion,
      reencryptedCount: 0,
      skippedCount: 0,
      toRootKeyVersion,
    }
  }
  let count = 0
  let cursor: string | null = null
  let skippedCount = 0
  while (true) {
    const batch = await db.transaction('SERIALIZABLE', async manager => {
      const rows = await manager.query<AiProviderSecretRow[]>(
        `SELECT TOP (${batchSize}) [id], [ai_connection_id] AS [connectionId],
         [revision_number] AS [revisionNumber], [status],
         [ciphertext], [nonce],
         [authentication_tag] AS [authenticationTag],
         [cipher_format_version] AS [formatVersion],
         [root_key_version] AS [rootKeyVersion],
         [created_at] AS [createdAt], [verified_at] AS [verifiedAt],
         [activated_at] AS [activatedAt],
         [revision_token] AS [revisionToken]
       FROM [ai_provider_secret_versions] WITH (UPDLOCK, HOLDLOCK)
       WHERE [root_key_version] = @0 AND [ciphertext] IS NOT NULL
         AND (@1 IS NULL OR [id] > CONVERT(uniqueidentifier, @1))
       ORDER BY [id]`,
        [input.fromRootKeyVersion, cursor],
      )
      let affectedRowCount = 0
      let batchSkippedCount = 0
      for (const row of rows) {
        const plaintext = decryptRow(keyring, row)
        const encrypted = encryptAiProviderSecret(
          keyring,
          { connectionId: row.connectionId, secretVersionId: row.id },
          plaintext,
        )
        const updatedRows = await manager.query<Array<{ updatedId: string }>>(
          `DECLARE @updated TABLE ([updatedId] uniqueidentifier NOT NULL);
         UPDATE [ai_provider_secret_versions]
         SET [ciphertext] = @1, [nonce] = @2, [authentication_tag] = @3,
           [cipher_format_version] = @4, [root_key_version] = @5,
           [revision_token] = NEWID()
         OUTPUT INSERTED.[id] INTO @updated
         WHERE [id] = @0 AND [revision_token] = @6
           AND [root_key_version] = @7;
         SELECT [updatedId] FROM @updated;`,
          [
            row.id,
            encrypted.ciphertext,
            encrypted.nonce,
            encrypted.authenticationTag,
            encrypted.formatVersion,
            encrypted.rootKeyVersion,
            row.revisionToken,
            input.fromRootKeyVersion,
          ],
        )
        affectedRowCount += updatedRows.length
        if (updatedRows.length === 0) batchSkippedCount += 1
      }
      return {
        affectedRowCount,
        cursor: rows.at(-1)?.id ?? null,
        selectedRowCount: rows.length,
        skippedCount: batchSkippedCount,
      }
    })
    count += batch.affectedRowCount
    skippedCount += batch.skippedCount
    if (batch.selectedRowCount === 0 || batch.cursor === null) break
    cursor = batch.cursor
    if (batch.selectedRowCount < batchSize) break
  }
  return {
    fromRootKeyVersion: input.fromRootKeyVersion,
    reencryptedCount: count,
    skippedCount,
    toRootKeyVersion,
  }
}

export async function listReferencedAiProviderSecretRootKeyVersions(
  db: SqlServerDatabase,
): Promise<readonly string[]> {
  const rows = await db.query<Array<{ rootKeyVersion: string }>>(
    `SELECT DISTINCT [root_key_version] AS [rootKeyVersion]
     FROM [ai_provider_secret_versions]
     WHERE [ciphertext] IS NOT NULL
     ORDER BY [root_key_version]`,
  )
  return rows.map(row => row.rootKeyVersion)
}

function withoutRootKeyVersion(
  keyring: AiProviderSecretKeyring,
  omittedRootKeyVersion: string,
): AiProviderSecretKeyring {
  return {
    activeWriteVersion: keyring.activeWriteVersion,
    formatVersion: keyring.formatVersion,
    keyForVersion(version: string): Buffer {
      if (version === omittedRootKeyVersion) {
        throw new AiProviderSecretKeyringError(
          'root_key_version_missing',
          'The requested AI provider-secret root-key version is unavailable.',
        )
      }
      return keyring.keyForVersion(version)
    },
    versions(): readonly string[] {
      return keyring
        .versions()
        .filter(version => version !== omittedRootKeyVersion)
    },
  }
}

/**
 * Restore verification boundary. It authenticates every retained encrypted
 * row and returns opaque identifiers plus pass/fail evidence only.
 */
export async function verifyAiProviderSecretRestoreSet(
  db: SqlServerDatabase,
  keyring: AiProviderSecretKeyring,
  options: { batchSize?: number; omitRootKeyVersion?: string } = {},
): Promise<AiProviderSecretRestoreVerificationReport> {
  const batchSize = options.batchSize ?? 100
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 1_000) {
    throw new Error('AI provider-secret restore batch size must be 1-1000')
  }
  const failureSampleLimit = 20
  const rootVersionSampleLimit = 100
  const failureSample: AiProviderSecretRestoreVerificationResult[] = []
  const referencedRootKeyVersions = new Set<string>()
  let referencedRootKeyVersionsTruncated = false
  let checkedSecretVersionCount = 0
  let failedSecretVersionCount = 0
  let cursor: string | null = null
  const verificationKeyring = options.omitRootKeyVersion
    ? withoutRootKeyVersion(keyring, options.omitRootKeyVersion)
    : keyring
  while (true) {
    const rows: AiProviderSecretRow[] = await db.query<AiProviderSecretRow[]>(
      `SELECT TOP (${batchSize}) [id], [ai_connection_id] AS [connectionId],
       [revision_number] AS [revisionNumber], [status],
       [ciphertext], [nonce], [authentication_tag] AS [authenticationTag],
       [cipher_format_version] AS [formatVersion],
       [root_key_version] AS [rootKeyVersion],
       [created_at] AS [createdAt], [verified_at] AS [verifiedAt],
       [activated_at] AS [activatedAt],
       [revision_token] AS [revisionToken]
     FROM [ai_provider_secret_versions]
     WHERE [ciphertext] IS NOT NULL
       AND (@0 IS NULL OR [id] > CONVERT(uniqueidentifier, @0))
     ORDER BY [id]`,
      [cursor],
    )
    if (rows.length === 0) break
    for (const row of rows) {
      checkedSecretVersionCount += 1
      if (referencedRootKeyVersions.size < rootVersionSampleLimit) {
        referencedRootKeyVersions.add(row.rootKeyVersion)
      } else if (!referencedRootKeyVersions.has(row.rootKeyVersion)) {
        referencedRootKeyVersionsTruncated = true
      }
      try {
        decryptRow(verificationKeyring, row)
      } catch (error) {
        failedSecretVersionCount += 1
        if (failureSample.length < failureSampleLimit) {
          const reason =
            error instanceof AiProviderSecretUnavailableError
              ? error.reason
              : 'authentication_failed'
          failureSample.push({
            available: false,
            connectionId: row.connectionId,
            reason,
            rootKeyVersion: row.rootKeyVersion,
            secretVersionId: row.id,
          })
        }
      }
    }
    cursor = rows.at(-1)?.id ?? null
    if (rows.length < batchSize) break
  }
  const compatible = failedSecretVersionCount === 0
  const omittedRootKeyVersion = options.omitRootKeyVersion ?? null
  return {
    batchSize,
    checkedSecretVersionCount,
    compatible,
    failedSecretVersionCount,
    failureSample,
    failureSampleLimit,
    failureSampleTruncated: failedSecretVersionCount > failureSample.length,
    omittedRootKeyVersion,
    referencedRootKeyVersions: [...referencedRootKeyVersions].sort(),
    referencedRootKeyVersionsTruncated,
    safeToRemoveOmittedRootKeyVersion:
      omittedRootKeyVersion === null
        ? null
        : compatible && keyring.activeWriteVersion !== omittedRootKeyVersion,
  }
}

/**
 * Trusted runtime boundary for transient adapter configuration. It resolves an
 * active credential only inside the integration layer's bounded callback and
 * never returns plaintext to routes or business services.
 */
export function createAiRuntimeAdapterConfigurationResolver(
  db: SqlServerDatabase,
  keyring: AiProviderSecretKeyring,
): AiAdapterConfigurationResolver {
  return async (profile, use): Promise<void> => {
    const connection = Object.freeze({
      ...(profile.connectionConfiguration ?? {}),
    })
    const modelRevision = Object.freeze({
      ...(profile.modelRevisionConfiguration ?? {}),
    })
    if (connection.authenticationType === 'none') {
      await use(Object.freeze({ connection, modelRevision }))
      return
    }

    const row = await selectActiveSecret(db, profile.connectionId)
    if (!row) {
      throw new AiProviderSecretUnavailableError(profile.connectionId, {
        available: false,
        reason: 'secret_missing',
      })
    }
    await use(
      Object.freeze({
        connection: Object.freeze({
          ...connection,
          credential: decryptRow(keyring, row),
        }),
        modelRevision,
      }),
    )
  }
}

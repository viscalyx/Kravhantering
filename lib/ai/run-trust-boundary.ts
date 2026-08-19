import Ajv from 'ajv'
import {
  type AiAuthorizedConnectionTarget,
  type AiConnectionTrustConfiguration,
  AiConnectionTrustError,
  type AiDeploymentTrustPolicy,
  authorizeAiConnectionTarget,
  createAiEgressTransport,
  enforceAiDataPolicy,
} from '@/lib/ai/connection-trust'
import {
  AiImageSanitizationError,
  type AiImageSanitizationLimits,
  sanitizeAiImage,
} from '@/lib/ai/image-sanitizer'
import type {
  AiEgressTransport,
  AiRunType,
  AiTaskEnvelope,
} from '@/lib/ai/run-contracts'

// cSpell:ignore callbackurl functioncall toolcall toolcalls

export interface AiSafetyFilterDecision {
  allowed: boolean
}

export interface AiContentSafetyFilter {
  screenInput(textParts: readonly string[]): Promise<AiSafetyFilterDecision>
  screenOutput(textParts: readonly string[]): Promise<AiSafetyFilterDecision>
}

export interface AiPreparedRun {
  egress: AiEgressTransport
  task: AiTaskEnvelope
}

export interface AiCompletedOutputForApproval {
  analysis: string | null
  quarantinedText: readonly string[]
  rawOutput: string
  responseSchema: Readonly<Record<string, unknown>>
}

export interface AiRunForPreparation {
  runType: AiRunType
  task: AiTaskEnvelope
  trustConfiguration: Readonly<AiConnectionTrustConfiguration>
}

export interface AiRunTrustBoundary {
  approveCompleted(input: AiCompletedOutputForApproval): Promise<void>
  prepareRun(input: AiRunForPreparation): Promise<Readonly<AiPreparedRun>>
}

export type AiRunTrustBoundaryErrorCode =
  | 'forbidden_activation'
  | 'image_rejected'
  | 'input_safety_blocked'
  | 'invalid_final_output'
  | 'invalid_response_schema'
  | 'output_safety_blocked'
  | 'safety_filter_failed'
  | 'trust_policy_blocked'

export class AiRunTrustBoundaryError extends Error {
  readonly code: AiRunTrustBoundaryErrorCode
  readonly safeMessage = 'The AI safety boundary blocked the request.'

  constructor(code: AiRunTrustBoundaryErrorCode) {
    super('The AI safety boundary blocked the request.')
    this.name = 'AiRunTrustBoundaryError'
    this.code = code
  }
}

export interface CreateAiRunTrustBoundaryOptions {
  deployment: AiDeploymentTrustPolicy
  imageLimits: Readonly<AiImageSanitizationLimits>
  safetyFilter: AiContentSafetyFilter
}

function blocked(code: AiRunTrustBoundaryErrorCode): never {
  throw new AiRunTrustBoundaryError(code)
}

async function screen(
  operation: () => Promise<AiSafetyFilterDecision>,
  blockedCode: 'input_safety_blocked' | 'output_safety_blocked',
): Promise<void> {
  let decision: AiSafetyFilterDecision
  try {
    decision = await operation()
  } catch {
    return blocked('safety_filter_failed')
  }
  if (decision?.allowed !== true) blocked(blockedCode)
}

const FORBIDDEN_ACTIVATION_KEYS = new Set([
  'callback',
  'callback_url',
  'callbackurl',
  'function_call',
  'functioncall',
  'tool_call',
  'tool_calls',
  'toolcall',
  'toolcalls',
  'tools',
])

function containsForbiddenActivation(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsForbiddenActivation)
  if (!value || typeof value !== 'object') return false
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_ACTIVATION_KEYS.has(key.toLowerCase())) return true
    if (containsForbiddenActivation(nested)) return true
  }
  return false
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (!value || typeof value !== 'object' || seen.has(value)) return value
  seen.add(value)
  for (const nested of Object.values(value)) deepFreeze(nested, seen)
  return Object.freeze(value)
}

function snapshotResponseSchema(
  schema: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  try {
    const snapshot: unknown = structuredClone(schema)
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
      return blocked('invalid_response_schema')
    }
    return deepFreeze(snapshot as Record<string, unknown>)
  } catch {
    return blocked('invalid_response_schema')
  }
}

function validateFinalOutput(
  rawOutput: string,
  responseSchema: Readonly<Record<string, unknown>>,
): void {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawOutput) as unknown
  } catch {
    blocked('invalid_final_output')
  }
  if (containsForbiddenActivation(parsed)) blocked('forbidden_activation')
  try {
    const ajv = new Ajv({ allErrors: false, strict: true })
    const validate = ajv.compile(responseSchema)
    if (!validate(parsed)) blocked('invalid_final_output')
  } catch (error) {
    if (error instanceof AiRunTrustBoundaryError) throw error
    blocked('invalid_final_output')
  }
}

async function sanitizedTask(
  task: AiTaskEnvelope,
  limits: Readonly<AiImageSanitizationLimits>,
): Promise<AiTaskEnvelope> {
  const responseSchema = snapshotResponseSchema(task.responseSchema)
  try {
    const content = await Promise.all(
      task.content.map(async part => {
        if (part.type === 'text') return Object.freeze({ ...part })
        const sanitized = await sanitizeAiImage(part, limits)
        return Object.freeze({
          data: sanitized.data,
          mediaType: sanitized.mediaType,
          type: 'image' as const,
        })
      }),
    )
    return Object.freeze({
      content: Object.freeze(content),
      instructions: task.instructions,
      responseSchema,
    })
  } catch (error) {
    if (error instanceof AiImageSanitizationError) {
      return blocked('image_rejected')
    }
    return blocked('image_rejected')
  }
}

export function createAiRunTrustBoundary(
  options: CreateAiRunTrustBoundaryOptions,
): AiRunTrustBoundary {
  return Object.freeze({
    async approveCompleted(input: AiCompletedOutputForApproval): Promise<void> {
      await screen(
        () =>
          options.safetyFilter.screenOutput(
            [
              ...input.quarantinedText,
              input.analysis ?? '',
              input.rawOutput,
            ].filter(Boolean),
          ),
        'output_safety_blocked',
      )
      validateFinalOutput(input.rawOutput, input.responseSchema)
    },
    async prepareRun(
      input: AiRunForPreparation,
    ): Promise<Readonly<AiPreparedRun>> {
      try {
        enforceAiDataPolicy(
          input.trustConfiguration,
          input.runType,
          options.deployment,
        )
      } catch (error) {
        if (error instanceof AiConnectionTrustError) {
          return blocked('trust_policy_blocked')
        }
        return blocked('trust_policy_blocked')
      }
      const task = await sanitizedTask(input.task, options.imageLimits)
      const textParts = [
        task.instructions,
        ...task.content.flatMap(part =>
          part.type === 'text' ? [part.text] : [],
        ),
      ]
      await screen(
        () => options.safetyFilter.screenInput(textParts),
        'input_safety_blocked',
      )
      let target: Readonly<AiAuthorizedConnectionTarget>
      try {
        target = await authorizeAiConnectionTarget(
          input.trustConfiguration,
          options.deployment,
        )
      } catch (error) {
        if (error instanceof AiConnectionTrustError) {
          return blocked('trust_policy_blocked')
        }
        return blocked('trust_policy_blocked')
      }
      return Object.freeze({
        egress: createAiEgressTransport(target, options.deployment),
        task,
      })
    },
  })
}

import type { ErrorObject } from 'ajv'
import Ajv2020 from 'ajv/dist/2020'
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
  AiRunValidationIssue,
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
  validationSchema: Readonly<Record<string, unknown>>
}

export type AiCompletedOutputApproval =
  | { valid: true }
  | { issues: readonly AiRunValidationIssue[]; valid: false }

export interface AiRunForPreparation {
  runType: AiRunType
  task: AiTaskEnvelope
  trustConfiguration: Readonly<AiConnectionTrustConfiguration>
}

export interface AiRunTrustBoundary {
  approveCompleted(
    input: AiCompletedOutputForApproval,
  ): Promise<AiCompletedOutputApproval>
  preflightSafetyRules(): Promise<void>
  prepareRun(input: AiRunForPreparation): Promise<Readonly<AiPreparedRun>>
}

export type AiRunTrustBoundaryErrorCode =
  | 'forbidden_activation'
  | 'image_rejected'
  | 'input_safety_blocked'
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

const MAX_RESPONSE_SCHEMA_ISSUES = 25

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

function appendJsonPointer(path: string, property: string): string {
  const escapedProperty = property.replaceAll('~', '~0').replaceAll('/', '~1')
  return `$${path}/${escapedProperty}`
}

function schemaIssue(error: ErrorObject): AiRunValidationIssue {
  if (error.keyword === 'required') {
    const missingProperty = String(error.params.missingProperty)
    return Object.freeze({
      code: error.keyword,
      message: `Required property '${missingProperty}' is missing.`,
      path: appendJsonPointer(error.instancePath, missingProperty),
    })
  }
  if (error.keyword === 'additionalProperties') {
    const additionalProperty = String(error.params.additionalProperty)
    return Object.freeze({
      code: error.keyword,
      message: `Property '${additionalProperty}' is not allowed at this location.`,
      path: appendJsonPointer(error.instancePath, additionalProperty),
    })
  }
  return Object.freeze({
    code: error.keyword,
    message: error.message ?? 'Generated response does not match the schema.',
    path: error.instancePath ? `$${error.instancePath}` : '$',
  })
}

function validateFinalOutput(
  rawOutput: string,
  responseSchema: Readonly<Record<string, unknown>>,
): AiCompletedOutputApproval {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawOutput) as unknown
  } catch {
    return {
      issues: [
        Object.freeze({
          code: 'invalid_json',
          message: 'Generated response is not valid JSON.',
          path: '$',
        }),
      ],
      valid: false,
    }
  }
  if (containsForbiddenActivation(parsed)) blocked('forbidden_activation')
  try {
    const ajv = new Ajv2020({
      allErrors: true,
      strict: true,
      strictSchema: false,
    })
    const validate = ajv.compile(responseSchema)
    if (!validate(parsed)) {
      return {
        issues: Object.freeze(
          (validate.errors ?? [])
            .slice(0, MAX_RESPONSE_SCHEMA_ISSUES)
            .map(error => schemaIssue(error)),
        ),
        valid: false,
      }
    }
  } catch (error) {
    if (error instanceof AiRunTrustBoundaryError) throw error
    blocked('invalid_response_schema')
  }
  return { valid: true }
}

async function sanitizedTask(
  task: AiTaskEnvelope,
  limits: Readonly<AiImageSanitizationLimits>,
): Promise<AiTaskEnvelope> {
  const responseSchema = snapshotResponseSchema(task.responseSchema)
  const validationSchema = snapshotResponseSchema(task.validationSchema)
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
      validationSchema,
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
    async approveCompleted(
      input: AiCompletedOutputForApproval,
    ): Promise<AiCompletedOutputApproval> {
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
      return validateFinalOutput(input.rawOutput, input.validationSchema)
    },
    async preflightSafetyRules(): Promise<void> {
      await screen(
        () => options.safetyFilter.screenInput([]),
        'input_safety_blocked',
      )
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

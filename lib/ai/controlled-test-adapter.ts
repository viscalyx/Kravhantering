import { SAFE_AI_TECHNICAL_CODE } from './requirement-prompt'
import type {
  AIConnectionAdapter,
  AiConnectionAdapterRegistration,
  AiConnectionAdapterRunRequest,
  AiRunCancellationReason,
  AiRunEvent,
  AiRunFailure,
  AiRunIdentity,
  AiRunUsage,
} from './run-contracts'
import {
  AI_OPTIONAL_CAPABILITIES,
  AI_RUN_CANCELLATION_REASONS,
  AI_RUN_FAILURE_CATEGORIES,
  AI_UNAVAILABLE_USAGE_REASONS,
} from './run-contracts'

export const CONTROLLED_TEST_ADAPTER_TYPE = 'controlled_test'
export const CONTROLLED_TEST_ADAPTER_VERSION = '1'

export interface ControlledTestCompletedScenario {
  analysis?: string | null
  analysisDeltas?: readonly string[]
  output: string
  outputDeltas?: readonly string[]
  type: 'completed'
  usage: AiRunUsage
}

export interface ControlledTestFailedScenario extends AiRunFailure {
  type: 'failed'
}

export interface ControlledTestCancelledScenario {
  reason: AiRunCancellationReason
  type: 'cancelled'
}

export interface ControlledTestWaitForAbortScenario {
  type: 'wait_for_abort'
}

export interface ControlledTestSilentEofScenario {
  type: 'silent_eof'
}

export interface ControlledTestReadErrorScenario {
  type: 'read_error'
}

export type ControlledTestScenario =
  | ControlledTestCancelledScenario
  | ControlledTestCompletedScenario
  | ControlledTestFailedScenario
  | ControlledTestReadErrorScenario
  | ControlledTestSilentEofScenario
  | ControlledTestWaitForAbortScenario

export interface ControlledTestAdapterConfiguration {
  scenario: ControlledTestScenario
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isUsageMetric(
  value: unknown,
  hasValidValue: (candidate: unknown) => boolean,
): boolean {
  if (!isRecord(value) || typeof value.status !== 'string') return false
  if (value.status === 'unavailable') {
    return AI_UNAVAILABLE_USAGE_REASONS.some(reason => reason === value.reason)
  }
  if (value.status === 'reported') return hasValidValue(value.value)
  return (
    value.status === 'calculated' &&
    typeof value.calculatedAt === 'string' &&
    Number.isFinite(Date.parse(value.calculatedAt)) &&
    hasValidValue(value.value)
  )
}

function isTokenCount(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isCost(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.amount === 'string' &&
    /^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(value.amount) &&
    typeof value.currency === 'string' &&
    /^[A-Z]{3}$/u.test(value.currency)
  )
}

function isRunUsage(value: unknown): value is AiRunUsage {
  return (
    isRecord(value) &&
    isUsageMetric(value.analysisTokens, isTokenCount) &&
    isUsageMetric(value.cost, isCost) &&
    isUsageMetric(value.inputTokens, isTokenCount) &&
    isUsageMetric(value.outputTokens, isTokenCount) &&
    isUsageMetric(value.totalTokens, isTokenCount)
  )
}

function isSafeDiagnosticCode(value: unknown): boolean {
  return (
    value === undefined ||
    (typeof value === 'string' && SAFE_AI_TECHNICAL_CODE.test(value))
  )
}

function isRetryAfterSeconds(value: unknown): boolean {
  return (
    value === undefined ||
    (typeof value === 'number' && Number.isInteger(value) && value > 0)
  )
}

function readConfiguration(
  value: unknown,
): ControlledTestAdapterConfiguration | null {
  if (!isRecord(value)) return null
  let configuration = value
  if (
    !('scenario' in configuration) &&
    typeof configuration.credential === 'string'
  ) {
    try {
      const parsed: unknown = JSON.parse(configuration.credential)
      if (!isRecord(parsed)) return null
      configuration = parsed
    } catch {
      return null
    }
  }
  const { scenario } = configuration
  if (!isRecord(scenario)) return null
  if (scenario.type === 'completed') {
    if (
      typeof scenario.output !== 'string' ||
      (scenario.analysis !== undefined &&
        scenario.analysis !== null &&
        typeof scenario.analysis !== 'string') ||
      (scenario.analysisDeltas !== undefined &&
        (!Array.isArray(scenario.analysisDeltas) ||
          scenario.analysisDeltas.some(delta => typeof delta !== 'string'))) ||
      (Array.isArray(scenario.analysisDeltas) &&
        scenario.analysisDeltas.length > 0 &&
        typeof scenario.analysis !== 'string') ||
      (scenario.outputDeltas !== undefined &&
        (!Array.isArray(scenario.outputDeltas) ||
          scenario.outputDeltas.some(delta => typeof delta !== 'string'))) ||
      !isRunUsage(scenario.usage)
    ) {
      return null
    }
  } else if (scenario.type === 'cancelled') {
    if (
      typeof scenario.reason !== 'string' ||
      !AI_RUN_CANCELLATION_REASONS.some(reason => reason === scenario.reason)
    ) {
      return null
    }
  } else if (scenario.type === 'failed') {
    if (
      typeof scenario.category !== 'string' ||
      !AI_RUN_FAILURE_CATEGORIES.some(
        category => category === scenario.category,
      ) ||
      !isSafeDiagnosticCode(scenario.diagnosticCode) ||
      !isRetryAfterSeconds(scenario.retryAfterSeconds) ||
      typeof scenario.retryable !== 'boolean'
    ) {
      return null
    }
  } else if (
    scenario.type !== 'read_error' &&
    scenario.type !== 'silent_eof' &&
    scenario.type !== 'wait_for_abort'
  ) {
    return null
  }
  return configuration as unknown as ControlledTestAdapterConfiguration
}

function identity(request: AiConnectionAdapterRunRequest): AiRunIdentity {
  return {
    aiConnectionId: request.connection.id,
    aiConnectionModelRevisionId: request.modelRevision.id,
    aiRunProfileConfigurationVersion: request.runProfileConfigurationVersion,
    aiRunProfileId: request.runProfileId,
  }
}

async function waitForAbort(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return
  await new Promise<void>(resolve => {
    signal.addEventListener('abort', () => resolve(), { once: true })
    if (signal.aborted) resolve()
  })
}

const controlledTestAdapter: AIConnectionAdapter = {
  forceClose: () => undefined,
  async *run(
    request: AiConnectionAdapterRunRequest,
  ): AsyncIterable<AiRunEvent> {
    if (request.context.abortSignal.aborted) {
      yield {
        identity: identity(request),
        reason: 'application_cancelled',
        type: 'cancelled',
      }
      return
    }
    const configuration = readConfiguration(request.connection.configuration)
    if (!configuration) {
      yield {
        failure: {
          category: 'adapter_failure',
          diagnosticCode: 'invalid_controlled_test_configuration',
          retryable: false,
        },
        identity: identity(request),
        type: 'failed',
      }
      return
    }

    const missingCapability = AI_OPTIONAL_CAPABILITIES.find(
      capability =>
        request.selectedCapabilities[capability] &&
        !request.modelRevision.verifiedCapabilities[capability],
    )
    if (missingCapability) {
      yield {
        failure: {
          category: 'capability_mismatch',
          diagnosticCode: `controlled_capability_mismatch:${missingCapability}`,
          retryable: false,
        },
        identity: identity(request),
        type: 'failed',
      }
      return
    }

    const scenario = configuration.scenario
    if (scenario.type === 'read_error') {
      throw new Error('controlled test stream read failure')
    }
    if (scenario.type === 'silent_eof') return
    if (scenario.type === 'wait_for_abort') {
      await waitForAbort(request.context.abortSignal)
      yield {
        identity: identity(request),
        reason: 'application_cancelled',
        type: 'cancelled',
      }
      return
    }
    if (scenario.type === 'cancelled') {
      yield {
        identity: identity(request),
        reason: scenario.reason,
        type: 'cancelled',
      }
      return
    }
    if (scenario.type === 'failed') {
      const { type: _type, ...failure } = scenario
      yield { failure, identity: identity(request), type: 'failed' }
      return
    }
    for (const delta of scenario.analysisDeltas ?? []) {
      yield { delta, type: 'analysis_delta' }
    }
    for (const delta of scenario.outputDeltas ?? []) {
      yield { delta, type: 'output_delta', visibility: 'internal' }
    }
    yield {
      analysis: scenario.analysis ?? null,
      identity: identity(request),
      rawOutput: scenario.output,
      type: 'completed',
      usage: scenario.usage,
    }
  },
}

export const controlledTestAdapterRegistration = Object.freeze({
  adapter: controlledTestAdapter,
  adapterType: CONTROLLED_TEST_ADAPTER_TYPE,
  adapterVersion: CONTROLLED_TEST_ADAPTER_VERSION,
}) satisfies AiConnectionAdapterRegistration

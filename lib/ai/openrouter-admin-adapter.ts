import { randomUUID } from 'node:crypto'
import type {
  AiAdminAdapterContext,
  AiAdminConnectionAdapter,
  AiAdminConnectionAdapterRegistration,
  AiAdminFunctionalProbe,
  AiAdminNegativeProbeCase,
} from './admin-adapter'
import { AI_ADMIN_PROBE_LIMITS } from './admin-adapter'
import type { AiCapability } from './admin-contracts'
import type {
  AiAdminCapabilitySupportMap,
  AiAdminCatalogItem,
  AiAdminModelRevisionRecord,
} from './admin-service'
import {
  OPENROUTER_ADAPTER_TYPE,
  OPENROUTER_ADAPTER_VERSION,
  openRouterAdapterRegistration,
} from './openrouter-adapter'
import type {
  AiConnectionId,
  AiConnectionModelRevisionId,
  AiExternalRunId,
  AiRunEvent,
  AiRunProfileId,
} from './run-contracts'
import { AI_REQUEST_PRIVACY_MINIMUM } from './run-contracts'

const MAX_CATALOG_BYTES = 4 * 1024 * 1024
const ADMIN_GET_TIMEOUT_MS = 15_000
const ADMIN_PROBE_PROFILE_REVISION_ID =
  '00000000-0000-4000-8000-000000000865' as AiRunProfileId

interface CatalogModel {
  architecture?: { modality?: unknown }
  id?: unknown
  name?: unknown
  pricing?: { completion?: unknown; prompt?: unknown }
  reasoning?: unknown
  supported_parameters?: unknown
}

const CATALOG_PRICE_PATTERN = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,24})?$/u

class OpenRouterAdminRequestError extends Error {
  readonly category: string
  readonly diagnosticCode: string

  constructor(
    category: string,
    diagnosticCode: string,
    message = 'The AI provider administration request failed.',
  ) {
    super(message)
    this.name = 'OpenRouterAdminRequestError'
    this.category = category
    this.diagnosticCode = diagnosticCode
  }
}

function modelsUrl(endpointUrl: string): string {
  const endpoint = new URL(endpointUrl)
  endpoint.pathname = `${endpoint.pathname.replace(/\/$/u, '')}/models`
  return endpoint.toString()
}

async function readCatalog(
  response: Response,
): Promise<readonly CatalogModel[]> {
  if (!response.ok) {
    throw new OpenRouterAdminRequestError(
      response.status === 401 || response.status === 403
        ? 'authentication_failed'
        : response.status === 408 || response.status === 504
          ? 'deadline_exceeded'
          : response.status === 429
            ? 'rate_limited'
            : response.status >= 500
              ? 'provider_unavailable'
              : 'request_rejected',
      `openrouter_admin_models_http_${response.status}`,
    )
  }
  const declaredLength = Number(response.headers.get('content-length') ?? 0)
  if (declaredLength > MAX_CATALOG_BYTES) {
    throw new OpenRouterAdminRequestError(
      'invalid_response',
      'openrouter_admin_catalog_too_large',
      'The AI provider catalog exceeded its size limit.',
    )
  }
  const chunks: Uint8Array[] = []
  let receivedBytes = 0
  const reader = response.body?.getReader()
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        receivedBytes += value.byteLength
        if (receivedBytes > MAX_CATALOG_BYTES) {
          await reader.cancel().catch(() => undefined)
          throw new OpenRouterAdminRequestError(
            'invalid_response',
            'openrouter_admin_catalog_too_large',
            'The AI provider catalog exceeded its size limit.',
          )
        }
        chunks.push(value)
      }
    } finally {
      reader.releaseLock()
    }
  }
  const bytes = new Uint8Array(receivedBytes)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    throw new OpenRouterAdminRequestError(
      'invalid_response',
      'openrouter_admin_catalog_invalid_json',
      'The AI provider returned an invalid catalog.',
    )
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !Array.isArray((parsed as { data?: unknown }).data)
  ) {
    throw new OpenRouterAdminRequestError(
      'invalid_response',
      'openrouter_admin_catalog_invalid_shape',
      'The AI provider returned an invalid catalog.',
    )
  }
  return (parsed as { data: CatalogModel[] }).data
}

async function fetchModels(
  context: Readonly<AiAdminAdapterContext>,
  probe?: Readonly<{ abortSignal: AbortSignal; deadlineAt: string }>,
): Promise<readonly CatalogModel[]> {
  const controller = new AbortController()
  const abortFromProbe = (): void => controller.abort()
  if (probe?.abortSignal.aborted) controller.abort()
  else
    probe?.abortSignal.addEventListener('abort', abortFromProbe, { once: true })
  const remaining = probe
    ? Math.max(0, new Date(probe.deadlineAt).getTime() - Date.now())
    : ADMIN_GET_TIMEOUT_MS
  const timeout = setTimeout(
    () => controller.abort(),
    Math.min(ADMIN_GET_TIMEOUT_MS, remaining),
  )
  const headers = new Headers({ accept: 'application/json' })
  if (context.credential)
    headers.set('authorization', `Bearer ${context.credential}`)
  try {
    const response = await context.egress.fetch(
      modelsUrl(context.connection.endpointUrl),
      {
        headers,
        method: 'GET',
        redirect: 'error',
        signal: controller.signal,
      },
    )
    return await readCatalog(response)
  } catch (error) {
    if (error instanceof OpenRouterAdminRequestError) throw error
    throw new OpenRouterAdminRequestError(
      controller.signal.aborted ? 'deadline_exceeded' : 'provider_unavailable',
      controller.signal.aborted
        ? 'openrouter_admin_deadline_exceeded'
        : 'openrouter_admin_request_failed',
    )
  } finally {
    clearTimeout(timeout)
    probe?.abortSignal.removeEventListener('abort', abortFromProbe)
    controller.abort()
  }
}

function capabilities(model: CatalogModel): AiCapability {
  const parameters = Array.isArray(model.supported_parameters)
    ? model.supported_parameters.filter(
        (value): value is string => typeof value === 'string',
      )
    : []
  const modality =
    typeof model.architecture?.modality === 'string'
      ? model.architecture.modality
      : ''
  const structured =
    parameters.includes('response_format') ||
    parameters.includes('structured_outputs')
  return {
    aiAnalysis: false,
    cost: true,
    imageInput: modality.includes('image'),
    jsonSchemaSteering: structured,
    streaming: true,
    tokenUsage: true,
    validatableJson: structured,
  }
}

function capabilitySupport(
  model: Readonly<CatalogModel>,
  value: Readonly<AiCapability>,
): AiAdminCapabilitySupportMap {
  const parameters = Array.isArray(model.supported_parameters)
    ? model.supported_parameters.filter(
        (parameter): parameter is string => typeof parameter === 'string',
      )
    : []
  const reasoningAdvertised =
    parameters.includes('reasoning') ||
    parameters.includes('include_reasoning') ||
    (typeof model.reasoning === 'object' &&
      model.reasoning !== null &&
      !Array.isArray(model.reasoning))
  return {
    aiAnalysis: reasoningAdvertised ? 'unknown' : 'unsupported',
    cost: value.cost ? 'supported' : 'unsupported',
    imageInput: value.imageInput ? 'supported' : 'unsupported',
    jsonSchemaSteering: value.jsonSchemaSteering ? 'supported' : 'unsupported',
    streaming: value.streaming ? 'supported' : 'unsupported',
    tokenUsage: value.tokenUsage ? 'supported' : 'unsupported',
    validatableJson: value.validatableJson ? 'supported' : 'unsupported',
  }
}

function runOpenRouterAdminProbe(
  context: Readonly<AiAdminAdapterContext>,
  revision: Readonly<AiAdminModelRevisionRecord>,
  probe: Readonly<AiAdminFunctionalProbe>,
): AsyncIterable<AiRunEvent> {
  return openRouterAdapterRegistration.adapter.run({
    connection: {
      configuration: {
        apiKey: context.credential ?? '',
        endpoint: context.connection.endpointUrl,
      },
      id: context.connection.id as AiConnectionId,
    },
    context: {
      abortSignal: probe.abortSignal,
      deadlineAt: probe.deadlineAt,
      egress: context.egress,
      externalRunId: `admin_probe_${randomUUID()}` as AiExternalRunId,
    },
    limits: AI_ADMIN_PROBE_LIMITS,
    modelRevision: {
      configuration: {
        reasoningEffort: probe.selectedCapabilities.aiAnalysis
          ? 'high'
          : 'none',
      },
      externalModelId: revision.externalModelId,
      id: revision.id as AiConnectionModelRevisionId,
      verifiedCapabilities: revision.declaredCapabilities,
    },
    privacyPolicy: AI_REQUEST_PRIVACY_MINIMUM,
    runProfileConfigurationVersion: 1,
    runProfileId: ADMIN_PROBE_PROFILE_REVISION_ID,
    selectedCapabilities: probe.selectedCapabilities,
    task: probe.task,
  })
}

function runOpenRouterNegativeProbe(
  context: Readonly<AiAdminAdapterContext>,
  revision: Readonly<AiAdminModelRevisionRecord>,
  probe: Readonly<AiAdminFunctionalProbe>,
  negativeCase: AiAdminNegativeProbeCase,
): AsyncIterable<AiRunEvent> {
  const field =
    negativeCase === 'prohibited_callback'
      ? 'callback'
      : negativeCase === 'prohibited_function_call'
        ? 'function_call'
        : 'tool_calls'
  return runOpenRouterAdminProbe(
    {
      ...context,
      egress: {
        fetch: async () =>
          negativeCase === 'safe_provider_error'
            ? new Response('raw-provider-secret-must-not-escape', {
                status: 503,
              })
            : new Response(
                JSON.stringify({
                  choices: [
                    { message: { content: '{"probe":"ok"}', [field]: [] } },
                  ],
                  usage: {},
                }),
                { headers: { 'content-type': 'application/json' } },
              ),
      },
    },
    revision,
    {
      abortSignal: probe.abortSignal,
      deadlineAt: probe.deadlineAt,
      selectedCapabilities: probe.selectedCapabilities,
      task: probe.task,
    },
  )
}

function catalogItem(model: CatalogModel): AiAdminCatalogItem | null {
  if (typeof model.id !== 'string' || typeof model.name !== 'string')
    return null
  const providerNamespace = model.id.includes('/')
    ? (model.id.split('/')[0]?.trim() ?? '')
    : ''
  const modelCapabilities = capabilities(model)
  return {
    capabilities: modelCapabilities,
    capabilitySupport: capabilitySupport(model, modelCapabilities),
    externalModelId: model.id,
    externalModelVersion: null,
    inputPricePerMillionTokens: pricePerMillionTokens(model.pricing?.prompt),
    modelProviderName: providerNamespace || null,
    name: model.name,
    outputPricePerMillionTokens: pricePerMillionTokens(
      model.pricing?.completion,
    ),
  }
}

function pricePerMillionTokens(
  value: unknown,
): AiAdminCatalogItem['inputPricePerMillionTokens'] {
  if (typeof value !== 'string' || !CATALOG_PRICE_PATTERN.test(value)) {
    return null
  }
  const [whole = '0', fraction = ''] = value.split('.')
  const digits = `${whole}${fraction}`
  const decimalPosition = whole.length + 6
  const scaled =
    decimalPosition >= digits.length
      ? digits.padEnd(decimalPosition, '0')
      : `${digits.slice(0, decimalPosition)}.${digits.slice(decimalPosition)}`
  const [scaledWhole = '0', scaledFraction = ''] = scaled.split('.')
  const normalizedWhole = scaledWhole.replace(/^0+(?=\d)/u, '')
  const normalizedFraction = scaledFraction.replace(/0+$/u, '')
  return {
    amount: normalizedFraction
      ? `${normalizedWhole}.${normalizedFraction}`
      : normalizedWhole,
    currency: 'USD',
  }
}

const openRouterAdminAdapter: AiAdminConnectionAdapter = {
  async fetchCatalog(context) {
    return (await fetchModels(context)).flatMap(model => {
      const item = catalogItem(model)
      return item ? [item] : []
    })
  },
  async probeConnection(context, probe) {
    try {
      await fetchModels(context, probe)
      return {
        details: { catalogReachable: true },
        diagnosticCode: null,
        failureCategory: null,
        outcome: 'passed',
        testSuiteVersion: 'openrouter-admin-v1',
      }
    } catch (error) {
      return {
        details: { catalogReachable: false },
        diagnosticCode:
          error instanceof OpenRouterAdminRequestError
            ? error.diagnosticCode
            : 'openrouter_admin_request_failed',
        failureCategory:
          error instanceof OpenRouterAdminRequestError
            ? error.category
            : 'provider_unavailable',
        outcome: 'failed',
        testSuiteVersion: 'openrouter-admin-v1',
      }
    }
  },
  runFunctionalProbe(context, revision, probe) {
    return runOpenRouterAdminProbe(context, revision, probe)
  },
  runActivationCancellationProbe(context, revision, probe) {
    return runOpenRouterAdminProbe(context, revision, probe)
  },
  runActivationNegativeProbe(context, revision, probe, negativeCase) {
    return runOpenRouterNegativeProbe(context, revision, probe, negativeCase)
  },
  async verifySecretCandidate(context) {
    await fetchModels(context)
  },
}

export const openRouterAdminAdapterRegistration = Object.freeze({
  adapter: openRouterAdminAdapter,
  adapterType: OPENROUTER_ADAPTER_TYPE,
  adapterVersion: OPENROUTER_ADAPTER_VERSION,
  executionKind: 'external_live',
}) satisfies AiAdminConnectionAdapterRegistration

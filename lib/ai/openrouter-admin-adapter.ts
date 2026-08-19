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
  AiRunProfileRevisionId,
} from './run-contracts'

const MAX_CATALOG_BYTES = 4 * 1024 * 1024
const ADMIN_GET_TIMEOUT_MS = 15_000
const ADMIN_PROBE_PROFILE_REVISION_ID =
  '00000000-0000-4000-8000-000000000865' as AiRunProfileRevisionId

interface CatalogModel {
  architecture?: { modality?: unknown }
  id?: unknown
  name?: unknown
  supported_parameters?: unknown
}

class OpenRouterAdminRequestError extends Error {
  readonly category: string

  constructor(
    category: string,
    message = 'The AI provider administration request failed.',
  ) {
    super(message)
    this.name = 'OpenRouterAdminRequestError'
    this.category = category
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
    )
  }
  const declaredLength = Number(response.headers.get('content-length') ?? 0)
  if (declaredLength > MAX_CATALOG_BYTES) {
    throw new OpenRouterAdminRequestError(
      'invalid_response',
      'The AI provider catalog exceeded its size limit.',
    )
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength > MAX_CATALOG_BYTES) {
    throw new OpenRouterAdminRequestError(
      'invalid_response',
      'The AI provider catalog exceeded its size limit.',
    )
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    throw new OpenRouterAdminRequestError(
      'invalid_response',
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
      'The AI provider returned an invalid catalog.',
    )
  }
  return (parsed as { data: CatalogModel[] }).data
}

async function fetchModels(
  context: Readonly<AiAdminAdapterContext>,
): Promise<readonly CatalogModel[]> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ADMIN_GET_TIMEOUT_MS)
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
    )
  } finally {
    clearTimeout(timeout)
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
    aiAnalysis: parameters.includes('reasoning'),
    cost: true,
    imageInput: modality.includes('image'),
    jsonSchemaSteering: structured,
    streaming: parameters.includes('stream'),
    tokenUsage: true,
    validatableJson: structured,
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
      configuration: {},
      externalModelId: revision.externalModelId,
      id: revision.id as AiConnectionModelRevisionId,
      verifiedCapabilities: revision.declaredCapabilities,
    },
    runProfileRevisionId: ADMIN_PROBE_PROFILE_REVISION_ID,
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
  const response =
    negativeCase === 'safe_provider_error'
      ? new Response('raw-provider-secret-must-not-escape', { status: 503 })
      : new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"probe":"ok"}', [field]: [] } }],
            usage: {},
          }),
          { headers: { 'content-type': 'application/json' } },
        )
  return runOpenRouterAdminProbe(
    {
      ...context,
      egress: { fetch: async () => response },
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
  return {
    capabilities: capabilities(model),
    externalModelId: model.id,
    externalModelVersion: null,
    name: model.name,
  }
}

const openRouterAdminAdapter: AiAdminConnectionAdapter = {
  async fetchCatalog(context) {
    return (await fetchModels(context)).flatMap(model => {
      const item = catalogItem(model)
      return item ? [item] : []
    })
  },
  async probeConnection(context) {
    try {
      await fetchModels(context)
      return {
        details: { catalogReachable: true },
        failureCategory: null,
        outcome: 'passed',
        testSuiteVersion: 'openrouter-admin-v1',
      }
    } catch (error) {
      return {
        details: { catalogReachable: false },
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
}) satisfies AiAdminConnectionAdapterRegistration

import { randomUUID } from 'node:crypto'
import type {
  AiAdminAdapterContext,
  AiAdminConnectionAdapter,
  AiAdminConnectionAdapterRegistration,
} from './admin-adapter'
import type { AiCapability } from './admin-contracts'
import type { AiAdminCatalogItem } from './admin-service'
import {
  OPENROUTER_ADAPTER_TYPE,
  OPENROUTER_ADAPTER_VERSION,
  openRouterAdapterRegistration,
} from './openrouter-adapter'
import type {
  AiConnectionId,
  AiConnectionModelRevisionId,
  AiExternalRunId,
  AiRunProfileRevisionId,
} from './run-contracts'

const MAX_CATALOG_BYTES = 4 * 1024 * 1024
const ADMIN_PROBE_PROFILE_REVISION_ID =
  '00000000-0000-4000-8000-000000000865' as AiRunProfileRevisionId

interface CatalogModel {
  architecture?: { modality?: unknown }
  id?: unknown
  name?: unknown
  supported_parameters?: unknown
}

function modelsUrl(endpointUrl: string): string {
  const endpoint = new URL(endpointUrl)
  endpoint.pathname = `${endpoint.pathname.replace(/\/$/u, '')}/models`
  return endpoint.toString()
}

async function readCatalog(
  response: Response,
): Promise<readonly CatalogModel[]> {
  if (!response.ok) throw new Error('The AI provider rejected the request.')
  const declaredLength = Number(response.headers.get('content-length') ?? 0)
  if (declaredLength > MAX_CATALOG_BYTES) {
    throw new Error('The AI provider catalog exceeded its size limit.')
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength > MAX_CATALOG_BYTES) {
    throw new Error('The AI provider catalog exceeded its size limit.')
  }
  const parsed: unknown = JSON.parse(
    new TextDecoder('utf-8', { fatal: true }).decode(bytes),
  )
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !Array.isArray((parsed as { data?: unknown }).data)
  ) {
    throw new Error('The AI provider returned an invalid catalog.')
  }
  return (parsed as { data: CatalogModel[] }).data
}

async function fetchModels(
  context: Readonly<AiAdminAdapterContext>,
): Promise<readonly CatalogModel[]> {
  const headers = new Headers({ accept: 'application/json' })
  if (context.credential)
    headers.set('authorization', `Bearer ${context.credential}`)
  const response = await context.egress.fetch(
    modelsUrl(context.connection.endpointUrl),
    {
      headers,
      method: 'GET',
      redirect: 'error',
    },
  )
  return readCatalog(response)
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
    } catch {
      return {
        details: { catalogReachable: false },
        failureCategory: 'provider_unavailable',
        outcome: 'failed',
        testSuiteVersion: 'openrouter-admin-v1',
      }
    }
  },
  runFunctionalProbe(context, revision, probe) {
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

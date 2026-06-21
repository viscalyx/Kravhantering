import {
  getDefaultModel,
  listModels,
  type OpenRouterModel,
} from '@/lib/ai/openrouter-client'

export const OPENROUTER_STRUCTURED_OUTPUTS_PARAMETER = 'structured_outputs'

const LOCAL_MODEL_FILTERS = new Set(['vision'])

export class OpenRouterModelCatalogError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OpenRouterModelCatalogError'
  }
}

export interface OpenRouterModelCatalogOptions {
  supportedParameters?: string[]
}

function uniqueParameters(parameters: string[]): string[] {
  return parameters.filter((parameter, index) => {
    return parameters.indexOf(parameter) === index
  })
}

function splitSupportedParameters(supportedParameters?: string[]): {
  localParameters: string[]
  providerParameters: string[] | undefined
} {
  const requested = uniqueParameters(supportedParameters ?? [])
  const providerParameters = requested.filter(
    parameter => !LOCAL_MODEL_FILTERS.has(parameter),
  )
  const localParameters = requested.filter(parameter =>
    LOCAL_MODEL_FILTERS.has(parameter),
  )

  return {
    localParameters,
    providerParameters:
      providerParameters.length > 0 ? providerParameters : undefined,
  }
}

function enrichModelCapabilities(
  models: OpenRouterModel[],
  structuredModels: OpenRouterModel[],
): OpenRouterModel[] {
  const structuredIds = new Set(structuredModels.map(model => model.id))

  return models.map(model => {
    const extra: string[] = []
    if (structuredIds.has(model.id)) {
      extra.push(OPENROUTER_STRUCTURED_OUTPUTS_PARAMETER)
    }
    if (model.modality?.includes('image')) {
      extra.push('vision')
    }

    return extra.length > 0
      ? {
          ...model,
          supportedParameters: uniqueParameters([
            ...model.supportedParameters,
            ...extra,
          ]),
        }
      : model
  })
}

export async function listOpenRouterModelCatalog(
  options: OpenRouterModelCatalogOptions = {},
): Promise<OpenRouterModel[]> {
  const { localParameters, providerParameters } = splitSupportedParameters(
    options.supportedParameters,
  )
  const structuredFilter = uniqueParameters([
    ...(providerParameters ?? []),
    OPENROUTER_STRUCTURED_OUTPUTS_PARAMETER,
  ])

  const [models, structuredModels] = await Promise.all([
    listModels(providerParameters),
    listModels(structuredFilter),
  ])
  const enrichedModels = enrichModelCapabilities(models, structuredModels)

  return localParameters.length > 0
    ? enrichedModels.filter(model =>
        localParameters.every(parameter =>
          model.supportedParameters.includes(parameter),
        ),
      )
    : enrichedModels
}

export async function resolveOpenRouterModelCapabilities(
  model?: string,
): Promise<OpenRouterModel> {
  const modelId = model || getDefaultModel()
  const models = await listOpenRouterModelCatalog()
  const resolved = models.find(candidate => candidate.id === modelId)
  if (!resolved) {
    throw new OpenRouterModelCatalogError(
      `OpenRouter model is not available in the eligible catalog: ${modelId}`,
    )
  }
  return resolved
}

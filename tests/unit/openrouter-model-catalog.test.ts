import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  listOpenRouterModelCatalog,
  OpenRouterModelCatalogError,
  resolveOpenRouterModelCapabilities,
} from '@/lib/ai/openrouter-model-catalog'

const mocks = vi.hoisted(() => ({
  getDefaultModel: vi.fn(),
  listModels: vi.fn(),
}))

vi.mock('@/lib/ai/openrouter-client', () => ({
  getDefaultModel: mocks.getDefaultModel,
  listModels: mocks.listModels,
}))

describe('openrouter model catalog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getDefaultModel.mockReturnValue('anthropic/claude-sonnet-4')
  })

  it('enriches provider models with structured output and vision capabilities', async () => {
    const visionModel = {
      contextLength: 200000,
      id: 'openai/gpt-5-vision',
      modality: 'text+image->text',
      name: 'GPT-5 Vision',
      pricing: { completion: '0', prompt: '0', reasoning: '0' },
      provider: 'openai',
      supportedParameters: ['reasoning', 'stream', 'response_format'],
    }
    const textModel = {
      contextLength: 200000,
      id: 'anthropic/claude-sonnet-4',
      modality: 'text->text',
      name: 'Claude Sonnet 4',
      pricing: { completion: '0', prompt: '0', reasoning: '0' },
      provider: 'anthropic',
      supportedParameters: ['reasoning', 'stream', 'response_format'],
    }
    mocks.listModels
      .mockResolvedValueOnce([visionModel, textModel])
      .mockResolvedValueOnce([textModel])

    const catalog = await listOpenRouterModelCatalog({
      supportedParameters: ['vision'],
    })

    expect(mocks.listModels).toHaveBeenNthCalledWith(1, undefined)
    expect(mocks.listModels).toHaveBeenNthCalledWith(2, ['structured_outputs'])
    expect(catalog).toEqual([
      expect.objectContaining({
        id: 'openai/gpt-5-vision',
        supportedParameters: [
          'reasoning',
          'stream',
          'response_format',
          'vision',
        ],
      }),
    ])
  })

  it('resolves the requested model from the eligible catalog', async () => {
    const model = {
      contextLength: 200000,
      id: 'anthropic/claude-sonnet-4',
      name: 'Claude Sonnet 4',
      pricing: { completion: '0', prompt: '0', reasoning: '0' },
      provider: 'anthropic',
      supportedParameters: ['reasoning', 'stream', 'response_format'],
    }
    mocks.listModels
      .mockResolvedValueOnce([model])
      .mockResolvedValueOnce([model])

    const resolved = await resolveOpenRouterModelCapabilities()

    expect(mocks.getDefaultModel).toHaveBeenCalled()
    expect(resolved).toMatchObject({
      id: 'anthropic/claude-sonnet-4',
      supportedParameters: [
        'reasoning',
        'stream',
        'response_format',
        'structured_outputs',
      ],
    })
  })

  it('fails when the requested model is outside the eligible catalog', async () => {
    mocks.listModels.mockResolvedValueOnce([]).mockResolvedValueOnce([])

    await expect(
      resolveOpenRouterModelCapabilities('unknown/model'),
    ).rejects.toBeInstanceOf(OpenRouterModelCatalogError)
  })
})

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const translate = Object.assign(
  (key: string, params?: Record<string, unknown>) => {
    if (params) {
      return Object.entries(params).reduce(
        (s, [k, v]) => s.replace(`{${k}}`, String(v)),
        key,
      )
    }
    return key
  },
  {
    rich: (key: string) => key,
  },
)

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => translate,
}))

vi.mock('@/components/ConfirmModal', () => ({
  useConfirmModal: () => ({
    confirm: vi.fn().mockResolvedValue(true),
  }),
}))

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import AiRequirementGenerator from '@/components/AiRequirementGenerator'

const testAreas = [
  { id: 1, name: 'Security' },
  { id: 2, name: 'Performance' },
]

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(res => {
    resolve = res
  })
  return { promise, resolve }
}

function creditResponse(overrides: Record<string, unknown> = {}) {
  return {
    json: async () => ({
      isFreeTier: false,
      limit: 50,
      limitRemaining: 37.5,
      managementKeyMissing: false,
      totalCredits: 50,
      usage: 12.5,
      usageDaily: 12.5,
      ...overrides,
    }),
    ok: true,
  }
}

function modelResponse() {
  return {
    json: async () => ({
      models: [
        {
          contextLength: 200000,
          id: 'anthropic/claude-sonnet-4',
          name: 'Claude Sonnet 4',
          pricing: {
            completion: '0.000015',
            prompt: '0.000003',
            reasoning: '0.000015',
          },
          provider: 'anthropic',
          supportedParameters: ['reasoning', 'stream'],
        },
      ],
    }),
    ok: true,
  }
}

async function renderOpenGenerator(overrides?: {
  onClose?: () => void
  onCreated?: () => void
}) {
  render(
    <AiRequirementGenerator
      areas={testAreas}
      onClose={overrides?.onClose ?? vi.fn()}
      onCreated={overrides?.onCreated ?? vi.fn()}
      open
    />,
  )

  await waitFor(() => {
    const modelButton = document.getElementById('ai-model')
    expect(modelButton).not.toBeNull()
    expect(modelButton).toHaveTextContent('Claude Sonnet 4')
  })
  await waitFor(() => {
    expect(screen.getByText('creditsBadgeWithOrg')).toBeInTheDocument()
  })
}

describe('AiRequirementGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    // Default: models endpoint returns models, credits returns info
    mockFetch.mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.startsWith('/api/ai/models')) {
        return modelResponse()
      }
      if (typeof url === 'string' && url.startsWith('/api/ai/credits')) {
        return creditResponse()
      }
      return { json: async () => ({}), ok: true }
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('renders when open', async () => {
    await renderOpenGenerator()

    expect(screen.getByText('generateTitle')).toBeInTheDocument()
    expect(screen.getByLabelText('topicLabel')).toBeInTheDocument()
    expect(screen.getByLabelText('areaLabel')).toBeInTheDocument()
    expect(screen.getByLabelText('modelLabel')).toBeInTheDocument()
  })

  it('does not render when closed', () => {
    render(
      <AiRequirementGenerator
        areas={testAreas}
        onClose={vi.fn()}
        onCreated={vi.fn()}
        open={false}
      />,
    )

    expect(screen.queryByText('generateTitle')).not.toBeInTheDocument()
  })

  it('renders area options', async () => {
    await renderOpenGenerator()

    const areaSelect = screen.getByLabelText('areaLabel')
    expect(areaSelect).toBeInTheDocument()
    expect(screen.getByText('Security')).toBeInTheDocument()
    expect(screen.getByText('Performance')).toBeInTheDocument()
  })

  it('disables generate button when topic or area is empty', async () => {
    await renderOpenGenerator()

    const generateButton = screen.getByRole('button', {
      name: /generateButton/i,
    })
    expect(generateButton).toBeDisabled()
  })

  it('has a close button that calls onClose', async () => {
    const onClose = vi.fn()
    await renderOpenGenerator({ onClose })

    const closeButton = screen.getByLabelText('close')
    expect(closeButton).toBeInTheDocument()
    await userEvent.click(closeButton)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders help buttons for form fields', async () => {
    await renderOpenGenerator()

    expect(screen.getByLabelText('help: topicLabel')).toBeInTheDocument()
    expect(screen.getByLabelText('help: areaLabel')).toBeInTheDocument()
    expect(screen.getByLabelText('help: modelLabel')).toBeInTheDocument()
  })

  it('toggles help panel on help button click', async () => {
    await renderOpenGenerator()

    const helpBtn = screen.getByLabelText('help: topicLabel')
    expect(helpBtn).toHaveAttribute('aria-expanded', 'false')

    await userEvent.click(helpBtn)
    expect(helpBtn).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('topicHelp')).toBeInTheDocument()

    await userEvent.click(helpBtn)
    expect(helpBtn).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('topicHelp')).not.toBeInTheDocument()
  })

  it('does not expose logprob confidence scoring as a model option', async () => {
    await renderOpenGenerator()

    await userEvent.click(screen.getByLabelText('capabilitySettings'))

    expect(screen.queryByLabelText('confidenceScoring')).not.toBeInTheDocument()
    expect(screen.queryByText('confidenceScoring')).not.toBeInTheDocument()
    expect(
      mockFetch.mock.calls.some(([url]) =>
        String(url).includes('supported_parameters=logprobs'),
      ),
    ).toBe(false)
  })

  it('shows selected vision model count over the filtered model total', async () => {
    const baseModels = [
      {
        contextLength: 200000,
        id: 'anthropic/claude-sonnet-4',
        name: 'Claude Sonnet 4',
        pricing: {
          completion: '0.000015',
          prompt: '0.000003',
          reasoning: '0.000015',
        },
        provider: 'anthropic',
        supportedParameters: ['reasoning', 'stream', 'vision'],
      },
      {
        contextLength: 128000,
        id: 'openai/gpt-5-vision',
        name: 'GPT-5 Vision',
        pricing: {
          completion: '0.000002',
          prompt: '0.000001',
          reasoning: '0.000002',
        },
        provider: 'openai',
        supportedParameters: ['reasoning', 'stream', 'vision'],
      },
      {
        contextLength: 128000,
        id: 'meta/llama',
        name: 'Llama',
        pricing: {
          completion: '0.000001',
          prompt: '0.000001',
          reasoning: '0.000001',
        },
        provider: 'meta',
        supportedParameters: ['reasoning', 'stream'],
      },
    ]
    mockFetch.mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.startsWith('/api/ai/models')) {
        const parsedUrl = new URL(url, 'http://localhost')
        const filters =
          parsedUrl.searchParams
            .get('supported_parameters')
            ?.split(',')
            .filter(Boolean) ?? []
        const models = baseModels.filter(model =>
          filters.every(filter => model.supportedParameters.includes(filter)),
        )
        return {
          json: async () => ({ models }),
          ok: true,
        }
      }
      if (typeof url === 'string' && url.startsWith('/api/ai/credits')) {
        return {
          json: async () => ({
            isFreeTier: false,
            limit: 50,
            limitRemaining: 37.5,
            managementKeyMissing: false,
            totalCredits: 50,
            usage: 12.5,
            usageDaily: 12.5,
          }),
          ok: true,
        }
      }
      return { json: async () => ({}), ok: true }
    })

    await renderOpenGenerator()
    await userEvent.click(screen.getByLabelText('capabilitySettings'))

    expect(screen.getByText('(2/3)')).toBeInTheDocument()

    await userEvent.click(screen.getByLabelText('capabilityVision'))

    await waitFor(() => {
      expect(screen.getByText('(2/2)')).toBeInTheDocument()
    })
  })

  it('shows tools model count from the filtered endpoint before selection', async () => {
    const baseModels = [
      {
        contextLength: 200000,
        id: 'anthropic/claude-sonnet-4',
        name: 'Claude Sonnet 4',
        pricing: {
          completion: '0.000015',
          prompt: '0.000003',
          reasoning: '0.000015',
        },
        provider: 'anthropic',
        supportedParameters: ['reasoning', 'stream', 'tools'],
      },
      {
        contextLength: 128000,
        id: 'openai/gpt-5-tools',
        name: 'GPT-5 Tools',
        pricing: {
          completion: '0.000002',
          prompt: '0.000001',
          reasoning: '0.000002',
        },
        provider: 'openai',
        supportedParameters: ['reasoning', 'stream', 'tools'],
      },
      {
        contextLength: 128000,
        id: 'provider/metadata-only-tools',
        name: 'Metadata Only Tools',
        pricing: {
          completion: '0.000001',
          prompt: '0.000001',
          reasoning: '0.000001',
        },
        provider: 'provider',
        supportedParameters: ['reasoning', 'stream', 'tools'],
      },
      {
        contextLength: 128000,
        id: 'meta/llama',
        name: 'Llama',
        pricing: {
          completion: '0.000001',
          prompt: '0.000001',
          reasoning: '0.000001',
        },
        provider: 'meta',
        supportedParameters: ['reasoning', 'stream'],
      },
    ]
    mockFetch.mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.startsWith('/api/ai/models')) {
        const parsedUrl = new URL(url, 'http://localhost')
        const filters =
          parsedUrl.searchParams
            .get('supported_parameters')
            ?.split(',')
            .filter(Boolean) ?? []
        const models = filters.includes('tools')
          ? baseModels
              .filter(model => model.supportedParameters.includes('tools'))
              .filter(model => model.id !== 'provider/metadata-only-tools')
          : baseModels.filter(model =>
              filters.every(filter =>
                model.supportedParameters.includes(filter),
              ),
            )
        return {
          json: async () => ({ models }),
          ok: true,
        }
      }
      if (typeof url === 'string' && url.startsWith('/api/ai/credits')) {
        return {
          json: async () => ({
            isFreeTier: false,
            limit: 50,
            limitRemaining: 37.5,
            managementKeyMissing: false,
            totalCredits: 50,
            usage: 12.5,
            usageDaily: 12.5,
          }),
          ok: true,
        }
      }
      return { json: async () => ({}), ok: true }
    })

    await renderOpenGenerator()
    await userEvent.click(screen.getByLabelText('capabilitySettings'))

    const getToolsRow = () =>
      screen.getByLabelText('capabilityTools').closest('div')
    expect(getToolsRow()).toHaveTextContent('(2/4)')

    await userEvent.click(screen.getByLabelText('capabilityTools'))

    await waitFor(() => {
      expect(getToolsRow()).toHaveTextContent('(2/2)')
    })
  })

  it('keeps capability counts stable while the selected filter is loading', async () => {
    const baseModels = [
      {
        contextLength: 200000,
        id: 'anthropic/claude-sonnet-4',
        name: 'Claude Sonnet 4',
        pricing: {
          completion: '0.000015',
          prompt: '0.000003',
          reasoning: '0.000015',
        },
        provider: 'anthropic',
        supportedParameters: ['reasoning', 'stream', 'tools'],
      },
      {
        contextLength: 128000,
        id: 'openai/gpt-5-tools',
        name: 'GPT-5 Tools',
        pricing: {
          completion: '0.000002',
          prompt: '0.000001',
          reasoning: '0.000002',
        },
        provider: 'openai',
        supportedParameters: ['reasoning', 'stream', 'tools'],
      },
      {
        contextLength: 128000,
        id: 'provider/metadata-only-tools',
        name: 'Metadata Only Tools',
        pricing: {
          completion: '0.000001',
          prompt: '0.000001',
          reasoning: '0.000001',
        },
        provider: 'provider',
        supportedParameters: ['reasoning', 'stream', 'tools'],
      },
      {
        contextLength: 128000,
        id: 'meta/llama',
        name: 'Llama',
        pricing: {
          completion: '0.000001',
          prompt: '0.000001',
          reasoning: '0.000001',
        },
        provider: 'meta',
        supportedParameters: ['reasoning', 'stream'],
      },
    ]
    const filteredToolsModels = baseModels
      .filter(model => model.supportedParameters.includes('tools'))
      .filter(model => model.id !== 'provider/metadata-only-tools')
    const responseFor = (models: typeof baseModels) => ({
      json: async () => ({ models }),
      ok: true,
    })
    let deferSelectedTools = false
    const pendingToolsResponse =
      createDeferred<ReturnType<typeof responseFor>>()

    mockFetch.mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.startsWith('/api/ai/models')) {
        const parsedUrl = new URL(url, 'http://localhost')
        const filters =
          parsedUrl.searchParams
            .get('supported_parameters')
            ?.split(',')
            .filter(Boolean) ?? []
        if (
          deferSelectedTools &&
          filters.length === 1 &&
          filters[0] === 'tools'
        ) {
          return pendingToolsResponse.promise
        }
        const models = filters.includes('tools')
          ? filteredToolsModels
          : baseModels.filter(model =>
              filters.every(filter =>
                model.supportedParameters.includes(filter),
              ),
            )
        return responseFor(models)
      }
      if (typeof url === 'string' && url.startsWith('/api/ai/credits')) {
        return {
          json: async () => ({
            isFreeTier: false,
            limit: 50,
            limitRemaining: 37.5,
            managementKeyMissing: false,
            totalCredits: 50,
            usage: 12.5,
            usageDaily: 12.5,
          }),
          ok: true,
        }
      }
      return { json: async () => ({}), ok: true }
    })

    await renderOpenGenerator()
    await userEvent.click(screen.getByLabelText('capabilitySettings'))
    const getToolsRow = () =>
      screen.getByLabelText('capabilityTools').closest('div')
    expect(getToolsRow()).toHaveTextContent('(2/4)')

    deferSelectedTools = true
    await userEvent.click(screen.getByLabelText('capabilityTools'))

    expect(getToolsRow()).toHaveTextContent('(2/4)')
    expect(getToolsRow()).not.toHaveTextContent('(4/4)')

    pendingToolsResponse.resolve(responseFor(filteredToolsModels))

    await waitFor(() => {
      expect(getToolsRow()).toHaveTextContent('(2/2)')
    })
  })

  it('ignores stale credits responses when the area changes', async () => {
    const staleAreaCredits = createDeferred<ReturnType<typeof creditResponse>>()
    mockFetch.mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.startsWith('/api/ai/models')) {
        return modelResponse()
      }
      if (typeof url === 'string' && url.startsWith('/api/ai/credits')) {
        const parsedUrl = new URL(url, 'http://localhost')
        const scopeId = parsedUrl.searchParams.get('scopeId')
        if (scopeId === '1') {
          return staleAreaCredits.promise
        }
        if (scopeId === '2') {
          return creditResponse({ managementKeyMissing: false })
        }
        return creditResponse()
      }
      return { json: async () => ({}), ok: true }
    })

    await renderOpenGenerator()

    await userEvent.selectOptions(screen.getByLabelText('areaLabel'), '1')
    await waitFor(() => {
      expect(
        mockFetch.mock.calls.some(([url]) => String(url).includes('scopeId=1')),
      ).toBe(true)
    })
    await userEvent.selectOptions(screen.getByLabelText('areaLabel'), '2')
    await waitFor(() => {
      expect(
        mockFetch.mock.calls.some(([url]) => String(url).includes('scopeId=2')),
      ).toBe(true)
    })

    staleAreaCredits.resolve(
      creditResponse({
        managementKeyMissing: true,
        totalCredits: null,
      }),
    )

    await waitFor(() => {
      expect(screen.queryByText('totalCreditsLocked')).not.toBeInTheDocument()
    })
  })

  it('clears generated results when the area changes after generation', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.startsWith('/api/ai/models')) {
        return modelResponse()
      }
      if (typeof url === 'string' && url.startsWith('/api/ai/credits')) {
        return creditResponse()
      }
      if (typeof url === 'string' && url === '/api/ai/generate-requirements') {
        const rawContent = JSON.stringify({
          requirements: [
            {
              acceptanceCriteria: null,
              categoryId: null,
              description: 'Generated security requirement',
              qualityCharacteristicId: null,
              rationale: 'The scope requires this control.',
              requirementPackageIds: null,
              requiresTesting: true,
              riskLevelId: null,
              typeId: 1,
              verificationMethod: null,
            },
          ],
        })
        const payload = {
          rawContent,
          stats: {
            completionTokens: 12,
            cost: 0,
            promptTokens: 10,
            reasoningTokens: 0,
            totalTokens: 22,
          },
          taxonomy: {
            categories: [],
            qualityCharacteristics: [],
            requirementPackages: [],
            riskLevels: [],
            types: [],
          },
          thinking: 'Prior thinking trace',
        }
        const body = new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                `event: done\ndata: ${JSON.stringify(payload)}\n\n`,
              ),
            )
            controller.close()
          },
        })
        return { body, ok: true }
      }
      return { json: async () => ({}), ok: true }
    })

    await renderOpenGenerator()
    await userEvent.type(screen.getByLabelText('topicLabel'), 'Encrypt logs')
    await userEvent.selectOptions(screen.getByLabelText('areaLabel'), '1')
    await userEvent.click(
      screen.getByRole('button', { name: /generateButton/i }),
    )

    expect(
      await screen.findByText('Generated security requirement'),
    ).toBeInTheDocument()
    expect(screen.getByText('Prior thinking trace')).toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText('areaLabel'), '2')

    await waitFor(() => {
      expect(
        screen.queryByText('Generated security requirement'),
      ).not.toBeInTheDocument()
      expect(screen.queryByText('Prior thinking trace')).not.toBeInTheDocument()
    })
    expect(
      screen.queryByRole('button', { name: /createSelected/i }),
    ).not.toBeInTheDocument()
  })
})

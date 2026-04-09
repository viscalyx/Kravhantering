import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => {
    const t = (key: string, params?: Record<string, unknown>) => {
      if (params) {
        return Object.entries(params).reduce(
          (s, [k, v]) => s.replace(`{${k}}`, String(v)),
          key,
        )
      }
      return key
    }
    t.rich = (key: string) => key
    return t
  },
}))

vi.mock('@/components/ConfirmModal', () => ({
  useConfirmModal: () => ({
    confirm: vi.fn().mockResolvedValue(true),
  }),
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import AiRequirementGenerator from '@/components/AiRequirementGenerator'

const testAreas = [
  { id: 1, name: 'Security' },
  { id: 2, name: 'Performance' },
]

describe('AiRequirementGenerator devMarker coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.startsWith('/api/ai/models')) {
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
  })

  it('renders dialog with devMarker attributes', () => {
    render(
      <AiRequirementGenerator
        areas={testAreas}
        onClose={vi.fn()}
        onCreated={vi.fn()}
        open
      />,
    )

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('data-developer-mode-name', 'dialog')
    expect(dialog).toHaveAttribute(
      'data-developer-mode-value',
      'ai-requirement-generator',
    )
  })

  it('renders dialog title with devMarker attributes', () => {
    render(
      <AiRequirementGenerator
        areas={testAreas}
        onClose={vi.fn()}
        onCreated={vi.fn()}
        open
      />,
    )

    const title = screen.getByText('generateTitle')
    expect(title).toHaveAttribute(
      'data-developer-mode-context',
      'ai-requirement-generator',
    )
    expect(title).toHaveAttribute('data-developer-mode-name', 'dialog title')
  })

  it('renders model selector button with devMarker attributes', () => {
    render(
      <AiRequirementGenerator
        areas={testAreas}
        onClose={vi.fn()}
        onCreated={vi.fn()}
        open
      />,
    )

    const modelButton = document.getElementById('ai-model')
    expect(modelButton).not.toBeNull()
    expect(modelButton).toHaveAttribute(
      'data-developer-mode-context',
      'ai-requirement-generator',
    )
    expect(modelButton).toHaveAttribute('data-developer-mode-name', 'button')
    expect(modelButton).toHaveAttribute(
      'data-developer-mode-value',
      'model selector',
    )
  })

  it('renders close button with devMarker attributes', () => {
    render(
      <AiRequirementGenerator
        areas={testAreas}
        onClose={vi.fn()}
        onCreated={vi.fn()}
        open
      />,
    )

    const closeButton = screen.getByLabelText('close')
    expect(closeButton).toHaveAttribute(
      'data-developer-mode-context',
      'ai-requirement-generator',
    )
    expect(closeButton).toHaveAttribute('data-developer-mode-name', 'button')
    expect(closeButton).toHaveAttribute('data-developer-mode-value', 'close')
  })

  it('renders generate button with devMarker attributes', () => {
    render(
      <AiRequirementGenerator
        areas={testAreas}
        onClose={vi.fn()}
        onCreated={vi.fn()}
        open
      />,
    )

    const generateButton = screen.getByRole('button', {
      name: /generateButton/,
    })
    expect(generateButton).toHaveAttribute(
      'data-developer-mode-context',
      'ai-requirement-generator',
    )
    expect(generateButton).toHaveAttribute('data-developer-mode-name', 'button')
    expect(generateButton).toHaveAttribute(
      'data-developer-mode-value',
      'generate',
    )
  })

  it('renders side panel with devMarker attributes when thinking is visible', async () => {
    const user = userEvent.setup()

    // Build an SSE stream with a thinking event followed by done
    const thinkingEvent =
      'event: thinking\ndata: {"chunk":"hmm","thinkingSoFar":"hmm"}\n\n'
    const doneEvent =
      'event: done\ndata: {"rawContent":"{\\"requirements\\":[]}","stats":{"completionTokens":1,"cost":0,"promptTokens":1,"reasoningTokens":0,"totalTokens":2},"thinking":"hmm","taxonomy":null}\n\n'
    const sseBody = thinkingEvent + doneEvent

    mockFetch.mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.startsWith('/api/ai/models')) {
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
      if (
        typeof url === 'string' &&
        url.startsWith('/api/ai/generate-requirements')
      ) {
        const encoder = new TextEncoder()
        const encoded = encoder.encode(sseBody)
        let read = false
        return {
          body: {
            getReader: () => ({
              read: async () => {
                if (!read) {
                  read = true
                  return { done: false, value: encoded }
                }
                return { done: true, value: undefined }
              },
            }),
          },
          ok: true,
        }
      }
      return { json: async () => ({}), ok: true }
    })

    render(
      <AiRequirementGenerator
        areas={testAreas}
        onClose={vi.fn()}
        onCreated={vi.fn()}
        open
      />,
    )

    // Wait for models to load and generate button to be enabled
    const topicInput = screen.getByLabelText('topicLabel')
    const areaSelect = screen.getByLabelText('areaLabel')

    await user.type(topicInput, 'Security requirements')
    await user.selectOptions(areaSelect, '1')

    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /generateButton/ })
      expect(btn).not.toBeDisabled()
    })

    // Click generate
    await user.click(screen.getByRole('button', { name: /generateButton/ }))

    // Wait for side panel to appear with thinking content
    await waitFor(() => {
      const sidePanel = document.querySelector(
        '[data-developer-mode-name="side panel"]',
      )
      expect(sidePanel).not.toBeNull()
    })

    const sidePanel = document.querySelector(
      '[data-developer-mode-name="side panel"]',
    )
    expect(sidePanel).toHaveAttribute(
      'data-developer-mode-context',
      'ai-requirement-generator',
    )
    expect(sidePanel).toHaveAttribute('data-developer-mode-name', 'side panel')
  })
})

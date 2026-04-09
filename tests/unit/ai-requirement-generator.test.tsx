import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import AiRequirementGenerator from '@/components/AiRequirementGenerator'

const testAreas = [
  { id: 1, name: 'Security' },
  { id: 2, name: 'Performance' },
]

describe('AiRequirementGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: models endpoint returns models, credits returns info
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
            usage: 12.5,
          }),
          ok: true,
        }
      }
      return { json: async () => ({}), ok: true }
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('renders when open', () => {
    render(
      <AiRequirementGenerator
        areas={testAreas}
        onClose={vi.fn()}
        onCreated={vi.fn()}
        open
      />,
    )

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

  it('renders area options', () => {
    render(
      <AiRequirementGenerator
        areas={testAreas}
        onClose={vi.fn()}
        onCreated={vi.fn()}
        open
      />,
    )

    const areaSelect = screen.getByLabelText('areaLabel')
    expect(areaSelect).toBeInTheDocument()
    expect(screen.getByText('Security')).toBeInTheDocument()
    expect(screen.getByText('Performance')).toBeInTheDocument()
  })

  it('disables generate button when topic or area is empty', () => {
    render(
      <AiRequirementGenerator
        areas={testAreas}
        onClose={vi.fn()}
        onCreated={vi.fn()}
        open
      />,
    )

    const generateButton = screen.getByRole('button', {
      name: /generateButton/i,
    })
    expect(generateButton).toBeDisabled()
  })

  it('has a close button that calls onClose', async () => {
    const onClose = vi.fn()
    render(
      <AiRequirementGenerator
        areas={testAreas}
        onClose={onClose}
        onCreated={vi.fn()}
        open
      />,
    )

    const closeButton = screen.getByLabelText('close')
    expect(closeButton).toBeInTheDocument()
    await userEvent.click(closeButton)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders help buttons for form fields', () => {
    render(
      <AiRequirementGenerator
        areas={testAreas}
        onClose={vi.fn()}
        onCreated={vi.fn()}
        open
      />,
    )

    expect(screen.getByLabelText('help: topicLabel')).toBeInTheDocument()
    expect(screen.getByLabelText('help: areaLabel')).toBeInTheDocument()
    expect(screen.getByLabelText('help: modelLabel')).toBeInTheDocument()
  })

  it('toggles help panel on help button click', async () => {
    render(
      <AiRequirementGenerator
        areas={testAreas}
        onClose={vi.fn()}
        onCreated={vi.fn()}
        open
      />,
    )

    const helpBtn = screen.getByLabelText('help: topicLabel')
    expect(helpBtn).toHaveAttribute('aria-expanded', 'false')

    await userEvent.click(helpBtn)
    expect(helpBtn).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('topicHelp')).toBeInTheDocument()

    await userEvent.click(helpBtn)
    expect(helpBtn).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('topicHelp')).not.toBeInTheDocument()
  })
})

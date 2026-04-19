import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import AiRequirementGenerator from '@/components/AiRequirementGenerator'

const testAreas = [
  { id: 1, name: 'Security' },
  { id: 2, name: 'Performance' },
]

async function renderOpenGenerator() {
  render(
    <AiRequirementGenerator
      areas={testAreas}
      onClose={vi.fn()}
      onCreated={vi.fn()}
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

  it('renders dialog with devMarker attributes', async () => {
    await renderOpenGenerator()

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('data-developer-mode-name', 'dialog')
    expect(dialog).toHaveAttribute(
      'data-developer-mode-value',
      'ai-requirement-generator',
    )
  })

  it('renders dialog title with devMarker attributes', async () => {
    await renderOpenGenerator()

    const title = screen.getByText('generateTitle')
    expect(title).toHaveAttribute(
      'data-developer-mode-context',
      'ai-requirement-generator',
    )
    expect(title).toHaveAttribute('data-developer-mode-name', 'dialog title')
  })

  it('renders model selector button with devMarker attributes', async () => {
    await renderOpenGenerator()

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

  it('renders close button with devMarker attributes', async () => {
    await renderOpenGenerator()

    const closeButton = screen.getByLabelText('close')
    expect(closeButton).toHaveAttribute(
      'data-developer-mode-context',
      'ai-requirement-generator',
    )
    expect(closeButton).toHaveAttribute('data-developer-mode-name', 'button')
    expect(closeButton).toHaveAttribute('data-developer-mode-value', 'close')
  })

  it('renders generate button with devMarker attributes', async () => {
    await renderOpenGenerator()

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
})

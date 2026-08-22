import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

  await screen.findByText('Approved AI service')
}

describe('AiRequirementGenerator devMarker coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockImplementation(async (url: string) => {
      if (url === '/api/ai/authoring-profiles') {
        return {
          json: async () => ({
            enabled: true,
            profiles: {
              generate_with_images: {
                available: true,
                connectionName: 'Approved AI service',
                dataPolicySummary: 'EU processing',
              },
              generate_without_images: {
                available: true,
                connectionName: 'Approved AI service',
                dataPolicySummary: 'EU processing',
              },
              repair_invalid_import_json: {
                available: true,
                connectionName: 'Approved AI service',
                dataPolicySummary: 'EU processing',
              },
            },
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

  it('marks administrator-managed authoring profile status', async () => {
    await renderOpenGenerator()

    const profileStatus = document.querySelector(
      '[data-developer-mode-value="authoring profile"]',
    )
    expect(profileStatus).not.toBeNull()
    expect(profileStatus).toHaveAttribute(
      'data-developer-mode-context',
      'ai-requirement-generator',
    )
    expect(profileStatus).toHaveAttribute('data-developer-mode-name', 'status')
    expect(profileStatus).toHaveAttribute(
      'data-developer-mode-value',
      'authoring profile',
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

  it('marks the visible generation error summary', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url === '/api/ai/authoring-profiles') {
        return {
          json: async () => ({
            enabled: true,
            profiles: {
              generate_with_images: {
                available: true,
                connectionName: 'Approved AI service',
                dataPolicySummary: 'EU processing',
              },
              generate_without_images: {
                available: true,
                connectionName: 'Approved AI service',
                dataPolicySummary: 'EU processing',
              },
              repair_invalid_import_json: {
                available: true,
                connectionName: 'Approved AI service',
                dataPolicySummary: 'EU processing',
              },
            },
          }),
          ok: true,
        }
      }
      if (
        typeof url === 'string' &&
        url === '/api/ai/generate-requirement-import'
      ) {
        return {
          body: new ReadableStream({
            start(controller) {
              controller.close()
            },
          }),
          ok: true,
        }
      }
      return { json: async () => ({}), ok: true }
    })

    await renderOpenGenerator()
    await userEvent.selectOptions(screen.getByLabelText('areaLabel'), '1')
    await userEvent.type(screen.getByLabelText('topicLabel'), 'Audit logs')
    await userEvent.click(
      screen.getByRole('button', { name: 'generateButton' }),
    )

    const errorSummary = await screen.findByRole('heading', {
      name: 'generationFailed',
    })
    const summaryContainer = errorSummary.closest(
      '[data-developer-mode-name="error summary"]',
    )
    expect(summaryContainer).toHaveAttribute(
      'data-developer-mode-name',
      'error summary',
    )
    expect(summaryContainer).toHaveAttribute(
      'data-developer-mode-value',
      'generation outcome and technical error details',
    )
  })
})

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => {
  const translators = new Map<string, (key: string) => string>()
  return {
    useLocale: () => 'en',
    useTranslations: (namespace?: string) => {
      const cacheKey = namespace ?? ''
      let translator = translators.get(cacheKey)
      if (!translator) {
        translator = (key: string) => (namespace ? `${namespace}.${key}` : key)
        translators.set(cacheKey, translator)
      }
      return translator
    },
  }
})

const fetchMock = vi.fn()

function okJson(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  })
}

describe('RFI client UI states', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('leaves loading state when no requirement areas are available', async () => {
    fetchMock.mockResolvedValue(okJson({ areas: [] }))
    const { default: RfiQuestionsClient } = await import(
      '@/app/[locale]/requirements/stewardship/rfi-questions-client'
    )

    render(<RfiQuestionsClient />)

    await waitFor(() => {
      expect(screen.queryByText('common.loading')).not.toBeInTheDocument()
    })
    expect(screen.getByText('rfiQuestions.emptyQuestions')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/requirement-areas')
  })

  it('keeps RFI suggestion submit disabled when no suggestion area exists', async () => {
    fetchMock.mockImplementation((url: RequestInfo | URL) => {
      if (String(url) === '/api/requirements-specifications/SPEC-1/rfi-list') {
        return Promise.resolve(
          okJson({
            list: {
              isLocked: false,
              items: [],
              lockedAt: null,
              lockedByDisplayName: null,
              specificationId: 5,
            },
          }),
        )
      }
      throw new Error(`Unmocked fetch: ${String(url)}`)
    })
    const { default: SpecificationRfiListPanel } = await import(
      '@/app/[locale]/specifications/[slug]/specification-rfi-list-panel'
    )

    render(
      <SpecificationRfiListPanel
        canEdit
        specificationId={5}
        specificationSlug="SPEC-1"
      />,
    )

    const button = await screen.findByRole('button', {
      name: 'specificationRfiList.createSuggestion',
    })
    await userEvent.type(
      screen.getByLabelText('specificationRfiList.suggestionContent'),
      'Suggest a logging question',
    )

    expect(button).toBeDisabled()
  })
})

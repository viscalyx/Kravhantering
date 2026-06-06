import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: (ns?: string) => (key: string) =>
    ns ? `${ns}.${key}` : key,
}))

function okJson(body: unknown) {
  return { ok: true, json: async () => body }
}

function notOkJson(body: unknown) {
  return { ok: false, json: async () => body }
}

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

import RequirementCategoriesClient from '@/app/[locale]/requirement-categories/requirement-categories-client'

const sampleCategories = [
  { id: 2, nameSv: 'IT-krav', nameEn: 'Beta requirement' },
  { id: 1, nameSv: 'Verksamhetskrav', nameEn: 'Zulu requirement' },
  { id: 3, nameSv: 'Leverantörskrav', nameEn: 'Alpha requirement' },
]

describe('RequirementCategoriesClient', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockResolvedValue(okJson({ categories: sampleCategories }))
  })

  it('fetches and displays categories in id order', async () => {
    render(<RequirementCategoriesClient />)

    await waitFor(() => {
      expect(screen.getByText('Zulu requirement')).toBeInTheDocument()
    })

    expect(fetchMock).toHaveBeenCalledWith('/api/requirement-categories')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'requirementCategoryAdmin.title',
    )
    expect(screen.getByText('Beta requirement')).toBeInTheDocument()
    expect(screen.getByText('Alpha requirement')).toBeInTheDocument()

    const text = document.body.textContent ?? ''
    expect(text.indexOf('Zulu requirement')).toBeLessThan(
      text.indexOf('Beta requirement'),
    )
    expect(text.indexOf('Beta requirement')).toBeLessThan(
      text.indexOf('Alpha requirement'),
    )
  })

  it('renders as a read-only list without mutation controls', async () => {
    render(<RequirementCategoriesClient />)

    await waitFor(() => {
      expect(screen.getByText('Zulu requirement')).toBeInTheDocument()
    })

    expect(screen.queryByRole('button', { name: /common\.create/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /common\.edit/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /common\.delete/i })).toBeNull()
  })

  it('shows loading text initially', () => {
    fetchMock.mockReturnValue(new Promise(() => {}))

    render(<RequirementCategoriesClient />)

    expect(screen.getByRole('status')).toHaveTextContent('common.loading')
  })

  it('renders the empty state', async () => {
    fetchMock.mockResolvedValue(okJson({ categories: [] }))

    render(<RequirementCategoriesClient />)

    expect(
      await screen.findByText('requirementCategoryAdmin.emptyState'),
    ).toBeInTheDocument()
  })

  it('renders an error state when categories cannot load', async () => {
    fetchMock.mockResolvedValue(notOkJson({ error: 'Failed' }))

    render(<RequirementCategoriesClient />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'requirementCategoryAdmin.loadError',
    )
  })
})

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

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

import QualityCharacteristicsClient from '@/app/[locale]/quality-characteristics/quality-characteristics-client'

const sampleTypes = [{ id: 1, nameSv: 'Typ sv', nameEn: 'Quality' }]

const sampleCategories = [
  {
    id: 10,
    nameSv: 'Kat sv',
    nameEn: 'Maintainability',
    parentId: null,
    requirementTypeId: 1,
  },
  {
    id: 11,
    nameSv: 'Barn sv',
    nameEn: 'Analyzability',
    parentId: 10,
    requirementTypeId: 1,
  },
]

describe('QualityCharacteristicsClient', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/requirement-types')
        return Promise.resolve(okJson({ types: sampleTypes }))
      if (url === '/api/requirement-type-categories')
        return Promise.resolve(okJson({ typeCategories: sampleCategories }))
      return Promise.resolve(okJson({}))
    })
  })

  it('renders heading and ISO subtitle', async () => {
    render(<QualityCharacteristicsClient />)
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        'nav.qualityCharacteristics',
      )
    })
    expect(screen.getByText(/ISO\/IEC 25010:2023/)).toBeInTheDocument()
  })

  it('fetches and displays types with categories in grid', async () => {
    render(<QualityCharacteristicsClient />)
    await waitFor(() => {
      expect(screen.getByText('Quality')).toBeInTheDocument()
    })
    expect(screen.getByText('Maintainability')).toBeInTheDocument()
    expect(screen.getByText('Analyzability')).toBeInTheDocument()
  })

  it('shows loading text initially', () => {
    fetchMock.mockReturnValue(new Promise(() => {}))
    render(<QualityCharacteristicsClient />)
    expect(screen.getByText('common.loading')).toBeInTheDocument()
  })
})

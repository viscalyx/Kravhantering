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

import KravtyperClient from '@/app/[locale]/kravtyper/kravtyper-client'

const sampleTypes = [
  { id: 1, nameSv: 'Typ A sv', nameEn: 'Type A' },
  { id: 2, nameSv: 'Typ B sv', nameEn: 'Type B' },
]

const sampleCategories = [
  {
    id: 10,
    nameSv: 'Kat sv',
    nameEn: 'Cat en',
    parentId: null,
    requirementTypeId: 1,
  },
  {
    id: 11,
    nameSv: 'Barn sv',
    nameEn: 'Child en',
    parentId: 10,
    requirementTypeId: 1,
  },
]

describe('KravtyperClient', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/requirement-types')
        return Promise.resolve(okJson({ types: sampleTypes }))
      if (url === '/api/quality-characteristics')
        return Promise.resolve(
          okJson({ qualityCharacteristics: sampleCategories }),
        )
      return Promise.resolve(okJson({}))
    })
  })

  it('renders heading', async () => {
    render(<KravtyperClient />)
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        'nav.types',
      )
    })
  })

  it('fetches and displays types with categories', async () => {
    render(<KravtyperClient />)
    await waitFor(() => {
      expect(screen.getByText('Type A')).toBeInTheDocument()
    })
    expect(screen.getByText('Type B')).toBeInTheDocument()
    expect(screen.getByText('Cat en')).toBeInTheDocument()
    expect(screen.getByText('Child en')).toBeInTheDocument()
  })

  it('shows loading text initially', () => {
    fetchMock.mockReturnValue(new Promise(() => {}))
    render(<KravtyperClient />)
    expect(screen.getByText('common.loading')).toBeInTheDocument()
  })

  it('shows noResults for types without categories', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/requirement-types')
        return Promise.resolve(okJson({ types: sampleTypes }))
      if (url === '/api/quality-characteristics')
        return Promise.resolve(okJson({ qualityCharacteristics: [] }))
      return Promise.resolve(okJson({}))
    })
    render(<KravtyperClient />)
    await waitFor(() => {
      expect(screen.getAllByText('common.noResults')).toHaveLength(2)
    })
  })
})

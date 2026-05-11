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

import RequirementTypesClient from '@/app/[locale]/requirement-types/requirement-types-client'

const sampleTypes = [
  { id: 1, nameSv: 'Typ A sv', nameEn: 'Type A' },
  { id: 2, nameSv: 'Typ B sv', nameEn: 'Type B' },
]

const sampleCategories = [
  {
    chapterId: '3.7',
    id: 10,
    nameSv: 'Kat sv',
    nameEn: 'Cat en',
    parentId: null,
    requirementTypeId: 1,
  },
  {
    chapterId: '3.7.3',
    id: 11,
    nameSv: 'Barn sv',
    nameEn: 'Child en',
    parentId: 10,
    requirementTypeId: 1,
  },
]

describe('RequirementTypesClient', () => {
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
    render(<RequirementTypesClient />)
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        'nav.types',
      )
    })
  })

  it('fetches and displays types with categories', async () => {
    render(<RequirementTypesClient />)
    await waitFor(() => {
      expect(screen.getByText('Type A')).toBeInTheDocument()
    })
    expect(screen.getByText('Type B')).toBeInTheDocument()
    expect(screen.getByText('Cat en')).toBeInTheDocument()
    expect(screen.getByText('Child en')).toBeInTheDocument()
    expect(screen.getByText('3.7')).toBeInTheDocument()
    expect(screen.getByText('3.7.3')).toBeInTheDocument()
  })

  it('shows loading text initially', () => {
    fetchMock.mockReturnValue(new Promise(() => {}))
    render(<RequirementTypesClient />)
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
    render(<RequirementTypesClient />)
    await waitFor(() => {
      expect(screen.getAllByText('common.noResults')).toHaveLength(2)
    })
  })

  it('renders ISO/IEC 25010:2023 badge', async () => {
    render(<RequirementTypesClient />)
    await waitFor(() => {
      expect(screen.getAllByText('ISO/IEC 25010:2023')).toHaveLength(
        sampleTypes.length,
      )
    })
  })

  it('renders quality heading as h3', async () => {
    render(<RequirementTypesClient />)
    await waitFor(() => {
      const headings = screen.getAllByRole('heading', { level: 3 })
      const qualityHeadings = headings.filter(
        h => h.textContent === 'help.requirementTypes.quality.heading',
      )
      expect(qualityHeadings).toHaveLength(sampleTypes.length)
    })
  })

  it('renders two-column responsive grid', async () => {
    const { container } = render(<RequirementTypesClient />)
    await waitFor(() => {
      expect(screen.getByText('Type A')).toBeInTheDocument()
    })
    const grid = container.querySelector('.grid-cols-1.lg\\:grid-cols-2')
    expect(grid).toBeInTheDocument()
  })

  it('renders type cards with developer-mode marker', async () => {
    const { container } = render(<RequirementTypesClient />)
    await waitFor(() => {
      expect(screen.getByText('Type A')).toBeInTheDocument()
    })
    const cards = container.querySelectorAll(
      '[data-developer-mode-name="type card"]',
    )
    expect(cards).toHaveLength(sampleTypes.length)
  })

  it('sorts quality characteristics by chapter number', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/requirement-types')
        return Promise.resolve(okJson({ types: sampleTypes }))
      if (url === '/api/quality-characteristics')
        return Promise.resolve(
          okJson({
            qualityCharacteristics: [
              {
                chapterId: '3.7',
                id: 10,
                nameSv: 'Underhållbarhet',
                nameEn: 'Maintainability',
                parentId: null,
                requirementTypeId: 1,
              },
              {
                chapterId: '3.7.2',
                id: 12,
                nameSv: 'Återanvändbarhet',
                nameEn: 'Reusability',
                parentId: 10,
                requirementTypeId: 1,
              },
              {
                chapterId: '3.2',
                id: 13,
                nameSv: 'Prestandaeffektivitet',
                nameEn: 'Performance efficiency',
                parentId: null,
                requirementTypeId: 1,
              },
              {
                chapterId: '3.7.1',
                id: 11,
                nameSv: 'Modularitet',
                nameEn: 'Modularity',
                parentId: 10,
                requirementTypeId: 1,
              },
            ],
          }),
        )
      return Promise.resolve(okJson({}))
    })

    render(<RequirementTypesClient />)
    await waitFor(() => {
      expect(screen.getByText('Performance efficiency')).toBeInTheDocument()
    })
    const text = document.body.textContent ?? ''
    expect(text.indexOf('3.2')).toBeLessThan(text.indexOf('3.7'))
    expect(text.indexOf('3.7.1')).toBeLessThan(text.indexOf('3.7.2'))
  })
})

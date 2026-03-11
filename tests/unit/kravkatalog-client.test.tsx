import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import KravkatalogClient from '@/app/[locale]/kravkatalog/kravkatalog-client'
import {
  getRequirementColumnWidthsStorageKey,
  REQUIREMENT_VISIBLE_COLUMNS_STORAGE_KEY,
} from '@/lib/requirements/list-view'

const fetchMock = vi.fn()
const storageGetItem = vi.fn()
const storageSetItem = vi.fn()

vi.mock('next-intl', () => ({
  useLocale: () => 'sv',
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href, ...props }: Record<string, unknown>) => (
    <a href={href as string} {...props}>
      {children as React.ReactNode}
    </a>
  ),
}))

vi.mock('@/components/ExportButton', () => ({
  default: ({ onClick }: { onClick: () => void }) => (
    <button onClick={onClick} type="button">
      export
    </button>
  ),
}))

vi.mock('@/components/PrintButton', () => ({
  default: () => <button type="button">print</button>,
}))

vi.mock('@/components/RequirementsTable', () => ({
  default: ({
    columnWidths,
    onColumnWidthsChange,
    onSortChange,
    onVisibleColumnsChange,
    sortState,
    visibleColumns,
  }: {
    columnWidths?: Record<string, number>
    onColumnWidthsChange?: (value: Record<string, number>) => void
    onSortChange?: (value: { by: string; direction: 'asc' | 'desc' }) => void
    onVisibleColumnsChange?: (value: string[]) => void
    sortState?: { by: string; direction: 'asc' | 'desc' }
    visibleColumns?: string[]
  }) => (
    <div>
      <div data-testid="sort-state">
        {sortState?.by}:{sortState?.direction}
      </div>
      <div data-testid="visible-columns">
        {(visibleColumns ?? []).join(',')}
      </div>
      <div data-testid="column-widths">
        {JSON.stringify(columnWidths ?? {})}
      </div>
      <button
        onClick={() => onSortChange?.({ by: 'status', direction: 'asc' })}
        type="button"
      >
        change-sort
      </button>
      <button
        onClick={() =>
          onVisibleColumnsChange?.(['uniqueId', 'description', 'status'])
        }
        type="button"
      >
        change-columns
      </button>
      <button
        onClick={() => onColumnWidthsChange?.({ status: 220, type: 200 })}
        type="button"
      >
        change-widths
      </button>
    </div>
  ),
}))

vi.mock('@/app/[locale]/kravkatalog/[id]/requirement-detail-client', () => ({
  default: () => <div>detail</div>,
}))

function okJson(body: unknown) {
  return {
    json: async () => body,
    ok: true,
  } as Response
}

describe('KravkatalogClient', () => {
  it('hydrates saved columns and widths and sends sort params in list requests', async () => {
    const columnWidthsStorageKey = getRequirementColumnWidthsStorageKey('sv')

    storageGetItem.mockImplementation((key: string) => {
      if (key === REQUIREMENT_VISIBLE_COLUMNS_STORAGE_KEY) {
        return '["area","status"]'
      }
      if (key === columnWidthsStorageKey) {
        return '{"status":220}'
      }
      return null
    })
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: storageGetItem,
        setItem: storageSetItem,
      },
      writable: true,
    })

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.startsWith('/api/requirements?')) {
        return okJson({
          pagination: { hasMore: false },
          requirements: [
            {
              area: { name: 'Integration' },
              id: 1,
              isArchived: false,
              uniqueId: 'INT0001',
              version: {
                categoryNameEn: 'Business requirement',
                categoryNameSv: 'Verksamhetskrav',
                description: 'Testkrav',
                requiresTesting: false,
                status: 3,
                statusColor: '#22c55e',
                statusNameEn: 'Published',
                statusNameSv: 'Publicerad',
                typeCategoryNameEn: null,
                typeCategoryNameSv: null,
                typeNameEn: 'Functional',
                typeNameSv: 'Funktionellt',
                versionNumber: 1,
              },
            },
          ],
        })
      }

      if (url === '/api/requirement-areas') {
        return okJson({ areas: [] })
      }
      if (url === '/api/requirement-categories') {
        return okJson({ categories: [] })
      }
      if (url === '/api/requirement-types') {
        return okJson({ types: [] })
      }
      if (url === '/api/requirement-type-categories') {
        return okJson({ typeCategories: [] })
      }
      if (url === '/api/requirement-statuses') {
        return okJson({
          statuses: [
            {
              color: '#22c55e',
              id: 3,
              nameEn: 'Published',
              nameSv: 'Publicerad',
              sortOrder: 3,
            },
          ],
        })
      }

      throw new Error(`Unhandled fetch: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    render(<KravkatalogClient />)

    await waitFor(() =>
      expect(screen.getByTestId('visible-columns').textContent).toBe(
        'uniqueId,description,area,status',
      ),
    )
    expect(screen.getByTestId('sort-state').textContent).toBe('uniqueId:asc')
    expect(screen.getByTestId('column-widths').textContent).toBe(
      '{"status":220}',
    )
    expect(storageGetItem).toHaveBeenCalledWith(
      REQUIREMENT_VISIBLE_COLUMNS_STORAGE_KEY,
    )
    expect(storageGetItem).toHaveBeenCalledWith(columnWidthsStorageKey)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('sortBy=uniqueId'),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('sortDirection=asc'),
    )
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('locale=sv'))

    fireEvent.click(screen.getByText('change-sort'))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('sortBy=status'),
      ),
    )

    fireEvent.click(screen.getByText('change-columns'))

    await waitFor(() =>
      expect(storageSetItem).toHaveBeenCalledWith(
        REQUIREMENT_VISIBLE_COLUMNS_STORAGE_KEY,
        '["uniqueId","description","status"]',
      ),
    )

    fireEvent.click(screen.getByText('change-widths'))

    await waitFor(() =>
      expect(storageSetItem).toHaveBeenCalledWith(
        columnWidthsStorageKey,
        '{"type":200,"status":220}',
      ),
    )
  })
})

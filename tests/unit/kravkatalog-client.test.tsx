import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import KravkatalogClient from '@/app/[locale]/kravkatalog/kravkatalog-client'
import {
  DEFAULT_VISIBLE_REQUIREMENT_COLUMNS,
  getRequirementColumnWidthsStorageKey,
  REQUIREMENT_VISIBLE_COLUMNS_STORAGE_KEY,
} from '@/lib/requirements/list-view'

const fetchMock = vi.fn()
const printMock = vi.fn()
const createObjectURLMock = vi.fn(() => 'blob:requirements-export')
const revokeObjectURLMock = vi.fn()
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

vi.mock('@/components/RequirementsTable', () => ({
  default: ({
    columnWidths,
    floatingActions,
    onColumnWidthsChange,
    onSortChange,
    onVisibleColumnsChange,
    sortState,
    visibleColumns,
  }: {
    columnWidths?: Record<string, number>
    floatingActions?: {
      ariaLabel: string
      href?: string
      id: string
      onClick?: () => void
      position?: 'beforeColumns' | 'afterColumns'
      variant?: 'default' | 'primary'
    }[]
    onColumnWidthsChange?: (value: Record<string, number>) => void
    onSortChange?: (value: { by: string; direction: 'asc' | 'desc' }) => void
    onVisibleColumnsChange?: (value: string[]) => void
    sortState?: { by: string; direction: 'asc' | 'desc' }
    visibleColumns?: string[]
  }) => (
    <div>
      <div data-testid="floating-actions-order">
        {(floatingActions ?? [])
          .map(
            action =>
              `${action.id}:${action.position ?? 'afterColumns'}:${action.variant ?? 'default'}`,
          )
          .join(',')}
      </div>
      <div data-testid="sort-state">
        {sortState?.by}:{sortState?.direction}
      </div>
      <div data-testid="visible-columns">
        {(visibleColumns ?? []).join(',')}
      </div>
      <div data-testid="column-widths">
        {JSON.stringify(columnWidths ?? {})}
      </div>
      {(floatingActions ?? []).map(action =>
        action.href ? (
          <a
            aria-label={action.ariaLabel}
            data-floating-action-id={action.id}
            data-floating-action-variant={action.variant ?? 'default'}
            href={action.href}
            key={action.id}
          >
            {action.id}
          </a>
        ) : (
          <button
            aria-label={action.ariaLabel}
            data-floating-action-id={action.id}
            data-floating-action-variant={action.variant ?? 'default'}
            key={action.id}
            onClick={action.onClick}
            type="button"
          >
            {action.id}
          </button>
        ),
      )}
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

function mockCommonFetches() {
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input)

    if (url.startsWith('/api/requirements?')) {
      if (url.includes('format=csv')) {
        return {
          blob: async () => new Blob(['csv']),
          ok: true,
        } as Response
      }

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
}

describe('KravkatalogClient', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    printMock.mockReset()
    createObjectURLMock.mockReset()
    createObjectURLMock.mockReturnValue('blob:requirements-export')
    revokeObjectURLMock.mockReset()
    storageGetItem.mockReset()
    storageSetItem.mockReset()
    Object.defineProperty(window, 'print', {
      configurable: true,
      value: printMock,
      writable: true,
    })
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURLMock,
      writable: true,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURLMock,
      writable: true,
    })
  })

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

    mockCommonFetches()
    vi.stubGlobal('fetch', fetchMock)

    const { container } = render(<KravkatalogClient />)

    const tableCard = Array.from(container.querySelectorAll('div')).find(node =>
      node.className.includes(
        'backdrop-blur-sm rounded-2xl border shadow-sm overflow-hidden',
      ),
    )

    expect(tableCard).toBeTruthy()

    await waitFor(() =>
      expect(screen.getByTestId('visible-columns').textContent).toBe(
        'uniqueId,description,area,status',
      ),
    )
    expect(screen.getByTestId('floating-actions-order').textContent).toBe(
      'create:beforeColumns:primary,print:afterColumns:default,export:afterColumns:default',
    )
    expect(screen.queryByText('newRequirement')).toBeNull()
    expect(
      screen.getByRole('link', { name: 'newRequirement' }),
    ).toHaveAttribute('href', '/kravkatalog/ny')
    expect(
      screen.getByRole('link', { name: 'newRequirement' }).dataset
        .floatingActionVariant,
    ).toBe('primary')
    expect(
      screen.getByRole('button', { name: 'print' }).dataset
        .floatingActionVariant,
    ).toBe('default')
    expect(
      screen.getByRole('button', { name: 'export' }).dataset
        .floatingActionVariant,
    ).toBe('default')
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

    fireEvent.click(screen.getByRole('button', { name: 'print' }))
    expect(printMock).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'export' }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('format=csv'),
      ),
    )
    expect(createObjectURLMock).toHaveBeenCalledTimes(1)
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:requirements-export')
  })

  it('falls back to default column preferences when local storage is invalid', async () => {
    const columnWidthsStorageKey = getRequirementColumnWidthsStorageKey('sv')

    storageGetItem.mockImplementation((key: string) => {
      if (key === REQUIREMENT_VISIBLE_COLUMNS_STORAGE_KEY) {
        return 'not-json'
      }
      if (key === columnWidthsStorageKey) {
        return '{invalid'
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

    mockCommonFetches()
    vi.stubGlobal('fetch', fetchMock)

    render(<KravkatalogClient />)

    await waitFor(() =>
      expect(screen.getByTestId('visible-columns').textContent).toBe(
        DEFAULT_VISIBLE_REQUIREMENT_COLUMNS.join(','),
      ),
    )
    expect(screen.getByTestId('column-widths').textContent).toBe('{}')
  })

  it('clears hidden default filters from stored column preferences', async () => {
    storageGetItem.mockImplementation((key: string) => {
      if (key === REQUIREMENT_VISIBLE_COLUMNS_STORAGE_KEY) {
        return '["uniqueId","description"]'
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
        expect(url).not.toContain('statuses=3')
        return okJson({
          pagination: { hasMore: false },
          requirements: [],
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
        return okJson({ statuses: [] })
      }

      throw new Error(`Unexpected fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<KravkatalogClient />)

    await waitFor(() =>
      expect(screen.getByTestId('visible-columns').textContent).toBe(
        'uniqueId,description',
      ),
    )
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/requirements?'),
      ),
    )
  })
})

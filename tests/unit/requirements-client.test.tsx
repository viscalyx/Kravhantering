import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RequirementsClient from '@/app/[locale]/requirements/requirements-client'
import type { RequirementsTableProps } from '@/components/RequirementsTable'
import {
  DEFAULT_VISIBLE_REQUIREMENT_COLUMNS,
  getRequirementColumnWidthsStorageKey,
  normalizeRequirementListColumnDefaults,
  REQUIREMENT_VISIBLE_COLUMNS_STORAGE_KEY,
} from '@/lib/requirements/list-view'
import type { RequirementDetailResponse } from '@/lib/requirements/types'

type RequirementDetailRowSource = RequirementDetailResponse & {
  hasPendingVersion?: boolean
  pendingVersionStatusColor?: string | null
  pendingVersionStatusId?: number | null
}

const helpPanelState = vi.hoisted(() => ({
  useHelpContent: vi.fn(),
}))

const tableState = vi.hoisted(() => ({
  renderSpy: vi.fn(),
}))

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

vi.mock('@/components/HelpPanel', () => ({
  useHelpContent: helpPanelState.useHelpContent,
}))

vi.mock('@/components/RequirementsTable', () => ({
  default: (props: RequirementsTableProps) => {
    const {
      areas,
      categories,
      columnWidths,
      expandedId,
      floatingActions,
      hasMore,
      loading,
      loadingMore,
      onColumnWidthsChange,
      onLoadMore,
      onRowClick,
      onSortChange,
      onVisibleColumnsChange,
      renderExpanded,
      rows,
      sortState,
      statusOptions,
      qualityCharacteristics,
      types,
      visibleColumns,
    } = props

    tableState.renderSpy({
      areas: areas ?? [],
      categories: categories ?? [],
      columnWidths: columnWidths ?? {},
      hasMore: hasMore ?? false,
      loading: loading ?? false,
      loadingMore: loadingMore ?? false,
      rows: rows ?? [],
      sortState,
      statusOptions: statusOptions ?? [],
      qualityCharacteristics: qualityCharacteristics ?? [],
      types: types ?? [],
      visibleColumns: visibleColumns ?? [],
    })

    return (
      <div data-testid="requirements-table">
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
        <div data-testid="row-ids">
          {(rows ?? []).map(row => row.uniqueId).join(',')}
        </div>
        <div data-testid="has-more">{String(hasMore ?? false)}</div>
        <div data-testid="loading">{String(loading ?? false)}</div>
        <div data-testid="loading-more">{String(loadingMore ?? false)}</div>
        {(rows ?? []).map(row => (
          <div key={row.id}>
            <button onClick={() => onRowClick?.(row.id)} type="button">
              {`row-${row.id}`}
            </button>
            {expandedId === row.id ? renderExpanded?.(row.id) : null}
          </div>
        ))}
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
          onClick={() => onSortChange?.({ by: 'uniqueId', direction: 'desc' })}
          type="button"
        >
          change-sort-desc
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
        <button
          disabled={!hasMore}
          onClick={() => onLoadMore?.()}
          type="button"
        >
          load-more
        </button>
      </div>
    )
  },
}))

vi.mock('@/app/[locale]/requirements/[id]/requirement-detail-client', () => ({
  default: ({
    onClose,
    requirementId,
  }: {
    onClose?: () => void
    requirementId?: number
  }) => (
    <div>
      detail
      <button onClick={onClose} type="button">
        {`detail-close-${requirementId}`}
      </button>
    </div>
  ),
}))

function okJson(body: unknown) {
  return {
    json: async () => body,
    ok: true,
  } as Response
}

function createDeferredJsonResponse<T>() {
  let resolve: ((body: T) => void) | undefined
  const promise = new Promise<Response>(promiseResolve => {
    resolve = body => promiseResolve(okJson(body))
  })

  return {
    promise,
    resolve(body: T) {
      resolve?.(body)
    },
  }
}

function makeRequirementRow(
  id: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    area: { name: 'Integration' },
    id,
    isArchived: false,
    uniqueId: `INT${String(id).padStart(4, '0')}`,
    version: {
      categoryNameEn: 'Business requirement',
      categoryNameSv: 'Verksamhetskrav',
      description: `Testkrav ${id}`,
      requiresTesting: false,
      status: 3,
      statusColor: '#22c55e',
      statusNameEn: 'Published',
      statusNameSv: 'Publicerad',
      qualityCharacteristicNameEn: null,
      qualityCharacteristicNameSv: null,
      typeNameEn: 'Functional',
      typeNameSv: 'Funktionellt',
      versionNumber: 1,
    },
    ...overrides,
  }
}

function makeRequirementDetail(
  id: number,
  overrides: Partial<RequirementDetailRowSource> = {},
): RequirementDetailRowSource {
  return {
    area: {
      id: 1,
      name: 'Integration',
      ownerId: 1,
      ownerName: 'Area Owner',
      prefix: 'INT',
    },
    createdAt: '2026-03-01T00:00:00Z',
    id,
    isArchived: false,
    uniqueId: `INT${String(id).padStart(4, '0')}`,
    versions: [
      {
        acceptanceCriteria: `Acceptance ${id}`,
        archiveInitiatedAt: null,
        archivedAt: null,
        category: {
          id: 2,
          nameEn: 'Business requirement',
          nameSv: 'Verksamhetskrav',
        },
        createdAt: '2026-03-01T00:00:00Z',
        createdBy: 'owner-1',
        description: `Pinned krav ${id}`,
        editedAt: null,
        id,
        ownerName: 'Owner',
        publishedAt: '2026-03-01T00:00:00Z',
        requiresTesting: false,
        status: 3,
        statusColor: '#22c55e',
        statusNameEn: 'Published',
        statusNameSv: 'Publicerad',
        qualityCharacteristic: null,
        type: { id: 3, nameEn: 'Functional', nameSv: 'Funktionellt' },
        verificationMethod: null,
        versionNumber: 1,
        versionScenarios: [],
        versionNormReferences: [],
      },
    ],
    ...overrides,
  }
}

function mockMetadataFetch(url: string) {
  if (url === '/api/requirement-areas') {
    return Promise.resolve(okJson({ areas: [] }))
  }
  if (url === '/api/requirement-categories') {
    return Promise.resolve(okJson({ categories: [] }))
  }
  if (url === '/api/requirement-types') {
    return Promise.resolve(okJson({ types: [] }))
  }
  if (url === '/api/quality-characteristics') {
    return Promise.resolve(okJson({ qualityCharacteristics: [] }))
  }
  if (url === '/api/requirement-statuses') {
    return Promise.resolve(
      okJson({
        statuses: [
          {
            color: '#22c55e',
            id: 3,
            nameEn: 'Published',
            nameSv: 'Publicerad',
            sortOrder: 3,
          },
        ],
      }),
    )
  }
  if (url === '/api/usage-scenarios') {
    return Promise.resolve(okJson([]))
  }
  if (url.startsWith('/api/norm-references')) {
    return Promise.resolve(okJson({ normReferences: [] }))
  }

  return null
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
        requirements: [makeRequirementRow(1)],
      })
    }

    const metadataResponse = mockMetadataFetch(url)
    if (metadataResponse) {
      return metadataResponse
    }

    throw new Error(`Unhandled fetch: ${url}`)
  })
}

describe('RequirementsClient', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    helpPanelState.useHelpContent.mockReset()
    printMock.mockReset()
    createObjectURLMock.mockReset()
    createObjectURLMock.mockReturnValue('blob:requirements-export')
    revokeObjectURLMock.mockReset()
    storageGetItem.mockReset()
    storageGetItem.mockImplementation(() => null)
    storageSetItem.mockReset()
    tableState.renderSpy.mockReset()
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
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: storageGetItem,
        setItem: storageSetItem,
      },
      writable: true,
    })
  })

  it('registers help content for inline detail and lifecycle guidance', () => {
    fetchMock.mockReturnValue(new Promise(() => {}))
    vi.stubGlobal('fetch', fetchMock)

    render(<RequirementsClient />)

    expect(helpPanelState.useHelpContent).toHaveBeenCalledWith({
      sections: [
        {
          kind: 'text',
          bodyKey: 'requirements.overview.body',
          headingKey: 'requirements.overview.heading',
        },
        {
          kind: 'text',
          bodyKey: 'requirements.inlineDetail.body',
          headingKey: 'requirements.inlineDetail.heading',
        },
        {
          kind: 'text',
          bodyKey: 'requirements.filtering.body',
          headingKey: 'requirements.filtering.heading',
        },
        {
          kind: 'text',
          bodyKey: 'requirements.columns.body',
          headingKey: 'requirements.columns.heading',
        },
        {
          bodyKey: 'requirements.lifecycleVisual.body',
          headingKey: 'requirements.lifecycleVisual.heading',
          kind: 'visual',
          visualId: 'requirementLifecycle',
        },
        {
          kind: 'text',
          bodyKey: 'requirements.lifecycle.body',
          headingKey: 'requirements.lifecycle.heading',
        },
        {
          kind: 'text',
          bodyKey: 'requirements.actions.body',
          headingKey: 'requirements.actions.heading',
        },
      ],
      titleKey: 'requirements.title',
    })
  })

  it('waits for hydrated preferences and the first row response before mounting the table', async () => {
    const columnWidthsStorageKey = getRequirementColumnWidthsStorageKey('sv')
    const initialRequirementsResponse = createDeferredJsonResponse<{
      pagination: { hasMore: boolean }
      requirements: ReturnType<typeof makeRequirementRow>[]
    }>()

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

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)

      if (url.startsWith('/api/requirements?')) {
        return initialRequirementsResponse.promise
      }

      const metadataResponse = mockMetadataFetch(url)
      if (metadataResponse) {
        return Promise.resolve(metadataResponse)
      }

      throw new Error(`Unhandled fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<RequirementsClient />)

    expect(screen.getByTestId('requirements-card-loading')).toBeTruthy()
    expect(screen.getByText('loadingRequirements')).toBeTruthy()
    expect(screen.queryByTestId('requirements-table')).toBeNull()
    expect(tableState.renderSpy).not.toHaveBeenCalled()

    initialRequirementsResponse.resolve({
      pagination: { hasMore: false },
      requirements: [makeRequirementRow(1)],
    })

    await waitFor(() =>
      expect(screen.getByTestId('visible-columns').textContent).toBe(
        'uniqueId,description,area,status',
      ),
    )

    expect(screen.queryByTestId('requirements-card-loading')).toBeNull()
    expect(tableState.renderSpy).toHaveBeenCalled()
    expect(tableState.renderSpy.mock.calls[0]?.[0]).toMatchObject({
      columnWidths: { status: 220 },
      loading: false,
      rows: [expect.objectContaining({ uniqueId: 'INT0001' })],
      visibleColumns: ['uniqueId', 'description', 'area', 'status'],
    })
  })

  it('clears the initial loading state when the first row request rejects', async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)

      if (url.startsWith('/api/requirements?')) {
        return Promise.reject(new Error('Requirements fetch failed'))
      }

      const metadataResponse = mockMetadataFetch(url)
      if (metadataResponse) {
        return Promise.resolve(metadataResponse)
      }

      throw new Error(`Unhandled fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<RequirementsClient />)

    await waitFor(() =>
      expect(screen.queryByTestId('requirements-card-loading')).toBeNull(),
    )

    expect(screen.getByTestId('requirements-table')).toBeTruthy()
    expect(screen.getByTestId('row-ids').textContent).toBe('')
    expect(screen.getByTestId('loading').textContent).toBe('false')
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

    const { container } = render(<RequirementsClient />)

    const tableCard = Array.from(container.querySelectorAll('div')).find(node =>
      node.className.includes(
        'relative rounded-2xl border bg-white/80 shadow-sm backdrop-blur-sm',
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
    ).toHaveAttribute('href', '/requirements/new')
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

    // Print pill is now a dropdown menu with list report options (menu
    // rendering tested in requirements-table.test.tsx floating-action tests)
    expect(screen.getByRole('button', { name: 'print' })).toHaveAttribute(
      'data-floating-action-id',
      'print',
    )

    fireEvent.click(screen.getByRole('button', { name: 'export' }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('format=csv'),
      ),
    )
    const exportRequest = fetchMock.mock.calls
      .map(([input]) => String(input))
      .find(url => url.includes('format=csv'))
    expect(exportRequest).toBeTruthy()
    expect(exportRequest).not.toContain('limit=')
    expect(createObjectURLMock).toHaveBeenCalledTimes(1)
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:requirements-export')
  })

  it('ignores export failures without starting a download', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.startsWith('/api/requirements?')) {
        if (url.includes('format=csv')) {
          return Promise.reject(new Error('Export failed'))
        }

        return okJson({
          pagination: { hasMore: false },
          requirements: [makeRequirementRow(1)],
        })
      }

      const metadataResponse = mockMetadataFetch(url)
      if (metadataResponse) {
        return metadataResponse
      }

      throw new Error(`Unhandled fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<RequirementsClient />)

    await waitFor(() =>
      expect(screen.getByTestId('row-ids').textContent).toBe('INT0001'),
    )

    fireEvent.click(screen.getByRole('button', { name: 'export' }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('format=csv'),
      ),
    )

    expect(createObjectURLMock).not.toHaveBeenCalled()
    expect(revokeObjectURLMock).not.toHaveBeenCalled()
  })

  it('ignores stale refresh responses and pinned-row fetches once a newer refresh wins', async () => {
    const initialList = createDeferredJsonResponse<{
      pagination: { hasMore: boolean }
      requirements: ReturnType<typeof makeRequirementRow>[]
    }>()
    const staleList = createDeferredJsonResponse<{
      pagination: { hasMore: boolean }
      requirements: ReturnType<typeof makeRequirementRow>[]
    }>()
    const freshList = createDeferredJsonResponse<{
      pagination: { hasMore: boolean }
      requirements: ReturnType<typeof makeRequirementRow>[]
    }>()
    const stalePinned =
      createDeferredJsonResponse<ReturnType<typeof makeRequirementDetail>>()
    const freshPinned =
      createDeferredJsonResponse<ReturnType<typeof makeRequirementDetail>>()
    let pinnedFetchCount = 0

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)

      if (url.startsWith('/api/requirements?')) {
        if (
          url.includes('sortBy=uniqueId') &&
          url.includes('sortDirection=asc')
        ) {
          return initialList.promise
        }
        if (
          url.includes('sortBy=status') &&
          url.includes('sortDirection=asc')
        ) {
          return staleList.promise
        }
        if (
          url.includes('sortBy=uniqueId') &&
          url.includes('sortDirection=desc')
        ) {
          return freshList.promise
        }
      }

      if (url === '/api/requirements/1') {
        pinnedFetchCount += 1
        return pinnedFetchCount === 1
          ? stalePinned.promise
          : freshPinned.promise
      }

      const metadataResponse = mockMetadataFetch(url)
      if (metadataResponse) {
        return metadataResponse
      }

      throw new Error(`Unhandled fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<RequirementsClient />)

    initialList.resolve({
      pagination: { hasMore: false },
      requirements: [makeRequirementRow(1)],
    })

    await waitFor(() =>
      expect(screen.getByTestId('row-ids').textContent).toBe('INT0001'),
    )

    fireEvent.click(screen.getByText('row-1'))
    fireEvent.click(screen.getByText('change-sort'))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('sortBy=status'),
      ),
    )

    staleList.resolve({
      pagination: { hasMore: false },
      requirements: [makeRequirementRow(2)],
    })

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(
          ([input]) => String(input) === '/api/requirements/1',
        ),
      ).toHaveLength(1),
    )

    fireEvent.click(screen.getByText('change-sort-desc'))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('sortDirection=desc'),
      ),
    )

    freshList.resolve({
      pagination: { hasMore: false },
      requirements: [makeRequirementRow(3)],
    })

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(
          ([input]) => String(input) === '/api/requirements/1',
        ),
      ).toHaveLength(2),
    )

    freshPinned.resolve(
      makeRequirementDetail(1, {
        hasPendingVersion: true,
        pendingVersionStatusColor: '#eab308',
        pendingVersionStatusId: 2,
        uniqueId: 'FRESH-PINNED-0001',
      }),
    )

    await waitFor(() =>
      expect(screen.getByTestId('row-ids').textContent).toContain('INT0003'),
    )
    expect(screen.getByTestId('row-ids').textContent).toContain(
      'FRESH-PINNED-0001',
    )
    expect(screen.getByTestId('row-ids').textContent).not.toContain('INT0002')
    expect(tableState.renderSpy.mock.calls.at(-1)?.[0]).toMatchObject({
      rows: expect.arrayContaining([
        expect.objectContaining({
          hasPendingVersion: true,
          pendingVersionStatusColor: '#eab308',
          pendingVersionStatusId: 2,
          uniqueId: 'FRESH-PINNED-0001',
        }),
      ]),
    })

    await act(async () => {
      stalePinned.resolve(
        makeRequirementDetail(1, { uniqueId: 'STALE-PINNED-0001' }),
      )
      await Promise.resolve()
    })

    await waitFor(() =>
      expect(screen.getByTestId('row-ids').textContent).not.toContain(
        'STALE-PINNED-0001',
      ),
    )
    expect(screen.getByTestId('row-ids').textContent).toContain(
      'FRESH-PINNED-0001',
    )
    expect(screen.getByTestId('row-ids').textContent).not.toContain('INT0002')
    expect(screen.getByTestId('row-ids').textContent).not.toContain(
      'STALE-PINNED-0001',
    )
  })

  it('prepends a pinned row when status sort metadata is unavailable', async () => {
    const initialList = createDeferredJsonResponse<{
      pagination: { hasMore: boolean }
      requirements: ReturnType<typeof makeRequirementRow>[]
    }>()
    const pinnedList = createDeferredJsonResponse<{
      pagination: { hasMore: boolean }
      requirements: ReturnType<typeof makeRequirementRow>[]
    }>()
    const pinnedDetail =
      createDeferredJsonResponse<ReturnType<typeof makeRequirementDetail>>()

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)

      if (url.startsWith('/api/requirements?')) {
        if (
          url.includes('sortBy=uniqueId') &&
          url.includes('sortDirection=asc')
        ) {
          return initialList.promise
        }
        if (
          url.includes('sortBy=status') &&
          url.includes('sortDirection=asc')
        ) {
          return pinnedList.promise
        }
      }

      if (url === '/api/requirements/1') {
        return pinnedDetail.promise
      }
      if (url === '/api/requirement-statuses') {
        return okJson({ statuses: [] })
      }

      const metadataResponse = mockMetadataFetch(url)
      if (metadataResponse) {
        return metadataResponse
      }

      throw new Error(`Unhandled fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<RequirementsClient />)

    initialList.resolve({
      pagination: { hasMore: false },
      requirements: [makeRequirementRow(1)],
    })

    await waitFor(() =>
      expect(screen.getByTestId('row-ids').textContent).toBe('INT0001'),
    )

    fireEvent.click(screen.getByText('row-1'))
    fireEvent.click(screen.getByText('change-sort'))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('sortBy=status'),
      ),
    )

    pinnedList.resolve({
      pagination: { hasMore: false },
      requirements: [
        makeRequirementRow(3, {
          version: {
            ...makeRequirementRow(3).version,
            status: 1,
            statusNameEn: 'Draft',
            statusNameSv: 'Utkast',
          },
        }),
      ],
    })

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/requirements/1'),
    )

    pinnedDetail.resolve(
      makeRequirementDetail(1, {
        uniqueId: 'PINNED-0001',
        versions: [
          {
            ...makeRequirementDetail(1).versions[0],
            status: 3,
          },
        ],
      }),
    )

    await waitFor(() =>
      expect(screen.getByTestId('row-ids').textContent).toBe(
        'PINNED-0001,INT0003',
      ),
    )
  })

  it('clears a pinned row immediately when selecting a different row', async () => {
    const initialList = createDeferredJsonResponse<{
      pagination: { hasMore: boolean }
      requirements: ReturnType<typeof makeRequirementRow>[]
    }>()
    const pinnedList = createDeferredJsonResponse<{
      pagination: { hasMore: boolean }
      requirements: ReturnType<typeof makeRequirementRow>[]
    }>()
    const pinnedDetail =
      createDeferredJsonResponse<ReturnType<typeof makeRequirementDetail>>()

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)

      if (url.startsWith('/api/requirements?')) {
        if (
          url.includes('sortBy=uniqueId') &&
          url.includes('sortDirection=asc')
        ) {
          return initialList.promise
        }
        if (
          url.includes('sortBy=status') &&
          url.includes('sortDirection=asc')
        ) {
          return pinnedList.promise
        }
      }

      if (url === '/api/requirements/1') {
        return pinnedDetail.promise
      }

      const metadataResponse = mockMetadataFetch(url)
      if (metadataResponse) {
        return metadataResponse
      }

      throw new Error(`Unhandled fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<RequirementsClient />)

    initialList.resolve({
      pagination: { hasMore: false },
      requirements: [makeRequirementRow(1), makeRequirementRow(3)],
    })

    await waitFor(() =>
      expect(screen.getByTestId('row-ids').textContent).toBe('INT0001,INT0003'),
    )

    fireEvent.click(screen.getByText('row-1'))
    fireEvent.click(screen.getByText('change-sort'))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('sortBy=status'),
      ),
    )

    pinnedList.resolve({
      pagination: { hasMore: false },
      requirements: [makeRequirementRow(3)],
    })

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/requirements/1'),
    )

    fireEvent.click(screen.getByText('row-3'))

    pinnedDetail.resolve(makeRequirementDetail(1, { uniqueId: 'PINNED-0001' }))

    await waitFor(() =>
      expect(screen.getByTestId('row-ids').textContent).toBe('INT0003'),
    )
    expect(screen.getByTestId('row-ids').textContent).not.toContain(
      'PINNED-0001',
    )
  })

  it('clears a pinned row immediately when the expanded detail closes', async () => {
    const initialList = createDeferredJsonResponse<{
      pagination: { hasMore: boolean }
      requirements: ReturnType<typeof makeRequirementRow>[]
    }>()
    const pinnedList = createDeferredJsonResponse<{
      pagination: { hasMore: boolean }
      requirements: ReturnType<typeof makeRequirementRow>[]
    }>()
    const closeRefresh = createDeferredJsonResponse<{
      pagination: { hasMore: boolean }
      requirements: ReturnType<typeof makeRequirementRow>[]
    }>()
    const pinnedDetail =
      createDeferredJsonResponse<ReturnType<typeof makeRequirementDetail>>()
    let statusListRequestCount = 0

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)

      if (url.startsWith('/api/requirements?')) {
        if (
          url.includes('sortBy=uniqueId') &&
          url.includes('sortDirection=asc')
        ) {
          return initialList.promise
        }
        if (
          url.includes('sortBy=status') &&
          url.includes('sortDirection=asc')
        ) {
          statusListRequestCount += 1
          return statusListRequestCount === 1
            ? pinnedList.promise
            : closeRefresh.promise
        }
      }

      if (url === '/api/requirements/1') {
        return pinnedDetail.promise
      }

      const metadataResponse = mockMetadataFetch(url)
      if (metadataResponse) {
        return metadataResponse
      }

      throw new Error(`Unhandled fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<RequirementsClient />)

    initialList.resolve({
      pagination: { hasMore: false },
      requirements: [makeRequirementRow(1)],
    })

    await waitFor(() =>
      expect(screen.getByTestId('row-ids').textContent).toBe('INT0001'),
    )

    fireEvent.click(screen.getByText('row-1'))
    fireEvent.click(screen.getByText('change-sort'))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('sortBy=status'),
      ),
    )

    pinnedList.resolve({
      pagination: { hasMore: false },
      requirements: [makeRequirementRow(3)],
    })

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/requirements/1'),
    )

    pinnedDetail.resolve(makeRequirementDetail(1, { uniqueId: 'PINNED-0001' }))

    await waitFor(() =>
      expect(screen.getByTestId('row-ids').textContent).toContain(
        'PINNED-0001',
      ),
    )
    expect(screen.getByTestId('row-ids').textContent).toContain('INT0003')

    fireEvent.click(screen.getByText('detail-close-1'))

    await waitFor(() =>
      expect(screen.getByTestId('row-ids').textContent).toBe('INT0003'),
    )
    expect(screen.getByTestId('row-ids').textContent).not.toContain(
      'PINNED-0001',
    )

    closeRefresh.resolve({
      pagination: { hasMore: false },
      requirements: [makeRequirementRow(4)],
    })

    await waitFor(() =>
      expect(screen.getByTestId('row-ids').textContent).toBe('INT0004'),
    )
  })

  it('ignores stale load-more responses after a newer refresh replaces the list', async () => {
    const initialList = createDeferredJsonResponse<{
      pagination: { hasMore: boolean }
      requirements: ReturnType<typeof makeRequirementRow>[]
    }>()
    const staleLoadMore = createDeferredJsonResponse<{
      pagination: { hasMore: boolean }
      requirements: ReturnType<typeof makeRequirementRow>[]
    }>()
    const freshRefresh = createDeferredJsonResponse<{
      pagination: { hasMore: boolean }
      requirements: ReturnType<typeof makeRequirementRow>[]
    }>()

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)

      if (url.startsWith('/api/requirements?')) {
        if (url.includes('offset=1')) {
          return staleLoadMore.promise
        }
        if (
          url.includes('sortBy=status') &&
          url.includes('sortDirection=asc')
        ) {
          return freshRefresh.promise
        }
        if (
          url.includes('sortBy=uniqueId') &&
          url.includes('sortDirection=asc')
        ) {
          return initialList.promise
        }
      }

      const metadataResponse = mockMetadataFetch(url)
      if (metadataResponse) {
        return metadataResponse
      }

      throw new Error(`Unhandled fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<RequirementsClient />)

    initialList.resolve({
      pagination: { hasMore: true },
      requirements: [makeRequirementRow(1)],
    })

    await waitFor(() =>
      expect(screen.getByTestId('row-ids').textContent).toBe('INT0001'),
    )
    await waitFor(() =>
      expect(screen.getByTestId('has-more').textContent).toBe('true'),
    )

    fireEvent.click(screen.getByText('load-more'))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('offset=1'),
      ),
    )

    fireEvent.click(screen.getByText('change-sort'))

    freshRefresh.resolve({
      pagination: { hasMore: false },
      requirements: [makeRequirementRow(2)],
    })

    await waitFor(() =>
      expect(screen.getByTestId('row-ids').textContent).toBe('INT0002'),
    )
    expect(screen.getByTestId('has-more').textContent).toBe('false')

    staleLoadMore.resolve({
      pagination: { hasMore: true },
      requirements: [makeRequirementRow(3)],
    })

    await waitFor(() =>
      expect(screen.getByTestId('loading-more').textContent).toBe('false'),
    )

    expect(screen.getByTestId('row-ids').textContent).toBe('INT0002')
    expect(screen.getByTestId('row-ids').textContent).not.toContain('INT0003')
    expect(screen.getByTestId('has-more').textContent).toBe('false')
  })

  it('does not start load more while a refresh is already in flight', async () => {
    const initialList = createDeferredJsonResponse<{
      pagination: { hasMore: boolean }
      requirements: ReturnType<typeof makeRequirementRow>[]
    }>()
    const refreshedList = createDeferredJsonResponse<{
      pagination: { hasMore: boolean }
      requirements: ReturnType<typeof makeRequirementRow>[]
    }>()

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)

      if (url.startsWith('/api/requirements?')) {
        if (
          url.includes('sortBy=status') &&
          url.includes('sortDirection=asc')
        ) {
          return refreshedList.promise
        }
        if (
          url.includes('sortBy=uniqueId') &&
          url.includes('sortDirection=asc')
        ) {
          return initialList.promise
        }
      }

      const metadataResponse = mockMetadataFetch(url)
      if (metadataResponse) {
        return metadataResponse
      }

      throw new Error(`Unhandled fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<RequirementsClient />)

    initialList.resolve({
      pagination: { hasMore: true },
      requirements: [makeRequirementRow(1)],
    })

    await waitFor(() =>
      expect(screen.getByTestId('row-ids').textContent).toBe('INT0001'),
    )
    await waitFor(() =>
      expect(screen.getByTestId('has-more').textContent).toBe('true'),
    )

    fireEvent.click(screen.getByText('change-sort'))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('sortBy=status'),
      ),
    )
    await waitFor(() =>
      expect(screen.getByTestId('loading').textContent).toBe('true'),
    )

    fireEvent.click(screen.getByText('load-more'))

    expect(
      fetchMock.mock.calls.some(
        ([input]) =>
          String(input).startsWith('/api/requirements?') &&
          String(input).includes('offset=1'),
      ),
    ).toBe(false)
    expect(screen.getByTestId('loading-more').textContent).toBe('false')

    refreshedList.resolve({
      pagination: { hasMore: false },
      requirements: [makeRequirementRow(2)],
    })

    await waitFor(() =>
      expect(screen.getByTestId('row-ids').textContent).toBe('INT0002'),
    )
    expect(screen.getByTestId('loading').textContent).toBe('false')
  })

  it('keeps refreshed rows when the pinned-row fetch rejects', async () => {
    const initialList = createDeferredJsonResponse<{
      pagination: { hasMore: boolean }
      requirements: ReturnType<typeof makeRequirementRow>[]
    }>()
    const refreshedList = createDeferredJsonResponse<{
      pagination: { hasMore: boolean }
      requirements: ReturnType<typeof makeRequirementRow>[]
    }>()

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)

      if (url.startsWith('/api/requirements?')) {
        if (
          url.includes('sortBy=uniqueId') &&
          url.includes('sortDirection=asc')
        ) {
          return initialList.promise
        }
        if (
          url.includes('sortBy=status') &&
          url.includes('sortDirection=asc')
        ) {
          return refreshedList.promise
        }
      }

      if (url === '/api/requirements/1') {
        return Promise.reject(new Error('Pinned fetch failed'))
      }

      const metadataResponse = mockMetadataFetch(url)
      if (metadataResponse) {
        return metadataResponse
      }

      throw new Error(`Unhandled fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<RequirementsClient />)

    initialList.resolve({
      pagination: { hasMore: false },
      requirements: [makeRequirementRow(1)],
    })

    await waitFor(() =>
      expect(screen.getByTestId('row-ids').textContent).toBe('INT0001'),
    )

    fireEvent.click(screen.getByText('row-1'))
    fireEvent.click(screen.getByText('change-sort'))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('sortBy=status'),
      ),
    )

    refreshedList.resolve({
      pagination: { hasMore: false },
      requirements: [makeRequirementRow(2)],
    })

    await waitFor(() =>
      expect(screen.getByTestId('row-ids').textContent).toBe('INT0002'),
    )
    expect(screen.getByTestId('row-ids').textContent).not.toContain('INT0001')
  })

  it('resets load-more state when the next page request rejects', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.startsWith('/api/requirements?')) {
        if (url.includes('offset=1')) {
          return Promise.reject(new Error('Load more failed'))
        }

        return okJson({
          pagination: { hasMore: true },
          requirements: [makeRequirementRow(1)],
        })
      }

      const metadataResponse = mockMetadataFetch(url)
      if (metadataResponse) {
        return metadataResponse
      }

      throw new Error(`Unhandled fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<RequirementsClient />)

    await waitFor(() =>
      expect(screen.getByTestId('row-ids').textContent).toBe('INT0001'),
    )
    expect(screen.getByTestId('has-more').textContent).toBe('true')

    fireEvent.click(screen.getByText('load-more'))

    await waitFor(() =>
      expect(screen.getByTestId('loading-more').textContent).toBe('false'),
    )

    expect(screen.getByTestId('row-ids').textContent).toBe('INT0001')
    expect(screen.getByTestId('has-more').textContent).toBe('true')
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

    render(<RequirementsClient />)

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
      if (url === '/api/quality-characteristics') {
        return okJson({ qualityCharacteristics: [] })
      }
      if (url === '/api/requirement-statuses') {
        return okJson({ statuses: [] })
      }

      throw new Error(`Unexpected fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<RequirementsClient />)

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

  it('applies the admin-managed column order when browser preferences already include the reordered columns', async () => {
    storageGetItem.mockImplementation((key: string) => {
      if (key === REQUIREMENT_VISIBLE_COLUMNS_STORAGE_KEY) {
        return '["area","category"]'
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

    const reorderedDefaults = normalizeRequirementListColumnDefaults([
      { columnId: 'uniqueId', defaultVisible: true, sortOrder: 0 },
      { columnId: 'description', defaultVisible: true, sortOrder: 1 },
      { columnId: 'category', defaultVisible: true, sortOrder: 2 },
      { columnId: 'area', defaultVisible: true, sortOrder: 3 },
      { columnId: 'type', defaultVisible: true, sortOrder: 4 },
      {
        columnId: 'qualityCharacteristic',
        defaultVisible: false,
        sortOrder: 5,
      },
      { columnId: 'status', defaultVisible: true, sortOrder: 6 },
      { columnId: 'requiresTesting', defaultVisible: false, sortOrder: 7 },
      { columnId: 'version', defaultVisible: false, sortOrder: 8 },
    ])

    render(<RequirementsClient initialColumnDefaults={reorderedDefaults} />)

    await waitFor(() =>
      expect(screen.getByTestId('visible-columns').textContent).toBe(
        'uniqueId,description,category,area',
      ),
    )
  })

  it('keeps successful metadata filters when one metadata request fails', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.startsWith('/api/requirements?')) {
        return okJson({
          pagination: { hasMore: false },
          requirements: [makeRequirementRow(1)],
        })
      }

      if (url === '/api/requirement-areas') {
        return Promise.reject(new Error('Areas fetch failed'))
      }
      if (url === '/api/requirement-categories') {
        return okJson({
          categories: [
            {
              id: 11,
              nameEn: 'Business requirement',
              nameSv: 'Verksamhetskrav',
            },
          ],
        })
      }
      if (url === '/api/requirement-types') {
        return okJson({
          types: [
            {
              id: 12,
              nameEn: 'Functional',
              nameSv: 'Funktionellt',
            },
          ],
        })
      }
      if (url === '/api/quality-characteristics') {
        return okJson({
          qualityCharacteristics: [
            {
              id: 13,
              nameEn: 'Parent',
              nameSv: 'Foralder',
              parentId: null,
            },
          ],
        })
      }
      if (url === '/api/requirement-statuses') {
        return okJson({
          statuses: [
            {
              color: '#22c55e',
              id: 14,
              nameEn: 'Published',
              nameSv: 'Publicerad',
              sortOrder: 14,
            },
          ],
        })
      }

      throw new Error(`Unexpected fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<RequirementsClient />)

    await waitFor(() =>
      expect(screen.getByTestId('row-ids').textContent).toBe('INT0001'),
    )
    await waitFor(() =>
      expect(tableState.renderSpy.mock.calls.at(-1)?.[0]).toMatchObject({
        areas: [],
        categories: [expect.objectContaining({ id: 11 })],
        statusOptions: [expect.objectContaining({ id: 14 })],
        qualityCharacteristics: [expect.objectContaining({ id: 13 })],
        types: [expect.objectContaining({ id: 12 })],
      }),
    )
  })
})

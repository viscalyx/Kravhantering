import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RequirementsTable from '@/components/RequirementsTable'
import { GLOBAL_NAVIGATION_LAYOUT_EVENT } from '@/lib/navigation-layout-events'
import {
  DEFAULT_FILTERS,
  DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS,
  DEFAULT_REQUIREMENT_SORT,
  DEFAULT_VISIBLE_REQUIREMENT_COLUMNS,
  type FilterValues,
} from '@/lib/requirements/list-view'

const mockPush = vi.fn()
const resizeObserverObserve = vi.fn()
const resizeObserverDisconnect = vi.fn()
const DEFAULT_COLUMN_WIDTHS = [150, 360, 136, 152, 148, 176]
const DEFAULT_VIEWPORT_HEIGHT = 768
const DEFAULT_VIEWPORT_WIDTH = 1024

let resizeObserverCallback: ResizeObserverCallback | null = null
let resizeObserverCallbacks: ResizeObserverCallback[] = []

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: width,
  })
  Object.defineProperty(document.documentElement, 'clientWidth', {
    configurable: true,
    value: width,
  })
}

function setViewportHeight(height: number) {
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: height,
  })
}

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href, ...props }: Record<string, unknown>) => (
    <a href={href as string} {...props}>
      {children as React.ReactNode}
    </a>
  ),
  usePathname: () => '/requirements',
  useRouter: () => ({ push: mockPush }),
}))

describe('RequirementsTable', () => {
  beforeEach(() => {
    mockPush.mockReset()
    resizeObserverObserve.mockReset()
    resizeObserverDisconnect.mockReset()
    resizeObserverCallback = null
    resizeObserverCallbacks = []
    setViewportHeight(DEFAULT_VIEWPORT_HEIGHT)
    setViewportWidth(DEFAULT_VIEWPORT_WIDTH)
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        addEventListener: vi.fn(),
        addListener: vi.fn(),
        dispatchEvent: vi.fn(),
        matches: true,
        media: query,
        onchange: null,
        removeEventListener: vi.fn(),
        removeListener: vi.fn(),
      })),
    })
    vi.stubGlobal(
      'ResizeObserver',
      class ResizeObserver {
        constructor(callback: ResizeObserverCallback) {
          resizeObserverCallback = callback
          resizeObserverCallbacks.push(callback)
        }

        disconnect() {
          resizeObserverDisconnect()
        }

        observe(target: Element) {
          resizeObserverObserve(target)
        }

        unobserve() {}
      },
    )
    vi.stubGlobal(
      'requestAnimationFrame',
      (callback: FrameRequestCallback): number => {
        const id = setTimeout(() => {
          callback(performance.now())
        }, 0) as unknown as number

        return id
      },
    )
    vi.stubGlobal('cancelAnimationFrame', (id?: number) => {
      if (typeof id === 'number') {
        clearTimeout(id as unknown as number)
      }
    })
  })

  afterEach(() => {
    setViewportHeight(DEFAULT_VIEWPORT_HEIGHT)
    setViewportWidth(DEFAULT_VIEWPORT_WIDTH)
  })

  // jsdom's PointerEvent defaults `isPrimary` to false and `pointerType` to ''.
  // Real browser pointerdown events on a mouse have `isPrimary: true`,
  // `pointerType: 'mouse'`, `button: 0`. Production code now ignores
  // non-primary / non-left pointers, so test events must opt in to the same
  // shape that real input devices send.
  function firePrimaryPointerDown(
    target: Element,
    init: Record<string, unknown> = {},
  ) {
    fireEvent.pointerDown(target, {
      button: 0,
      isPrimary: true,
      pointerType: 'mouse',
      ...init,
    })
  }

  function makeRow(overrides: Record<string, unknown> = {}) {
    return {
      area: { name: 'Integration' },
      id: 1,
      isArchived: false,
      uniqueId: 'INT0001',
      version: {
        categoryNameEn: 'Business requirement',
        categoryNameSv: 'Verksamhetskrav',
        description: 'Testkrav',
        verifiable: true,
        priorityLevelId: null,
        priorityLevelNameEn: null,
        priorityLevelNameSv: null,
        priorityLevelColor: null,
        priorityLevelSortOrder: null,
        status: 3,
        statusColor: '#22c55e',
        statusNameEn: 'Published',
        statusNameSv: 'Publicerad',
        qualityCharacteristicNameEn: null,
        qualityCharacteristicNameSv: null,
        typeNameEn: 'Functional',
        typeNameSv: 'Funktionellt',
        versionNumber: 2,
      },
      ...overrides,
    }
  }

  function ControlledCompactPackageFilter({
    catalogStatus = 'loaded',
    initialSelectedIds = [],
    packages = [
      { id: 1, name: 'Alfa' },
      { id: 2, name: 'Beta' },
      { id: 3, name: 'Gamma' },
    ],
  }: {
    catalogStatus?: 'failed' | 'loaded' | 'loading'
    initialSelectedIds?: number[]
    packages?: Array<{
      id: number
      name: string
      purposeAndScope?: string | null
    }>
  }) {
    const [filterValues, setFilterValues] = useState<FilterValues>({
      requirementPackageIds:
        initialSelectedIds.length > 0 ? initialSelectedIds : undefined,
    })

    return (
      <div>
        <button type="button">outside-filter</button>
        <div data-testid="package-filter-state">
          {JSON.stringify(filterValues.requirementPackageIds ?? [])}
        </div>
        <RequirementsTable
          filterValues={filterValues}
          locale="sv"
          onFilterChange={setFilterValues}
          requirementPackageCatalogStatus={catalogStatus}
          requirementPackageFilterPresentation="compact-band"
          requirementPackages={packages}
          rows={[makeRow()]}
        />
      </div>
    )
  }

  function ControlledResizableTable({
    initialColumnWidths = {},
  }: {
    initialColumnWidths?: Record<string, number>
  }) {
    const [columnWidths, setColumnWidths] =
      useState<Record<string, number>>(initialColumnWidths)

    return (
      <div>
        <div data-testid="column-width-state">
          {JSON.stringify(columnWidths)}
        </div>
        <RequirementsTable
          columnWidths={columnWidths}
          locale="sv"
          onColumnWidthsChange={setColumnWidths}
          rows={[makeRow()]}
        />
      </div>
    )
  }

  function ControlledExpandedResizableTable() {
    const [columnWidths, setColumnWidths] = useState<Record<string, number>>({})

    return (
      <div>
        <div data-testid="column-width-state">
          {JSON.stringify(columnWidths)}
        </div>
        <RequirementsTable
          columnWidths={columnWidths}
          expandedId={1}
          locale="sv"
          onColumnWidthsChange={setColumnWidths}
          renderExpanded={() => (
            <div data-testid="expanded-detail-content">Expanded detail</div>
          )}
          rows={[
            makeRow(),
            makeRow({
              id: 2,
              uniqueId: 'INT0002',
              version: {
                ...makeRow().version,
                description: 'Uppfoljning',
              },
            }),
          ]}
        />
      </div>
    )
  }

  function ControlledExpandedSwitchTable() {
    const [columnWidths, setColumnWidths] = useState<Record<string, number>>({})
    const [expandedId, setExpandedId] = useState(1)

    return (
      <div>
        <button onClick={() => setExpandedId(2)} type="button">
          expand-second-row
        </button>
        <RequirementsTable
          columnWidths={columnWidths}
          expandedId={expandedId}
          locale="sv"
          onColumnWidthsChange={setColumnWidths}
          renderExpanded={id => (
            <div data-testid={`expanded-detail-content-${id}`}>
              Expanded detail {id}
            </div>
          )}
          rows={[
            makeRow(),
            makeRow({
              id: 2,
              uniqueId: 'INT0002',
              version: {
                ...makeRow().version,
                description: 'Uppfoljning',
              },
            }),
          ]}
        />
      </div>
    )
  }

  function ControlledSearchFilterTable() {
    const [filterValues, setFilterValues] = useState<FilterValues>({
      ...DEFAULT_FILTERS,
      uniqueIdSearch: 'seed',
    })

    return (
      <div>
        <button
          onClick={() =>
            setFilterValues(previous => ({
              ...previous,
              uniqueIdSearch: undefined,
            }))
          }
          type="button"
        >
          clear-search
        </button>
        <div data-testid="search-filter-state">
          {filterValues.uniqueIdSearch ?? ''}
        </div>
        <RequirementsTable
          filterValues={filterValues}
          locale="sv"
          onFilterChange={setFilterValues}
          rows={[makeRow()]}
        />
      </div>
    )
  }

  function ControlledMergedSearchFilterTable() {
    const [filterValues, setFilterValues] = useState<FilterValues>({
      ...DEFAULT_FILTERS,
      uniqueIdSearch: 'seed',
    })

    return (
      <div>
        <button
          onClick={() =>
            setFilterValues(previous => ({
              ...previous,
              areaIds: [42],
            }))
          }
          type="button"
        >
          apply-area-filter
        </button>
        <div data-testid="merged-filter-state">
          {JSON.stringify(filterValues)}
        </div>
        <RequirementsTable
          filterValues={filterValues}
          locale="sv"
          onFilterChange={setFilterValues}
          rows={[makeRow()]}
        />
      </div>
    )
  }

  function getTableContent(container: HTMLElement) {
    return container.querySelector(
      '[data-requirements-scroll-container="true"] > div:last-child',
    ) as HTMLDivElement | null
  }

  function getStickyHeaderContent(container: HTMLElement) {
    return container.querySelector(
      '[data-sticky-table-header="true"]',
    ) as HTMLDivElement | null
  }

  function getColumnWidths(container: HTMLElement) {
    return Array.from(
      container.querySelectorAll(
        '[data-requirements-scroll-container="true"] table col',
      ),
    ).map(col => (col as HTMLTableColElement).style.width)
  }

  function getStickyHeaderColumnWidths(container: HTMLElement) {
    return Array.from(
      container.querySelectorAll('[data-sticky-table-header-table="true"] col'),
    ).map(col => (col as HTMLTableColElement).style.width)
  }

  function getResizeHandle(container: HTMLElement, columnId: string) {
    return container.querySelector(
      `[data-column-resize-handle="${columnId}"]`,
    ) as HTMLButtonElement | null
  }

  function getResizeHandleLeft(container: HTMLElement, columnId: string) {
    return getResizeHandle(container, columnId)?.style.left ?? null
  }

  function getColumnPickerTrigger(
    container: HTMLElement,
  ): HTMLButtonElement | null {
    return (
      (container.querySelector(
        '[data-column-picker-trigger="true"]',
      ) as HTMLButtonElement | null) ??
      (document.querySelector(
        '[data-column-picker-trigger="true"]',
      ) as HTMLButtonElement | null)
    )
  }

  function getColumnPickerBadge(container: HTMLElement) {
    return (
      (container.querySelector(
        '[data-column-picker-badge="true"]',
      ) as HTMLSpanElement | null) ??
      (document.querySelector(
        '[data-column-picker-badge="true"]',
      ) as HTMLSpanElement | null)
    )
  }

  function getColumnPickerWrapper(container: HTMLElement) {
    return (
      (container.querySelector(
        '[data-column-picker-wrapper="true"]',
      ) as HTMLDivElement | null) ??
      (document.querySelector(
        '[data-column-picker-wrapper="true"]',
      ) as HTMLDivElement | null)
    )
  }

  function getColumnPickerShell(container: HTMLElement) {
    return (
      (container.querySelector(
        '[data-column-picker-shell="true"]',
      ) as HTMLButtonElement | null) ??
      (document.querySelector(
        '[data-column-picker-shell="true"]',
      ) as HTMLButtonElement | null)
    )
  }

  function getHeaderFilterButton(label: string) {
    const header = screen.getByText(label).closest('th')
    return header?.querySelector(
      'button[aria-label="filterBy"]',
    ) as HTMLButtonElement | null
  }

  function setElementRect(
    element: Element,
    {
      bottom,
      left,
      right,
      height = 40,
      top = bottom - height,
      width = right - left,
    }: {
      bottom: number
      height?: number
      left: number
      right: number
      top?: number
      width?: number
    },
  ) {
    Object.defineProperty(element, 'getBoundingClientRect', {
      configurable: true,
      value: () =>
        ({
          bottom,
          height,
          left,
          right,
          toJSON: () => ({}),
          top,
          width,
          x: left,
          y: top,
        }) as DOMRect,
    })
  }

  function getOpenPopover() {
    return document.body.querySelector(
      'div.fixed.z-50',
    ) as HTMLDivElement | null
  }

  function getFloatingActionIds(container: HTMLElement) {
    const rail =
      (container.querySelector(
        '[data-floating-action-rail="true"]',
      ) as HTMLDivElement | null) ??
      (document.querySelector(
        '[data-floating-action-rail="true"]',
      ) as HTMLDivElement | null)

    return Array.from(rail?.querySelectorAll('[data-floating-action-id]') ?? [])
      .map(node => node.getAttribute('data-floating-action-id'))
      .filter((value): value is string => value !== null)
  }

  function getFloatingActionRail(container: HTMLElement) {
    return (
      (container.querySelector(
        '[data-floating-action-rail="true"]',
      ) as HTMLDivElement | null) ??
      (document.querySelector(
        '[data-floating-action-rail="true"]',
      ) as HTMLDivElement | null)
    )
  }

  function getFloatingActionRailContainer(container: HTMLElement) {
    const rail = getFloatingActionRail(container)

    return (rail?.parentElement as HTMLDivElement | null) ?? null
  }

  function setHeaderMetrics(container: HTMLElement, widths: number[]) {
    const headers = Array.from(
      container.querySelectorAll(
        '[data-sticky-table-header-table="true"] thead th',
      ),
    ) as HTMLTableCellElement[]

    let left = 0
    for (const [index, header] of headers.entries()) {
      const width = widths[index]
      const nextLeft = left

      Object.defineProperty(header, 'offsetLeft', {
        configurable: true,
        get: () => nextLeft,
      })
      Object.defineProperty(header, 'offsetWidth', {
        configurable: true,
        get: () => width,
      })
      Object.defineProperty(header, 'getBoundingClientRect', {
        configurable: true,
        value: () =>
          ({
            bottom: 40,
            height: 40,
            left: nextLeft,
            right: nextLeft + width,
            toJSON: () => ({}),
            top: 0,
            width,
            x: nextLeft,
            y: 0,
          }) as DOMRect,
      })

      left += width
    }
  }

  function syncResizeHandleMetrics(
    container: HTMLElement,
    widths: number[] = DEFAULT_COLUMN_WIDTHS,
  ) {
    setHeaderMetrics(container, widths)

    act(() => {
      resizeObserverCallback?.([], {} as ResizeObserver)
    })
  }

  function setExpandedDetailMetrics(
    container: HTMLElement,
    {
      bottom,
      contentHeight,
      top,
    }: {
      bottom: number
      contentHeight: number
      top: number
    },
  ) {
    const tableContent = getTableContent(container)
    const detailCell = container.querySelector(
      '[data-expanded-detail-cell="true"]',
    ) as HTMLTableCellElement | null

    if (!tableContent || !detailCell) {
      throw new Error('Expanded detail metrics require a rendered detail cell.')
    }

    Object.defineProperty(tableContent, 'getBoundingClientRect', {
      configurable: true,
      value: () =>
        ({
          bottom: contentHeight,
          height: contentHeight,
          left: 0,
          right: 1122,
          toJSON: () => ({}),
          top: 0,
          width: 1122,
          x: 0,
          y: 0,
        }) as DOMRect,
    })
    Object.defineProperty(detailCell, 'getBoundingClientRect', {
      configurable: true,
      value: () =>
        ({
          bottom,
          height: bottom - top,
          left: 0,
          right: 1122,
          toJSON: () => ({}),
          top,
          width: 1122,
          x: 0,
          y: top,
        }) as DOMRect,
    })

    act(() => {
      resizeObserverCallback?.([], {} as ResizeObserver)
    })
  }

  it('renders empty state when no rows', () => {
    render(<RequirementsTable locale="sv" rows={[]} />)
    expect(screen.getByText('noResults')).toBeTruthy()
    expect(screen.getByText('noResults').closest('td')).toHaveAttribute(
      'colspan',
      String(DEFAULT_VISIBLE_REQUIREMENT_COLUMNS.length),
    )
  })

  it('does not render empty state while loading with no rows', () => {
    vi.useFakeTimers()
    render(<RequirementsTable loading locale="sv" rows={[]} />)

    expect(screen.queryByText('noResults')).toBeNull()
    expect(screen.queryByText('loadingRequirements')).toBeNull()

    act(() => vi.advanceTimersByTime(1000))

    expect(screen.getByText('loadingRequirements')).toBeTruthy()
    expect(screen.queryByText('noResults')).toBeNull()
    vi.useRealTimers()
  })

  it('shows the delayed spinner during background refreshes without hiding rows', () => {
    vi.useFakeTimers()
    render(<RequirementsTable loading locale="sv" rows={[makeRow()]} />)

    expect(screen.getByText('INT0001')).toBeTruthy()
    expect(screen.queryByText('loadingRequirements')).toBeNull()
    expect(screen.queryByText('noResults')).toBeNull()

    act(() => vi.advanceTimersByTime(999))

    expect(screen.queryByText('loadingRequirements')).toBeNull()

    act(() => vi.advanceTimersByTime(1))

    expect(screen.getByText('loadingRequirements')).toBeTruthy()
    expect(screen.getByText('INT0001')).toBeTruthy()
    vi.useRealTimers()
  })

  it('renders table rows with status badge', () => {
    const rows = [makeRow()]
    render(<RequirementsTable locale="sv" rows={rows} />)

    expect(screen.getByText('INT0001')).toBeTruthy()
    expect(screen.getByText('Testkrav')).toBeTruthy()
    expect(screen.getByText('Integration')).toBeTruthy()
    expect(screen.getByText('Publicerad')).toBeTruthy()
    expect(screen.queryByText('v2')).toBeNull()
  })

  it('renders distinct, labelled icons for both verifiable states', () => {
    render(
      <RequirementsTable
        locale="sv"
        rows={[
          makeRow(),
          makeRow({
            id: 2,
            uniqueId: 'INT0002',
            version: {
              ...makeRow().version,
              verifiable: false,
            },
          }),
        ]}
        visibleColumns={[...DEFAULT_VISIBLE_REQUIREMENT_COLUMNS, 'verifiable']}
      />,
    )

    const verifiable = screen.getByRole('img', { name: 'verifiable' })
    const notVerifiable = screen.getByRole('img', { name: 'verifiableOff' })

    expect(verifiable).toHaveAttribute('title', 'verifiable')
    expect(verifiable.querySelector('svg')).toHaveClass('lucide-search-check')
    expect(notVerifiable).toHaveAttribute('title', 'verifiableOff')
    expect(notVerifiable.querySelector('svg')).toHaveClass('lucide-minus')
  })

  it('renders the archiving review label when a Review row has archiveInitiatedAt set', () => {
    const rows = [
      makeRow({
        version: {
          ...makeRow().version,
          status: 2,
          statusColor: '#f59e0b',
          statusNameEn: 'Review',
          statusNameSv: 'Granskning',
          archiveInitiatedAt: '2026-04-01T12:00:00.000Z',
        },
      }),
    ]
    render(<RequirementsTable locale="sv" rows={rows} />)

    expect(screen.getByText('Arkiveringsgranskning')).toBeTruthy()
    expect(screen.queryByText('Granskning')).toBeNull()
  })

  it('keeps the standard Review label when archiveInitiatedAt is null', () => {
    const rows = [
      makeRow({
        version: {
          ...makeRow().version,
          status: 2,
          statusColor: '#f59e0b',
          statusNameEn: 'Review',
          statusNameSv: 'Granskning',
          archiveInitiatedAt: null,
        },
      }),
    ]
    render(<RequirementsTable locale="sv" rows={rows} />)

    expect(screen.getByText('Granskning')).toBeTruthy()
    expect(screen.queryByText('Arkiveringsgranskning')).toBeNull()
  })

  it('renders a specification-local marker icon for specification-local rows', () => {
    render(
      <RequirementsTable
        locale="sv"
        rows={[
          makeRow({
            isSpecificationLocal: true,
            itemRef: 'local:1',
            kind: 'specificationLocal',
            specificationLocalRequirementId: 1,
            uniqueId: 'KRAV0001',
          }),
        ]}
      />,
    )

    expect(
      document.querySelector('[data-specification-local-marker="true"]'),
    ).toBeInTheDocument()
    expect(screen.getByText('-')).toBeInTheDocument()
    expect(screen.queryByText('Integration')).not.toBeInTheDocument()
  })

  it('renders version when the column is made visible', () => {
    render(
      <RequirementsTable
        locale="sv"
        rows={[makeRow()]}
        visibleColumns={[...DEFAULT_VISIBLE_REQUIREMENT_COLUMNS, 'version']}
      />,
    )

    expect(screen.getByText('v2')).toBeTruthy()
  })

  it('renders priority label when column is visible and row has a priority', () => {
    const rows = [
      makeRow({
        version: {
          ...makeRow().version,
          priorityLevelId: 3,
          priorityLevelNameEn: 'Medium high',
          priorityLevelNameSv: 'Medelhög',
          priorityLevelColor: '#eab308',
          priorityLevelSortOrder: 3,
        },
      }),
    ]
    render(
      <RequirementsTable
        locale="sv"
        priorityLevels={[
          {
            code: 'P3',
            color: '#eab308',
            id: 3,
            nameEn: 'Medium high',
            nameSv: 'Medelhög',
            sortOrder: 3,
          },
        ]}
        rows={rows}
        visibleColumns={[
          ...DEFAULT_VISIBLE_REQUIREMENT_COLUMNS,
          'priorityLevel',
        ]}
      />,
    )

    expect(screen.getByText('P3 - Medelhög')).toBeTruthy()
  })

  it('renders read-only usage status icons as decorative badge content', () => {
    const rows = [
      makeRow({
        specificationItemStatusColor: '#f59e0b',
        specificationItemStatusDescriptionEn: 'In progress',
        specificationItemStatusDescriptionSv: 'Pågående',
        specificationItemStatusIconName: 'Play',
        specificationItemStatusId: 2,
        specificationItemStatusNameEn: 'Ongoing',
        specificationItemStatusNameSv: 'Pågående',
      }),
    ]

    render(
      <RequirementsTable
        locale="sv"
        rows={rows}
        visibleColumns={[
          ...DEFAULT_VISIBLE_REQUIREMENT_COLUMNS,
          'specificationItemStatus',
        ]}
      />,
    )

    const statusLabel = screen.getByText('Pågående')
    const statusWrapper = statusLabel.closest('span')
    const statusIcon = statusWrapper?.querySelector('svg[aria-hidden="true"]')

    expect(statusIcon).toHaveAttribute('aria-hidden', 'true')
    expect(statusWrapper).toHaveClass('status-badge')
  })

  it('renders read-only usage status labels without a color dot', () => {
    const rows = [
      makeRow({
        specificationItemStatusColor: null,
        specificationItemStatusDescriptionEn: 'In progress',
        specificationItemStatusDescriptionSv: 'Pågående',
        specificationItemStatusId: 2,
        specificationItemStatusNameEn: 'Ongoing',
        specificationItemStatusNameSv: 'Pågående',
      }),
    ]

    render(
      <RequirementsTable
        locale="sv"
        rows={rows}
        visibleColumns={[
          ...DEFAULT_VISIBLE_REQUIREMENT_COLUMNS,
          'specificationItemStatus',
        ]}
      />,
    )

    const statusLabel = screen.getByText('Pågående')
    const statusWrapper = statusLabel.closest('span')

    expect(statusWrapper?.querySelector('span[aria-hidden="true"]')).toBeNull()
  })

  it('renders the editable usage status select with only real status options', () => {
    const onSpecificationItemStatusChange = vi.fn()
    const rows = [
      makeRow({
        hasApprovedDeviation: false,
        itemRef: 'lib:42',
        specificationItemStatusColor: '#a3a3a3',
        specificationItemStatusDescriptionEn: 'Default',
        specificationItemStatusDescriptionSv: 'Standard',
        specificationItemStatusId: 1,
        specificationItemStatusNameEn: 'Included',
        specificationItemStatusNameSv: 'Inkluderad',
      }),
    ]

    render(
      <RequirementsTable
        locale="sv"
        onSpecificationItemStatusChange={onSpecificationItemStatusChange}
        rows={rows}
        specificationItemStatuses={[
          {
            color: '#a3a3a3',
            descriptionEn: null,
            descriptionSv: null,
            id: 1,
            nameEn: 'Included',
            nameSv: 'Inkluderad',
            sortOrder: 1,
          },
          {
            color: '#f59e0b',
            descriptionEn: 'In progress',
            descriptionSv: 'Pågående',
            id: 2,
            nameEn: 'Ongoing',
            nameSv: 'Pågående',
            sortOrder: 2,
          },
        ]}
        visibleColumns={[
          ...DEFAULT_VISIBLE_REQUIREMENT_COLUMNS,
          'specificationItemStatus',
        ]}
      />,
    )

    const select = screen.getByRole('combobox', {
      name: 'specificationItemStatus',
    }) as HTMLSelectElement
    expect(select.value).toBe('1')
    expect(
      Array.from(select.options).map(option => option.textContent),
    ).not.toContain('—')
    expect(
      Array.from(select.options).map(option => option.value),
    ).not.toContain('')

    fireEvent.change(select, { target: { value: '2' } })
    expect(onSpecificationItemStatusChange).toHaveBeenCalledWith('lib:42', 2)

    fireEvent.change(select, { target: { value: '' } })
    expect(onSpecificationItemStatusChange).toHaveBeenCalledTimes(1)
  })

  it('toggles sorting from the header button and updates aria-sort', () => {
    const onSortChange = vi.fn()

    const { container } = render(
      <RequirementsTable
        locale="sv"
        onSortChange={onSortChange}
        rows={[makeRow()]}
        sortState={DEFAULT_REQUIREMENT_SORT}
      />,
    )

    const headerControl = container.querySelector(
      '[data-requirement-header-control="uniqueId"]',
    ) as HTMLElement
    const headerButton = within(headerControl).getByRole('button')
    const header = headerButton.closest('th')

    expect(header).toHaveAttribute('aria-sort', 'ascending')
    fireEvent.click(headerButton)
    expect(onSortChange).toHaveBeenCalledWith({
      by: 'uniqueId',
      direction: 'desc',
    })
  })

  it('keeps the sort icon fixed while the header label remains truncation-friendly', () => {
    const { container } = render(
      <RequirementsTable locale="sv" rows={[makeRow()]} />,
    )

    const headerControl = container.querySelector(
      '[data-requirement-header-control="uniqueId"]',
    ) as HTMLElement
    const headerButton = within(headerControl).getByRole('button')
    const label = screen.getByText('uniqueId')
    const icon = headerButton.querySelector('svg')

    expect(label.className).toContain('min-w-0')
    expect(label.className).toContain('flex-1')
    expect(label.className).toContain('truncate')
    expect(icon?.getAttribute('class')).toContain('shrink-0')
    expect(icon?.getAttribute('class')).toContain('h-3.5')
    expect(icon?.getAttribute('class')).toContain('w-3.5')
  })

  it('shows locked columns as disabled in the columns popover', () => {
    render(<RequirementsTable locale="sv" rows={[makeRow()]} />)

    fireEvent.click(screen.getByRole('button', { name: 'columns' }))

    const uniqueIdCheckbox = screen.getByRole('checkbox', { name: 'uniqueId' })
    const descriptionCheckbox = screen.getByRole('checkbox', {
      name: 'description',
    })
    const uniqueIdDescriptionId =
      uniqueIdCheckbox.getAttribute('aria-describedby')

    expect(uniqueIdCheckbox).toBeDisabled()
    expect(descriptionCheckbox).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'area' })).not.toBeDisabled()
    expect(uniqueIdDescriptionId).toMatch(
      /column-picker-option-description-uniqueId$/,
    )
    expect(
      uniqueIdDescriptionId
        ? document.getElementById(uniqueIdDescriptionId)
        : null,
    ).toHaveTextContent('lockedColumn')
    expect(uniqueIdCheckbox).toHaveAttribute('title', 'lockedColumn')
    expect(uniqueIdCheckbox.closest('label')).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    const lockedDescriptions = screen.getAllByText('lockedColumn')
    expect(lockedDescriptions.length).toBeGreaterThanOrEqual(2)
    for (const description of lockedDescriptions) {
      expect(description).toHaveClass('sr-only')
    }
  })

  it('assigns unique locked-column description ids to each table instance', () => {
    render(
      <>
        <RequirementsTable locale="sv" rows={[makeRow({ id: 1 })]} />
        <RequirementsTable locale="sv" rows={[makeRow({ id: 2 })]} />
      </>,
    )

    for (const button of screen.getAllByRole('button', { name: 'columns' })) {
      fireEvent.click(button)
    }

    const uniqueIdCheckboxes = screen.getAllByRole('checkbox', {
      name: 'uniqueId',
    })
    const descriptionIds = uniqueIdCheckboxes
      .map(checkbox => checkbox.getAttribute('aria-describedby'))
      .filter((value): value is string => value !== null)

    expect(descriptionIds).toHaveLength(2)
    expect(new Set(descriptionIds).size).toBe(2)
    for (const descriptionId of descriptionIds) {
      expect(descriptionId).toMatch(
        /column-picker-option-description-uniqueId$/,
      )
      expect(document.getElementById(descriptionId)).toHaveTextContent(
        'lockedColumn',
      )
    }
  })

  it('renders minimum hit areas in the columns popover', () => {
    render(<RequirementsTable locale="sv" rows={[makeRow()]} />)

    fireEvent.click(screen.getByRole('button', { name: 'columns' }))

    const resetButton = screen.getByRole('button', { name: 'resetToDefault' })
    const statusLabel = screen
      .getByRole('checkbox', { name: 'status' })
      .closest('label')

    expect(resetButton.className).toContain('min-h-11')
    expect(resetButton.className).toContain('min-w-11')
    expect(statusLabel).toBeTruthy()
    expect(statusLabel?.className).toContain('min-h-11')
    expect(statusLabel?.className).toContain('min-w-11')
    expect(statusLabel?.className).toContain('w-full')
  })

  it('resets to context-specific default visible columns when provided', () => {
    const onColumnWidthsChange = vi.fn()
    const onFilterChange = vi.fn()
    const onSortChange = vi.fn()
    const onVisibleColumnsChange = vi.fn()

    render(
      <RequirementsTable
        columnWidths={{ status: 220 }}
        defaultVisibleColumns={[
          'uniqueId',
          'description',
          'area',
          'needsReference',
        ]}
        filterValues={{ statuses: [3] }}
        locale="sv"
        onColumnWidthsChange={onColumnWidthsChange}
        onFilterChange={onFilterChange}
        onSortChange={onSortChange}
        onVisibleColumnsChange={onVisibleColumnsChange}
        rows={[makeRow()]}
        sortState={{ by: 'status', direction: 'desc' }}
        visibleColumns={[
          'uniqueId',
          'description',
          'area',
          'category',
          'type',
          'status',
          'needsReference',
        ]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'columns' }))
    fireEvent.click(screen.getByRole('button', { name: 'resetToDefault' }))

    expect(onVisibleColumnsChange).toHaveBeenCalledWith([
      'uniqueId',
      'description',
      'area',
      'needsReference',
    ])
    expect(onFilterChange).toHaveBeenCalledWith({ statuses: undefined })
    expect(onSortChange).toHaveBeenCalledWith(DEFAULT_REQUIREMENT_SORT)
    expect(onColumnWidthsChange).toHaveBeenCalledWith({})
  })

  it('keeps locked columns visible even when excludeColumns includes them', () => {
    render(
      <RequirementsTable
        excludeColumns={['uniqueId', 'description']}
        locale="sv"
        rows={[makeRow()]}
      />,
    )

    expect(screen.getByText('uniqueId')).toBeInTheDocument()
    expect(screen.getByText('description')).toBeInTheDocument()
    expect(screen.getByText('INT0001')).toBeInTheDocument()
    expect(screen.getByText('Testkrav')).toBeInTheDocument()
  })

  it('renders the floating pill outside the table header and closes on outside click', () => {
    const { container } = render(
      <RequirementsTable locale="sv" rows={[makeRow()]} />,
    )

    expect(
      container.querySelector('[data-column-picker-trigger="true"]'),
    ).toBeNull()
    expect(getColumnPickerTrigger(container)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'columns' }))
    expect(screen.getByRole('checkbox', { name: 'status' })).toBeTruthy()

    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('checkbox', { name: 'status' })).toBeNull()
  })

  it('exposes developer-mode metadata for column picker options', () => {
    const { container } = render(
      <RequirementsTable locale="sv" rows={[makeRow()]} />,
    )

    fireEvent.click(getColumnPickerTrigger(container) as HTMLButtonElement)

    const option = document.querySelector(
      '[data-column-picker-option="verifiable"]',
    )

    expect(option).toHaveAttribute(
      'data-developer-mode-context',
      'requirements table > column picker: columns',
    )
    expect(option).toHaveAttribute(
      'data-developer-mode-name',
      'column picker option',
    )
    expect(option).toHaveAttribute('data-developer-mode-value', 'verifiable')
  })

  it('keeps the floating action rail within the viewport on narrow screens', async () => {
    const { container } = render(
      <RequirementsTable locale="sv" rows={[makeRow()]} />,
    )

    const scrollContainer = container.querySelector(
      '[data-requirements-scroll-container="true"]',
    ) as HTMLDivElement | null

    expect(scrollContainer).toBeTruthy()
    if (!scrollContainer) {
      throw new Error('Expected the scroll container to be rendered.')
    }

    setViewportWidth(320)
    Object.defineProperty(scrollContainer, 'getBoundingClientRect', {
      configurable: true,
      value: () =>
        ({
          bottom: 284,
          height: 240,
          left: 24,
          right: 340,
          toJSON: () => ({}),
          top: 24,
          width: 316,
          x: 24,
          y: 24,
        }) as DOMRect,
    })

    act(() => {
      window.dispatchEvent(new Event('resize'))
    })

    await waitFor(() => {
      expect(getFloatingActionRailContainer(container)?.style.left).toBe(
        '268px',
      )
    })
  })

  it('repositions the floating action rail when the global navigation layout changes', async () => {
    const { container } = render(
      <RequirementsTable locale="sv" rows={[makeRow()]} />,
    )

    const scrollContainer = container.querySelector(
      '[data-requirements-scroll-container="true"]',
    ) as HTMLDivElement | null

    expect(scrollContainer).toBeTruthy()
    if (!scrollContainer) {
      throw new Error('Expected the scroll container to be rendered.')
    }

    setViewportWidth(1280)
    setElementRect(scrollContainer, {
      bottom: 560,
      left: 100,
      right: 800,
      top: 120,
      width: 700,
    })

    act(() => {
      window.dispatchEvent(new Event('resize'))
    })

    await waitFor(() => {
      expect(getFloatingActionRailContainer(container)?.style.left).toBe(
        '812px',
      )
    })

    setElementRect(scrollContainer, {
      bottom: 560,
      left: 220,
      right: 920,
      top: 120,
      width: 700,
    })

    act(() => {
      window.dispatchEvent(new Event(GLOBAL_NAVIGATION_LAYOUT_EVENT))
    })

    await waitFor(() => {
      expect(getFloatingActionRailContainer(container)?.style.left).toBe(
        '932px',
      )
    })
  })

  it('keeps the floating action rail fixed while the table remains in view and hides it when scrolled away', async () => {
    const { container } = render(
      <RequirementsTable locale="sv" rows={[makeRow()]} />,
    )

    const scrollContainer = container.querySelector(
      '[data-requirements-scroll-container="true"]',
    ) as HTMLDivElement | null

    expect(scrollContainer).toBeTruthy()
    if (!scrollContainer) {
      throw new Error('Expected the scroll container to be rendered.')
    }

    setElementRect(scrollContainer, {
      bottom: 560,
      left: 24,
      right: 340,
      top: 120,
      width: 316,
    })

    act(() => {
      window.dispatchEvent(new Event('resize'))
    })

    await waitFor(() => {
      expect(getFloatingActionRailContainer(container)?.style.top).toBe('124px')
    })

    setElementRect(scrollContainer, {
      bottom: 300,
      left: 24,
      right: 340,
      top: -140,
      width: 316,
    })

    act(() => {
      window.dispatchEvent(new Event('scroll'))
    })

    await waitFor(() => {
      expect(getFloatingActionRailContainer(container)?.style.top).toBe('80px')
    })

    setElementRect(scrollContainer, {
      bottom: 60,
      left: 24,
      right: 340,
      top: -380,
      width: 316,
    })

    act(() => {
      window.dispatchEvent(new Event('scroll'))
    })

    await waitFor(() => {
      expect(getFloatingActionRailContainer(container)).toBeNull()
    })
  })

  it('renders an inline top rail and sticky title bar when requested', () => {
    const { container } = render(
      <RequirementsTable
        floatingActionRailPlacement="inline-top"
        locale="sv"
        rows={[makeRow()]}
        stickyTitle={<h2>Requirement applications</h2>}
        stickyTitleActions={<button type="button">Remove selected</button>}
      />,
    )

    const stickyTopBar = container.querySelector(
      '[data-requirements-sticky-top-bar="true"]',
    ) as HTMLDivElement | null
    const inlineRail = container.querySelector(
      '[data-floating-action-rail-placement="inline-top"]',
    ) as HTMLDivElement | null
    const actionGroup = stickyTopBar?.lastElementChild as HTMLDivElement | null

    expect(stickyTopBar).toBeTruthy()
    expect(stickyTopBar).toHaveTextContent('Requirement applications')
    expect(stickyTopBar).toHaveTextContent('Remove selected')
    expect(stickyTopBar?.className).toContain('flex-wrap')
    expect(stickyTopBar?.className).toContain('sm:flex-nowrap')
    expect(inlineRail).toBeTruthy()
    expect(inlineRail?.className).toContain('flex-wrap')
    expect(inlineRail?.className).toContain('sm:flex-nowrap')
    expect(actionGroup?.className).toContain('flex-wrap')
    expect(actionGroup?.className).toContain('sm:flex-nowrap')
    expect(actionGroup?.className).toContain('sm:shrink-0')
    expect(
      inlineRail?.querySelector('[data-column-picker-trigger="true"]'),
    ).toBeTruthy()
    expect(
      document.querySelector(
        '[data-floating-action-rail-placement="fixed-right"]',
      ),
    ).toBeNull()
  })

  it('renders the synced header inside a sticky table chrome container', () => {
    const { container } = render(
      <RequirementsTable
        locale="sv"
        onSelectionChange={vi.fn()}
        rows={[makeRow()]}
        selectable
        selectedIds={new Set()}
      />,
    )

    const stickyTableChrome = container.querySelector(
      '[data-sticky-table-chrome="true"]',
    ) as HTMLDivElement | null
    const stickyHeaderTable = container.querySelector(
      '[data-sticky-table-header-table="true"]',
    ) as HTMLTableElement | null
    const stickyHeaderCells = Array.from(
      container.querySelectorAll(
        '[data-sticky-table-header-table="true"] thead th',
      ),
    )
    const semanticHeaderCells = Array.from(
      container.querySelectorAll(
        '[data-requirements-data-table="true"] thead th',
      ),
    )

    expect(stickyTableChrome?.className).toContain('sticky')
    expect(stickyTableChrome?.className).toContain('top-0')
    expect(stickyTableChrome?.className).toContain('rounded-t-2xl')
    expect(stickyHeaderTable).toHaveAttribute('role', 'presentation')
    expect(stickyHeaderCells.length).toBeGreaterThan(1)
    expect(semanticHeaderCells.length).toBeGreaterThan(1)
    for (const cell of stickyHeaderCells) {
      expect(cell.className).toContain('bg-secondary-50')
    }
  })

  it('keeps table selection checkboxes compact in separate header and body rows', () => {
    render(
      <RequirementsTable
        locale="sv"
        onSelectionChange={vi.fn()}
        rows={[makeRow(), makeRow({ id: 2, uniqueId: 'INT0002' })]}
        selectable
        selectedIds={new Set()}
      />,
    )

    const selectAll = screen.getByRole('checkbox', { name: 'selectAll' })
    const rowSelections = screen.getAllByRole('checkbox', { name: 'selectRow' })
    expect(selectAll).toHaveClass('h-4', 'w-4')
    expect(selectAll).not.toHaveClass('min-h-6', 'min-w-6')
    expect(rowSelections).toHaveLength(2)
    for (const checkbox of rowSelections) {
      expect(checkbox).toHaveClass('h-4', 'w-4')
      expect(checkbox).not.toHaveClass('min-h-6', 'min-w-6')
      expect(checkbox.parentElement).toHaveClass('py-2')
    }
  })

  it('can expose individual row selection without a Select all control', () => {
    render(
      <RequirementsTable
        locale="en"
        onSelectionChange={vi.fn()}
        rows={[makeRow()]}
        selectable
        selectedIds={new Set()}
        showSelectAll={false}
        statusRow={<div role="status">selection summary</div>}
      />,
    )

    expect(
      screen.queryByRole('checkbox', { name: 'selectAll' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('checkbox', { name: 'selectRow' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('selection summary')
  })

  it('supports overriding the sticky top offset classes for container-scrolled tables', () => {
    const { container } = render(
      <RequirementsTable
        locale="sv"
        rows={[makeRow()]}
        stickyTopOffsetClassName="top-4 xl:top-0"
      />,
    )

    const stickyTableChrome = container.querySelector(
      '[data-sticky-table-chrome="true"]',
    ) as HTMLDivElement | null

    expect(stickyTableChrome?.className).toContain('top-4')
    expect(stickyTableChrome?.className).toContain('xl:top-0')
  })

  it('shows the floating pill badge in the default column state', () => {
    const { container } = render(
      <RequirementsTable locale="sv" rows={[makeRow()]} />,
    )

    expect(getColumnPickerBadge(container)?.textContent).toBe('6/15')
  })

  it('renders the floating pill in a centered square shell', () => {
    const { container } = render(
      <RequirementsTable locale="sv" rows={[makeRow()]} />,
    )

    const wrapper = getColumnPickerWrapper(container)
    const shell = getColumnPickerShell(container)

    expect(wrapper).toBeTruthy()
    expect(shell).toBeTruthy()
    expect(shell?.className).toContain('h-11')
    expect(shell?.className).toContain('w-11')
    expect(shell?.className).toContain('rounded-full')
  })

  it('renders custom floating actions around the columns pill in rail order', () => {
    const { container } = render(
      <RequirementsTable
        floatingActions={[
          {
            ariaLabel: 'newRequirement',
            href: '/requirements/new',
            icon: <span aria-hidden="true">+</span>,
            id: 'create',
            position: 'beforeColumns',
            variant: 'primary',
          },
          {
            ariaLabel: 'print',
            icon: <span aria-hidden="true">P</span>,
            id: 'print',
          },
          {
            ariaLabel: 'export',
            icon: <span aria-hidden="true">E</span>,
            id: 'export',
          },
        ]}
        locale="sv"
        rows={[makeRow()]}
      />,
    )

    expect(getFloatingActionIds(container)).toEqual([
      'create',
      'columns',
      'print',
      'export',
    ])
    expect(
      screen.getByRole('link', { name: 'newRequirement' }),
    ).toHaveAttribute('href', '/requirements/new')
    expect(
      screen.getByRole('link', { name: 'newRequirement' }).dataset
        .floatingActionVariant,
    ).toBe('primary')
    expect(
      screen.getByRole('button', { name: 'columns' }).dataset
        .floatingActionVariant,
    ).toBe('default')
  })

  it('can place the columns pill after trailing floating actions', () => {
    const { container } = render(
      <RequirementsTable
        columnPickerPlacement="end"
        floatingActions={[
          {
            ariaLabel: 'newRequirement',
            href: '/requirements/new',
            icon: <span aria-hidden="true">+</span>,
            id: 'create',
            position: 'beforeColumns',
            variant: 'primary',
          },
          {
            ariaLabel: 'print',
            icon: <span aria-hidden="true">P</span>,
            id: 'print',
          },
          {
            ariaLabel: 'import',
            icon: <span aria-hidden="true">I</span>,
            id: 'import',
          },
          {
            ariaLabel: 'export',
            icon: <span aria-hidden="true">E</span>,
            id: 'export',
          },
        ]}
        locale="sv"
        rows={[makeRow()]}
      />,
    )

    expect(getFloatingActionIds(container)).toEqual([
      'create',
      'print',
      'import',
      'export',
      'columns',
    ])
  })

  it('hides the scroll-to-top pill while the table is still at its top', async () => {
    const { container } = render(
      <RequirementsTable
        floatingActions={[
          {
            ariaLabel: 'newRequirement',
            href: '/requirements/new',
            icon: <span aria-hidden="true">+</span>,
            id: 'create',
            position: 'beforeColumns',
            variant: 'primary',
          },
          {
            ariaLabel: 'print',
            icon: <span aria-hidden="true">P</span>,
            id: 'print',
          },
        ]}
        locale="sv"
        rows={[makeRow()]}
      />,
    )

    const scrollContainer = container.querySelector(
      '[data-requirements-scroll-container="true"]',
    ) as HTMLDivElement | null

    expect(scrollContainer).toBeTruthy()
    if (!scrollContainer) {
      throw new Error('Expected the scroll container to be rendered.')
    }

    setElementRect(scrollContainer, {
      bottom: 520,
      left: 24,
      right: 340,
      top: 60,
      width: 316,
    })

    act(() => {
      window.dispatchEvent(new Event('scroll'))
    })

    await waitFor(() => {
      expect(getFloatingActionIds(container)).toEqual([
        'create',
        'columns',
        'print',
      ])
    })
    expect(
      document.querySelector('[data-scroll-top-trigger="true"]'),
    ).toBeNull()
  })

  it('renders the scroll-to-top pill in a separate end group after vertical scroll', async () => {
    const { container } = render(
      <RequirementsTable
        floatingActions={[
          {
            ariaLabel: 'newRequirement',
            href: '/requirements/new',
            icon: <span aria-hidden="true">+</span>,
            id: 'create',
            position: 'beforeColumns',
            variant: 'primary',
          },
          {
            ariaLabel: 'print',
            icon: <span aria-hidden="true">P</span>,
            id: 'print',
          },
        ]}
        locale="sv"
        rows={[makeRow()]}
      />,
    )

    const scrollContainer = container.querySelector(
      '[data-requirements-scroll-container="true"]',
    ) as HTMLDivElement | null

    expect(scrollContainer).toBeTruthy()
    if (!scrollContainer) {
      throw new Error('Expected the scroll container to be rendered.')
    }

    setElementRect(scrollContainer, {
      bottom: 520,
      left: 24,
      right: 340,
      top: -120,
      width: 316,
    })

    act(() => {
      window.dispatchEvent(new Event('scroll'))
    })

    await waitFor(() => {
      expect(getFloatingActionIds(container)).toEqual([
        'create',
        'columns',
        'print',
        'scroll-top',
      ])
    })
    const rail = getFloatingActionRail(container)
    const scrollTopGroup = document.querySelector(
      '[data-floating-action-group="scroll-top"]',
    ) as HTMLDivElement | null
    const scrollTopTrigger = document.querySelector(
      '[data-scroll-top-trigger="true"]',
    ) as HTMLButtonElement | null

    expect(scrollTopGroup).toBeTruthy()
    expect(scrollTopTrigger).toBeTruthy()
    expect(rail?.lastElementChild).toBe(scrollTopGroup)
    expect(scrollTopTrigger).toHaveAttribute(
      'data-developer-mode-name',
      'table action',
    )
    expect(scrollTopTrigger).toHaveAttribute(
      'data-developer-mode-context',
      'requirements table',
    )
    expect(scrollTopTrigger).toHaveAttribute(
      'data-developer-mode-value',
      'scroll to top',
    )
  })

  it('scrolls the table back to its top anchor from the end-cap pill', async () => {
    const { container } = render(
      <RequirementsTable locale="sv" rows={[makeRow()]} />,
    )

    const scrollContainer = container.querySelector(
      '[data-requirements-scroll-container="true"]',
    ) as HTMLDivElement | null

    expect(scrollContainer).toBeTruthy()
    if (!scrollContainer) {
      throw new Error('Expected the scroll container to be rendered.')
    }

    setElementRect(scrollContainer, {
      bottom: 520,
      left: 24,
      right: 340,
      top: -120,
      width: 316,
    })

    const tableRoot = container.firstElementChild as HTMLDivElement | null
    expect(tableRoot).toBeTruthy()
    if (!tableRoot) {
      throw new Error('Expected the table root to be rendered.')
    }

    const scrollIntoView = vi.fn()
    Object.defineProperty(tableRoot, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })

    act(() => {
      window.dispatchEvent(new Event('scroll'))
    })

    await waitFor(() => {
      expect(
        document.querySelector('[data-scroll-top-trigger="true"]'),
      ).toBeTruthy()
    })

    const scrollTopTrigger = document.querySelector(
      '[data-scroll-top-trigger="true"]',
    ) as HTMLButtonElement | null

    expect(scrollTopTrigger).toBeTruthy()
    if (!scrollTopTrigger) {
      throw new Error('Expected the scroll-to-top trigger to be rendered.')
    }

    fireEvent.click(scrollTopTrigger)

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: 'auto',
      block: 'start',
    })
  })

  it('clamps floating action menus inside the viewport on narrow screens', async () => {
    setViewportWidth(320)

    render(
      <RequirementsTable
        floatingActions={[
          {
            ariaLabel: 'manage',
            icon: <span aria-hidden="true">M</span>,
            id: 'manage',
            menuItems: [
              {
                href: '/sv/admin',
                id: 'admin',
                label: 'Admin',
              },
            ],
          },
        ]}
        locale="sv"
        rows={[makeRow()]}
      />,
    )

    const trigger = screen.getByRole('button', { name: 'manage' })
    setElementRect(trigger, {
      bottom: 140,
      left: 280,
      right: 324,
      top: 96,
      width: 44,
    })

    fireEvent.click(trigger)

    await waitFor(() => {
      const menu = document.querySelector(
        '[data-floating-action-menu="manage"]',
      ) as HTMLDivElement | null
      const menuContainer = menu?.parentElement as HTMLDivElement | null
      const left = Number.parseInt(menuContainer?.style.left ?? '0', 10)
      const width = Number.parseInt(menuContainer?.style.width ?? '0', 10)

      expect(menu).toBeTruthy()
      expect(left).toBeGreaterThanOrEqual(8)
      expect(left + width).toBeLessThanOrEqual(312)
      expect(menuContainer?.style.width).toBe('288px')
      expect(menu?.className).not.toContain('w-72')
    })
  })

  it('renders floating action menus with menu semantics, native links, and touch-target classes', async () => {
    render(
      <RequirementsTable
        floatingActions={[
          {
            ariaLabel: 'manage',
            icon: <span aria-hidden="true">M</span>,
            id: 'manage',
            menuItems: [
              {
                description: 'Open admin settings',
                href: '/sv/admin',
                id: 'admin',
                label: 'Admin',
              },
            ],
          },
        ]}
        locale="sv"
        rows={[makeRow()]}
      />,
    )

    const trigger = screen.getByRole('button', { name: 'manage' })
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).not.toHaveAttribute('aria-controls')

    fireEvent.click(trigger)

    await waitFor(() => {
      const menu = screen.getByRole('menu', { name: 'manage' })
      const list = menu.querySelector('ul')
      const item = list?.querySelector('li')
      const link = screen.getByRole('menuitem', {
        name: /Admin/,
      }) as HTMLAnchorElement

      expect(menu).toBeTruthy()
      expect(trigger).toHaveAttribute('aria-expanded', 'true')
      expect(trigger).toHaveAttribute('aria-controls', menu.id)
      expect(menu).toHaveAttribute('aria-labelledby', trigger.id)
      expect(list).toBeTruthy()
      expect(item).toBeTruthy()
      expect(link.tagName).toBe('A')
      expect(link).toHaveAttribute('href', '/sv/admin')
      expect(link.className).toContain('min-h-11')
      expect(link.className).toContain('min-w-11')
      expect(link.className).toContain('focus-visible:ring-2')
    })
  })

  it('renders floating action menu separators without adding focusable menu items', async () => {
    render(
      <RequirementsTable
        floatingActions={[
          {
            ariaLabel: 'manage',
            icon: <span aria-hidden="true">M</span>,
            id: 'manage',
            menuItems: [
              {
                id: 'import',
                label: 'Import',
                onClick: vi.fn(),
              },
              {
                id: 'separator-export',
                kind: 'separator',
              },
              {
                id: 'export',
                label: 'Export',
                onClick: vi.fn(),
              },
            ],
          },
        ]}
        locale="sv"
        rows={[makeRow()]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'manage' }))

    const importItem = await screen.findByRole('menuitem', { name: 'Import' })
    const exportItem = screen.getByRole('menuitem', { name: 'Export' })
    const separators = screen.getAllByRole('separator', { hidden: true })

    expect(separators).toHaveLength(1)

    await waitFor(() => expect(importItem).toHaveFocus())

    fireEvent.keyDown(document, { key: 'ArrowDown' })
    expect(exportItem).toHaveFocus()
  })

  it('supports keyboard navigation in floating action menus', async () => {
    render(
      <RequirementsTable
        floatingActions={[
          {
            ariaLabel: 'manage',
            icon: <span aria-hidden="true">M</span>,
            id: 'manage',
            menuItems: [
              {
                href: '/sv/admin',
                id: 'admin',
                label: 'Admin',
              },
              {
                disabled: true,
                id: 'disabled',
                label: 'Disabled',
                onClick: vi.fn(),
              },
              {
                id: 'export',
                label: 'Export',
                onClick: vi.fn(),
              },
            ],
          },
        ]}
        locale="sv"
        rows={[makeRow()]}
      />,
    )

    const trigger = screen.getByRole('button', { name: 'manage' })
    fireEvent.click(trigger)

    const adminItem = await screen.findByRole('menuitem', { name: 'Admin' })
    const disabledItem = screen.getByRole('menuitem', { name: 'Disabled' })
    const exportItem = screen.getByRole('menuitem', { name: 'Export' })

    await waitFor(() => expect(adminItem).toHaveFocus())

    fireEvent.keyDown(document, { key: 'ArrowDown' })
    expect(exportItem).toHaveFocus()
    expect(disabledItem).not.toHaveFocus()

    fireEvent.keyDown(document, { key: 'ArrowDown' })
    expect(adminItem).toHaveFocus()

    fireEvent.keyDown(document, { key: 'ArrowUp' })
    expect(exportItem).toHaveFocus()

    fireEvent.keyDown(document, { key: 'Home' })
    expect(adminItem).toHaveFocus()

    fireEvent.keyDown(document, { key: 'End' })
    expect(exportItem).toHaveFocus()

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => {
      expect(screen.queryByRole('menu', { name: 'manage' })).toBeNull()
      expect(trigger).toHaveAttribute('aria-expanded', 'false')
      expect(trigger).not.toHaveAttribute('aria-controls')
    })
    expect(trigger).toHaveFocus()
  })

  it('renders floating action menu item badges next to the item label', async () => {
    render(
      <RequirementsTable
        floatingActions={[
          {
            ariaLabel: 'reports',
            icon: <span aria-hidden="true">P</span>,
            id: 'reports',
            menuItems: [
              {
                badge: 2,
                id: 'combined-review',
                label: 'Kombinerad granskningsrapport',
                onClick: vi.fn(),
              },
            ],
          },
        ]}
        locale="sv"
        rows={[makeRow()]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'reports' }))

    const reportItem = await screen.findByRole('menuitem', {
      name: /Kombinerad granskningsrapport/,
    })
    const badge = reportItem.querySelector(
      '[data-floating-action-menu-item-badge="true"]',
    )

    expect(badge).toHaveTextContent('2')
  })

  it('attaches floating action menu item tooltips to disabled action rows', async () => {
    const description =
      'Alla valda krav måste ha status Granskning för att generera rapporten'
    const tooltip =
      'Rapporten kan bara skapas när alla markerade krav är i Granskning'

    render(
      <RequirementsTable
        floatingActions={[
          {
            ariaLabel: 'reports',
            icon: <span aria-hidden="true">P</span>,
            id: 'reports',
            menuItems: [
              {
                badge: 3,
                description,
                disabled: true,
                id: 'combined-review',
                label: 'Kombinerad granskningsrapport',
                onClick: vi.fn(),
                tooltip,
              },
            ],
            tooltip: 'Rapporter',
          },
        ]}
        locale="sv"
        rows={[makeRow()]}
      />,
    )

    const trigger = screen.getByRole('button', { name: 'reports' })

    fireEvent.click(trigger)

    const reportLabel = await screen.findByText('Kombinerad granskningsrapport')
    const disabledItem = reportLabel.closest(
      '[aria-disabled="true"]',
    ) as HTMLElement | null

    expect(trigger).toHaveAttribute('title', 'Rapporter')
    expect(disabledItem).toBeTruthy()
    expect(disabledItem).toHaveAttribute('title', tooltip)
    expect(screen.getByText(description)).toBeInTheDocument()
    expect(screen.queryByText(tooltip)).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', {
        name: /Kombinerad granskningsrapport/,
      }),
    ).not.toBeInTheDocument()
  })

  it('renders disabled floating menu links as inert items', async () => {
    render(
      <RequirementsTable
        floatingActions={[
          {
            ariaLabel: 'manage',
            icon: <span aria-hidden="true">M</span>,
            id: 'manage',
            menuItems: [
              {
                description: 'Unavailable admin settings',
                disabled: true,
                href: '/sv/admin',
                id: 'admin',
                label: 'Admin',
              },
            ],
          },
        ]}
        locale="sv"
        rows={[makeRow()]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'manage' }))

    const disabledItem = await screen.findByRole('menuitem', { name: /Admin/ })

    expect(disabledItem).toBeTruthy()
    expect(disabledItem).toHaveAttribute('aria-disabled', 'true')
    expect(disabledItem.className).toContain('cursor-not-allowed')
    expect(disabledItem.className).toContain('opacity-50')

    fireEvent.click(disabledItem)

    expect(
      document.querySelector('[data-floating-action-menu="manage"]'),
    ).toBeTruthy()
  })

  it('focuses action-only menu items and passes the stable trigger on activation', async () => {
    const onExport = vi.fn()

    render(
      <RequirementsTable
        floatingActions={[
          {
            ariaLabel: 'manage',
            icon: <span aria-hidden="true">M</span>,
            id: 'manage',
            menuItems: [
              {
                id: 'export',
                label: 'Export',
                onClick: onExport,
              },
            ],
          },
        ]}
        locale="sv"
        rows={[makeRow()]}
      />,
    )

    const trigger = screen.getByRole('button', { name: 'manage' })
    fireEvent.click(trigger)

    const actionButton = await screen.findByRole('menuitem', { name: 'Export' })

    await waitFor(() => expect(actionButton).toHaveFocus())

    fireEvent.click(actionButton)
    expect(onExport).toHaveBeenCalledTimes(1)
    expect(onExport).toHaveBeenCalledWith(trigger)
  })

  it('uses standard wrapping utilities when description wrapping is enabled', () => {
    render(<RequirementsTable locale="sv" rows={[makeRow()]} wrapDescription />)

    const descriptionCell = screen.getByText('Testkrav').closest('td')

    expect(descriptionCell?.className).toContain('whitespace-normal')
    expect(descriptionCell?.className).toContain('wrap-break-word')
    expect(descriptionCell?.className).not.toContain('break-words')
  })

  it('syncs description wrapping when the prop changes on rerender', () => {
    const { rerender } = render(
      <RequirementsTable locale="sv" rows={[makeRow()]} />,
    )

    let descriptionCell = screen.getByText('Testkrav').closest('td')
    expect(descriptionCell?.className).toContain('truncate')

    rerender(
      <RequirementsTable locale="sv" rows={[makeRow()]} wrapDescription />,
    )

    descriptionCell = screen.getByText('Testkrav').closest('td')
    expect(descriptionCell?.className).toContain('whitespace-normal')
    expect(descriptionCell?.className).toContain('wrap-break-word')

    rerender(<RequirementsTable locale="sv" rows={[makeRow()]} />)

    descriptionCell = screen.getByText('Testkrav').closest('td')
    expect(descriptionCell?.className).toContain('truncate')
  })

  it('adds a visible focus ring to the description wrap toggle', () => {
    render(<RequirementsTable locale="sv" rows={[makeRow()]} />)

    const wrapToggle = screen.getByRole('button', { name: 'showFullText' })

    expect(wrapToggle.className).toContain('focus-visible:outline-none')
    expect(wrapToggle.className).toContain('focus-visible:ring-2')
    expect(wrapToggle.className).toContain('focus-visible:ring-offset-2')
  })

  it('marks the description wrap toggle icons as decorative in both states', () => {
    render(<RequirementsTable locale="sv" rows={[makeRow()]} />)

    let wrapToggle = screen.getByRole('button', { name: 'showFullText' })
    let icon = wrapToggle.querySelector('svg')

    expect(icon).toHaveAttribute('aria-hidden', 'true')
    expect(icon).toHaveAttribute('focusable', 'false')

    fireEvent.click(wrapToggle)

    wrapToggle = screen.getByRole('button', { name: 'showShortText' })
    icon = wrapToggle.querySelector('svg')

    expect(icon).toHaveAttribute('aria-hidden', 'true')
    expect(icon).toHaveAttribute('focusable', 'false')
  })

  it('clears hidden column filters and resets hidden active sort', () => {
    const onFilterChange = vi.fn()
    const onSortChange = vi.fn()
    const onVisibleColumnsChange = vi.fn()

    render(
      <RequirementsTable
        filterValues={{ statuses: [3] }}
        locale="sv"
        onFilterChange={onFilterChange}
        onSortChange={onSortChange}
        onVisibleColumnsChange={onVisibleColumnsChange}
        rows={[makeRow()]}
        sortState={{ by: 'status', direction: 'desc' }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'columns' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'status' }))

    expect(onVisibleColumnsChange).toHaveBeenCalledWith([
      'uniqueId',
      'description',
      'area',
      'category',
      'type',
    ])
    expect(onFilterChange).toHaveBeenCalledWith({ statuses: undefined })
    expect(onSortChange).toHaveBeenCalledWith(DEFAULT_REQUIREMENT_SORT)
  })

  it('clears hidden column filters and resets hidden active sort when defaults change externally', async () => {
    const onFilterChange = vi.fn()
    const onSortChange = vi.fn()
    const hiddenStatusDefaults = DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS.map(
      column =>
        column.columnId === 'status'
          ? { ...column, defaultVisible: false }
          : column,
    )

    const { rerender } = render(
      <RequirementsTable
        columnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
        filterValues={{ statuses: [3] }}
        locale="sv"
        onFilterChange={onFilterChange}
        onSortChange={onSortChange}
        rows={[makeRow()]}
        sortState={{ by: 'status', direction: 'desc' }}
      />,
    )

    onFilterChange.mockClear()
    onSortChange.mockClear()

    rerender(
      <RequirementsTable
        columnDefaults={hiddenStatusDefaults}
        filterValues={{ statuses: [3] }}
        locale="sv"
        onFilterChange={onFilterChange}
        onSortChange={onSortChange}
        rows={[makeRow()]}
        sortState={{ by: 'status', direction: 'desc' }}
      />,
    )

    await waitFor(() => {
      expect(onFilterChange).toHaveBeenCalledWith({ statuses: undefined })
      expect(onSortChange).toHaveBeenCalledWith(DEFAULT_REQUIREMENT_SORT)
    })
  })

  it('normalizes excluded visible columns before clearing hidden filters and sort', async () => {
    const onFilterChange = vi.fn()
    const onSortChange = vi.fn()

    render(
      <RequirementsTable
        excludeColumns={['status']}
        filterValues={{ statuses: [3] }}
        locale="sv"
        onFilterChange={onFilterChange}
        onSortChange={onSortChange}
        rows={[makeRow()]}
        sortState={{ by: 'status', direction: 'desc' }}
        visibleColumns={[...DEFAULT_VISIBLE_REQUIREMENT_COLUMNS, 'status']}
      />,
    )

    await waitFor(() => {
      expect(onFilterChange).toHaveBeenCalledWith({ statuses: undefined })
      expect(onSortChange).toHaveBeenCalledWith(DEFAULT_REQUIREMENT_SORT)
    })
  })

  it('cancels pending search commits when the controlled filter value is cleared externally', () => {
    vi.useFakeTimers()

    render(<ControlledSearchFilterTable />)

    const [filterButton] = screen.getAllByRole('button', { name: 'filterBy' })
    expect(filterButton).toBeDefined()
    if (!filterButton) {
      throw new Error('Expected filter button to be rendered.')
    }

    fireEvent.click(filterButton)
    fireEvent.change(screen.getByRole('textbox', { name: 'uniqueId' }), {
      target: { value: 'pending-search' },
    })

    fireEvent.click(screen.getByText('clear-search'))
    act(() => vi.advanceTimersByTime(400))

    expect(screen.getByTestId('search-filter-state').textContent).toBe('')

    vi.useRealTimers()
  })

  it('keeps the column-search clear control at 24 CSS pixels inside its textbox', () => {
    render(
      <RequirementsTable
        filterValues={DEFAULT_FILTERS}
        locale="sv"
        onFilterChange={vi.fn()}
        rows={[makeRow()]}
      />,
    )

    const [filterButton] = screen.getAllByRole('button', { name: 'filterBy' })
    expect(filterButton).toBeDefined()
    if (!filterButton) {
      throw new Error('Expected filter button to be rendered.')
    }

    fireEvent.click(filterButton)
    const textbox = screen.getByRole('textbox', { name: 'uniqueId' })
    fireEvent.change(textbox, { target: { value: 'INT0001' } })

    expect(textbox).toHaveClass('pr-8')
    expect(screen.getByRole('button', { name: 'clear' })).toHaveClass(
      'h-6',
      'w-6',
    )
  })

  it('merges pending search commits with newer filter updates', () => {
    vi.useFakeTimers()

    render(<ControlledMergedSearchFilterTable />)

    const [filterButton] = screen.getAllByRole('button', { name: 'filterBy' })
    expect(filterButton).toBeDefined()
    if (!filterButton) {
      throw new Error('Expected filter button to be rendered.')
    }

    fireEvent.click(filterButton)
    fireEvent.change(screen.getByRole('textbox', { name: 'uniqueId' }), {
      target: { value: 'pending-search' },
    })

    fireEvent.click(screen.getByText('apply-area-filter'))
    act(() => vi.advanceTimersByTime(400))

    expect(screen.getByTestId('merged-filter-state').textContent).toContain(
      '"statuses":[3]',
    )
    expect(screen.getByTestId('merged-filter-state').textContent).toContain(
      '"uniqueIdSearch":"pending-search"',
    )
    expect(screen.getByTestId('merged-filter-state').textContent).toContain(
      '"areaIds":[42]',
    )

    vi.useRealTimers()
  })

  it('keeps filter buttons at the table action size', () => {
    render(
      <RequirementsTable
        filterValues={DEFAULT_FILTERS}
        locale="sv"
        onFilterChange={vi.fn()}
        rows={[makeRow()]}
      />,
    )

    for (const button of screen.getAllByRole('button', { name: 'filterBy' })) {
      expect(button.className).toContain('min-h-11')
      expect(button.className).toContain('min-w-11')
      expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    }
  })

  it('keeps standard filter popover actions at their row height', () => {
    render(
      <RequirementsTable
        filterValues={DEFAULT_FILTERS}
        locale="sv"
        onFilterChange={vi.fn()}
        rows={[makeRow()]}
        statusOptions={[
          {
            color: '#22c55e',
            id: 3,
            nameEn: 'Published',
            nameSv: 'Publicerad',
          },
        ]}
      />,
    )

    const statusFilterButton = getHeaderFilterButton('status')
    expect(statusFilterButton).toBeTruthy()
    if (!statusFilterButton) {
      throw new Error('Expected the status filter button to be rendered.')
    }

    setElementRect(statusFilterButton, { bottom: 40, left: 48, right: 92 })
    fireEvent.click(statusFilterButton)

    const popover = getOpenPopover()
    const clearButton = popover?.querySelector('button')
    const optionRow = popover?.querySelector('label')

    expect(clearButton?.className).toContain('min-h-11')
    expect(optionRow?.className).toContain('min-h-11')
  })

  it('keeps grouped filter popover actions at their row height', () => {
    render(
      <RequirementsTable
        filterValues={{ ...DEFAULT_FILTERS, qualityCharacteristicIds: [2] }}
        locale="sv"
        onFilterChange={vi.fn()}
        qualityCharacteristics={[
          { id: 1, nameEn: 'Parent', nameSv: 'Foralder', parentId: null },
          { id: 2, nameEn: 'Child', nameSv: 'Barn', parentId: 1 },
        ]}
        rows={[makeRow()]}
        visibleColumns={[
          ...DEFAULT_VISIBLE_REQUIREMENT_COLUMNS,
          'qualityCharacteristic',
        ]}
      />,
    )

    const qualityCharacteristicFilterButton = getHeaderFilterButton(
      'qualityCharacteristic',
    )
    expect(qualityCharacteristicFilterButton).toBeTruthy()
    if (!qualityCharacteristicFilterButton) {
      throw new Error(
        'Expected the quality characteristic filter button to be rendered.',
      )
    }

    setElementRect(qualityCharacteristicFilterButton, {
      bottom: 40,
      left: 48,
      right: 92,
    })
    fireEvent.click(qualityCharacteristicFilterButton)

    const popover = getOpenPopover()
    const clearButton = popover?.querySelector('button')
    const optionRow = popover?.querySelector('label')

    expect(clearButton?.className).toContain('min-h-11')
    expect(optionRow?.className).toContain('min-h-11')
  })

  it('sizes the sortable button instead of its header wrapper', () => {
    const { container } = render(
      <RequirementsTable
        filterValues={DEFAULT_FILTERS}
        locale="sv"
        onSortChange={vi.fn()}
        rows={[makeRow()]}
      />,
    )

    const headerControl = container.querySelector(
      '[data-requirement-header-control="uniqueId"]',
    ) as HTMLDivElement | null
    const sortableButton = screen
      .getByText('uniqueId')
      .closest('button') as HTMLButtonElement | null

    expect(headerControl).toBeTruthy()
    expect(sortableButton).toBeTruthy()
    expect(headerControl?.className).not.toContain('min-h-11')
    expect(sortableButton?.className).toContain('min-h-11')
    expect(sortableButton?.className).toContain('min-w-11')
  })

  it('anchors active filter count badges to the filter icon instead of the full button shell', () => {
    const { container } = render(
      <RequirementsTable
        filterValues={{ statuses: [3], qualityCharacteristicIds: [2] }}
        locale="sv"
        onFilterChange={vi.fn()}
        qualityCharacteristics={[
          { id: 1, nameEn: 'Parent', nameSv: 'Foralder', parentId: null },
          { id: 2, nameEn: 'Child', nameSv: 'Barn', parentId: 1 },
        ]}
        rows={[makeRow()]}
        visibleColumns={[
          ...DEFAULT_VISIBLE_REQUIREMENT_COLUMNS,
          'qualityCharacteristic',
        ]}
      />,
    )

    const badges = container.querySelectorAll(
      '[data-filter-count-badge="true"]',
    )
    expect(badges).toHaveLength(2)

    for (const badge of badges) {
      const iconAnchor = badge.closest('[data-filter-icon-anchor="true"]')
      const button = badge.closest('button')

      expect(iconAnchor).toBeTruthy()
      expect(iconAnchor?.parentElement).toBe(button)
      expect(button?.getAttribute('data-filter-icon-anchor')).toBeNull()
    }
  })

  it('clamps filter popovers inside the viewport near the right edge', () => {
    render(
      <RequirementsTable
        filterValues={DEFAULT_FILTERS}
        locale="sv"
        onFilterChange={vi.fn()}
        qualityCharacteristics={[
          { id: 1, nameEn: 'Parent', nameSv: 'Foralder', parentId: null },
          { id: 2, nameEn: 'Child', nameSv: 'Barn', parentId: 1 },
        ]}
        rows={[makeRow()]}
        statusOptions={[
          {
            color: '#22c55e',
            id: 3,
            nameEn: 'Published',
            nameSv: 'Publicerad',
            sortOrder: 3,
          },
        ]}
        visibleColumns={[
          ...DEFAULT_VISIBLE_REQUIREMENT_COLUMNS,
          'qualityCharacteristic',
        ]}
      />,
    )

    setViewportWidth(200)

    const uniqueIdFilterButton = getHeaderFilterButton('uniqueId')
    expect(uniqueIdFilterButton).toBeTruthy()
    if (!uniqueIdFilterButton) {
      throw new Error('Expected the uniqueId filter button to be rendered.')
    }

    setElementRect(uniqueIdFilterButton, { bottom: 40, left: 180, right: 224 })
    fireEvent.click(uniqueIdFilterButton)

    expect(screen.getByRole('textbox', { name: 'uniqueId' })).toBeTruthy()
    expect(getOpenPopover()?.style.left).toBe('8px')

    fireEvent.mouseDown(document.body)

    const statusFilterButton = getHeaderFilterButton('status')
    expect(statusFilterButton).toBeTruthy()
    if (!statusFilterButton) {
      throw new Error('Expected the status filter button to be rendered.')
    }

    setElementRect(statusFilterButton, { bottom: 40, left: 180, right: 224 })
    fireEvent.click(statusFilterButton)

    expect(getOpenPopover()?.style.left).toBe('32px')

    fireEvent.mouseDown(document.body)

    const qualityCharacteristicFilterButton = getHeaderFilterButton(
      'qualityCharacteristic',
    )
    expect(qualityCharacteristicFilterButton).toBeTruthy()
    if (!qualityCharacteristicFilterButton) {
      throw new Error(
        'Expected the quality characteristic filter button to be rendered.',
      )
    }

    setElementRect(qualityCharacteristicFilterButton, {
      bottom: 40,
      left: 180,
      right: 224,
    })
    fireEvent.click(qualityCharacteristicFilterButton)

    expect(getOpenPopover()?.style.left).toBe('8px')
  })

  it('renders resize handles whenever column resizing is enabled', () => {
    const { container, rerender } = render(
      <RequirementsTable
        columnWidths={{ status: 220 }}
        locale="sv"
        onColumnWidthsChange={vi.fn()}
        rows={[makeRow()]}
      />,
    )

    expect(
      screen.getAllByRole('button', { name: 'resizeColumn' }),
    ).toHaveLength(DEFAULT_VISIBLE_REQUIREMENT_COLUMNS.length - 1)
    expect(getResizeHandle(container, 'description')?.className).toContain(
      'min-w-11',
    )
    expect(getResizeHandle(container, 'description')?.className).toContain(
      'min-h-11',
    )
    expect(getResizeHandle(container, 'description')?.className).toContain(
      'before:w-px',
    )
    expect(getResizeHandle(container, 'description')?.className).not.toContain(
      'w-6',
    )
    expect(
      container.querySelector('[data-column-resize-handle="status"]'),
    ).toBeNull()

    rerender(
      <RequirementsTable
        columnWidths={{ status: 220 }}
        locale="sv"
        rows={[makeRow()]}
      />,
    )

    expect(
      container.querySelectorAll('[data-column-resize-handle]').length,
    ).toBe(0)
  })

  it('widens the dragged column and keeps later columns at their width', () => {
    const { container } = render(<ControlledResizableTable />)

    const handle = container.querySelector(
      '[data-column-resize-handle="description"]',
    )
    const tableContent = getTableContent(container)

    expect(handle).toBeTruthy()
    expect(getColumnWidths(container)).toEqual([
      '150px',
      '360px',
      '136px',
      '152px',
      '148px',
      '176px',
    ])
    expect(tableContent?.style.width).toBe('1122px')

    firePrimaryPointerDown(handle as Element, { clientX: 100 })
    fireEvent.pointerMove(window, { clientX: 132 })
    fireEvent.pointerUp(window, { clientX: 132 })

    expect(screen.getByTestId('column-width-state').textContent).toBe(
      '{"description":392}',
    )
    expect(getColumnWidths(container)).toEqual([
      '150px',
      '392px',
      '136px',
      '152px',
      '148px',
      '176px',
    ])
    expect(tableContent?.style.width).toBe('1154px')
  })

  it('shows the resized width during drag and commits it on pointer up', async () => {
    const { container } = render(<ControlledResizableTable />)

    const handle = container.querySelector(
      '[data-column-resize-handle="description"]',
    )
    const tableContent = getTableContent(container)

    expect(handle).toBeTruthy()

    firePrimaryPointerDown(handle as Element, { clientX: 100 })
    fireEvent.pointerMove(window, { clientX: 132 })
    await act(async () => {
      await new Promise<void>(resolve => {
        window.requestAnimationFrame(() => resolve())
      })
    })

    expect(screen.getByTestId('column-width-state').textContent).toBe('{}')
    expect(getColumnWidths(container)).toEqual([
      '150px',
      '392px',
      '136px',
      '152px',
      '148px',
      '176px',
    ])
    expect(tableContent?.style.width).toBe('1154px')

    fireEvent.pointerUp(window, { clientX: 132 })

    expect(screen.getByTestId('column-width-state').textContent).toBe(
      '{"description":392}',
    )
  })

  it('keeps the sticky header preview widths aligned with the body during drag', async () => {
    const { container } = render(<ControlledResizableTable />)

    const handle = container.querySelector(
      '[data-column-resize-handle="description"]',
    )
    const tableContent = getTableContent(container)
    const stickyHeaderContent = getStickyHeaderContent(container)

    expect(handle).toBeTruthy()

    firePrimaryPointerDown(handle as Element, { clientX: 100 })
    fireEvent.pointerMove(window, { clientX: 132 })
    await act(async () => {
      await new Promise<void>(resolve => {
        window.requestAnimationFrame(() => resolve())
      })
    })

    expect(getColumnWidths(container)).toEqual([
      '150px',
      '392px',
      '136px',
      '152px',
      '148px',
      '176px',
    ])
    expect(getStickyHeaderColumnWidths(container)).toEqual([
      '150px',
      '392px',
      '136px',
      '152px',
      '148px',
      '176px',
    ])
    expect(tableContent?.style.width).toBe('1154px')
    expect(stickyHeaderContent?.style.width).toBe('1154px')
  })

  it('ignores pointer events from other pointers while a resize is active', async () => {
    const { container } = render(<ControlledResizableTable />)

    syncResizeHandleMetrics(container)

    const handle = getResizeHandle(container, 'description')

    expect(handle).toBeTruthy()
    expect(getResizeHandleLeft(container, 'description')).toBe('510px')

    firePrimaryPointerDown(handle as Element, { clientX: 100, pointerId: 1 })
    fireEvent.pointerMove(window, { clientX: 132, pointerId: 2 })
    fireEvent.pointerUp(window, { clientX: 132, pointerId: 2 })
    fireEvent.pointerCancel(window, { clientX: 132, pointerId: 2 })

    await act(async () => {
      await new Promise<void>(resolve => {
        window.requestAnimationFrame(() => resolve())
      })
    })

    expect(getResizeHandleLeft(container, 'description')).toBe('510px')
    expect(screen.getByTestId('column-width-state').textContent).toBe('{}')

    fireEvent.pointerMove(window, { clientX: 132, pointerId: 1 })
    await act(async () => {
      await new Promise<void>(resolve => {
        window.requestAnimationFrame(() => resolve())
      })
    })

    expect(getResizeHandleLeft(container, 'description')).toBe('542px')

    fireEvent.pointerUp(window, { clientX: 132, pointerId: 1 })

    expect(screen.getByTestId('column-width-state').textContent).toBe(
      '{"description":392}',
    )
  })

  it('moves later divider lines during drag before commit', async () => {
    const { container } = render(<ControlledResizableTable />)

    syncResizeHandleMetrics(container)

    const descriptionHandle = getResizeHandle(container, 'description')

    expect(descriptionHandle).toBeTruthy()
    expect(getResizeHandleLeft(container, 'description')).toBe('510px')
    expect(getResizeHandleLeft(container, 'area')).toBe('646px')

    firePrimaryPointerDown(descriptionHandle as Element, { clientX: 100 })
    fireEvent.pointerMove(window, { clientX: 132 })
    await act(async () => {
      await new Promise<void>(resolve => {
        window.requestAnimationFrame(() => resolve())
      })
    })

    expect(screen.getByTestId('column-width-state').textContent).toBe('{}')
    expect(getResizeHandleLeft(container, 'description')).toBe('542px')
    expect(getResizeHandleLeft(container, 'area')).toBe('678px')
    expect(getColumnWidths(container)).toEqual([
      '150px',
      '392px',
      '136px',
      '152px',
      '148px',
      '176px',
    ])

    fireEvent.pointerUp(window, { clientX: 132 })

    expect(screen.getByTestId('column-width-state').textContent).toBe(
      '{"description":392}',
    )
  })

  it('clips resize handles around the expanded detail pane and caps the lower grip', () => {
    const { container } = render(<ControlledExpandedResizableTable />)

    syncResizeHandleMetrics(container)
    setExpandedDetailMetrics(container, {
      bottom: 240,
      contentHeight: 360,
      top: 120,
    })

    const topHandle = getResizeHandle(container, 'description')
    const bottomSegment = container.querySelector(
      '[data-column-resize-column="description"][data-column-resize-segment="bottom"]',
    ) as HTMLDivElement | null

    expect(topHandle).toBeTruthy()
    expect(topHandle).toHaveAttribute('data-column-resize-segment', 'top')
    expect(topHandle?.style.top).toBe('0px')
    expect(topHandle?.style.height).toBe('120px')
    expect(bottomSegment).toBeTruthy()
    expect(bottomSegment?.style.top).toBe('240px')
    expect(bottomSegment?.style.height).toBe('48px')
    expect(bottomSegment?.className).toContain('min-w-11')
    expect(bottomSegment?.className).toContain('min-h-0')
    expect(bottomSegment).not.toHaveAttribute('data-column-resize-handle')
    expect(
      Number.parseInt(topHandle?.style.height ?? '0', 10),
    ).toBeLessThanOrEqual(120)
    expect(
      Number.parseInt(bottomSegment?.style.top ?? '0', 10),
    ).toBeGreaterThanOrEqual(240)
    expect(
      Number.parseInt(bottomSegment?.style.height ?? '0', 10),
    ).toBeLessThanOrEqual(48)

    firePrimaryPointerDown(bottomSegment as Element, { clientX: 100 })
    fireEvent.pointerMove(window, { clientX: 132 })
    fireEvent.pointerUp(window, { clientX: 132 })

    expect(screen.getByTestId('column-width-state').textContent).toBe(
      '{"description":392}',
    )
  })

  it('rounds clipped resize segments away from the expanded detail pane edges', () => {
    const { container } = render(<ControlledExpandedResizableTable />)

    syncResizeHandleMetrics(container)
    setExpandedDetailMetrics(container, {
      bottom: 240.4,
      contentHeight: 360.4,
      top: 120.6,
    })

    const topHandle = getResizeHandle(container, 'description')
    const bottomSegment = container.querySelector(
      '[data-column-resize-column="description"][data-column-resize-segment="bottom"]',
    ) as HTMLDivElement | null

    expect(topHandle?.style.height).toBe('120px')
    expect(bottomSegment?.style.top).toBe('241px')
    expect(bottomSegment?.style.height).toBe('48px')
  })

  it('keeps clipped resize segments within their visible height', () => {
    const { container } = render(<ControlledExpandedResizableTable />)

    syncResizeHandleMetrics(container)
    setExpandedDetailMetrics(container, {
      bottom: 248,
      contentHeight: 280,
      top: 120,
    })

    const bottomSegment = container.querySelector(
      '[data-column-resize-column="description"][data-column-resize-segment="bottom"]',
    ) as HTMLDivElement | null

    expect(bottomSegment).toBeTruthy()
    expect(bottomSegment?.style.top).toBe('248px')
    expect(bottomSegment?.style.height).toBe('32px')
    expect(bottomSegment?.className).toContain('min-w-11')
    expect(bottomSegment?.className).toContain('min-h-0')
    expect(bottomSegment?.className).not.toContain('min-h-11')
    expect(bottomSegment).not.toHaveAttribute('data-column-resize-handle')

    firePrimaryPointerDown(bottomSegment as Element, {
      clientX: 100,
      pointerId: 1,
    })
    fireEvent.pointerMove(window, { clientX: 132, pointerId: 1 })
    fireEvent.pointerUp(window, { clientX: 132, pointerId: 1 })

    expect(screen.getByTestId('column-width-state').textContent).toBe(
      '{"description":392}',
    )
  })

  it('re-observes the expanded detail cell when the expanded row changes', async () => {
    const { container } = render(<ControlledExpandedSwitchTable />)

    const firstDetailCell = container.querySelector(
      '[data-expanded-detail-cell="true"]',
    ) as HTMLTableCellElement | null

    expect(firstDetailCell).toBeTruthy()

    resizeObserverObserve.mockClear()

    fireEvent.click(screen.getByRole('button', { name: 'expand-second-row' }))

    await waitFor(() =>
      expect(screen.getByTestId('expanded-detail-content-2')).toBeTruthy(),
    )

    const secondDetailCell = container.querySelector(
      '[data-expanded-detail-cell="true"]',
    ) as HTMLTableCellElement | null

    expect(secondDetailCell).toBeTruthy()
    expect(secondDetailCell).not.toBe(firstDetailCell)
    expect(resizeObserverObserve).toHaveBeenCalledWith(secondDetailCell)
  })

  it('restores divider positions on pointer cancel', async () => {
    const { container } = render(<ControlledResizableTable />)

    syncResizeHandleMetrics(container)

    const descriptionHandle = getResizeHandle(container, 'description')

    expect(descriptionHandle).toBeTruthy()
    expect(getResizeHandleLeft(container, 'description')).toBe('510px')
    expect(getResizeHandleLeft(container, 'area')).toBe('646px')

    firePrimaryPointerDown(descriptionHandle as Element, { clientX: 100 })
    fireEvent.pointerMove(window, { clientX: 132 })
    await act(async () => {
      await new Promise<void>(resolve => {
        window.requestAnimationFrame(() => resolve())
      })
    })

    expect(getResizeHandleLeft(container, 'description')).toBe('542px')
    expect(getResizeHandleLeft(container, 'area')).toBe('678px')

    fireEvent.pointerCancel(window, { clientX: 132 })

    expect(screen.getByTestId('column-width-state').textContent).toBe('{}')
    expect(getColumnWidths(container)).toEqual([
      '150px',
      '360px',
      '136px',
      '152px',
      '148px',
      '176px',
    ])
    expect(getResizeHandleLeft(container, 'description')).toBe('510px')
    expect(getResizeHandleLeft(container, 'area')).toBe('646px')
  })

  it('keeps dragging active across multiple pointer moves', () => {
    const { container } = render(<ControlledResizableTable />)

    const handle = container.querySelector(
      '[data-column-resize-handle="description"]',
    )
    const tableContent = getTableContent(container)

    expect(handle).toBeTruthy()

    firePrimaryPointerDown(handle as Element, { clientX: 100 })
    fireEvent.pointerMove(window, { clientX: 132 })
    fireEvent.pointerMove(window, { clientX: 164 })
    fireEvent.pointerUp(window, { clientX: 164 })

    expect(screen.getByTestId('column-width-state').textContent).toBe(
      '{"description":424}',
    )
    expect(getColumnWidths(container)).toEqual([
      '150px',
      '424px',
      '136px',
      '152px',
      '148px',
      '176px',
    ])
    expect(tableContent?.style.width).toBe('1186px')
  })

  it('does not emit duplicate width updates for repeated pointer moves at the same position', () => {
    const onColumnWidthsChange = vi.fn()
    const { container } = render(
      <RequirementsTable
        locale="sv"
        onColumnWidthsChange={onColumnWidthsChange}
        rows={[makeRow()]}
      />,
    )

    const handle = container.querySelector(
      '[data-column-resize-handle="description"]',
    )

    expect(handle).toBeTruthy()

    firePrimaryPointerDown(handle as Element, { clientX: 100 })
    fireEvent.pointerMove(window, { clientX: 132 })
    fireEvent.pointerMove(window, { clientX: 132 })
    fireEvent.pointerMove(window, { clientX: 132 })
    fireEvent.pointerUp(window, { clientX: 132 })

    expect(onColumnWidthsChange).toHaveBeenCalledTimes(1)
    expect(onColumnWidthsChange).toHaveBeenCalledWith({ description: 392 })
  })

  it('does not emit a width change when resetting an explicit default-width override', () => {
    const onColumnWidthsChange = vi.fn()
    const { container } = render(
      <RequirementsTable
        columnWidths={{ description: 360 }}
        locale="sv"
        onColumnWidthsChange={onColumnWidthsChange}
        rows={[makeRow()]}
      />,
    )

    const handle = container.querySelector(
      '[data-column-resize-handle="description"]',
    )

    expect(handle).toBeTruthy()

    fireEvent.doubleClick(handle as Element)

    expect(onColumnWidthsChange).not.toHaveBeenCalled()
  })

  it('commits only the final width after rapid back-and-forth dragging', () => {
    const onColumnWidthsChange = vi.fn()
    const { container } = render(
      <RequirementsTable
        locale="sv"
        onColumnWidthsChange={onColumnWidthsChange}
        rows={[makeRow()]}
      />,
    )

    const handle = container.querySelector(
      '[data-column-resize-handle="description"]',
    )

    expect(handle).toBeTruthy()

    firePrimaryPointerDown(handle as Element, { clientX: 100 })
    fireEvent.pointerMove(window, { clientX: 132 })
    fireEvent.pointerMove(window, { clientX: 76 })
    fireEvent.pointerMove(window, { clientX: 164 })
    fireEvent.pointerMove(window, { clientX: 120 })
    fireEvent.pointerUp(window, { clientX: 120 })

    expect(onColumnWidthsChange).toHaveBeenCalledTimes(1)
    expect(onColumnWidthsChange).toHaveBeenCalledWith({ description: 380 })
  })

  it('shrinks the dragged column without changing later column widths', () => {
    const { container } = render(<ControlledResizableTable />)

    const handle = container.querySelector(
      '[data-column-resize-handle="description"]',
    )
    const tableContent = getTableContent(container)

    expect(handle).toBeTruthy()

    firePrimaryPointerDown(handle as Element, { clientX: 100 })
    fireEvent.pointerMove(window, { clientX: 68 })
    fireEvent.pointerUp(window, { clientX: 68 })

    expect(screen.getByTestId('column-width-state').textContent).toBe(
      '{"description":328}',
    )
    expect(getColumnWidths(container)).toEqual([
      '150px',
      '328px',
      '136px',
      '152px',
      '148px',
      '176px',
    ])
    expect(tableContent?.style.width).toBe('1090px')
  })

  it('supports keyboard resizing and double-click reset', () => {
    const { container } = render(
      <ControlledResizableTable
        initialColumnWidths={{ status: 220, type: 220 }}
      />,
    )

    const handle = container.querySelector('[data-column-resize-handle="type"]')
    const tableContent = getTableContent(container)

    expect(handle).toBeTruthy()

    fireEvent.keyDown(handle as Element, { key: 'ArrowRight' })
    expect(screen.getByTestId('column-width-state').textContent).toBe(
      '{"status":220,"type":228}',
    )
    expect(getColumnWidths(container)).toEqual([
      '150px',
      '360px',
      '136px',
      '152px',
      '228px',
      '220px',
    ])
    expect(tableContent?.style.width).toBe('1246px')

    fireEvent.doubleClick(handle as Element)
    expect(screen.getByTestId('column-width-state').textContent).toBe(
      '{"status":220}',
    )
    expect(getColumnWidths(container)).toEqual([
      '150px',
      '360px',
      '136px',
      '152px',
      '148px',
      '220px',
    ])
    expect(tableContent?.style.width).toBe('1166px')
  })

  it('shows horizontal edge fades only when more content is off-screen', () => {
    const { container } = render(
      <RequirementsTable
        locale="sv"
        onColumnWidthsChange={vi.fn()}
        rows={[makeRow()]}
        visibleColumns={[
          ...DEFAULT_VISIBLE_REQUIREMENT_COLUMNS,
          'qualityCharacteristic',
          'verifiable',
          'version',
        ]}
      />,
    )

    const scrollContainer = container.querySelector(
      '[data-requirements-scroll-container="true"]',
    ) as HTMLDivElement
    const leftFade = container.querySelector('[data-scroll-fade="left"]')
    const rightFade = container.querySelector('[data-scroll-fade="right"]')

    Object.defineProperty(scrollContainer, 'clientWidth', {
      configurable: true,
      value: 240,
    })
    Object.defineProperty(scrollContainer, 'scrollWidth', {
      configurable: true,
      value: 420,
    })
    Object.defineProperty(scrollContainer, 'scrollLeft', {
      configurable: true,
      value: 0,
      writable: true,
    })

    fireEvent.scroll(scrollContainer)
    expect(leftFade?.className).toContain('opacity-0')
    expect(rightFade?.className).toContain('opacity-100')

    scrollContainer.scrollLeft = 80
    fireEvent.scroll(scrollContainer)
    expect(leftFade?.className).toContain('opacity-100')
    expect(rightFade?.className).toContain('opacity-100')

    scrollContainer.scrollLeft = 180
    fireEvent.scroll(scrollContainer)
    expect(rightFade?.className).toContain('opacity-0')
  })

  it('activates expanded rows from the table row and non-interactive cells while keeping the button accessible', () => {
    const onRowClick = vi.fn()
    render(
      <RequirementsTable
        expandedId={1}
        locale="sv"
        onRowClick={onRowClick}
        renderExpanded={() => <div>Expanded detail</div>}
        rows={[makeRow()]}
      />,
    )

    const action = screen.getByRole('button', { name: 'INT0001' })
    const row = action.closest('tr')
    const descriptionCell = screen.getByText('Testkrav').closest('td')

    expect(action).toHaveAttribute('aria-controls', 'requirement-row-detail-1')
    expect(action).toHaveAttribute('aria-expanded', 'true')
    expect(row?.className).toContain('cursor-pointer')

    fireEvent.click(row as Element)
    expect(onRowClick).toHaveBeenCalledTimes(1)
    expect(onRowClick).toHaveBeenCalledWith(1)

    fireEvent.click(descriptionCell as Element)
    expect(onRowClick).toHaveBeenCalledTimes(2)
    expect(onRowClick).toHaveBeenNthCalledWith(2, 1)

    fireEvent.click(action)
    expect(onRowClick).toHaveBeenCalledTimes(3)
    expect(onRowClick).toHaveBeenNthCalledWith(3, 1)
  })

  it('navigates from whole-row clicks and the row action button when no row click handler is provided', () => {
    render(<RequirementsTable locale="sv" rows={[makeRow()]} />)

    fireEvent.click(screen.getByText('Testkrav').closest('td') as Element)
    fireEvent.click(screen.getByRole('button', { name: 'INT0001' }))

    expect(mockPush.mock.calls).toEqual([
      ['/requirements/INT0001'],
      ['/requirements/INT0001'],
    ])
  })

  it('applies the table action size to row action buttons', () => {
    render(<RequirementsTable locale="sv" rows={[makeRow()]} />)

    const action = screen.getByRole('button', { name: 'INT0001' })
    const cell = action.closest('td')

    expect(action.className).toContain('min-h-11')
    expect(action.className).toContain('min-w-11')
    expect(action.className).toContain('px-2')
    expect(action.className).toContain('py-2')
    expect(cell?.className).not.toContain('px-2')
    expect(cell?.className).not.toContain('py-2')
  })

  it('shows pending version indicator', () => {
    const rows = [
      {
        ...makeRow(),
        hasPendingVersion: true,
        pendingVersionStatusColor: '#3b82f6',
        pendingVersionStatusId: 2,
        version: {
          ...makeRow().version,
          verifiable: false,
          versionNumber: 1,
        },
        area: null,
      },
    ]
    render(<RequirementsTable locale="sv" rows={rows} />)
    expect(screen.getByLabelText('hasPendingVersionReview')).toBeTruthy()
  })

  it('shows a blue pending draft indicator for archived rows', () => {
    const rows = [
      {
        id: 1,
        uniqueId: 'INT0003',
        isArchived: true,
        hasPendingVersion: true,
        pendingVersionStatusColor: '#3b82f6',
        pendingVersionStatusId: 1,
        version: {
          description: 'Arkiverad',
          categoryNameSv: null,
          categoryNameEn: null,
          typeNameSv: null,
          typeNameEn: null,
          qualityCharacteristicNameSv: null,
          qualityCharacteristicNameEn: null,
          priorityLevelId: null,
          priorityLevelNameEn: null,
          priorityLevelNameSv: null,
          priorityLevelColor: null,
          priorityLevelSortOrder: null,
          verifiable: false,
          versionNumber: 1,
          status: 4,
          statusNameSv: 'Arkiverad',
          statusNameEn: 'Archived',
          statusColor: '#6b7280',
        },
        area: null,
      },
    ]

    render(<RequirementsTable locale="sv" rows={rows} />)

    expect(screen.getAllByText('Arkiverad')).toHaveLength(2)
    expect(
      screen.getByLabelText('hasPendingVersionDraft').closest('tr')?.className,
    ).not.toContain('opacity-50')
    expect(screen.getByLabelText('hasPendingVersionDraft')).toHaveStyle({
      color: '#3b82f6',
    })
  })

  it('shows a yellow pending review indicator for archived rows', () => {
    const rows = [
      {
        id: 1,
        uniqueId: 'INT0004',
        isArchived: true,
        hasPendingVersion: true,
        pendingVersionStatusColor: '#eab308',
        pendingVersionStatusId: 2,
        version: {
          description: 'Arkiverad',
          categoryNameSv: null,
          categoryNameEn: null,
          typeNameSv: null,
          typeNameEn: null,
          qualityCharacteristicNameSv: null,
          qualityCharacteristicNameEn: null,
          priorityLevelId: null,
          priorityLevelNameEn: null,
          priorityLevelNameSv: null,
          priorityLevelColor: null,
          priorityLevelSortOrder: null,
          verifiable: false,
          versionNumber: 1,
          status: 4,
          statusNameSv: 'Arkiverad',
          statusNameEn: 'Archived',
          statusColor: '#6b7280',
        },
        area: null,
      },
    ]

    render(<RequirementsTable locale="sv" rows={rows} />)

    expect(screen.getAllByText('Arkiverad')).toHaveLength(2)
    expect(
      screen.getByLabelText('hasPendingVersionReview').closest('tr')?.className,
    ).not.toContain('opacity-50')
    expect(screen.getByLabelText('hasPendingVersionReview')).toHaveStyle({
      color: '#eab308',
    })
  })

  it('applies opacity for archived rows', () => {
    const rows = [
      {
        id: 1,
        uniqueId: 'INT0002',
        isArchived: true,
        version: {
          description: 'Arkiverad',
          categoryNameSv: null,
          categoryNameEn: null,
          typeNameSv: null,
          typeNameEn: null,
          qualityCharacteristicNameSv: null,
          qualityCharacteristicNameEn: null,
          priorityLevelId: null,
          priorityLevelNameEn: null,
          priorityLevelNameSv: null,
          priorityLevelColor: null,
          priorityLevelSortOrder: null,
          verifiable: false,
          versionNumber: 1,
          status: 4,
          statusNameSv: 'Arkiverad',
          statusNameEn: 'Archived',
          statusColor: '#6b7280',
        },
        area: null,
      },
    ]
    const { container } = render(<RequirementsTable locale="sv" rows={rows} />)
    const tr = container.querySelector('tbody tr')
    const firstCell = tr?.querySelector('td')

    expect(tr?.classList.contains('opacity-50')).toBe(false)
    expect(firstCell?.className).toContain('opacity-50')
  })

  it('exposes developer-mode metadata for named table surfaces', () => {
    const { container } = render(
      <RequirementsTable
        expandedId={1}
        filterValues={{ ...DEFAULT_FILTERS, uniqueIdSearch: 'INT0001' }}
        locale="sv"
        onColumnWidthsChange={() => {}}
        onFilterChange={() => {}}
        renderExpanded={() => <div>Expanded detail</div>}
        rows={[makeRow()]}
      />,
    )

    const scrollContainer = container.querySelector(
      '[data-requirements-scroll-container="true"]',
    )
    const columnsPill = document.querySelector(
      '[data-column-picker-trigger="true"]',
    )
    const header = container
      .querySelector('[data-requirement-header-label="uniqueId"]')
      ?.closest('th')
    const chip = container.querySelector(
      '[data-developer-mode-name="header chip"]',
    )
    const row = container.querySelector('tbody tr')
    const detailPane = container.querySelector(
      '[data-expanded-detail-cell="true"]',
    )
    const sortButton = container.querySelector(
      '[data-developer-mode-name="sort button"][data-developer-mode-value="requirement id"]',
    )
    const filterButton = container.querySelector(
      '[data-developer-mode-name="filter button"][data-developer-mode-value="requirement id"]',
    )

    expect(scrollContainer).toHaveAttribute(
      'data-developer-mode-name',
      'table space',
    )
    expect(columnsPill).toHaveAttribute(
      'data-developer-mode-name',
      'floating pill',
    )
    expect(columnsPill).toHaveAttribute('data-developer-mode-value', 'columns')
    expect(header).toHaveAttribute('data-developer-mode-name', 'column header')
    expect(header).toHaveAttribute(
      'data-developer-mode-value',
      'requirement id',
    )
    expect(sortButton).toBeInTheDocument()
    expect(filterButton).toBeInTheDocument()
    expect(chip).toHaveAttribute(
      'data-developer-mode-context',
      'requirements table > column header: requirement id',
    )
    expect(chip).toHaveAttribute('data-developer-mode-name', 'header chip')
    expect(row).toHaveAttribute('data-developer-mode-name', 'table row')
    expect(row).toHaveAttribute('data-developer-mode-value', 'INT0001')
    expect(detailPane).toHaveAttribute(
      'data-developer-mode-name',
      'inline detail pane',
    )
    expect(detailPane).toHaveAttribute('data-developer-mode-value', 'INT0001')
  })

  it('exposes developer-mode metadata for sortable, filterable, and resizable header controls', () => {
    const { container } = render(
      <RequirementsTable
        filterValues={{ ...DEFAULT_FILTERS, uniqueIdSearch: 'INT0001' }}
        locale="sv"
        onColumnWidthsChange={() => {}}
        onFilterChange={() => {}}
        rows={[makeRow()]}
      />,
    )

    const sortButton = container.querySelector(
      '[data-developer-mode-name="sort button"][data-developer-mode-value="requirement id"]',
    )
    const filterButton = container.querySelector(
      '[data-developer-mode-name="filter button"][data-developer-mode-value="requirement id"]',
    )
    const resizeHandle = container.querySelector(
      '[data-column-resize-handle="uniqueId"]',
    )

    expect(sortButton).toBeInTheDocument()
    expect(filterButton).toBeInTheDocument()
    expect(resizeHandle).toHaveAttribute(
      'data-developer-mode-name',
      'resize handle',
    )
    expect(resizeHandle).toHaveAttribute(
      'data-developer-mode-value',
      'requirement id',
    )
  })

  it('applies zebra striping on alternating rows', () => {
    const rows = [
      {
        id: 1,
        uniqueId: 'INT0001',
        isArchived: false,
        version: {
          description: 'A',
          categoryNameSv: null,
          categoryNameEn: null,
          typeNameSv: null,
          typeNameEn: null,
          qualityCharacteristicNameSv: null,
          qualityCharacteristicNameEn: null,
          priorityLevelId: null,
          priorityLevelNameEn: null,
          priorityLevelNameSv: null,
          priorityLevelColor: null,
          priorityLevelSortOrder: null,
          verifiable: false,
          versionNumber: 1,
          status: 1,
          statusNameSv: 'Utkast',
          statusNameEn: 'Draft',
          statusColor: '#3b82f6',
        },
        area: null,
      },
      {
        id: 2,
        uniqueId: 'INT0002',
        isArchived: false,
        version: {
          description: 'B',
          categoryNameSv: null,
          categoryNameEn: null,
          typeNameSv: null,
          typeNameEn: null,
          qualityCharacteristicNameSv: null,
          qualityCharacteristicNameEn: null,
          priorityLevelId: null,
          priorityLevelNameEn: null,
          priorityLevelNameSv: null,
          priorityLevelColor: null,
          priorityLevelSortOrder: null,
          verifiable: false,
          versionNumber: 1,
          status: 1,
          statusNameSv: 'Utkast',
          statusNameEn: 'Draft',
          statusColor: '#3b82f6',
        },
        area: null,
      },
    ]
    const { container } = render(<RequirementsTable locale="sv" rows={rows} />)
    const trs = container.querySelectorAll('tbody tr')

    expect(trs[0]?.className).not.toContain('bg-secondary-50/40')
    expect(trs[1]?.className).toContain('bg-secondary-50/40')
  })

  it('renders filter chips for all filterable columns when filter values are active', () => {
    const { container } = render(
      <RequirementsTable
        areas={[{ id: 10, name: 'Payments' }]}
        categories={[{ id: 20, nameEn: 'Business', nameSv: 'Verksamhet' }]}
        filterValues={{
          areaIds: [10],
          categoryIds: [20],
          descriptionSearch: 'search-term',
          qualityCharacteristicIds: [40],
          verifiable: ['true'],
          statuses: [3],
          typeIds: [30],
        }}
        getName={opt => opt.nameSv}
        getStatusName={opt => opt.nameSv}
        locale="sv"
        onFilterChange={vi.fn()}
        qualityCharacteristics={[
          {
            id: 40,
            nameEn: 'Reliability',
            nameSv: 'Tillforlitlighet',
            parentId: null,
          },
        ]}
        rows={[makeRow()]}
        statusOptions={[
          {
            color: '#22c55e',
            id: 3,
            nameEn: 'Published',
            nameSv: 'Publicerad',
          },
        ]}
        types={[{ id: 30, nameEn: 'Functional', nameSv: 'Funktionellt' }]}
        visibleColumns={[
          'uniqueId',
          'description',
          'area',
          'category',
          'type',
          'qualityCharacteristic',
          'status',
          'verifiable',
        ]}
      />,
    )

    const chips = document.querySelectorAll(
      '[data-developer-mode-name="header chip"]',
    )
    expect(chips.length).toBeGreaterThanOrEqual(6)

    const chipValues = Array.from(chips).map(chip =>
      chip.getAttribute('data-developer-mode-value'),
    )
    expect(chipValues).toContain('Payments')
    expect(chipValues).toContain('Verksamhet')
    expect(chipValues).toContain('Funktionellt')
    expect(chipValues).toContain('Tillforlitlighet')
    expect(chipValues).toContain('Publicerad')
    expect(chipValues).toContain('search-term')
    const removeIcons = container.querySelectorAll(
      '[data-developer-mode-name="header chip"] button svg',
    )
    const removeButtons = container.querySelectorAll(
      '[data-developer-mode-name="header chip"] button',
    )
    expect(removeIcons.length).toBeGreaterThan(0)
    expect(removeButtons.length).toBe(removeIcons.length)
    for (const icon of removeIcons) {
      expect(icon).toHaveAttribute('aria-hidden', 'true')
    }
    for (const button of removeButtons) {
      expect(button).not.toHaveClass('min-h-6', 'min-w-6')
    }
  })

  it('does not emit React key warnings when rendering headers and filter chips', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      render(
        <RequirementsTable
          areas={[{ id: 10, name: 'Payments' }]}
          categories={[{ id: 20, nameEn: 'Business', nameSv: 'Verksamhet' }]}
          filterValues={{
            areaIds: [10],
            categoryIds: [20],
            descriptionSearch: 'search-term',
            qualityCharacteristicIds: [40],
            verifiable: ['true'],
            statuses: [3],
            typeIds: [30],
          }}
          getName={opt => opt.nameSv}
          getStatusName={opt => opt.nameSv}
          locale="sv"
          onFilterChange={vi.fn()}
          qualityCharacteristics={[
            {
              id: 40,
              nameEn: 'Reliability',
              nameSv: 'Tillforlitlighet',
              parentId: null,
            },
          ]}
          rows={[makeRow()]}
          statusOptions={[
            {
              color: '#22c55e',
              id: 3,
              nameEn: 'Published',
              nameSv: 'Publicerad',
            },
          ]}
          types={[{ id: 30, nameEn: 'Functional', nameSv: 'Funktionellt' }]}
          visibleColumns={[
            'uniqueId',
            'description',
            'area',
            'category',
            'type',
            'qualityCharacteristic',
            'status',
            'verifiable',
          ]}
        />,
      )

      const keyWarnings = consoleError.mock.calls.filter(
        ([message]) =>
          typeof message === 'string' &&
          message.includes(
            'Each child in a list should have a unique "key" prop.',
          ),
      )

      expect(keyWarnings).toHaveLength(0)
    } finally {
      consoleError.mockRestore()
    }
  })

  it('only renders requirement package filter pills when filtering is available', () => {
    const requirementPackages = [{ id: 1, name: 'Mobil användning' }]
    const onFilterChange = vi.fn()

    const { rerender } = render(
      <RequirementsTable
        getName={opt => opt.nameSv}
        locale="sv"
        requirementPackages={requirementPackages}
        rows={[makeRow()]}
      />,
    )

    expect(
      screen.queryByRole('button', { name: 'Mobil användning' }),
    ).not.toBeInTheDocument()

    rerender(
      <RequirementsTable
        filterValues={{ requirementPackageIds: [1] }}
        locale="sv"
        onFilterChange={onFilterChange}
        requirementPackages={requirementPackages}
        rows={[makeRow()]}
      />,
    )

    const requirementPackageFilter = screen.getByRole('button', {
      name: 'Mobil användning',
    })
    expect(onFilterChange).not.toHaveBeenCalled()
    expect(requirementPackageFilter).toHaveAttribute(
      'data-requirement-package',
      '1',
    )
    expect(requirementPackageFilter).toHaveAttribute('aria-pressed', 'true')
    expect(requirementPackageFilter).toHaveClass('h-6', 'text-[10px]')
    expect(requirementPackageFilter).not.toHaveClass('min-h-11', 'min-w-11')
    const clearPackageFilters = screen.getByRole('button', {
      name: 'clearFilters',
    })
    expect(clearPackageFilters).toHaveClass('h-6', 'w-6')
    expect(clearPackageFilters).not.toHaveClass('min-h-11', 'min-w-11')

    fireEvent.click(requirementPackageFilter)
    expect(onFilterChange).toHaveBeenCalledWith({
      requirementPackageIds: undefined,
    })

    rerender(
      <RequirementsTable
        filterValues={{}}
        locale="sv"
        onFilterChange={onFilterChange}
        requirementPackages={requirementPackages}
        rows={[makeRow()]}
      />,
    )

    expect(
      screen.getByRole('button', { name: 'Mobil användning' }),
    ).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(screen.getByRole('button', { name: 'Mobil användning' }))
    expect(onFilterChange).toHaveBeenCalledWith({
      requirementPackageIds: [1],
    })
  })

  it('uses requirement package purpose and scope as filter pill tooltips', () => {
    vi.useFakeTimers()
    try {
      const requirementPackages = [
        {
          id: 1,
          name: 'Mobil användning',
          purposeAndScope: 'Krav för mobil användning.',
        },
        {
          id: 2,
          name: 'Tom avgränsning',
          purposeAndScope: '   ',
        },
      ]

      render(
        <RequirementsTable
          filterValues={{}}
          locale="sv"
          onFilterChange={vi.fn()}
          requirementPackages={requirementPackages}
          rows={[makeRow()]}
        />,
      )

      fireEvent.mouseEnter(
        screen.getByRole('button', { name: 'Mobil användning' }),
      )
      act(() => vi.advanceTimersByTime(1000))

      expect(screen.getByRole('tooltip')).toHaveTextContent(
        'Krav för mobil användning.',
      )

      fireEvent.mouseLeave(
        screen.getByRole('button', { name: 'Mobil användning' }),
      )
      fireEvent.mouseEnter(
        screen.getByRole('button', { name: 'Tom avgränsning' }),
      )

      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('renders the compact package filter only after a successful catalog load', () => {
    const { rerender } = render(
      <ControlledCompactPackageFilter catalogStatus="loading" packages={[]} />,
    )

    expect(
      screen.queryByRole('group', { name: 'requirementPackages' }),
    ).not.toBeInTheDocument()

    rerender(
      <ControlledCompactPackageFilter catalogStatus="failed" packages={[]} />,
    )
    expect(
      screen.queryByRole('group', { name: 'requirementPackages' }),
    ).not.toBeInTheDocument()

    rerender(
      <ControlledCompactPackageFilter catalogStatus="loaded" packages={[]} />,
    )

    const band = screen.getByRole('group', { name: 'requirementPackages' })
    expect(
      within(band).getByText('noRequirementPackagesAvailableToFilter'),
    ).toBeInTheDocument()
    const trigger = within(band).getByRole('button', {
      name: 'requirementPackageFilterButton',
    })
    expect(trigger).toBeDisabled()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveAttribute('aria-controls')
  })

  it('sorts compact selected and available packages by locale with an id tie-breaker', () => {
    render(
      <ControlledCompactPackageFilter
        initialSelectedIds={[4, 3, 2]}
        packages={[
          { id: 4, name: 'Övrigt' },
          { id: 3, name: 'alfa' },
          { id: 2, name: 'Alfa' },
          { id: 1, name: 'Beta' },
        ]}
      />,
    )

    const band = screen.getByRole('group', { name: 'requirementPackages' })
    const selectedIds = within(band)
      .getAllByRole('button', {
        name: 'removeRequirementPackageFromFilter',
      })
      .map(button => button.getAttribute('data-requirement-package'))
    expect(selectedIds).toEqual(['2', '3', '4'])
    expect(
      within(band).getAllByRole('button', {
        name: 'removeRequirementPackageFromFilter',
      })[0],
    ).toHaveClass(
      'bg-primary-100',
      'text-primary-700',
      'dark:bg-primary-900/40',
      'dark:text-primary-300',
    )
    expect(
      within(band).getByRole('button', {
        name: 'clearRequirementPackageFilter',
      }),
    ).toHaveClass('h-6', 'w-6')

    const trigger = within(band).getByRole('button', {
      name: 'requirementPackageFilterButtonActive',
    })
    const visibleTitle = within(band).getByText('requirementPackages', {
      selector: 'span',
    })
    expect(visibleTitle).toHaveClass('text-sm', 'font-medium')
    expect(visibleTitle.parentElement).toHaveClass(
      'flex',
      'items-center',
      'gap-1',
    )
    expect(visibleTitle.nextElementSibling).toContainElement(trigger)
    const splitLayout = visibleTitle.closest(
      '[data-requirement-package-filter-layout="split"]',
    )
    expect(splitLayout).toHaveClass(
      'grid',
      'grid-cols-[auto_1px_minmax(0,1fr)]',
      'items-center',
    )
    expect(visibleTitle.parentElement?.nextElementSibling).toHaveAttribute(
      'data-requirement-package-filter-divider',
      'true',
    )
    const selections = band.querySelector(
      '[data-requirement-package-filter-selections="true"]',
    )
    expect(selections).toContainElement(
      within(band).getAllByRole('button', {
        name: 'removeRequirementPackageFromFilter',
      })[0] as HTMLElement,
    )
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(within(trigger).getByText('3')).toHaveAttribute(
      'data-filter-count-badge',
      'true',
    )

    fireEvent.click(trigger)

    const chooser = screen.getByRole('group', {
      name: 'requirementPackageChooser',
    })
    expect(
      within(chooser)
        .getAllByRole('button', {
          name: 'addRequirementPackageToFilter',
        })
        .map(button => button.textContent),
    ).toEqual(['Beta'])
  })

  it('keeps the chooser open and recovers focus across consecutive package changes', () => {
    render(<ControlledCompactPackageFilter />)

    const band = screen.getByRole('group', { name: 'requirementPackages' })
    const trigger = within(band).getByRole('button', {
      name: 'requirementPackageFilterButton',
    })
    fireEvent.click(trigger)

    let chooser = screen.getByRole('group', {
      name: 'requirementPackageChooser',
    })
    let availableButtons = within(chooser).getAllByRole('button', {
      name: 'addRequirementPackageToFilter',
    })
    fireEvent.click(availableButtons[1] as HTMLButtonElement)

    chooser = screen.getByRole('group', {
      name: 'requirementPackageChooser',
    })
    availableButtons = within(chooser).getAllByRole('button', {
      name: 'addRequirementPackageToFilter',
    })
    expect(availableButtons[1]).toHaveFocus()
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('package-filter-state')).toHaveTextContent('[2]')
    expect(screen.getByRole('status')).toHaveTextContent(
      'requirementPackageAdded',
    )

    fireEvent.click(availableButtons[1] as HTMLButtonElement)
    chooser = screen.getByRole('group', {
      name: 'requirementPackageChooser',
    })
    availableButtons = within(chooser).getAllByRole('button', {
      name: 'addRequirementPackageToFilter',
    })
    expect(availableButtons[0]).toHaveFocus()

    fireEvent.click(availableButtons[0] as HTMLButtonElement)
    expect(trigger).toHaveFocus()
    expect(
      within(
        screen.getByRole('group', { name: 'requirementPackageChooser' }),
      ).getByText('allRequirementPackagesSelected'),
    ).toBeInTheDocument()

    const selectedBeta = within(band)
      .getAllByRole('button', {
        name: 'removeRequirementPackageFromFilter',
      })
      .find(button => button.getAttribute('data-requirement-package') === '2')
    fireEvent.click(selectedBeta as HTMLButtonElement)

    const selectedGamma = within(band)
      .getAllByRole('button', {
        name: 'removeRequirementPackageFromFilter',
      })
      .find(button => button.getAttribute('data-requirement-package') === '3')
    expect(selectedGamma).toHaveFocus()
    expect(screen.getByRole('status')).toHaveTextContent(
      'requirementPackageRemoved',
    )

    fireEvent.click(
      within(band).getByRole('button', {
        name: 'clearRequirementPackageFilter',
      }),
    )
    expect(trigger).toHaveFocus()
    expect(screen.getByTestId('package-filter-state')).toHaveTextContent('[]')
    expect(screen.getByRole('status')).toHaveTextContent(
      'requirementPackageFilterCleared',
    )
  })

  it('preserves selected package ids that are absent from the catalog', () => {
    render(
      <ControlledCompactPackageFilter
        initialSelectedIds={[99, 1]}
        packages={[
          { id: 1, name: 'Alfa' },
          { id: 2, name: 'Beta' },
        ]}
      />,
    )

    const band = screen.getByRole('group', { name: 'requirementPackages' })
    fireEvent.click(
      within(band).getByRole('button', {
        name: 'requirementPackageFilterButtonActive',
      }),
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: 'addRequirementPackageToFilter',
      }),
    )
    expect(screen.getByTestId('package-filter-state')).toHaveTextContent(
      '[99,1,2]',
    )

    fireEvent.click(
      within(band).getAllByRole('button', {
        name: 'removeRequirementPackageFromFilter',
      })[0] as HTMLButtonElement,
    )
    expect(screen.getByTestId('package-filter-state')).toHaveTextContent(
      '[99,2]',
    )
  })

  it('recovers removal focus to the previous selection and finally the trigger', () => {
    render(<ControlledCompactPackageFilter initialSelectedIds={[1, 2, 3]} />)

    const band = screen.getByRole('group', { name: 'requirementPackages' })
    const selectedButton = (id: string) =>
      within(band)
        .getAllByRole('button', {
          name: 'removeRequirementPackageFromFilter',
        })
        .find(button => button.getAttribute('data-requirement-package') === id)
    const trigger = within(band).getByRole('button', {
      name: 'requirementPackageFilterButtonActive',
    })

    fireEvent.click(selectedButton('3') as HTMLButtonElement)
    expect(selectedButton('2')).toHaveFocus()

    fireEvent.click(selectedButton('2') as HTMLButtonElement)
    expect(selectedButton('1')).toHaveFocus()
    expect(
      within(band).queryByRole('button', {
        name: 'clearRequirementPackageFilter',
      }),
    ).not.toBeInTheDocument()

    fireEvent.click(selectedButton('1') as HTMLButtonElement)
    expect(trigger).toHaveFocus()
  })

  it('supports transient hover, pinned disclosure, escape, outside click, and focus exit', async () => {
    render(<ControlledCompactPackageFilter />)

    const band = screen.getByRole('group', { name: 'requirementPackages' })
    const trigger = within(band).getByRole('button', {
      name: 'requirementPackageFilterButton',
    })

    fireEvent.pointerEnter(band, { pointerType: 'mouse' })
    expect(
      screen.getByRole('group', { name: 'requirementPackageChooser' }),
    ).toBeInTheDocument()
    fireEvent.pointerLeave(band, { pointerType: 'mouse' })
    await waitFor(() =>
      expect(
        screen.queryByRole('group', { name: 'requirementPackageChooser' }),
      ).not.toBeInTheDocument(),
    )

    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(trigger).toHaveFocus()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(trigger)
    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'outside-filter' }),
    )
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(trigger)
    fireEvent.focus(screen.getByRole('button', { name: 'outside-filter' }))
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('delays package tooltips on hover, opens them on focus, and exposes curated markers', () => {
    vi.useFakeTimers()
    try {
      render(
        <ControlledCompactPackageFilter
          initialSelectedIds={[1]}
          packages={[
            { id: 1, name: 'Name only' },
            {
              id: 2,
              name: 'Package with purpose',
              purposeAndScope: 'Purpose and scope.',
            },
          ]}
        />,
      )

      const band = screen.getByRole('group', { name: 'requirementPackages' })
      expect(band).toHaveAttribute(
        'data-developer-mode-name',
        'requirements package filter',
      )
      const selected = within(band).getByRole('button', {
        name: 'removeRequirementPackageFromFilter',
      })
      expect(selected).toHaveAttribute('aria-pressed', 'true')
      fireEvent.mouseEnter(selected)
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
      act(() => vi.advanceTimersByTime(999))
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
      act(() => vi.advanceTimersByTime(1))
      expect(screen.getByRole('tooltip')).toHaveTextContent('Name only')
      fireEvent.mouseLeave(selected)

      const trigger = within(band).getByRole('button', {
        name: 'requirementPackageFilterButtonActive',
      })
      expect(trigger).toHaveAttribute(
        'data-developer-mode-name',
        'filter button',
      )
      expect(trigger).toHaveAttribute(
        'data-developer-mode-value',
        'requirement package',
      )
      fireEvent.click(trigger)

      const chooser = screen.getByRole('group', {
        name: 'requirementPackageChooser',
      })
      expect(chooser).toHaveAttribute(
        'data-developer-mode-name',
        'requirements package chooser',
      )
      const available = within(chooser).getByRole('button', {
        name: 'addRequirementPackageToFilter',
      })
      expect(available).toHaveAttribute('aria-pressed', 'false')
      const originalMatches = available.matches.bind(available)
      vi.spyOn(available, 'matches').mockImplementation(
        selector => selector === ':focus-visible' || originalMatches(selector),
      )
      act(() => available.focus())
      expect(screen.getByRole('tooltip')).toHaveTextContent(
        'Package with purpose Purpose and scope.',
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('clamps the floating chooser to a narrow viewport without moving the table', () => {
    setViewportWidth(320)
    setViewportHeight(300)
    render(<ControlledCompactPackageFilter />)

    const band = screen.getByRole('group', { name: 'requirementPackages' })
    let bandBottom = 100
    vi.spyOn(band, 'getBoundingClientRect').mockImplementation(() => ({
      bottom: bandBottom,
      height: bandBottom - 40,
      left: -20,
      right: 380,
      top: 40,
      width: 400,
      x: -20,
      y: 40,
      toJSON: () => ({}),
    }))
    fireEvent.click(
      within(band).getByRole('button', {
        name: 'requirementPackageFilterButton',
      }),
    )

    const chooser = screen.getByRole('group', {
      name: 'requirementPackageChooser',
    })
    expect(chooser).toHaveStyle({
      left: '8px',
      maxHeight: '192px',
      top: '100px',
      width: '304px',
    })
    expect(chooser).toHaveClass('fixed')

    bandBottom = 148
    fireEvent.click(
      within(chooser).getAllByRole('button', {
        name: 'addRequirementPackageToFilter',
      })[0] as HTMLButtonElement,
    )
    act(() => {
      for (const callback of resizeObserverCallbacks) {
        callback([], {} as ResizeObserver)
      }
    })
    expect(chooser).toHaveStyle({
      maxHeight: '144px',
      top: '148px',
    })
  })

  it('renders the infinite-scroll sentinel when hasMore and onLoadMore are set', () => {
    let observedElement: Element | null = null
    let observerCallback: IntersectionObserverCallback | null = null
    const OriginalIntersectionObserver = globalThis.IntersectionObserver

    vi.stubGlobal(
      'IntersectionObserver',
      class MockIntersectionObserver {
        constructor(callback: IntersectionObserverCallback) {
          observerCallback = callback
        }

        disconnect() {}

        observe(target: Element) {
          observedElement = target
        }

        unobserve() {}
      },
    )

    try {
      const onLoadMore = vi.fn()
      render(
        <RequirementsTable
          hasMore
          locale="sv"
          onLoadMore={onLoadMore}
          rows={[makeRow()]}
        />,
      )

      expect(observedElement).toBeTruthy()

      act(() => {
        observerCallback?.(
          [{ isIntersecting: true } as IntersectionObserverEntry],
          {} as IntersectionObserver,
        )
      })
      expect(onLoadMore).toHaveBeenCalledTimes(1)
    } finally {
      globalThis.IntersectionObserver = OriginalIntersectionObserver
    }
  })

  describe('norm references column', () => {
    const normRefColumns = [
      ...DEFAULT_VISIBLE_REQUIREMENT_COLUMNS,
      'normReferences' as const,
    ]

    it('renders norm reference IDs in cell when column is visible', () => {
      const row = makeRow({
        normReferenceIds: ['SFS-2018-218', 'ISO-27001-2022'],
      })
      render(
        <RequirementsTable
          locale="sv"
          rows={[row]}
          visibleColumns={normRefColumns}
        />,
      )
      expect(
        screen.getByText('SFS-2018-218, ISO-27001-2022'),
      ).toBeInTheDocument()
    })

    it('renders dash when no norm references', () => {
      const row = makeRow({ normReferenceIds: [] })
      const { container } = render(
        <RequirementsTable
          locale="sv"
          rows={[row]}
          visibleColumns={normRefColumns}
        />,
      )
      const cells = container.querySelectorAll('td')
      // normReferences is the last column in normRefColumns, so select the last td
      const normRefCell = cells[cells.length - 1]
      expect(normRefCell?.textContent).toBe('—')
    })

    it('calls onVisibleColumnsChange when toggling normReferences column', async () => {
      const onVisibleColumnsChange = vi.fn()
      const { container } = render(
        <RequirementsTable
          locale="sv"
          onVisibleColumnsChange={onVisibleColumnsChange}
          rows={[makeRow()]}
          visibleColumns={DEFAULT_VISIBLE_REQUIREMENT_COLUMNS}
        />,
      )
      const trigger = getColumnPickerTrigger(container)
      expect(trigger).toBeTruthy()
      await act(async () => {
        fireEvent.click(trigger as HTMLButtonElement)
      })
      const normRefOption =
        container.querySelector(
          '[data-column-picker-option="normReferences"]',
        ) ??
        document.querySelector('[data-column-picker-option="normReferences"]')
      expect(normRefOption).toBeTruthy()
      await act(async () => {
        fireEvent.click(normRefOption as Element)
      })
      expect(onVisibleColumnsChange).toHaveBeenCalled()
    })
  })

  describe('requirement package column', () => {
    const requirementPackageColumns = [
      ...DEFAULT_VISIBLE_REQUIREMENT_COLUMNS,
      'requirementPackage' as const,
    ]

    it('renders requirement package names', () => {
      const row = makeRow({
        requirementPackages: [
          { id: 1, name: 'Mobil anvandning' },
          { id: 2, name: 'Dataplattform' },
        ],
      })
      const { container } = render(
        <RequirementsTable
          locale="sv"
          rows={[row]}
          visibleColumns={requirementPackageColumns}
        />,
      )

      const cells = container.querySelectorAll('td')
      const requirementPackageCell = cells[cells.length - 1]
      expect(requirementPackageCell?.textContent).toContain('Mobil anvandning')
      expect(requirementPackageCell?.textContent).toContain('Dataplattform')
    })

    it('renders dash when no requirement packages are linked', () => {
      const { container } = render(
        <RequirementsTable
          locale="sv"
          rows={[makeRow({ requirementPackages: [] })]}
          visibleColumns={requirementPackageColumns}
        />,
      )

      const cells = container.querySelectorAll('td')
      const requirementPackageCell = cells[cells.length - 1]
      expect(requirementPackageCell?.textContent).toBe('—')
    })
  })
})

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RequirementsTable from '@/components/RequirementsTable'
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
const DEFAULT_VIEWPORT_WIDTH = 1024

let resizeObserverCallback: ResizeObserverCallback | null = null

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

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href, ...props }: Record<string, unknown>) => (
    <a href={href as string} {...props}>
      {children as React.ReactNode}
    </a>
  ),
  usePathname: () => '/kravkatalog',
  useRouter: () => ({ push: mockPush }),
}))

describe('RequirementsTable', () => {
  beforeEach(() => {
    mockPush.mockReset()
    resizeObserverObserve.mockReset()
    resizeObserverDisconnect.mockReset()
    resizeObserverCallback = null
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
  })

  afterEach(() => {
    setViewportWidth(DEFAULT_VIEWPORT_WIDTH)
  })

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
        requiresTesting: true,
        status: 3,
        statusColor: '#22c55e',
        statusNameEn: 'Published',
        statusNameSv: 'Publicerad',
        typeCategoryNameEn: null,
        typeCategoryNameSv: null,
        typeNameEn: 'Functional',
        typeNameSv: 'Funktionellt',
        versionNumber: 2,
      },
      ...overrides,
    }
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

  function getColumnWidths(container: HTMLElement) {
    return Array.from(container.querySelectorAll('col')).map(
      col => (col as HTMLTableColElement).style.width,
    )
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

  function getFloatingActionRailContainer(container: HTMLElement) {
    const rail =
      (container.querySelector(
        '[data-floating-action-rail="true"]',
      ) as HTMLDivElement | null) ??
      (document.querySelector(
        '[data-floating-action-rail="true"]',
      ) as HTMLDivElement | null)

    return rail?.parentElement as HTMLDivElement | null
  }

  function setHeaderMetrics(container: HTMLElement, widths: number[]) {
    const headers = Array.from(
      container.querySelectorAll('thead th'),
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

  it('toggles sorting from the header button and updates aria-sort', () => {
    const onSortChange = vi.fn()

    render(
      <RequirementsTable
        locale="sv"
        onSortChange={onSortChange}
        rows={[makeRow()]}
        sortState={DEFAULT_REQUIREMENT_SORT}
      />,
    )

    const headerButton = screen.getByRole('button', { name: 'uniqueId' })
    const header = headerButton.closest('th')

    expect(header).toHaveAttribute('aria-sort', 'ascending')
    fireEvent.click(headerButton)
    expect(onSortChange).toHaveBeenCalledWith({
      by: 'uniqueId',
      direction: 'desc',
    })
  })

  it('keeps the sort icon fixed while the header label remains truncation-friendly', () => {
    render(<RequirementsTable locale="sv" rows={[makeRow()]} />)

    const headerButton = screen.getByRole('button', { name: 'uniqueId' })
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

    expect(screen.getByRole('checkbox', { name: 'uniqueId' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'description' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'area' })).not.toBeDisabled()
  })

  it('renders minimum hit areas in the columns popover', () => {
    render(<RequirementsTable locale="sv" rows={[makeRow()]} />)

    fireEvent.click(screen.getByRole('button', { name: 'columns' }))

    const resetButton = screen.getByRole('button', { name: 'resetToDefault' })
    const statusLabel = screen
      .getByRole('checkbox', { name: 'status' })
      .closest('label')

    expect(resetButton.className).toContain('min-h-[44px]')
    expect(resetButton.className).toContain('min-w-[44px]')
    expect(statusLabel).toBeTruthy()
    expect(statusLabel?.className).toContain('min-h-[44px]')
    expect(statusLabel?.className).toContain('min-w-[44px]')
    expect(statusLabel?.className).toContain('w-full')
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

  it('keeps the floating action rail within the viewport on narrow screens', () => {
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

    expect(getFloatingActionRailContainer(container)?.style.left).toBe('268px')
  })

  it('shows the floating pill badge in the default column state', () => {
    const { container } = render(
      <RequirementsTable locale="sv" rows={[makeRow()]} />,
    )

    expect(getColumnPickerBadge(container)?.textContent).toBe('6/9')
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
            href: '/kravkatalog/ny',
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
    ).toHaveAttribute('href', '/kravkatalog/ny')
    expect(
      screen.getByRole('link', { name: 'newRequirement' }).dataset
        .floatingActionVariant,
    ).toBe('primary')
    expect(
      screen.getByRole('button', { name: 'columns' }).dataset
        .floatingActionVariant,
    ).toBe('default')
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

  it('renders floating action menus as semantic lists with native links and touch-target classes', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'manage' }))

    await waitFor(() => {
      const menu = document.querySelector(
        '[data-floating-action-menu="manage"]',
      ) as HTMLDivElement | null
      const list = menu?.querySelector('ul')
      const item = list?.querySelector('li')
      const link = screen.getByRole('link', { name: /Admin/ })

      expect(menu).toBeTruthy()
      expect(menu?.getAttribute('role')).toBeNull()
      expect(list).toBeTruthy()
      expect(item).toBeTruthy()
      expect(link.getAttribute('role')).toBeNull()
      expect(link.className).toContain('min-h-[44px]')
      expect(link.className).toContain('min-w-[44px]')
      expect(link.className).toContain('focus-visible:ring-2')
    })
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

  it('renders filter buttons with 44px touch targets', () => {
    render(
      <RequirementsTable
        filterValues={DEFAULT_FILTERS}
        locale="sv"
        onFilterChange={vi.fn()}
        rows={[makeRow()]}
      />,
    )

    for (const button of screen.getAllByRole('button', { name: 'filterBy' })) {
      expect(button.className).toContain('min-h-[44px]')
      expect(button.className).toContain('min-w-[44px]')
    }
  })

  it('applies 44px touch targets to standard filter popover actions', () => {
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

    expect(clearButton?.className).toContain('min-h-[44px]')
    expect(optionRow?.className).toContain('min-h-[44px]')
  })

  it('applies 44px touch targets to grouped filter popover actions', () => {
    render(
      <RequirementsTable
        filterValues={{ ...DEFAULT_FILTERS, typeCategoryIds: [2] }}
        locale="sv"
        onFilterChange={vi.fn()}
        rows={[makeRow()]}
        typeCategories={[
          { id: 1, nameEn: 'Parent', nameSv: 'Foralder', parentId: null },
          { id: 2, nameEn: 'Child', nameSv: 'Barn', parentId: 1 },
        ]}
        visibleColumns={[
          ...DEFAULT_VISIBLE_REQUIREMENT_COLUMNS,
          'typeCategory',
        ]}
      />,
    )

    const typeCategoryFilterButton = getHeaderFilterButton('typeCategory')
    expect(typeCategoryFilterButton).toBeTruthy()
    if (!typeCategoryFilterButton) {
      throw new Error(
        'Expected the type category filter button to be rendered.',
      )
    }

    setElementRect(typeCategoryFilterButton, {
      bottom: 40,
      left: 48,
      right: 92,
    })
    fireEvent.click(typeCategoryFilterButton)

    const popover = getOpenPopover()
    const clearButton = popover?.querySelector('button')
    const optionRow = popover?.querySelector('label')

    expect(clearButton?.className).toContain('min-h-[44px]')
    expect(optionRow?.className).toContain('min-h-[44px]')
  })

  it('applies the minimum header touch target to the sortable button itself', () => {
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
    expect(headerControl?.className).not.toContain('min-h-[44px]')
    expect(sortableButton?.className).toContain('min-h-[44px]')
    expect(sortableButton?.className).toContain('min-w-[44px]')
  })

  it('anchors active filter count badges to the filter icon instead of the full button shell', () => {
    const { container } = render(
      <RequirementsTable
        filterValues={{ statuses: [3], typeCategoryIds: [2] }}
        locale="sv"
        onFilterChange={vi.fn()}
        rows={[makeRow()]}
        typeCategories={[
          { id: 1, nameEn: 'Parent', nameSv: 'Foralder', parentId: null },
          { id: 2, nameEn: 'Child', nameSv: 'Barn', parentId: 1 },
        ]}
        visibleColumns={[
          ...DEFAULT_VISIBLE_REQUIREMENT_COLUMNS,
          'typeCategory',
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
        typeCategories={[
          { id: 1, nameEn: 'Parent', nameSv: 'Foralder', parentId: null },
          { id: 2, nameEn: 'Child', nameSv: 'Barn', parentId: 1 },
        ]}
        visibleColumns={[
          ...DEFAULT_VISIBLE_REQUIREMENT_COLUMNS,
          'typeCategory',
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

    const typeCategoryFilterButton = getHeaderFilterButton('typeCategory')
    expect(typeCategoryFilterButton).toBeTruthy()
    if (!typeCategoryFilterButton) {
      throw new Error(
        'Expected the type category filter button to be rendered.',
      )
    }

    setElementRect(typeCategoryFilterButton, {
      bottom: 40,
      left: 180,
      right: 224,
    })
    fireEvent.click(typeCategoryFilterButton)

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
      'min-w-[44px]',
    )
    expect(getResizeHandle(container, 'description')?.className).toContain(
      'min-h-[44px]',
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

    fireEvent.pointerDown(handle as Element, { clientX: 100 })
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

    fireEvent.pointerDown(handle as Element, { clientX: 100 })
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

  it('ignores pointer events from other pointers while a resize is active', async () => {
    const { container } = render(<ControlledResizableTable />)

    syncResizeHandleMetrics(container)

    const handle = getResizeHandle(container, 'description')

    expect(handle).toBeTruthy()
    expect(getResizeHandleLeft(container, 'description')).toBe('510px')

    fireEvent.pointerDown(handle as Element, { clientX: 100, pointerId: 1 })
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

    fireEvent.pointerDown(descriptionHandle as Element, { clientX: 100 })
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
    expect(bottomSegment?.className).toContain('min-w-[44px]')
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

    fireEvent.pointerDown(bottomSegment as Element, { clientX: 100 })
    fireEvent.pointerMove(window, { clientX: 132 })
    fireEvent.pointerUp(window, { clientX: 132 })

    expect(screen.getByTestId('column-width-state').textContent).toBe(
      '{"description":392}',
    )
  })

  it('keeps clipped resize segments below 44px from expanding their hit area', () => {
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
    expect(bottomSegment?.className).toContain('min-w-[44px]')
    expect(bottomSegment?.className).toContain('min-h-0')
    expect(bottomSegment?.className).not.toContain('min-h-[44px]')
    expect(bottomSegment).not.toHaveAttribute('data-column-resize-handle')

    fireEvent.pointerDown(bottomSegment as Element, {
      clientX: 100,
      pointerId: 1,
    })
    fireEvent.pointerMove(window, { clientX: 132, pointerId: 1 })
    fireEvent.pointerUp(window, { clientX: 132, pointerId: 1 })

    expect(screen.getByTestId('column-width-state').textContent).toBe(
      '{"description":392}',
    )
  })

  it('restores divider positions on pointer cancel', async () => {
    const { container } = render(<ControlledResizableTable />)

    syncResizeHandleMetrics(container)

    const descriptionHandle = getResizeHandle(container, 'description')

    expect(descriptionHandle).toBeTruthy()
    expect(getResizeHandleLeft(container, 'description')).toBe('510px')
    expect(getResizeHandleLeft(container, 'area')).toBe('646px')

    fireEvent.pointerDown(descriptionHandle as Element, { clientX: 100 })
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

    fireEvent.pointerDown(handle as Element, { clientX: 100 })
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

    fireEvent.pointerDown(handle as Element, { clientX: 100 })
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

    fireEvent.pointerDown(handle as Element, { clientX: 100 })
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

    fireEvent.pointerDown(handle as Element, { clientX: 100 })
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
          'typeCategory',
          'requiresTesting',
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
      ['/kravkatalog/1'],
      ['/kravkatalog/1'],
    ])
  })

  it('applies the minimum touch target sizing to row action buttons', () => {
    render(<RequirementsTable locale="sv" rows={[makeRow()]} />)

    const action = screen.getByRole('button', { name: 'INT0001' })
    const cell = action.closest('td')

    expect(action.className).toContain('min-h-[44px]')
    expect(action.className).toContain('min-w-[44px]')
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
          requiresTesting: false,
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
          typeCategoryNameSv: null,
          typeCategoryNameEn: null,
          requiresTesting: false,
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
          typeCategoryNameSv: null,
          typeCategoryNameEn: null,
          requiresTesting: false,
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
          typeCategoryNameSv: null,
          typeCategoryNameEn: null,
          requiresTesting: false,
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
          typeCategoryNameSv: null,
          typeCategoryNameEn: null,
          requiresTesting: false,
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
          typeCategoryNameSv: null,
          typeCategoryNameEn: null,
          requiresTesting: false,
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
})

import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RequirementsTable from '@/components/RequirementsTable'
import {
  DEFAULT_REQUIREMENT_SORT,
  DEFAULT_VISIBLE_REQUIREMENT_COLUMNS,
} from '@/lib/requirements/list-view'

const mockPush = vi.fn()
const resizeObserverObserve = vi.fn()
const resizeObserverDisconnect = vi.fn()
const DEFAULT_COLUMN_WIDTHS = [150, 360, 136, 152, 148, 176]

let resizeObserverCallback: ResizeObserverCallback | null = null

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

  it('renders empty state when no rows', () => {
    render(<RequirementsTable locale="sv" rows={[]} />)
    expect(screen.getByText('noResults')).toBeTruthy()
    expect(screen.getByText('noResults').closest('td')).toHaveAttribute(
      'colspan',
      String(DEFAULT_VISIBLE_REQUIREMENT_COLUMNS.length),
    )
  })

  it('renders loading state when loading is true', () => {
    vi.useFakeTimers()
    render(<RequirementsTable loading locale="sv" rows={[]} />)
    expect(screen.queryByText('loadingRequirements')).toBeNull()
    act(() => vi.advanceTimersByTime(1000))
    expect(screen.getByText('loadingRequirements')).toBeTruthy()
    expect(screen.queryByText('noResults')).toBeTruthy()
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

  it('shows locked columns as disabled in the columns popover', () => {
    render(<RequirementsTable locale="sv" rows={[makeRow()]} />)

    fireEvent.click(screen.getByRole('button', { name: 'columns' }))

    expect(screen.getByRole('checkbox', { name: 'uniqueId' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'description' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'area' })).not.toBeDisabled()
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
    expect(shell?.className).toContain('w-10')
    expect(shell?.className).toContain('rounded-full')
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

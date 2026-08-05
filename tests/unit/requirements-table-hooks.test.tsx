import { act, renderHook } from '@testing-library/react'
import type { RefObject } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  areColumnWidthsEqual,
  areExpandedDetailBoundsEqual,
  areFloatingActionRailPositionsEqual,
} from '@/components/_requirements-table/shared'
import { useColumnState } from '@/components/_requirements-table/useColumnState'
import { useFloatingRailPosition } from '@/components/_requirements-table/useFloatingRailPosition'
import { useResizeHandles } from '@/components/_requirements-table/useResizeHandles'
import {
  DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS,
  type RequirementColumnId,
} from '@/lib/requirements/list-view'

type ColumnStateParams = Parameters<typeof useColumnState>[0]
type ResizeHandlesParams = Parameters<typeof useResizeHandles>[0]

function ref<T>(current: T): RefObject<T> {
  return { current }
}

function setRect(
  element: Element,
  { bottom, height, left, right, top, width }: Partial<DOMRect>,
) {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      bottom: bottom ?? 0,
      height: height ?? 0,
      left: left ?? 0,
      right: right ?? 0,
      toJSON: () => ({}),
      top: top ?? 0,
      width: width ?? 0,
      x: left ?? 0,
      y: top ?? 0,
    }),
  })
}

describe('requirements table hook helpers', () => {
  const resizeObserverCallbacks: ResizeObserverCallback[] = []

  beforeEach(() => {
    resizeObserverCallbacks.length = 0
    vi.stubGlobal(
      'ResizeObserver',
      class ResizeObserver {
        constructor(callback: ResizeObserverCallback) {
          resizeObserverCallbacks.push(callback)
        }

        disconnect() {}
        observe() {}
        unobserve() {}
      },
    )
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(performance.now())
      return 17
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })

  afterEach(() => {
    document.body.style.removeProperty('cursor')
    document.body.style.removeProperty('user-select')
    vi.unstubAllGlobals()
  })

  it('compares width, detail-bound, and floating-rail value objects', () => {
    expect(areColumnWidthsEqual({}, {})).toBe(true)
    expect(areColumnWidthsEqual({}, { uniqueId: 151 })).toBe(false)
    expect(areExpandedDetailBoundsEqual(null, null)).toBe(true)
    expect(
      areExpandedDetailBoundsEqual(null, {
        bottom: 20,
        contentHeight: 30,
        top: 10,
      }),
    ).toBe(false)
    expect(
      areExpandedDetailBoundsEqual(
        { bottom: 20, contentHeight: 30, top: 10 },
        { bottom: 20, contentHeight: 30, top: 10 },
      ),
    ).toBe(true)
    expect(
      areExpandedDetailBoundsEqual(
        { bottom: 20, contentHeight: 30, top: 10 },
        { bottom: 21, contentHeight: 30, top: 10 },
      ),
    ).toBe(false)
    expect(
      areFloatingActionRailPositionsEqual(
        { left: 8, top: 80, visible: true },
        { left: 8, top: 80, visible: true },
      ),
    ).toBe(true)
    expect(
      areFloatingActionRailPositionsEqual(
        { left: 8, top: 80, visible: true },
        { left: 9, top: 80, visible: false },
      ),
    ).toBe(false)
  })

  it('builds, measures, commits, cancels, and resets column width state', () => {
    const uniqueIdCell = document.createElement('th')
    const descriptionCell = document.createElement('th')
    setRect(uniqueIdCell, { width: 201.4 })
    setRect(descriptionCell, { width: 0 })
    Object.defineProperty(descriptionCell, 'offsetWidth', {
      configurable: true,
      value: 371,
    })
    const onColumnWidthsChange = vi.fn()
    const onFilterChange = vi.fn()
    const onSortChange = vi.fn()
    const definitions = [
      { defaultWidthPx: 150, id: 'uniqueId' as const, resizable: true },
      { defaultWidthPx: 360, id: 'description' as const, resizable: true },
      { defaultWidthPx: 176, id: 'status' as const, resizable: false },
    ]
    const headerCellRefs = ref({
      description: descriptionCell,
      uniqueId: uniqueIdCell,
    })
    const renderedColumnWidthsRef = ref({
      description: 360,
      status: 180,
      uniqueId: 150,
    } as Record<RequirementColumnId, number>)

    const { result, rerender } = renderHook<
      ReturnType<typeof useColumnState>,
      ColumnStateParams
    >(props => useColumnState(props), {
      initialProps: {
        allColumns: definitions,
        columnDefinitions: definitions,
        columnWidths: { description: 420 },
        filterValues: { statuses: [3] },
        headerCellRefs,
        normalizedColumnDefaults: DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS,
        normalizedVisibleColumns: ['uniqueId' as const, 'description' as const],
        onColumnWidthsChange,
        onFilterChange,
        onSortChange,
        renderedColumnWidthsRef,
        sortState: { by: 'status' as const, direction: 'desc' as const },
      } satisfies ColumnStateParams,
    })

    expect(onFilterChange).toHaveBeenCalledWith({})
    expect(onSortChange).toHaveBeenCalledWith({
      by: 'uniqueId',
      direction: 'asc',
    })

    expect(
      result.current.buildColumnWidthOverrides({
        description: 500,
        status: 200,
        uniqueId: 150,
      } as Record<RequirementColumnId, number>),
    ).toEqual({ description: 500 })
    expect(result.current.getVisibleWidthSnapshot()).toEqual({
      description: 360,
      status: 180,
      uniqueId: 201,
    })

    act(() => result.current.commitColumnWidthOverrides({ description: 420 }))
    expect(onColumnWidthsChange).not.toHaveBeenCalled()
    act(() => result.current.commitColumnWidthOverrides({ description: 430 }))
    expect(onColumnWidthsChange).toHaveBeenLastCalledWith({ description: 430 })

    result.current.resizePreviewFrameRef.current = 17
    act(() => result.current.cancelResizePreviewFrame())
    expect(cancelAnimationFrame).toHaveBeenCalledWith(17)

    result.current.resizePreviewVisibleWidthsRef.current = {
      description: 444,
      status: 176,
      uniqueId: 150,
    } as Record<RequirementColumnId, number>
    act(() => result.current.resetColumnWidth('description'))
    expect(onColumnWidthsChange).toHaveBeenLastCalledWith({})
    act(() => result.current.resetColumnWidth('description'))
    expect(onColumnWidthsChange).toHaveBeenCalledTimes(2)

    rerender({
      allColumns: definitions,
      columnDefinitions: definitions,
      columnWidths: {},
      filterValues: {},
      headerCellRefs,
      normalizedColumnDefaults: DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS,
      normalizedVisibleColumns: ['uniqueId', 'description'],
      onColumnWidthsChange: undefined,
      onFilterChange,
      onSortChange,
      renderedColumnWidthsRef,
      sortState: { by: 'uniqueId', direction: 'asc' },
    })
    act(() => result.current.commitColumnWidthOverrides({ uniqueId: 200 }))
    act(() => result.current.resetColumnWidth('uniqueId'))
    expect(onColumnWidthsChange).toHaveBeenCalledTimes(2)
  })

  it('positions the floating rail for measured, unmeasured, and inline tables', () => {
    const container = document.createElement('div')
    const table = document.createElement('table')
    const tableRoot = document.createElement('div')
    setRect(container, {
      bottom: 500,
      height: 400,
      left: 20,
      right: 700,
      top: 100,
      width: 680,
    })
    setRect(tableRoot, {
      bottom: 450,
      height: 470,
      left: 20,
      right: 700,
      top: -20,
      width: 680,
    })

    const { result, rerender, unmount } = renderHook(
      props => useFloatingRailPosition(props),
      {
        initialProps: {
          scrollContainerRef: ref<HTMLElement | null>(container),
          scrollLayoutSignature: 'one',
          shouldRenderInlineRail: false,
          tableRef: ref<HTMLElement | null>(table),
          tableRootRef: ref<HTMLElement | null>(tableRoot),
        },
      },
    )

    expect(result.current.floatingRailPosition).toMatchObject({
      left: 712,
      top: 80,
      visible: true,
    })
    expect(result.current.showScrollTopAction).toBe(true)

    act(() => {
      window.dispatchEvent(new Event('resize'))
      window.dispatchEvent(new Event('scroll'))
      resizeObserverCallbacks[0]?.([], {} as ResizeObserver)
    })
    expect(result.current.floatingRailPosition.visible).toBe(true)

    setRect(container, {})
    setRect(tableRoot, {})
    rerender({
      scrollContainerRef: ref<HTMLElement | null>(container),
      scrollLayoutSignature: 'two',
      shouldRenderInlineRail: false,
      tableRef: ref<HTMLElement | null>(table),
      tableRootRef: ref<HTMLElement | null>(tableRoot),
    })
    expect(result.current.floatingRailPosition.visible).toBe(true)
    expect(result.current.showScrollTopAction).toBe(false)

    rerender({
      scrollContainerRef: ref<HTMLElement | null>(container),
      scrollLayoutSignature: 'three',
      shouldRenderInlineRail: true,
      tableRef: ref<HTMLElement | null>(table),
      tableRootRef: ref<HTMLElement | null>(tableRoot),
    })
    expect(result.current.floatingRailPosition.visible).toBe(false)

    rerender({
      scrollContainerRef: ref<HTMLElement | null>(null),
      scrollLayoutSignature: 'four',
      shouldRenderInlineRail: false,
      tableRef: ref<HTMLElement | null>(null),
      tableRootRef: ref<HTMLElement | null>(null),
    })
    expect(result.current.floatingRailPosition.visible).toBe(false)
    unmount()
  })

  it('measures and drives resize state through pointer and keyboard input', () => {
    const container = document.createElement('div')
    const table = document.createElement('table')
    const tableContent = document.createElement('div')
    const stickyHeader = document.createElement('div')
    const expandedCell = document.createElement('td')
    const uniqueIdCell = document.createElement('th')
    const descriptionCell = document.createElement('th')
    const uniqueIdCol = document.createElement('col')
    const descriptionCol = document.createElement('col')
    const stickyUniqueIdCol = document.createElement('col')
    const stickyDescriptionCol = document.createElement('col')
    const handle = document.createElement('button')
    const releasePointerCapture = vi.fn()
    Object.assign(handle, {
      hasPointerCapture: vi.fn(() => true),
      releasePointerCapture,
      setPointerCapture: vi.fn(),
    })
    document.body.append(
      container,
      tableContent,
      stickyHeader,
      expandedCell,
      handle,
    )
    Object.defineProperties(container, {
      clientWidth: { configurable: true, value: 500 },
      scrollLeft: { configurable: true, writable: true, value: 20 },
      scrollWidth: { configurable: true, value: 900 },
    })
    Object.defineProperties(uniqueIdCell, {
      offsetLeft: { configurable: true, value: 0 },
      offsetWidth: { configurable: true, value: 150 },
    })
    Object.defineProperties(descriptionCell, {
      offsetLeft: { configurable: true, value: 150 },
      offsetWidth: { configurable: true, value: 360 },
    })
    setRect(tableContent, { height: 600, top: 20 })
    setRect(expandedCell, { bottom: 430, top: 180 })
    const commitColumnWidthOverrides = vi.fn()
    const cancelResizePreviewFrame = vi.fn()
    const getVisibleWidthSnapshot = vi.fn(
      () =>
        ({
          description: 360,
          uniqueId: 150,
        }) as Record<RequirementColumnId, number>,
    )
    const columnState = {
      buildColumnWidthOverrides: vi.fn(value => value),
      cancelResizePreviewFrame,
      columnWidthsRef: ref({}),
      commitColumnWidthOverrides,
      getVisibleWidthSnapshot,
      onColumnWidthsChangeRef: ref(vi.fn()),
      pendingResizePreviewVisibleWidthsRef: ref<Record<
        RequirementColumnId,
        number
      > | null>(null),
      resetColumnWidth: vi.fn(),
      resizePreviewFrameRef: ref<number | null>(null),
      resizePreviewVisibleWidthsRef: ref<Record<
        RequirementColumnId,
        number
      > | null>(null),
      visibleColumnIdsRef: ref<RequirementColumnId[]>([
        'uniqueId',
        'description',
      ]),
    } as unknown as ReturnType<typeof useColumnState>
    const refs: ResizeHandlesParams['refs'] = {
      colRefs: ref({ description: descriptionCol, uniqueId: uniqueIdCol }),
      expandedDetailCellRef: ref<HTMLTableCellElement | null>(expandedCell),
      headerCellRefs: ref({
        description: descriptionCell,
        uniqueId: uniqueIdCell,
      }),
      scrollContainerRef: ref<HTMLDivElement | null>(container),
      stickyHeaderColRefs: ref({
        description: stickyDescriptionCol,
        uniqueId: stickyUniqueIdCol,
      }),
      stickyHeaderContentRef: ref<HTMLDivElement | null>(stickyHeader),
      tableContentRef: ref<HTMLDivElement | null>(tableContent),
      tableRef: ref<HTMLTableElement | null>(table),
    }
    const renderedColumnWidthsRef = ref({
      description: 360,
      uniqueId: 150,
    } as Record<RequirementColumnId, number>)

    const { result, rerender, unmount } = renderHook<
      ReturnType<typeof useResizeHandles>,
      ResizeHandlesParams
    >(props => useResizeHandles(props), {
      initialProps: {
        canResizeColumns: true,
        checkboxColumnWidth: 36,
        columnDefinitions: [
          { id: 'uniqueId' as const },
          { id: 'description' as const },
        ],
        columnState,
        expandedDetailRowId: 1,
        refs,
        renderedColumnWidthsRef,
      },
    })

    result.current.resizeHandleRefs.current.uniqueId = { full: handle }
    act(() => result.current.syncMeasurements())
    expect(result.current.scrollFadeState).toEqual({ left: true, right: true })
    expect(result.current.scrollContainerWidth).toBe(500)
    expect(result.current.resizeHandleOffsets).toEqual([
      { columnId: 'uniqueId', left: 150 },
    ])
    expect(result.current.expandedDetailBounds).toEqual({
      bottom: 410,
      contentHeight: 600,
      top: 160,
    })

    act(() => result.current.setResizeHoverCursor(true))
    expect(document.body.style.cursor).toBe('ew-resize')
    act(() => result.current.setResizeHoverCursor(false))
    expect(document.body.style.cursor).toBe('')

    const pointerEvent = {
      button: 0,
      clientX: 100,
      currentTarget: handle,
      isPrimary: true,
      pointerId: 7,
      pointerType: 'mouse',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    }
    act(() =>
      result.current.handleResizePointerDown('uniqueId', {
        ...pointerEvent,
        isPrimary: false,
      } as never),
    )
    act(() =>
      result.current.handleResizePointerDown('uniqueId', {
        ...pointerEvent,
        button: 1,
      } as never),
    )
    act(() =>
      result.current.handleResizePointerDown('uniqueId', pointerEvent as never),
    )
    expect(document.body.style.cursor).toBe('ew-resize')
    act(() => result.current.setResizeHoverCursor(false))
    expect(document.body.style.cursor).toBe('ew-resize')

    act(() => {
      window.dispatchEvent(
        new PointerEvent('pointermove', { clientX: 200, pointerId: 8 }),
      )
      window.dispatchEvent(
        new PointerEvent('pointermove', { clientX: 100, pointerId: 7 }),
      )
      window.dispatchEvent(
        new PointerEvent('pointermove', { clientX: 132, pointerId: 7 }),
      )
      window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 8 }))
      window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7 }))
    })
    expect(commitColumnWidthOverrides).toHaveBeenCalled()
    expect(releasePointerCapture).toHaveBeenCalledWith(7)
    expect(document.body.style.cursor).toBe('')

    act(() =>
      result.current.handleResizePointerDown('uniqueId', pointerEvent as never),
    )
    act(() => {
      window.dispatchEvent(
        new PointerEvent('pointermove', { clientX: 124, pointerId: 7 }),
      )
      window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 7 }))
    })
    expect(tableContent.style.width).toBe('546px')

    const keyboardEvent = {
      key: 'ArrowRight',
      preventDefault: vi.fn(),
      shiftKey: true,
      stopPropagation: vi.fn(),
    }
    act(() =>
      result.current.handleResizeKeyDown('uniqueId', {
        ...keyboardEvent,
        key: 'Enter',
      } as never),
    )
    act(() =>
      result.current.handleResizeKeyDown('uniqueId', keyboardEvent as never),
    )
    expect(commitColumnWidthOverrides).toHaveBeenCalled()

    rerender({
      canResizeColumns: false,
      checkboxColumnWidth: 36,
      columnDefinitions: [
        { id: 'uniqueId' as const },
        { id: 'description' as const },
      ],
      columnState,
      expandedDetailRowId: null,
      refs,
      renderedColumnWidthsRef,
    })
    act(() => result.current.syncMeasurements())
    act(() =>
      result.current.handleResizePointerDown('uniqueId', pointerEvent as never),
    )
    act(() =>
      result.current.handleResizeKeyDown('uniqueId', {
        ...keyboardEvent,
        key: 'Enter',
      } as never),
    )
    expect(result.current.resizeHandleOffsets).toEqual([])
    expect(result.current.expandedDetailBounds).toBeNull()

    refs.scrollContainerRef.current = null
    act(() => result.current.syncMeasurements())
    expect(result.current.scrollFadeState).toEqual({
      left: false,
      right: false,
    })

    getVisibleWidthSnapshot.mockReturnValue({
      uniqueId: 150,
    } as Record<RequirementColumnId, number>)
    refs.stickyHeaderContentRef.current = null
    refs.tableContentRef.current = null
    refs.colRefs.current = {}
    refs.stickyHeaderColRefs.current = {}
    renderedColumnWidthsRef.current = null as never
    rerender({
      canResizeColumns: true,
      checkboxColumnWidth: 36,
      columnDefinitions: [
        { id: 'uniqueId' as const },
        { id: 'description' as const },
      ],
      columnState,
      expandedDetailRowId: 1,
      refs,
      renderedColumnWidthsRef,
    })
    act(() =>
      result.current.handleResizePointerDown('uniqueId', pointerEvent as never),
    )
    act(() => {
      window.dispatchEvent(
        new PointerEvent('pointermove', { clientX: 108, pointerId: 7 }),
      )
      window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7 }))
    })
    unmount()
  })
})

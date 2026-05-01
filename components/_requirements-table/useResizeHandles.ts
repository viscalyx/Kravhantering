'use client'

import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  clampRequirementColumnWidth,
  type RequirementColumnId,
} from '@/lib/requirements/list-view'
import {
  areExpandedDetailBoundsEqual,
  type ExpandedDetailBounds,
  type ResizeHandleSegmentKey,
  type ResizeHandleSegmentNode,
} from './shared'
import type { UseColumnStateResult } from './useColumnState'

interface ColumnDefinition {
  id: RequirementColumnId
}

interface ResizeRefs {
  colRefs: RefObject<
    Partial<Record<RequirementColumnId, HTMLTableColElement | null>>
  >
  expandedDetailCellRef: RefObject<HTMLTableCellElement | null>
  headerCellRefs: RefObject<
    Partial<Record<RequirementColumnId, HTMLTableCellElement | null>>
  >
  scrollContainerRef: RefObject<HTMLDivElement | null>
  stickyHeaderColRefs: RefObject<
    Partial<Record<RequirementColumnId, HTMLTableColElement | null>>
  >
  stickyHeaderContentRef: RefObject<HTMLDivElement | null>
  tableContentRef: RefObject<HTMLDivElement | null>
  tableRef: RefObject<HTMLTableElement | null>
}

interface ScrollFadeState {
  left: boolean
  right: boolean
}

interface UseResizeHandlesParams {
  canResizeColumns: boolean
  checkboxColumnWidth: number
  columnDefinitions: ColumnDefinition[]
  columnState: UseColumnStateResult
  expandedDetailRowId: number | null
  refs: ResizeRefs
  renderedColumnWidthsRef: RefObject<Record<RequirementColumnId, number>>
}

export interface UseResizeHandlesResult {
  expandedDetailBounds: ExpandedDetailBounds | null
  handleResizeKeyDown: (
    columnId: RequirementColumnId,
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ) => void
  handleResizePointerDown: (
    columnId: RequirementColumnId,
    event: ReactPointerEvent<HTMLElement>,
  ) => void
  resizeHandleOffsets: { columnId: RequirementColumnId; left: number }[]
  resizeHandleRefs: RefObject<
    Partial<
      Record<
        RequirementColumnId,
        Partial<Record<ResizeHandleSegmentKey, ResizeHandleSegmentNode | null>>
      >
    >
  >
  scrollContainerWidth: number
  scrollFadeState: ScrollFadeState
  setResizeHoverCursor: (active: boolean) => void
  syncMeasurements: () => void
}

interface ResizeState {
  columnId: RequirementColumnId
  handle: HTMLElement | null
  pointerId: number
  startWidth: number
  startX: number
  visibleWidths: Record<RequirementColumnId, number>
}

/**
 * Owns the column-resize pointer state machine plus the imperative
 * scroll/resize-driven measurements that share the same listener: scroll
 * fades, scroll-container width, resize-handle offsets, and the
 * expanded-detail cell bounds (which clip the resize handles).
 */
export function useResizeHandles({
  canResizeColumns,
  checkboxColumnWidth,
  columnDefinitions,
  columnState,
  expandedDetailRowId,
  refs,
  renderedColumnWidthsRef,
}: UseResizeHandlesParams): UseResizeHandlesResult {
  const {
    buildColumnWidthOverrides,
    cancelResizePreviewFrame,
    commitColumnWidthOverrides,
    getVisibleWidthSnapshot,
    pendingResizePreviewVisibleWidthsRef,
    resizePreviewFrameRef,
    resizePreviewVisibleWidthsRef,
  } = columnState
  const {
    colRefs,
    expandedDetailCellRef,
    headerCellRefs,
    scrollContainerRef,
    stickyHeaderColRefs,
    stickyHeaderContentRef,
    tableContentRef,
    tableRef,
  } = refs

  const resizeStateRef = useRef<ResizeState | null>(null)
  const resizeHandleRefs = useRef<
    Partial<
      Record<
        RequirementColumnId,
        Partial<Record<ResizeHandleSegmentKey, ResizeHandleSegmentNode | null>>
      >
    >
  >({})
  const [resizeHandleOffsets, setResizeHandleOffsets] = useState<
    { columnId: RequirementColumnId; left: number }[]
  >([])
  const [expandedDetailBounds, setExpandedDetailBounds] =
    useState<ExpandedDetailBounds | null>(null)
  const [scrollContainerWidth, setScrollContainerWidth] = useState(0)
  const [scrollFadeState, setScrollFadeState] = useState<ScrollFadeState>({
    left: false,
    right: false,
  })

  const syncResizeHandlePositions = useCallback(
    (visibleWidths: Record<RequirementColumnId, number>) => {
      let left = checkboxColumnWidth
      const fallback =
        renderedColumnWidthsRef.current ??
        ({} as Record<RequirementColumnId, number>)

      for (const [columnIndex, column] of columnDefinitions.entries()) {
        left += visibleWidths[column.id] ?? fallback[column.id] ?? 0
        if (columnIndex === columnDefinitions.length - 1) {
          continue
        }

        const handles = Object.values(resizeHandleRefs.current[column.id] ?? {})
        for (const handle of handles) {
          if (handle) {
            handle.style.left = `${left}px`
          }
        }
      }
    },
    [checkboxColumnWidth, columnDefinitions, renderedColumnWidthsRef],
  )

  const applyVisibleWidthPreview = useCallback(
    (visibleWidths: Record<RequirementColumnId, number>) => {
      const fallback =
        renderedColumnWidthsRef.current ??
        ({} as Record<RequirementColumnId, number>)
      const nextTableWidth =
        columnDefinitions.reduce(
          (total, column) =>
            total + (visibleWidths[column.id] ?? fallback[column.id] ?? 0),
          0,
        ) + checkboxColumnWidth
      const stickyHeaderContent = stickyHeaderContentRef.current
      const tableContent = tableContentRef.current

      if (stickyHeaderContent) {
        stickyHeaderContent.style.width = `${nextTableWidth}px`
      }

      if (tableContent) {
        tableContent.style.width = `${nextTableWidth}px`
      }

      for (const column of columnDefinitions) {
        const width = visibleWidths[column.id] ?? fallback[column.id] ?? 0
        const col = colRefs.current?.[column.id]
        const stickyHeaderCol = stickyHeaderColRefs.current?.[column.id]
        if (col) {
          col.style.width = `${width}px`
        }
        if (stickyHeaderCol) {
          stickyHeaderCol.style.width = `${width}px`
        }
      }

      syncResizeHandlePositions(visibleWidths)
    },
    [
      checkboxColumnWidth,
      colRefs,
      columnDefinitions,
      renderedColumnWidthsRef,
      stickyHeaderColRefs,
      stickyHeaderContentRef,
      syncResizeHandlePositions,
      tableContentRef,
    ],
  )

  const flushResizePreview = useCallback(() => {
    const nextVisibleWidths = pendingResizePreviewVisibleWidthsRef.current
    if (!nextVisibleWidths) {
      return
    }

    pendingResizePreviewVisibleWidthsRef.current = null
    resizePreviewVisibleWidthsRef.current = nextVisibleWidths
    applyVisibleWidthPreview(nextVisibleWidths)
  }, [
    applyVisibleWidthPreview,
    pendingResizePreviewVisibleWidthsRef,
    resizePreviewVisibleWidthsRef,
  ])

  const scheduleResizePreview = useCallback(
    (nextVisibleWidths: Record<RequirementColumnId, number>) => {
      const activeResize = resizeStateRef.current
      if (!activeResize) {
        return
      }

      const currentVisibleWidths =
        pendingResizePreviewVisibleWidthsRef.current ??
        resizePreviewVisibleWidthsRef.current ??
        activeResize.visibleWidths

      if (
        currentVisibleWidths[activeResize.columnId] ===
        nextVisibleWidths[activeResize.columnId]
      ) {
        return
      }

      pendingResizePreviewVisibleWidthsRef.current = nextVisibleWidths
      if (resizePreviewFrameRef.current !== null) {
        return
      }

      if (typeof globalThis.requestAnimationFrame !== 'function') {
        flushResizePreview()
        return
      }

      resizePreviewFrameRef.current = globalThis.requestAnimationFrame(() => {
        resizePreviewFrameRef.current = null
        flushResizePreview()
      })
    },
    [
      flushResizePreview,
      pendingResizePreviewVisibleWidthsRef,
      resizePreviewFrameRef,
      resizePreviewVisibleWidthsRef,
    ],
  )

  const finishResizing = useCallback(
    (commitPreview: boolean) => {
      const activeResize = resizeStateRef.current
      if (!activeResize) {
        return
      }

      flushResizePreview()

      const previewVisibleWidths = resizePreviewVisibleWidthsRef.current
      const finalVisibleWidths =
        previewVisibleWidths ?? activeResize.visibleWidths

      if (!commitPreview) {
        applyVisibleWidthPreview(activeResize.visibleWidths)
      }

      cancelResizePreviewFrame()
      pendingResizePreviewVisibleWidthsRef.current = null
      resizePreviewVisibleWidthsRef.current = null

      if (commitPreview) {
        commitColumnWidthOverrides(
          buildColumnWidthOverrides(finalVisibleWidths),
        )
      }

      if (
        activeResize.handle?.isConnected &&
        activeResize.handle.hasPointerCapture?.(activeResize.pointerId)
      ) {
        activeResize.handle.releasePointerCapture(activeResize.pointerId)
      }

      resizeStateRef.current = null
      document.body.style.removeProperty('cursor')
      document.body.style.removeProperty('user-select')
    },
    [
      applyVisibleWidthPreview,
      buildColumnWidthOverrides,
      cancelResizePreviewFrame,
      commitColumnWidthOverrides,
      flushResizePreview,
      pendingResizePreviewVisibleWidthsRef,
      resizePreviewVisibleWidthsRef,
    ],
  )

  const handleResizePointerUp = useCallback(
    (event: PointerEvent) => {
      const activeResize = resizeStateRef.current
      if (!activeResize || event.pointerId !== activeResize.pointerId) {
        return
      }

      finishResizing(true)
    },
    [finishResizing],
  )

  const handleResizePointerCancel = useCallback(
    (event: PointerEvent) => {
      const activeResize = resizeStateRef.current
      if (!activeResize || event.pointerId !== activeResize.pointerId) {
        return
      }

      finishResizing(false)
    },
    [finishResizing],
  )

  const updateScrollFades = useCallback(() => {
    if (resizeStateRef.current) {
      return
    }

    const container = scrollContainerRef.current

    if (!container) {
      setScrollFadeState(previous =>
        previous.left || previous.right
          ? { left: false, right: false }
          : previous,
      )
      return
    }

    const maxScrollLeft = container.scrollWidth - container.clientWidth
    const nextState = {
      left: container.scrollLeft > 1,
      right: maxScrollLeft > 1 && container.scrollLeft < maxScrollLeft - 1,
    }

    setScrollContainerWidth(previous =>
      previous === container.clientWidth ? previous : container.clientWidth,
    )

    setScrollFadeState(previous => {
      if (
        previous.left === nextState.left &&
        previous.right === nextState.right
      ) {
        return previous
      }

      return nextState
    })
  }, [scrollContainerRef])

  const updateResizeHandleOffsets = useCallback(() => {
    if (resizeStateRef.current) {
      return
    }

    if (!canResizeColumns) {
      setResizeHandleOffsets(previous =>
        previous.length === 0 ? previous : [],
      )
      return
    }

    const nextOffsets = columnDefinitions
      .map((column, columnIndex) => {
        const cell = headerCellRefs.current?.[column.id]

        if (!cell || columnIndex === columnDefinitions.length - 1) {
          return null
        }

        return {
          columnId: column.id,
          left: Math.round(cell.offsetLeft + cell.offsetWidth),
        }
      })
      .filter(
        (value): value is { columnId: RequirementColumnId; left: number } =>
          value !== null,
      )

    setResizeHandleOffsets(previous => {
      if (
        previous.length === nextOffsets.length &&
        previous.every(
          (value, index) =>
            value.columnId === nextOffsets[index]?.columnId &&
            value.left === nextOffsets[index]?.left,
        )
      ) {
        return previous
      }

      return nextOffsets
    })
  }, [canResizeColumns, columnDefinitions, headerCellRefs])

  const updateExpandedDetailBounds = useCallback(() => {
    if (!canResizeColumns || expandedDetailRowId === null) {
      setExpandedDetailBounds(previous => (previous ? null : previous))
      return
    }

    const cell = expandedDetailCellRef.current
    const tableContent = tableContentRef.current

    if (!cell || !tableContent) {
      setExpandedDetailBounds(previous => (previous ? null : previous))
      return
    }

    const cellRect = cell.getBoundingClientRect()
    const tableContentRect = tableContent.getBoundingClientRect()
    const contentHeight = Math.max(0, Math.round(tableContentRect.height))
    const relativeTop = cellRect.top - tableContentRect.top
    const relativeBottom = cellRect.bottom - tableContentRect.top
    const top = Math.min(contentHeight, Math.max(0, Math.floor(relativeTop)))
    const nextBounds: ExpandedDetailBounds = {
      bottom: Math.min(contentHeight, Math.max(top, Math.ceil(relativeBottom))),
      contentHeight,
      top,
    }

    setExpandedDetailBounds(previous =>
      areExpandedDetailBoundsEqual(previous, nextBounds)
        ? previous
        : nextBounds,
    )
  }, [
    canResizeColumns,
    expandedDetailCellRef,
    expandedDetailRowId,
    tableContentRef,
  ])

  const syncMeasurements = useCallback(() => {
    updateScrollFades()
    updateResizeHandleOffsets()
    updateExpandedDetailBounds()
  }, [updateExpandedDetailBounds, updateResizeHandleOffsets, updateScrollFades])

  const setResizeHoverCursor = useCallback((active: boolean) => {
    if (resizeStateRef.current) {
      return
    }

    if (active) {
      document.body.style.cursor = 'ew-resize'
      return
    }

    document.body.style.removeProperty('cursor')
  }, [])

  // Window-level pointer listeners for active resize drag.
  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const activeResize = resizeStateRef.current
      if (!activeResize || event.pointerId !== activeResize.pointerId) {
        return
      }

      const nextWidth = clampRequirementColumnWidth(
        activeResize.columnId,
        activeResize.startWidth + (event.clientX - activeResize.startX),
      )
      if (nextWidth === activeResize.visibleWidths[activeResize.columnId]) {
        return
      }

      scheduleResizePreview({
        ...activeResize.visibleWidths,
        [activeResize.columnId]: nextWidth,
      })
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handleResizePointerUp)
    window.addEventListener('pointercancel', handleResizePointerCancel)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handleResizePointerUp)
      window.removeEventListener('pointercancel', handleResizePointerCancel)
      document.body.style.removeProperty('cursor')
      document.body.style.removeProperty('user-select')
    }
  }, [handleResizePointerCancel, handleResizePointerUp, scheduleResizePreview])

  // Scroll/resize listener wiring for fades + handle offsets + expanded bounds.
  useEffect(() => {
    const container = scrollContainerRef.current

    if (!container) {
      return
    }

    syncMeasurements()

    const handleScroll = () => updateScrollFades()
    container.addEventListener('scroll', handleScroll, { passive: true })

    const handleResizeObserver: ResizeObserverCallback = () => {
      syncMeasurements()
    }
    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(handleResizeObserver)

    resizeObserver?.observe(container)
    if (tableContentRef.current) {
      resizeObserver?.observe(tableContentRef.current)
    }
    if (tableRef.current) {
      resizeObserver?.observe(tableRef.current)
    }
    if (expandedDetailCellRef.current) {
      resizeObserver?.observe(expandedDetailCellRef.current)
    }

    return () => {
      container.removeEventListener('scroll', handleScroll)
      resizeObserver?.disconnect()
    }
  }, [
    expandedDetailCellRef,
    scrollContainerRef,
    syncMeasurements,
    tableContentRef,
    tableRef,
    updateScrollFades,
  ])

  const handleResizePointerDown = useCallback(
    (columnId: RequirementColumnId, event: ReactPointerEvent<HTMLElement>) => {
      if (!canResizeColumns) {
        return
      }

      // Only respond to the primary pointer, and for mouse input only the
      // primary (left) button. This avoids stealing right-click / middle-click
      // and concurrent multi-touch pointers.
      if (event.isPrimary === false) {
        return
      }
      if (event.pointerType === 'mouse' && event.button !== 0) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      cancelResizePreviewFrame()
      pendingResizePreviewVisibleWidthsRef.current = null
      resizePreviewVisibleWidthsRef.current = null
      const visibleWidths = getVisibleWidthSnapshot()
      event.currentTarget.setPointerCapture?.(event.pointerId)
      resizeStateRef.current = {
        columnId,
        handle: event.currentTarget,
        pointerId: event.pointerId,
        startWidth: visibleWidths[columnId],
        startX: event.clientX,
        visibleWidths,
      }
      document.body.style.cursor = 'ew-resize'
      document.body.style.userSelect = 'none'
    },
    [
      canResizeColumns,
      cancelResizePreviewFrame,
      getVisibleWidthSnapshot,
      pendingResizePreviewVisibleWidthsRef,
      resizePreviewVisibleWidthsRef,
    ],
  )

  const handleResizeKeyDown = useCallback(
    (
      columnId: RequirementColumnId,
      event: ReactKeyboardEvent<HTMLButtonElement>,
    ) => {
      if (!canResizeColumns) {
        return
      }

      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      const visibleWidths = getVisibleWidthSnapshot()
      const step = event.shiftKey ? 32 : 8
      const delta = event.key === 'ArrowRight' ? step : -step
      cancelResizePreviewFrame()
      pendingResizePreviewVisibleWidthsRef.current = null
      resizePreviewVisibleWidthsRef.current = null
      commitColumnWidthOverrides(
        buildColumnWidthOverrides({
          ...visibleWidths,
          [columnId]: clampRequirementColumnWidth(
            columnId,
            visibleWidths[columnId] + delta,
          ),
        }),
      )
    },
    [
      buildColumnWidthOverrides,
      canResizeColumns,
      cancelResizePreviewFrame,
      commitColumnWidthOverrides,
      getVisibleWidthSnapshot,
      pendingResizePreviewVisibleWidthsRef,
      resizePreviewVisibleWidthsRef,
    ],
  )

  return {
    expandedDetailBounds,
    handleResizeKeyDown,
    handleResizePointerDown,
    resizeHandleOffsets,
    resizeHandleRefs,
    scrollContainerWidth,
    scrollFadeState,
    setResizeHoverCursor,
    syncMeasurements,
  }
}

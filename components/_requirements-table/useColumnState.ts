'use client'

import { type RefObject, useCallback, useEffect, useRef } from 'react'
import {
  clampRequirementColumnWidth,
  clearRequirementFiltersForHiddenColumns,
  DEFAULT_REQUIREMENT_SORT,
  type FilterValues,
  type RequirementColumnId,
  type RequirementColumnWidths,
  type RequirementListColumnDefault,
  type RequirementSortState,
} from '@/lib/requirements/list-view'
import { areColumnWidthsEqual } from './shared'

interface ColumnDefinition {
  defaultWidthPx: number
  id: RequirementColumnId
  resizable: boolean
}

interface UseColumnStateParams {
  allColumns: {
    defaultWidthPx: number
    id: RequirementColumnId
    resizable: boolean
  }[]
  columnDefinitions: ColumnDefinition[]
  columnWidths: RequirementColumnWidths
  filterValues: FilterValues
  headerCellRefs: RefObject<
    Partial<Record<RequirementColumnId, HTMLTableCellElement | null>>
  >
  normalizedColumnDefaults: RequirementListColumnDefault[]
  normalizedVisibleColumns: RequirementColumnId[]
  onColumnWidthsChange: ((value: RequirementColumnWidths) => void) | undefined
  onFilterChange: ((value: FilterValues) => void) | undefined
  onSortChange: ((value: RequirementSortState) => void) | undefined
  renderedColumnWidthsRef: RefObject<Record<RequirementColumnId, number>>
  sortState: RequirementSortState
}

export interface UseColumnStateResult {
  buildColumnWidthOverrides: (
    visibleWidths: Record<RequirementColumnId, number>,
  ) => RequirementColumnWidths
  cancelResizePreviewFrame: () => void
  columnWidthsRef: RefObject<RequirementColumnWidths>
  commitColumnWidthOverrides: (nextWidths: RequirementColumnWidths) => void
  getVisibleWidthSnapshot: () => Record<RequirementColumnId, number>
  onColumnWidthsChangeRef: RefObject<
    ((value: RequirementColumnWidths) => void) | undefined
  >
  pendingResizePreviewVisibleWidthsRef: RefObject<Record<
    RequirementColumnId,
    number
  > | null>
  resetColumnWidth: (columnId: RequirementColumnId) => void
  resizePreviewFrameRef: RefObject<number | null>
  resizePreviewVisibleWidthsRef: RefObject<Record<
    RequirementColumnId,
    number
  > | null>
  visibleColumnIdsRef: RefObject<RequirementColumnId[]>
}

/**
 * Owns column-width refs, the visibility→filter/sort cleanup effect, and the
 * column-width helper callbacks (build/commit/snapshot/reset). All resize
 * preview state lives here so the resize hook can read/write it through refs
 * without re-renders.
 */
export function useColumnState({
  allColumns,
  columnDefinitions,
  columnWidths,
  filterValues,
  headerCellRefs,
  normalizedColumnDefaults,
  normalizedVisibleColumns,
  onColumnWidthsChange,
  onFilterChange,
  onSortChange,
  renderedColumnWidthsRef,
  sortState,
}: UseColumnStateParams): UseColumnStateResult {
  const columnWidthsRef = useRef(columnWidths)
  const onColumnWidthsChangeRef = useRef(onColumnWidthsChange)
  const visibleColumnIdsRef = useRef<RequirementColumnId[]>(
    columnDefinitions.map(column => column.id),
  )
  const resizePreviewVisibleWidthsRef = useRef<Record<
    RequirementColumnId,
    number
  > | null>(null)
  const pendingResizePreviewVisibleWidthsRef = useRef<Record<
    RequirementColumnId,
    number
  > | null>(null)
  const resizePreviewFrameRef = useRef<number | null>(null)

  useEffect(() => {
    columnWidthsRef.current = columnWidths
  }, [columnWidths])

  useEffect(() => {
    onColumnWidthsChangeRef.current = onColumnWidthsChange
  }, [onColumnWidthsChange])

  useEffect(() => {
    visibleColumnIdsRef.current = columnDefinitions.map(column => column.id)
  }, [columnDefinitions])

  useEffect(() => {
    const nextFilterValues = clearRequirementFiltersForHiddenColumns(
      filterValues,
      normalizedVisibleColumns,
      { columnDefaults: normalizedColumnDefaults },
    )

    if (nextFilterValues !== filterValues && onFilterChange) {
      onFilterChange(nextFilterValues)
    }

    if (
      !normalizedVisibleColumns.includes(sortState.by as RequirementColumnId) &&
      onSortChange &&
      sortState.by !== DEFAULT_REQUIREMENT_SORT.by
    ) {
      onSortChange(DEFAULT_REQUIREMENT_SORT)
    }
  }, [
    filterValues,
    normalizedColumnDefaults,
    normalizedVisibleColumns,
    onFilterChange,
    onSortChange,
    sortState.by,
  ])

  const buildColumnWidthOverrides = useCallback(
    (visibleWidths: Record<RequirementColumnId, number>) => {
      const nextWidths = { ...columnWidthsRef.current }

      for (const columnId of visibleColumnIdsRef.current) {
        const width = visibleWidths[columnId]
        const column = allColumns.find(item => item.id === columnId)

        if (typeof width !== 'number' || !column?.resizable) {
          continue
        }

        const nextWidth = clampRequirementColumnWidth(columnId, width)
        if (nextWidth === column.defaultWidthPx) {
          delete nextWidths[columnId]
        } else {
          nextWidths[columnId] = nextWidth
        }
      }

      return nextWidths
    },
    [allColumns],
  )

  const commitColumnWidthOverrides = useCallback(
    (nextWidths: RequirementColumnWidths) => {
      const onChange = onColumnWidthsChangeRef.current
      if (!onChange) {
        return
      }

      if (areColumnWidthsEqual(columnWidthsRef.current, nextWidths)) {
        return
      }

      columnWidthsRef.current = nextWidths
      onChange(nextWidths)
    },
    [],
  )

  const getVisibleWidthSnapshot = useCallback(() => {
    const snapshot = {} as Record<RequirementColumnId, number>
    const fallback =
      renderedColumnWidthsRef.current ??
      ({} as Record<RequirementColumnId, number>)

    for (const column of columnDefinitions) {
      const cell = headerCellRefs.current?.[column.id]
      const measuredWidth = Math.round(
        cell?.getBoundingClientRect().width ?? cell?.offsetWidth ?? 0,
      )

      snapshot[column.id] = clampRequirementColumnWidth(
        column.id,
        measuredWidth > 0 ? measuredWidth : (fallback[column.id] ?? 0),
      )
    }

    return snapshot
  }, [columnDefinitions, headerCellRefs, renderedColumnWidthsRef])

  const cancelResizePreviewFrame = useCallback(() => {
    if (
      resizePreviewFrameRef.current !== null &&
      typeof globalThis.cancelAnimationFrame === 'function'
    ) {
      globalThis.cancelAnimationFrame(resizePreviewFrameRef.current)
    }

    resizePreviewFrameRef.current = null
  }, [])

  const resetColumnWidth = useCallback(
    (columnId: RequirementColumnId) => {
      const onChange = onColumnWidthsChangeRef.current
      if (!onChange) {
        return
      }

      const currentWidths = resizePreviewVisibleWidthsRef.current
        ? buildColumnWidthOverrides(resizePreviewVisibleWidthsRef.current)
        : columnWidthsRef.current
      if (!(columnId in currentWidths)) {
        return
      }

      const nextWidths = { ...currentWidths }
      delete nextWidths[columnId]
      cancelResizePreviewFrame()
      pendingResizePreviewVisibleWidthsRef.current = null
      resizePreviewVisibleWidthsRef.current = null
      commitColumnWidthOverrides(nextWidths)
    },
    [
      buildColumnWidthOverrides,
      cancelResizePreviewFrame,
      commitColumnWidthOverrides,
    ],
  )

  return {
    buildColumnWidthOverrides,
    cancelResizePreviewFrame,
    columnWidthsRef,
    commitColumnWidthOverrides,
    getVisibleWidthSnapshot,
    onColumnWidthsChangeRef,
    pendingResizePreviewVisibleWidthsRef,
    resetColumnWidth,
    resizePreviewFrameRef,
    resizePreviewVisibleWidthsRef,
    visibleColumnIdsRef,
  }
}

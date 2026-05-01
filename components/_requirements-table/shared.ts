'use client'

import { useEffect, useLayoutEffect } from 'react'
import {
  DEFAULT_REQUIREMENT_COLUMN_WIDTHS,
  getOrderedRequirementListColumns,
  type RequirementColumnWidths,
} from '@/lib/requirements/list-view'

export const POPOVER_VIEWPORT_MARGIN = 8
export const FLOATING_ACTION_RAIL_MIN_TOP_OFFSET = 80
export const FLOATING_ACTION_RAIL_TABLE_TOP_OFFSET = 4
export const FLOATING_ACTION_RAIL_WIDTH = 44

export const useClientLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect

export type ResizeHandleSegmentKey = 'bottom' | 'full' | 'top'
export type ResizeHandleSegmentNode = HTMLButtonElement | HTMLDivElement

export interface ExpandedDetailBounds {
  bottom: number
  contentHeight: number
  top: number
}

export interface FloatingActionRailPosition {
  left: number
  top: number
  visible: boolean
}

export function areColumnWidthsEqual(
  left: RequirementColumnWidths,
  right: RequirementColumnWidths,
) {
  return getOrderedRequirementListColumns().every(
    column =>
      (left[column.id] ?? DEFAULT_REQUIREMENT_COLUMN_WIDTHS[column.id]) ===
      (right[column.id] ?? DEFAULT_REQUIREMENT_COLUMN_WIDTHS[column.id]),
  )
}

export function areExpandedDetailBoundsEqual(
  left: ExpandedDetailBounds | null,
  right: ExpandedDetailBounds | null,
) {
  if (left === right) {
    return true
  }

  if (!left || !right) {
    return false
  }

  return (
    left.top === right.top &&
    left.bottom === right.bottom &&
    left.contentHeight === right.contentHeight
  )
}

export function areFloatingActionRailPositionsEqual(
  left: FloatingActionRailPosition,
  right: FloatingActionRailPosition,
) {
  return (
    left.left === right.left &&
    left.top === right.top &&
    left.visible === right.visible
  )
}

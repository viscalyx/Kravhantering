'use client'

import { useEffect, useLayoutEffect } from 'react'
import { modalPortalTarget } from '@/lib/modal-focus'
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

export function clampPopoverLeft(anchorLeft: number, popoverWidth: number) {
  if (typeof window === 'undefined') {
    return anchorLeft
  }

  const viewportWidth = Math.max(
    window.innerWidth,
    document.documentElement.clientWidth,
  )
  const maxLeft = Math.max(
    POPOVER_VIEWPORT_MARGIN,
    viewportWidth - popoverWidth - POPOVER_VIEWPORT_MARGIN,
  )

  return Math.min(Math.max(anchorLeft, POPOVER_VIEWPORT_MARGIN), maxLeft)
}

export function listenForTablePopoverKeys(
  trigger: HTMLElement | null,
  handleKeyDown: (event: KeyboardEvent) => void,
) {
  const owner = modalPortalTarget(trigger)
  if (owner === document.body) {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }
  function onKeyDown(event: KeyboardEvent) {
    if (event.defaultPrevented || trigger?.closest('[inert]')) return
    // A menu inside a dialog gets the first Escape. The next one closes the dialog.
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
    }
    handleKeyDown(event)
  }
  owner.addEventListener('keydown', onKeyDown, true)
  return () => owner.removeEventListener('keydown', onKeyDown, true)
}

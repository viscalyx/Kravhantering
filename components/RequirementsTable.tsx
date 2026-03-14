'use client'

import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  Columns3,
  Filter,
  Search,
  TestTube2,
  X,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  Fragment,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import StatusBadge from '@/components/StatusBadge'
import { Link, useRouter } from '@/i18n/routing'
import { getRequirementColumnDeveloperModeLabel } from '@/lib/developer-mode'
import {
  type AreaOption,
  clampRequirementColumnWidth,
  clearRequirementFiltersForHiddenColumns,
  DEFAULT_REQUIREMENT_COLUMN_WIDTHS,
  DEFAULT_REQUIREMENT_SORT,
  type FilterOption,
  type FilterValues,
  getDefaultVisibleRequirementColumns,
  getOrderedRequirementListColumns,
  getRequirementColumnWidth,
  normalizeRequirementListColumnDefaults,
  orderRequirementVisibleColumns,
  type RequirementColumnId,
  type RequirementColumnWidths,
  type RequirementListColumnDefault,
  type RequirementRow,
  type RequirementSortField,
  type RequirementSortState,
  type StatusOption,
  type TypeCategoryOption,
} from '@/lib/requirements/list-view'

export interface RequirementsTableProps {
  areas?: AreaOption[]
  categories?: FilterOption[]
  columnDefaults?: RequirementListColumnDefault[]
  columnWidths?: RequirementColumnWidths
  expandedId?: number | null
  filterValues?: FilterValues
  floatingActions?: FloatingActionItem[]
  getName?: (opt: FilterOption) => string
  getStatusName?: (opt: StatusOption) => string
  hasMore?: boolean
  loading?: boolean
  loadingMore?: boolean
  locale: string
  onColumnWidthsChange?: (value: RequirementColumnWidths) => void
  onFilterChange?: (values: FilterValues) => void
  onLoadMore?: () => void
  onRowClick?: (id: number) => void
  onSortChange?: (value: RequirementSortState) => void
  onVisibleColumnsChange?: (value: RequirementColumnId[]) => void
  pinnedIds?: Set<number>
  renderExpanded?: (id: number) => ReactNode
  rows: RequirementRow[]
  sortState?: RequirementSortState
  statusOptions?: StatusOption[]
  typeCategories?: TypeCategoryOption[]
  types?: FilterOption[]
  visibleColumns?: RequirementColumnId[]
}

export type FloatingActionPillVariant = 'default' | 'primary'

export interface FloatingActionMenuItem {
  description?: string
  href: string
  id: string
  label: string
}

export interface FloatingActionItem {
  developerModeContext?: string
  developerModeValue?: string
  ariaLabel: string
  href?: string
  icon: ReactNode
  id: string
  menuItems?: FloatingActionMenuItem[]
  onClick?: () => void
  position?: 'beforeColumns' | 'afterColumns'
  variant?: FloatingActionPillVariant
}

const floatingPillBaseClassName =
  'inline-flex h-11 w-11 items-center justify-center rounded-full border shadow-[0_10px_30px_-18px_rgba(15,23,42,0.45)] backdrop-blur-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white hover:-translate-y-px dark:focus-visible:ring-offset-secondary-950'

const floatingPillVariantClassNames: Record<FloatingActionPillVariant, string> =
  {
    default:
      'border-secondary-200/80 bg-white/90 text-secondary-500 hover:border-secondary-300 hover:text-secondary-700 hover:shadow-[0_14px_36px_-20px_rgba(15,23,42,0.5)] dark:border-secondary-700/80 dark:bg-secondary-900/80 dark:text-secondary-300 dark:hover:border-secondary-600 dark:hover:text-secondary-100',
    primary:
      'border-primary-600/80 bg-primary-700 text-white hover:border-primary-700 hover:bg-primary-800 hover:shadow-[0_14px_36px_-20px_rgba(67,56,202,0.55)] dark:border-primary-500/80 dark:bg-primary-600 dark:hover:border-primary-400 dark:hover:bg-primary-700',
  }

function getFloatingPillClassName(
  variant: FloatingActionPillVariant = 'default',
) {
  return `${floatingPillBaseClassName} ${floatingPillVariantClassNames[variant]}`
}

function FloatingActionPill({ action }: { action: FloatingActionItem }) {
  const variant = action.variant ?? 'default'
  const hasMenu = (action.menuItems?.length ?? 0) > 0
  const developerModeContext = action.developerModeContext
  const developerModeValue = action.developerModeValue
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuPosition, setMenuPosition] = useState<{
    left: number
    maxHeight: number
    top: number
    width: number
  } | null>(null)

  useEffect(() => {
    if (!hasMenu) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (
        !wrapperRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [hasMenu])

  useEffect(() => {
    if (!hasMenu || !open) {
      return
    }

    const firstMenuItem = menuRef.current?.querySelector('a[href]')
    if (firstMenuItem instanceof HTMLElement) {
      firstMenuItem.focus()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return
      }

      setOpen(false)
      triggerRef.current?.focus()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [hasMenu, open])

  useEffect(() => {
    if (!hasMenu || !open || !triggerRef.current) {
      return
    }

    const updatePosition = () => {
      if (!triggerRef.current || typeof window === 'undefined') {
        return
      }

      const rect = triggerRef.current.getBoundingClientRect()
      const viewportWidth = Math.max(
        window.innerWidth,
        document.documentElement.clientWidth,
      )
      const viewportHeight = Math.max(
        window.innerHeight,
        document.documentElement.clientHeight,
      )
      const width = Math.min(288, Math.max(viewportWidth - 16, 160))
      const top = Math.min(
        rect.top,
        Math.max(POPOVER_VIEWPORT_MARGIN, viewportHeight - 56),
      )

      setMenuPosition({
        left: clampPopoverLeft(rect.left - width - 12, width),
        maxHeight: Math.max(viewportHeight - top - POPOVER_VIEWPORT_MARGIN, 44),
        top,
        width,
      })
    }

    updatePosition()

    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => updatePosition())

    resizeObserver?.observe(triggerRef.current)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)

    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [hasMenu, open])

  if (hasMenu) {
    return (
      <div className="relative" ref={wrapperRef}>
        <button
          aria-controls={open ? `floating-action-menu-${action.id}` : undefined}
          aria-expanded={open}
          aria-label={action.ariaLabel}
          className={getFloatingPillClassName(variant)}
          data-developer-mode-context={developerModeContext}
          data-developer-mode-name="floating pill"
          data-developer-mode-priority="360"
          data-developer-mode-value={developerModeValue}
          data-floating-action-id={action.id}
          data-floating-action-item="true"
          data-floating-action-menu-trigger={action.id}
          data-floating-action-variant={variant}
          onClick={() => setOpen(value => !value)}
          ref={triggerRef}
          title={action.ariaLabel}
          type="button"
        >
          <span aria-hidden="true" className="flex items-center justify-center">
            {action.icon}
          </span>
          <span className="sr-only">{action.ariaLabel}</span>
        </button>
        {open && menuPosition && typeof document !== 'undefined'
          ? createPortal(
              <div
                className="fixed z-40"
                style={{
                  left: menuPosition.left,
                  top: menuPosition.top,
                  width: menuPosition.width,
                }}
              >
                <div
                  className="w-full overflow-y-auto rounded-2xl border border-secondary-200/80 bg-white/95 p-2 shadow-[0_18px_50px_-24px_rgba(15,23,42,0.5)] backdrop-blur-md dark:border-secondary-700/70 dark:bg-secondary-900/95"
                  data-developer-mode-context={
                    developerModeValue
                      ? `requirements table > floating pill: ${developerModeValue}`
                      : developerModeContext
                  }
                  data-developer-mode-name="floating pill menu"
                  data-developer-mode-priority="350"
                  data-developer-mode-value={developerModeValue}
                  data-floating-action-menu={action.id}
                  id={`floating-action-menu-${action.id}`}
                  ref={menuRef}
                  style={{ maxHeight: menuPosition.maxHeight }}
                >
                  <ul className="space-y-1">
                    {action.menuItems?.map(item => (
                      <li key={item.id}>
                        <Link
                          className="flex min-h-[44px] min-w-[44px] flex-col justify-center rounded-xl px-3 py-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white hover:bg-secondary-100/80 dark:hover:bg-secondary-800/70 dark:focus-visible:ring-offset-secondary-900"
                          href={item.href}
                          onClick={() => setOpen(false)}
                        >
                          <div className="text-sm font-medium text-secondary-900 dark:text-secondary-100">
                            {item.label}
                          </div>
                          {item.description ? (
                            <div className="mt-0.5 text-xs text-secondary-600 dark:text-secondary-400">
                              {item.description}
                            </div>
                          ) : null}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>,
              document.body,
            )
          : null}
      </div>
    )
  }

  if (action.href) {
    return (
      <Link
        aria-label={action.ariaLabel}
        className={getFloatingPillClassName(variant)}
        data-developer-mode-context={developerModeContext}
        data-developer-mode-name="floating pill"
        data-developer-mode-priority="360"
        data-developer-mode-value={developerModeValue}
        data-floating-action-id={action.id}
        data-floating-action-item="true"
        data-floating-action-variant={variant}
        href={action.href}
        onClick={action.onClick}
        title={action.ariaLabel}
      >
        <span aria-hidden="true" className="flex items-center justify-center">
          {action.icon}
        </span>
        <span className="sr-only">{action.ariaLabel}</span>
      </Link>
    )
  }

  return (
    <button
      aria-label={action.ariaLabel}
      className={getFloatingPillClassName(variant)}
      data-developer-mode-context={developerModeContext}
      data-developer-mode-name="floating pill"
      data-developer-mode-priority="360"
      data-developer-mode-value={developerModeValue}
      data-floating-action-id={action.id}
      data-floating-action-item="true"
      data-floating-action-variant={variant}
      onClick={action.onClick}
      title={action.ariaLabel}
      type="button"
    >
      <span aria-hidden="true" className="flex items-center justify-center">
        {action.icon}
      </span>
      <span className="sr-only">{action.ariaLabel}</span>
    </button>
  )
}

function areColumnWidthsEqual(
  left: RequirementColumnWidths,
  right: RequirementColumnWidths,
) {
  return getOrderedRequirementListColumns().every(
    column =>
      (left[column.id] ?? DEFAULT_REQUIREMENT_COLUMN_WIDTHS[column.id]) ===
      (right[column.id] ?? DEFAULT_REQUIREMENT_COLUMN_WIDTHS[column.id]),
  )
}

type ResizeHandleSegmentKey = 'bottom' | 'full' | 'top'
type ResizeHandleSegmentNode = HTMLButtonElement | HTMLDivElement
const MAX_EXPANDED_DETAIL_RESIZE_GRIP_HEIGHT = 48

interface ExpandedDetailBounds {
  bottom: number
  contentHeight: number
  top: number
}

function areExpandedDetailBoundsEqual(
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

const POPOVER_VIEWPORT_MARGIN = 8
const ROW_CLICK_INTERACTIVE_SELECTOR =
  'button, a, input, select, textarea, [contenteditable]:not([contenteditable="false"])'

function clampPopoverLeft(anchorLeft: number, popoverWidth: number) {
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

/* ── Filter popover for text search columns (uniqueId, description) ── */

function SearchFilterPopover({
  activeValue,
  label,
  onChange,
}: {
  activeValue: string
  label: string
  onChange: (v: string | undefined) => void
}) {
  const tc = useTranslations('common')
  const tt = useTranslations('requirementsTable')
  const [open, setOpen] = useState(false)
  const [local, setLocal] = useState(activeValue)
  const ref = useRef<HTMLDivElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  })
  const isActive = !!activeValue
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearPendingCommit = () => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }

  useEffect(() => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    setLocal(activeValue)
  }, [activeValue])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        ref.current &&
        !ref.current.contains(target) &&
        dropRef.current &&
        !dropRef.current.contains(target)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current)
        timer.current = null
      }
    },
    [],
  )

  const commit = (v: string) => {
    clearPendingCommit()
    timer.current = setTimeout(() => {
      timer.current = null
      onChange(v || undefined)
    }, 400)
  }

  return (
    <div className="relative inline-flex" ref={ref}>
      <button
        aria-label={tc('filterBy', { label })}
        className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded p-2 transition-colors ${isActive ? 'text-primary-500' : 'text-secondary-400 hover:text-secondary-600 dark:hover:text-secondary-300'}`}
        data-developer-mode-name={`filter button — ${label}`}
        data-developer-mode-priority="300"
        onClick={e => {
          e.stopPropagation()
          if (!open && btnRef.current) {
            const rect = btnRef.current.getBoundingClientRect()
            setPos({
              top: rect.bottom + 4,
              left: clampPopoverLeft(rect.left, 192),
            })
          }
          setOpen(v => !v)
        }}
        ref={btnRef}
        title={tc('filterBy', { label })}
        type="button"
      >
        <Filter className="h-3.5 w-3.5" />
      </button>
      {open &&
        createPortal(
          <div
            className="fixed z-50 bg-white dark:bg-secondary-800 border rounded-lg shadow-lg p-2 min-w-48"
            ref={dropRef}
            style={{ top: pos.top, left: pos.left }}
          >
            <div className="relative">
              <Search
                aria-hidden="true"
                className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-secondary-400"
              />
              <input
                aria-label={label}
                className="w-full pl-7 pr-7 py-1.5 text-xs rounded-lg border bg-white dark:bg-secondary-800/50 placeholder:text-secondary-400 focus:outline-none focus:ring-1 focus:ring-primary-400/50 focus:border-primary-500 transition-all"
                onChange={e => {
                  setLocal(e.target.value)
                  commit(e.target.value)
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    clearPendingCommit()
                    onChange(local || undefined)
                  }
                }}
                placeholder={`${label}...`}
                ref={inputRef}
                type="text"
                value={local}
              />
              {local && (
                <button
                  aria-label={tt('clear')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-secondary-400 hover:text-secondary-600"
                  onClick={() => {
                    setLocal('')
                    clearPendingCommit()
                    onChange(undefined)
                  }}
                  type="button"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}

/* ── Filter popover for multi-select columns ── */

function MultiSelectFilterPopover({
  activeCount,
  getLabel,
  label,
  onChange,
  options,
  value,
}: {
  activeCount: number
  getLabel: (opt: { id: number }) => string
  label: string
  onChange: (ids: number[]) => void
  options: { id: number }[]
  value: number[]
}) {
  const tc = useTranslations('common')
  const tt = useTranslations('requirementsTable')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; maxH: number }>({
    top: 0,
    left: 0,
    maxH: 300,
  })

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        ref.current &&
        !ref.current.contains(target) &&
        dropRef.current &&
        !dropRef.current.contains(target)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const openDropdown = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setPos({
        top: rect.bottom + 4,
        left: clampPopoverLeft(rect.left, 160),
        maxH: window.innerHeight - rect.bottom - 16,
      })
    }
    setOpen(v => !v)
  }

  const toggle = (id: number) => {
    const next = value.includes(id)
      ? value.filter(v => v !== id)
      : [...value, id]
    onChange(next)
  }

  return (
    <div className="relative inline-flex" ref={ref}>
      <button
        aria-label={tc('filterBy', { label })}
        className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded p-2 transition-colors ${activeCount > 0 ? 'text-primary-500' : 'text-secondary-400 hover:text-secondary-600 dark:hover:text-secondary-300'}`}
        data-developer-mode-name={`filter button — ${label}`}
        data-developer-mode-priority="300"
        onClick={openDropdown}
        ref={btnRef}
        title={tc('filterBy', { label })}
        type="button"
      >
        <span
          className="relative inline-flex h-3.5 w-3.5 items-center justify-center"
          data-filter-icon-anchor="true"
        >
          <Filter className="h-3.5 w-3.5" />
          {activeCount > 0 && (
            <span
              className="pointer-events-none absolute -right-1.5 -top-1.5 flex h-3 w-3 items-center justify-center rounded-full bg-primary-500 text-[8px] font-bold leading-none text-white"
              data-filter-count-badge="true"
            >
              {activeCount}
            </span>
          )}
        </span>
      </button>
      {open &&
        createPortal(
          <div
            className="fixed z-50 bg-white dark:bg-secondary-800 border rounded-lg shadow-lg py-1 min-w-40 overflow-y-auto"
            ref={dropRef}
            style={{ top: pos.top, left: pos.left, maxHeight: pos.maxH }}
          >
            {value.length > 0 && (
              <button
                className="min-h-[44px] w-full border-b px-2.5 py-1.5 pb-1.5 text-left text-xs text-secondary-500 hover:text-red-600 dark:hover:text-red-400"
                onClick={() => onChange([])}
                type="button"
              >
                <X aria-hidden="true" className="h-3 w-3 inline mr-1" />
                {tt('clear')}
              </button>
            )}
            {options.map(opt => (
              <label
                className="flex min-h-[44px] cursor-pointer items-center gap-2 px-2.5 py-1.5 text-xs hover:bg-secondary-50 dark:hover:bg-secondary-700/50"
                key={opt.id}
              >
                <input
                  checked={value.includes(opt.id)}
                  className="rounded border-secondary-300"
                  onChange={() => toggle(opt.id)}
                  type="checkbox"
                />
                <span className="truncate">{getLabel(opt)}</span>
              </label>
            ))}
          </div>,
          document.body,
        )}
    </div>
  )
}

/* ── Grouped multi-select popover (for typeCategory with parent grouping) ── */

function GroupedMultiSelectFilterPopover({
  activeCount,
  getLabel,
  label,
  onChange,
  options,
  value,
}: {
  activeCount: number
  getLabel: (opt: TypeCategoryOption) => string
  label: string
  onChange: (ids: number[]) => void
  options: TypeCategoryOption[]
  value: number[]
}) {
  const tc = useTranslations('common')
  const tt = useTranslations('requirementsTable')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; maxH: number }>({
    top: 0,
    left: 0,
    maxH: 300,
  })

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        ref.current &&
        !ref.current.contains(target) &&
        dropRef.current &&
        !dropRef.current.contains(target)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const openDropdown = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setPos({
        top: rect.bottom + 4,
        left: clampPopoverLeft(rect.left, 192),
        maxH: window.innerHeight - rect.bottom - 16,
      })
    }
    setOpen(v => !v)
  }

  const toggle = (id: number) => {
    const next = value.includes(id)
      ? value.filter(v => v !== id)
      : [...value, id]
    onChange(next)
  }

  const parents = options.filter(o => o.parentId === null)
  const childrenOf = (parentId: number) =>
    options.filter(o => o.parentId === parentId)

  return (
    <div className="relative inline-flex" ref={ref}>
      <button
        aria-label={tc('filterBy', { label })}
        className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded p-2 transition-colors ${activeCount > 0 ? 'text-primary-500' : 'text-secondary-400 hover:text-secondary-600 dark:hover:text-secondary-300'}`}
        data-developer-mode-name={`filter button — ${label}`}
        data-developer-mode-priority="300"
        onClick={openDropdown}
        ref={btnRef}
        title={tc('filterBy', { label })}
        type="button"
      >
        <span
          className="relative inline-flex h-3.5 w-3.5 items-center justify-center"
          data-filter-icon-anchor="true"
        >
          <Filter className="h-3.5 w-3.5" />
          {activeCount > 0 && (
            <span
              className="pointer-events-none absolute -right-1.5 -top-1.5 flex h-3 w-3 items-center justify-center rounded-full bg-primary-500 text-[8px] font-bold leading-none text-white"
              data-filter-count-badge="true"
            >
              {activeCount}
            </span>
          )}
        </span>
      </button>
      {open &&
        createPortal(
          <div
            className="fixed z-50 bg-white dark:bg-secondary-800 border rounded-lg shadow-lg py-1 min-w-48 overflow-y-auto"
            ref={dropRef}
            style={{ top: pos.top, left: pos.left, maxHeight: pos.maxH }}
          >
            {value.length > 0 && (
              <button
                className="min-h-[44px] w-full border-b px-2.5 py-1.5 pb-1.5 text-left text-xs text-secondary-500 hover:text-red-600 dark:hover:text-red-400"
                onClick={() => onChange([])}
                type="button"
              >
                <X aria-hidden="true" className="h-3 w-3 inline mr-1" />
                {tt('clear')}
              </button>
            )}
            {parents.map(parent => {
              const children = childrenOf(parent.id)
              return (
                <div key={parent.id}>
                  <div className="px-2.5 pt-2 pb-0.5 text-[11px] font-semibold text-secondary-400 dark:text-secondary-500 uppercase tracking-wide">
                    {getLabel(parent)}
                  </div>
                  {children.map(child => (
                    <label
                      className="flex min-h-[44px] cursor-pointer items-center gap-2 py-1.5 pl-5 pr-2.5 text-xs hover:bg-secondary-50 dark:hover:bg-secondary-700/50"
                      key={child.id}
                    >
                      <input
                        checked={value.includes(child.id)}
                        className="rounded border-secondary-300"
                        onChange={() => toggle(child.id)}
                        type="checkbox"
                      />
                      <span className="truncate">{getLabel(child)}</span>
                    </label>
                  ))}
                </div>
              )
            })}
          </div>,
          document.body,
        )}
    </div>
  )
}

function ColumnsPopover({
  actions = [],
  anchorRef,
  badgeLabel = null,
  columns,
  onReset,
  onToggle,
  visibleColumns,
}: {
  actions?: FloatingActionItem[]
  anchorRef?: RefObject<HTMLElement | null>
  badgeLabel?: string | null
  columns: {
    canHide: boolean
    id: RequirementColumnId
    label: string
  }[]
  onReset: () => void
  onToggle: (id: RequirementColumnId) => void
  visibleColumns: RequirementColumnId[]
}) {
  const tc = useTranslations('common')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; maxH: number }>({
    top: 0,
    left: 0,
    maxH: 300,
  })
  const [outsidePillPos, setOutsidePillPos] = useState<{
    left: number
    top: number
  } | null>(null)
  const actionsBeforeColumns = actions.filter(
    action => action.position === 'beforeColumns',
  )
  const actionsAfterColumns = actions.filter(
    action => action.position !== 'beforeColumns',
  )

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      const target = event.target as Node
      if (
        ref.current &&
        !ref.current.contains(target) &&
        dropRef.current &&
        !dropRef.current.contains(target)
      ) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (!anchorRef?.current) {
      setOutsidePillPos(null)
      return
    }

    const anchor = anchorRef.current

    const updatePosition = () => {
      const rect = anchor.getBoundingClientRect()
      const railWidth = 44
      const railMargin = 8
      const viewportWidth = Math.max(
        window.innerWidth,
        document.documentElement.clientWidth,
      )
      const maxLeft = viewportWidth - railWidth - railMargin
      setOutsidePillPos({
        left: Math.max(railMargin, Math.min(rect.right + 12, maxLeft)),
        top: rect.top + 12,
      })
    }

    updatePosition()

    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => updatePosition())

    resizeObserver?.observe(anchor)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)

    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [anchorRef])

  const trigger = (
    <button
      aria-label={tc('columns')}
      className={getFloatingPillClassName()}
      data-developer-mode-context="requirements table"
      data-developer-mode-name="floating pill"
      data-developer-mode-priority="360"
      data-developer-mode-value="columns"
      data-column-picker-shell="true"
      data-column-picker-trigger="true"
      data-floating-action-id="columns"
      data-floating-action-item="true"
      data-floating-action-variant="default"
      onClick={() => {
        if (!open && btnRef.current) {
          const rect = btnRef.current.getBoundingClientRect()
          const popoverWidth = 224
          const minLeft = 8
          const maxLeft =
            typeof window === 'undefined'
              ? rect.right - popoverWidth
              : Math.max(minLeft, window.innerWidth - popoverWidth - 8)
          setPos({
            top: rect.bottom + 8,
            left: Math.min(
              Math.max(rect.right - popoverWidth, minLeft),
              maxLeft,
            ),
            maxH: Math.max(window.innerHeight - rect.bottom - 16, 44),
          })
        }
        setOpen(value => !value)
      }}
      ref={btnRef}
      title={tc('columns')}
      type="button"
    >
      <span className="sr-only">{tc('columns')}</span>
      <Columns3
        aria-hidden="true"
        className="h-4 w-4"
        data-column-picker-icon="true"
      />
      {badgeLabel ? (
        <span
          aria-hidden="true"
          className="absolute -right-1 -top-2 flex h-4 min-w-8 items-center justify-center rounded-full bg-primary-600 px-1.5 text-[9px] font-semibold leading-none text-white shadow-sm"
          data-column-picker-badge="true"
        >
          {badgeLabel}
        </span>
      ) : null}
    </button>
  )

  return (
    <>
      {outsidePillPos
        ? createPortal(
            <div
              className="pointer-events-none fixed z-30"
              style={{ left: outsidePillPos.left, top: outsidePillPos.top }}
            >
              <div
                className="pointer-events-auto flex flex-col gap-3"
                data-developer-mode-context="requirements table"
                data-developer-mode-name="floating action rail"
                data-developer-mode-priority="340"
                data-floating-action-rail="true"
              >
                {actionsBeforeColumns.map(action => (
                  <FloatingActionPill action={action} key={action.id} />
                ))}
                <div
                  className="relative inline-flex"
                  data-column-picker-wrapper="true"
                  ref={ref}
                >
                  {trigger}
                </div>
                {actionsAfterColumns.map(action => (
                  <FloatingActionPill action={action} key={action.id} />
                ))}
              </div>
            </div>,
            document.body,
          )
        : null}
      {open &&
        createPortal(
          <div
            className="fixed z-50 min-w-56 overflow-y-auto rounded-xl border bg-white p-2 shadow-lg dark:bg-secondary-800"
            data-developer-mode-context="requirements table"
            data-developer-mode-name="column picker"
            data-developer-mode-priority="350"
            data-developer-mode-value="columns"
            data-column-picker-popover="true"
            ref={dropRef}
            style={{
              left: Math.max(pos.left, 8),
              maxHeight: pos.maxH,
              top: pos.top,
            }}
          >
            <div className="mb-1 border-b pb-1">
              <button
                className="min-h-[44px] min-w-[44px] w-full rounded-lg px-2 py-1.5 text-left text-xs font-medium text-secondary-500 transition-colors hover:bg-secondary-50 hover:text-secondary-700 dark:hover:bg-secondary-700/50 dark:hover:text-secondary-200"
                onClick={() => {
                  onReset()
                  setOpen(false)
                }}
                type="button"
              >
                {tc('resetToDefault')}
              </button>
            </div>
            <div className="space-y-0.5">
              {columns.map(column => (
                <label
                  className={`flex min-h-[44px] min-w-[44px] w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-secondary-50 dark:hover:bg-secondary-700/50 ${
                    !column.canHide ? 'cursor-not-allowed opacity-60' : ''
                  }`}
                  key={column.id}
                >
                  <input
                    checked={visibleColumns.includes(column.id)}
                    disabled={!column.canHide}
                    onChange={() => onToggle(column.id)}
                    type="checkbox"
                  />
                  <span>{column.label}</span>
                </label>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

/* ── Small chip for showing active search text under column ── */

function SearchChip({
  developerModeContext,
  label,
  onRemove,
}: {
  developerModeContext: string
  label: string
  onRemove: () => void
}) {
  const tt = useTranslations('requirementsTable')

  return (
    <span
      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] leading-tight rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 max-w-full"
      data-developer-mode-context={developerModeContext}
      data-developer-mode-name="header chip"
      data-developer-mode-priority="370"
      data-developer-mode-value={label}
    >
      <span className="truncate">{label}</span>
      <button
        aria-label={tt('removeItem', { label })}
        className="shrink-0 hover:text-red-600 dark:hover:text-red-400"
        onClick={e => {
          e.stopPropagation()
          onRemove()
        }}
        type="button"
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </span>
  )
}

/* ── Small chip for multi-select values under column ── */

function FilterChips({
  developerModeContext,
  getLabel,
  onRemove,
  values,
}: {
  developerModeContext: string
  getLabel: (id: number) => string
  onRemove: (id: number) => void
  values: number[]
}) {
  const tt = useTranslations('requirementsTable')

  if (values.length === 0) return null
  return (
    <div className="flex flex-wrap gap-0.5 mt-1">
      {values.map(id => (
        <span
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] leading-tight rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 max-w-full"
          data-developer-mode-context={developerModeContext}
          data-developer-mode-name="header chip"
          data-developer-mode-priority="370"
          data-developer-mode-value={getLabel(id)}
          key={id}
        >
          <span className="truncate">{getLabel(id)}</span>
          <button
            aria-label={tt('removeItem', { label: getLabel(id) })}
            className="shrink-0 hover:text-red-600 dark:hover:text-red-400"
            onClick={e => {
              e.stopPropagation()
              onRemove(id)
            }}
            type="button"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}
    </div>
  )
}

export default function RequirementsTable({
  areas = [],
  categories = [],
  columnDefaults,
  columnWidths = {},
  expandedId,
  filterValues,
  floatingActions = [],
  getName = () => '',
  getStatusName = () => '',
  hasMore = false,
  loading = false,
  loadingMore = false,
  locale,
  onFilterChange,
  onLoadMore,
  onRowClick,
  onColumnWidthsChange,
  onSortChange,
  onVisibleColumnsChange,
  pinnedIds,
  renderExpanded,
  rows,
  sortState = DEFAULT_REQUIREMENT_SORT,
  statusOptions = [],
  typeCategories = [],
  types = [],
  visibleColumns = getDefaultVisibleRequirementColumns(columnDefaults),
}: RequirementsTableProps) {
  const t = useTranslations('requirement')
  const tc = useTranslations('common')
  const router = useRouter()
  const normalizedColumnDefaults =
    normalizeRequirementListColumnDefaults(columnDefaults)
  const allColumns = getOrderedRequirementListColumns(normalizedColumnDefaults)

  const fv = filterValues ?? {}
  const latestFilterValuesRef = useRef(fv)
  const hasFilters = !!onFilterChange
  const visibleColumnSet = new Set([
    ...visibleColumns,
    'uniqueId',
    'description',
  ])
  latestFilterValuesRef.current = fv
  const columnPickerBadgeLabel =
    visibleColumnSet.size > 0
      ? `${visibleColumnSet.size}/${allColumns.length}`
      : null
  const columnDefinitions = allColumns.filter(column =>
    visibleColumnSet.has(column.id),
  )
  const configuredColumnWidths = Object.fromEntries(
    columnDefinitions.map(column => [
      column.id,
      getRequirementColumnWidth(column.id, columnWidths),
    ]),
  ) as Record<RequirementColumnId, number>
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const tableContentRef = useRef<HTMLDivElement>(null)
  const tableRef = useRef<HTMLTableElement>(null)
  const expandedDetailCellRef = useRef<HTMLTableCellElement>(null)
  const colRefs = useRef<
    Partial<Record<RequirementColumnId, HTMLTableColElement | null>>
  >({})
  const headerCellRefs = useRef<
    Partial<Record<RequirementColumnId, HTMLTableCellElement | null>>
  >({})
  const resizeHandleRefs = useRef<
    Partial<
      Record<
        RequirementColumnId,
        Partial<Record<ResizeHandleSegmentKey, ResizeHandleSegmentNode | null>>
      >
    >
  >({})
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
  const [scrollContainerWidth, setScrollContainerWidth] = useState(0)
  const hasManualColumnWidths = columnDefinitions.some(
    column => typeof columnWidths[column.id] === 'number',
  )
  const renderedColumnWidths = {
    ...configuredColumnWidths,
  } as Record<RequirementColumnId, number>
  if (!hasManualColumnWidths) {
    const growColumnIds = columnDefinitions
      .filter(column => column.grows)
      .map(column => column.id)
    const configuredTableWidth = columnDefinitions.reduce(
      (total, column) => total + configuredColumnWidths[column.id],
      0,
    )
    const availableExtraWidth =
      growColumnIds.length > 0
        ? Math.max(0, scrollContainerWidth - configuredTableWidth)
        : 0

    if (availableExtraWidth > 0) {
      const evenShare = Math.floor(availableExtraWidth / growColumnIds.length)
      const remainder = availableExtraWidth - evenShare * growColumnIds.length

      for (const [index, columnId] of growColumnIds.entries()) {
        renderedColumnWidths[columnId] +=
          evenShare + (index === 0 ? remainder : 0)
      }
    }
  }

  const tableWidth = columnDefinitions.reduce(
    (total, column) => total + renderedColumnWidths[column.id],
    0,
  )
  const scrollLayoutSignature = columnDefinitions
    .map(column => `${column.id}:${renderedColumnWidths[column.id]}`)
    .concat(String(scrollContainerWidth))
    .join('|')
  const resizeStateRef = useRef<{
    columnId: RequirementColumnId
    handle: HTMLElement | null
    pointerId: number
    startWidth: number
    startX: number
    visibleWidths: Record<RequirementColumnId, number>
  } | null>(null)
  const [resizeHandleOffsets, setResizeHandleOffsets] = useState<
    {
      columnId: RequirementColumnId
      left: number
    }[]
  >([])
  const [expandedDetailBounds, setExpandedDetailBounds] =
    useState<ExpandedDetailBounds | null>(null)
  const [scrollFadeState, setScrollFadeState] = useState({
    left: false,
    right: false,
  })
  const canResizeColumns = !!onColumnWidthsChange
  const hasExpandedDetailRow =
    expandedId !== null &&
    expandedId !== undefined &&
    !!renderExpanded &&
    rows.some(row => row.id === expandedId)
  const clippedResizeHandleBounds = hasExpandedDetailRow
    ? expandedDetailBounds
    : null
  const shouldRenderResizeHandles =
    canResizeColumns && (!hasExpandedDetailRow || clippedResizeHandleBounds)

  const updateFilter = (patch: Partial<FilterValues>) => {
    if (!onFilterChange) {
      return
    }

    const nextFilterValues = {
      ...latestFilterValuesRef.current,
      ...patch,
    }
    latestFilterValuesRef.current = nextFilterValues
    onFilterChange(nextFilterValues)
  }

  const areaLabel = (id: number) =>
    areas.find(a => a.id === id)?.name ?? String(id)
  const catLabel = (id: number) => {
    const c = categories.find(c => c.id === id)
    return c ? getName(c) : String(id)
  }
  const typeLabel = (id: number) => {
    const t = types.find(t => t.id === id)
    return t ? getName(t) : String(id)
  }
  const typeCatLabel = (id: number) => {
    const tc = typeCategories.find(tc => tc.id === id)
    return tc ? getName(tc) : String(id)
  }
  const statusLabel = (id: number) => {
    const s = statusOptions.find(s => s.id === id)
    return s ? getStatusName(s) : String(id)
  }

  const requiresTestingOptions = [
    { id: 1, label: tc('yes') },
    { id: 0, label: tc('no') },
  ]
  const rtValue = (fv.requiresTesting ?? []).map(v => (v === 'true' ? 1 : 0))
  const setRt = (ids: number[]) => {
    const values = ids.map(id => (id === 1 ? 'true' : 'false'))
    updateFilter({ requiresTesting: values.length > 0 ? values : undefined })
  }
  const handleRowAction = useCallback(
    (id: number) => {
      if (onRowClick) {
        onRowClick(id)
        return
      }

      router.push(`/kravkatalog/${id}`)
    },
    [onRowClick, router],
  )
  const handleBodyRowClick = useCallback(
    (event: ReactMouseEvent<HTMLTableRowElement>, id: number) => {
      if (event.defaultPrevented) {
        return
      }

      if (
        event.target instanceof Element &&
        event.target.closest(ROW_CLICK_INTERACTIVE_SELECTOR)
      ) {
        return
      }

      handleRowAction(id)
    },
    [handleRowAction],
  )

  const getColumnLabel = (columnId: RequirementColumnId) => {
    const column = allColumns.find(item => item.id === columnId)
    if (!column) {
      return columnId
    }

    return column.labelNamespace === 'common'
      ? tc(column.labelKey)
      : t(column.labelKey)
  }

  const getColumnDeveloperModeContext = (columnId: RequirementColumnId) =>
    `requirements table > column header: ${getRequirementColumnDeveloperModeLabel(columnId)}`

  const getSortIcon = (columnId: RequirementSortField) => {
    if (sortState.by !== columnId) {
      return (
        <ArrowUpDown
          aria-hidden="true"
          className="h-3.5 w-3.5 shrink-0 text-secondary-400 transition-colors group-hover:text-secondary-600 dark:group-hover:text-secondary-300"
        />
      )
    }

    return sortState.direction === 'asc' ? (
      <ArrowUp
        aria-hidden="true"
        className="h-3.5 w-3.5 shrink-0 text-primary-600 dark:text-primary-400"
      />
    ) : (
      <ArrowDown
        aria-hidden="true"
        className="h-3.5 w-3.5 shrink-0 text-primary-600 dark:text-primary-400"
      />
    )
  }

  const getSortTooltip = (label: string, isActiveSort: boolean) => {
    if (!isActiveSort) {
      return tc('sortBy', { label })
    }

    const currentOrderKey =
      sortState.direction === 'asc' ? 'ascending' : 'descending'
    const nextOrderKey =
      sortState.direction === 'asc' ? 'descending' : 'ascending'

    return tc('sortDirectionTooltip', {
      current: tc(currentOrderKey),
      label,
      next: tc(nextOrderKey),
    })
  }

  const handleSortToggle = (columnId: RequirementSortField) => {
    if (!onSortChange) {
      return
    }

    if (sortState.by === columnId) {
      onSortChange({
        by: columnId,
        direction: sortState.direction === 'asc' ? 'desc' : 'asc',
      })
      return
    }

    onSortChange({ by: columnId, direction: 'asc' })
  }

  useEffect(() => {
    columnWidthsRef.current = columnWidths
  }, [columnWidths])

  useEffect(() => {
    onColumnWidthsChangeRef.current = onColumnWidthsChange
  }, [onColumnWidthsChange])

  useEffect(() => {
    visibleColumnIdsRef.current = columnDefinitions.map(column => column.id)
  }, [columnDefinitions])

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

  const syncResizeHandlePositions = useCallback(
    (visibleWidths: Record<RequirementColumnId, number>) => {
      let left = 0

      for (const [columnIndex, column] of columnDefinitions.entries()) {
        left += visibleWidths[column.id] ?? renderedColumnWidths[column.id]
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
    [columnDefinitions, renderedColumnWidths],
  )

  const applyVisibleWidthPreview = useCallback(
    (visibleWidths: Record<RequirementColumnId, number>) => {
      const tableContent = tableContentRef.current
      if (tableContent) {
        const nextTableWidth = columnDefinitions.reduce(
          (total, column) =>
            total +
            (visibleWidths[column.id] ?? renderedColumnWidths[column.id]),
          0,
        )
        tableContent.style.width = `${nextTableWidth}px`
      }

      for (const column of columnDefinitions) {
        const width =
          visibleWidths[column.id] ?? renderedColumnWidths[column.id]
        const col = colRefs.current[column.id]
        if (col) {
          col.style.width = `${width}px`
        }
      }

      syncResizeHandlePositions(visibleWidths)
    },
    [columnDefinitions, renderedColumnWidths, syncResizeHandlePositions],
  )

  const cancelResizePreviewFrame = useCallback(() => {
    if (
      resizePreviewFrameRef.current !== null &&
      typeof globalThis.cancelAnimationFrame === 'function'
    ) {
      globalThis.cancelAnimationFrame(resizePreviewFrameRef.current)
    }

    resizePreviewFrameRef.current = null
  }, [])

  const flushResizePreview = useCallback(() => {
    const nextVisibleWidths = pendingResizePreviewVisibleWidthsRef.current
    if (!nextVisibleWidths) {
      return
    }

    pendingResizePreviewVisibleWidthsRef.current = null
    resizePreviewVisibleWidthsRef.current = nextVisibleWidths
    applyVisibleWidthPreview(nextVisibleWidths)
  }, [applyVisibleWidthPreview])

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
    [flushResizePreview],
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

    for (const column of columnDefinitions) {
      const cell = headerCellRefs.current[column.id]
      const measuredWidth = Math.round(
        cell?.getBoundingClientRect().width ?? cell?.offsetWidth ?? 0,
      )

      snapshot[column.id] = clampRequirementColumnWidth(
        column.id,
        measuredWidth > 0 ? measuredWidth : renderedColumnWidths[column.id],
      )
    }

    return snapshot
  }, [columnDefinitions, renderedColumnWidths])

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
  }, [])

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
        const cell = headerCellRefs.current[column.id]

        if (!cell || columnIndex === columnDefinitions.length - 1) {
          return null
        }

        return {
          columnId: column.id,
          left: Math.round(cell.offsetLeft + cell.offsetWidth),
        }
      })
      .filter(
        (
          value,
        ): value is {
          columnId: RequirementColumnId
          left: number
        } => value !== null,
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
  }, [canResizeColumns, columnDefinitions])

  const updateExpandedDetailBounds = useCallback(() => {
    if (!canResizeColumns || !hasExpandedDetailRow) {
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
    const top = Math.min(
      contentHeight,
      Math.max(0, Math.round(cellRect.top - tableContentRect.top)),
    )
    const nextBounds = {
      bottom: Math.min(
        contentHeight,
        Math.max(top, Math.round(cellRect.bottom - tableContentRect.top)),
      ),
      contentHeight,
      top,
    }

    setExpandedDetailBounds(previous =>
      areExpandedDetailBoundsEqual(previous, nextBounds)
        ? previous
        : nextBounds,
    )
  }, [canResizeColumns, hasExpandedDetailRow])

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

  useEffect(() => {
    const container = scrollContainerRef.current

    if (!container) {
      return
    }

    updateScrollFades()
    updateResizeHandleOffsets()
    updateExpandedDetailBounds()

    const handleScroll = () => updateScrollFades()
    container.addEventListener('scroll', handleScroll, { passive: true })

    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            updateScrollFades()
            updateResizeHandleOffsets()
            updateExpandedDetailBounds()
          })

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
  }, [updateExpandedDetailBounds, updateResizeHandleOffsets, updateScrollFades])

  useEffect(() => {
    void scrollLayoutSignature
    updateScrollFades()
    updateResizeHandleOffsets()
    updateExpandedDetailBounds()
  }, [
    scrollLayoutSignature,
    updateExpandedDetailBounds,
    updateResizeHandleOffsets,
    updateScrollFades,
  ])

  const handleResizePointerDown = (
    columnId: RequirementColumnId,
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    if (!canResizeColumns) {
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
  }

  const handleResizeKeyDown = (
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
  }

  const applyVisibleColumns = (nextVisibleColumns: RequirementColumnId[]) => {
    if (!onVisibleColumnsChange) {
      return
    }

    const normalizedColumns = allColumns
      .filter(
        column =>
          nextVisibleColumns.includes(column.id) ||
          column.id === 'uniqueId' ||
          column.id === 'description',
      )
      .map(column => column.id)
    const orderedColumns = orderRequirementVisibleColumns(normalizedColumns, {
      columnDefaults: normalizedColumnDefaults,
    })
    const hiddenColumns = columnDefinitions
      .map(column => column.id)
      .filter(columnId => !orderedColumns.includes(columnId))
    const nextFilterValues = clearRequirementFiltersForHiddenColumns(
      fv,
      orderedColumns,
      { columnDefaults: normalizedColumnDefaults },
    )

    onVisibleColumnsChange(orderedColumns)

    if (nextFilterValues !== fv && onFilterChange) {
      onFilterChange(nextFilterValues)
    }
    if (
      hiddenColumns.includes(sortState.by) &&
      onSortChange &&
      sortState.by !== DEFAULT_REQUIREMENT_SORT.by
    ) {
      onSortChange(DEFAULT_REQUIREMENT_SORT)
    }
  }

  useEffect(() => {
    const orderedColumns = orderRequirementVisibleColumns(visibleColumns, {
      columnDefaults: normalizedColumnDefaults,
    })
    const hiddenColumns = allColumns
      .map(column => column.id)
      .filter(columnId => !orderedColumns.includes(columnId))
    const nextFilterValues = clearRequirementFiltersForHiddenColumns(
      fv,
      orderedColumns,
      { columnDefaults: normalizedColumnDefaults },
    )

    if (nextFilterValues !== fv && onFilterChange) {
      onFilterChange(nextFilterValues)
    }

    if (
      hiddenColumns.includes(sortState.by) &&
      onSortChange &&
      sortState.by !== DEFAULT_REQUIREMENT_SORT.by
    ) {
      onSortChange(DEFAULT_REQUIREMENT_SORT)
    }
  }, [
    allColumns,
    fv,
    normalizedColumnDefaults,
    onFilterChange,
    onSortChange,
    sortState.by,
    visibleColumns,
  ])

  const toggleColumn = (columnId: RequirementColumnId) => {
    const column = allColumns.find(item => item.id === columnId)
    if (!column?.canHide) {
      return
    }

    if (visibleColumnSet.has(columnId)) {
      applyVisibleColumns(visibleColumns.filter(value => value !== columnId))
      return
    }

    applyVisibleColumns([...visibleColumns, columnId])
  }

  const renderFilterControl = (columnId: RequirementColumnId) => {
    if (!hasFilters) {
      return null
    }

    switch (columnId) {
      case 'uniqueId':
        return (
          <SearchFilterPopover
            activeValue={fv.uniqueIdSearch ?? ''}
            label={t('uniqueId')}
            onChange={value => updateFilter({ uniqueIdSearch: value })}
          />
        )
      case 'description':
        return (
          <SearchFilterPopover
            activeValue={fv.descriptionSearch ?? ''}
            label={t('description')}
            onChange={value => updateFilter({ descriptionSearch: value })}
          />
        )
      case 'area':
        return (
          <MultiSelectFilterPopover
            activeCount={(fv.areaIds ?? []).length}
            getLabel={option => areaLabel(option.id)}
            label={t('area')}
            onChange={ids =>
              updateFilter({ areaIds: ids.length > 0 ? ids : undefined })
            }
            options={areas}
            value={fv.areaIds ?? []}
          />
        )
      case 'category':
        return (
          <MultiSelectFilterPopover
            activeCount={(fv.categoryIds ?? []).length}
            getLabel={option => catLabel(option.id)}
            label={t('category')}
            onChange={ids =>
              updateFilter({ categoryIds: ids.length > 0 ? ids : undefined })
            }
            options={categories}
            value={fv.categoryIds ?? []}
          />
        )
      case 'type':
        return (
          <MultiSelectFilterPopover
            activeCount={(fv.typeIds ?? []).length}
            getLabel={option => typeLabel(option.id)}
            label={t('type')}
            onChange={ids =>
              updateFilter({ typeIds: ids.length > 0 ? ids : undefined })
            }
            options={types}
            value={fv.typeIds ?? []}
          />
        )
      case 'typeCategory':
        return (
          <GroupedMultiSelectFilterPopover
            activeCount={(fv.typeCategoryIds ?? []).length}
            getLabel={option => typeCatLabel(option.id)}
            label={t('typeCategory')}
            onChange={ids =>
              updateFilter({
                typeCategoryIds: ids.length > 0 ? ids : undefined,
              })
            }
            options={typeCategories}
            value={fv.typeCategoryIds ?? []}
          />
        )
      case 'status':
        return (
          <MultiSelectFilterPopover
            activeCount={(fv.statuses ?? []).length}
            getLabel={option => statusLabel(option.id)}
            label={t('status')}
            onChange={ids =>
              updateFilter({ statuses: ids.length > 0 ? ids : undefined })
            }
            options={statusOptions}
            value={fv.statuses ?? []}
          />
        )
      case 'requiresTesting':
        return (
          <MultiSelectFilterPopover
            activeCount={rtValue.length}
            getLabel={option =>
              requiresTestingOptions.find(item => item.id === option.id)
                ?.label ?? ''
            }
            label={t('requiresTesting')}
            onChange={setRt}
            options={requiresTestingOptions}
            value={rtValue}
          />
        )
      case 'version':
        return null
    }
  }

  const renderFilterChips = (columnId: RequirementColumnId) => {
    const developerModeContext = getColumnDeveloperModeContext(columnId)

    switch (columnId) {
      case 'uniqueId':
        return fv.uniqueIdSearch ? (
          <SearchChip
            developerModeContext={developerModeContext}
            label={fv.uniqueIdSearch}
            onRemove={() => updateFilter({ uniqueIdSearch: undefined })}
          />
        ) : null
      case 'description':
        return fv.descriptionSearch ? (
          <SearchChip
            developerModeContext={developerModeContext}
            label={fv.descriptionSearch}
            onRemove={() => updateFilter({ descriptionSearch: undefined })}
          />
        ) : null
      case 'area':
        return (
          <FilterChips
            developerModeContext={developerModeContext}
            getLabel={areaLabel}
            onRemove={id =>
              updateFilter({
                areaIds: (fv.areaIds ?? []).filter(value => value !== id),
              })
            }
            values={fv.areaIds ?? []}
          />
        )
      case 'category':
        return (
          <FilterChips
            developerModeContext={developerModeContext}
            getLabel={catLabel}
            onRemove={id =>
              updateFilter({
                categoryIds: (fv.categoryIds ?? []).filter(
                  value => value !== id,
                ),
              })
            }
            values={fv.categoryIds ?? []}
          />
        )
      case 'type':
        return (
          <FilterChips
            developerModeContext={developerModeContext}
            getLabel={typeLabel}
            onRemove={id =>
              updateFilter({
                typeIds: (fv.typeIds ?? []).filter(value => value !== id),
              })
            }
            values={fv.typeIds ?? []}
          />
        )
      case 'typeCategory':
        return (
          <FilterChips
            developerModeContext={developerModeContext}
            getLabel={typeCatLabel}
            onRemove={id =>
              updateFilter({
                typeCategoryIds: (fv.typeCategoryIds ?? []).filter(
                  value => value !== id,
                ),
              })
            }
            values={fv.typeCategoryIds ?? []}
          />
        )
      case 'status':
        return (
          <FilterChips
            developerModeContext={developerModeContext}
            getLabel={statusLabel}
            onRemove={id =>
              updateFilter({
                statuses: (fv.statuses ?? []).filter(value => value !== id),
              })
            }
            values={fv.statuses ?? []}
          />
        )
      case 'requiresTesting':
        return (
          <FilterChips
            developerModeContext={developerModeContext}
            getLabel={id =>
              requiresTestingOptions.find(option => option.id === id)?.label ??
              ''
            }
            onRemove={id => setRt(rtValue.filter(value => value !== id))}
            values={rtValue}
          />
        )
      case 'version':
        return null
    }
  }

  const renderCell = (
    row: RequirementRow,
    columnId: RequirementColumnId,
    isLastColumn: boolean,
  ) => {
    const archivedContentClass = row.isArchived ? 'opacity-50' : ''
    const dividerClass = isLastColumn
      ? ''
      : 'border-r border-secondary-200/5 dark:border-secondary-700/5'
    const isExpanded = row.id === expandedId
    const expandedDetailCellId = `requirement-row-detail-${row.id}`

    switch (columnId) {
      case 'uniqueId':
        return (
          <td
            className={`font-mono font-medium text-primary-700 dark:text-primary-300 whitespace-nowrap ${archivedContentClass} ${dividerClass}`}
          >
            <button
              aria-controls={renderExpanded ? expandedDetailCellId : undefined}
              aria-expanded={renderExpanded ? isExpanded : undefined}
              className="inline-flex min-h-[44px] min-w-[44px] w-full items-center gap-1.5 rounded border-0 bg-transparent px-2 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-secondary-950"
              onClick={event => {
                event.stopPropagation()
                handleRowAction(row.id)
              }}
              type="button"
            >
              {renderExpanded ? (
                isExpanded ? (
                  <ChevronDown
                    aria-hidden="true"
                    className="h-3.5 w-3.5 text-secondary-500"
                  />
                ) : (
                  <ChevronRight
                    aria-hidden="true"
                    className="h-3.5 w-3.5 text-secondary-400"
                  />
                )
              ) : null}
              {row.uniqueId}
            </button>
          </td>
        )
      case 'description':
        return (
          <td
            className={`py-2 px-2 truncate ${archivedContentClass} ${dividerClass}`}
          >
            {row.version?.description ?? '—'}
          </td>
        )
      case 'area':
        return (
          <td
            className={`py-2 px-2 truncate ${archivedContentClass} ${dividerClass}`}
          >
            {row.area?.name ?? '—'}
          </td>
        )
      case 'category':
        return (
          <td
            className={`py-2 px-2 truncate ${archivedContentClass} ${dividerClass}`}
          >
            {(locale === 'sv'
              ? row.version?.categoryNameSv
              : row.version?.categoryNameEn) ?? '—'}
          </td>
        )
      case 'type':
        return (
          <td
            className={`py-2 px-2 truncate ${archivedContentClass} ${dividerClass}`}
          >
            {(locale === 'sv'
              ? row.version?.typeNameSv
              : row.version?.typeNameEn) ?? '—'}
          </td>
        )
      case 'typeCategory':
        return (
          <td
            className={`py-2 px-2 truncate ${archivedContentClass} ${dividerClass}`}
          >
            {(locale === 'sv'
              ? row.version?.typeCategoryNameSv
              : row.version?.typeCategoryNameEn) ?? '—'}
          </td>
        )
      case 'status':
        return (
          <td className={`py-2 px-2 ${dividerClass}`}>
            <span className="inline-flex items-center gap-1">
              {row.version ? (
                <span className={archivedContentClass}>
                  <StatusBadge
                    color={row.version.statusColor}
                    label={
                      (locale === 'sv'
                        ? row.version.statusNameSv
                        : row.version.statusNameEn) ?? '—'
                    }
                  />
                </span>
              ) : (
                '—'
              )}
              {row.hasPendingVersion && (
                <span
                  title={t(
                    row.pendingVersionStatusId === 1
                      ? 'hasPendingVersionDraft'
                      : 'hasPendingVersionReview',
                  )}
                >
                  <AlertCircle
                    aria-label={t(
                      row.pendingVersionStatusId === 1
                        ? 'hasPendingVersionDraft'
                        : 'hasPendingVersionReview',
                    )}
                    className="h-3.5 w-3.5"
                    style={{
                      color: row.pendingVersionStatusColor ?? undefined,
                    }}
                  />
                </span>
              )}
            </span>
          </td>
        )
      case 'requiresTesting':
        return (
          <td
            className={`py-2 px-2 text-center ${archivedContentClass} ${dividerClass}`}
          >
            {row.version?.requiresTesting && (
              <TestTube2
                aria-label={t('requiresTesting')}
                className="inline h-4 w-4 text-primary-700 dark:text-primary-300"
              />
            )}
          </td>
        )
      case 'version':
        return (
          <td
            className={`py-2 px-2 text-center text-secondary-600 dark:text-secondary-400 ${archivedContentClass} ${dividerClass}`}
          >
            v{row.version?.versionNumber ?? 1}
          </td>
        )
    }
  }

  const [showSpinner, setShowSpinner] = useState(false)
  useEffect(() => {
    if (!loading) {
      setShowSpinner(false)
      return
    }
    const timer = setTimeout(() => setShowSpinner(true), 1000)
    return () => clearTimeout(timer)
  }, [loading])
  const shouldShowEmptyState = rows.length === 0 && !loading

  // Infinite-scroll sentinel
  const sentinelRef = useRef<HTMLDivElement>(null)
  const stableLoadMore = useCallback(() => {
    onLoadMore?.()
  }, [onLoadMore])

  useEffect(() => {
    if (!hasMore || !onLoadMore) return
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting) stableLoadMore()
      },
      { rootMargin: '200px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore, onLoadMore, stableLoadMore])

  const thBase =
    'relative py-2 px-2 font-medium text-secondary-700 dark:text-secondary-300 align-top'
  const resizeHandleBaseClassName =
    'group pointer-events-auto absolute left-0 z-20 m-0 min-w-[44px] -translate-x-1/2 cursor-ew-resize touch-none border-0 bg-transparent p-0 before:absolute before:bottom-0 before:left-1/2 before:top-0 before:w-px before:-translate-x-1/2 before:rounded-full before:bg-secondary-300/18 before:transition-colors dark:before:bg-secondary-600/25'
  const interactiveResizeHandleClassName = `${resizeHandleBaseClassName} focus-visible:outline-none hover:before:bg-primary-400 focus-visible:before:bg-primary-400 dark:hover:before:bg-primary-400 dark:focus-visible:before:bg-primary-400`
  const fullResizeHandleClassName = `${interactiveResizeHandleClassName} min-h-[44px]`
  const pointerResizeSegmentClassName = `${resizeHandleBaseClassName} min-h-0 hover:before:bg-primary-400 dark:hover:before:bg-primary-400`
  const resetColumnsView = () => {
    cancelResizePreviewFrame()
    pendingResizePreviewVisibleWidthsRef.current = null
    resizePreviewVisibleWidthsRef.current = null
    applyVisibleColumns(
      getDefaultVisibleRequirementColumns(normalizedColumnDefaults),
    )
    onColumnWidthsChange?.({})
  }
  const columnsPopover = (
    <ColumnsPopover
      actions={floatingActions}
      anchorRef={scrollContainerRef}
      badgeLabel={columnPickerBadgeLabel}
      columns={allColumns.map(column => ({
        canHide: column.canHide,
        id: column.id,
        label: getColumnLabel(column.id),
      }))}
      onReset={resetColumnsView}
      onToggle={toggleColumn}
      visibleColumns={columnDefinitions.map(column => column.id)}
    />
  )

  const renderResizeHandle = (
    columnId: RequirementColumnId,
    left: number,
    label: string,
  ) => {
    const assignResizeHandleRef = (
      segment: ResizeHandleSegmentKey,
      node: ResizeHandleSegmentNode | null,
    ) => {
      const nextRefs = resizeHandleRefs.current[columnId] ?? {}
      nextRefs[segment] = node
      resizeHandleRefs.current[columnId] = nextRefs
    }
    const interactiveProps = {
      'aria-label': tc('resizeColumn', { label }),
      className: interactiveResizeHandleClassName,
      'data-column-resize-handle': columnId,
      'data-developer-mode-name': `resize handle — ${label}`,
      'data-developer-mode-priority': '300',
      onBlur: () => setResizeHoverCursor(false),
      onDoubleClick: (event: ReactMouseEvent<HTMLButtonElement>) => {
        event.preventDefault()
        event.stopPropagation()
        resetColumnWidth(columnId)
      },
      onFocus: () => setResizeHoverCursor(true),
      onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) =>
        handleResizeKeyDown(columnId, event),
      onMouseEnter: () => setResizeHoverCursor(true),
      onMouseLeave: () => setResizeHoverCursor(false),
      onPointerDown: (event: ReactPointerEvent<HTMLElement>) =>
        handleResizePointerDown(columnId, event),
      title: tc('resizeColumn', { label }),
    }

    if (!clippedResizeHandleBounds) {
      return (
        <button
          {...interactiveProps}
          className={fullResizeHandleClassName}
          data-column-resize-column={columnId}
          data-column-resize-segment="full"
          key={columnId}
          ref={node => {
            assignResizeHandleRef('full', node)
          }}
          style={{ bottom: 0, left, top: 0 }}
          type="button"
        />
      )
    }

    const segmentNodes: ReactNode[] = []

    if (clippedResizeHandleBounds.top > 0) {
      segmentNodes.push(
        <button
          {...interactiveProps}
          data-column-resize-column={columnId}
          data-column-resize-segment="top"
          key={`${columnId}-top`}
          ref={node => {
            assignResizeHandleRef('top', node)
          }}
          style={{
            height: clippedResizeHandleBounds.top,
            left,
            top: 0,
          }}
          type="button"
        />,
      )
    }

    if (
      clippedResizeHandleBounds.bottom < clippedResizeHandleBounds.contentHeight
    ) {
      const bottomSegmentHeight = Math.min(
        MAX_EXPANDED_DETAIL_RESIZE_GRIP_HEIGHT,
        clippedResizeHandleBounds.contentHeight -
          clippedResizeHandleBounds.bottom,
      )

      if (bottomSegmentHeight <= 0) {
        return <Fragment key={columnId}>{segmentNodes}</Fragment>
      }

      segmentNodes.push(
        <div
          aria-hidden="true"
          className={pointerResizeSegmentClassName}
          data-column-resize-column={columnId}
          data-column-resize-role="pointer"
          data-column-resize-segment="bottom"
          key={`${columnId}-bottom`}
          onDoubleClick={event => {
            event.preventDefault()
            event.stopPropagation()
            resetColumnWidth(columnId)
          }}
          onMouseEnter={() => setResizeHoverCursor(true)}
          onMouseLeave={() => setResizeHoverCursor(false)}
          onPointerDown={event => handleResizePointerDown(columnId, event)}
          ref={node => {
            assignResizeHandleRef('bottom', node)
          }}
          style={{
            height: bottomSegmentHeight,
            left,
            top: clippedResizeHandleBounds.bottom,
          }}
        />,
      )
    }

    return <Fragment key={columnId}>{segmentNodes}</Fragment>
  }

  return (
    <div className="relative">
      {showSpinner && (
        <output
          aria-live="polite"
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white/60 dark:bg-secondary-900/60 backdrop-blur-[2px] rounded-2xl"
        >
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600 dark:border-primary-700 dark:border-t-primary-400" />
          <p className="text-secondary-600 dark:text-secondary-400">
            {tc('loadingRequirements')}
          </p>
        </output>
      )}
      {columnsPopover}
      <div
        className="relative overflow-x-auto"
        data-developer-mode-context="requirements table"
        data-developer-mode-name="table space"
        data-developer-mode-priority="330"
        data-requirements-scroll-container="true"
        ref={scrollContainerRef}
      >
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-y-0 left-0 z-10 w-6 bg-gradient-to-r from-white/85 via-white/55 to-transparent transition-opacity dark:from-secondary-900/85 dark:via-secondary-900/55 ${
            scrollFadeState.left ? 'opacity-100' : 'opacity-0'
          }`}
          data-scroll-fade="left"
        />
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-y-0 right-0 z-10 w-6 bg-gradient-to-l from-white/85 via-white/55 to-transparent transition-opacity dark:from-secondary-900/85 dark:via-secondary-900/55 ${
            scrollFadeState.right ? 'opacity-100' : 'opacity-0'
          }`}
          data-scroll-fade="right"
        />
        <div
          className="relative"
          ref={tableContentRef}
          style={{ width: `${tableWidth}px` }}
        >
          {shouldRenderResizeHandles
            ? resizeHandleOffsets.map(({ columnId, left }) => {
                const label = getColumnLabel(columnId)

                return renderResizeHandle(columnId, left, label)
              })
            : null}
          <table
            className="w-full table-fixed text-sm"
            data-developer-mode-name="requirements table"
            data-developer-mode-priority="320"
            ref={tableRef}
          >
            <colgroup>
              {columnDefinitions.map(column => (
                <col
                  key={column.id}
                  ref={node => {
                    colRefs.current[column.id] = node
                  }}
                  style={{ width: `${renderedColumnWidths[column.id]}px` }}
                />
              ))}
            </colgroup>
            <thead>
              <tr className="border-b border-secondary-200/35 bg-secondary-50/80 text-left dark:border-secondary-700/35 dark:bg-secondary-800/30">
                {columnDefinitions.map((column, columnIndex) => {
                  const label = getColumnLabel(column.id)
                  const isSortable = column.canSort
                  const isActiveSort = isSortable && sortState.by === column.id
                  const sortTooltip = getSortTooltip(label, isActiveSort)
                  const headerAlignClass =
                    column.align === 'center' ? 'text-center' : ''
                  const headerControlClass =
                    column.align === 'center'
                      ? 'justify-center'
                      : 'justify-start'
                  const isLastColumn =
                    columnIndex === columnDefinitions.length - 1
                  const dividerClass = isLastColumn
                    ? ''
                    : 'border-r border-secondary-200/5 dark:border-secondary-700/5'

                  return (
                    <th
                      aria-sort={
                        isSortable
                          ? isActiveSort
                            ? sortState.direction === 'asc'
                              ? 'ascending'
                              : 'descending'
                            : 'none'
                          : undefined
                      }
                      className={`${thBase} ${headerAlignClass} ${dividerClass}`}
                      data-developer-mode-context="requirements table"
                      data-developer-mode-name="column header"
                      data-developer-mode-priority="350"
                      data-developer-mode-value={getRequirementColumnDeveloperModeLabel(
                        column.id,
                      )}
                      key={column.id}
                      ref={node => {
                        headerCellRefs.current[column.id] = node
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={`flex min-w-0 flex-1 items-center gap-1 ${headerControlClass}`}
                          data-requirement-header-control={column.id}
                        >
                          {isSortable ? (
                            <button
                              className="group inline-flex min-h-[44px] min-w-[44px] max-w-full flex-1 items-center gap-1 text-left"
                              data-developer-mode-name={`sort button — ${getRequirementColumnDeveloperModeLabel(column.id)}`}
                              data-developer-mode-priority="300"
                              onClick={() =>
                                handleSortToggle(
                                  column.id as RequirementSortField,
                                )
                              }
                              title={sortTooltip}
                              type="button"
                            >
                              <span
                                className="min-w-0 flex-1 truncate"
                                data-requirement-header-label={column.id}
                              >
                                {label}
                              </span>
                              {getSortIcon(column.id as RequirementSortField)}
                            </button>
                          ) : (
                            <span
                              className="min-w-0 truncate"
                              data-requirement-header-label={column.id}
                            >
                              {label}
                            </span>
                          )}
                          {renderFilterControl(column.id)}
                        </div>
                      </div>
                      {renderFilterChips(column.id)}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody
              className={`${showSpinner ? 'opacity-40' : ''} ${loading ? 'pointer-events-none' : ''}`}
            >
              {shouldShowEmptyState ? (
                <tr>
                  <td
                    className="py-12 text-center text-secondary-600 dark:text-secondary-400"
                    colSpan={columnDefinitions.length}
                  >
                    {tc('noResults')}
                  </td>
                </tr>
              ) : rows.length > 0 ? (
                rows.map((row, idx) => {
                  const isExpanded = row.id === expandedId
                  const isPinned = pinnedIds?.has(row.id) ?? false

                  return (
                    <Fragment key={row.id}>
                      <tr
                        className={`border-b border-secondary-200/35 cursor-pointer transition-colors hover:bg-primary-50/40 dark:border-secondary-700/35 dark:hover:bg-primary-950/20 ${
                          isExpanded
                            ? 'border-l-2 border-l-primary-500 bg-primary-50/60 dark:bg-primary-950/30'
                            : ''
                        } ${
                          !isExpanded && isPinned
                            ? 'border-l-2 border-l-dashed border-l-secondary-400 opacity-60 dark:border-l-secondary-500'
                            : ''
                        } ${
                          !isExpanded && !isPinned && idx % 2 === 1
                            ? 'bg-secondary-50/40 dark:bg-secondary-800/20'
                            : ''
                        }`}
                        data-developer-mode-context="requirements table"
                        data-developer-mode-name="table row"
                        data-developer-mode-priority="300"
                        data-developer-mode-value={row.uniqueId}
                        onClick={event => handleBodyRowClick(event, row.id)}
                      >
                        {columnDefinitions.map((column, columnIndex) => (
                          <Fragment key={column.id}>
                            {renderCell(
                              row,
                              column.id,
                              columnIndex === columnDefinitions.length - 1,
                            )}
                          </Fragment>
                        ))}
                      </tr>
                      {isExpanded && renderExpanded && (
                        <tr>
                          <td
                            className="border-b border-l-2 border-l-primary-500 border-secondary-200/35 bg-secondary-50/60 p-0 dark:border-secondary-700/35 dark:bg-secondary-800/30"
                            colSpan={columnDefinitions.length}
                            data-developer-mode-context="requirements table"
                            data-developer-mode-name="inline detail pane"
                            data-developer-mode-priority="360"
                            data-developer-mode-value={row.uniqueId}
                            data-expanded-detail-cell="true"
                            id={`requirement-row-detail-${row.id}`}
                            ref={expandedDetailCellRef}
                          >
                            {renderExpanded(row.id)}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
      {hasMore && (
        <div
          aria-hidden="true"
          className="h-10 flex items-center justify-center"
          ref={sentinelRef}
        >
          {loadingMore && (
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600 dark:border-primary-700 dark:border-t-primary-400" />
          )}
        </div>
      )}
    </div>
  )
}

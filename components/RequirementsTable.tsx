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
import { useRouter } from '@/i18n/routing'
import {
  type AreaOption,
  clampRequirementColumnWidth,
  clearRequirementFiltersForHiddenColumns,
  DEFAULT_REQUIREMENT_SORT,
  DEFAULT_VISIBLE_REQUIREMENT_COLUMNS,
  type FilterOption,
  type FilterValues,
  getRequirementColumnWidth,
  REQUIREMENT_LIST_COLUMNS,
  type RequirementColumnId,
  type RequirementColumnWidths,
  type RequirementRow,
  type RequirementSortField,
  type RequirementSortState,
  type StatusOption,
  type TypeCategoryOption,
} from '@/lib/requirements/list-view'

interface RequirementsTableProps {
  areas?: AreaOption[]
  categories?: FilterOption[]
  columnWidths?: RequirementColumnWidths
  expandedId?: number | null
  filterValues?: FilterValues
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

function areColumnWidthsEqual(
  left: RequirementColumnWidths,
  right: RequirementColumnWidths,
) {
  return REQUIREMENT_LIST_COLUMNS.every(
    column => left[column.id] === right[column.id],
  )
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

  useEffect(() => {
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

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const commit = (v: string) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => onChange(v || undefined), 400)
  }

  return (
    <div className="relative inline-flex" ref={ref}>
      <button
        aria-label={tc('filterBy', { label })}
        className={`inline-flex h-4 w-4 items-center justify-center rounded transition-colors ${isActive ? 'text-primary-500' : 'text-secondary-400 hover:text-secondary-600 dark:hover:text-secondary-300'}`}
        onClick={e => {
          e.stopPropagation()
          if (!open && btnRef.current) {
            const rect = btnRef.current.getBoundingClientRect()
            setPos({ top: rect.bottom + 4, left: rect.left })
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
                    if (timer.current) clearTimeout(timer.current)
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
                  aria-label="Clear"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-secondary-400 hover:text-secondary-600"
                  onClick={() => {
                    setLocal('')
                    if (timer.current) clearTimeout(timer.current)
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
        left: rect.left,
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
        className={`inline-flex h-4 w-4 items-center justify-center rounded transition-colors ${activeCount > 0 ? 'text-primary-500' : 'text-secondary-400 hover:text-secondary-600 dark:hover:text-secondary-300'}`}
        onClick={openDropdown}
        ref={btnRef}
        title={tc('filterBy', { label })}
        type="button"
      >
        <Filter className="h-3.5 w-3.5" />
        {activeCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-primary-500 text-[8px] font-bold text-white leading-none">
            {activeCount}
          </span>
        )}
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
                className="w-full text-left px-2.5 py-1.5 text-xs text-secondary-500 hover:text-red-600 dark:hover:text-red-400 border-b mb-1 pb-1.5"
                onClick={() => onChange([])}
                type="button"
              >
                <X aria-hidden="true" className="h-3 w-3 inline mr-1" />
                Clear
              </button>
            )}
            {options.map(opt => (
              <label
                className="flex items-center gap-2 px-2.5 py-1.5 text-xs hover:bg-secondary-50 dark:hover:bg-secondary-700/50 cursor-pointer"
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
        left: rect.left,
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
        className={`inline-flex h-4 w-4 items-center justify-center rounded transition-colors ${activeCount > 0 ? 'text-primary-500' : 'text-secondary-400 hover:text-secondary-600 dark:hover:text-secondary-300'}`}
        onClick={openDropdown}
        ref={btnRef}
        title={tc('filterBy', { label })}
        type="button"
      >
        <Filter className="h-3.5 w-3.5" />
        {activeCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-primary-500 text-[8px] font-bold text-white leading-none">
            {activeCount}
          </span>
        )}
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
                className="w-full text-left px-2.5 py-1.5 text-xs text-secondary-500 hover:text-red-600 dark:hover:text-red-400 border-b mb-1 pb-1.5"
                onClick={() => onChange([])}
                type="button"
              >
                <X aria-hidden="true" className="h-3 w-3 inline mr-1" />
                Clear
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
                      className="flex items-center gap-2 pl-5 pr-2.5 py-1.5 text-xs hover:bg-secondary-50 dark:hover:bg-secondary-700/50 cursor-pointer"
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
  anchorRef,
  badgeLabel = null,
  columns,
  onReset,
  onToggle,
  visibleColumns,
}: {
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
  const [pos, setPos] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  })
  const [outsidePillPos, setOutsidePillPos] = useState<{
    left: number
    top: number
  } | null>(null)
  const triggerClassName =
    'inline-flex h-10 w-10 items-center justify-center rounded-full border border-secondary-200/80 bg-white/90 text-secondary-500 shadow-[0_10px_30px_-18px_rgba(15,23,42,0.45)] backdrop-blur-md transition-all hover:-translate-y-px hover:border-secondary-300 hover:text-secondary-700 hover:shadow-[0_14px_36px_-20px_rgba(15,23,42,0.5)] dark:border-secondary-700/80 dark:bg-secondary-900/80 dark:text-secondary-300 dark:hover:border-secondary-600 dark:hover:text-secondary-100'

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
      setOutsidePillPos({
        left: rect.right + 12,
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
      className={triggerClassName}
      data-column-picker-shell="true"
      data-column-picker-trigger="true"
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
                className="pointer-events-auto relative inline-flex"
                data-column-picker-wrapper="true"
                ref={ref}
              >
                {trigger}
              </div>
            </div>,
            document.body,
          )
        : null}
      {open &&
        createPortal(
          <div
            className="fixed z-50 min-w-56 rounded-xl border bg-white p-2 shadow-lg dark:bg-secondary-800"
            data-column-picker-popover="true"
            ref={dropRef}
            style={{ left: Math.max(pos.left, 8), top: pos.top }}
          >
            <div className="mb-1 border-b pb-1">
              <button
                className="w-full rounded-lg px-2 py-1.5 text-left text-xs font-medium text-secondary-500 transition-colors hover:bg-secondary-50 hover:text-secondary-700 dark:hover:bg-secondary-700/50 dark:hover:text-secondary-200"
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
                  className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-secondary-50 dark:hover:bg-secondary-700/50 ${
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
  label,
  onRemove,
}: {
  label: string
  onRemove: () => void
}) {
  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] leading-tight rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 max-w-full">
      <span className="truncate">{label}</span>
      <button
        aria-label={`Remove ${label}`}
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
  getLabel,
  onRemove,
  values,
}: {
  getLabel: (id: number) => string
  onRemove: (id: number) => void
  values: number[]
}) {
  if (values.length === 0) return null
  return (
    <div className="flex flex-wrap gap-0.5 mt-1">
      {values.map(id => (
        <span
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] leading-tight rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 max-w-full"
          key={id}
        >
          <span className="truncate">{getLabel(id)}</span>
          <button
            aria-label={`Remove ${getLabel(id)}`}
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
  columnWidths = {},
  expandedId,
  filterValues,
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
  visibleColumns = DEFAULT_VISIBLE_REQUIREMENT_COLUMNS,
}: RequirementsTableProps) {
  const t = useTranslations('requirement')
  const tc = useTranslations('common')
  const router = useRouter()

  const fv = filterValues ?? {}
  const hasFilters = !!onFilterChange
  const visibleColumnSet = new Set([
    ...visibleColumns,
    'uniqueId',
    'description',
  ])
  const columnPickerBadgeLabel =
    visibleColumnSet.size > 0
      ? `${visibleColumnSet.size}/${REQUIREMENT_LIST_COLUMNS.length}`
      : null
  const columnDefinitions = REQUIREMENT_LIST_COLUMNS.filter(column =>
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
  const colRefs = useRef<
    Partial<Record<RequirementColumnId, HTMLTableColElement | null>>
  >({})
  const headerCellRefs = useRef<
    Partial<Record<RequirementColumnId, HTMLTableCellElement | null>>
  >({})
  const resizeHandleRefs = useRef<
    Partial<Record<RequirementColumnId, HTMLButtonElement | null>>
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
    handle: HTMLButtonElement | null
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
  const [scrollFadeState, setScrollFadeState] = useState({
    left: false,
    right: false,
  })
  const canResizeColumns = !!onColumnWidthsChange

  const updateFilter = (patch: Partial<FilterValues>) => {
    if (onFilterChange) onFilterChange({ ...fv, ...patch })
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

  const getColumnLabel = (columnId: RequirementColumnId) => {
    const column = REQUIREMENT_LIST_COLUMNS.find(item => item.id === columnId)
    if (!column) {
      return columnId
    }

    return column.labelNamespace === 'common'
      ? tc(column.labelKey)
      : t(column.labelKey)
  }

  const getSortIcon = (columnId: RequirementSortField) => {
    if (sortState.by !== columnId) {
      return (
        <ArrowUpDown
          aria-hidden="true"
          className="h-3.5 w-3.5 text-secondary-400 transition-colors group-hover:text-secondary-600 dark:group-hover:text-secondary-300"
        />
      )
    }

    return sortState.direction === 'asc' ? (
      <ArrowUp
        aria-hidden="true"
        className="h-3.5 w-3.5 text-primary-600 dark:text-primary-400"
      />
    ) : (
      <ArrowDown
        aria-hidden="true"
        className="h-3.5 w-3.5 text-primary-600 dark:text-primary-400"
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
        const column = REQUIREMENT_LIST_COLUMNS.find(
          item => item.id === columnId,
        )

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
    [],
  )

  const syncResizeHandlePositions = useCallback(
    (visibleWidths: Record<RequirementColumnId, number>) => {
      let left = 0

      for (const [columnIndex, column] of columnDefinitions.entries()) {
        left += visibleWidths[column.id] ?? renderedColumnWidths[column.id]
        if (columnIndex === columnDefinitions.length - 1) {
          continue
        }

        const handle = resizeHandleRefs.current[column.id]
        if (handle) {
          handle.style.left = `${left}px`
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

  const handleResizePointerUp = useCallback(() => {
    finishResizing(true)
  }, [finishResizing])

  const handleResizePointerCancel = useCallback(() => {
    finishResizing(false)
  }, [finishResizing])

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
      if (!activeResize) {
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

    const handleScroll = () => updateScrollFades()
    container.addEventListener('scroll', handleScroll, { passive: true })

    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            updateScrollFades()
            updateResizeHandleOffsets()
          })

    resizeObserver?.observe(container)
    if (tableContentRef.current) {
      resizeObserver?.observe(tableContentRef.current)
    }
    if (tableRef.current) {
      resizeObserver?.observe(tableRef.current)
    }

    return () => {
      container.removeEventListener('scroll', handleScroll)
      resizeObserver?.disconnect()
    }
  }, [updateResizeHandleOffsets, updateScrollFades])

  useEffect(() => {
    void scrollLayoutSignature
    updateScrollFades()
    updateResizeHandleOffsets()
  }, [scrollLayoutSignature, updateResizeHandleOffsets, updateScrollFades])

  const handleResizePointerDown = (
    columnId: RequirementColumnId,
    event: ReactPointerEvent<HTMLButtonElement>,
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

    const normalizedColumns = REQUIREMENT_LIST_COLUMNS.filter(
      column =>
        nextVisibleColumns.includes(column.id) ||
        column.id === 'uniqueId' ||
        column.id === 'description',
    ).map(column => column.id)
    const hiddenColumns = columnDefinitions
      .map(column => column.id)
      .filter(columnId => !normalizedColumns.includes(columnId))
    const nextFilterValues = clearRequirementFiltersForHiddenColumns(
      fv,
      normalizedColumns,
    )

    onVisibleColumnsChange(normalizedColumns)

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

  const toggleColumn = (columnId: RequirementColumnId) => {
    const column = REQUIREMENT_LIST_COLUMNS.find(item => item.id === columnId)
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
    switch (columnId) {
      case 'uniqueId':
        return fv.uniqueIdSearch ? (
          <SearchChip
            label={fv.uniqueIdSearch}
            onRemove={() => updateFilter({ uniqueIdSearch: undefined })}
          />
        ) : null
      case 'description':
        return fv.descriptionSearch ? (
          <SearchChip
            label={fv.descriptionSearch}
            onRemove={() => updateFilter({ descriptionSearch: undefined })}
          />
        ) : null
      case 'area':
        return (
          <FilterChips
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

    switch (columnId) {
      case 'uniqueId':
        return (
          <td
            className={`py-2 px-2 font-mono font-medium text-primary-700 dark:text-primary-300 whitespace-nowrap ${archivedContentClass} ${dividerClass}`}
          >
            <span className="inline-flex items-center gap-1.5">
              {renderExpanded ? (
                row.id === expandedId ? (
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
            </span>
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
  const resetColumnsView = () => {
    cancelResizePreviewFrame()
    pendingResizePreviewVisibleWidthsRef.current = null
    resizePreviewVisibleWidthsRef.current = null
    applyVisibleColumns([...DEFAULT_VISIBLE_REQUIREMENT_COLUMNS])
    onColumnWidthsChange?.({})
  }
  const columnsPopover = (
    <ColumnsPopover
      anchorRef={scrollContainerRef}
      badgeLabel={columnPickerBadgeLabel}
      columns={REQUIREMENT_LIST_COLUMNS.map(column => ({
        canHide: column.canHide,
        id: column.id,
        label: getColumnLabel(column.id),
      }))}
      onReset={resetColumnsView}
      onToggle={toggleColumn}
      visibleColumns={columnDefinitions.map(column => column.id)}
    />
  )

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
          {canResizeColumns
            ? resizeHandleOffsets.map(({ columnId, left }) => {
                const label = getColumnLabel(columnId)

                return (
                  <button
                    aria-label={tc('resizeColumn', { label })}
                    className="group pointer-events-auto absolute inset-y-0 z-20 m-0 w-6 -translate-x-1/2 cursor-ew-resize touch-none border-0 bg-transparent p-0 focus-visible:outline-none before:absolute before:bottom-0 before:left-1/2 before:top-0 before:w-px before:-translate-x-1/2 before:rounded-full before:bg-secondary-300/18 before:transition-colors hover:before:bg-primary-400 focus-visible:before:bg-primary-400 dark:before:bg-secondary-600/25 dark:hover:before:bg-primary-400 dark:focus-visible:before:bg-primary-400"
                    data-column-resize-handle={columnId}
                    key={columnId}
                    onBlur={() => setResizeHoverCursor(false)}
                    onDoubleClick={event => {
                      event.preventDefault()
                      event.stopPropagation()
                      resetColumnWidth(columnId)
                    }}
                    onFocus={() => setResizeHoverCursor(true)}
                    onKeyDown={event => handleResizeKeyDown(columnId, event)}
                    onMouseEnter={() => setResizeHoverCursor(true)}
                    onMouseLeave={() => setResizeHoverCursor(false)}
                    onPointerDown={event =>
                      handleResizePointerDown(columnId, event)
                    }
                    ref={node => {
                      resizeHandleRefs.current[columnId] = node
                    }}
                    style={{ left: `${left}px` }}
                    title={tc('resizeColumn', { label })}
                    type="button"
                  />
                )
              })
            : null}
          <table className="w-full table-fixed text-sm" ref={tableRef}>
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
                      key={column.id}
                      ref={node => {
                        headerCellRefs.current[column.id] = node
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={`flex min-w-0 flex-1 items-center gap-1 ${headerControlClass}`}
                        >
                          {isSortable ? (
                            <button
                              className="group inline-flex min-w-0 max-w-full items-center gap-1 text-left"
                              onClick={() =>
                                handleSortToggle(
                                  column.id as RequirementSortField,
                                )
                              }
                              title={sortTooltip}
                              type="button"
                            >
                              <span className="truncate">{label}</span>
                              {getSortIcon(column.id as RequirementSortField)}
                            </button>
                          ) : (
                            <span>{label}</span>
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
              {rows.length === 0 ? (
                <tr>
                  <td
                    className="py-12 text-center text-secondary-600 dark:text-secondary-400"
                    colSpan={columnDefinitions.length}
                  >
                    {tc('noResults')}
                  </td>
                </tr>
              ) : (
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
                        onClick={() =>
                          onRowClick
                            ? onRowClick(row.id)
                            : router.push(`/kravkatalog/${row.id}`)
                        }
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
                          >
                            {renderExpanded(row.id)}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })
              )}
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

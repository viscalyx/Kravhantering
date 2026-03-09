'use client'

import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Filter,
  Search,
  TestTube2,
  X,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Fragment, type ReactNode, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type {
  FilterValues,
  StatusOption,
} from '@/components/RequirementsFilter'
import StatusBadge from '@/components/StatusBadge'
import { useRouter } from '@/i18n/routing'

interface RequirementRow {
  area: {
    name: string
  } | null
  hasPendingVersion?: boolean
  id: number
  isArchived: boolean
  pendingVersionStatusColor?: string | null
  uniqueId: string
  version: {
    description: string | null
    categoryNameSv: string | null
    categoryNameEn: string | null
    typeNameSv: string | null
    typeNameEn: string | null
    typeCategoryNameSv: string | null
    typeCategoryNameEn: string | null
    requiresTesting: boolean
    versionNumber: number
    status: number
    statusNameSv: string | null
    statusNameEn: string | null
    statusColor: string | null
  } | null
}

interface FilterOption {
  id: number
  nameEn: string
  nameSv: string
}

interface AreaOption {
  id: number
  name: string
}

interface TypeCategoryOption {
  id: number
  nameEn: string
  nameSv: string
  parentId: number | null
}

interface RequirementsTableProps {
  areas?: AreaOption[]
  categories?: FilterOption[]
  expandedId?: number | null
  filterValues?: FilterValues
  getName?: (opt: FilterOption) => string
  getStatusName?: (opt: StatusOption) => string
  loading?: boolean
  locale: string
  onFilterChange?: (values: FilterValues) => void
  onRowClick?: (id: number) => void
  pinnedIds?: Set<number>
  renderExpanded?: (id: number) => ReactNode
  rows: RequirementRow[]
  statusOptions?: StatusOption[]
  typeCategories?: TypeCategoryOption[]
  types?: FilterOption[]
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
        aria-label={`${label} filter`}
        className={`ml-1 p-0.5 rounded transition-colors ${isActive ? 'text-primary-500' : 'text-secondary-400 hover:text-secondary-600 dark:hover:text-secondary-300'}`}
        onClick={e => {
          e.stopPropagation()
          if (!open && btnRef.current) {
            const rect = btnRef.current.getBoundingClientRect()
            setPos({ top: rect.bottom + 4, left: rect.left })
          }
          setOpen(v => !v)
        }}
        ref={btnRef}
        type="button"
      >
        <Filter className="h-3 w-3" />
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
        aria-label={`${label} filter`}
        className={`ml-1 p-0.5 rounded transition-colors ${activeCount > 0 ? 'text-primary-500' : 'text-secondary-400 hover:text-secondary-600 dark:hover:text-secondary-300'}`}
        onClick={openDropdown}
        ref={btnRef}
        type="button"
      >
        <Filter className="h-3 w-3" />
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
        aria-label={`${label} filter`}
        className={`ml-1 p-0.5 rounded transition-colors ${activeCount > 0 ? 'text-primary-500' : 'text-secondary-400 hover:text-secondary-600 dark:hover:text-secondary-300'}`}
        onClick={openDropdown}
        ref={btnRef}
        type="button"
      >
        <Filter className="h-3 w-3" />
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
  expandedId,
  filterValues,
  getName = () => '',
  getStatusName = () => '',
  loading = false,
  locale,
  onFilterChange,
  onRowClick,
  pinnedIds,
  renderExpanded,
  rows,
  statusOptions = [],
  typeCategories = [],
  types = [],
}: RequirementsTableProps) {
  const t = useTranslations('requirement')
  const tc = useTranslations('common')
  const router = useRouter()

  const fv = filterValues ?? {}
  const hasFilters = !!onFilterChange

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

  const [showSpinner, setShowSpinner] = useState(false)
  useEffect(() => {
    if (!loading) {
      setShowSpinner(false)
      return
    }
    const timer = setTimeout(() => setShowSpinner(true), 1000)
    return () => clearTimeout(timer)
  }, [loading])

  const thBase =
    'py-2 px-2 font-medium text-secondary-700 dark:text-secondary-300 align-top'

  return (
    <div className="relative overflow-x-auto">
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
      <table className="w-full text-sm table-fixed">
        <colgroup>
          <col className="w-[8%]" />
          {/* uniqueId */}
          <col className="w-[18%]" />
          {/* description */}
          <col className="w-[10%]" />
          {/* area */}
          <col className="w-[12%]" />
          {/* category */}
          <col className="w-[10%]" />
          {/* type */}
          <col className="w-[14%]" />
          {/* typeCategory */}
          <col className="w-[10%]" />
          {/* status */}
          <col className="w-[10%]" />
          {/* requiresTesting */}
          <col className="w-[8%]" />
          {/* version */}
        </colgroup>
        <thead>
          <tr className="border-b bg-secondary-50/80 dark:bg-secondary-800/30 text-left">
            {/* uniqueId */}
            <th className={thBase}>
              <div className="flex items-center">
                <span>{t('uniqueId')}</span>
                {hasFilters && (
                  <SearchFilterPopover
                    activeValue={fv.uniqueIdSearch ?? ''}
                    label={t('uniqueId')}
                    onChange={v => updateFilter({ uniqueIdSearch: v })}
                  />
                )}
              </div>
              {fv.uniqueIdSearch && (
                <SearchChip
                  label={fv.uniqueIdSearch}
                  onRemove={() => updateFilter({ uniqueIdSearch: undefined })}
                />
              )}
            </th>
            {/* description */}
            <th className={thBase}>
              <div className="flex items-center">
                <span>{t('description')}</span>
                {hasFilters && (
                  <SearchFilterPopover
                    activeValue={fv.descriptionSearch ?? ''}
                    label={t('description')}
                    onChange={v => updateFilter({ descriptionSearch: v })}
                  />
                )}
              </div>
              {fv.descriptionSearch && (
                <SearchChip
                  label={fv.descriptionSearch}
                  onRemove={() =>
                    updateFilter({ descriptionSearch: undefined })
                  }
                />
              )}
            </th>
            {/* area */}
            <th className={thBase}>
              <div className="flex items-center">
                <span>{t('area')}</span>
                {hasFilters && (
                  <MultiSelectFilterPopover
                    activeCount={(fv.areaIds ?? []).length}
                    getLabel={opt => areaLabel(opt.id)}
                    label={t('area')}
                    onChange={ids =>
                      updateFilter({
                        areaIds: ids.length > 0 ? ids : undefined,
                      })
                    }
                    options={areas}
                    value={fv.areaIds ?? []}
                  />
                )}
              </div>
              <FilterChips
                getLabel={areaLabel}
                onRemove={id =>
                  updateFilter({
                    areaIds: (fv.areaIds ?? []).filter(v => v !== id),
                  })
                }
                values={fv.areaIds ?? []}
              />
            </th>
            {/* category */}
            <th className={thBase}>
              <div className="flex items-center">
                <span>{t('category')}</span>
                {hasFilters && (
                  <MultiSelectFilterPopover
                    activeCount={(fv.categoryIds ?? []).length}
                    getLabel={opt => catLabel(opt.id)}
                    label={t('category')}
                    onChange={ids =>
                      updateFilter({
                        categoryIds: ids.length > 0 ? ids : undefined,
                      })
                    }
                    options={categories}
                    value={fv.categoryIds ?? []}
                  />
                )}
              </div>
              <FilterChips
                getLabel={catLabel}
                onRemove={id =>
                  updateFilter({
                    categoryIds: (fv.categoryIds ?? []).filter(v => v !== id),
                  })
                }
                values={fv.categoryIds ?? []}
              />
            </th>
            {/* type */}
            <th className={thBase}>
              <div className="flex items-center">
                <span>{t('type')}</span>
                {hasFilters && (
                  <MultiSelectFilterPopover
                    activeCount={(fv.typeIds ?? []).length}
                    getLabel={opt => typeLabel(opt.id)}
                    label={t('type')}
                    onChange={ids =>
                      updateFilter({
                        typeIds: ids.length > 0 ? ids : undefined,
                      })
                    }
                    options={types}
                    value={fv.typeIds ?? []}
                  />
                )}
              </div>
              <FilterChips
                getLabel={typeLabel}
                onRemove={id =>
                  updateFilter({
                    typeIds: (fv.typeIds ?? []).filter(v => v !== id),
                  })
                }
                values={fv.typeIds ?? []}
              />
            </th>
            {/* typeCategory */}
            <th className={thBase}>
              <div className="flex items-center">
                <span>{t('typeCategory')}</span>
                {hasFilters && (
                  <GroupedMultiSelectFilterPopover
                    activeCount={(fv.typeCategoryIds ?? []).length}
                    getLabel={opt => typeCatLabel(opt.id)}
                    label={t('typeCategory')}
                    onChange={ids =>
                      updateFilter({
                        typeCategoryIds: ids.length > 0 ? ids : undefined,
                      })
                    }
                    options={typeCategories}
                    value={fv.typeCategoryIds ?? []}
                  />
                )}
              </div>
              <FilterChips
                getLabel={typeCatLabel}
                onRemove={id =>
                  updateFilter({
                    typeCategoryIds: (fv.typeCategoryIds ?? []).filter(
                      v => v !== id,
                    ),
                  })
                }
                values={fv.typeCategoryIds ?? []}
              />
            </th>
            {/* status */}
            <th className={thBase}>
              <div className="flex items-center">
                <span>{t('status')}</span>
                {hasFilters && (
                  <MultiSelectFilterPopover
                    activeCount={(fv.statuses ?? []).length}
                    getLabel={opt => statusLabel(opt.id)}
                    label={t('status')}
                    onChange={ids =>
                      updateFilter({
                        statuses: ids.length > 0 ? ids : undefined,
                      })
                    }
                    options={statusOptions}
                    value={fv.statuses ?? []}
                  />
                )}
              </div>
              <FilterChips
                getLabel={statusLabel}
                onRemove={id =>
                  updateFilter({
                    statuses: (fv.statuses ?? []).filter(v => v !== id),
                  })
                }
                values={fv.statuses ?? []}
              />
            </th>
            {/* requiresTesting */}
            <th className={`${thBase} text-center`}>
              <div className="flex items-center justify-center">
                <span>{t('requiresTesting')}</span>
                {hasFilters && (
                  <MultiSelectFilterPopover
                    activeCount={rtValue.length}
                    getLabel={opt =>
                      requiresTestingOptions.find(o => o.id === opt.id)
                        ?.label ?? ''
                    }
                    label={t('requiresTesting')}
                    onChange={setRt}
                    options={requiresTestingOptions}
                    value={rtValue}
                  />
                )}
              </div>
              <FilterChips
                getLabel={id =>
                  requiresTestingOptions.find(o => o.id === id)?.label ?? ''
                }
                onRemove={id => setRt(rtValue.filter(v => v !== id))}
                values={rtValue}
              />
            </th>
            {/* version — no filter */}
            <th className={`${thBase} text-center`}>{tc('version')}</th>
          </tr>
        </thead>
        <tbody className={loading ? 'opacity-40 pointer-events-none' : ''}>
          {rows.length === 0 ? (
            <tr>
              <td
                className="text-center py-12 text-secondary-600 dark:text-secondary-400"
                colSpan={9}
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
                    className={`border-b cursor-pointer transition-colors hover:bg-primary-50/40 dark:hover:bg-primary-950/20 ${
                      row.isArchived ? 'opacity-50' : ''
                    } ${isExpanded ? 'bg-primary-50/60 dark:bg-primary-950/30 border-l-2 border-l-primary-500' : ''} ${!isExpanded && isPinned ? 'opacity-60 border-l-2 border-l-dashed border-l-secondary-400 dark:border-l-secondary-500' : ''} ${!isExpanded && !isPinned && idx % 2 === 1 ? 'bg-secondary-50/40 dark:bg-secondary-800/20' : ''}`}
                    onClick={() =>
                      onRowClick
                        ? onRowClick(row.id)
                        : router.push(`/kravkatalog/${row.id}`)
                    }
                  >
                    <td className="py-2 px-2 font-mono font-medium text-primary-700 dark:text-primary-300 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
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
                      </span>
                    </td>
                    <td className="py-2 px-2 truncate">
                      {row.version?.description ?? '—'}
                    </td>
                    <td className="py-2 px-2 truncate">
                      {row.area?.name ?? '—'}
                    </td>
                    <td className="py-2 px-2 truncate">
                      {(locale === 'sv'
                        ? row.version?.categoryNameSv
                        : row.version?.categoryNameEn) ?? '—'}
                    </td>
                    <td className="py-2 px-2 truncate">
                      {(locale === 'sv'
                        ? row.version?.typeNameSv
                        : row.version?.typeNameEn) ?? '—'}
                    </td>
                    <td className="py-2 px-2 truncate">
                      {(locale === 'sv'
                        ? row.version?.typeCategoryNameSv
                        : row.version?.typeCategoryNameEn) ?? '—'}
                    </td>
                    <td className="py-2 px-2">
                      <span className="inline-flex items-center gap-1">
                        {row.version ? (
                          <StatusBadge
                            color={row.version.statusColor}
                            label={
                              (locale === 'sv'
                                ? row.version.statusNameSv
                                : row.version.statusNameEn) ?? '—'
                            }
                          />
                        ) : (
                          '—'
                        )}
                        {row.hasPendingVersion && (
                          <span title={t('hasPendingVersion')}>
                            <AlertCircle
                              aria-label={t('hasPendingVersion')}
                              className="h-3.5 w-3.5"
                              style={{
                                color:
                                  row.pendingVersionStatusColor ?? undefined,
                              }}
                            />
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-center">
                      {row.version?.requiresTesting && (
                        <TestTube2
                          aria-label={t('requiresTesting')}
                          className="h-4 w-4 inline text-primary-700 dark:text-primary-300"
                        />
                      )}
                    </td>
                    <td className="py-2 px-2 text-center text-secondary-600 dark:text-secondary-400">
                      v{row.version?.versionNumber ?? 1}
                    </td>
                  </tr>
                  {isExpanded && renderExpanded && (
                    <tr>
                      <td
                        className="p-0 border-b border-l-2 border-l-primary-500 bg-secondary-50/60 dark:bg-secondary-800/30"
                        colSpan={9}
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
  )
}

'use client'

import { ChevronDown, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'

export interface FilterValues {
  areaIds?: number[]
  categoryIds?: number[]
  descriptionSearch?: string
  requiresTesting?: string[]
  statuses?: number[]
  typeCategoryIds?: number[]
  typeIds?: number[]
  uniqueIdSearch?: string
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

export interface StatusOption {
  color: string | null
  id: number
  nameEn: string
  nameSv: string
}

interface RequirementsFilterProps {
  areas: AreaOption[]
  categories: FilterOption[]
  getName: (opt: FilterOption) => string
  getStatusName: (opt: StatusOption) => string
  onChange: (values: FilterValues) => void
  statusOptions: StatusOption[]
  typeCategories: TypeCategoryOption[]
  types: FilterOption[]
  values: FilterValues
}

export const DEFAULT_PUBLISHED_STATUS_ID = 3

export const DEFAULT_FILTERS: FilterValues = {
  statuses: [DEFAULT_PUBLISHED_STATUS_ID],
}

export function hasActiveFilters(values: FilterValues): boolean {
  const defaultStatuses = DEFAULT_FILTERS.statuses ?? []
  const currentStatuses = values.statuses ?? []
  const statusesDiffer =
    currentStatuses.length !== defaultStatuses.length ||
    !currentStatuses.every(s => defaultStatuses.includes(s))

  return !!(
    (values.areaIds && values.areaIds.length > 0) ||
    (values.categoryIds && values.categoryIds.length > 0) ||
    (values.requiresTesting && values.requiresTesting.length > 0) ||
    (values.typeIds && values.typeIds.length > 0) ||
    (values.typeCategoryIds && values.typeCategoryIds.length > 0) ||
    values.uniqueIdSearch ||
    values.descriptionSearch ||
    statusesDiffer
  )
}

export default function RequirementsFilter({
  areas,
  categories,
  getName,
  getStatusName,
  typeCategories,
  types,
  statusOptions,
  values,
  onChange,
}: RequirementsFilterProps) {
  const t = useTranslations('requirement')
  const tc = useTranslations('common')
  const [statusOpen, setStatusOpen] = useState(false)
  const statusRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) {
        setStatusOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleChange = (key: keyof FilterValues, value: string | boolean) => {
    onChange({ ...values, [key]: value || undefined })
  }

  const selectedStatuses = values.statuses ?? []
  const handleStatusToggle = (statusId: number) => {
    const next = selectedStatuses.includes(statusId)
      ? selectedStatuses.filter(s => s !== statusId)
      : [...selectedStatuses, statusId]
    onChange({ ...values, statuses: next.length > 0 ? next : undefined })
  }

  const selectClass =
    'rounded-xl border bg-white dark:bg-secondary-800/50 text-sm py-2 px-3 focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200'

  const labelClass =
    'text-xs font-medium text-secondary-600 dark:text-secondary-400'

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <span className={labelClass}>{t('area')}</span>
        <select
          aria-label={t('area')}
          className={selectClass}
          onChange={e =>
            onChange({
              ...values,
              areaIds: e.target.value ? [Number(e.target.value)] : undefined,
            })
          }
          value={values.areaIds?.[0] ?? ''}
        >
          <option value="">{tc('none')}</option>
          {areas.map(a => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <span className={labelClass}>{t('category')}</span>
        <select
          aria-label={t('category')}
          className={selectClass}
          onChange={e =>
            onChange({
              ...values,
              categoryIds: e.target.value
                ? [Number(e.target.value)]
                : undefined,
            })
          }
          value={values.categoryIds?.[0] ?? ''}
        >
          <option value="">{tc('none')}</option>
          {categories.map(c => (
            <option key={c.id} value={c.id}>
              {getName(c)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <span className={labelClass}>{t('type')}</span>
        <select
          aria-label={t('type')}
          className={selectClass}
          onChange={e =>
            onChange({
              ...values,
              typeIds: e.target.value ? [Number(e.target.value)] : undefined,
            })
          }
          value={values.typeIds?.[0] ?? ''}
        >
          <option value="">{tc('none')}</option>
          {types.map(tp => (
            <option key={tp.id} value={tp.id}>
              {getName(tp)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <span className={labelClass}>{t('typeCategory')}</span>
        <select
          aria-label={t('typeCategory')}
          className={selectClass}
          onChange={e =>
            onChange({
              ...values,
              typeCategoryIds: e.target.value
                ? [Number(e.target.value)]
                : undefined,
            })
          }
          value={values.typeCategoryIds?.[0] ?? ''}
        >
          <option value="">{tc('none')}</option>
          {typeCategories
            .filter(tc => !tc.parentId)
            .map(parent => (
              <optgroup key={parent.id} label={getName(parent)}>
                {typeCategories
                  .filter(c => c.parentId === parent.id)
                  .map(c => (
                    <option key={c.id} value={c.id}>
                      {getName(c)}
                    </option>
                  ))}
              </optgroup>
            ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <span className={labelClass}>{t('requiresTesting')}</span>
        <select
          aria-label={t('requiresTesting')}
          className={selectClass}
          onChange={e => handleChange('requiresTesting', e.target.value)}
          value={values.requiresTesting ?? ''}
        >
          <option value="">{tc('none')}</option>
          <option value="true">{tc('yes')}</option>
          <option value="false">{tc('no')}</option>
        </select>
      </div>

      {hasActiveFilters(values) && (
        <button
          className="flex items-center gap-1 text-xs text-secondary-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
          onClick={() => onChange(DEFAULT_FILTERS)}
          title={tc('clearFilters')}
          type="button"
        >
          <X aria-hidden="true" className="h-3.5 w-3.5" />
          {tc('clearFilters')}
        </button>
      )}

      <div className="flex flex-col gap-1 ml-auto relative" ref={statusRef}>
        <span className={labelClass}>{t('status')}</span>
        <button
          aria-label={t('status')}
          className={`${selectClass} flex items-center gap-2 min-w-40 text-left`}
          onClick={() => setStatusOpen(v => !v)}
          type="button"
        >
          <span className="flex-1 truncate">
            {selectedStatuses.length === 0 ||
            selectedStatuses.length === statusOptions.length
              ? tc('none')
              : selectedStatuses
                  .map(id => {
                    const opt = statusOptions.find(o => o.id === id)
                    return opt ? getStatusName(opt) : ''
                  })
                  .filter(Boolean)
                  .join(', ')}
          </span>
          <ChevronDown
            aria-hidden="true"
            className={`h-3.5 w-3.5 shrink-0 transition-transform ${statusOpen ? 'rotate-180' : ''}`}
          />
        </button>
        {statusOpen && (
          <div className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-secondary-800 border rounded-xl shadow-lg py-1 min-w-45">
            {statusOptions.map(s => (
              <label
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-secondary-50 dark:hover:bg-secondary-700/50 cursor-pointer text-sm"
                key={s.id}
              >
                <input
                  checked={selectedStatuses.includes(s.id)}
                  className="rounded border-secondary-300 text-primary-700 focus:ring-primary-400/50"
                  onChange={() => handleStatusToggle(s.id)}
                  type="checkbox"
                />
                {getStatusName(s)}
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

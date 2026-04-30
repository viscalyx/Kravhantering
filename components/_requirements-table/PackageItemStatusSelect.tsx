'use client'

import { memo, useCallback, useMemo } from 'react'
import type { PackageItemStatusOption } from '@/lib/requirements/list-view'

interface PackageItemStatusSelectProps {
  ariaLabel: string
  hasApprovedDeviation: boolean
  itemRef: string
  locale: string
  onChange: (itemRef: string, statusId: number | null) => void
  statuses: PackageItemStatusOption[]
  statusId: number | null | undefined
  tooltip?: string
}

interface StatusOption {
  description: string | undefined
  id: number
  label: string
}

function PackageItemStatusSelectImpl({
  ariaLabel,
  hasApprovedDeviation,
  itemRef,
  locale,
  onChange,
  statusId,
  statuses,
  tooltip,
}: PackageItemStatusSelectProps) {
  const options = useMemo<StatusOption[]>(
    () =>
      statuses
        .filter(status => !status.isDeviationStatus || hasApprovedDeviation)
        .map(status => ({
          description:
            (locale === 'sv' ? status.descriptionSv : status.descriptionEn) ||
            undefined,
          id: status.id,
          label: locale === 'sv' ? status.nameSv : status.nameEn,
        })),
    [hasApprovedDeviation, locale, statuses],
  )

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const value = event.target.value
      onChange(itemRef, value === '' ? null : Number(value))
    },
    [itemRef, onChange],
  )

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLSelectElement>) => {
      event.stopPropagation()
    },
    [],
  )

  return (
    <select
      aria-label={ariaLabel}
      className="w-auto max-w-full rounded-lg border bg-white dark:bg-secondary-800/50 py-1 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 transition-all duration-200"
      onChange={handleChange}
      onClick={handleClick}
      title={tooltip}
      value={statusId ?? ''}
    >
      <option value="">—</option>
      {options.map(option => (
        <option key={option.id} title={option.description} value={option.id}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

const PackageItemStatusSelect = memo(PackageItemStatusSelectImpl)
PackageItemStatusSelect.displayName = 'PackageItemStatusSelect'

export default PackageItemStatusSelect

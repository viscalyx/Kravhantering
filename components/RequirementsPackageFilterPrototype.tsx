'use client'

import { FilterX, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { devMarker } from '@/lib/developer-mode-markers'
import type { RequirementPackageOption } from '@/lib/requirements/list-view'

interface RequirementsPackageFilterPrototypeProps {
  locale: string
  onChange: (ids: number[]) => void
  packages: RequirementPackageOption[]
  selectedIds: number[]
}

interface PrototypeCopy {
  allPackages: string
  allSelected: string
  clearAll: string
  filterLabel: string
  noSelection: string
}

const COPY: Record<'en' | 'sv', PrototypeCopy> = {
  en: {
    allSelected: 'All requirements packages are selected.',
    allPackages: 'All requirements packages',
    clearAll: 'Clear all selected requirements packages',
    filterLabel: 'Requirements packages',
    noSelection: 'Hover here to filter by requirements packages',
  },
  sv: {
    allSelected: 'Alla kravpaket är valda.',
    allPackages: 'Alla kravpaket',
    clearAll: 'Rensa alla valda kravpaket',
    filterLabel: 'Kravpaket',
    noSelection: 'Hovra här för att filtrera på kravpaket',
  },
}

function packageName(pkg: RequirementPackageOption): string {
  return pkg.name.trim() || String(pkg.id)
}

function PrototypeChip({
  active,
  onClick,
  pkg,
  strongBorder = false,
}: {
  active: boolean
  onClick: () => void
  pkg: RequirementPackageOption
  strongBorder?: boolean
}) {
  return (
    <button
      aria-label={packageName(pkg)}
      aria-pressed={active}
      className={`inline-flex h-6 max-w-52 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
        strongBorder ? 'border-2' : 'border'
      } ${
        active
          ? 'border-transparent bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300'
          : `${
              strongBorder
                ? 'border-secondary-300 dark:border-secondary-600'
                : 'border-secondary-200 dark:border-secondary-700'
            } bg-white text-secondary-700 hover:bg-secondary-100 dark:bg-secondary-900 dark:text-secondary-200 dark:hover:bg-secondary-800`
      }`}
      onClick={onClick}
      title={pkg.purposeAndScope ?? undefined}
      type="button"
    >
      <span className="truncate">{packageName(pkg)}</span>
      {active && <X aria-hidden="true" className="h-3 w-3 shrink-0" />}
    </button>
  )
}

export default function RequirementsPackageFilterPrototype({
  locale,
  onChange,
  packages,
  selectedIds,
}: RequirementsPackageFilterPrototypeProps) {
  // PROTOTYPE: chosen model D — floating hover package band.
  const copy = COPY[locale === 'sv' ? 'sv' : 'en']
  const [floatingOpen, setFloatingOpen] = useState(false)
  const [focusOpen, setFocusOpen] = useState(false)
  const [hoverOpen, setHoverOpen] = useState(false)

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const activePackages = selectedIds
    .map(id => packages.find(pkg => pkg.id === id))
    .filter((pkg): pkg is RequirementPackageOption => Boolean(pkg))
  const unselectedPackages = packages.filter(pkg => !selectedSet.has(pkg.id))
  const expanded = floatingOpen || focusOpen || hoverOpen

  const toggle = (id: number) => {
    onChange(
      selectedSet.has(id)
        ? selectedIds.filter(selectedId => selectedId !== id)
        : [...selectedIds, id],
    )
  }

  const selectFromFloatingList = (id: number) => {
    toggle(id)
    setFocusOpen(false)
  }

  const removeFromSelectedRow = (id: number) => {
    toggle(id)
    setFocusOpen(false)
  }

  return (
    <section
      aria-label={copy.filterLabel}
      className="relative z-40 border-b border-secondary-200 bg-white/90 px-3 py-2 text-sm backdrop-blur-sm dark:border-secondary-700 dark:bg-secondary-900/90"
      {...devMarker({
        name: 'requirements package filter prototype',
        priority: 330,
        value: 'chosen model D: floating hover package band',
      })}
    >
      <fieldset
        aria-label={copy.filterLabel}
        className="relative min-w-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        onBlurCapture={event => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setFocusOpen(false)
          }
        }}
        onFocusCapture={event => {
          if ((event.target as HTMLElement).matches(':focus-visible')) {
            setFocusOpen(true)
          }
        }}
        onMouseEnter={() => setHoverOpen(true)}
        onMouseLeave={() => setHoverOpen(false)}
      >
        <button
          aria-expanded={expanded}
          aria-label={copy.allPackages}
          className="absolute inset-0 z-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          type="button"
        />
        <div className="relative z-10 flex flex-wrap items-center gap-2 pointer-events-none sm:flex-nowrap">
          <span className="shrink-0 text-xs font-semibold text-secondary-600 dark:text-secondary-300">
            {copy.filterLabel}
          </span>
          <div className="order-3 flex w-full min-w-0 basis-full flex-none gap-1 overflow-x-auto pointer-events-auto sm:order-none sm:w-auto sm:basis-auto sm:flex-1">
            {activePackages.length > 0 ? (
              <>
                {activePackages.map(pkg => (
                  <PrototypeChip
                    active
                    key={pkg.id}
                    onClick={() => removeFromSelectedRow(pkg.id)}
                    pkg={pkg}
                  />
                ))}
                {activePackages.length > 1 && (
                  <button
                    aria-label={copy.clearAll}
                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-secondary-300 bg-white text-secondary-500 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:border-secondary-600 dark:bg-secondary-900 dark:text-secondary-300 dark:hover:border-red-700 dark:hover:bg-red-950 dark:hover:text-red-300"
                    onClick={() => {
                      onChange([])
                      setFocusOpen(false)
                    }}
                    title={copy.clearAll}
                    type="button"
                  >
                    <FilterX aria-hidden="true" className="h-3.5 w-3.5" />
                  </button>
                )}
              </>
            ) : (
              <span className="self-center text-xs text-secondary-500 dark:text-secondary-400">
                {copy.noSelection}
              </span>
            )}
          </div>
        </div>
        {expanded && (
          <menu
            aria-label={copy.allPackages}
            className="absolute top-full right-0 left-0 z-50 m-0 flex flex-wrap gap-1 rounded-xl border border-secondary-200 bg-white p-2 shadow-xl dark:border-secondary-700 dark:bg-secondary-900"
            onMouseEnter={() => setFloatingOpen(true)}
            onMouseLeave={() => setFloatingOpen(false)}
          >
            {unselectedPackages.length > 0 ? (
              unselectedPackages.map(pkg => (
                <PrototypeChip
                  active={false}
                  key={pkg.id}
                  onClick={() => selectFromFloatingList(pkg.id)}
                  pkg={pkg}
                  strongBorder
                />
              ))
            ) : (
              <span className="py-1 text-xs text-secondary-500 dark:text-secondary-400">
                {copy.allSelected}
              </span>
            )}
          </menu>
        )}
      </fieldset>
    </section>
  )
}

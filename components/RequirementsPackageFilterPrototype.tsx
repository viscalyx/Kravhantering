'use client'

import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Search,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { devMarker } from '@/lib/developer-mode-markers'
import type { RequirementPackageOption } from '@/lib/requirements/list-view'

type VariantKey = 'A' | 'B' | 'C' | 'D'

interface RequirementsPackageFilterPrototypeProps {
  locale: string
  onChange: (ids: number[]) => void
  packages: RequirementPackageOption[]
  selectedIds: number[]
}

interface PrototypeCopy {
  active: string
  allPackages: string
  browse: string
  clear: string
  collapse: string
  filterLabel: string
  next: string
  noSelection: string
  previous: string
  search: string
  showAll: string
}

const VARIANTS: { key: VariantKey; name: string }[] = [
  { key: 'A', name: 'Active shelf + palette' },
  { key: 'B', name: 'Disclosure checklist' },
  { key: 'C', name: 'Paged package rail' },
  { key: 'D', name: 'Wrap-on-demand band' },
]

const COPY: Record<'en' | 'sv', PrototypeCopy> = {
  en: {
    active: 'active',
    allPackages: 'All requirements packages',
    browse: 'Choose packages',
    clear: 'Clear package filter',
    collapse: 'Show fewer',
    filterLabel: 'Requirements packages',
    next: 'Next packages',
    noSelection: 'No package filter active',
    previous: 'Previous packages',
    search: 'Search requirements packages',
    showAll: 'Show all packages',
  },
  sv: {
    active: 'aktiva',
    allPackages: 'Alla kravpaket',
    browse: 'Välj kravpaket',
    clear: 'Rensa kravpaketsfilter',
    collapse: 'Visa färre',
    filterLabel: 'Kravpaket',
    next: 'Nästa kravpaket',
    noSelection: 'Inget kravpaketsfilter aktivt',
    previous: 'Föregående kravpaket',
    search: 'Sök kravpaket',
    showAll: 'Visa alla kravpaket',
  },
}

function packageName(pkg: RequirementPackageOption): string {
  return pkg.name.trim() || String(pkg.id)
}

function PrototypeChip({
  active,
  onClick,
  pkg,
}: {
  active: boolean
  onClick: () => void
  pkg: RequirementPackageOption
}) {
  return (
    <button
      aria-label={packageName(pkg)}
      aria-pressed={active}
      className={`inline-flex min-h-8 max-w-52 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
        active
          ? 'border-primary-600 bg-primary-600 text-white'
          : 'border-secondary-200 bg-white text-secondary-700 hover:bg-secondary-100 dark:border-secondary-700 dark:bg-secondary-900 dark:text-secondary-200 dark:hover:bg-secondary-800'
      }`}
      onClick={onClick}
      title={pkg.purposeAndScope ?? undefined}
      type="button"
    >
      {active && <Check aria-hidden="true" className="h-3 w-3 shrink-0" />}
      <span className="truncate">{packageName(pkg)}</span>
    </button>
  )
}

export default function RequirementsPackageFilterPrototype({
  locale,
  onChange,
  packages,
  selectedIds,
}: RequirementsPackageFilterPrototypeProps) {
  // PROTOTYPE: Four requirements package filter variants, switchable with
  // ?variant=A|B|C|D on the existing Requirements Library route.
  const copy = COPY[locale === 'sv' ? 'sv' : 'en']
  const [variant, setVariant] = useState<VariantKey>('A')
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [disclosureOpen, setDisclosureOpen] = useState(false)
  const [wrapOpen, setWrapOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [railPage, setRailPage] = useState(0)
  const pageSize = 4
  const pageCount = Math.max(1, Math.ceil(packages.length / pageSize))

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const activePackages = selectedIds
    .map(id => packages.find(pkg => pkg.id === id))
    .filter((pkg): pkg is RequirementPackageOption => Boolean(pkg))
  const filteredPackages = packages.filter(pkg =>
    packageName(pkg)
      .toLocaleLowerCase(locale)
      .includes(query.trim().toLocaleLowerCase(locale)),
  )
  const visibleRailPackages = packages.slice(
    railPage * pageSize,
    railPage * pageSize + pageSize,
  )

  const toggle = (id: number) => {
    onChange(
      selectedSet.has(id)
        ? selectedIds.filter(selectedId => selectedId !== id)
        : [...selectedIds, id],
    )
  }

  const chooseVariant = useCallback((next: VariantKey) => {
    const params = new URLSearchParams(window.location.search)
    params.set('variant', next)
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}?${params.toString()}${window.location.hash}`,
    )
    setVariant(next)
  }, [])

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('variant')
    if (VARIANTS.some(option => option.key === requested)) {
      setVariant(requested as VariantKey)
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (
        target?.matches('input, textarea, select, [contenteditable="true"]') ||
        (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')
      ) {
        return
      }

      const currentIndex = VARIANTS.findIndex(option => option.key === variant)
      const direction = event.key === 'ArrowRight' ? 1 : -1
      const nextIndex =
        (currentIndex + direction + VARIANTS.length) % VARIANTS.length
      chooseVariant(VARIANTS[nextIndex].key)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [chooseVariant, variant])

  const activeSummary =
    activePackages.length > 0
      ? activePackages.map(packageName).join(', ')
      : copy.noSelection

  return (
    <>
      <section
        aria-label={copy.filterLabel}
        className={`relative z-40 border-b border-secondary-200 bg-white/90 px-3 py-2 text-sm backdrop-blur-sm dark:border-secondary-700 dark:bg-secondary-900/90 ${
          activePackages.length > 0 && variant !== 'A' ? 'pr-11' : ''
        }`}
        {...devMarker({
          name: 'requirements package filter prototype',
          priority: 330,
          value: `variant ${variant}: ${VARIANTS.find(option => option.key === variant)?.name}`,
        })}
      >
        {variant === 'A' && (
          <div className="relative flex min-w-0 flex-wrap items-center gap-2 sm:flex-nowrap">
            <span className="shrink-0 text-xs font-semibold text-secondary-600 dark:text-secondary-300">
              {copy.filterLabel}
            </span>
            <div className="order-3 flex w-full min-w-0 basis-full flex-none gap-1 overflow-x-auto py-0.5 sm:order-none sm:w-auto sm:basis-auto sm:flex-1">
              {activePackages.length === 0 ? (
                <span className="self-center text-xs text-secondary-500 dark:text-secondary-400">
                  {copy.noSelection}
                </span>
              ) : (
                activePackages.map(pkg => (
                  <PrototypeChip
                    active
                    key={pkg.id}
                    onClick={() => toggle(pkg.id)}
                    pkg={pkg}
                  />
                ))
              )}
            </div>
            <button
              aria-expanded={paletteOpen}
              className="ml-auto inline-flex min-h-8 shrink-0 items-center gap-1 rounded-md border border-secondary-300 bg-white px-2 text-xs font-medium text-secondary-700 hover:bg-secondary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:border-secondary-600 dark:bg-secondary-800 dark:text-secondary-100 dark:hover:bg-secondary-700"
              onClick={() => setPaletteOpen(open => !open)}
              type="button"
            >
              {copy.browse}
              <ChevronsUpDown aria-hidden="true" className="h-3 w-3" />
            </button>
            {paletteOpen && (
              <div className="absolute top-full right-0 z-20 mt-2 w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-secondary-200 bg-white p-2 shadow-xl dark:border-secondary-700 dark:bg-secondary-900">
                <label className="flex min-h-9 items-center gap-2 rounded-lg border border-secondary-300 px-2 dark:border-secondary-600">
                  <Search aria-hidden="true" className="h-4 w-4" />
                  <span className="sr-only">{copy.search}</span>
                  <input
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                    onChange={event => setQuery(event.target.value)}
                    placeholder={copy.search}
                    value={query}
                  />
                </label>
                <div className="mt-2 grid max-h-64 gap-1 overflow-y-auto sm:grid-cols-2">
                  {filteredPackages.map(pkg => (
                    <button
                      aria-pressed={selectedSet.has(pkg.id)}
                      className="flex min-h-9 items-center gap-2 rounded-lg px-2 text-left text-xs hover:bg-secondary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:hover:bg-secondary-800"
                      key={pkg.id}
                      onClick={() => toggle(pkg.id)}
                      type="button"
                    >
                      <span
                        className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                          selectedSet.has(pkg.id)
                            ? 'border-primary-600 bg-primary-600 text-white'
                            : 'border-secondary-400'
                        }`}
                      >
                        {selectedSet.has(pkg.id) && (
                          <Check aria-hidden="true" className="h-3 w-3" />
                        )}
                      </span>
                      {packageName(pkg)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {variant === 'B' && (
          <div>
            <button
              aria-expanded={disclosureOpen}
              className="flex min-h-9 w-full flex-wrap items-center gap-2 rounded-lg px-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 sm:flex-nowrap"
              onClick={() => setDisclosureOpen(open => !open)}
              type="button"
            >
              <span className="font-semibold">{copy.filterLabel}</span>
              <span className="order-3 w-full min-w-0 basis-full flex-none truncate text-xs text-secondary-500 sm:order-none sm:w-auto sm:basis-auto sm:flex-1 dark:text-secondary-400">
                {activeSummary}
              </span>
              {activePackages.length > 0 && (
                <span className="ml-auto rounded-full bg-primary-100 px-2 py-0.5 text-xs font-semibold text-primary-800 sm:ml-0 dark:bg-primary-900 dark:text-primary-100">
                  {activePackages.length} {copy.active}
                </span>
              )}
              <ChevronDown
                aria-hidden="true"
                className={`h-4 w-4 transition-transform ${disclosureOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {disclosureOpen && (
              <div className="mt-2 grid max-h-56 gap-1 overflow-y-auto border-t border-secondary-200 pt-2 sm:grid-cols-2 lg:grid-cols-3 dark:border-secondary-700">
                {packages.map(pkg => (
                  <button
                    aria-pressed={selectedSet.has(pkg.id)}
                    className={`flex min-h-9 items-center gap-2 rounded-lg border px-2 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                      selectedSet.has(pkg.id)
                        ? 'border-primary-500 bg-primary-50 text-primary-900 dark:bg-primary-950 dark:text-primary-100'
                        : 'border-transparent hover:bg-secondary-100 dark:hover:bg-secondary-800'
                    }`}
                    key={pkg.id}
                    onClick={() => toggle(pkg.id)}
                    type="button"
                  >
                    <span
                      className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                        selectedSet.has(pkg.id)
                          ? 'border-primary-600 bg-primary-600 text-white'
                          : 'border-secondary-400'
                      }`}
                    >
                      {selectedSet.has(pkg.id) && (
                        <Check aria-hidden="true" className="h-3 w-3" />
                      )}
                    </span>
                    <span className="truncate">{packageName(pkg)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {variant === 'C' && (
          <div>
            <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:flex-nowrap">
              <span className="mr-1 shrink-0 text-xs font-semibold text-secondary-600 dark:text-secondary-300">
                {copy.filterLabel}
              </span>
              <button
                aria-label={copy.previous}
                className="ml-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-secondary-300 hover:bg-secondary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 sm:ml-0 dark:border-secondary-600 dark:hover:bg-secondary-800"
                onClick={() =>
                  setRailPage(page => (page - 1 + pageCount) % pageCount)
                }
                type="button"
              >
                <ChevronLeft aria-hidden="true" className="h-4 w-4" />
              </button>
              <div className="order-3 mt-1 grid w-full min-w-0 basis-full flex-none grid-cols-2 gap-1 sm:order-none sm:mt-0 sm:w-auto sm:basis-auto sm:flex-1 sm:grid-cols-4">
                {visibleRailPackages.map(pkg => (
                  <PrototypeChip
                    active={selectedSet.has(pkg.id)}
                    key={pkg.id}
                    onClick={() => toggle(pkg.id)}
                    pkg={pkg}
                  />
                ))}
              </div>
              <span className="shrink-0 text-[10px] tabular-nums text-secondary-500">
                {railPage + 1}/{pageCount}
              </span>
              <button
                aria-label={copy.next}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-secondary-300 hover:bg-secondary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:border-secondary-600 dark:hover:bg-secondary-800"
                onClick={() => setRailPage(page => (page + 1) % pageCount)}
                type="button"
              >
                <ChevronRight aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
            {activePackages.length > 0 && (
              <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[10px] text-secondary-500 dark:text-secondary-400">
                <span className="shrink-0 font-semibold">
                  {activePackages.length} {copy.active}:
                </span>
                <span className="min-w-0 overflow-x-auto whitespace-nowrap">
                  {activeSummary}
                </span>
              </div>
            )}
          </div>
        )}

        {variant === 'D' && (
          <div>
            <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
              <span className="shrink-0 text-xs font-semibold text-secondary-600 dark:text-secondary-300">
                {copy.filterLabel}
              </span>
              <div className="order-3 flex w-full min-w-0 basis-full flex-none gap-1 overflow-x-auto sm:order-none sm:w-auto sm:basis-auto sm:flex-1">
                {activePackages.length > 0 ? (
                  activePackages.map(pkg => (
                    <PrototypeChip
                      active
                      key={pkg.id}
                      onClick={() => toggle(pkg.id)}
                      pkg={pkg}
                    />
                  ))
                ) : (
                  <span className="self-center text-xs text-secondary-500 dark:text-secondary-400">
                    {copy.noSelection}
                  </span>
                )}
              </div>
              <button
                aria-expanded={wrapOpen}
                className="ml-auto inline-flex min-h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium text-primary-700 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-primary-300 dark:hover:bg-primary-950"
                onClick={() => setWrapOpen(open => !open)}
                type="button"
              >
                {wrapOpen ? copy.collapse : copy.showAll}
                <ChevronDown
                  aria-hidden="true"
                  className={`h-3 w-3 transition-transform ${wrapOpen ? 'rotate-180' : ''}`}
                />
              </button>
            </div>
            {wrapOpen && (
              <div className="mt-2 flex max-h-44 flex-wrap gap-1 overflow-y-auto border-t border-secondary-200 pt-2 dark:border-secondary-700">
                {packages.map(pkg => (
                  <PrototypeChip
                    active={selectedSet.has(pkg.id)}
                    key={pkg.id}
                    onClick={() => toggle(pkg.id)}
                    pkg={pkg}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {activePackages.length > 0 && variant !== 'A' && (
          <button
            aria-label={copy.clear}
            className="absolute top-1/2 right-3 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-secondary-400 hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:hover:bg-red-950"
            onClick={() => onChange([])}
            title={copy.clear}
            type="button"
          >
            <X aria-hidden="true" className="h-3 w-3" />
          </button>
        )}
      </section>

      {process.env.NODE_ENV !== 'production' && (
        <aside className="fixed bottom-4 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-1 rounded-full bg-secondary-950 p-1.5 text-white shadow-2xl">
          <button
            aria-label="Previous prototype variant"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            onClick={() => {
              const index = VARIANTS.findIndex(option => option.key === variant)
              chooseVariant(
                VARIANTS[(index - 1 + VARIANTS.length) % VARIANTS.length].key,
              )
            }}
            type="button"
          >
            <ChevronLeft aria-hidden="true" className="h-4 w-4" />
          </button>
          <div className="min-w-0 px-2 text-center">
            <div className="truncate text-xs font-semibold">
              {variant} —{' '}
              {VARIANTS.find(option => option.key === variant)?.name}
            </div>
            <div className="truncate text-[10px] text-secondary-300">
              State: {activePackages.length}/{packages.length} active
              {activePackages.length > 0 ? ` — ${activeSummary}` : ''}
            </div>
          </div>
          <button
            aria-label="Next prototype variant"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            onClick={() => {
              const index = VARIANTS.findIndex(option => option.key === variant)
              chooseVariant(VARIANTS[(index + 1) % VARIANTS.length].key)
            }}
            type="button"
          >
            <ChevronRight aria-hidden="true" className="h-4 w-4" />
          </button>
        </aside>
      )}
    </>
  )
}

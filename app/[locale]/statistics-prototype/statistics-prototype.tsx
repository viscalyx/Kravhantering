'use client'

import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Filter,
  Info,
  LayoutDashboard,
  ListFilter,
  Rows3,
  TableProperties,
} from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter } from '@/i18n/routing'
import { devMarker } from '@/lib/developer-mode-markers'

// PROTOTYPE — three statistics presentation strategies on one throwaway route,
// switchable with ?variant=A|B|C and ?surface=library|specification|access-review.

type Surface = 'access-review' | 'library' | 'specification'
type Variant = 'A' | 'B' | 'C'

interface ActionItem {
  age: string
  id: string
  reason: string
  title: string
}

interface GroupValue {
  label: string
  value: number
}

interface Metric {
  detail: string
  label: string
  value: string
}

interface SurfaceData {
  actions: ActionItem[]
  description: string
  filters: string[]
  groups: GroupValue[]
  metrics: Metric[]
  name: string
  population: string
  question: string
}

const VARIANTS: Variant[] = ['A', 'B', 'C']
const SURFACES: Surface[] = ['library', 'specification', 'access-review']

function isVariant(value: string | null): value is Variant {
  return value === 'A' || value === 'B' || value === 'C'
}

function isSurface(value: string | null): value is Surface {
  return (
    value === 'library' ||
    value === 'specification' ||
    value === 'access-review'
  )
}

function maxGroupValue(groups: GroupValue[]): number {
  return Math.max(...groups.map(group => group.value), 1)
}

function PrototypeSwitcher({
  current,
  onChange,
  variantName,
}: {
  current: Variant
  onChange: (variant: Variant) => void
  variantName: string
}) {
  const t = useTranslations('statisticsPrototype')
  const currentIndex = VARIANTS.indexOf(current)

  const cycle = useCallback(
    (direction: -1 | 1) => {
      const nextIndex =
        (currentIndex + direction + VARIANTS.length) % VARIANTS.length
      onChange(VARIANTS[nextIndex])
    },
    [currentIndex, onChange],
  )

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return
      }
      if (event.key === 'ArrowLeft') cycle(-1)
      if (event.key === 'ArrowRight') cycle(1)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [cycle])

  if (process.env.NODE_ENV === 'production') return null

  return (
    <aside
      aria-label={t('switcherLabel')}
      className="fixed inset-x-0 bottom-4 z-50 mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-2 rounded-full border border-secondary-700 bg-secondary-950 px-2 py-2 text-white shadow-2xl dark:border-secondary-200"
    >
      <button
        aria-label={t('previousVariant')}
        className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-full hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        onClick={() => cycle(-1)}
        type="button"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
      </button>
      <p className="min-w-0 px-2 text-center text-xs font-semibold sm:text-sm">
        <span className="block text-[10px] uppercase tracking-[0.16em] text-secondary-300">
          {t('prototypeSwitcher')}
        </span>
        <span className="block truncate">
          {current} — {variantName}
        </span>
      </p>
      <button
        aria-label={t('nextVariant')}
        className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-full hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        onClick={() => cycle(1)}
        type="button"
      >
        <ArrowRight aria-hidden="true" className="h-4 w-4" />
      </button>
    </aside>
  )
}

function SurfaceSelector({
  current,
  data,
  onChange,
}: {
  current: Surface
  data: Record<Surface, SurfaceData>
  onChange: (surface: Surface) => void
}) {
  const t = useTranslations('statisticsPrototype')
  return (
    <div
      aria-label={t('surfaceSelector')}
      className="flex gap-2 overflow-x-auto pb-1"
      role="tablist"
    >
      {SURFACES.map(surface => (
        <button
          aria-selected={surface === current}
          className={`min-h-9 shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
            surface === current
              ? 'border-primary-600 bg-primary-600 text-white dark:border-primary-400 dark:bg-primary-400 dark:text-secondary-950'
              : 'border-secondary-300 bg-white text-secondary-700 hover:bg-secondary-50 dark:border-secondary-700 dark:bg-secondary-900 dark:text-secondary-200 dark:hover:bg-secondary-800'
          }`}
          key={surface}
          onClick={() => onChange(surface)}
          role="tab"
          type="button"
        >
          {data[surface].name}
        </button>
      ))}
    </div>
  )
}

function FilterSummary({ data }: { data: SurfaceData }) {
  const t = useTranslations('statisticsPrototype')
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="inline-flex min-h-8 items-center gap-1.5 font-medium text-secondary-700 dark:text-secondary-200">
        <Filter aria-hidden="true" className="h-4 w-4" />
        {t('activeFilters')}
      </span>
      {data.filters.map(filter => (
        <span
          className="inline-flex min-h-8 items-center rounded-full border border-secondary-300 bg-white px-3 text-secondary-700 dark:border-secondary-700 dark:bg-secondary-900 dark:text-secondary-200"
          key={filter}
        >
          {filter}
        </span>
      ))}
      <span className="text-secondary-500 dark:text-secondary-400">
        {data.population}
      </span>
    </div>
  )
}

function MetricGrid({ metrics }: { metrics: Metric[] }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map(metric => (
        <div
          className="rounded-xl border border-secondary-200 bg-white p-4 shadow-sm dark:border-secondary-700 dark:bg-secondary-900"
          key={metric.label}
        >
          <dt className="text-sm font-medium text-secondary-600 dark:text-secondary-300">
            {metric.label}
          </dt>
          <dd className="mt-2 text-3xl font-bold text-secondary-950 dark:text-white">
            {metric.value}
          </dd>
          <dd className="mt-1 text-xs leading-5 text-secondary-500 dark:text-secondary-400">
            {metric.detail}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function BarList({ groups }: { groups: GroupValue[] }) {
  const max = maxGroupValue(groups)
  return (
    <ul className="space-y-3">
      {groups.map(group => (
        <li
          className="grid grid-cols-[minmax(7rem,1fr)_3fr_3rem] items-center gap-3"
          key={group.label}
        >
          <span className="truncate text-sm text-secondary-700 dark:text-secondary-200">
            {group.label}
          </span>
          <span className="h-3 overflow-hidden rounded-full bg-secondary-100 dark:bg-secondary-800">
            <span
              className="block h-full rounded-full bg-primary-600 dark:bg-primary-400"
              style={{ width: `${Math.max((group.value / max) * 100, 3)}%` }}
            />
          </span>
          <strong className="text-right text-sm text-secondary-900 dark:text-secondary-100">
            {group.value}
          </strong>
        </li>
      ))}
    </ul>
  )
}

function GroupTable({ groups }: { groups: GroupValue[] }) {
  const total = groups.reduce((sum, group) => sum + group.value, 0)
  const t = useTranslations('statisticsPrototype')
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-secondary-200 dark:border-secondary-700">
            <th className="px-3 py-2 font-semibold" scope="col">
              {t('group')}
            </th>
            <th className="px-3 py-2 text-right font-semibold" scope="col">
              {t('count')}
            </th>
            <th className="px-3 py-2 text-right font-semibold" scope="col">
              {t('share')}
            </th>
          </tr>
        </thead>
        <tbody>
          {groups.map(group => (
            <tr
              className="border-b border-secondary-100 dark:border-secondary-800"
              key={group.label}
            >
              <th className="px-3 py-2 font-medium" scope="row">
                {group.label}
              </th>
              <td className="px-3 py-2 text-right">{group.value}</td>
              <td className="px-3 py-2 text-right">
                {total === 0
                  ? '—'
                  : `${Math.round((group.value / total) * 100)} %`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ActionTable({ actions }: { actions: ActionItem[] }) {
  const t = useTranslations('statisticsPrototype')
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[42rem] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-secondary-200 text-secondary-600 dark:border-secondary-700 dark:text-secondary-300">
            <th className="px-3 py-3 font-semibold" scope="col">
              {t('object')}
            </th>
            <th className="px-3 py-3 font-semibold" scope="col">
              {t('followUpReason')}
            </th>
            <th className="px-3 py-3 font-semibold" scope="col">
              {t('currentAge')}
            </th>
            <th className="px-3 py-3 text-right font-semibold" scope="col">
              {t('nextAction')}
            </th>
          </tr>
        </thead>
        <tbody>
          {actions.map(action => (
            <tr
              className="border-b border-secondary-100 dark:border-secondary-800"
              key={action.id}
            >
              <th
                className="px-3 py-3 font-mono font-semibold text-secondary-900 dark:text-secondary-100"
                scope="row"
              >
                <span className="block font-sans">{action.title}</span>
                <span className="text-xs font-normal text-secondary-500 dark:text-secondary-400">
                  {action.id}
                </span>
              </th>
              <td className="px-3 py-3 text-secondary-700 dark:text-secondary-200">
                {action.reason}
              </td>
              <td className="px-3 py-3 text-secondary-700 dark:text-secondary-200">
                {action.age}
              </td>
              <td className="px-3 py-3 text-right">
                <button
                  className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 font-semibold text-primary-700 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-primary-300 dark:hover:bg-primary-950"
                  type="button"
                >
                  {t('open')}
                  <ChevronRight aria-hidden="true" className="h-4 w-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Explanation({ data }: { data: SurfaceData }) {
  const t = useTranslations('statisticsPrototype')
  return (
    <details className="rounded-xl border border-secondary-200 bg-secondary-50 p-4 text-sm dark:border-secondary-700 dark:bg-secondary-900/70">
      <summary className="cursor-pointer font-semibold text-secondary-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-secondary-100">
        {t('howCalculated')}
      </summary>
      <p className="mt-3 leading-6 text-secondary-700 dark:text-secondary-200">
        {t('calculationExplanation', { population: data.population })}
      </p>
    </details>
  )
}

function VariantA({ data }: { data: SurfaceData }) {
  const t = useTranslations('statisticsPrototype')
  const [tableMode, setTableMode] = useState(false)
  return (
    <div className="space-y-5">
      <section
        aria-labelledby="variant-a-actions"
        className="rounded-2xl border border-secondary-200 bg-white shadow-sm dark:border-secondary-700 dark:bg-secondary-900"
      >
        <div className="flex flex-col gap-3 border-b border-secondary-200 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-secondary-700">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-700 dark:text-primary-300">
              {t('recommendedNext')}
            </p>
            <h2
              className="mt-1 text-xl font-bold text-secondary-950 dark:text-white"
              id="variant-a-actions"
            >
              {t('needsAttention')}
            </h2>
          </div>
          <button
            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-secondary-300 px-3 text-sm font-semibold text-secondary-700 hover:bg-secondary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:border-secondary-700 dark:text-secondary-200 dark:hover:bg-secondary-800"
            type="button"
          >
            <ListFilter aria-hidden="true" className="h-4 w-4" />
            {t('openFilteredList')}
          </button>
        </div>
        <ActionTable actions={data.actions} />
      </section>

      <MetricGrid metrics={data.metrics} />

      <section
        aria-labelledby="variant-a-distribution"
        className="rounded-2xl border border-secondary-200 bg-white p-4 shadow-sm dark:border-secondary-700 dark:bg-secondary-900"
      >
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2
              className="text-lg font-bold text-secondary-950 dark:text-white"
              id="variant-a-distribution"
            >
              {t('distribution')}
            </h2>
            <p className="mt-1 text-sm text-secondary-600 dark:text-secondary-300">
              {data.question}
            </p>
          </div>
          <button
            aria-pressed={tableMode}
            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-secondary-300 px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:border-secondary-700"
            onClick={() => setTableMode(value => !value)}
            type="button"
          >
            {tableMode ? (
              <BarChart3 aria-hidden="true" className="h-4 w-4" />
            ) : (
              <TableProperties aria-hidden="true" className="h-4 w-4" />
            )}
            {tableMode ? t('showChart') : t('showTable')}
          </button>
        </div>
        {tableMode ? (
          <GroupTable groups={data.groups} />
        ) : (
          <BarList groups={data.groups} />
        )}
      </section>
      <Explanation data={data} />
    </div>
  )
}

function VariantB({ data }: { data: SurfaceData }) {
  const t = useTranslations('statisticsPrototype')
  return (
    <div className="grid gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside
        aria-label={t('questionNavigation')}
        className="self-start rounded-2xl border border-secondary-200 bg-white p-3 shadow-sm lg:sticky lg:top-6 dark:border-secondary-700 dark:bg-secondary-900"
      >
        <p className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-secondary-500 dark:text-secondary-400">
          {t('userQuestions')}
        </p>
        {[
          t('questionAction'),
          t('questionDistribution'),
          t('questionDetails'),
        ].map((label, index) => (
          <button
            className={`mt-1 flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${index === 0 ? 'bg-primary-50 text-primary-800 dark:bg-primary-950 dark:text-primary-200' : 'text-secondary-700 hover:bg-secondary-50 dark:text-secondary-200 dark:hover:bg-secondary-800'}`}
            key={label}
            type="button"
          >
            {index === 0 ? (
              <CircleAlert aria-hidden="true" className="h-4 w-4" />
            ) : index === 1 ? (
              <BarChart3 aria-hidden="true" className="h-4 w-4" />
            ) : (
              <Rows3 aria-hidden="true" className="h-4 w-4" />
            )}
            {label}
          </button>
        ))}
      </aside>

      <div className="min-w-0 space-y-5">
        <section
          aria-labelledby="variant-b-focus"
          className="rounded-2xl border border-primary-200 bg-primary-50/70 p-5 dark:border-primary-900 dark:bg-primary-950/30"
        >
          <p className="text-sm font-semibold text-primary-800 dark:text-primary-200">
            {t('currentQuestion')}
          </p>
          <h2
            className="mt-2 max-w-3xl text-2xl font-bold text-secondary-950 dark:text-white"
            id="variant-b-focus"
          >
            {data.question}
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-secondary-700 dark:text-secondary-200">
            {t('answerLead', { count: data.actions.length })}
          </p>
          <div className="mt-5 rounded-xl bg-white p-4 dark:bg-secondary-900">
            <BarList groups={data.groups} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-primary-700 px-3 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:bg-primary-400 dark:text-secondary-950"
              type="button"
            >
              <ListFilter aria-hidden="true" className="h-4 w-4" />
              {t('openMatchingObjects')}
            </button>
            <button
              className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-secondary-300 bg-white px-3 text-sm font-semibold text-secondary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:border-secondary-700 dark:bg-secondary-900 dark:text-secondary-200"
              type="button"
            >
              <TableProperties aria-hidden="true" className="h-4 w-4" />
              {t('showExactValues')}
            </button>
          </div>
        </section>

        <section
          aria-labelledby="variant-b-queue"
          className="rounded-2xl border border-secondary-200 bg-white shadow-sm dark:border-secondary-700 dark:bg-secondary-900"
        >
          <div className="border-b border-secondary-200 p-4 dark:border-secondary-700">
            <h2
              className="text-lg font-bold text-secondary-950 dark:text-white"
              id="variant-b-queue"
            >
              {t('matchingQueue')}
            </h2>
          </div>
          <ActionTable actions={data.actions} />
        </section>

        <div className="grid gap-3 sm:grid-cols-2">
          <Explanation data={data} />
          <div className="rounded-xl border border-secondary-200 bg-white p-4 text-sm dark:border-secondary-700 dark:bg-secondary-900">
            <p className="flex items-center gap-2 font-semibold text-secondary-900 dark:text-secondary-100">
              <CheckCircle2
                aria-hidden="true"
                className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
              />
              {t('authorizationBoundary')}
            </p>
            <p className="mt-2 leading-6 text-secondary-700 dark:text-secondary-200">
              {t('authorizationExplanation')}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function VariantC({ data }: { data: SurfaceData }) {
  const t = useTranslations('statisticsPrototype')
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <section
        aria-labelledby="variant-c-list"
        className="min-w-0 rounded-2xl border border-secondary-200 bg-white shadow-sm dark:border-secondary-700 dark:bg-secondary-900"
      >
        <div className="border-b border-secondary-200 p-4 dark:border-secondary-700">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-secondary-500 dark:text-secondary-400">
                {t('existingWorkSurface')}
              </p>
              <h2
                className="mt-1 text-xl font-bold text-secondary-950 dark:text-white"
                id="variant-c-list"
              >
                {t('filteredObjects')}
              </h2>
            </div>
            <button
              className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-primary-300 bg-primary-50 px-3 text-sm font-semibold text-primary-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:border-primary-800 dark:bg-primary-950 dark:text-primary-200"
              type="button"
            >
              <LayoutDashboard aria-hidden="true" className="h-4 w-4" />
              {t('statisticsOpen')}
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-px border-b border-secondary-200 bg-secondary-200 sm:grid-cols-4 dark:border-secondary-700 dark:bg-secondary-700">
          {data.metrics.map(metric => (
            <div
              className="bg-secondary-50 px-4 py-3 dark:bg-secondary-800"
              key={metric.label}
            >
              <p className="text-xs text-secondary-500 dark:text-secondary-400">
                {metric.label}
              </p>
              <p className="mt-1 text-xl font-bold text-secondary-950 dark:text-white">
                {metric.value}
              </p>
            </div>
          ))}
        </div>
        <ActionTable actions={data.actions} />
      </section>

      <aside
        aria-labelledby="variant-c-insights"
        className="space-y-4 self-start rounded-2xl border border-secondary-200 bg-white p-4 shadow-lg xl:sticky xl:top-6 dark:border-secondary-700 dark:bg-secondary-900"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-700 dark:text-primary-300">
              {t('contextualStatistics')}
            </p>
            <h2
              className="mt-1 text-lg font-bold text-secondary-950 dark:text-white"
              id="variant-c-insights"
            >
              {t('insightRail')}
            </h2>
          </div>
          <Info aria-hidden="true" className="h-5 w-5 text-secondary-500" />
        </div>
        <p className="text-sm leading-6 text-secondary-700 dark:text-secondary-200">
          {data.question}
        </p>
        <BarList groups={data.groups} />
        <button
          className="inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-lg bg-primary-700 px-3 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:bg-primary-400 dark:text-secondary-950"
          type="button"
        >
          {t('openFullStatistics')}
          <ChevronRight aria-hidden="true" className="h-4 w-4" />
        </button>
        <Explanation data={data} />
      </aside>
    </div>
  )
}

export default function StatisticsPrototype() {
  const t = useTranslations('statisticsPrototype')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const variantParam = searchParams.get('variant')
  const surfaceParam = searchParams.get('surface')
  const variant: Variant = isVariant(variantParam) ? variantParam : 'A'
  const surface: Surface = isSurface(surfaceParam) ? surfaceParam : 'library'

  const data = useMemo<Record<Surface, SurfaceData>>(
    () => ({
      library: {
        name: t('library.name'),
        description: t('library.description'),
        population: t('library.population'),
        question: t('library.question'),
        filters: [t('library.filterArea'), t('library.filterStatus')],
        metrics: [
          {
            label: t('library.metricTotal'),
            value: '248',
            detail: t('library.metricTotalDetail'),
          },
          {
            label: t('library.metricUsed'),
            value: '71 %',
            detail: t('library.metricUsedDetail'),
          },
          {
            label: t('library.metricParallel'),
            value: '18',
            detail: t('library.metricParallelDetail'),
          },
          {
            label: t('library.metricGaps'),
            value: '23',
            detail: t('library.metricGapsDetail'),
          },
        ],
        groups: [
          { label: t('library.groupSecurity'), value: 92 },
          { label: t('library.groupInformation'), value: 64 },
          { label: t('library.groupIntegration'), value: 51 },
          { label: t('library.groupOther'), value: 41 },
        ],
        actions: [
          {
            id: 'SEC-0142',
            title: t('library.actionOne'),
            reason: t('library.reasonOne'),
            age: `34 ${t('days')}`,
          },
          {
            id: 'SEC-0188',
            title: t('library.actionTwo'),
            reason: t('library.reasonTwo'),
            age: `12 ${t('days')}`,
          },
          {
            id: 'INF-0067',
            title: t('library.actionThree'),
            reason: t('library.reasonThree'),
            age: '—',
          },
        ],
      },
      specification: {
        name: t('specification.name'),
        description: t('specification.description'),
        population: t('specification.population'),
        question: t('specification.question'),
        filters: [
          t('specification.filterStatus'),
          t('specification.filterOrigin'),
        ],
        metrics: [
          {
            label: t('specification.metricTotal'),
            value: '137',
            detail: t('specification.metricTotalDetail'),
          },
          {
            label: t('specification.metricFollowUp'),
            value: '24',
            detail: t('specification.metricFollowUpDetail'),
          },
          {
            label: t('specification.metricAge'),
            value: `18 ${t('days')}`,
            detail: t('specification.metricAgeDetail'),
          },
          {
            label: t('specification.metricVersion'),
            value: '9',
            detail: t('specification.metricVersionDetail'),
          },
        ],
        groups: [
          { label: t('specification.groupNeeds'), value: 11 },
          { label: t('specification.groupPriority'), value: 7 },
          { label: t('specification.groupMethod'), value: 4 },
          { label: t('specification.groupCriteria'), value: 2 },
        ],
        actions: [
          {
            id: 'REQ-2026-014',
            title: t('specification.actionOne'),
            reason: t('specification.reasonOne'),
            age: `96 ${t('days')}`,
          },
          {
            id: 'REQ-2026-031',
            title: t('specification.actionTwo'),
            reason: t('specification.reasonTwo'),
            age: `42 ${t('days')}`,
          },
          {
            id: 'LOCAL-008',
            title: t('specification.actionThree'),
            reason: t('specification.reasonThree'),
            age: `8 ${t('days')}`,
          },
        ],
      },
      'access-review': {
        name: t('accessReview.name'),
        description: t('accessReview.description'),
        population: t('accessReview.population'),
        question: t('accessReview.question'),
        filters: [
          t('accessReview.filterStatus'),
          t('accessReview.filterContext'),
        ],
        metrics: [
          {
            label: t('accessReview.metricOpen'),
            value: '7',
            detail: t('accessReview.metricOpenDetail'),
          },
          {
            label: t('accessReview.metricOverdue'),
            value: '2',
            detail: t('accessReview.metricOverdueDetail'),
          },
          {
            label: t('accessReview.metricPending'),
            value: '43',
            detail: t('accessReview.metricPendingDetail'),
          },
          {
            label: t('accessReview.metricEmpty'),
            value: '1',
            detail: t('accessReview.metricEmptyDetail'),
          },
        ],
        groups: [
          { label: t('accessReview.groupArea'), value: 24 },
          { label: t('accessReview.groupSpecification'), value: 13 },
          { label: t('accessReview.groupPackage'), value: 6 },
        ],
        actions: [
          {
            id: 'BÖ-2026-021',
            title: t('accessReview.actionOne'),
            reason: t('accessReview.reasonOne'),
            age: `5 ${t('days')}`,
          },
          {
            id: 'BÖ-2026-019',
            title: t('accessReview.actionTwo'),
            reason: t('accessReview.reasonTwo'),
            age: `2 ${t('days')}`,
          },
          {
            id: 'BÖ-2026-024',
            title: t('accessReview.actionThree'),
            reason: t('accessReview.reasonThree'),
            age: '—',
          },
        ],
      },
    }),
    [t],
  )

  const replaceParam = useCallback(
    (key: 'surface' | 'variant', value: string) => {
      const next = new URLSearchParams(searchParams.toString())
      next.set(key, value)
      router.replace(`${pathname}?${next.toString()}`, { scroll: false })
    },
    [pathname, router, searchParams],
  )

  const variantNames: Record<Variant, string> = {
    A: t('variantAName'),
    B: t('variantBName'),
    C: t('variantCName'),
  }
  const selected = data[surface]

  return (
    <>
      <div
        {...devMarker({
          context: 'statistics prototype',
          name: 'prototype surface',
          priority: 500,
          value: `${variant} ${surface}`,
        })}
        className="section-padding px-4 pb-28 sm:px-6 lg:px-8"
      >
        <div className="container-custom max-w-none space-y-5">
          <header className="space-y-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700 dark:text-primary-300">
                  {t('prototypeEyebrow')}
                </p>
                <h1 className="mt-2 text-3xl font-bold text-secondary-950 dark:text-white">
                  {selected.name}
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-secondary-700 dark:text-secondary-200">
                  {selected.description}
                </p>
              </div>
              <SurfaceSelector
                current={surface}
                data={data}
                onChange={next => replaceParam('surface', next)}
              />
            </div>
            <div className="rounded-xl border border-secondary-200 bg-secondary-50 p-3 dark:border-secondary-700 dark:bg-secondary-900/70">
              <FilterSummary data={selected} />
              <p className="mt-2 text-xs text-secondary-500 dark:text-secondary-400">
                {t('calculatedAt')}
              </p>
            </div>
          </header>

          {variant === 'A' ? <VariantA data={selected} /> : null}
          {variant === 'B' ? <VariantB data={selected} /> : null}
          {variant === 'C' ? <VariantC data={selected} /> : null}
        </div>
      </div>
      <PrototypeSwitcher
        current={variant}
        onChange={next => replaceParam('variant', next)}
        variantName={variantNames[variant]}
      />
    </>
  )
}

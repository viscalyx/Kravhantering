'use client'

import {
  ArrowDown,
  ArrowUp,
  Briefcase,
  CircleDot,
  FolderCog,
  FolderTree,
  Languages,
  Layers,
  LayoutPanelTop,
  RotateCcw,
  Save,
  ShieldCheck,
  Theater,
  Wrench,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useMemo, useRef, useState } from 'react'
import { Link, useRouter } from '@/i18n/routing'
import {
  getOrderedRequirementListColumns,
  getRequirementColumnDefinition,
  normalizeRequirementListColumnDefaults,
  type RequirementListColumnDefault,
} from '@/lib/requirements/list-view'
import {
  buildUiTerminologyPayload,
  getDefaultUiTerminology,
  UI_TERM_KEYS,
  type UiLocale,
  type UiTermTranslation,
} from '@/lib/ui-terminology'

type AdminTab = 'columns' | 'referenceData' | 'terminology'
type SaveState = 'error' | 'idle' | 'saved' | 'saving'

const adminTabs: { icon: typeof Languages; id: AdminTab }[] = [
  { icon: Languages, id: 'terminology' },
  { icon: LayoutPanelTop, id: 'columns' },
  { icon: FolderCog, id: 'referenceData' },
]

const ADMIN_TAB_DEVELOPER_MODE_VALUES: Record<AdminTab, string> = {
  columns: 'columns',
  referenceData: 'reference data',
  terminology: 'terminology',
}

function createShippedTerminology() {
  return buildUiTerminologyPayload(getDefaultUiTerminology())
}

function createShippedColumnDefaults() {
  return normalizeRequirementListColumnDefaults(null)
}

export default function AdminClient({
  initialColumnDefaults,
  initialTerminology,
}: {
  initialColumnDefaults: RequirementListColumnDefault[]
  initialTerminology: UiTermTranslation[]
}) {
  const ta = useTranslations('admin')
  const tc = useTranslations('common')
  const tn = useTranslations('nav')
  const tr = useTranslations('requirement')
  const terminologyLabel = useTranslations('terminology')
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<AdminTab>('terminology')
  const [activeLocale, setActiveLocale] = useState<UiLocale>('sv')
  const [terminology, setTerminology] = useState(initialTerminology)
  const [columnDefaults, setColumnDefaults] = useState(initialColumnDefaults)
  const [terminologySaveState, setTerminologySaveState] =
    useState<SaveState>('idle')
  const [columnSaveState, setColumnSaveState] = useState<SaveState>('idle')
  const terminologySaveTokenRef = useRef(0)
  const columnSaveTokenRef = useRef(0)
  const orderedColumns = useMemo(
    () => getOrderedRequirementListColumns(columnDefaults),
    [columnDefaults],
  )
  const isTerminologySaving = terminologySaveState === 'saving'
  const isColumnSaving = columnSaveState === 'saving'

  const updateTermValue = (
    key: UiTermTranslation['key'],
    field: 'definitePlural' | 'plural' | 'singular',
    value: string,
  ) => {
    setTerminology(current =>
      current.map(entry =>
        entry.key === key
          ? {
              ...entry,
              [activeLocale]: {
                ...entry[activeLocale],
                [field]: value,
              },
            }
          : entry,
      ),
    )
    setTerminologySaveState('idle')
  }

  const moveColumn = (columnId: string, direction: -1 | 1) => {
    setColumnDefaults(current => {
      const next = [...current].sort(
        (left, right) => left.sortOrder - right.sortOrder,
      )
      const index = next.findIndex(column => column.columnId === columnId)
      const targetIndex = index + direction

      if (index < 0 || targetIndex < 0 || targetIndex >= next.length) {
        return current
      }

      ;[next[index], next[targetIndex]] = [next[targetIndex], next[index]]

      return next.map((column, position) => ({
        ...column,
        sortOrder: position,
      }))
    })
    setColumnSaveState('idle')
  }

  const toggleColumnVisibility = (columnId: string) => {
    setColumnDefaults(current =>
      current.map(column => {
        if (column.columnId !== columnId) {
          return column
        }

        const definition = getRequirementColumnDefinition(column.columnId)
        if (!definition?.canHide) {
          return {
            ...column,
            defaultVisible: true,
          }
        }

        return {
          ...column,
          defaultVisible: !column.defaultVisible,
        }
      }),
    )
    setColumnSaveState('idle')
  }

  const saveTerminology = async () => {
    const requestToken = terminologySaveTokenRef.current + 1
    terminologySaveTokenRef.current = requestToken
    setTerminologySaveState('saving')

    try {
      const response = await fetch('/api/admin/terminology', {
        body: JSON.stringify({ terminology }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PUT',
      })

      if (requestToken !== terminologySaveTokenRef.current) {
        return
      }

      if (!response.ok) {
        setTerminologySaveState('error')
        return
      }

      const data = (await response.json()) as {
        terminology?: UiTermTranslation[]
      }
      if (requestToken !== terminologySaveTokenRef.current) {
        return
      }

      const nextTerminology = data.terminology ?? terminology
      setTerminology(nextTerminology)
      setTerminologySaveState('saved')
      router.refresh()
    } catch {
      if (requestToken === terminologySaveTokenRef.current) {
        setTerminologySaveState('error')
      }
    }
  }

  const saveColumns = async () => {
    const requestToken = columnSaveTokenRef.current + 1
    columnSaveTokenRef.current = requestToken
    setColumnSaveState('saving')

    try {
      const response = await fetch('/api/admin/requirement-columns', {
        body: JSON.stringify({ columns: columnDefaults }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PUT',
      })

      if (requestToken !== columnSaveTokenRef.current) {
        return
      }

      if (!response.ok) {
        setColumnSaveState('error')
        return
      }

      const data = (await response.json()) as {
        columns?: RequirementListColumnDefault[]
      }
      if (requestToken !== columnSaveTokenRef.current) {
        return
      }

      const nextColumns = data.columns ?? columnDefaults
      setColumnDefaults(nextColumns)
      setColumnSaveState('saved')
    } catch {
      if (requestToken === columnSaveTokenRef.current) {
        setColumnSaveState('error')
      }
    }
  }

  const referenceDataItems = [
    {
      description: ta('areasDescription'),
      href: '/kravomraden',
      icon: FolderTree,
      id: 'areas',
      label: tn('areas'),
    },
    {
      description: ta('typesDescription'),
      href: '/kravtyper',
      icon: Layers,
      id: 'types',
      label: tn('types'),
    },
    {
      description: ta('scenariosDescription'),
      href: '/kravscenarier',
      icon: Theater,
      id: 'scenarios',
      label: tn('scenarios'),
    },
    {
      description: ta('statusesDescription'),
      href: '/kravstatusar',
      icon: CircleDot,
      id: 'statuses',
      label: tn('statuses'),
    },
    {
      description: ta('qualityAttributesDescription'),
      href: '/iso25010',
      icon: ShieldCheck,
      id: 'iso25010',
      label: tn('iso25010'),
    },
    {
      description: ta('responsibilityAreasDescription'),
      href: '/kravpaket/ansvarsomraden',
      icon: Briefcase,
      id: 'responsibilityAreas',
      label: tn('responsibilityAreas'),
    },
    {
      description: ta('implementationTypesDescription'),
      href: '/kravpaket/genomforandeformer',
      icon: Wrench,
      id: 'implementationTypes',
      label: tn('implementationTypes'),
    },
  ]

  const renderSaveState = (value: SaveState, errorMessage?: string) => {
    if (value === 'saved') {
      return (
        <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
          {ta('saved')}
        </span>
      )
    }

    if (value === 'error' && errorMessage) {
      return (
        <span
          className="text-sm font-medium text-red-700 dark:text-red-400"
          role="alert"
        >
          {errorMessage}
        </span>
      )
    }

    return null
  }

  return (
    <div className="section-padding px-4 sm:px-6 lg:px-8">
      <div className="container-custom space-y-6">
        <section className="overflow-hidden rounded-[2rem] border border-secondary-200/70 bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(238,242,255,0.82))] p-6 shadow-[0_24px_70px_-48px_rgba(15,23,42,0.55)] backdrop-blur-md dark:border-secondary-700/60 dark:bg-[linear-gradient(145deg,rgba(15,23,42,0.92),rgba(30,41,59,0.86))]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary-700 dark:text-primary-300">
                {tn('referenceData')}
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-secondary-950 dark:text-secondary-50">
                {ta('title')}
              </h1>
              <p className="mt-2 text-sm text-secondary-600 dark:text-secondary-300">
                {ta('description')}
              </p>
            </div>
            <div
              aria-label={ta('title')}
              className="flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-secondary-200/80 bg-white/80 p-1 dark:border-secondary-700/70 dark:bg-secondary-900/70"
              data-developer-mode-name="navigation"
              data-developer-mode-priority="320"
              data-developer-mode-value="admin center tabs"
              role="tablist"
            >
              {adminTabs.map(tab => (
                <button
                  aria-controls={`${tab.id}-panel`}
                  aria-selected={activeTab === tab.id}
                  className={`inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'bg-primary-700 text-white'
                      : 'text-secondary-700 hover:bg-secondary-100 dark:text-secondary-200 dark:hover:bg-secondary-800'
                  }`}
                  data-developer-mode-context="admin center"
                  data-developer-mode-name="edge tab"
                  data-developer-mode-priority="360"
                  data-developer-mode-value={
                    ADMIN_TAB_DEVELOPER_MODE_VALUES[tab.id]
                  }
                  id={`${tab.id}-tab`}
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  role="tab"
                  type="button"
                >
                  <tab.icon aria-hidden="true" className="h-4 w-4" />
                  {ta(tab.id)}
                </button>
              ))}
            </div>
          </div>
        </section>

        {activeTab === 'terminology' ? (
          <section
            aria-labelledby="terminology-tab"
            className="rounded-[2rem] border border-secondary-200/70 bg-white/90 p-6 shadow-sm dark:border-secondary-700/60 dark:bg-secondary-900/80"
            data-developer-mode-context="admin center"
            data-developer-mode-name="tab panel"
            data-developer-mode-priority="340"
            data-developer-mode-value="terminology"
            id="terminology-panel"
            role="tabpanel"
          >
            <div className="flex flex-col gap-4 border-b border-secondary-200/70 pb-5 dark:border-secondary-700/60 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-secondary-950 dark:text-secondary-50">
                  {ta('terminology')}
                </h2>
                <p className="mt-1 text-sm text-secondary-600 dark:text-secondary-300">
                  {ta('terminologyDescription')}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="inline-flex rounded-full border border-secondary-200/80 bg-secondary-50/80 p-1 dark:border-secondary-700/70 dark:bg-secondary-950/50">
                  {(['sv', 'en'] as const).map(locale => (
                    <button
                      aria-pressed={activeLocale === locale}
                      className={`min-h-[44px] min-w-[44px] rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                        activeLocale === locale
                          ? 'bg-primary-700 text-white'
                          : 'text-secondary-700 hover:bg-white dark:text-secondary-200 dark:hover:bg-secondary-800'
                      }`}
                      disabled={isTerminologySaving}
                      key={locale}
                      onClick={() => setActiveLocale(locale)}
                      type="button"
                    >
                      {locale === 'sv' ? ta('swedish') : ta('english')}
                    </button>
                  ))}
                </div>
                {renderSaveState(
                  terminologySaveState,
                  ta('terminologySaveError'),
                )}
                <button
                  className="inline-flex min-h-[44px] min-w-[44px] items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium text-secondary-700 transition-colors hover:bg-secondary-100 dark:border-secondary-700 dark:text-secondary-200 dark:hover:bg-secondary-800"
                  disabled={isTerminologySaving}
                  onClick={() => {
                    setTerminology(createShippedTerminology())
                    setTerminologySaveState('idle')
                  }}
                  type="button"
                >
                  <RotateCcw aria-hidden="true" className="h-4 w-4" />
                  {tc('resetToDefault')}
                </button>
                <button
                  className="inline-flex min-h-[44px] min-w-[44px] items-center gap-2 rounded-full bg-primary-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-800 disabled:opacity-60"
                  disabled={isTerminologySaving}
                  onClick={saveTerminology}
                  type="button"
                >
                  <Save aria-hidden="true" className="h-4 w-4" />
                  {isTerminologySaving ? tc('loading') : tc('save')}
                </button>
              </div>
            </div>

            <div className="mt-6 grid gap-4">
              {UI_TERM_KEYS.map(key => {
                const entry =
                  terminology.find(term => term.key === key) ??
                  initialTerminology.find(term => term.key === key)
                if (!entry) {
                  return null
                }
                const localized = entry[activeLocale]

                return (
                  <article
                    className="rounded-2xl border border-secondary-200/70 bg-secondary-50/60 p-4 dark:border-secondary-700/60 dark:bg-secondary-950/40"
                    key={key}
                  >
                    <div className="mb-4 flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-secondary-700 dark:text-secondary-200">
                        {terminologyLabel(`${key}.plural`)}
                      </h3>
                      <span className="rounded-full bg-white px-2 py-1 text-[11px] font-medium text-secondary-500 dark:bg-secondary-900 dark:text-secondary-400">
                        {key}
                      </span>
                    </div>
                    <div className="grid gap-4 md:grid-cols-3">
                      <label className="space-y-1">
                        <span className="text-xs font-medium text-secondary-600 dark:text-secondary-300">
                          {ta('singular')}
                        </span>
                        <input
                          className="w-full rounded-xl border border-secondary-200 bg-white px-3 py-2.5 text-sm dark:border-secondary-700 dark:bg-secondary-900"
                          disabled={isTerminologySaving}
                          onChange={event =>
                            updateTermValue(key, 'singular', event.target.value)
                          }
                          value={localized.singular}
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs font-medium text-secondary-600 dark:text-secondary-300">
                          {ta('plural')}
                        </span>
                        <input
                          className="w-full rounded-xl border border-secondary-200 bg-white px-3 py-2.5 text-sm dark:border-secondary-700 dark:bg-secondary-900"
                          disabled={isTerminologySaving}
                          onChange={event =>
                            updateTermValue(key, 'plural', event.target.value)
                          }
                          value={localized.plural}
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs font-medium text-secondary-600 dark:text-secondary-300">
                          {ta('definitePlural')}
                        </span>
                        <input
                          className="w-full rounded-xl border border-secondary-200 bg-white px-3 py-2.5 text-sm dark:border-secondary-700 dark:bg-secondary-900"
                          disabled={isTerminologySaving}
                          onChange={event =>
                            updateTermValue(
                              key,
                              'definitePlural',
                              event.target.value,
                            )
                          }
                          value={localized.definitePlural}
                        />
                      </label>
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        ) : null}

        {activeTab === 'columns' ? (
          <section
            aria-labelledby="columns-tab"
            className="rounded-[2rem] border border-secondary-200/70 bg-white/90 p-6 shadow-sm dark:border-secondary-700/60 dark:bg-secondary-900/80"
            data-developer-mode-context="admin center"
            data-developer-mode-name="tab panel"
            data-developer-mode-priority="340"
            data-developer-mode-value="columns"
            id="columns-panel"
            role="tabpanel"
          >
            <div className="flex flex-col gap-4 border-b border-secondary-200/70 pb-5 dark:border-secondary-700/60 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-secondary-950 dark:text-secondary-50">
                  {ta('columns')}
                </h2>
                <p className="mt-1 text-sm text-secondary-600 dark:text-secondary-300">
                  {ta('columnsDescription')}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {renderSaveState(columnSaveState, ta('columnsSaveError'))}
                <button
                  className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm font-medium text-secondary-700 transition-colors hover:bg-secondary-100 dark:border-secondary-700 dark:text-secondary-200 dark:hover:bg-secondary-800 sm:w-auto sm:min-w-[44px]"
                  disabled={isColumnSaving}
                  onClick={() => {
                    setColumnDefaults(createShippedColumnDefaults())
                    setColumnSaveState('idle')
                  }}
                  type="button"
                >
                  <RotateCcw aria-hidden="true" className="h-4 w-4" />
                  {tc('resetToDefault')}
                </button>
                <button
                  className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full bg-primary-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-800 disabled:opacity-60 sm:w-auto sm:min-w-[44px]"
                  disabled={isColumnSaving}
                  onClick={saveColumns}
                  type="button"
                >
                  <Save aria-hidden="true" className="h-4 w-4" />
                  {isColumnSaving ? tc('loading') : tc('save')}
                </button>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {orderedColumns.map((column, index) => {
                const columnState = columnDefaults.find(
                  value => value.columnId === column.id,
                )
                const label =
                  column.labelNamespace === 'common'
                    ? tc(column.labelKey)
                    : tr(column.labelKey)

                return (
                  <article
                    className="flex flex-col gap-4 rounded-2xl border border-secondary-200/70 bg-secondary-50/60 p-4 dark:border-secondary-700/60 dark:bg-secondary-950/40 md:flex-row md:items-center md:justify-between"
                    data-testid={`admin-column-row-${column.id}`}
                    key={column.id}
                  >
                    <div>
                      <div className="text-sm font-semibold text-secondary-900 dark:text-secondary-100">
                        {label}
                      </div>
                      <div className="mt-1 text-xs text-secondary-500 dark:text-secondary-400">
                        {column.id}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        className="inline-flex h-10 w-10 min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-secondary-200 bg-white text-secondary-700 transition-colors hover:bg-secondary-100 disabled:opacity-40 dark:border-secondary-700 dark:bg-secondary-900 dark:text-secondary-200 dark:hover:bg-secondary-800"
                        disabled={isColumnSaving || index === 0}
                        onClick={() => moveColumn(column.id, -1)}
                        type="button"
                      >
                        <ArrowUp aria-hidden="true" className="h-4 w-4" />
                        <span className="sr-only">{ta('moveUp')}</span>
                      </button>
                      <button
                        className="inline-flex h-10 w-10 min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-secondary-200 bg-white text-secondary-700 transition-colors hover:bg-secondary-100 disabled:opacity-40 dark:border-secondary-700 dark:bg-secondary-900 dark:text-secondary-200 dark:hover:bg-secondary-800"
                        disabled={
                          isColumnSaving || index === orderedColumns.length - 1
                        }
                        onClick={() => moveColumn(column.id, 1)}
                        type="button"
                      >
                        <ArrowDown aria-hidden="true" className="h-4 w-4" />
                        <span className="sr-only">{ta('moveDown')}</span>
                      </button>
                      <label className="inline-flex items-center gap-2 rounded-full border border-secondary-200 bg-white px-3 py-2 text-sm dark:border-secondary-700 dark:bg-secondary-900">
                        <input
                          checked={columnState?.defaultVisible ?? false}
                          disabled={isColumnSaving || !column.canHide}
                          onChange={() => toggleColumnVisibility(column.id)}
                          type="checkbox"
                        />
                        <span>
                          {ta('defaultVisible')}
                          {!column.canHide ? ` · ${ta('locked')}` : ''}
                        </span>
                      </label>
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        ) : null}

        {activeTab === 'referenceData' ? (
          <section
            aria-labelledby="referenceData-tab"
            className="rounded-[2rem] border border-secondary-200/70 bg-white/90 p-6 shadow-sm dark:border-secondary-700/60 dark:bg-secondary-900/80"
            data-developer-mode-context="admin center"
            data-developer-mode-name="tab panel"
            data-developer-mode-priority="340"
            data-developer-mode-value="reference data"
            id="referenceData-panel"
            role="tabpanel"
          >
            <div className="border-b border-secondary-200/70 pb-5 dark:border-secondary-700/60">
              <h2 className="text-xl font-semibold text-secondary-950 dark:text-secondary-50">
                {ta('referenceData')}
              </h2>
              <p className="mt-1 text-sm text-secondary-600 dark:text-secondary-300">
                {ta('referenceDataDescription')}
              </p>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {referenceDataItems.map(item => (
                <Link
                  className="group rounded-[1.5rem] border border-secondary-200/70 bg-[linear-gradient(155deg,rgba(248,250,252,0.95),rgba(255,255,255,0.98))] p-5 transition-transform hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-lg dark:border-secondary-700/60 dark:bg-[linear-gradient(155deg,rgba(15,23,42,0.88),rgba(30,41,59,0.88))]"
                  data-testid={`reference-data-card-${item.id}`}
                  href={item.href}
                  key={item.href}
                >
                  <div className="flex items-start gap-4">
                    <div className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-primary-200/80 bg-primary-50 text-primary-700 transition-colors group-hover:border-primary-300 group-hover:bg-primary-100 dark:border-primary-800 dark:bg-primary-950/70 dark:text-primary-300 dark:group-hover:border-primary-700 dark:group-hover:bg-primary-950">
                      <item.icon
                        aria-hidden="true"
                        className="h-5 w-5"
                        data-testid={`reference-data-icon-${item.id}`}
                      />
                    </div>
                    <div>
                      <div className="text-lg font-semibold text-secondary-950 transition-colors group-hover:text-primary-700 dark:text-secondary-50 dark:group-hover:text-primary-300">
                        {item.label}
                      </div>
                      <p className="mt-2 text-sm text-secondary-600 dark:text-secondary-300">
                        {item.description}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  )
}

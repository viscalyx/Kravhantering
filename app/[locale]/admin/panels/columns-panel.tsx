'use client'

import { ArrowDown, ArrowUp, RotateCcw, Save } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useRef, useState } from 'react'
import DirtyStateButton from '@/components/DirtyStateButton'
import { devMarker } from '@/lib/developer-mode-markers'
import { createDirtySnapshot } from '@/lib/forms/dirty-state'
import { apiFetch } from '@/lib/http/api-fetch'
import {
  getOrderedRequirementListColumns,
  getRequirementColumnDefinition,
  normalizeRequirementListColumnDefaults,
  type RequirementListColumnDefault,
} from '@/lib/requirements/list-view'
import { useAdminPrototype } from '../prototype/admin-layout-prototype'
import {
  VariantA,
  VariantB,
  VariantC,
} from '../prototype/column-layout-variants'

type LoadState = 'error' | 'loaded' | 'loading'
type SaveState = 'error' | 'idle' | 'saved' | 'saving'

function createShippedColumnDefaults() {
  return normalizeRequirementListColumnDefaults(null)
}

function requirementColumnDefaultsSnapshot(
  columns: RequirementListColumnDefault[],
) {
  return createDirtySnapshot({
    columns: normalizeRequirementListColumnDefaults(columns).map(column => ({
      columnId: column.columnId,
      defaultVisible: column.defaultVisible,
      sortOrder: column.sortOrder,
    })),
  })
}

export default function ColumnsPanel() {
  const prototype = useAdminPrototype()
  const tp = useTranslations('adminLayoutPrototype')
  const ta = useTranslations('admin')
  const tc = useTranslations('common')
  const tr = useTranslations('requirement')
  const tis = useTranslations('improvementSuggestion')
  const [columnDefaults, setColumnDefaults] = useState<
    RequirementListColumnDefault[]
  >([])
  const [columnDefaultsBaseline, setColumnDefaultsBaseline] = useState('')
  const [columnSaveState, setColumnSaveState] = useState<SaveState>('idle')
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const columnSaveTokenRef = useRef(0)

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setLoadState('loading')

    apiFetch('/api/admin/requirement-columns', {
      signal: controller.signal,
    })
      .then(async response => {
        if (!response.ok) throw new Error('Column defaults request failed')
        return (await response.json()) as {
          columns?: RequirementListColumnDefault[]
        }
      })
      .then(data => {
        if (!active) return
        const nextColumns = normalizeRequirementListColumnDefaults(
          data.columns ?? null,
        )
        setColumnDefaults(nextColumns)
        setColumnDefaultsBaseline(
          requirementColumnDefaultsSnapshot(nextColumns),
        )
        setColumnSaveState('idle')
        setLoadState('loaded')
      })
      .catch(error => {
        if (!active || controller.signal.aborted) return
        console.error('Failed to load requirement column defaults', {
          attempt: loadAttempt + 1,
          error,
        })
        setLoadState('error')
      })

    return () => {
      active = false
      controller.abort()
    }
  }, [loadAttempt])

  const orderedColumns = useMemo(
    () => getOrderedRequirementListColumns(columnDefaults),
    [columnDefaults],
  )
  const isColumnSaving = columnSaveState === 'saving'
  const columnDefaultsDirty =
    loadState === 'loaded' &&
    columnDefaultsBaseline !== requirementColumnDefaultsSnapshot(columnDefaults)

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

      return normalizeRequirementListColumnDefaults(
        next.map((column, position) => ({
          ...column,
          sortOrder: position,
        })),
      )
    })
    setColumnSaveState('idle')
  }

  const toggleColumnVisibility = (columnId: string) => {
    setColumnDefaults(current =>
      normalizeRequirementListColumnDefaults(
        current.map(column => {
          if (column.columnId !== columnId) return column

          const definition = getRequirementColumnDefinition(column.columnId)
          if (!definition?.canHide) {
            return { ...column, defaultVisible: true }
          }

          return { ...column, defaultVisible: !column.defaultVisible }
        }),
      ),
    )
    setColumnSaveState('idle')
  }

  const saveColumns = async () => {
    if (!columnDefaultsDirty) return
    if (prototype) {
      setColumnDefaultsBaseline(
        requirementColumnDefaultsSnapshot(columnDefaults),
      )
      setColumnSaveState('saved')
      return
    }
    const requestToken = columnSaveTokenRef.current + 1
    columnSaveTokenRef.current = requestToken
    setColumnSaveState('saving')

    try {
      const response = await apiFetch('/api/admin/requirement-columns', {
        body: JSON.stringify({ columns: columnDefaults }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PUT',
      })

      if (requestToken !== columnSaveTokenRef.current) return
      if (!response.ok) {
        setColumnSaveState('error')
        return
      }

      const data = (await response.json()) as {
        columns?: RequirementListColumnDefault[]
      }
      if (requestToken !== columnSaveTokenRef.current) return

      const nextColumns = normalizeRequirementListColumnDefaults(
        data.columns ?? columnDefaults,
      )
      setColumnDefaults(nextColumns)
      setColumnDefaultsBaseline(requirementColumnDefaultsSnapshot(nextColumns))
      setColumnSaveState('saved')
    } catch {
      if (requestToken === columnSaveTokenRef.current) {
        setColumnSaveState('error')
      }
    }
  }

  const reportPrototypeState = prototype?.reportState
  useEffect(() => {
    reportPrototypeState?.(
      JSON.stringify({
        columns: columnDefaults,
        baseline: columnDefaultsBaseline
          ? JSON.parse(columnDefaultsBaseline)
          : null,
        dirty: columnDefaultsDirty,
        loadState,
        saveState: columnSaveState,
        persistence: 'memory only; reload restores application data',
      }),
    )
  }, [
    reportPrototypeState,
    columnDefaults,
    columnDefaultsBaseline,
    columnDefaultsDirty,
    loadState,
    columnSaveState,
  ])

  if (prototype && prototype.variant !== '0' && loadState === 'loaded') {
    const Variant =
      prototype.variant === 'B'
        ? VariantB
        : prototype.variant === 'C'
          ? VariantC
          : VariantA
    return (
      <Variant
        dirty={columnDefaultsDirty}
        move={moveColumn}
        reset={() => {
          setColumnDefaults(createShippedColumnDefaults())
          setColumnSaveState('idle')
        }}
        rows={orderedColumns.map(column => ({
          id: column.id,
          label:
            (column.labelNamespace === 'common'
              ? tc(column.labelKey)
              : column.labelNamespace === 'improvementSuggestion'
                ? tis(column.labelKey)
                : tr(column.labelKey)) +
            (prototype.longLabels ? ` — ${tp('longSuffix')}` : ''),
          keyLabel:
            column.id +
            (prototype.longLabels
              ? '_prototype_long_technical_key_for_layout_review'
              : ''),
          locked: !column.canHide,
          visible:
            columnDefaults.find(value => value.columnId === column.id)
              ?.defaultVisible ?? false,
        }))}
        save={saveColumns}
        saved={columnSaveState === 'saved'}
        toggle={toggleColumnVisibility}
      />
    )
  }

  return (
    <section
      aria-labelledby="columns-tab"
      className="rounded-4xl border border-secondary-200/70 bg-white/90 p-6 shadow-sm dark:border-secondary-700/60 dark:bg-secondary-900/80"
      id="columns-panel"
      role="tabpanel"
      {...devMarker({
        context: 'admin center',
        name: 'tab panel',
        priority: 340,
        value: 'columns',
      })}
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
        {loadState === 'loaded' ? (
          <div className="flex flex-wrap items-center gap-3">
            {columnSaveState === 'saved' ? (
              <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                {prototype ? tp('savedLocally') : ta('saved')}
              </span>
            ) : null}
            {columnSaveState === 'error' ? (
              <span
                className="text-sm font-medium text-red-700 dark:text-red-400"
                role="alert"
              >
                {ta('columnsSaveError')}
              </span>
            ) : null}
            <button
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm font-medium text-secondary-700 transition-colors hover:bg-secondary-100 dark:border-secondary-700 dark:text-secondary-200 dark:hover:bg-secondary-800 sm:w-auto sm:min-w-11"
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
            <DirtyStateButton
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-800 disabled:opacity-60 sm:w-auto sm:min-w-11"
              dirty={columnDefaultsDirty}
              disabled={isColumnSaving}
              onClick={saveColumns}
              type="button"
            >
              <Save aria-hidden="true" className="h-4 w-4" />
              {isColumnSaving ? tc('loading') : tc('save')}
            </DirtyStateButton>
          </div>
        ) : null}
      </div>

      {loadState === 'loading' ? (
        <div
          className="flex min-h-40 items-center justify-center"
          role="status"
        >
          {tc('loading')}
        </div>
      ) : null}
      {loadState === 'error' ? (
        <div className="py-8" role="alert">
          <p className="text-sm font-medium text-red-700 dark:text-red-400">
            {ta('columnsLoadError')}
          </p>
          <button
            className="mt-4 inline-flex min-h-11 items-center rounded-full border border-secondary-300 px-4 py-2 text-sm font-medium hover:bg-secondary-100 dark:border-secondary-700 dark:hover:bg-secondary-800"
            onClick={() => setLoadAttempt(current => current + 1)}
            type="button"
          >
            {ta('panelLoadError.retry')}
          </button>
        </div>
      ) : null}
      {loadState === 'loaded' ? (
        <div className="mt-6 space-y-3">
          {orderedColumns.map((column, index) => {
            const columnState = columnDefaults.find(
              value => value.columnId === column.id,
            )
            const label =
              column.labelNamespace === 'common'
                ? tc(column.labelKey)
                : column.labelNamespace === 'improvementSuggestion'
                  ? tis(column.labelKey)
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
                    {prototype?.longLabels ? ` — ${tp('longSuffix')}` : ''}
                  </div>
                  <div className="mt-1 text-xs text-secondary-500 dark:text-secondary-400">
                    {column.id}
                    {prototype?.longLabels
                      ? '_prototype_long_technical_key_for_layout_review'
                      : ''}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    className="inline-flex h-10 w-10 min-h-11 min-w-11 items-center justify-center rounded-full border border-secondary-200 bg-white text-secondary-700 transition-colors hover:bg-secondary-100 disabled:opacity-40 dark:border-secondary-700 dark:bg-secondary-900 dark:text-secondary-200 dark:hover:bg-secondary-800"
                    disabled={isColumnSaving || index === 0}
                    onClick={() => moveColumn(column.id, -1)}
                    type="button"
                  >
                    <ArrowUp aria-hidden="true" className="h-4 w-4" />
                    <span className="sr-only">{ta('moveUp')}</span>
                  </button>
                  <button
                    className="inline-flex h-10 w-10 min-h-11 min-w-11 items-center justify-center rounded-full border border-secondary-200 bg-white text-secondary-700 transition-colors hover:bg-secondary-100 disabled:opacity-40 dark:border-secondary-700 dark:bg-secondary-900 dark:text-secondary-200 dark:hover:bg-secondary-800"
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
      ) : null}
    </section>
  )
}

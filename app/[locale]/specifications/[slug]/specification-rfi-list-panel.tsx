'use client'

import { Download, Lock, LockOpen, Printer, Send } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@/lib/http/api-fetch'
import { readResponseMessage } from '@/lib/http/response-message'

type RfiRelevance = 'not_relevant' | 'relevant'

interface RfiListItem {
  areaId: number
  areaName: string
  expectedAnswerFormat: string | null
  helpText: string | null
  isIncluded: boolean
  isVersionStale: boolean
  questionCode: string
  questionId: number
  questionText: string
  relevance: RfiRelevance | null
  versionNumber: number
}

interface RfiList {
  isLocked: boolean
  items: RfiListItem[]
  lockedAt: string | null
  lockedByDisplayName: string | null
  specificationId: number
}

interface Props {
  canEdit: boolean
  specificationId: number
  specificationSlug: string
}

function groupedByArea(items: RfiListItem[]) {
  const groups = new Map<string, RfiListItem[]>()
  for (const item of items) {
    const bucket = groups.get(item.areaName) ?? []
    bucket.push(item)
    groups.set(item.areaName, bucket)
  }
  return Array.from(groups.entries())
}

function jsonRequest(method: string, body?: unknown) {
  return {
    ...(body === undefined
      ? {}
      : {
          body: JSON.stringify(body),
          headers: { 'Content-Type': 'application/json' },
        }),
    method,
  }
}

export default function SpecificationRfiListPanel({
  canEdit,
  specificationId,
  specificationSlug,
}: Props) {
  const t = useTranslations('specificationRfiList')
  const tc = useTranslations('common')
  const locale = useLocale()
  const encodedSlug = encodeURIComponent(specificationSlug)
  const [list, setList] = useState<RfiList | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [suggestionAreaId, setSuggestionAreaId] = useState('')
  const [suggestionQuestionId, setSuggestionQuestionId] = useState('')
  const [suggestionContent, setSuggestionContent] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await apiFetch(
        `/api/requirements-specifications/${encodedSlug}/rfi-list`,
      )
      if (!response.ok) {
        throw new Error((await readResponseMessage(response)) ?? t('loadError'))
      }
      const data = (await response.json()) as { list?: RfiList }
      setList(data.list ?? null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t('loadError'))
    } finally {
      setLoading(false)
    }
  }, [encodedSlug, t])

  useEffect(() => {
    void reload()
  }, [reload])

  const groups = useMemo(() => groupedByArea(list?.items ?? []), [list])
  const areas = useMemo(
    () =>
      Array.from(
        new Map(
          (list?.items ?? []).map(item => [
            item.areaId,
            { id: item.areaId, name: item.areaName },
          ]),
        ).values(),
      ),
    [list],
  )
  const suggestionQuestions = useMemo(
    () =>
      (list?.items ?? []).filter(
        item => String(item.areaId) === suggestionAreaId,
      ),
    [list, suggestionAreaId],
  )

  useEffect(() => {
    if (!suggestionAreaId && areas[0]) {
      setSuggestionAreaId(String(areas[0].id))
    }
  }, [areas, suggestionAreaId])

  const mutateList = async (path: string, body?: unknown) => {
    setSaving(true)
    setError(null)
    try {
      const response = await apiFetch(
        `/api/requirements-specifications/${encodedSlug}/rfi-list/${path}`,
        jsonRequest('POST', body),
      )
      if (!response.ok) {
        throw new Error((await readResponseMessage(response)) ?? t('saveError'))
      }
      const data = (await response.json()) as { list?: RfiList }
      if (data.list) setList(data.list)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t('saveError'))
    } finally {
      setSaving(false)
    }
  }

  const updateItem = async (item: RfiListItem, body: unknown) => {
    setSaving(true)
    setError(null)
    try {
      const response = await apiFetch(
        `/api/requirements-specifications/${encodedSlug}/rfi-list/items/${item.questionId}`,
        jsonRequest('PATCH', body),
      )
      if (!response.ok) {
        throw new Error((await readResponseMessage(response)) ?? t('saveError'))
      }
      const data = (await response.json()) as { list?: RfiList }
      if (data.list) setList(data.list)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t('saveError'))
    } finally {
      setSaving(false)
    }
  }

  const createSuggestion = async () => {
    if (!suggestionAreaId || !suggestionContent.trim()) return
    setSaving(true)
    setError(null)
    try {
      const response = await apiFetch(
        '/api/rfi-question-suggestions',
        jsonRequest('POST', {
          areaId: Number(suggestionAreaId),
          content: suggestionContent,
          rfiQuestionId: suggestionQuestionId
            ? Number(suggestionQuestionId)
            : null,
          specificationId,
        }),
      )
      if (!response.ok) {
        throw new Error((await readResponseMessage(response)) ?? t('saveError'))
      }
      setSuggestionContent('')
      setSuggestionQuestionId('')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t('saveError'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <p className="p-6 text-sm text-secondary-600 dark:text-secondary-300">
        {tc('loading')}
      </p>
    )
  }

  if (!list) {
    return (
      <p className="p-6 text-sm text-secondary-600 dark:text-secondary-300">
        {t('empty')}
      </p>
    )
  }

  const lockStateButtonClassName = `inline-flex min-h-11 min-w-11 items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium shadow-sm transition-all duration-200 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none dark:focus:ring-offset-secondary-950 ${
    list.isLocked
      ? 'bg-amber-800 text-white hover:bg-amber-900 focus:ring-amber-500/50 dark:bg-amber-400 dark:text-secondary-950 dark:hover:bg-amber-300 dark:focus:ring-amber-300/60'
      : 'bg-primary-700 text-white hover:bg-primary-800 focus:ring-primary-400/50 dark:bg-primary-600 dark:hover:bg-primary-700'
  }`
  const exportPillClassName =
    'inline-flex h-11 w-11 items-center justify-center rounded-full border border-secondary-200/80 bg-white/90 text-secondary-500 shadow-[0_10px_30px_-18px_rgba(15,23,42,0.45)] backdrop-blur-md transition-all hover:-translate-y-px hover:border-secondary-300 hover:text-secondary-700 hover:shadow-[0_14px_36px_-20px_rgba(15,23,42,0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-secondary-700/80 dark:bg-secondary-900/80 dark:text-secondary-300 dark:hover:border-secondary-600 dark:hover:text-secondary-100 dark:focus-visible:ring-offset-secondary-950'
  const lockStateLabel = list.isLocked ? t('locked') : t('unlocked')
  const lockStateActionTitle = list.isLocked ? t('unlock') : t('lock')

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-secondary-900 dark:text-secondary-100">
            {list.isLocked ? t('lockedMode') : t('prepareMode')}
          </p>
          <p className="text-xs text-secondary-500 dark:text-secondary-400">
            {list.isLocked && list.lockedAt
              ? t('lockedAt', { date: list.lockedAt })
              : t('dynamicHint')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            aria-label="CSV"
            className={exportPillClassName}
            href={`/api/requirements-specifications/${encodedSlug}/rfi-list/export?format=csv&locale=${locale}`}
            title="CSV"
          >
            <Download aria-hidden="true" className="h-4 w-4" />
            <span className="sr-only">CSV</span>
          </a>
          <a
            aria-label="PDF"
            className={exportPillClassName}
            href={`/api/requirements-specifications/${encodedSlug}/rfi-list/export?format=pdf&locale=${locale}`}
            title="PDF"
          >
            <Printer aria-hidden="true" className="h-4 w-4" />
            <span className="sr-only">PDF</span>
          </a>
          {canEdit ? (
            <button
              aria-pressed={list.isLocked}
              className={lockStateButtonClassName}
              disabled={saving}
              onClick={() => void mutateList(list.isLocked ? 'unlock' : 'lock')}
              title={lockStateActionTitle}
              type="button"
            >
              {list.isLocked ? (
                <Lock aria-hidden="true" className="h-4 w-4" />
              ) : (
                <LockOpen aria-hidden="true" className="h-4 w-4" />
              )}
              {lockStateLabel}
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <p
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {canEdit ? (
        <form
          className="space-y-3 rounded-lg border border-secondary-200 bg-secondary-50 p-3 dark:border-secondary-800 dark:bg-secondary-950/40"
          onSubmit={event => {
            event.preventDefault()
            void createSuggestion()
          }}
        >
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm font-medium text-secondary-700 dark:text-secondary-200">
              {t('suggestionArea')}
              <select
                className="min-h-10 rounded-lg border border-secondary-200 bg-white px-3 py-2 text-sm text-secondary-900 dark:border-secondary-700 dark:bg-secondary-900 dark:text-secondary-100"
                onChange={event => {
                  setSuggestionAreaId(event.target.value)
                  setSuggestionQuestionId('')
                }}
                value={suggestionAreaId}
              >
                {areas.map(area => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-secondary-700 dark:text-secondary-200">
              {t('suggestionQuestion')}
              <select
                className="min-h-10 rounded-lg border border-secondary-200 bg-white px-3 py-2 text-sm text-secondary-900 dark:border-secondary-700 dark:bg-secondary-900 dark:text-secondary-100"
                onChange={event => setSuggestionQuestionId(event.target.value)}
                value={suggestionQuestionId}
              >
                <option value="">{t('noSpecificQuestion')}</option>
                {suggestionQuestions.map(item => (
                  <option key={item.questionId} value={item.questionId}>
                    {item.questionCode}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm font-medium text-secondary-700 dark:text-secondary-200">
            {t('suggestionContent')}
            <textarea
              className="min-h-20 rounded-lg border border-secondary-200 bg-white px-3 py-2 text-sm text-secondary-900 dark:border-secondary-700 dark:bg-secondary-900 dark:text-secondary-100"
              onChange={event => setSuggestionContent(event.target.value)}
              value={suggestionContent}
            />
          </label>
          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-secondary-300 px-3 py-1.5 text-sm font-medium text-secondary-700 hover:bg-secondary-100 dark:border-secondary-700 dark:text-secondary-200 dark:hover:bg-secondary-800"
            disabled={saving || !suggestionAreaId || !suggestionContent.trim()}
            type="submit"
          >
            <Send aria-hidden="true" className="h-4 w-4" />
            {t('createSuggestion')}
          </button>
        </form>
      ) : null}

      {groups.length === 0 ? (
        <p className="rounded-lg border border-secondary-200 px-4 py-6 text-center text-sm text-secondary-600 dark:border-secondary-800 dark:text-secondary-300">
          {t('empty')}
        </p>
      ) : (
        <div className="space-y-4">
          {groups.map(([areaName, items]) => (
            <section
              className="rounded-lg border border-secondary-200 dark:border-secondary-800"
              key={areaName}
            >
              <h3 className="border-b border-secondary-200 px-3 py-2 text-sm font-semibold text-secondary-900 dark:border-secondary-800 dark:text-secondary-100">
                {areaName}
              </h3>
              <div className="divide-y divide-secondary-200 dark:divide-secondary-800">
                {items.map(item => (
                  <article
                    className="space-y-3 px-3 py-3"
                    key={item.questionId}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-primary-700 dark:text-primary-300">
                        {item.questionCode}
                      </span>
                      <span className="rounded-full bg-secondary-100 px-2 py-0.5 text-xs text-secondary-700 dark:bg-secondary-800 dark:text-secondary-200">
                        v{item.versionNumber}
                      </span>
                      {item.isVersionStale ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                          {t('staleVersion')}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-sm leading-6 text-secondary-900 dark:text-secondary-100">
                      {item.questionText}
                    </p>
                    {item.helpText ? (
                      <p className="text-sm leading-6 text-secondary-600 dark:text-secondary-300">
                        {item.helpText}
                      </p>
                    ) : null}
                    {item.expectedAnswerFormat ? (
                      <p className="text-xs text-secondary-500 dark:text-secondary-400">
                        {t('expectedAnswerFormat')}: {item.expectedAnswerFormat}
                      </p>
                    ) : null}

                    <div className="flex flex-wrap gap-3">
                      <label className="inline-flex items-center gap-2 text-sm text-secondary-700 dark:text-secondary-200">
                        <input
                          checked={item.isIncluded}
                          className="h-4 w-4 rounded border-secondary-300 text-primary-600 focus:ring-primary-500"
                          disabled={!canEdit || list.isLocked || saving}
                          onChange={event =>
                            void updateItem(item, {
                              isIncluded: event.target.checked,
                            })
                          }
                          type="checkbox"
                        />
                        {t('included')}
                      </label>

                      {list.isLocked && item.isIncluded ? (
                        <fieldset className="flex flex-wrap items-center gap-3 text-sm text-secondary-700 dark:text-secondary-200">
                          <legend className="sr-only">{t('relevance')}</legend>
                          <label className="inline-flex items-center gap-2">
                            <input
                              checked={item.relevance === 'relevant'}
                              disabled={!canEdit || saving}
                              name={`rfi-relevance-${item.questionId}`}
                              onChange={() =>
                                void updateItem(item, {
                                  relevance: 'relevant',
                                })
                              }
                              type="radio"
                            />
                            {t('relevant')}
                          </label>
                          <label className="inline-flex items-center gap-2">
                            <input
                              checked={item.relevance === 'not_relevant'}
                              disabled={!canEdit || saving}
                              name={`rfi-relevance-${item.questionId}`}
                              onChange={() =>
                                void updateItem(item, {
                                  relevance: 'not_relevant',
                                })
                              }
                              type="radio"
                            />
                            {t('notRelevant')}
                          </label>
                        </fieldset>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

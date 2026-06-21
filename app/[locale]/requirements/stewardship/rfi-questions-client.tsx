'use client'

import {
  Archive,
  CheckCircle2,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  X,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@/lib/http/api-fetch'
import { readResponseMessage } from '@/lib/http/response-message'

interface RequirementArea {
  id: number
  name: string
  prefix: string
}

interface RfiQuestion {
  archivedAt: string | null
  areaId: number
  areaName: string
  expectedAnswerFormat: string | null
  helpText: string | null
  id: number
  isArchived: boolean
  questionCode: string
  questionText: string | null
  sortOrder: number
  versionNumber: number | null
}

interface RfiSuggestion {
  areaId: number
  areaName: string
  content: string
  createdAt: string
  id: number
  isReviewRequested: boolean
  questionCode: string | null
  resolution: number | null
  sourceSpecificationName: string | null
  sourceSpecificationUniqueId: string | null
}

interface FormState {
  expectedAnswerFormat: string
  helpText: string
  id: number | null
  questionText: string
  sortOrder: string
}

const emptyForm: FormState = {
  expectedAnswerFormat: '',
  helpText: '',
  id: null,
  questionText: '',
  sortOrder: '0',
}

function apiJson(method: string, body: unknown) {
  return {
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    method,
  }
}

export default function RfiQuestionsClient() {
  const t = useTranslations('rfiQuestions')
  const tc = useTranslations('common')
  const [areas, setAreas] = useState<RequirementArea[]>([])
  const [areaId, setAreaId] = useState('')
  const [questions, setQuestions] = useState<RfiQuestion[]>([])
  const [suggestions, setSuggestions] = useState<RfiSuggestion[]>([])
  const [form, setForm] = useState<FormState>(emptyForm)
  const [resolutionText, setResolutionText] = useState<Record<number, string>>(
    {},
  )
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedArea = useMemo(
    () => areas.find(area => String(area.id) === areaId) ?? null,
    [areaId, areas],
  )

  const loadAreas = useCallback(async () => {
    const response = await apiFetch('/api/requirement-areas')
    if (!response.ok) {
      throw new Error((await readResponseMessage(response)) ?? t('loadError'))
    }
    const data = (await response.json()) as { areas?: RequirementArea[] }
    const loadedAreas = data.areas ?? []
    setAreas(loadedAreas)
    setAreaId(current => current || String(loadedAreas[0]?.id ?? ''))
  }, [t])

  const loadAreaData = useCallback(async () => {
    if (!areaId) return
    setLoading(true)
    setError(null)
    try {
      const [questionsResponse, suggestionsResponse] = await Promise.all([
        apiFetch(
          `/api/rfi-questions?areaId=${encodeURIComponent(areaId)}&includeArchived=true`,
        ),
        apiFetch(
          `/api/rfi-question-suggestions?areaId=${encodeURIComponent(areaId)}`,
        ),
      ])
      if (!questionsResponse.ok) {
        throw new Error(
          (await readResponseMessage(questionsResponse)) ?? t('loadError'),
        )
      }
      const questionData = (await questionsResponse.json()) as {
        questions?: RfiQuestion[]
      }
      setQuestions(questionData.questions ?? [])

      if (suggestionsResponse.ok) {
        const suggestionData = (await suggestionsResponse.json()) as {
          suggestions?: RfiSuggestion[]
        }
        setSuggestions(suggestionData.suggestions ?? [])
      } else {
        setSuggestions([])
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t('loadError'))
    } finally {
      setLoading(false)
    }
  }, [areaId, t])

  useEffect(() => {
    loadAreas().catch(loadError => {
      setError(loadError instanceof Error ? loadError.message : t('loadError'))
      setLoading(false)
    })
  }, [loadAreas, t])

  useEffect(() => {
    void loadAreaData()
  }, [loadAreaData])

  const resetForm = () => setForm(emptyForm)

  const editQuestion = (question: RfiQuestion) => {
    setForm({
      expectedAnswerFormat: question.expectedAnswerFormat ?? '',
      helpText: question.helpText ?? '',
      id: question.id,
      questionText: question.questionText ?? '',
      sortOrder: String(question.sortOrder),
    })
  }

  const saveQuestion = async () => {
    if (!selectedArea) return
    setSaving(true)
    setError(null)
    try {
      const payload = {
        areaId: selectedArea.id,
        expectedAnswerFormat: form.expectedAnswerFormat || undefined,
        helpText: form.helpText || undefined,
        questionText: form.questionText,
        sortOrder: Number(form.sortOrder || 0),
      }
      const response = await apiFetch(
        form.id == null
          ? '/api/rfi-questions'
          : `/api/rfi-questions/${form.id}`,
        apiJson(form.id == null ? 'POST' : 'PUT', payload),
      )
      if (!response.ok) {
        throw new Error((await readResponseMessage(response)) ?? t('saveError'))
      }
      resetForm()
      await loadAreaData()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t('saveError'))
    } finally {
      setSaving(false)
    }
  }

  const setArchived = async (question: RfiQuestion, archived: boolean) => {
    setSaving(true)
    setError(null)
    try {
      const response = await apiFetch(
        archived
          ? `/api/rfi-questions/${question.id}`
          : `/api/rfi-questions/${question.id}/reactivate`,
        { method: archived ? 'DELETE' : 'POST' },
      )
      if (!response.ok) {
        throw new Error((await readResponseMessage(response)) ?? t('saveError'))
      }
      await loadAreaData()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t('saveError'))
    } finally {
      setSaving(false)
    }
  }

  const resolveSuggestion = async (
    suggestion: RfiSuggestion,
    resolution: 'resolved' | 'dismissed',
  ) => {
    const motivation = resolutionText[suggestion.id]?.trim()
    if (!motivation) {
      setError(t('resolutionRequired'))
      return
    }
    setSaving(true)
    setError(null)
    try {
      const response = await apiFetch(
        `/api/rfi-question-suggestions/${suggestion.id}/resolution`,
        apiJson('POST', {
          resolution,
          resolutionMotivation: motivation,
        }),
      )
      if (!response.ok) {
        throw new Error((await readResponseMessage(response)) ?? t('saveError'))
      }
      setResolutionText(current => {
        const next = { ...current }
        delete next[suggestion.id]
        return next
      })
      await loadAreaData()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t('saveError'))
    } finally {
      setSaving(false)
    }
  }

  const openSuggestions = suggestions.filter(
    suggestion => suggestion.resolution == null,
  )

  return (
    <main className="section-padding px-4 sm:px-6 lg:px-8">
      <div className="container-custom max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-secondary-900 dark:text-secondary-100">
              {t('title')}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-secondary-600 dark:text-secondary-300">
              {t('intro')}
            </p>
          </div>
          <label className="flex min-w-64 flex-col gap-1 text-sm font-medium text-secondary-700 dark:text-secondary-200">
            {t('area')}
            <select
              className="min-h-11 rounded-lg border border-secondary-200 bg-white px-3 py-2 text-secondary-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 dark:border-secondary-700 dark:bg-secondary-900 dark:text-secondary-100"
              onChange={event => {
                setAreaId(event.target.value)
                resetForm()
              }}
              value={areaId}
            >
              {areas.map(area => (
                <option key={area.id} value={area.id}>
                  {area.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error ? (
          <p
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <form
            className="space-y-4 rounded-xl border border-secondary-200 bg-white p-4 shadow-sm dark:border-secondary-800 dark:bg-secondary-900"
            onSubmit={event => {
              event.preventDefault()
              void saveQuestion()
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-secondary-900 dark:text-secondary-100">
                {form.id == null ? t('newQuestion') : t('editQuestion')}
              </h2>
              {form.id != null ? (
                <button
                  className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-secondary-300 px-3 py-1.5 text-sm font-medium text-secondary-700 hover:bg-secondary-50 dark:border-secondary-700 dark:text-secondary-200 dark:hover:bg-secondary-800"
                  onClick={resetForm}
                  type="button"
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                  {tc('cancel')}
                </button>
              ) : null}
            </div>

            <label className="flex flex-col gap-1 text-sm font-medium text-secondary-700 dark:text-secondary-200">
              {t('questionText')}
              <textarea
                className="min-h-28 rounded-lg border border-secondary-200 bg-white px-3 py-2 text-secondary-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 dark:border-secondary-700 dark:bg-secondary-950 dark:text-secondary-100"
                onChange={event =>
                  setForm(current => ({
                    ...current,
                    questionText: event.target.value,
                  }))
                }
                required
                value={form.questionText}
              />
            </label>

            <label className="flex flex-col gap-1 text-sm font-medium text-secondary-700 dark:text-secondary-200">
              {t('helpText')}
              <textarea
                className="min-h-24 rounded-lg border border-secondary-200 bg-white px-3 py-2 text-secondary-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 dark:border-secondary-700 dark:bg-secondary-950 dark:text-secondary-100"
                onChange={event =>
                  setForm(current => ({
                    ...current,
                    helpText: event.target.value,
                  }))
                }
                value={form.helpText}
              />
            </label>

            <label className="flex flex-col gap-1 text-sm font-medium text-secondary-700 dark:text-secondary-200">
              {t('expectedAnswerFormat')}
              <input
                className="min-h-11 rounded-lg border border-secondary-200 bg-white px-3 py-2 text-secondary-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 dark:border-secondary-700 dark:bg-secondary-950 dark:text-secondary-100"
                onChange={event =>
                  setForm(current => ({
                    ...current,
                    expectedAnswerFormat: event.target.value,
                  }))
                }
                value={form.expectedAnswerFormat}
              />
            </label>

            <label className="flex max-w-40 flex-col gap-1 text-sm font-medium text-secondary-700 dark:text-secondary-200">
              {t('sortOrder')}
              <input
                className="min-h-11 rounded-lg border border-secondary-200 bg-white px-3 py-2 text-secondary-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 dark:border-secondary-700 dark:bg-secondary-950 dark:text-secondary-100"
                min={0}
                onChange={event =>
                  setForm(current => ({
                    ...current,
                    sortOrder: event.target.value,
                  }))
                }
                type="number"
                value={form.sortOrder}
              />
            </label>

            <button
              className="btn-primary inline-flex min-h-11 items-center gap-2"
              disabled={saving || !areaId}
              type="submit"
            >
              {form.id == null ? (
                <Plus aria-hidden="true" className="h-4 w-4" />
              ) : (
                <Save aria-hidden="true" className="h-4 w-4" />
              )}
              {saving ? tc('saving') : t('saveQuestion')}
            </button>
          </form>

          <section className="rounded-xl border border-secondary-200 bg-white shadow-sm dark:border-secondary-800 dark:bg-secondary-900">
            <div className="border-b border-secondary-200 px-4 py-3 dark:border-secondary-800">
              <h2 className="text-lg font-semibold text-secondary-900 dark:text-secondary-100">
                {selectedArea ? selectedArea.name : t('questions')}
              </h2>
            </div>
            {loading ? (
              <p className="p-6 text-sm text-secondary-600 dark:text-secondary-300">
                {tc('loading')}
              </p>
            ) : questions.length === 0 ? (
              <p className="p-6 text-sm text-secondary-600 dark:text-secondary-300">
                {t('emptyQuestions')}
              </p>
            ) : (
              <div className="divide-y divide-secondary-200 dark:divide-secondary-800">
                {questions.map(question => (
                  <article
                    className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between"
                    key={question.id}
                  >
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-primary-700 dark:text-primary-300">
                          {question.questionCode}
                        </span>
                        <span className="rounded-full bg-secondary-100 px-2 py-0.5 text-xs text-secondary-700 dark:bg-secondary-800 dark:text-secondary-200">
                          v{question.versionNumber ?? '-'}
                        </span>
                        {question.isArchived ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                            {t('archived')}
                          </span>
                        ) : null}
                      </div>
                      <p className="text-sm leading-6 text-secondary-900 dark:text-secondary-100">
                        {question.questionText}
                      </p>
                      {question.helpText ? (
                        <p className="text-sm leading-6 text-secondary-600 dark:text-secondary-300">
                          {question.helpText}
                        </p>
                      ) : null}
                      {question.expectedAnswerFormat ? (
                        <p className="text-xs text-secondary-500 dark:text-secondary-400">
                          {t('expectedAnswerFormat')}:{' '}
                          {question.expectedAnswerFormat}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        aria-label={t('editQuestion')}
                        className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-secondary-300 text-secondary-700 hover:bg-secondary-50 dark:border-secondary-700 dark:text-secondary-200 dark:hover:bg-secondary-800"
                        onClick={() => editQuestion(question)}
                        title={t('editQuestion')}
                        type="button"
                      >
                        <Pencil aria-hidden="true" className="h-4 w-4" />
                      </button>
                      <button
                        aria-label={
                          question.isArchived ? t('reactivate') : t('archive')
                        }
                        className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-secondary-300 text-secondary-700 hover:bg-secondary-50 dark:border-secondary-700 dark:text-secondary-200 dark:hover:bg-secondary-800"
                        onClick={() =>
                          void setArchived(question, !question.isArchived)
                        }
                        title={
                          question.isArchived ? t('reactivate') : t('archive')
                        }
                        type="button"
                      >
                        {question.isArchived ? (
                          <RotateCcw aria-hidden="true" className="h-4 w-4" />
                        ) : (
                          <Archive aria-hidden="true" className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </section>

        <section className="rounded-xl border border-secondary-200 bg-white shadow-sm dark:border-secondary-800 dark:bg-secondary-900">
          <div className="border-b border-secondary-200 px-4 py-3 dark:border-secondary-800">
            <h2 className="text-lg font-semibold text-secondary-900 dark:text-secondary-100">
              {t('suggestions')}
            </h2>
          </div>
          {openSuggestions.length === 0 ? (
            <p className="p-6 text-sm text-secondary-600 dark:text-secondary-300">
              {t('emptySuggestions')}
            </p>
          ) : (
            <div className="divide-y divide-secondary-200 dark:divide-secondary-800">
              {openSuggestions.map(suggestion => (
                <article className="space-y-3 px-4 py-4" key={suggestion.id}>
                  <div>
                    <p className="text-sm leading-6 text-secondary-900 dark:text-secondary-100">
                      {suggestion.content}
                    </p>
                    <p className="mt-1 text-xs text-secondary-500 dark:text-secondary-400">
                      {suggestion.sourceSpecificationName
                        ? `${suggestion.sourceSpecificationName} (${suggestion.sourceSpecificationUniqueId})`
                        : t('noSource')}
                      {suggestion.questionCode
                        ? ` · ${suggestion.questionCode}`
                        : ''}
                    </p>
                  </div>
                  <label className="flex flex-col gap-1 text-sm font-medium text-secondary-700 dark:text-secondary-200">
                    {t('resolutionMotivation')}
                    <input
                      className="min-h-11 rounded-lg border border-secondary-200 bg-white px-3 py-2 text-secondary-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 dark:border-secondary-700 dark:bg-secondary-950 dark:text-secondary-100"
                      onChange={event =>
                        setResolutionText(current => ({
                          ...current,
                          [suggestion.id]: event.target.value,
                        }))
                      }
                      value={resolutionText[suggestion.id] ?? ''}
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="btn-primary inline-flex min-h-10 items-center gap-2"
                      disabled={saving}
                      onClick={() =>
                        void resolveSuggestion(suggestion, 'resolved')
                      }
                      type="button"
                    >
                      <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                      {t('markResolved')}
                    </button>
                    <button
                      className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-secondary-300 px-3 py-1.5 text-sm font-medium text-secondary-700 hover:bg-secondary-50 dark:border-secondary-700 dark:text-secondary-200 dark:hover:bg-secondary-800"
                      disabled={saving}
                      onClick={() =>
                        void resolveSuggestion(suggestion, 'dismissed')
                      }
                      type="button"
                    >
                      <X aria-hidden="true" className="h-4 w-4" />
                      {t('dismiss')}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

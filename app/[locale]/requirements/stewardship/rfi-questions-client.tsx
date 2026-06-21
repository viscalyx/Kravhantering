'use client'

import {
  Archive,
  CheckCircle2,
  ChevronRight,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  X,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useConfirmModal } from '@/components/ConfirmModal'
import FieldLabelWithHelp from '@/components/FieldLabelWithHelp'
import FloatingActionRail from '@/components/FloatingActionRail'
import FormModal from '@/components/FormModal'
import { devMarker } from '@/lib/developer-mode-markers'
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
  areaPrefix: string
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
  areaId: string
  expectedAnswerFormat: string
  helpText: string
  id: number | null
  questionText: string
}

type StatusFilter = '' | 'active' | 'archived'

const emptyForm: FormState = {
  areaId: '',
  expectedAnswerFormat: '',
  helpText: '',
  id: null,
  questionText: '',
}

const inputClassName =
  'w-full rounded-xl border border-secondary-200 bg-white px-3.5 py-2.5 text-sm text-secondary-900 shadow-sm transition-all duration-200 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-400/50 dark:border-secondary-700 dark:bg-secondary-950 dark:text-secondary-100'

const textareaClassName = `${inputClassName} min-h-28`

const rowActionButtonClassName =
  'inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50'

function apiJson(method: string, body: unknown) {
  return {
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    method,
  }
}

function nullableBusinessText(value: string) {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function questionStatusLabel(question: RfiQuestion, copy: RfiCopy) {
  return question.isArchived ? copy.archived : copy.active
}

function questionStatusIcon(question: RfiQuestion) {
  return question.isArchived ? (
    <Archive aria-hidden="true" className="h-3.5 w-3.5" />
  ) : (
    <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" />
  )
}

interface RfiCopy {
  active: string
  allAreas: string
  allStatuses: string
  archive: string
  archived: string
  area: string
  areaHelp: string
  areaLockedHint: string
  confirmArchiveQuestion: string
  dismiss: string
  editQuestion: string
  emptyQuestions: string
  emptySuggestions: string
  expectedAnswerFormat: string
  expectedAnswerFormatHelp: string
  helpText: string
  helpTextHelp: string
  hideQuestionDetails: string
  intro: string
  loadError: string
  loading: string
  markResolved: string
  newQuestion: string
  noFilteredQuestions: string
  noSource: string
  questions: string
  questionText: string
  questionTextHelp: string
  reactivate: string
  resolutionMotivation: string
  resolutionMotivationHelp: string
  resolutionRequired: string
  saveError: string
  saveQuestion: string
  saving: string
  search: string
  showQuestionDetails: string
  status: string
  suggestions: string
  title: string
}

export default function RfiQuestionsClient() {
  const t = useTranslations('rfiQuestions')
  const tc = useTranslations('common')
  const { confirm } = useConfirmModal()
  const questionTextRef = useRef<HTMLTextAreaElement>(null)
  const listAnchorRef = useRef<HTMLDivElement>(null)
  const [areas, setAreas] = useState<RequirementArea[]>([])
  const [questions, setQuestions] = useState<RfiQuestion[]>([])
  const [suggestions, setSuggestions] = useState<RfiSuggestion[]>([])
  const [form, setForm] = useState<FormState>(emptyForm)
  const [resolutionText, setResolutionText] = useState<Record<number, string>>(
    {},
  )
  const [areaFilter, setAreaFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('')
  const [questionSearch, setQuestionSearch] = useState('')
  const [expandedQuestionIds, setExpandedQuestionIds] = useState<Set<number>>(
    () => new Set(),
  )
  const [showQuestionForm, setShowQuestionForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const copy = useMemo(
    () => ({
      active: t('active'),
      allAreas: t('allAreas'),
      allStatuses: t('allStatuses'),
      archive: t('archive'),
      archived: t('archived'),
      area: t('area'),
      areaHelp: t('fieldHelp.area'),
      areaLockedHint: t('areaLockedHint'),
      confirmArchiveQuestion: t('confirmArchiveQuestion'),
      dismiss: t('dismiss'),
      editQuestion: t('editQuestion'),
      emptyQuestions: t('emptyQuestions'),
      emptySuggestions: t('emptySuggestions'),
      expectedAnswerFormat: t('expectedAnswerFormat'),
      expectedAnswerFormatHelp: t('fieldHelp.expectedAnswerFormat'),
      helpText: t('helpText'),
      helpTextHelp: t('fieldHelp.helpText'),
      hideQuestionDetails: t('hideQuestionDetails'),
      intro: t('intro'),
      loading: tc('loading'),
      loadError: t('loadError'),
      markResolved: t('markResolved'),
      newQuestion: t('newQuestion'),
      noFilteredQuestions: t('noFilteredQuestions'),
      noSource: t('noSource'),
      questionText: t('questionText'),
      questionTextHelp: t('fieldHelp.questionText'),
      questions: t('questions'),
      reactivate: t('reactivate'),
      resolutionMotivation: t('resolutionMotivation'),
      resolutionMotivationHelp: t('fieldHelp.resolutionMotivation'),
      resolutionRequired: t('resolutionRequired'),
      saveError: t('saveError'),
      saveQuestion: t('saveQuestion'),
      saving: tc('saving'),
      search: t('search'),
      showQuestionDetails: t('showQuestionDetails'),
      status: t('status'),
      suggestions: t('suggestions'),
      title: t('title'),
    }),
    [t, tc],
  )

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [areasResponse, questionsResponse, suggestionsResponse] =
        await Promise.all([
          apiFetch('/api/requirement-areas'),
          apiFetch('/api/rfi-questions?includeArchived=true'),
          apiFetch('/api/rfi-question-suggestions'),
        ])

      if (!areasResponse.ok) {
        throw new Error(
          (await readResponseMessage(areasResponse)) ?? copy.loadError,
        )
      }
      if (!questionsResponse.ok) {
        throw new Error(
          (await readResponseMessage(questionsResponse)) ?? copy.loadError,
        )
      }

      const areaData = (await areasResponse.json()) as {
        areas?: RequirementArea[]
      }
      const questionData = (await questionsResponse.json()) as {
        questions?: RfiQuestion[]
      }
      setAreas(areaData.areas ?? [])
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
      setError(loadError instanceof Error ? loadError.message : copy.loadError)
      setQuestions([])
      setSuggestions([])
    } finally {
      setLoading(false)
    }
  }, [copy.loadError])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const orderedQuestions = useMemo(
    () =>
      [...questions].sort((left, right) => {
        const areaComparison = left.areaName.localeCompare(right.areaName)
        if (areaComparison !== 0) return areaComparison
        return left.questionCode.localeCompare(right.questionCode)
      }),
    [questions],
  )

  const filteredQuestions = useMemo(() => {
    const normalizedSearch = questionSearch.trim().toLocaleLowerCase()
    return orderedQuestions.filter(question => {
      if (areaFilter && String(question.areaId) !== areaFilter) return false
      if (statusFilter === 'active' && question.isArchived) return false
      if (statusFilter === 'archived' && !question.isArchived) return false
      if (!normalizedSearch) return true
      return [
        question.questionCode,
        question.questionText ?? '',
        question.helpText ?? '',
        question.expectedAnswerFormat ?? '',
        question.areaName,
        question.areaPrefix,
      ]
        .join(' ')
        .toLocaleLowerCase()
        .includes(normalizedSearch)
    })
  }, [areaFilter, orderedQuestions, questionSearch, statusFilter])

  const groupedQuestions = useMemo(() => {
    const groups: Array<{
      areaId: number
      areaName: string
      areaPrefix: string
      questions: RfiQuestion[]
    }> = []
    const groupsByAreaId = new Map<number, (typeof groups)[number]>()

    for (const question of filteredQuestions) {
      let group = groupsByAreaId.get(question.areaId)
      if (!group) {
        group = {
          areaId: question.areaId,
          areaName: question.areaName,
          areaPrefix: question.areaPrefix,
          questions: [],
        }
        groupsByAreaId.set(question.areaId, group)
        groups.push(group)
      }
      group.questions.push(question)
    }

    return groups
  }, [filteredQuestions])

  const openSuggestions = useMemo(
    () =>
      suggestions
        .filter(suggestion => suggestion.resolution == null)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [suggestions],
  )

  const closeQuestionForm = () => {
    setShowQuestionForm(false)
    setForm(emptyForm)
  }

  const openQuestionForm = () => {
    setForm({
      ...emptyForm,
      areaId: areaFilter || String(areas[0]?.id ?? ''),
    })
    setShowQuestionForm(true)
  }

  const editQuestion = (question: RfiQuestion) => {
    setForm({
      areaId: String(question.areaId),
      expectedAnswerFormat: question.expectedAnswerFormat ?? '',
      helpText: question.helpText ?? '',
      id: question.id,
      questionText: question.questionText ?? '',
    })
    setShowQuestionForm(true)
  }

  const toggleQuestionExpansion = (questionId: number) => {
    setExpandedQuestionIds(current => {
      const next = new Set(current)
      if (next.has(questionId)) {
        next.delete(questionId)
      } else {
        next.add(questionId)
      }
      return next
    })
  }

  const saveQuestion = async () => {
    const questionText = form.questionText.trim()
    if (!questionText) return

    const isCreate = form.id == null
    const areaId = Number(form.areaId)
    if (isCreate && (!Number.isInteger(areaId) || areaId < 1)) return

    setSaving(true)
    setError(null)
    try {
      const contentPayload = {
        expectedAnswerFormat: nullableBusinessText(form.expectedAnswerFormat),
        helpText: nullableBusinessText(form.helpText),
        questionText,
      }
      const response = await apiFetch(
        isCreate ? '/api/rfi-questions' : `/api/rfi-questions/${form.id}`,
        apiJson(
          isCreate ? 'POST' : 'PUT',
          isCreate ? { ...contentPayload, areaId } : contentPayload,
        ),
      )
      if (!response.ok) {
        throw new Error((await readResponseMessage(response)) ?? copy.saveError)
      }
      closeQuestionForm()
      await loadData()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : copy.saveError)
    } finally {
      setSaving(false)
    }
  }

  const setArchived = async (
    question: RfiQuestion,
    archived: boolean,
    anchorEl?: HTMLElement,
  ) => {
    if (archived) {
      const confirmed = await confirm({
        anchorEl,
        confirmText: copy.archive,
        icon: 'caution',
        message: copy.confirmArchiveQuestion,
        variant: 'danger',
      })
      if (!confirmed) return
    }

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
        throw new Error((await readResponseMessage(response)) ?? copy.saveError)
      }
      await loadData()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : copy.saveError)
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
      setError(copy.resolutionRequired)
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
        throw new Error((await readResponseMessage(response)) ?? copy.saveError)
      }
      setResolutionText(current => {
        const next = { ...current }
        delete next[suggestion.id]
        return next
      })
      await loadData()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : copy.saveError)
    } finally {
      setSaving(false)
    }
  }

  const questionFormContent = (
    <form
      className="space-y-4"
      onSubmit={event => {
        event.preventDefault()
        void saveQuestion()
      }}
    >
      <div>
        <FieldLabelWithHelp
          help={copy.areaHelp}
          htmlFor="rfi-question-area"
          label={copy.area}
          required
        />
        <select
          className={`${inputClassName} disabled:cursor-not-allowed disabled:bg-secondary-100 disabled:text-secondary-500 dark:disabled:bg-secondary-900/70 dark:disabled:text-secondary-500`}
          disabled={form.id != null || areas.length === 0}
          id="rfi-question-area"
          onChange={event =>
            setForm(current => ({ ...current, areaId: event.target.value }))
          }
          title={form.id != null ? copy.areaLockedHint : undefined}
          value={form.areaId}
        >
          {areas.map(area => (
            <option key={area.id} value={area.id}>
              {area.prefix} {area.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <FieldLabelWithHelp
          help={copy.questionTextHelp}
          htmlFor="rfi-question-text"
          label={copy.questionText}
          required
        />
        <textarea
          className={textareaClassName}
          id="rfi-question-text"
          onChange={event =>
            setForm(current => ({
              ...current,
              questionText: event.target.value,
            }))
          }
          ref={questionTextRef}
          required
          value={form.questionText}
        />
      </div>

      <div>
        <FieldLabelWithHelp
          help={copy.helpTextHelp}
          htmlFor="rfi-question-help-text"
          label={copy.helpText}
        />
        <textarea
          className={`${textareaClassName} min-h-24`}
          id="rfi-question-help-text"
          onChange={event =>
            setForm(current => ({
              ...current,
              helpText: event.target.value,
            }))
          }
          value={form.helpText}
        />
      </div>

      <div>
        <FieldLabelWithHelp
          help={copy.expectedAnswerFormatHelp}
          htmlFor="rfi-question-expected-answer-format"
          label={copy.expectedAnswerFormat}
        />
        <input
          className={inputClassName}
          id="rfi-question-expected-answer-format"
          onChange={event =>
            setForm(current => ({
              ...current,
              expectedAnswerFormat: event.target.value,
            }))
          }
          value={form.expectedAnswerFormat}
        />
      </div>

      <div className="flex flex-wrap justify-end gap-2 pt-2">
        <button
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-secondary-300 px-4 text-sm font-medium text-secondary-700 transition-colors hover:bg-secondary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 dark:border-secondary-700 dark:text-secondary-200 dark:hover:bg-secondary-800"
          disabled={saving}
          onClick={closeQuestionForm}
          type="button"
        >
          <X aria-hidden="true" className="h-4 w-4" />
          {tc('cancel')}
        </button>
        <button
          className="btn-primary inline-flex min-h-11 items-center gap-2"
          disabled={saving || !form.areaId || !form.questionText.trim()}
          type="submit"
        >
          {form.id == null ? (
            <Plus aria-hidden="true" className="h-4 w-4" />
          ) : (
            <Save aria-hidden="true" className="h-4 w-4" />
          )}
          {saving ? copy.saving : copy.saveQuestion}
        </button>
      </div>
    </form>
  )

  return (
    <main className="section-padding px-4 sm:px-6 lg:px-8">
      <div className="container-custom">
        <FloatingActionRail
          anchorRef={listAnchorRef}
          developerModeContext="rfiQuestions"
          items={[
            {
              ariaLabel: copy.newQuestion,
              developerModeValue: 'new RFI question',
              disabled: saving || areas.length === 0,
              icon: <Plus aria-hidden="true" className="h-4 w-4" />,
              id: 'create',
              onClick: openQuestionForm,
              variant: 'primary',
            },
          ]}
        />
        <FormModal
          closeDisabled={saving}
          developerModeValue={
            form.id == null ? 'new RFI question' : 'edit RFI question'
          }
          initialFocusRef={questionTextRef}
          onClose={closeQuestionForm}
          open={showQuestionForm}
          title={form.id == null ? copy.newQuestion : copy.editQuestion}
          titleId="rfi-question-form-title"
        >
          {questionFormContent}
        </FormModal>

        <div className="mb-6 flex flex-col gap-2">
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-secondary-100">
            {copy.title}
          </h1>
          <p className="max-w-3xl text-sm leading-6 text-secondary-600 dark:text-secondary-300">
            {copy.intro}
          </p>
        </div>

        {error ? (
          <p
            className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        <div className="mb-5 grid gap-3 rounded-2xl border bg-white/80 p-4 shadow-sm dark:border-secondary-800 dark:bg-secondary-900/60 md:grid-cols-[minmax(0,1fr)_220px_180px]">
          <label className="relative block">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary-400"
            />
            <input
              aria-label={copy.search}
              className={`${inputClassName} pl-9`}
              onChange={event => setQuestionSearch(event.target.value)}
              placeholder={copy.search}
              value={questionSearch}
            />
          </label>
          <select
            aria-label={copy.allAreas}
            className={inputClassName}
            onChange={event => setAreaFilter(event.target.value)}
            value={areaFilter}
          >
            <option value="">{copy.allAreas}</option>
            {areas.map(area => (
              <option key={area.id} value={area.id}>
                {area.prefix} {area.name}
              </option>
            ))}
          </select>
          <select
            aria-label={copy.allStatuses}
            className={inputClassName}
            onChange={event =>
              setStatusFilter(event.target.value as StatusFilter)
            }
            value={statusFilter}
          >
            <option value="">{copy.allStatuses}</option>
            <option value="active">{copy.active}</option>
            <option value="archived">{copy.archived}</option>
          </select>
        </div>

        <div className="grid grid-cols-1 gap-6" ref={listAnchorRef}>
          <div className="space-y-4">
            {loading ? (
              <p
                className="text-secondary-600 dark:text-secondary-400"
                role="status"
              >
                {copy.loading}
              </p>
            ) : questions.length === 0 ? (
              <div
                className="rounded-2xl border bg-white/80 p-6 text-sm text-secondary-600 shadow-sm dark:border-secondary-800 dark:bg-secondary-900/60 dark:text-secondary-300"
                {...devMarker({
                  context: 'rfiQuestions',
                  name: 'empty state',
                })}
              >
                {copy.emptyQuestions}
              </div>
            ) : filteredQuestions.length === 0 ? (
              <div className="rounded-2xl border bg-white/80 p-6 text-sm text-secondary-600 shadow-sm dark:border-secondary-800 dark:bg-secondary-900/60 dark:text-secondary-300">
                {copy.noFilteredQuestions}
              </div>
            ) : (
              groupedQuestions.map(group => (
                <section className="space-y-3" key={group.areaId}>
                  <div
                    className="sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-lg border border-primary-200 bg-primary-50/95 px-3 py-2 shadow-[0_8px_18px_-14px_rgba(67,56,202,0.45)] backdrop-blur dark:border-primary-800/70 dark:bg-primary-950/80"
                    {...devMarker({
                      context: 'rfiQuestions',
                      name: 'requirement area heading',
                      value: group.areaPrefix,
                    })}
                  >
                    <h2 className="text-sm font-semibold text-primary-950 dark:text-primary-50">
                      {group.areaName}
                    </h2>
                    <span className="rounded-md border border-primary-200 bg-white/90 px-2 py-0.5 font-mono text-xs text-primary-800 dark:border-primary-700/70 dark:bg-secondary-950/80 dark:text-primary-100">
                      {group.areaPrefix}
                    </span>
                  </div>
                  <ul className="space-y-3">
                    {group.questions.map(question => {
                      const isExpanded = expandedQuestionIds.has(question.id)
                      const detailsId = `rfi-question-details-${question.id}`

                      return (
                        <li
                          className={`overflow-hidden rounded-2xl border bg-white/80 shadow-sm transition-all duration-150 hover:bg-secondary-50 dark:border-secondary-800 dark:bg-secondary-900/60 dark:hover:bg-secondary-800/50 ${
                            isExpanded ? 'ring-2 ring-primary-500' : ''
                          }`}
                          key={question.id}
                        >
                          <div className="flex items-stretch">
                            <button
                              aria-controls={detailsId}
                              aria-expanded={isExpanded}
                              className="block min-w-0 flex-1 px-4 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400/60"
                              onClick={() =>
                                toggleQuestionExpansion(question.id)
                              }
                              type="button"
                              {...devMarker({
                                context: 'rfiQuestions',
                                name: 'question disclosure',
                                value: question.questionCode,
                              })}
                            >
                              <div className="flex items-start gap-3">
                                <ChevronRight
                                  aria-hidden="true"
                                  className={`mt-1 h-4 w-4 shrink-0 text-secondary-500 transition-transform dark:text-secondary-400 ${
                                    isExpanded ? 'rotate-90' : ''
                                  }`}
                                />
                                <span className="sr-only">
                                  {isExpanded
                                    ? copy.hideQuestionDetails
                                    : copy.showQuestionDetails}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="flex flex-wrap items-center gap-2">
                                    <span className="rounded-md bg-secondary-100 px-2 py-1 font-mono text-xs text-secondary-700 dark:bg-secondary-800 dark:text-secondary-200">
                                      {question.questionCode}
                                    </span>
                                    <span className="text-xs text-secondary-500">
                                      {question.areaName}
                                    </span>
                                    <span className="rounded-md bg-secondary-100 px-2 py-1 text-xs text-secondary-700 dark:bg-secondary-800 dark:text-secondary-200">
                                      v{question.versionNumber ?? '-'}
                                    </span>
                                    <span
                                      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${
                                        question.isArchived
                                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
                                          : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
                                      }`}
                                    >
                                      {questionStatusIcon(question)}
                                      {questionStatusLabel(question, copy)}
                                    </span>
                                  </span>
                                  <span className="mt-2 block font-medium text-secondary-950 dark:text-secondary-50">
                                    {question.questionText}
                                  </span>
                                </span>
                              </div>
                            </button>
                            <div className="flex shrink-0 items-start justify-end gap-1 px-4 py-4 pl-0">
                              <button
                                aria-label={`${copy.editQuestion}: ${question.questionCode}`}
                                className={`${rowActionButtonClassName} text-primary-700 hover:bg-primary-50 dark:text-primary-300 dark:hover:bg-primary-950/30`}
                                disabled={saving}
                                onClick={() => editQuestion(question)}
                                title={copy.editQuestion}
                                type="button"
                                {...devMarker({
                                  context: 'rfiQuestions',
                                  name: 'question action',
                                  value: `${question.questionCode} edit`,
                                })}
                              >
                                <Pencil
                                  aria-hidden="true"
                                  className="h-4 w-4"
                                  focusable={false}
                                />
                              </button>
                              <button
                                aria-label={`${
                                  question.isArchived
                                    ? copy.reactivate
                                    : copy.archive
                                }: ${question.questionCode}`}
                                className={`${rowActionButtonClassName} text-secondary-700 hover:bg-secondary-100 dark:text-secondary-300 dark:hover:bg-secondary-800/70`}
                                disabled={saving}
                                onClick={event =>
                                  void setArchived(
                                    question,
                                    !question.isArchived,
                                    event.currentTarget,
                                  )
                                }
                                title={
                                  question.isArchived
                                    ? copy.reactivate
                                    : copy.archive
                                }
                                type="button"
                                {...devMarker({
                                  context: 'rfiQuestions',
                                  name: 'question action',
                                  value: `${question.questionCode} ${
                                    question.isArchived
                                      ? 'reactivate'
                                      : 'archive'
                                  }`,
                                })}
                              >
                                {question.isArchived ? (
                                  <RotateCcw
                                    aria-hidden="true"
                                    className="h-4 w-4"
                                    focusable={false}
                                  />
                                ) : (
                                  <Archive
                                    aria-hidden="true"
                                    className="h-4 w-4"
                                    focusable={false}
                                  />
                                )}
                              </button>
                            </div>
                          </div>
                          {isExpanded ? (
                            <div
                              className="border-t border-secondary-200 p-4 dark:border-secondary-800"
                              id={detailsId}
                            >
                              <dl className="grid gap-4 text-sm md:grid-cols-2">
                                <div>
                                  <dt className="font-medium text-secondary-900 dark:text-secondary-100">
                                    {copy.helpText}
                                  </dt>
                                  <dd className="mt-1 leading-6 text-secondary-600 dark:text-secondary-300">
                                    {question.helpText || '-'}
                                  </dd>
                                </div>
                                <div>
                                  <dt className="font-medium text-secondary-900 dark:text-secondary-100">
                                    {copy.expectedAnswerFormat}
                                  </dt>
                                  <dd className="mt-1 leading-6 text-secondary-600 dark:text-secondary-300">
                                    {question.expectedAnswerFormat || '-'}
                                  </dd>
                                </div>
                              </dl>
                            </div>
                          ) : null}
                        </li>
                      )
                    })}
                  </ul>
                </section>
              ))
            )}
          </div>
        </div>

        <section className="mt-8 rounded-2xl border bg-white/80 shadow-sm dark:border-secondary-800 dark:bg-secondary-900/60">
          <div className="border-b border-secondary-200 px-4 py-3 dark:border-secondary-800">
            <h2 className="text-lg font-semibold text-secondary-900 dark:text-secondary-100">
              {copy.suggestions}
            </h2>
          </div>
          {openSuggestions.length === 0 ? (
            <p className="p-6 text-sm text-secondary-600 dark:text-secondary-300">
              {copy.emptySuggestions}
            </p>
          ) : (
            <div className="divide-y divide-secondary-200 dark:divide-secondary-800">
              {openSuggestions.map(suggestion => {
                const resolutionId = `rfi-suggestion-resolution-${suggestion.id}`

                return (
                  <article className="space-y-3 px-4 py-4" key={suggestion.id}>
                    <div>
                      <p className="text-sm leading-6 text-secondary-900 dark:text-secondary-100">
                        {suggestion.content}
                      </p>
                      <p className="mt-1 flex flex-wrap gap-2 text-xs text-secondary-500 dark:text-secondary-400">
                        <span>
                          {suggestion.sourceSpecificationName
                            ? `${suggestion.sourceSpecificationName} (${suggestion.sourceSpecificationUniqueId})`
                            : copy.noSource}
                        </span>
                        {suggestion.questionCode ? (
                          <span className="font-mono">
                            {suggestion.questionCode}
                          </span>
                        ) : null}
                        <span>{suggestion.areaName}</span>
                      </p>
                    </div>
                    <div>
                      <FieldLabelWithHelp
                        help={copy.resolutionMotivationHelp}
                        htmlFor={resolutionId}
                        label={copy.resolutionMotivation}
                        required
                      />
                      <input
                        className={inputClassName}
                        id={resolutionId}
                        onChange={event =>
                          setResolutionText(current => ({
                            ...current,
                            [suggestion.id]: event.target.value,
                          }))
                        }
                        value={resolutionText[suggestion.id] ?? ''}
                      />
                    </div>
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
                        {copy.markResolved}
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
                        {copy.dismiss}
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

'use client'

import { CheckCircle2, Circle, RotateCcw, Search } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useConfirmModal } from '@/components/ConfirmModal'
import { type HelpContent, useHelpContent } from '@/components/HelpPanel'
import { apiFetch } from '@/lib/http/api-fetch'
import { readResponseMessage } from '@/lib/http/response-message'

interface SelectionAnswer {
  alreadyAddedRequirementCount?: number
  description: string | null
  healthState?: 'missing_requirement_selection' | 'ok'
  id: number
  isActive: boolean
  isArchived: boolean
  isNoRequirementSelection: boolean
  matchingRequirementCount?: number
  text: string
}

interface SelectionQuestion {
  answers: SelectionAnswer[]
  areaName: string
  id: number
  isActive: boolean
  isArchived: boolean
  isVisible: boolean
  questionCode: string
  savedAnswers: Array<{
    answerId: number
    isHistorical: boolean
  }>
  selectedAnswerIds: number[]
  selectionType: 'multiple' | 'single'
  text: string
  visibilityGroups: Array<{
    conditions: Array<{
      answerId: number
      answerIsActive: boolean
      answerIsArchived: boolean
      parentQuestionId: number
      parentQuestionIsActive: boolean
      parentQuestionIsArchived: boolean
    }>
    id: number
  }>
  visibilityState: 'hidden' | 'hidden_with_historical_answers' | 'visible'
}

interface HiddenSelectionImpact {
  answerTexts: string[]
  questionCode: string
  questionId: number
  questionText: string
}

interface Props {
  onChanged: () => void
  specificationSlug: string
}

const SPECIFICATION_REQUIREMENT_SELECTION_HELP: HelpContent = {
  sections: [
    {
      kind: 'text',
      bodyKey: 'specificationRequirementSelection.overview.body',
      headingKey: 'specificationRequirementSelection.overview.heading',
    },
    {
      kind: 'text',
      bodyKey: 'specificationRequirementSelection.filtering.body',
      headingKey: 'specificationRequirementSelection.filtering.heading',
    },
    {
      kind: 'text',
      bodyKey: 'specificationRequirementSelection.answers.body',
      headingKey: 'specificationRequirementSelection.answers.heading',
    },
    {
      kind: 'text',
      bodyKey: 'specificationRequirementSelection.saving.body',
      headingKey: 'specificationRequirementSelection.saving.heading',
    },
    {
      kind: 'text',
      bodyKey: 'specificationRequirementSelection.historical.body',
      headingKey: 'specificationRequirementSelection.historical.heading',
    },
  ],
  titleKey: 'specificationRequirementSelection.title',
}

function conditionGroupMatches(
  group: SelectionQuestion['visibilityGroups'][number],
  questionsById: Map<number, SelectionQuestion>,
) {
  const allowedAnswersByParent = new Map<number, Set<number>>()
  for (const condition of group.conditions) {
    if (
      !condition.parentQuestionIsActive ||
      condition.parentQuestionIsArchived ||
      !condition.answerIsActive ||
      condition.answerIsArchived
    ) {
      continue
    }
    const bucket =
      allowedAnswersByParent.get(condition.parentQuestionId) ?? new Set()
    bucket.add(condition.answerId)
    allowedAnswersByParent.set(condition.parentQuestionId, bucket)
  }
  if (allowedAnswersByParent.size === 0) return false

  for (const [parentQuestionId, allowedAnswerIds] of allowedAnswersByParent) {
    const parentQuestion = questionsById.get(parentQuestionId)
    if (!parentQuestion?.isVisible) return false
    if (
      !parentQuestion.selectedAnswerIds.some(answerId =>
        allowedAnswerIds.has(answerId),
      )
    ) {
      return false
    }
  }
  return true
}

export default function SpecificationRequirementSelectionPanel({
  onChanged,
  specificationSlug,
}: Props) {
  useHelpContent(SPECIFICATION_REQUIREMENT_SELECTION_HELP)
  const { confirm } = useConfirmModal()
  const t = useTranslations('specificationRequirementSelection')
  const encodedSpecificationSlug = encodeURIComponent(specificationSlug)
  const copy = {
    allAreas: t('allAreas'),
    answered: t('answered'),
    clear: t('clear'),
    confirmHiddenAnswerClear: (count: number, questions: string) =>
      t('confirmHiddenAnswerClear', { count, questions }),
    confirmHiddenAnswerClearConfirm: t('confirmHiddenAnswerClearConfirm'),
    confirmHiddenAnswerClearTitle: t('confirmHiddenAnswerClearTitle'),
    error: t('error'),
    followUpQuestions: t('followUpQuestions'),
    historical: t('historical'),
    hiddenHistoricalVisibility: t('hiddenHistoricalVisibility'),
    loading: t('loading'),
    matchSummary: (count: number, added: number) =>
      t('matchSummary', { added, count }),
    missingRequirementSelection: t('missingRequirementSelection'),
    noQuestions: t('noQuestions'),
    progress: t('progress'),
    saving: t('saving'),
    search: t('search'),
    scrollToQuestion: t('scrollToQuestion'),
    unanswered: t('unanswered'),
    unansweredOnly: t('unansweredOnly'),
  }
  const [questions, setQuestions] = useState<SelectionQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [savingQuestionId, setSavingQuestionId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [areaFilter, setAreaFilter] = useState('')
  const [unansweredOnly, setUnansweredOnly] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await apiFetch(
        `/api/requirements-specifications/${encodedSpecificationSlug}/requirement-selection-answers`,
      )
      if (!response.ok) {
        setError((await readResponseMessage(response)) ?? copy.error)
        return
      }
      const data = (await response.json()) as {
        questions?: SelectionQuestion[]
      }
      setQuestions(data.questions ?? [])
    } catch {
      setError(copy.error)
    } finally {
      setLoading(false)
    }
  }, [copy.error, encodedSpecificationSlug])

  useEffect(() => {
    void reload()
  }, [reload])

  const progress = useMemo(() => {
    const activeQuestions = questions.filter(
      question =>
        question.isActive && !question.isArchived && question.isVisible,
    )
    const answered = activeQuestions.filter(
      question => question.selectedAnswerIds.length > 0,
    ).length
    const byArea = new Map<string, { answered: number; total: number }>()
    for (const question of activeQuestions) {
      const item = byArea.get(question.areaName) ?? { answered: 0, total: 0 }
      item.total += 1
      if (question.selectedAnswerIds.length > 0) item.answered += 1
      byArea.set(question.areaName, item)
    }
    return {
      answered,
      byArea: Array.from(byArea),
      total: activeQuestions.length,
    }
  }, [questions])

  const save = async (
    question: SelectionQuestion,
    answerIds: number[],
    confirmHiddenAnswerClear = false,
  ) => {
    setSavingQuestionId(question.id)
    setError(null)
    const previousQuestions = questions
    setQuestions(current =>
      current.map(item =>
        item.id === question.id
          ? {
              ...item,
              selectedAnswerIds: answerIds,
              savedAnswers: answerIds.map(answerId => ({
                answerId,
                isHistorical: false,
              })),
            }
          : item,
      ),
    )
    try {
      const response = await apiFetch(
        `/api/requirements-specifications/${encodedSpecificationSlug}/requirement-selection-answers/${question.id}`,
        {
          body: JSON.stringify({ answerIds, confirmHiddenAnswerClear }),
          headers: { 'Content-Type': 'application/json' },
          method: 'PUT',
        },
      )
      if (!response.ok) {
        if (response.status === 409 && !confirmHiddenAnswerClear) {
          const conflict = (await response.json()) as {
            hiddenSelections?: HiddenSelectionImpact[]
          }
          const hiddenSelections = conflict.hiddenSelections ?? []
          setQuestions(previousQuestions)
          const confirmed = await confirm({
            confirmText: copy.confirmHiddenAnswerClearConfirm,
            defaultCancel: true,
            icon: 'caution',
            message: copy.confirmHiddenAnswerClear(
              hiddenSelections.length,
              hiddenSelections
                .map(item => `${item.questionCode} ${item.questionText}`)
                .join(', '),
            ),
            title: copy.confirmHiddenAnswerClearTitle,
            variant: 'danger',
          })
          if (confirmed) {
            await save(question, answerIds, true)
          }
          return
        }
        setQuestions(previousQuestions)
        setError((await readResponseMessage(response)) ?? copy.error)
        return
      }
      const data = (await response.json()) as {
        questions?: SelectionQuestion[]
      }
      setQuestions(data.questions ?? [])
      onChanged()
    } catch {
      setQuestions(previousQuestions)
      setError(copy.error)
    } finally {
      setSavingQuestionId(null)
    }
  }

  const areaOptions = useMemo(
    () =>
      Array.from(
        new Set(
          questions
            .filter(
              question =>
                question.isVisible ||
                question.visibilityState === 'hidden_with_historical_answers',
            )
            .map(question => question.areaName),
        ),
      ),
    [questions],
  )

  const filteredQuestions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    return questions.filter(question => {
      const isHistoricalOnly =
        !question.isVisible &&
        question.visibilityState === 'hidden_with_historical_answers'
      if (!question.isVisible && !isHistoricalOnly) return false
      if (areaFilter && question.areaName !== areaFilter) return false
      if (
        unansweredOnly &&
        (!question.isVisible || question.selectedAnswerIds.length > 0)
      ) {
        return false
      }
      if (!normalizedQuery) return true
      const haystack = [
        question.areaName,
        question.questionCode,
        question.text,
        ...question.answers.map(answer => answer.text),
      ]
        .join(' ')
        .toLocaleLowerCase()
      return haystack.includes(normalizedQuery)
    })
  }, [areaFilter, query, questions, unansweredOnly])

  const groupedQuestions = useMemo(() => {
    const groups = new Map<string, SelectionQuestion[]>()
    for (const question of filteredQuestions) {
      const bucket = groups.get(question.areaName) ?? []
      bucket.push(question)
      groups.set(question.areaName, bucket)
    }
    return Array.from(groups)
  }, [filteredQuestions])

  const followUpLinksByQuestionId = useMemo(() => {
    const questionsById = new Map(
      questions.map(question => [question.id, question]),
    )
    const linksByParent = new Map<number, SelectionQuestion[]>()
    for (const question of questions) {
      if (!question.isVisible || question.visibilityGroups.length === 0) {
        continue
      }
      const matchingGroups = question.visibilityGroups.filter(group =>
        conditionGroupMatches(group, questionsById),
      )
      for (const group of matchingGroups) {
        for (const condition of group.conditions) {
          const bucket = linksByParent.get(condition.parentQuestionId) ?? []
          if (!bucket.some(item => item.id === question.id)) {
            bucket.push(question)
          }
          linksByParent.set(condition.parentQuestionId, bucket)
        }
      }
    }
    return linksByParent
  }, [questions])

  const toggleMultiple = (
    question: SelectionQuestion,
    answer: SelectionAnswer,
    checked: boolean,
  ) => {
    const current = new Set(question.selectedAnswerIds)
    if (!checked) {
      current.delete(answer.id)
      void save(question, Array.from(current))
      return
    }
    if (answer.isNoRequirementSelection) {
      void save(question, [answer.id])
      return
    }
    current.add(answer.id)
    for (const other of question.answers) {
      if (other.isNoRequirementSelection) current.delete(other.id)
    }
    void save(question, Array.from(current))
  }

  return (
    <div className="flex flex-col p-4">
      {!loading && (
        <div className="mb-4">
          <p className="text-sm text-secondary-600 dark:text-secondary-400">
            {copy.progress}: {progress.answered}/{progress.total}
          </p>
          {progress.byArea.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {progress.byArea.map(([area, item]) => (
                <span
                  className="rounded-md bg-secondary-100 px-2 py-1 text-xs text-secondary-700 dark:bg-secondary-800 dark:text-secondary-200"
                  key={area}
                >
                  {area}: {item.answered}/{item.total}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {error && (
        <p
          className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300"
          role="alert"
        >
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-secondary-600 dark:text-secondary-400">
          {copy.loading}
        </p>
      ) : groupedQuestions.length === 0 ? (
        <p className="text-sm text-secondary-600 dark:text-secondary-400">
          {copy.noQuestions}
        </p>
      ) : (
        <div className="space-y-4">
          <div className="space-y-3 rounded-xl border bg-white/80 p-3 dark:border-secondary-800 dark:bg-secondary-900/60">
            <label className="relative block">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary-400"
              />
              <input
                className="w-full rounded-lg border bg-white py-2 pl-9 pr-3 text-sm dark:border-secondary-700 dark:bg-secondary-900"
                onChange={event => setQuery(event.target.value)}
                placeholder={copy.search}
                value={query}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <select
                className="min-h-10 rounded-lg border bg-white px-3 text-sm dark:border-secondary-700 dark:bg-secondary-900"
                onChange={event => setAreaFilter(event.target.value)}
                value={areaFilter}
              >
                <option value="">{copy.allAreas}</option>
                {areaOptions.map(area => (
                  <option key={area} value={area}>
                    {area}
                  </option>
                ))}
              </select>
              <label className="inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm dark:border-secondary-700">
                <input
                  checked={unansweredOnly}
                  className="h-4 w-4 rounded border-secondary-300 text-primary-700 focus:ring-primary-400/50"
                  onChange={event => setUnansweredOnly(event.target.checked)}
                  type="checkbox"
                />
                {copy.unansweredOnly}
              </label>
            </div>
          </div>
          {groupedQuestions.map(([areaName, areaQuestions]) => (
            <section className="space-y-3" key={areaName}>
              <h3 className="text-sm font-semibold text-secondary-700 dark:text-secondary-200">
                {areaName}
              </h3>
              {areaQuestions.map(question => {
                const disabled =
                  savingQuestionId === question.id ||
                  !question.isActive ||
                  question.isArchived ||
                  !question.isVisible
                const historicalAnswers = question.savedAnswers.filter(
                  item => item.isHistorical,
                )
                const isHistoricalOnly =
                  !question.isVisible &&
                  question.visibilityState === 'hidden_with_historical_answers'
                const isAnswered = question.selectedAnswerIds.length > 0
                const followUpQuestions =
                  followUpLinksByQuestionId.get(question.id) ?? []
                return (
                  <div
                    className={`rounded-xl border p-4 ${
                      isHistoricalOnly
                        ? 'border-amber-200 bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-950/20'
                        : isAnswered
                          ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/50 dark:bg-emerald-950/15'
                          : 'border-secondary-200 bg-white/80 dark:border-secondary-800 dark:bg-secondary-900/60'
                    }`}
                    id={`selection-question-${question.id}`}
                    key={question.id}
                  >
                    <div className="mb-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="font-medium text-secondary-950 dark:text-secondary-50">
                          {question.text}
                        </p>
                        <span
                          className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${
                            isHistoricalOnly
                              ? 'border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100'
                              : isAnswered
                                ? 'border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-100'
                                : 'border-secondary-300 bg-secondary-100 text-secondary-700 dark:border-secondary-700 dark:bg-secondary-800 dark:text-secondary-200'
                          }`}
                        >
                          {isAnswered ? (
                            <CheckCircle2
                              aria-hidden="true"
                              className="h-3.5 w-3.5"
                            />
                          ) : (
                            <Circle
                              aria-hidden="true"
                              className="h-3.5 w-3.5"
                            />
                          )}
                          {isHistoricalOnly
                            ? copy.hiddenHistoricalVisibility
                            : isAnswered
                              ? copy.answered
                              : copy.unanswered}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-secondary-500">
                        {question.questionCode} · {question.areaName}
                        {savingQuestionId === question.id
                          ? ` · ${copy.saving}`
                          : ''}
                      </p>
                    </div>
                    <div className="space-y-2">
                      {question.answers.map(answer => (
                        <label
                          className="flex min-h-10 items-start gap-2 rounded-lg px-2 py-2 hover:bg-secondary-50 dark:hover:bg-secondary-800/60"
                          key={answer.id}
                        >
                          <input
                            checked={question.selectedAnswerIds.includes(
                              answer.id,
                            )}
                            className="mt-1 h-4 w-4 border-secondary-300 text-primary-700 focus:ring-primary-400/50"
                            disabled={
                              disabled || !answer.isActive || answer.isArchived
                            }
                            name={`kuf-${question.id}`}
                            onChange={event => {
                              if (question.selectionType === 'single') {
                                void save(question, [answer.id])
                                return
                              }
                              toggleMultiple(
                                question,
                                answer,
                                event.target.checked,
                              )
                            }}
                            type={
                              question.selectionType === 'single'
                                ? 'radio'
                                : 'checkbox'
                            }
                          />
                          <span>
                            <span className="block text-sm font-medium">
                              {answer.text}
                            </span>
                            {answer.description && (
                              <span className="block text-xs text-secondary-500">
                                {answer.description}
                              </span>
                            )}
                            <span className="mt-1 block text-xs text-secondary-500">
                              {copy.matchSummary(
                                answer.matchingRequirementCount ?? 0,
                                answer.alreadyAddedRequirementCount ?? 0,
                              )}
                            </span>
                            {answer.healthState ===
                              'missing_requirement_selection' && (
                              <span className="mt-1 inline-flex rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                                {copy.missingRequirementSelection}
                              </span>
                            )}
                          </span>
                        </label>
                      ))}
                    </div>
                    {followUpQuestions.length > 0 && (
                      <div className="mt-3 rounded-lg border border-primary-200 bg-primary-50/70 px-3 py-2 text-xs text-primary-900 dark:border-primary-900/60 dark:bg-primary-950/30 dark:text-primary-100">
                        <p className="font-medium">{copy.followUpQuestions}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {followUpQuestions.map(followUpQuestion => (
                            <button
                              className="inline-flex min-h-8 items-center rounded-md border border-primary-200 bg-white px-2 font-mono text-xs hover:bg-primary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 dark:border-primary-800 dark:bg-primary-950/50 dark:hover:bg-primary-900/60"
                              key={followUpQuestion.id}
                              onClick={() => {
                                document
                                  .getElementById(
                                    `selection-question-${followUpQuestion.id}`,
                                  )
                                  ?.scrollIntoView({
                                    behavior: 'smooth',
                                    block: 'center',
                                  })
                              }}
                              title={copy.scrollToQuestion}
                              type="button"
                            >
                              {followUpQuestion.questionCode}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {question.selectedAnswerIds.length > 0 && (
                      <button
                        className="mt-3 inline-flex min-h-9 items-center gap-1 rounded-lg border px-3 text-xs disabled:opacity-50"
                        disabled={savingQuestionId === question.id}
                        onClick={() => save(question, [])}
                        type="button"
                      >
                        <RotateCcw aria-hidden="true" className="h-3 w-3" />
                        {copy.clear}
                      </button>
                    )}
                    {historicalAnswers.length > 0 && (
                      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                        <span>{copy.historical}</span>
                        <button
                          className="ml-3 inline-flex items-center gap-1 underline"
                          disabled={savingQuestionId === question.id}
                          onClick={() => save(question, [])}
                          type="button"
                        >
                          <RotateCcw aria-hidden="true" className="h-3 w-3" />
                          {copy.clear}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

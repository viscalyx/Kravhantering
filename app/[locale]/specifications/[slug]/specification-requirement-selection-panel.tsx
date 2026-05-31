'use client'

import { RotateCcw } from 'lucide-react'
import { useLocale } from 'next-intl'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@/lib/http/api-fetch'
import { readResponseMessage } from '@/lib/http/response-message'

interface SelectionAnswer {
  description: string | null
  id: number
  isActive: boolean
  isArchived: boolean
  isNoRequirementSelection: boolean
  text: string
}

interface SelectionQuestion {
  answers: SelectionAnswer[]
  areaName: string
  id: number
  isActive: boolean
  isArchived: boolean
  questionCode: string
  savedAnswers: Array<{
    answerId: number
    isFilterActive: boolean
  }>
  selectedAnswerIds: number[]
  selectionType: 'multiple' | 'single'
  text: string
}

interface Props {
  onChanged: () => void
  specificationSlug: string
}

export default function SpecificationRequirementSelectionPanel({
  onChanged,
  specificationSlug,
}: Props) {
  const locale = useLocale()
  const isSv = locale === 'sv'
  const copy = {
    clear: isSv ? 'Rensa' : 'Clear',
    error: isSv ? 'Kunde inte spara kravurval.' : 'Could not save selection.',
    historical: isSv ? 'Historiskt val' : 'Historical choice',
    loading: isSv ? 'Laddar kravurvalsfrågor...' : 'Loading questions...',
    noQuestions: isSv
      ? 'Inga aktiva kravurvalsfrågor.'
      : 'No active questions.',
    progress: isSv ? 'Besvarade' : 'Answered',
    title: isSv ? 'Kravurvalsfrågor' : 'Requirement selection questions',
  }
  const [questions, setQuestions] = useState<SelectionQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [savingQuestionId, setSavingQuestionId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await apiFetch(
        `/api/specifications/${specificationSlug}/requirement-selection-answers`,
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
  }, [copy.error, specificationSlug])

  useEffect(() => {
    void reload()
  }, [reload])

  const progress = useMemo(() => {
    const activeQuestions = questions.filter(
      question => question.isActive && !question.isArchived,
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

  const save = async (question: SelectionQuestion, answerIds: number[]) => {
    setSavingQuestionId(question.id)
    setError(null)
    try {
      const response = await apiFetch(
        `/api/specifications/${specificationSlug}/requirement-selection-answers/${question.id}`,
        {
          body: JSON.stringify({ answerIds }),
          headers: { 'Content-Type': 'application/json' },
          method: 'PUT',
        },
      )
      if (!response.ok) {
        setError((await readResponseMessage(response)) ?? copy.error)
        return
      }
      const data = (await response.json()) as {
        questions?: SelectionQuestion[]
      }
      setQuestions(data.questions ?? [])
      onChanged()
    } catch {
      setError(copy.error)
    } finally {
      setSavingQuestionId(null)
    }
  }

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
    <div className="flex h-full flex-col overflow-auto p-4">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-secondary-900 dark:text-secondary-100">
          {copy.title}
        </h2>
        <p className="mt-1 text-sm text-secondary-600 dark:text-secondary-400">
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
      ) : questions.length === 0 ? (
        <p className="text-sm text-secondary-600 dark:text-secondary-400">
          {copy.noQuestions}
        </p>
      ) : (
        <div className="space-y-4">
          {questions.map(question => {
            const disabled =
              savingQuestionId === question.id ||
              !question.isActive ||
              question.isArchived
            const historicalAnswers = question.savedAnswers.filter(
              item => !item.isFilterActive,
            )
            return (
              <section
                className="rounded-xl border bg-white/80 p-4 dark:border-secondary-800 dark:bg-secondary-900/60"
                key={question.id}
              >
                <div className="mb-3">
                  <p className="font-medium text-secondary-950 dark:text-secondary-50">
                    {question.text}
                  </p>
                  <p className="mt-1 text-xs text-secondary-500">
                    {question.questionCode} · {question.areaName}
                  </p>
                </div>
                <div className="space-y-2">
                  {question.answers.map(answer => (
                    <label
                      className="flex min-h-10 items-start gap-2 rounded-lg px-2 py-2 hover:bg-secondary-50 dark:hover:bg-secondary-800/60"
                      key={answer.id}
                    >
                      <input
                        checked={question.selectedAnswerIds.includes(answer.id)}
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
                          toggleMultiple(question, answer, event.target.checked)
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
                      </span>
                    </label>
                  ))}
                </div>
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
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

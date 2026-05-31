'use client'

import {
  Archive,
  CheckCircle2,
  Copy,
  PauseCircle,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import { useLocale } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import FieldLabelWithHelp from '@/components/FieldLabelWithHelp'
import FloatingActionRail from '@/components/FloatingActionRail'
import FormModal from '@/components/FormModal'
import { devMarker } from '@/lib/developer-mode-markers'
import { apiFetch } from '@/lib/http/api-fetch'
import { readResponseMessage } from '@/lib/http/response-message'

type SelectionType = 'multiple' | 'single'

interface RequirementArea {
  id: number
  name: string
  prefix: string
}

interface RequirementPackage {
  id: number
  isArchived: boolean
  name: string
}

interface RequirementSelectionAnswer {
  description: string | null
  id: number
  isActive: boolean
  isArchived: boolean
  isNoRequirementSelection: boolean
  packageIds: number[]
  requirementIds: number[]
  sortOrder: number
  text: string
}

interface RequirementSelectionQuestion {
  answers: RequirementSelectionAnswer[]
  areaId: number
  areaName: string
  areaPrefix: string
  helpText: string | null
  id: number
  isActive: boolean
  isArchived: boolean
  questionCode: string
  selectionType: SelectionType
  sortOrder: number
  text: string
}

interface QuestionForm {
  areaId: string
  helpText: string
  selectionType: SelectionType
  sortOrder: string
  text: string
}

interface AnswerForm {
  description: string
  isNoRequirementSelection: boolean
  packageIds: string[]
  requirementIds: string
  sortOrder: string
  text: string
}

const initialQuestionForm: QuestionForm = {
  areaId: '',
  helpText: '',
  selectionType: 'single',
  sortOrder: '0',
  text: '',
}

const initialAnswerForm: AnswerForm = {
  description: '',
  isNoRequirementSelection: false,
  packageIds: [],
  requirementIds: '',
  sortOrder: '0',
  text: '',
}

const inputClassName =
  'w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200'

function parseRequirementIds(value: string): number[] {
  return value
    .split(/[,\s]+/)
    .map(item => item.trim())
    .filter(Boolean)
    .map(Number)
    .filter(item => Number.isInteger(item) && item > 0)
}

function statusText(
  item: { isActive: boolean; isArchived: boolean },
  copy: Record<string, string>,
) {
  if (item.isArchived) return copy.archived
  return item.isActive ? copy.active : copy.inactive
}

export default function RequirementSelectionQuestionsClient() {
  const locale = useLocale()
  const isSv = locale === 'sv'
  const contentRef = useRef<HTMLDivElement>(null)
  const listAnchorRef = useRef<HTMLDivElement>(null)
  const questionTextRef = useRef<HTMLInputElement>(null)
  const copy = useMemo(
    () =>
      isSv
        ? {
            activate: 'Aktivera',
            active: 'Aktiv',
            addAnswer: 'Lägg till svar',
            archive: 'Arkivera',
            archived: 'Arkiverad',
            area: 'Kravområde',
            clone: 'Kopiera',
            create: 'Skapa',
            createQuestion: 'Skapa kravurvalsfråga',
            deactivate: 'Inaktivera',
            delete: 'Ta bort',
            description: 'Beskrivning',
            error: 'Något gick fel.',
            helpText: 'Hjälptext',
            inactive: 'Inaktiv',
            loading: 'Laddar...',
            multiple: 'Flerval',
            noQuestions: 'Inga kravurvalsfrågor ännu.',
            noRequirementSelection: 'Utan kravurval',
            packages: 'Kravpaket',
            reactivate: 'Återaktivera',
            requirementIds: 'Krav-ID',
            requirementIdsHelp:
              'Ange interna krav-ID separerade med komma eller blanksteg.',
            save: 'Spara',
            selectionType: 'Valtyp',
            single: 'Enval',
            sortOrder: 'Sortering',
            status: 'Status',
            text: 'Text',
            title: 'Kravurvalsfrågor',
          }
        : {
            activate: 'Activate',
            active: 'Active',
            addAnswer: 'Add answer',
            archive: 'Archive',
            archived: 'Archived',
            area: 'Requirement area',
            clone: 'Duplicate',
            create: 'Create',
            createQuestion: 'Create requirement selection question',
            deactivate: 'Deactivate',
            delete: 'Delete',
            description: 'Description',
            error: 'Something went wrong.',
            helpText: 'Help text',
            inactive: 'Inactive',
            loading: 'Loading...',
            multiple: 'Multiple choice',
            noQuestions: 'No requirement selection questions yet.',
            noRequirementSelection: 'No requirement selection',
            packages: 'Requirement packages',
            reactivate: 'Reactivate',
            requirementIds: 'Requirement IDs',
            requirementIdsHelp:
              'Enter internal requirement IDs separated by commas or spaces.',
            save: 'Save',
            selectionType: 'Selection type',
            single: 'Single choice',
            sortOrder: 'Sort order',
            status: 'Status',
            text: 'Text',
            title: 'Requirement selection questions',
          },
    [isSv],
  )
  const [areas, setAreas] = useState<RequirementArea[]>([])
  const [packages, setPackages] = useState<RequirementPackage[]>([])
  const [questions, setQuestions] = useState<RequirementSelectionQuestion[]>([])
  const [questionForm, setQuestionForm] =
    useState<QuestionForm>(initialQuestionForm)
  const [answerForm, setAnswerForm] = useState<AnswerForm>(initialAnswerForm)
  const [selectedQuestionId, setSelectedQuestionId] = useState<number | null>(
    null,
  )
  const [showQuestionForm, setShowQuestionForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedQuestion =
    questions.find(question => question.id === selectedQuestionId) ?? null

  const openQuestionForm = () => {
    setQuestionForm(initialQuestionForm)
    setError(null)
    setShowQuestionForm(true)
  }

  const closeQuestionForm = () => {
    if (submitting) return
    setQuestionForm(initialQuestionForm)
    setShowQuestionForm(false)
  }

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [areasResponse, packagesResponse, questionsResponse] =
        await Promise.all([
          apiFetch('/api/requirement-areas'),
          apiFetch('/api/requirement-packages'),
          apiFetch('/api/requirement-selection-questions?includeArchived=true'),
        ])
      if (!areasResponse.ok || !packagesResponse.ok || !questionsResponse.ok) {
        setError(copy.error)
        return
      }
      const areasData = (await areasResponse.json()) as {
        areas?: RequirementArea[]
      }
      const packagesData = (await packagesResponse.json()) as {
        requirementPackages?: RequirementPackage[]
      }
      const questionsData = (await questionsResponse.json()) as {
        questions?: RequirementSelectionQuestion[]
      }
      setAreas(areasData.areas ?? [])
      setPackages(packagesData.requirementPackages ?? [])
      const nextQuestions = questionsData.questions ?? []
      setQuestions(nextQuestions)
      setSelectedQuestionId(current => {
        if (
          current &&
          nextQuestions.some(question => question.id === current)
        ) {
          return current
        }
        return nextQuestions[0]?.id ?? null
      })
    } catch {
      setError(copy.error)
    } finally {
      setLoading(false)
    }
  }, [copy.error])

  useEffect(() => {
    void reload()
  }, [reload])

  const createQuestion = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!questionForm.areaId) return
    setSubmitting(true)
    setError(null)
    try {
      const response = await apiFetch('/api/requirement-selection-questions', {
        body: JSON.stringify({
          areaId: Number(questionForm.areaId),
          helpText: questionForm.helpText || undefined,
          selectionType: questionForm.selectionType,
          sortOrder: Number(questionForm.sortOrder || 0),
          text: questionForm.text,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      if (!response.ok) {
        setError((await readResponseMessage(response)) ?? copy.error)
        return
      }
      const created = (await response.json()) as RequirementSelectionQuestion
      setQuestionForm(initialQuestionForm)
      setSelectedQuestionId(created.id)
      setShowQuestionForm(false)
      await reload()
    } catch {
      setError(copy.error)
    } finally {
      setSubmitting(false)
    }
  }

  const createAnswer = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedQuestion) return
    setSubmitting(true)
    setError(null)
    try {
      const response = await apiFetch(
        `/api/requirement-selection-questions/${selectedQuestion.id}/answers`,
        {
          body: JSON.stringify({
            description: answerForm.description || undefined,
            isNoRequirementSelection: answerForm.isNoRequirementSelection,
            packageIds: answerForm.isNoRequirementSelection
              ? []
              : answerForm.packageIds.map(Number),
            requirementIds: answerForm.isNoRequirementSelection
              ? []
              : parseRequirementIds(answerForm.requirementIds),
            sortOrder: Number(answerForm.sortOrder || 0),
            text: answerForm.text,
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        },
      )
      if (!response.ok) {
        setError((await readResponseMessage(response)) ?? copy.error)
        return
      }
      setAnswerForm(initialAnswerForm)
      await reload()
    } catch {
      setError(copy.error)
    } finally {
      setSubmitting(false)
    }
  }

  const mutate = async (path: string, method: 'DELETE' | 'POST') => {
    setSubmitting(true)
    setError(null)
    try {
      const response = await apiFetch(path, { method })
      if (!response.ok) {
        setError((await readResponseMessage(response)) ?? copy.error)
        return
      }
      await reload()
    } catch {
      setError(copy.error)
    } finally {
      setSubmitting(false)
    }
  }

  const questionAction = (
    question: RequirementSelectionQuestion,
    operation:
      | 'activate'
      | 'archive'
      | 'deactivate'
      | 'delete'
      | 'duplicate'
      | 'reactivate',
  ) => {
    const method = operation === 'delete' ? 'DELETE' : 'POST'
    const path =
      operation === 'delete'
        ? `/api/requirement-selection-questions/${question.id}`
        : `/api/requirement-selection-questions/${question.id}/${operation}`
    void mutate(path, method)
  }

  const answerAction = (
    question: RequirementSelectionQuestion,
    answer: RequirementSelectionAnswer,
    operation: 'activate' | 'archive' | 'deactivate' | 'delete' | 'reactivate',
  ) => {
    const method = operation === 'delete' ? 'DELETE' : 'POST'
    const path =
      operation === 'delete'
        ? `/api/requirement-selection-questions/${question.id}/answers/${answer.id}`
        : `/api/requirement-selection-questions/${question.id}/answers/${answer.id}/${operation}`
    void mutate(path, method)
  }

  const questionFormContent = (
    <form
      className="space-y-4"
      {...devMarker({
        context: 'requirementSelectionQuestions',
        name: 'question form',
      })}
      onSubmit={createQuestion}
    >
      {showQuestionForm && error ? (
        <p
          className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <div>
        <FieldLabelWithHelp
          help=""
          htmlFor="kuf-area"
          label={copy.area}
          required
        />
        <select
          className={inputClassName}
          id="kuf-area"
          onChange={event =>
            setQuestionForm(previous => ({
              ...previous,
              areaId: event.target.value,
            }))
          }
          required
          value={questionForm.areaId}
        >
          <option value="">-</option>
          {areas.map(area => (
            <option key={area.id} value={area.id}>
              {area.prefix} {area.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <FieldLabelWithHelp
          help=""
          htmlFor="kuf-text"
          label={copy.text}
          required
        />
        <input
          className={inputClassName}
          id="kuf-text"
          onChange={event =>
            setQuestionForm(previous => ({
              ...previous,
              text: event.target.value,
            }))
          }
          ref={questionTextRef}
          required
          value={questionForm.text}
        />
      </div>
      <div>
        <FieldLabelWithHelp help="" htmlFor="kuf-help" label={copy.helpText} />
        <textarea
          className={inputClassName}
          id="kuf-help"
          onChange={event =>
            setQuestionForm(previous => ({
              ...previous,
              helpText: event.target.value,
            }))
          }
          value={questionForm.helpText}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabelWithHelp
            help=""
            htmlFor="kuf-selection-type"
            label={copy.selectionType}
            required
          />
          <select
            className={inputClassName}
            id="kuf-selection-type"
            onChange={event =>
              setQuestionForm(previous => ({
                ...previous,
                selectionType: event.target.value as SelectionType,
              }))
            }
            value={questionForm.selectionType}
          >
            <option value="single">{copy.single}</option>
            <option value="multiple">{copy.multiple}</option>
          </select>
        </div>
        <div>
          <FieldLabelWithHelp
            help=""
            htmlFor="kuf-sort"
            label={copy.sortOrder}
          />
          <input
            className={inputClassName}
            id="kuf-sort"
            min="0"
            onChange={event =>
              setQuestionForm(previous => ({
                ...previous,
                sortOrder: event.target.value,
              }))
            }
            type="number"
            value={questionForm.sortOrder}
          />
        </div>
      </div>
      <button
        className="btn-primary inline-flex items-center gap-1.5"
        disabled={submitting}
        type="submit"
      >
        <Plus aria-hidden="true" className="h-4 w-4" />
        {copy.create}
      </button>
    </form>
  )

  return (
    <div className="section-padding px-4 sm:px-6 lg:px-8">
      <div className="container-custom" ref={contentRef}>
        <FloatingActionRail
          anchorRef={listAnchorRef}
          developerModeContext="requirementSelectionQuestions"
          items={[
            {
              ariaLabel: copy.createQuestion,
              developerModeValue: 'new requirement selection question',
              disabled: submitting,
              icon: <Plus aria-hidden="true" className="h-4 w-4" />,
              id: 'create',
              onClick: openQuestionForm,
              variant: 'primary',
            },
          ]}
        />
        <FormModal
          closeDisabled={submitting}
          developerModeValue="new requirement selection question"
          initialFocusRef={questionTextRef}
          onClose={closeQuestionForm}
          open={showQuestionForm}
          title={copy.createQuestion}
          titleId="requirement-selection-question-create-title"
        >
          {questionFormContent}
        </FormModal>
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-secondary-100">
            {copy.title}
          </h1>
        </div>

        {error && (
          <p
            className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300"
            role="alert"
          >
            {error}
          </p>
        )}

        <div
          className={`grid grid-cols-1 gap-6 ${
            selectedQuestion ? 'xl:grid-cols-[minmax(0,1fr)_420px]' : ''
          }`}
          ref={listAnchorRef}
        >
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
                  context: 'requirementSelectionQuestions',
                  name: 'empty state',
                })}
              >
                {copy.noQuestions}
              </div>
            ) : (
              questions.map(question => (
                <div
                  className={`rounded-2xl border bg-white/80 p-4 shadow-sm transition-colors dark:border-secondary-800 dark:bg-secondary-900/60 ${
                    selectedQuestionId === question.id
                      ? 'ring-2 ring-primary-500'
                      : ''
                  }`}
                  key={question.id}
                >
                  <button
                    className="block w-full text-left"
                    onClick={() => setSelectedQuestionId(question.id)}
                    type="button"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-secondary-100 px-2 py-1 font-mono text-xs text-secondary-700 dark:bg-secondary-800 dark:text-secondary-200">
                        {question.questionCode}
                      </span>
                      <span className="text-xs text-secondary-500">
                        {question.areaName}
                      </span>
                      <span className="text-xs text-secondary-500">
                        {question.selectionType === 'multiple'
                          ? copy.multiple
                          : copy.single}
                      </span>
                      <span className="text-xs font-medium text-secondary-700 dark:text-secondary-300">
                        {statusText(question, copy)}
                      </span>
                    </div>
                    <p className="mt-2 font-medium text-secondary-950 dark:text-secondary-50">
                      {question.text}
                    </p>
                    {question.helpText && (
                      <p className="mt-1 text-sm text-secondary-600 dark:text-secondary-400">
                        {question.helpText}
                      </p>
                    )}
                  </button>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      className="inline-flex min-h-10 items-center gap-1 rounded-lg border px-3 text-sm disabled:opacity-50"
                      disabled={submitting}
                      onClick={() =>
                        questionAction(
                          question,
                          question.isActive ? 'deactivate' : 'activate',
                        )
                      }
                      type="button"
                    >
                      {question.isActive ? (
                        <PauseCircle aria-hidden="true" className="h-4 w-4" />
                      ) : (
                        <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                      )}
                      {question.isActive ? copy.deactivate : copy.activate}
                    </button>
                    <button
                      className="inline-flex min-h-10 items-center gap-1 rounded-lg border px-3 text-sm disabled:opacity-50"
                      disabled={submitting}
                      onClick={() =>
                        questionAction(
                          question,
                          question.isArchived ? 'reactivate' : 'archive',
                        )
                      }
                      type="button"
                    >
                      {question.isArchived ? (
                        <RotateCcw aria-hidden="true" className="h-4 w-4" />
                      ) : (
                        <Archive aria-hidden="true" className="h-4 w-4" />
                      )}
                      {question.isArchived ? copy.reactivate : copy.archive}
                    </button>
                    <button
                      className="inline-flex min-h-10 items-center gap-1 rounded-lg border px-3 text-sm disabled:opacity-50"
                      disabled={submitting}
                      onClick={() => questionAction(question, 'duplicate')}
                      type="button"
                    >
                      <Copy aria-hidden="true" className="h-4 w-4" />
                      {copy.clone}
                    </button>
                    <button
                      className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-red-200 px-3 text-sm text-red-700 disabled:opacity-50 dark:border-red-800 dark:text-red-300"
                      disabled={submitting}
                      onClick={() => questionAction(question, 'delete')}
                      type="button"
                    >
                      <Trash2 aria-hidden="true" className="h-4 w-4" />
                      {copy.delete}
                    </button>
                  </div>
                  {question.answers.length > 0 && (
                    <div className="mt-4 divide-y rounded-xl border dark:border-secondary-800">
                      {question.answers.map(answer => (
                        <div className="p-3" key={answer.id}>
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="font-medium">{answer.text}</p>
                              <p className="text-xs text-secondary-500">
                                {statusText(answer, copy)}
                                {answer.isNoRequirementSelection
                                  ? ` · ${copy.noRequirementSelection}`
                                  : ''}
                              </p>
                              {answer.description && (
                                <p className="mt-1 text-sm text-secondary-600 dark:text-secondary-400">
                                  {answer.description}
                                </p>
                              )}
                              {!answer.isNoRequirementSelection && (
                                <p className="mt-1 text-xs text-secondary-500">
                                  {copy.packages}:{' '}
                                  {answer.packageIds.join(', ') || '-'} ·{' '}
                                  {copy.requirementIds}:{' '}
                                  {answer.requirementIds.join(', ') || '-'}
                                </p>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button
                                className="inline-flex min-h-9 items-center rounded-lg border px-2 text-xs disabled:opacity-50"
                                disabled={submitting}
                                onClick={() =>
                                  answerAction(
                                    question,
                                    answer,
                                    answer.isActive ? 'deactivate' : 'activate',
                                  )
                                }
                                type="button"
                              >
                                {answer.isActive
                                  ? copy.deactivate
                                  : copy.activate}
                              </button>
                              <button
                                className="inline-flex min-h-9 items-center rounded-lg border px-2 text-xs disabled:opacity-50"
                                disabled={submitting}
                                onClick={() =>
                                  answerAction(
                                    question,
                                    answer,
                                    answer.isArchived
                                      ? 'reactivate'
                                      : 'archive',
                                  )
                                }
                                type="button"
                              >
                                {answer.isArchived
                                  ? copy.reactivate
                                  : copy.archive}
                              </button>
                              <button
                                className="inline-flex min-h-9 items-center rounded-lg border border-red-200 px-2 text-xs text-red-700 disabled:opacity-50 dark:border-red-800 dark:text-red-300"
                                disabled={submitting}
                                onClick={() =>
                                  answerAction(question, answer, 'delete')
                                }
                                type="button"
                              >
                                {copy.delete}
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {selectedQuestion && (
            <aside className="space-y-6">
              <form
                className="rounded-2xl border bg-white/80 p-5 shadow-sm dark:border-secondary-800 dark:bg-secondary-900/60"
                onSubmit={createAnswer}
              >
                <h3 className="mb-4 text-lg font-semibold">{copy.addAnswer}</h3>
                <p className="mb-4 text-xs text-secondary-500">
                  {selectedQuestion.questionCode}
                </p>
                <div className="space-y-4">
                  <div>
                    <FieldLabelWithHelp
                      help=""
                      htmlFor="kuf-answer-text"
                      label={copy.text}
                      required
                    />
                    <input
                      className={inputClassName}
                      id="kuf-answer-text"
                      onChange={event =>
                        setAnswerForm(previous => ({
                          ...previous,
                          text: event.target.value,
                        }))
                      }
                      required
                      value={answerForm.text}
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      checked={answerForm.isNoRequirementSelection}
                      className="h-4 w-4 rounded border-secondary-300 text-primary-700 focus:ring-primary-400/50"
                      onChange={event =>
                        setAnswerForm(previous => ({
                          ...previous,
                          isNoRequirementSelection: event.target.checked,
                          packageIds: event.target.checked
                            ? []
                            : previous.packageIds,
                          requirementIds: event.target.checked
                            ? ''
                            : previous.requirementIds,
                        }))
                      }
                      type="checkbox"
                    />
                    {copy.noRequirementSelection}
                  </label>
                  <div>
                    <FieldLabelWithHelp
                      help=""
                      htmlFor="kuf-answer-description"
                      label={copy.description}
                    />
                    <textarea
                      className={inputClassName}
                      id="kuf-answer-description"
                      onChange={event =>
                        setAnswerForm(previous => ({
                          ...previous,
                          description: event.target.value,
                        }))
                      }
                      value={answerForm.description}
                    />
                  </div>
                  <div>
                    <FieldLabelWithHelp
                      help=""
                      htmlFor="kuf-answer-packages"
                      label={copy.packages}
                    />
                    <select
                      className={inputClassName}
                      disabled={answerForm.isNoRequirementSelection}
                      id="kuf-answer-packages"
                      multiple
                      onChange={event =>
                        setAnswerForm(previous => ({
                          ...previous,
                          packageIds: Array.from(
                            event.target.selectedOptions,
                            option => option.value,
                          ),
                        }))
                      }
                      value={answerForm.packageIds}
                    >
                      {packages.map(pkg => (
                        <option key={pkg.id} value={pkg.id}>
                          {pkg.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <FieldLabelWithHelp
                      help={copy.requirementIdsHelp}
                      htmlFor="kuf-answer-requirements"
                      label={copy.requirementIds}
                    />
                    <input
                      className={inputClassName}
                      disabled={answerForm.isNoRequirementSelection}
                      id="kuf-answer-requirements"
                      onChange={event =>
                        setAnswerForm(previous => ({
                          ...previous,
                          requirementIds: event.target.value,
                        }))
                      }
                      value={answerForm.requirementIds}
                    />
                  </div>
                  <div>
                    <FieldLabelWithHelp
                      help=""
                      htmlFor="kuf-answer-sort"
                      label={copy.sortOrder}
                    />
                    <input
                      className={inputClassName}
                      id="kuf-answer-sort"
                      min="0"
                      onChange={event =>
                        setAnswerForm(previous => ({
                          ...previous,
                          sortOrder: event.target.value,
                        }))
                      }
                      type="number"
                      value={answerForm.sortOrder}
                    />
                  </div>
                  <button
                    className="btn-primary inline-flex items-center gap-1.5"
                    disabled={submitting}
                    type="submit"
                  >
                    <Plus aria-hidden="true" className="h-4 w-4" />
                    {copy.addAnswer}
                  </button>
                </div>
              </form>
            </aside>
          )}
        </div>
      </div>
    </div>
  )
}

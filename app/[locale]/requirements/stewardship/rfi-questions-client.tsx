'use client'

import {
  Archive,
  CheckCircle2,
  ChevronRight,
  MessageSquareCheck,
  MessageSquareWarning,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  X,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useConfirmModal } from '@/components/ConfirmModal'
import FieldLabelWithHelp from '@/components/FieldLabelWithHelp'
import FloatingActionRail from '@/components/FloatingActionRail'
import FormModal from '@/components/FormModal'
import { devMarker } from '@/lib/developer-mode-markers'
import { apiFetch } from '@/lib/http/api-fetch'
import { readResponseMessage } from '@/lib/http/response-message'
import { formatActorDisplayNameForLocale } from '@/lib/privacy/display-name'
import {
  readRfiQuestionSuggestionMutationError,
  shouldReloadRfiQuestionSuggestions,
} from '@/lib/requirements/rfi-question-suggestion-conflicts'

interface RequirementArea {
  id: number
  name: string
  permissions?: {
    canAuthor?: boolean
    canManageAssignments?: boolean
  }
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
  createdByDisplayName: string | null
  createdByHsaId: string | null
  id: number
  isReviewRequested: boolean
  questionCode: string | null
  resolution: number | null
  resolutionMotivation: string | null
  resolvedAt: string | null
  resolvedByDisplayName: string | null
  resolvedByHsaId: string | null
  reviewRequestedAt: string | null
  rfiQuestionId: number | null
  sourceSpecificationCode: string | null
  sourceSpecificationName: string | null
  specificationId: number | null
  updatedAt: string | null
}

interface FormState {
  areaId: string
  expectedAnswerFormat: string
  helpText: string
  id: number | null
  questionText: string
}

type StatusFilter = '' | 'active' | 'archived'
type SuggestionFilter = '' | 'unresolved'
type SuggestionTarget =
  | {
      areaId: number
      areaName: string
      areaPrefix: string
      kind: 'area'
    }
  | {
      kind: 'question'
      question: RfiQuestion
    }

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

function isUntreatedSuggestion(suggestion: RfiSuggestion) {
  return suggestion.resolution == null
}

function firstLine(value: string) {
  return value.split(/\r?\n/, 1)[0] ?? value
}

interface RfiCopy {
  active: string
  allAreas: string
  allStatuses: string
  allSuggestionStates: string
  alreadyResolvedSuggestion: string
  archive: string
  archived: string
  area: string
  areaHelp: string
  areaLockedHint: string
  confirmArchiveQuestion: string
  createdAt: string
  creatorLabel: string
  dismiss: string
  dismissedResolution: string
  editQuestion: string
  emptyQuestions: string
  emptySuggestions: string
  expectedAnswerFormat: string
  expectedAnswerFormatHelp: string
  handledSuggestions: string
  handleSuggestions: string
  helpText: string
  helpTextHelp: string
  hideQuestionDetails: string
  intro: string
  loadError: string
  loading: string
  markResolved: string
  newQuestion: string
  newSuggestions: string
  noFilteredQuestions: string
  noSource: string
  notDraftSuggestion: string
  notFoundSuggestion: string
  questions: string
  questionText: string
  questionTextHelp: string
  reactivate: string
  requestReview: string
  resolutionMotivation: string
  resolutionMotivationHelp: string
  resolutionRequired: string
  resolvedAt: string
  resolvedResolution: string
  reviewAlreadyRequested: string
  reviewRequired: string
  reviewSuggestions: string
  saveError: string
  saveQuestion: string
  saving: string
  search: string
  showQuestionDetails: string
  source: string
  status: string
  suggestionFilter: string
  suggestions: string
  title: string
  unknownCreator: string
  unresolvedSuggestions: string
  viewHandledSuggestions: string
}

export default function RfiQuestionsClient() {
  const locale = useLocale()
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
  const [suggestionFilter, setSuggestionFilter] = useState<SuggestionFilter>('')
  const [questionSearch, setQuestionSearch] = useState('')
  const [suggestionTarget, setSuggestionTarget] =
    useState<SuggestionTarget | null>(null)
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
      alreadyResolvedSuggestion: t('conflicts.alreadyResolved'),
      allAreas: t('allAreas'),
      allSuggestionStates: t('allSuggestionStates'),
      allStatuses: t('allStatuses'),
      archive: t('archive'),
      archived: t('archived'),
      area: t('area'),
      areaHelp: t('fieldHelp.area'),
      areaLockedHint: t('areaLockedHint'),
      confirmArchiveQuestion: t('confirmArchiveQuestion'),
      createdAt: t('createdAt'),
      creatorLabel: t('createdBy'),
      dismiss: t('dismiss'),
      dismissedResolution: t('dismissedResolution'),
      editQuestion: t('editQuestion'),
      emptyQuestions: t('emptyQuestions'),
      emptySuggestions: t('emptySuggestions'),
      expectedAnswerFormat: t('expectedAnswerFormat'),
      expectedAnswerFormatHelp: t('fieldHelp.expectedAnswerFormat'),
      handledSuggestions: t('handledSuggestions'),
      handleSuggestions: t('handleSuggestions'),
      helpText: t('helpText'),
      helpTextHelp: t('fieldHelp.helpText'),
      hideQuestionDetails: t('hideQuestionDetails'),
      intro: t('intro'),
      loading: tc('loading'),
      loadError: t('loadError'),
      markResolved: t('markResolved'),
      newQuestion: t('newQuestion'),
      newSuggestions: t('newSuggestions'),
      noFilteredQuestions: t('noFilteredQuestions'),
      noSource: t('noSource'),
      notDraftSuggestion: t('conflicts.notDraft'),
      notFoundSuggestion: t('conflicts.notFound'),
      questionText: t('questionText'),
      questionTextHelp: t('fieldHelp.questionText'),
      questions: t('questions'),
      reactivate: t('reactivate'),
      requestReview: t('requestReview'),
      reviewAlreadyRequested: t('conflicts.reviewAlreadyRequested'),
      reviewRequired: t('conflicts.reviewRequired'),
      resolvedAt: t('resolvedAt'),
      resolvedResolution: t('resolvedResolution'),
      resolutionMotivation: t('resolutionMotivation'),
      resolutionMotivationHelp: t('fieldHelp.resolutionMotivation'),
      resolutionRequired: t('resolutionRequired'),
      reviewSuggestions: t('reviewSuggestions'),
      saveError: t('saveError'),
      saveQuestion: t('saveQuestion'),
      saving: tc('saving'),
      search: t('search'),
      source: t('source'),
      showQuestionDetails: t('showQuestionDetails'),
      status: t('status'),
      suggestionFilter: t('suggestionFilter'),
      suggestions: t('suggestions'),
      title: t('title'),
      unknownCreator: t('unknownCreator'),
      unresolvedSuggestions: t('unresolvedSuggestions'),
      viewHandledSuggestions: t('viewHandledSuggestions'),
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

  const suggestionConflictMessages = useMemo(
    () => ({
      alreadyResolved: copy.alreadyResolvedSuggestion,
      notDraft: copy.notDraftSuggestion,
      notFound: copy.notFoundSuggestion,
      reviewAlreadyRequested: copy.reviewAlreadyRequested,
      reviewRequired: copy.reviewRequired,
    }),
    [
      copy.alreadyResolvedSuggestion,
      copy.notDraftSuggestion,
      copy.notFoundSuggestion,
      copy.reviewAlreadyRequested,
      copy.reviewRequired,
    ],
  )

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

  const areaById = useMemo(() => {
    const areaMap = new Map<number, RequirementArea>()
    for (const area of areas) areaMap.set(area.id, area)
    for (const question of questions) {
      if (areaMap.has(question.areaId)) continue
      areaMap.set(question.areaId, {
        id: question.areaId,
        name: question.areaName,
        prefix: question.areaPrefix,
      })
    }
    return areaMap
  }, [areas, questions])

  const editableAreas = useMemo(
    () => areas.filter(area => area.permissions?.canAuthor === true),
    [areas],
  )

  const editableAreaIds = useMemo(
    () => new Set(editableAreas.map(area => area.id)),
    [editableAreas],
  )

  const suggestionsByAreaTarget = useMemo(() => {
    const map = new Map<number, RfiSuggestion[]>()
    for (const suggestion of suggestions) {
      if (suggestion.rfiQuestionId != null) continue
      const existing = map.get(suggestion.areaId) ?? []
      existing.push(suggestion)
      map.set(suggestion.areaId, existing)
    }
    return map
  }, [suggestions])

  const suggestionsByQuestionId = useMemo(() => {
    const map = new Map<number, RfiSuggestion[]>()
    for (const suggestion of suggestions) {
      if (suggestion.rfiQuestionId == null) continue
      const existing = map.get(suggestion.rfiQuestionId) ?? []
      existing.push(suggestion)
      map.set(suggestion.rfiQuestionId, existing)
    }
    return map
  }, [suggestions])

  const untreatedAreaTargetIds = useMemo(() => {
    const ids = new Set<number>()
    for (const suggestion of suggestions) {
      if (
        suggestion.rfiQuestionId == null &&
        isUntreatedSuggestion(suggestion)
      ) {
        ids.add(suggestion.areaId)
      }
    }
    return ids
  }, [suggestions])

  const untreatedQuestionIds = useMemo(() => {
    const ids = new Set<number>()
    for (const suggestion of suggestions) {
      if (
        suggestion.rfiQuestionId != null &&
        isUntreatedSuggestion(suggestion)
      ) {
        ids.add(suggestion.rfiQuestionId)
      }
    }
    return ids
  }, [suggestions])

  const normalizedSearch = questionSearch.trim().toLocaleLowerCase()

  const questionMatchesSearch = useCallback(
    (question: RfiQuestion) => {
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
    },
    [normalizedSearch],
  )

  const areaTargetMatchesSearch = useCallback(
    (areaId: number) => {
      if (!normalizedSearch) return true
      const area = areaById.get(areaId)
      const areaSuggestions = suggestionsByAreaTarget.get(areaId) ?? []
      return [
        area?.name ?? '',
        area?.prefix ?? '',
        ...areaSuggestions.flatMap(suggestion => [
          suggestion.areaName,
          suggestion.content,
          suggestion.sourceSpecificationName ?? '',
          suggestion.sourceSpecificationCode ?? '',
          suggestion.createdByDisplayName ?? '',
          suggestion.createdByHsaId ?? '',
        ]),
      ]
        .join(' ')
        .toLocaleLowerCase()
        .includes(normalizedSearch)
    },
    [areaById, normalizedSearch, suggestionsByAreaTarget],
  )

  const filteredQuestions = useMemo(
    () =>
      orderedQuestions.filter(question => {
        if (areaFilter && String(question.areaId) !== areaFilter) return false
        if (suggestionFilter === 'unresolved') {
          return (
            untreatedQuestionIds.has(question.id) &&
            questionMatchesSearch(question)
          )
        }
        if (statusFilter === 'active' && question.isArchived) return false
        if (statusFilter === 'archived' && !question.isArchived) return false
        return questionMatchesSearch(question)
      }),
    [
      areaFilter,
      orderedQuestions,
      questionMatchesSearch,
      statusFilter,
      suggestionFilter,
      untreatedQuestionIds,
    ],
  )

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

    if (suggestionFilter === 'unresolved') {
      for (const areaId of untreatedAreaTargetIds) {
        if (areaFilter && String(areaId) !== areaFilter) continue
        if (!areaTargetMatchesSearch(areaId)) continue
        if (groupsByAreaId.has(areaId)) continue
        const area = areaById.get(areaId)
        const areaSuggestion = suggestionsByAreaTarget.get(areaId)?.[0]
        const group = {
          areaId,
          areaName:
            area?.name ?? areaSuggestion?.areaName ?? `#${String(areaId)}`,
          areaPrefix: area?.prefix ?? '',
          questions: [],
        }
        groupsByAreaId.set(areaId, group)
        groups.push(group)
      }
    }

    return groups.sort((left, right) =>
      left.areaName.localeCompare(right.areaName),
    )
  }, [
    areaById,
    areaFilter,
    areaTargetMatchesSearch,
    filteredQuestions,
    suggestionFilter,
    suggestionsByAreaTarget,
    untreatedAreaTargetIds,
  ])

  const closeQuestionForm = () => {
    setShowQuestionForm(false)
    setForm(emptyForm)
  }

  const openQuestionForm = () => {
    const filteredAreaId = Number(areaFilter)
    const initialAreaId =
      Number.isInteger(filteredAreaId) && editableAreaIds.has(filteredAreaId)
        ? areaFilter
        : String(editableAreas[0]?.id ?? '')
    if (!initialAreaId) return
    setForm({
      ...emptyForm,
      areaId: initialAreaId,
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

  const getTargetSuggestions = useCallback(
    (target: SuggestionTarget) => {
      const targetSuggestions =
        target.kind === 'area'
          ? (suggestionsByAreaTarget.get(target.areaId) ?? [])
          : (suggestionsByQuestionId.get(target.question.id) ?? [])
      return [...targetSuggestions].sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt),
      )
    },
    [suggestionsByAreaTarget, suggestionsByQuestionId],
  )

  const targetSuggestions = useMemo(
    () => (suggestionTarget ? getTargetSuggestions(suggestionTarget) : []),
    [getTargetSuggestions, suggestionTarget],
  )

  const newSuggestions = useMemo(
    () =>
      targetSuggestions.filter(
        suggestion =>
          isUntreatedSuggestion(suggestion) && !suggestion.isReviewRequested,
      ),
    [targetSuggestions],
  )

  const reviewSuggestions = useMemo(
    () =>
      targetSuggestions.filter(
        suggestion =>
          isUntreatedSuggestion(suggestion) && suggestion.isReviewRequested,
      ),
    [targetSuggestions],
  )

  const handledSuggestions = useMemo(
    () =>
      targetSuggestions.filter(
        suggestion => !isUntreatedSuggestion(suggestion),
      ),
    [targetSuggestions],
  )

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale],
  )

  const formatDate = useCallback(
    (value: string | null) => {
      if (!value) return '-'
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return value
      return dateFormatter.format(date)
    },
    [dateFormatter],
  )

  const targetLabel = useCallback((target: SuggestionTarget) => {
    if (target.kind === 'area') {
      return `${target.areaPrefix} ${target.areaName}`.trim()
    }
    return target.question.questionCode
  }, [])

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
        const message = await readRfiQuestionSuggestionMutationError(
          response,
          suggestionConflictMessages,
          copy.saveError,
        )
        if (shouldReloadRfiQuestionSuggestions(response)) await loadData()
        throw new Error(message)
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

  const requestSuggestionReview = async (suggestion: RfiSuggestion) => {
    setSaving(true)
    setError(null)
    try {
      const response = await apiFetch(
        `/api/rfi-question-suggestions/${suggestion.id}/request-review`,
        { method: 'POST' },
      )
      if (!response.ok) {
        const message = await readRfiQuestionSuggestionMutationError(
          response,
          suggestionConflictMessages,
          copy.saveError,
        )
        if (shouldReloadRfiQuestionSuggestions(response)) await loadData()
        throw new Error(message)
      }
      await loadData()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : copy.saveError)
    } finally {
      setSaving(false)
    }
  }

  const getSourceText = (suggestion: RfiSuggestion) =>
    suggestion.sourceSpecificationName
      ? `${suggestion.sourceSpecificationName} (${suggestion.sourceSpecificationCode ?? '-'})`
      : copy.noSource

  const getCreatorText = (suggestion: RfiSuggestion) => {
    const name = formatActorDisplayNameForLocale(
      suggestion.createdByDisplayName,
      locale,
    )?.trim()
    const hsaId = suggestion.createdByHsaId?.trim()
    return name || hsaId || copy.unknownCreator
  }

  const getResolutionLabel = (suggestion: RfiSuggestion) =>
    suggestion.resolution === 2
      ? copy.dismissedResolution
      : copy.resolvedResolution

  const renderSuggestionIndicator = (
    target: SuggestionTarget,
    targetSuggestionList: RfiSuggestion[],
  ) => {
    if (targetSuggestionList.length === 0) return null

    const untreatedCount = targetSuggestionList.filter(
      isUntreatedSuggestion,
    ).length
    const hasUntreated = untreatedCount > 0
    const Icon = hasUntreated ? MessageSquareWarning : MessageSquareCheck
    const label = hasUntreated
      ? copy.handleSuggestions
      : copy.viewHandledSuggestions
    const targetText = targetLabel(target)
    const markerValue =
      target.kind === 'area'
        ? `area ${target.areaPrefix || target.areaId} ${
            hasUntreated ? 'untreated' : 'handled'
          }`
        : `question ${target.question.questionCode} ${
            hasUntreated ? 'untreated' : 'handled'
          }`

    return (
      <button
        aria-label={`${label}: ${targetText}`}
        className={`relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${
          hasUntreated
            ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-700/70 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-900/40'
            : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800/70 dark:bg-emerald-950/30 dark:text-emerald-200 dark:hover:bg-emerald-900/40'
        }`}
        disabled={saving}
        onClick={() => setSuggestionTarget(target)}
        title={`${label}: ${targetText}`}
        type="button"
        {...devMarker({
          context: 'rfiQuestions',
          name: 'suggestion indicator',
          value: markerValue,
        })}
      >
        <Icon aria-hidden="true" className="h-5 w-5" />
        {hasUntreated ? (
          <span className="-right-1 -top-1 absolute inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-secondary-950 px-1 text-[11px] font-semibold leading-none text-white dark:bg-secondary-100 dark:text-secondary-950">
            {untreatedCount}
          </span>
        ) : null}
      </button>
    )
  }

  const renderSuggestionCard = (
    suggestion: RfiSuggestion,
    variant: 'handled' | 'new' | 'review',
  ) => {
    const resolutionId = `rfi-suggestion-resolution-${suggestion.id}`
    const creator = getCreatorText(suggestion)
    const creatorHsaId = suggestion.createdByHsaId?.trim()
    const creatorTitle =
      suggestion.createdByDisplayName && creatorHsaId ? creatorHsaId : undefined

    if (variant === 'handled') {
      return (
        <article
          className="rounded-xl border border-secondary-200 bg-secondary-50/80 p-3 text-sm dark:border-secondary-800 dark:bg-secondary-900/70"
          key={suggestion.id}
        >
          <div className="flex flex-wrap items-start gap-2">
            <span className="inline-flex items-center rounded-md bg-white px-2 py-1 text-xs font-medium text-secondary-700 ring-1 ring-secondary-200 dark:bg-secondary-950 dark:text-secondary-200 dark:ring-secondary-800">
              {getResolutionLabel(suggestion)}
            </span>
            <p className="min-w-0 flex-1 font-medium text-secondary-900 dark:text-secondary-100">
              {firstLine(suggestion.content)}
            </p>
          </div>
          <p className="mt-2 text-xs text-secondary-500 dark:text-secondary-400">
            {copy.resolvedAt}: {formatDate(suggestion.resolvedAt)}
            {suggestion.resolutionMotivation
              ? ` - ${firstLine(suggestion.resolutionMotivation)}`
              : ''}
          </p>
          <details className="mt-2">
            <summary className="cursor-pointer text-xs font-medium text-primary-700 hover:text-primary-800 dark:text-primary-300 dark:hover:text-primary-200">
              {copy.handledSuggestions}
            </summary>
            <div className="mt-2 space-y-2 text-xs leading-5 text-secondary-600 dark:text-secondary-300">
              <p>{suggestion.content}</p>
              <p>
                {copy.source}: {getSourceText(suggestion)}
              </p>
              <p title={creatorTitle}>
                {copy.creatorLabel}: {creator}
              </p>
              <p>
                {copy.createdAt}: {formatDate(suggestion.createdAt)}
              </p>
              {suggestion.questionCode ? (
                <p className="font-mono">{suggestion.questionCode}</p>
              ) : null}
            </div>
          </details>
        </article>
      )
    }

    return (
      <article
        className="space-y-3 rounded-xl border border-secondary-200 bg-white p-3 text-sm shadow-sm dark:border-secondary-800 dark:bg-secondary-950"
        key={suggestion.id}
      >
        <div>
          <p className="leading-6 text-secondary-900 dark:text-secondary-100">
            {suggestion.content}
          </p>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-secondary-500 dark:text-secondary-400">
            <span>
              {copy.source}: {getSourceText(suggestion)}
            </span>
            <span title={creatorTitle}>
              {copy.creatorLabel}: {creator}
            </span>
            <span>
              {copy.createdAt}: {formatDate(suggestion.createdAt)}
            </span>
            {suggestion.questionCode ? (
              <span className="font-mono">{suggestion.questionCode}</span>
            ) : null}
          </div>
        </div>
        {variant === 'review' ? (
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
        ) : null}
        <div className="flex flex-wrap gap-2">
          {variant === 'new' ? (
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200 dark:hover:bg-amber-900/40"
              disabled={saving}
              onClick={() => void requestSuggestionReview(suggestion)}
              type="button"
              {...devMarker({
                context: 'rfiQuestions',
                name: 'suggestion lifecycle action',
                value: 'draft to review requested',
              })}
            >
              <MessageSquareWarning aria-hidden="true" className="h-4 w-4" />
              {copy.requestReview}
            </button>
          ) : null}
          {variant === 'review' ? (
            <>
              <button
                className="btn-primary inline-flex min-h-10 items-center gap-2"
                disabled={saving}
                onClick={() => void resolveSuggestion(suggestion, 'resolved')}
                type="button"
                {...devMarker({
                  context: 'rfiQuestions',
                  name: 'suggestion lifecycle action',
                  value: 'review requested to resolved',
                })}
              >
                <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                {copy.markResolved}
              </button>
              <button
                className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-secondary-300 px-3 py-1.5 text-sm font-medium text-secondary-700 hover:bg-secondary-50 dark:border-secondary-700 dark:text-secondary-200 dark:hover:bg-secondary-800"
                disabled={saving}
                onClick={() => void resolveSuggestion(suggestion, 'dismissed')}
                type="button"
                {...devMarker({
                  context: 'rfiQuestions',
                  name: 'suggestion lifecycle action',
                  value: 'review requested to dismissed',
                })}
              >
                <X aria-hidden="true" className="h-4 w-4" />
                {copy.dismiss}
              </button>
            </>
          ) : null}
        </div>
      </article>
    )
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
          disabled={form.id != null || editableAreas.length === 0}
          id="rfi-question-area"
          onChange={event =>
            setForm(current => ({ ...current, areaId: event.target.value }))
          }
          title={form.id != null ? copy.areaLockedHint : undefined}
          value={form.areaId}
        >
          {editableAreas.map(area => (
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
              disabled: saving || editableAreas.length === 0,
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
        <FormModal
          closeDisabled={saving}
          developerModeValue="RFI question suggestions"
          maxWidthClassName="max-w-3xl"
          onClose={() => setSuggestionTarget(null)}
          open={suggestionTarget != null}
          title={copy.handleSuggestions}
          titleId="rfi-question-suggestions-title"
        >
          {suggestionTarget ? (
            <div className="space-y-5">
              <div className="rounded-xl border border-secondary-200 bg-secondary-50 px-4 py-3 text-sm text-secondary-700 dark:border-secondary-800 dark:bg-secondary-950/70 dark:text-secondary-200">
                {suggestionTarget.kind === 'area' ? (
                  <p>
                    {copy.area}: {targetLabel(suggestionTarget)}
                  </p>
                ) : (
                  <div className="space-y-1">
                    <p className="font-mono text-xs">
                      {suggestionTarget.question.questionCode}
                    </p>
                    <p>{suggestionTarget.question.questionText}</p>
                  </div>
                )}
              </div>

              {targetSuggestions.length === 0 ? (
                <p className="text-sm text-secondary-600 dark:text-secondary-300">
                  {copy.emptySuggestions}
                </p>
              ) : null}

              {newSuggestions.length > 0 ? (
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold text-secondary-900 dark:text-secondary-100">
                    {copy.newSuggestions}
                  </h3>
                  {newSuggestions.map(suggestion =>
                    renderSuggestionCard(suggestion, 'new'),
                  )}
                </section>
              ) : null}

              {reviewSuggestions.length > 0 ? (
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold text-secondary-900 dark:text-secondary-100">
                    {copy.reviewSuggestions}
                  </h3>
                  {reviewSuggestions.map(suggestion =>
                    renderSuggestionCard(suggestion, 'review'),
                  )}
                </section>
              ) : null}

              {handledSuggestions.length > 0 ? (
                newSuggestions.length > 0 || reviewSuggestions.length > 0 ? (
                  <details className="rounded-xl border border-secondary-200 p-3 dark:border-secondary-800">
                    <summary className="cursor-pointer text-sm font-semibold text-secondary-900 dark:text-secondary-100">
                      {copy.handledSuggestions} ({handledSuggestions.length})
                    </summary>
                    <div className="mt-3 space-y-3">
                      {handledSuggestions.map(suggestion =>
                        renderSuggestionCard(suggestion, 'handled'),
                      )}
                    </div>
                  </details>
                ) : (
                  <section className="space-y-3">
                    <h3 className="text-sm font-semibold text-secondary-900 dark:text-secondary-100">
                      {copy.handledSuggestions}
                    </h3>
                    {handledSuggestions.map(suggestion =>
                      renderSuggestionCard(suggestion, 'handled'),
                    )}
                  </section>
                )
              ) : null}
            </div>
          ) : null}
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

        <div className="mb-5 grid gap-3 rounded-2xl border bg-white/80 p-4 shadow-sm dark:border-secondary-800 dark:bg-secondary-900/60 md:grid-cols-[minmax(0,1fr)_220px_180px_180px_190px]">
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
          <select
            aria-label={copy.suggestionFilter}
            className={inputClassName}
            onChange={event =>
              setSuggestionFilter(event.target.value as SuggestionFilter)
            }
            value={suggestionFilter}
          >
            <option value="">{copy.allSuggestionStates}</option>
            <option value="unresolved">{copy.unresolvedSuggestions}</option>
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
            ) : questions.length === 0 && groupedQuestions.length === 0 ? (
              <div
                className="rounded-2xl border bg-white/80 p-6 text-sm text-secondary-600 shadow-sm dark:border-secondary-800 dark:bg-secondary-900/60 dark:text-secondary-300"
                {...devMarker({
                  context: 'rfiQuestions',
                  name: 'empty state',
                })}
              >
                {copy.emptyQuestions}
              </div>
            ) : groupedQuestions.length === 0 ? (
              <div className="rounded-2xl border bg-white/80 p-6 text-sm text-secondary-600 shadow-sm dark:border-secondary-800 dark:bg-secondary-900/60 dark:text-secondary-300">
                {copy.noFilteredQuestions}
              </div>
            ) : (
              groupedQuestions.map(group => {
                const areaTargetSuggestions =
                  suggestionsByAreaTarget.get(group.areaId) ?? []
                const areaTarget: SuggestionTarget = {
                  areaId: group.areaId,
                  areaName: group.areaName,
                  areaPrefix: group.areaPrefix,
                  kind: 'area',
                }

                return (
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
                      <div className="ml-auto">
                        {renderSuggestionIndicator(
                          areaTarget,
                          areaTargetSuggestions,
                        )}
                      </div>
                    </div>
                    {group.questions.length > 0 ? (
                      <ul className="space-y-3">
                        {group.questions.map(question => {
                          const isExpanded = expandedQuestionIds.has(
                            question.id,
                          )
                          const detailsId = `rfi-question-details-${question.id}`
                          const questionTargetSuggestions =
                            suggestionsByQuestionId.get(question.id) ?? []
                          const questionTarget: SuggestionTarget = {
                            kind: 'question',
                            question,
                          }
                          const canManageQuestion = editableAreaIds.has(
                            question.areaId,
                          )

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
                                  {canManageQuestion ? (
                                    <>
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
                                    </>
                                  ) : null}
                                  {renderSuggestionIndicator(
                                    questionTarget,
                                    questionTargetSuggestions,
                                  )}
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
                    ) : null}
                  </section>
                )
              })
            )}
          </div>
        </div>
      </div>
    </main>
  )
}

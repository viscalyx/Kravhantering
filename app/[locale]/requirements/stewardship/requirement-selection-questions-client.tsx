'use client'

import {
  Archive,
  CheckCircle2,
  Copy,
  GripVertical,
  Lock,
  PauseCircle,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useConfirmModal } from '@/components/ConfirmModal'
import FieldLabelWithHelp from '@/components/FieldLabelWithHelp'
import FloatingActionRail from '@/components/FloatingActionRail'
import FormModal from '@/components/FormModal'
import { type HelpContent, useHelpContent } from '@/components/HelpPanel'
import { devMarker } from '@/lib/developer-mode-markers'
import { apiFetch } from '@/lib/http/api-fetch'
import { readResponseMessage } from '@/lib/http/response-message'

type SelectionType = 'multiple' | 'single'

interface RequirementArea {
  description: string | null
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
  healthState: 'missing_requirement_selection' | 'ok'
  id: number
  isActive: boolean
  isArchived: boolean
  isNoRequirementSelection: boolean
  matchingRequirementCount: number
  matchingRequirements: Array<{
    description: string | null
    id: number
    uniqueId: string
  }>
  packageIds: number[]
  questionId: number
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

const modalTextareaClassName = `${inputClassName} min-h-24 max-h-[28vh] resize-y overflow-auto`

const lockedInputClassName =
  ' disabled:cursor-not-allowed disabled:border-secondary-200 disabled:bg-secondary-100 disabled:text-secondary-500 disabled:opacity-100 dark:disabled:border-secondary-700 dark:disabled:bg-secondary-900/70 dark:disabled:text-secondary-500'

function moveAnswerIntoTargetSlot(
  answers: RequirementSelectionAnswer[],
  answerId: number,
  targetAnswerId: number,
) {
  const currentIndex = answers.findIndex(answer => answer.id === answerId)
  const targetIndex = answers.findIndex(answer => answer.id === targetAnswerId)
  if (currentIndex < 0 || targetIndex < 0 || currentIndex === targetIndex) {
    return null
  }

  const orderedAnswers = [...answers]
  const [movedAnswer] = orderedAnswers.splice(currentIndex, 1)
  if (!movedAnswer) return null

  orderedAnswers.splice(targetIndex, 0, movedAnswer)
  return orderedAnswers
}

const REQUIREMENT_SELECTION_QUESTIONS_STEWARDSHIP_HELP: HelpContent = {
  sections: [
    {
      kind: 'text',
      bodyKey: 'requirementSelectionQuestionsStewardship.overview.body',
      headingKey: 'requirementSelectionQuestionsStewardship.overview.heading',
    },
    {
      kind: 'text',
      bodyKey: 'requirementSelectionQuestionsStewardship.answers.body',
      headingKey: 'requirementSelectionQuestionsStewardship.answers.heading',
    },
    {
      kind: 'text',
      bodyKey: 'requirementSelectionQuestionsStewardship.health.body',
      headingKey: 'requirementSelectionQuestionsStewardship.health.heading',
    },
  ],
  titleKey: 'requirementSelectionQuestionsStewardship.title',
}

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
  useHelpContent(REQUIREMENT_SELECTION_QUESTIONS_STEWARDSHIP_HELP)
  const { confirm } = useConfirmModal()
  const t = useTranslations('requirementSelectionQuestionsStewardship')
  const contentRef = useRef<HTMLDivElement>(null)
  const listAnchorRef = useRef<HTMLDivElement>(null)
  const answerTextRef = useRef<HTMLInputElement>(null)
  const questionTextRef = useRef<HTMLInputElement>(null)
  const copy = useMemo(
    () => ({
      activate: t('activate'),
      active: t('active'),
      addAnswer: t('addAnswer'),
      allAreas: t('allAreas'),
      allStatuses: t('allStatuses'),
      archive: t('archive'),
      archived: t('archived'),
      area: t('area'),
      areaHelp: t('fieldHelp.area'),
      areaLockedHint: t('areaLockedHint'),
      areaLockedTooltip: t('areaLockedTooltip'),
      answerDescriptionHelp: t('fieldHelp.answerDescription'),
      answerPackagesHelp: t('fieldHelp.answerPackages'),
      answerSortOrderHelp: t('fieldHelp.answerSortOrder'),
      answerTextHelp: t('fieldHelp.answerText'),
      clone: t('clone'),
      confirmArchiveAnswer: t('confirmArchiveAnswer'),
      confirmArchiveQuestion: t('confirmArchiveQuestion'),
      confirmDeleteAnswer: t('confirmDeleteAnswer'),
      confirmDeleteQuestion: t('confirmDeleteQuestion'),
      create: t('create'),
      createQuestion: t('createQuestion'),
      deactivate: t('deactivate'),
      delete: t('delete'),
      description: t('description'),
      edit: t('edit'),
      editAnswer: t('editAnswer'),
      editQuestion: t('editQuestion'),
      error: t('error'),
      helpText: t('helpText'),
      inactive: t('inactive'),
      loading: t('loading'),
      matchingRequirements: t('matchingRequirements'),
      missingRequirementSelection: t('missingRequirementSelection'),
      multiple: t('multiple'),
      noQuestions: t('noQuestions'),
      noRequirementSelection: t('noRequirementSelection'),
      packages: t('packages'),
      questionHelpTextHelp: t('fieldHelp.questionHelpText'),
      questionTextHelp: t('fieldHelp.questionText'),
      reactivate: t('reactivate'),
      reorderAnswer: t('reorderAnswer'),
      reorderAnswerHint: t('reorderAnswerHint'),
      requirementIds: t('requirementIds'),
      requirementIdsHelp: t('fieldHelp.requirementIds'),
      save: t('save'),
      search: t('search'),
      selectionType: t('selectionType'),
      selectionTypeHelp: t('fieldHelp.selectionType'),
      single: t('single'),
      sortOrder: t('sortOrder'),
      sortOrderHelp: t('fieldHelp.sortOrder'),
      status: t('status'),
      text: t('text'),
      title: t('title'),
    }),
    [t],
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
  const [editingQuestionId, setEditingQuestionId] = useState<number | null>(
    null,
  )
  const [editingAnswerId, setEditingAnswerId] = useState<number | null>(null)
  const [expandedAnswerId, setExpandedAnswerId] = useState<number | null>(null)
  const [questionSearch, setQuestionSearch] = useState('')
  const [areaFilter, setAreaFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<
    '' | 'active' | 'archived' | 'inactive'
  >('')
  const [showQuestionForm, setShowQuestionForm] = useState(false)
  const [showAnswerForm, setShowAnswerForm] = useState(false)
  const [armedDragAnswerId, setArmedDragAnswerId] = useState<number | null>(
    null,
  )
  const [draggedAnswerId, setDraggedAnswerId] = useState<number | null>(null)
  const [dragOverAnswerId, setDragOverAnswerId] = useState<number | null>(null)
  const [reorderingAnswerId, setReorderingAnswerId] = useState<number | null>(
    null,
  )
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const questionsRef = useRef<RequirementSelectionQuestion[]>([])
  const draggedAnswerRef = useRef<{
    answerId: number
    originalAnswers: RequirementSelectionAnswer[]
    questionId: number
  } | null>(null)
  const dragDropCommittedRef = useRef(false)
  const dragPreviewedRef = useRef(false)

  useEffect(() => {
    questionsRef.current = questions
  }, [questions])

  const selectedQuestion =
    questions.find(question => question.id === selectedQuestionId) ?? null

  const filteredQuestions = useMemo(() => {
    const normalizedSearch = questionSearch.trim().toLocaleLowerCase()
    return questions.filter(question => {
      if (areaFilter && String(question.areaId) !== areaFilter) return false
      if (
        statusFilter === 'active' &&
        (!question.isActive || question.isArchived)
      ) {
        return false
      }
      if (
        statusFilter === 'inactive' &&
        (question.isActive || question.isArchived)
      ) {
        return false
      }
      if (statusFilter === 'archived' && !question.isArchived) return false
      if (!normalizedSearch) return true
      return [
        question.questionCode,
        question.text,
        question.helpText ?? '',
        question.areaName,
        ...question.answers.map(answer => answer.text),
      ]
        .join(' ')
        .toLocaleLowerCase()
        .includes(normalizedSearch)
    })
  }, [areaFilter, questionSearch, questions, statusFilter])

  const openQuestionForm = () => {
    setQuestionForm(initialQuestionForm)
    setEditingQuestionId(null)
    setError(null)
    setShowQuestionForm(true)
  }

  const openQuestionEditForm = (question: RequirementSelectionQuestion) => {
    setQuestionForm({
      areaId: String(question.areaId),
      helpText: question.helpText ?? '',
      selectionType: question.selectionType,
      sortOrder: String(question.sortOrder),
      text: question.text,
    })
    setEditingQuestionId(question.id)
    setError(null)
    setShowQuestionForm(true)
  }

  const closeQuestionForm = () => {
    if (submitting) return
    setQuestionForm(initialQuestionForm)
    setEditingQuestionId(null)
    setShowQuestionForm(false)
  }

  const resetAnswerEditingState = useCallback(() => {
    setAnswerForm(initialAnswerForm)
    setEditingAnswerId(null)
    setExpandedAnswerId(null)
    setShowAnswerForm(false)
  }, [])

  const openAnswerForm = (question: RequirementSelectionQuestion) => {
    setSelectedQuestionId(question.id)
    setAnswerForm(initialAnswerForm)
    setEditingAnswerId(null)
    setExpandedAnswerId(null)
    setError(null)
    setShowAnswerForm(true)
  }

  const closeAnswerForm = () => {
    if (submitting) return
    setAnswerForm(initialAnswerForm)
    setEditingAnswerId(null)
    setShowAnswerForm(false)
  }

  const selectQuestion = useCallback(
    (questionId: number | null) => {
      setSelectedQuestionId(current => {
        if (current === questionId) {
          return current
        }
        resetAnswerEditingState()
        return questionId
      })
    },
    [resetAnswerEditingState],
  )

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
        const nextQuestionId =
          current && nextQuestions.some(question => question.id === current)
            ? current
            : (nextQuestions[0]?.id ?? null)
        if (nextQuestionId !== current) {
          resetAnswerEditingState()
        }
        return nextQuestionId
      })
    } catch {
      setError(copy.error)
    } finally {
      setLoading(false)
    }
  }, [copy.error, resetAnswerEditingState])

  useEffect(() => {
    void reload()
  }, [reload])

  const submitQuestion = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!questionForm.areaId) return
    setSubmitting(true)
    setError(null)
    try {
      const response = await apiFetch(
        editingQuestionId
          ? `/api/requirement-selection-questions/${editingQuestionId}`
          : '/api/requirement-selection-questions',
        {
          body: JSON.stringify({
            ...(editingQuestionId
              ? {}
              : { areaId: Number(questionForm.areaId) }),
            helpText: questionForm.helpText || undefined,
            selectionType: questionForm.selectionType,
            sortOrder: Number(questionForm.sortOrder || 0),
            text: questionForm.text,
          }),
          headers: { 'Content-Type': 'application/json' },
          method: editingQuestionId ? 'PUT' : 'POST',
        },
      )
      if (!response.ok) {
        setError((await readResponseMessage(response)) ?? copy.error)
        return
      }
      const created = (await response.json()) as RequirementSelectionQuestion
      setQuestionForm(initialQuestionForm)
      selectQuestion(created.id)
      setEditingQuestionId(null)
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
        editingAnswerId
          ? `/api/requirement-selection-questions/${selectedQuestion.id}/answers/${editingAnswerId}`
          : `/api/requirement-selection-questions/${selectedQuestion.id}/answers`,
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
          method: editingAnswerId ? 'PUT' : 'POST',
        },
      )
      if (!response.ok) {
        setError((await readResponseMessage(response)) ?? copy.error)
        return
      }
      setAnswerForm(initialAnswerForm)
      setEditingAnswerId(null)
      setShowAnswerForm(false)
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
    anchorEl?: HTMLElement,
  ) => {
    const method = operation === 'delete' ? 'DELETE' : 'POST'
    const path =
      operation === 'delete'
        ? `/api/requirement-selection-questions/${question.id}`
        : `/api/requirement-selection-questions/${question.id}/${operation}`
    if (operation === 'archive' || operation === 'delete') {
      void confirm({
        anchorEl,
        confirmText: operation === 'delete' ? copy.delete : copy.archive,
        icon: 'caution',
        message:
          operation === 'delete'
            ? copy.confirmDeleteQuestion
            : copy.confirmArchiveQuestion,
        variant: 'danger',
      }).then(confirmed => {
        if (confirmed) void mutate(path, method)
      })
      return
    }
    void mutate(path, method)
  }

  const answerAction = (
    question: RequirementSelectionQuestion,
    answer: RequirementSelectionAnswer,
    operation: 'activate' | 'archive' | 'deactivate' | 'delete' | 'reactivate',
    anchorEl?: HTMLElement,
  ) => {
    const method = operation === 'delete' ? 'DELETE' : 'POST'
    const path =
      operation === 'delete'
        ? `/api/requirement-selection-questions/${question.id}/answers/${answer.id}`
        : `/api/requirement-selection-questions/${question.id}/answers/${answer.id}/${operation}`
    if (operation === 'archive' || operation === 'delete') {
      void confirm({
        anchorEl,
        confirmText: operation === 'delete' ? copy.delete : copy.archive,
        icon: 'caution',
        message:
          operation === 'delete'
            ? copy.confirmDeleteAnswer
            : copy.confirmArchiveAnswer,
        variant: 'danger',
      }).then(confirmed => {
        if (confirmed) void mutate(path, method)
      })
      return
    }
    void mutate(path, method)
  }

  const editAnswer = (answer: RequirementSelectionAnswer) => {
    setSelectedQuestionId(answer.questionId)
    setAnswerForm({
      description: answer.description ?? '',
      isNoRequirementSelection: answer.isNoRequirementSelection,
      packageIds: answer.packageIds.map(String),
      requirementIds: answer.requirementIds.join(', '),
      sortOrder: String(answer.sortOrder),
      text: answer.text,
    })
    setEditingAnswerId(answer.id)
    setError(null)
    setShowAnswerForm(true)
  }

  const persistAnswerOrder = async (
    question: RequirementSelectionQuestion,
    orderedAnswers: RequirementSelectionAnswer[],
    movedAnswerId: number,
  ) => {
    const updates = orderedAnswers
      .map((answer, index) => ({ answer, sortOrder: index }))
      .filter(item => item.answer.sortOrder !== item.sortOrder)

    if (updates.length === 0) return

    setQuestions(current =>
      current.map(item =>
        item.id === question.id
          ? {
              ...item,
              answers: orderedAnswers.map((answer, index) => ({
                ...answer,
                sortOrder: index,
              })),
            }
          : item,
      ),
    )
    setReorderingAnswerId(movedAnswerId)
    setSubmitting(true)
    setError(null)

    try {
      const responses = await Promise.all(
        updates.map(({ answer, sortOrder }) =>
          apiFetch(
            `/api/requirement-selection-questions/${question.id}/answers/${answer.id}`,
            {
              body: JSON.stringify({ sortOrder }),
              headers: { 'Content-Type': 'application/json' },
              method: 'PUT',
            },
          ),
        ),
      )
      const failedResponse = responses.find(response => !response.ok)
      if (failedResponse) {
        setError((await readResponseMessage(failedResponse)) ?? copy.error)
        await reload()
        return
      }
    } catch {
      setError(copy.error)
      await reload()
    } finally {
      setSubmitting(false)
      setReorderingAnswerId(null)
    }
  }

  const moveAnswerToIndex = (
    question: RequirementSelectionQuestion,
    answerId: number,
    targetIndex: number,
  ) => {
    const currentIndex = question.answers.findIndex(
      answer => answer.id === answerId,
    )
    if (currentIndex < 0) return

    const boundedTargetIndex = Math.max(
      0,
      Math.min(targetIndex, question.answers.length - 1),
    )
    if (currentIndex === boundedTargetIndex) return

    const orderedAnswers = [...question.answers]
    const [movedAnswer] = orderedAnswers.splice(currentIndex, 1)
    if (!movedAnswer) return

    orderedAnswers.splice(boundedTargetIndex, 0, movedAnswer)
    void persistAnswerOrder(question, orderedAnswers, answerId)
  }

  const setVisibleAnswerDragImage = (event: React.DragEvent<HTMLLIElement>) => {
    const sourceRow = event.currentTarget
    const dragImage = sourceRow.cloneNode(true) as HTMLElement
    const sourceRect = sourceRow.getBoundingClientRect()
    dragImage.style.left = '-10000px'
    dragImage.style.pointerEvents = 'none'
    dragImage.style.position = 'fixed'
    dragImage.style.top = '-10000px'
    dragImage.style.visibility = 'visible'
    dragImage.style.width = `${sourceRect.width}px`

    const dragImageOffsetX =
      Math.max(0, Math.min(event.nativeEvent.offsetX, sourceRect.width)) ||
      Math.min(32, sourceRect.width / 2)
    const dragImageOffsetY =
      Math.max(0, Math.min(event.nativeEvent.offsetY, sourceRect.height)) ||
      Math.min(32, sourceRect.height / 2)

    document.body.appendChild(dragImage)
    event.dataTransfer.setDragImage(
      dragImage,
      dragImageOffsetX,
      dragImageOffsetY,
    )
    window.setTimeout(() => dragImage.remove(), 0)
  }

  const previewAnswerMove = (
    questionId: number,
    targetAnswer: RequirementSelectionAnswer,
  ) => {
    const draggedAnswer = draggedAnswerRef.current
    if (
      !draggedAnswer ||
      draggedAnswer.questionId !== questionId ||
      draggedAnswer.answerId === targetAnswer.id
    ) {
      return
    }

    setQuestions(current => {
      let moved = false
      const nextQuestions = current.map(question => {
        if (question.id !== questionId) return question

        const orderedAnswers = moveAnswerIntoTargetSlot(
          question.answers,
          draggedAnswer.answerId,
          targetAnswer.id,
        )
        if (!orderedAnswers) return question

        moved = true
        return {
          ...question,
          answers: orderedAnswers,
        }
      })

      if (!moved) return current

      dragPreviewedRef.current = true
      questionsRef.current = nextQuestions
      return nextQuestions
    })
  }

  const restoreDraggedAnswerOrder = () => {
    const draggedAnswer = draggedAnswerRef.current
    if (!draggedAnswer) return

    setQuestions(current => {
      const nextQuestions = current.map(question =>
        question.id === draggedAnswer.questionId
          ? {
              ...question,
              answers: draggedAnswer.originalAnswers,
            }
          : question,
      )
      questionsRef.current = nextQuestions
      return nextQuestions
    })
  }

  const clearAnswerDragState = () => {
    draggedAnswerRef.current = null
    dragDropCommittedRef.current = false
    dragPreviewedRef.current = false
    setArmedDragAnswerId(null)
    setDraggedAnswerId(null)
    setDragOverAnswerId(null)
  }

  const handleAnswerDragStart = (
    event: React.DragEvent<HTMLLIElement>,
    question: RequirementSelectionQuestion,
    answer: RequirementSelectionAnswer,
  ) => {
    if (submitting || question.answers.length < 2) {
      event.preventDefault()
      return
    }

    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(answer.id))
    setVisibleAnswerDragImage(event)
    draggedAnswerRef.current = {
      answerId: answer.id,
      originalAnswers: question.answers,
      questionId: question.id,
    }
    dragDropCommittedRef.current = false
    dragPreviewedRef.current = false
    setDraggedAnswerId(answer.id)
    setDragOverAnswerId(answer.id)
  }

  const handleAnswerDragHandlePointerDown = (
    question: RequirementSelectionQuestion,
    answer: RequirementSelectionAnswer,
  ) => {
    if (submitting || question.answers.length < 2) return
    setArmedDragAnswerId(answer.id)
  }

  const handleAnswerDragEnd = () => {
    if (!dragDropCommittedRef.current) {
      restoreDraggedAnswerOrder()
    }
    clearAnswerDragState()
  }

  const handleAnswerDrop = (
    event: React.DragEvent<HTMLLIElement>,
    question: RequirementSelectionQuestion,
    targetAnswer: RequirementSelectionAnswer,
  ) => {
    event.preventDefault()
    const draggedId =
      Number(event.dataTransfer.getData('text/plain')) ||
      draggedAnswerRef.current?.answerId ||
      draggedAnswerId
    const draggedAnswer = draggedAnswerRef.current
    dragDropCommittedRef.current = true
    if (
      !draggedId ||
      !draggedAnswer ||
      draggedAnswer.questionId !== question.id
    ) {
      clearAnswerDragState()
      return
    }

    const currentQuestion =
      questionsRef.current.find(item => item.id === question.id) ?? question
    const orderedAnswers =
      dragPreviewedRef.current || draggedId === targetAnswer.id
        ? currentQuestion.answers
        : (moveAnswerIntoTargetSlot(
            currentQuestion.answers,
            draggedId,
            targetAnswer.id,
          ) ?? currentQuestion.answers)

    clearAnswerDragState()
    void persistAnswerOrder(currentQuestion, orderedAnswers, draggedId)
  }

  const handleAnswerReorderKeyDown = (
    event: React.KeyboardEvent<HTMLElement>,
    question: RequirementSelectionQuestion,
    answer: RequirementSelectionAnswer,
  ) => {
    if (submitting || question.answers.length < 2) return

    const currentIndex = question.answers.findIndex(
      item => item.id === answer.id,
    )
    if (currentIndex < 0) return

    const targetIndexByKey: Partial<Record<string, number>> = {
      ArrowDown: currentIndex + 1,
      ArrowUp: currentIndex - 1,
      End: question.answers.length - 1,
      Home: 0,
    }
    const targetIndex = targetIndexByKey[event.key]
    if (targetIndex == null) return

    event.preventDefault()
    moveAnswerToIndex(question, answer.id, targetIndex)
  }

  const isEditingQuestion = editingQuestionId != null
  const selectedQuestionArea = areas.find(
    area => String(area.id) === questionForm.areaId,
  )
  const selectedQuestionAreaDescription =
    selectedQuestionArea?.description?.trim() || null
  const questionAreaDescriptionId = 'kuf-area-description'
  const questionAreaLockedHintId = 'kuf-area-locked-hint'
  const questionAreaDescribedBy =
    [
      selectedQuestionAreaDescription ? questionAreaDescriptionId : null,
      isEditingQuestion ? questionAreaLockedHintId : null,
    ]
      .filter(Boolean)
      .join(' ') || undefined

  const questionFormContent = (
    <form
      className="space-y-4"
      {...devMarker({
        context: 'requirementSelectionQuestions',
        name: 'question form',
      })}
      onSubmit={submitQuestion}
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
          help={copy.areaHelp}
          htmlFor="kuf-area"
          label={copy.area}
          required
        />
        <div title={isEditingQuestion ? copy.areaLockedTooltip : undefined}>
          <select
            aria-describedby={questionAreaDescribedBy}
            className={`${inputClassName}${lockedInputClassName}`}
            disabled={isEditingQuestion}
            id="kuf-area"
            onChange={event =>
              setQuestionForm(previous => ({
                ...previous,
                areaId: event.target.value,
              }))
            }
            required
            title={isEditingQuestion ? copy.areaLockedTooltip : undefined}
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
        {selectedQuestionAreaDescription ? (
          <p
            className="mt-2 text-xs leading-5 text-secondary-600 dark:text-secondary-400"
            id={questionAreaDescriptionId}
          >
            {selectedQuestionAreaDescription}
          </p>
        ) : null}
        {isEditingQuestion ? (
          <p
            className="mt-2 flex items-start gap-1.5 text-xs leading-5 text-secondary-600 dark:text-secondary-400"
            id={questionAreaLockedHintId}
          >
            <Lock aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{copy.areaLockedHint}</span>
          </p>
        ) : null}
      </div>
      <div>
        <FieldLabelWithHelp
          help={copy.questionTextHelp}
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
        <FieldLabelWithHelp
          help={copy.questionHelpTextHelp}
          htmlFor="kuf-help"
          label={copy.helpText}
        />
        <textarea
          className={modalTextareaClassName}
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
            help={copy.selectionTypeHelp}
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
            help={copy.sortOrderHelp}
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
        {editingQuestionId ? copy.save : copy.create}
      </button>
    </form>
  )

  const answerFormContent = (
    <form
      className="space-y-4"
      {...devMarker({
        context: 'requirementSelectionQuestions',
        name: 'answer form',
        value: editingAnswerId ? 'edit' : 'create',
      })}
      onSubmit={createAnswer}
    >
      {showAnswerForm && error ? (
        <p
          className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {selectedQuestion ? (
        <p className="text-xs text-secondary-500">
          {selectedQuestion.questionCode}
        </p>
      ) : null}
      <div>
        <FieldLabelWithHelp
          help={copy.answerTextHelp}
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
          ref={answerTextRef}
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
              packageIds: event.target.checked ? [] : previous.packageIds,
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
          help={copy.answerDescriptionHelp}
          htmlFor="kuf-answer-description"
          label={copy.description}
        />
        <textarea
          className={modalTextareaClassName}
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
          help={copy.answerPackagesHelp}
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
          help={copy.answerSortOrderHelp}
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
        {editingAnswerId ? copy.save : copy.addAnswer}
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
          title={editingQuestionId ? copy.editQuestion : copy.createQuestion}
          titleId="requirement-selection-question-create-title"
        >
          {questionFormContent}
        </FormModal>
        <FormModal
          closeDisabled={submitting}
          developerModeValue={
            editingAnswerId
              ? 'edit requirement selection answer'
              : 'new requirement selection answer'
          }
          initialFocusRef={answerTextRef}
          onClose={closeAnswerForm}
          open={showAnswerForm}
          title={editingAnswerId ? copy.editAnswer : copy.addAnswer}
          titleId={
            editingAnswerId
              ? 'requirement-selection-answer-edit-title'
              : 'requirement-selection-answer-create-title'
          }
        >
          {answerFormContent}
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
              setStatusFilter(
                event.target.value as '' | 'active' | 'archived' | 'inactive',
              )
            }
            value={statusFilter}
          >
            <option value="">{copy.allStatuses}</option>
            <option value="active">{copy.active}</option>
            <option value="inactive">{copy.inactive}</option>
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
                  context: 'requirementSelectionQuestions',
                  name: 'empty state',
                })}
              >
                {copy.noQuestions}
              </div>
            ) : (
              filteredQuestions.map(question => (
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
                    onClick={() => selectQuestion(question.id)}
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
                      onClick={() => openQuestionEditForm(question)}
                      type="button"
                    >
                      <Pencil aria-hidden="true" className="h-4 w-4" />
                      {copy.edit}
                    </button>
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
                      onClick={event =>
                        questionAction(
                          question,
                          question.isArchived ? 'reactivate' : 'archive',
                          event.currentTarget,
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
                      onClick={event =>
                        questionAction(question, 'delete', event.currentTarget)
                      }
                      type="button"
                    >
                      <Trash2 aria-hidden="true" className="h-4 w-4" />
                      {copy.delete}
                    </button>
                  </div>
                  {question.answers.length > 0 && (
                    <ul className="mt-4 divide-y rounded-xl border dark:border-secondary-800">
                      {question.answers.map(answer => (
                        <li
                          className={`transition-colors ${
                            dragOverAnswerId === answer.id &&
                            draggedAnswerId !== answer.id
                              ? 'bg-primary-50/70 dark:bg-primary-950/20'
                              : ''
                          } ${
                            reorderingAnswerId === answer.id ? 'opacity-70' : ''
                          } ${
                            draggedAnswerId === answer.id
                              ? 'bg-secondary-100/80 dark:bg-secondary-800/50'
                              : ''
                          }`}
                          draggable={
                            armedDragAnswerId === answer.id &&
                            !submitting &&
                            question.answers.length > 1
                              ? true
                              : undefined
                          }
                          key={answer.id}
                          onDragEnd={handleAnswerDragEnd}
                          onDragEnter={() => setDragOverAnswerId(answer.id)}
                          onDragOver={event => {
                            if (!draggedAnswerId) return
                            event.preventDefault()
                            event.dataTransfer.dropEffect = 'move'
                            setDragOverAnswerId(answer.id)
                            previewAnswerMove(question.id, answer)
                          }}
                          onDragStart={event =>
                            handleAnswerDragStart(event, question, answer)
                          }
                          onDrop={event =>
                            handleAnswerDrop(event, question, answer)
                          }
                        >
                          <div
                            className={`flex gap-3 p-3 ${
                              draggedAnswerId === answer.id ? 'invisible' : ''
                            }`}
                          >
                            {/*
                              Keep the grip narrow: it is the only drag source,
                              but the whole answer row remains the drop target
                              and visible drag preview.
                            */}
                            <button
                              aria-describedby={`kuf-answer-reorder-hint-${answer.id}`}
                              aria-label={copy.reorderAnswer}
                              className="inline-flex min-h-11 w-8 shrink-0 self-stretch items-center justify-center rounded-lg border border-secondary-300 p-0 text-secondary-700 transition-colors hover:bg-secondary-50 hover:text-secondary-950 disabled:cursor-not-allowed disabled:opacity-40 dark:border-secondary-700 dark:text-secondary-200 dark:hover:bg-secondary-800 dark:hover:text-secondary-50"
                              disabled={
                                submitting || question.answers.length < 2
                              }
                              onKeyDown={event =>
                                handleAnswerReorderKeyDown(
                                  event,
                                  question,
                                  answer,
                                )
                              }
                              onPointerCancel={() => setArmedDragAnswerId(null)}
                              onPointerDown={() =>
                                handleAnswerDragHandlePointerDown(
                                  question,
                                  answer,
                                )
                              }
                              onPointerUp={() => setArmedDragAnswerId(null)}
                              title={copy.reorderAnswerHint}
                              type="button"
                            >
                              <span
                                aria-hidden="true"
                                className="flex h-full min-h-11 w-full cursor-grab items-center justify-center active:cursor-grabbing"
                                data-answer-drag-handle="true"
                                role="presentation"
                              >
                                <GripVertical
                                  aria-hidden="true"
                                  className="h-4 w-4"
                                />
                              </span>
                            </button>
                            <span
                              className="sr-only"
                              id={`kuf-answer-reorder-hint-${answer.id}`}
                            >
                              {copy.reorderAnswerHint}
                            </span>
                            <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0 sm:flex-1">
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
                                <button
                                  className="mt-2 inline-flex min-h-11 min-w-11 items-center rounded-lg border px-2 text-xs disabled:opacity-50"
                                  disabled={answer.matchingRequirementCount < 1}
                                  onClick={() =>
                                    setExpandedAnswerId(current =>
                                      current === answer.id ? null : answer.id,
                                    )
                                  }
                                  type="button"
                                >
                                  {copy.matchingRequirements}:{' '}
                                  {answer.matchingRequirementCount}
                                </button>
                                {answer.healthState ===
                                  'missing_requirement_selection' && (
                                  <span className="ml-2 inline-flex rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                                    {copy.missingRequirementSelection}
                                  </span>
                                )}
                                {expandedAnswerId === answer.id && (
                                  <ul className="mt-2 space-y-1 text-xs text-secondary-600 dark:text-secondary-300">
                                    {answer.matchingRequirements.map(
                                      requirement => (
                                        <li key={requirement.id}>
                                          <span className="font-mono">
                                            {requirement.uniqueId}
                                          </span>
                                          {requirement.description
                                            ? ` · ${requirement.description}`
                                            : ''}
                                        </li>
                                      ),
                                    )}
                                  </ul>
                                )}
                              </div>
                              <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
                                <button
                                  className="inline-flex min-h-11 min-w-11 items-center gap-1.5 rounded-lg border px-2 text-xs disabled:opacity-50"
                                  disabled={submitting}
                                  onClick={() => editAnswer(answer)}
                                  type="button"
                                >
                                  <Pencil
                                    aria-hidden="true"
                                    className="h-4 w-4"
                                  />
                                  {copy.edit}
                                </button>
                                <button
                                  className="inline-flex min-h-11 min-w-11 items-center gap-1.5 rounded-lg border px-2 text-xs disabled:opacity-50"
                                  disabled={submitting}
                                  onClick={() =>
                                    answerAction(
                                      question,
                                      answer,
                                      answer.isActive
                                        ? 'deactivate'
                                        : 'activate',
                                    )
                                  }
                                  type="button"
                                >
                                  {answer.isActive ? (
                                    <PauseCircle
                                      aria-hidden="true"
                                      className="h-4 w-4"
                                    />
                                  ) : (
                                    <CheckCircle2
                                      aria-hidden="true"
                                      className="h-4 w-4"
                                    />
                                  )}
                                  {answer.isActive
                                    ? copy.deactivate
                                    : copy.activate}
                                </button>
                                <button
                                  className="inline-flex min-h-11 min-w-11 items-center gap-1.5 rounded-lg border px-2 text-xs disabled:opacity-50"
                                  disabled={submitting}
                                  onClick={event =>
                                    answerAction(
                                      question,
                                      answer,
                                      answer.isArchived
                                        ? 'reactivate'
                                        : 'archive',
                                      event.currentTarget,
                                    )
                                  }
                                  type="button"
                                >
                                  {answer.isArchived ? (
                                    <RotateCcw
                                      aria-hidden="true"
                                      className="h-4 w-4"
                                    />
                                  ) : (
                                    <Archive
                                      aria-hidden="true"
                                      className="h-4 w-4"
                                    />
                                  )}
                                  {answer.isArchived
                                    ? copy.reactivate
                                    : copy.archive}
                                </button>
                                <button
                                  className="inline-flex min-h-11 min-w-11 items-center gap-1.5 rounded-lg border border-red-200 px-2 text-xs text-red-700 disabled:opacity-50 dark:border-red-800 dark:text-red-300"
                                  disabled={submitting}
                                  onClick={event =>
                                    answerAction(
                                      question,
                                      answer,
                                      'delete',
                                      event.currentTarget,
                                    )
                                  }
                                  type="button"
                                >
                                  <Trash2
                                    aria-hidden="true"
                                    className="h-4 w-4"
                                  />
                                  {copy.delete}
                                </button>
                              </div>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div
                    className={question.answers.length > 0 ? 'mt-3' : 'mt-4'}
                  >
                    <button
                      className="inline-flex min-h-11 min-w-11 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium text-secondary-800 transition-colors hover:bg-secondary-50 disabled:opacity-50 dark:border-secondary-700 dark:text-secondary-100 dark:hover:bg-secondary-800"
                      disabled={submitting}
                      onClick={() => openAnswerForm(question)}
                      type="button"
                      {...devMarker({
                        context: 'requirementSelectionQuestions',
                        name: 'button',
                        value: 'new requirement selection answer',
                      })}
                    >
                      <Plus aria-hidden="true" className="h-4 w-4" />
                      {copy.addAnswer}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

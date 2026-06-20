'use client'

import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  GitBranch,
  GripVertical,
  Lock,
  PauseCircle,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useConfirmModal } from '@/components/ConfirmModal'
import FieldLabelWithHelp from '@/components/FieldLabelWithHelp'
import FloatingActionRail from '@/components/FloatingActionRail'
import FormModal from '@/components/FormModal'
import { type HelpContent, useHelpContent } from '@/components/HelpPanel'
import { modalResizableTextareaResizeClassName } from '@/components/modal-textarea-class'
import RequiredFieldsHint from '@/components/RequiredFieldsHint'
import RequirementDetailCard from '@/components/RequirementDetailCard'
import RequirementDetailSections from '@/components/RequirementDetailSections'
import StatusBadge from '@/components/StatusBadge'
import { devMarker } from '@/lib/developer-mode-markers'
import { apiFetch } from '@/lib/http/api-fetch'
import { readResponseMessage } from '@/lib/http/response-message'
import { formatActorDisplayNameForLocale } from '@/lib/privacy/display-name'
import {
  buildRequirementSelectionHierarchyLayout,
  getRequirementSelectionHierarchyBadgeCounts,
} from '@/lib/requirement-selection-question-hierarchy'
import { STATUS_PUBLISHED } from '@/lib/requirements/status-constants.mjs'
import type { RequirementDetailResponse } from '@/lib/requirements/types'

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

interface MatchedRequirementSourcePackage {
  id: number
  name: string
}

interface MatchedRequirement {
  description: string | null
  direct: boolean
  id: number
  sourcePackages: MatchedRequirementSourcePackage[]
  uniqueId: string
}

interface SelectedRequirement {
  description: string | null
  id: number
  uniqueId: string
}

interface RequirementSearchResult extends SelectedRequirement {}

interface RequirementSelectionAnswer {
  description: string | null
  healthState: 'missing_requirement_selection' | 'ok'
  id: number
  isActive: boolean
  isArchived: boolean
  isNoRequirementSelection: boolean
  matchingRequirementCount: number
  matchingRequirements: MatchedRequirement[]
  packageIds: number[]
  questionId: number
  requirementIds: number[]
  sortOrder: number
  text: string
}

interface RequirementSelectionVisibilityCondition {
  answerId: number
  answerIsActive: boolean
  answerIsArchived: boolean
  answerText: string
  id: number
  parentAreaName: string
  parentQuestionCode: string
  parentQuestionId: number
  parentQuestionIsActive: boolean
  parentQuestionIsArchived: boolean
  parentQuestionText: string
}

interface RequirementSelectionVisibilityGroup {
  conditions: RequirementSelectionVisibilityCondition[]
  id: number
  sortOrder: number
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
  visibilityGroups: RequirementSelectionVisibilityGroup[]
}

interface QuestionForm {
  areaId: string
  helpText: string
  selectionType: SelectionType
  text: string
}

interface AnswerForm {
  description: string
  isNoRequirementSelection: boolean
  packageIds: string[]
  requirements: SelectedRequirement[]
  sortOrder: string
  text: string
}

interface VisibilityConditionForm {
  answerIds: string[]
  key: string
  parentQuestionId: string
}

interface VisibilityGroupForm {
  conditions: VisibilityConditionForm[]
  key: string
}

type AnswerRequirementSourceFilter =
  | { kind: 'package'; sourceId: number }
  | { kind: 'requirement'; sourceId: number }

interface ExpandedAnswerSelection {
  answerId: number
  filters: AnswerRequirementSourceFilter[]
}

const initialQuestionForm: QuestionForm = {
  areaId: '',
  helpText: '',
  selectionType: 'single',
  text: '',
}

const initialAnswerForm: AnswerForm = {
  description: '',
  isNoRequirementSelection: false,
  packageIds: [],
  requirements: [],
  sortOrder: '0',
  text: '',
}

let visibilityFormKeySequence = 0

function createVisibilityFormKey(prefix: string) {
  visibilityFormKeySequence += 1
  return `${prefix}-${visibilityFormKeySequence}`
}

function createEmptyVisibilityConditionForm(): VisibilityConditionForm {
  return {
    answerIds: [],
    key: createVisibilityFormKey('condition'),
    parentQuestionId: '',
  }
}

function createEmptyVisibilityGroupForm(): VisibilityGroupForm {
  return {
    conditions: [createEmptyVisibilityConditionForm()],
    key: createVisibilityFormKey('group'),
  }
}

const inputClassName =
  'w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200'

const modalTextareaClassName = `${inputClassName} min-h-24 ${modalResizableTextareaResizeClassName}`

const lockedInputClassName =
  ' disabled:cursor-not-allowed disabled:border-secondary-200 disabled:bg-secondary-100 disabled:text-secondary-500 disabled:opacity-100 dark:disabled:border-secondary-700 dark:disabled:bg-secondary-900/70 dark:disabled:text-secondary-500'

const answerSelectionListClassName =
  'h-[min(48vh,32rem)] min-h-64 overflow-y-auto overscroll-contain pr-1'

const answerSourcePillClassName =
  'inline-flex min-h-7 max-w-full items-center rounded-full border px-2 py-0.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50'

interface ScrollOverflowState {
  hasOverflowAbove: boolean
  hasOverflowBelow: boolean
}

interface QuestionDragPreviewState {
  question: RequirementSelectionQuestion
  width: number
  x: number
  y: number
}

interface QuestionDropMarkerState {
  height: number
  width: number
  x: number
  y: number
}

interface QuestionRowLayout {
  height: number
  left: number
  questionId: number
  right: number
  top: number
  width: number
}

function sourceFilterEquals(
  left: AnswerRequirementSourceFilter,
  right: AnswerRequirementSourceFilter,
) {
  return left.kind === right.kind && left.sourceId === right.sourceId
}

function filterMatchedRequirementsBySources(
  requirements: MatchedRequirement[],
  filters: AnswerRequirementSourceFilter[],
) {
  if (filters.length === 0) return requirements

  return requirements.filter(requirement =>
    filters.some(filter => {
      if (filter.kind === 'requirement') {
        return requirement.id === filter.sourceId
      }

      return requirement.sourcePackages.some(pkg => pkg.id === filter.sourceId)
    }),
  )
}

function answerFormFingerprint(form: AnswerForm) {
  return JSON.stringify({
    description: form.description,
    isNoRequirementSelection: form.isNoRequirementSelection,
    packageIds: [...new Set(form.packageIds.map(Number))].sort(
      (left, right) => left - right,
    ),
    requirementIds: [...new Set(form.requirements.map(item => item.id))].sort(
      (left, right) => left - right,
    ),
    sortOrder: form.sortOrder,
    text: form.text,
  })
}

function visibilityFormFromQuestion(
  question: RequirementSelectionQuestion,
): VisibilityGroupForm[] {
  if (question.visibilityGroups.length === 0) return []
  return question.visibilityGroups.map(group => {
    const answersByParent = new Map<number, string[]>()
    for (const condition of group.conditions) {
      const bucket = answersByParent.get(condition.parentQuestionId) ?? []
      bucket.push(String(condition.answerId))
      answersByParent.set(condition.parentQuestionId, bucket)
    }
    return {
      conditions: Array.from(answersByParent).map(
        ([parentQuestionId, answerIds]) => ({
          answerIds,
          key: createVisibilityFormKey('condition'),
          parentQuestionId: String(parentQuestionId),
        }),
      ),
      key: createVisibilityFormKey('group'),
    }
  })
}

function useScrollOverflowHint<T extends HTMLElement>(contentKey: string) {
  const [scrollElement, setScrollElement] = useState<T | null>(null)
  const [overflowState, setOverflowState] = useState<ScrollOverflowState>({
    hasOverflowAbove: false,
    hasOverflowBelow: false,
  })
  const scrollRef = useCallback((element: T | null) => {
    setScrollElement(element)
  }, [])

  const updateScrollOverflow = useCallback(() => {
    const element = scrollElement
    if (!element) {
      setOverflowState({
        hasOverflowAbove: false,
        hasOverflowBelow: false,
      })
      return
    }

    const tolerance = 2
    const nextState = {
      hasOverflowAbove: element.scrollTop > tolerance,
      hasOverflowBelow:
        element.scrollTop + element.clientHeight <
        element.scrollHeight - tolerance,
    }
    setOverflowState(previous =>
      previous.hasOverflowAbove === nextState.hasOverflowAbove &&
      previous.hasOverflowBelow === nextState.hasOverflowBelow
        ? previous
        : nextState,
    )
  }, [scrollElement])

  useEffect(() => {
    const element = scrollElement
    if (!element) {
      updateScrollOverflow()
      return
    }

    updateScrollOverflow()
    element.addEventListener('scroll', updateScrollOverflow, { passive: true })
    window.addEventListener('resize', updateScrollOverflow)

    const resizeObserver =
      typeof ResizeObserver === 'function'
        ? new ResizeObserver(updateScrollOverflow)
        : null
    resizeObserver?.observe(element)
    for (const child of Array.from(element.children)) {
      resizeObserver?.observe(child)
    }

    return () => {
      element.removeEventListener('scroll', updateScrollOverflow)
      window.removeEventListener('resize', updateScrollOverflow)
      resizeObserver?.disconnect()
    }
  }, [scrollElement, updateScrollOverflow])

  // biome-ignore lint/correctness/useExhaustiveDependencies: contentKey intentionally remeasures scroll overflow when list content changes without remounting the scroll element.
  useEffect(() => {
    updateScrollOverflow()
  }, [contentKey, updateScrollOverflow])

  return {
    ...overflowState,
    scrollRef,
  }
}

function ScrollOverflowCue({
  hasOverflowAbove,
  hasOverflowBelow,
  surface,
}: ScrollOverflowState & {
  surface: 'packages' | 'preview'
}) {
  const topSurfaceClass =
    surface === 'preview'
      ? 'from-white/95 dark:from-secondary-950/90'
      : 'from-secondary-50/95 dark:from-secondary-900/95'
  const bottomSurfaceClass =
    surface === 'preview'
      ? 'from-white/95 via-white/80 dark:from-secondary-950/90 dark:via-secondary-950/70'
      : 'from-secondary-50/95 via-secondary-50/80 dark:from-secondary-900/95 dark:via-secondary-900/75'

  return (
    <>
      {hasOverflowAbove ? (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-x-0 top-0 z-10 h-8 rounded-t-lg bg-linear-to-b ${topSurfaceClass} to-transparent`}
          data-scroll-overflow-cue="start"
        />
      ) : null}
      {hasOverflowBelow ? (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-x-0 bottom-0 z-10 flex h-12 items-end justify-center rounded-b-lg bg-linear-to-t ${bottomSurfaceClass} to-transparent pb-1`}
          data-scroll-overflow-cue="end"
        >
          <span className="rounded-full border border-secondary-200 bg-white/95 px-2 py-0.5 text-secondary-500 shadow-sm dark:border-secondary-700 dark:bg-secondary-900/95 dark:text-secondary-300">
            <ChevronDown aria-hidden="true" className="h-4 w-4" />
          </span>
        </div>
      ) : null}
    </>
  )
}

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

function moveQuestionIntoTargetSlot(
  questions: RequirementSelectionQuestion[],
  questionId: number,
  targetQuestionId: number,
) {
  const currentIndex = questions.findIndex(
    question => question.id === questionId,
  )
  const targetIndex = questions.findIndex(
    question => question.id === targetQuestionId,
  )
  if (currentIndex < 0 || targetIndex < 0 || currentIndex === targetIndex) {
    return null
  }

  const orderedQuestions = [...questions]
  const [movedQuestion] = orderedQuestions.splice(currentIndex, 1)
  if (!movedQuestion) return null

  orderedQuestions.splice(targetIndex, 0, movedQuestion)
  return orderedQuestions
}

function replaceAreaQuestionOrder(
  questions: RequirementSelectionQuestion[],
  areaId: number,
  orderedAreaQuestions: RequirementSelectionQuestion[],
) {
  let inserted = false
  const nextQuestions: RequirementSelectionQuestion[] = []

  for (const question of questions) {
    if (question.areaId !== areaId) {
      nextQuestions.push(question)
      continue
    }

    if (!inserted) {
      nextQuestions.push(...orderedAreaQuestions)
      inserted = true
    }
  }

  if (!inserted) {
    nextQuestions.push(...orderedAreaQuestions)
  }

  return nextQuestions
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

function statusText(
  item: { isActive: boolean; isArchived: boolean },
  copy: Record<string, string>,
) {
  if (item.isArchived) return copy.archived
  return item.isActive ? copy.active : copy.inactive
}

function asSelectedRequirement(
  requirement: Pick<MatchedRequirement, 'description' | 'id' | 'uniqueId'>,
): SelectedRequirement {
  return {
    description: requirement.description,
    id: requirement.id,
    uniqueId: requirement.uniqueId,
  }
}

function normalizeRequirementSearchResult(row: {
  description?: string | null
  id: number
  uniqueId: string
  version?: { description?: string | null } | null
}): RequirementSearchResult {
  return {
    description: row.version?.description ?? row.description ?? null,
    id: row.id,
    uniqueId: row.uniqueId,
  }
}

function localizedName(
  locale: string,
  obj: { nameEn: string | null; nameSv: string | null } | null | undefined,
) {
  if (!obj) return null
  return locale === 'sv'
    ? (obj.nameSv ?? obj.nameEn)
    : (obj.nameEn ?? obj.nameSv)
}

interface CompactRequirementDetailProps {
  developerModeContext: string
  requirementId: number
}

function CompactRequirementDetail({
  developerModeContext,
  requirementId,
}: CompactRequirementDetailProps) {
  const locale = useLocale()
  const t = useTranslations('requirement')
  const tc = useTranslations('common')
  const [detail, setDetail] = useState<RequirementDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setFailed(false)
    setDetail(null)

    apiFetch(`/api/requirements/${requirementId}`, {
      signal: controller.signal,
    })
      .then(async response => {
        if (!response.ok) {
          throw new Error(response.statusText || String(response.status))
        }
        setDetail((await response.json()) as RequirementDetailResponse)
      })
      .catch(error => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }
        setFailed(true)
        setDetail(null)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [requirementId])

  if (loading) {
    return (
      <p
        className="mt-3 rounded-xl border border-secondary-200 bg-white/70 px-3 py-4 text-sm text-secondary-600 dark:border-secondary-700 dark:bg-secondary-900/50 dark:text-secondary-300"
        role="status"
      >
        {tc('loading')}
      </p>
    )
  }

  if (failed || !detail) {
    return (
      <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
        {tc('error')}
      </p>
    )
  }

  const selectedVersion =
    detail.versions.find(version => version.status === STATUS_PUBLISHED) ??
    detail.versions[0]
  const areaOwnerName = formatActorDisplayNameForLocale(
    detail.area?.ownerName,
    locale,
  )
  const detailContext = `${developerModeContext} > compact detail: ${detail.uniqueId}`
  const sectionContext = `${detailContext} > detail section: requirementPackages`
  const metadata = [
    ...(detail.area
      ? [
          {
            id: 'area',
            label: t('area'),
            markerValue: 'area',
            value: (
              <>
                {detail.area.name}
                {areaOwnerName ? (
                  <p className="mt-0.5 text-xs text-secondary-500 dark:text-secondary-400">
                    {t('areaOwner')}: {areaOwnerName}
                  </p>
                ) : null}
              </>
            ),
          },
        ]
      : []),
    {
      id: 'category',
      label: t('category'),
      markerValue: 'category',
      value: localizedName(locale, selectedVersion?.category) ?? '—',
    },
    ...(selectedVersion?.type
      ? [
          {
            id: 'type',
            label: t('type'),
            markerValue: 'type',
            value: localizedName(locale, selectedVersion.type),
          },
        ]
      : []),
    {
      id: 'quality-characteristic',
      label: t('qualityCharacteristic'),
      markerValue: 'quality characteristic',
      value: selectedVersion?.qualityCharacteristic
        ? localizedName(locale, selectedVersion.qualityCharacteristic)
        : '—',
    },
    {
      id: 'risk-level',
      label: t('riskLevel'),
      markerValue: 'risk level',
      value: selectedVersion?.riskLevel ? (
        <StatusBadge
          color={selectedVersion.riskLevel.color}
          iconName={selectedVersion.riskLevel.iconName}
          label={localizedName(locale, selectedVersion.riskLevel) ?? ''}
          size="sm"
        />
      ) : (
        '-'
      ),
    },
    {
      id: 'requires-testing',
      label: t('requiresTesting'),
      markerValue: 'requires testing',
      value: selectedVersion?.requiresTesting ? tc('yes') : tc('no'),
    },
    {
      id: 'verification-method',
      label: t('verificationMethod'),
      markerValue: 'verification method',
      value: selectedVersion?.verificationMethod || '—',
    },
    {
      id: 'specification-count',
      label: t('specificationCount'),
      markerValue: 'specification count',
      value: detail.specificationCount,
    },
  ]
  const references =
    selectedVersion?.versionNormReferences?.map(vnr => ({
      href: vnr.normReference.uri,
      id: `normref-chip-${vnr.normReference.id}`,
      label: vnr.normReference.normReferenceId,
      markerValue: vnr.normReference.normReferenceId,
      title: `${vnr.normReference.name} (${vnr.normReference.reference})`,
    })) ?? []
  const requirementPackages =
    selectedVersion?.versionRequirementPackages?.map(item => {
      const requirementPackage = item.requirementPackage
      const label =
        requirementPackage.name?.trim() || String(requirementPackage.id)
      return {
        id: `requirementPackage-chip-${requirementPackage.id}`,
        label,
        markerContext: sectionContext,
        markerValue: label,
      }
    }) ?? []

  return (
    <div className="px-6 py-4">
      <RequirementDetailCard
        {...devMarker({
          context: developerModeContext,
          name: 'matched requirement detail',
          value: detail.uniqueId,
        })}
      >
        <RequirementDetailSections
          acceptanceCriteria={selectedVersion?.acceptanceCriteria ?? '—'}
          acceptanceCriteriaLabel={t('acceptanceCriteria')}
          description={selectedVersion?.description ?? '—'}
          descriptionLabel={t('description')}
          developerModeContext={detailContext}
          emptyLabel={tc('noneAvailable')}
          metadata={metadata}
          references={references}
          referencesLabel={t('normReferences')}
          requirementPackages={requirementPackages}
          requirementPackagesLabel={t('requirementPackage')}
        />
      </RequirementDetailCard>
    </div>
  )
}

export default function RequirementSelectionQuestionsClient() {
  useHelpContent(REQUIREMENT_SELECTION_QUESTIONS_STEWARDSHIP_HELP)
  const { confirm } = useConfirmModal()
  const locale = useLocale()
  const t = useTranslations('requirementSelectionQuestionsStewardship')
  const tc = useTranslations('common')
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
      answerCountPlural: t('answerCountPlural'),
      answerCountSingular: t('answerCountSingular'),
      area: t('area'),
      areaHelp: t('fieldHelp.area'),
      areaLockedHint: t('areaLockedHint'),
      areaLockedTooltip: t('areaLockedTooltip'),
      answerDescriptionHelp: t('fieldHelp.answerDescription'),
      answerPackagesHelp: t('fieldHelp.answerPackages'),
      answerTextHelp: t('fieldHelp.answerText'),
      clone: t('clone'),
      cancel: tc('cancel'),
      confirmArchiveAnswer: t('confirmArchiveAnswer'),
      confirmArchiveQuestion: t('confirmArchiveQuestion'),
      confirmDeleteAnswer: t('confirmDeleteAnswer'),
      confirmDeleteQuestion: t('confirmDeleteQuestion'),
      create: t('create'),
      createQuestion: t('createQuestion'),
      deactivate: t('deactivate'),
      delete: t('delete'),
      description: t('description'),
      directRequirement: t('directRequirement'),
      discardChanges: t('discardChanges'),
      edit: t('edit'),
      editAnswer: t('editAnswer'),
      editRequirementSelectionAnswer: t('editRequirementSelectionAnswer'),
      editQuestion: t('editQuestion'),
      error: t('error'),
      filterRequirementsByPackage: t('filterRequirementsByPackage'),
      filterRequirementsByRequirementId: t('filterRequirementsByRequirementId'),
      helpText: t('helpText'),
      hierarchyBadgeAria: t('hierarchyBadgeAria'),
      hierarchyBadgeLabel: t('hierarchyBadgeLabel'),
      hierarchyCurrentQuestion: t('hierarchyCurrentQuestion'),
      hierarchyDialogIntro: t('hierarchyDialogIntro'),
      hierarchyDialogTitle: t('hierarchyDialogTitle'),
      hierarchyMoreConditionRows: t('hierarchyMoreConditionRows'),
      hierarchyQuestionCountPlural: t('hierarchyQuestionCountPlural'),
      hierarchyQuestionCountSingular: t('hierarchyQuestionCountSingular'),
      hideRequirementsInSelection: t('hideRequirementsInSelection'),
      hideQuestionDetails: t('hideQuestionDetails'),
      inactive: t('inactive'),
      addVisibilityCondition: t('addVisibilityCondition'),
      addVisibilityGroup: t('addVisibilityGroup'),
      conditionGroup: t('conditionGroup'),
      loading: t('loading'),
      matchingRequirements: t('matchingRequirements'),
      matchingRequirementsEmpty: t('matchingRequirementsEmpty'),
      matchingRequirementsError: t('matchingRequirementsError'),
      matchingRequirementsReadOnly: t('matchingRequirementsReadOnly'),
      matchingRequirementsPrompt: t('matchingRequirementsPrompt'),
      matchingRequirementsSource: t('matchingRequirementsSource'),
      missingRequirementSelection: t('missingRequirementSelection'),
      multiple: t('multiple'),
      noRequirementSearchResults: t('noRequirementSearchResults'),
      noQuestions: t('noQuestions'),
      noRequirementSelection: t('noRequirementSelection'),
      openRequirementDetail: t('openRequirementDetail'),
      packageSelector: t('packageSelector'),
      noPackageSearchResults: t('noPackageSearchResults'),
      packages: t('packages'),
      questionHelpTextHelp: t('fieldHelp.questionHelpText'),
      questionTextHelp: t('fieldHelp.questionText'),
      reactivate: t('reactivate'),
      parentQuestion: t('parentQuestion'),
      reorderAnswer: t('reorderAnswer'),
      reorderAnswerHint: t('reorderAnswerHint'),
      reorderQuestion: t('reorderQuestion'),
      reorderQuestionDisabledHint: t('reorderQuestionDisabledHint'),
      reorderQuestionHint: t('reorderQuestionHint'),
      removePackage: t('removePackage'),
      removeRequirement: t('removeRequirement'),
      standaloneQuestionVisibility: t('standaloneQuestionVisibility'),
      requirementsInSelection: t('requirementsInSelection'),
      requirementsInSelectionEmpty: t('requirementsInSelectionEmpty'),
      requirementsInSelectionError: t('requirementsInSelectionError'),
      requirementsInSelectionPrompt: t('requirementsInSelectionPrompt'),
      requirementsInSelectionSource: t('requirementsInSelectionSource'),
      requirementCountPlural: t('requirementCountPlural'),
      requirementCountSingular: t('requirementCountSingular'),
      requirementIds: t('requirementIds'),
      requirementIdsHelp: t('fieldHelp.requirementIds'),
      requirementSources: t('requirementSources'),
      save: t('save'),
      saveVisibility: t('saveVisibility'),
      search: t('search'),
      searchRequirementIds: t('searchRequirementIds'),
      searchRequirementIdsPlaceholder: t('searchRequirementIdsPlaceholder'),
      selectionType: t('selectionType'),
      selectionTypeHelp: t('fieldHelp.selectionType'),
      selectedPackages: t('selectedPackages'),
      selectedRequirementIds: t('selectedRequirementIds'),
      showRequirementsInSelection: t('showRequirementsInSelection'),
      showQuestionDetails: t('showQuestionDetails'),
      single: t('single'),
      sourceSelection: t('sourceSelection'),
      status: t('status'),
      text: t('text'),
      title: t('title'),
      triggerAnswers: t('triggerAnswers'),
      unsavedChangesConfirm: tc('unsavedChangesConfirm'),
      visibilityButtonText: t('visibilityButtonText'),
      visibilityAnswersHelp: t('fieldHelp.visibilityAnswers'),
      visibilityInactiveWarning: t('visibilityInactiveWarning'),
      visibilityPanelDescription: t('visibilityPanelDescription'),
      visibilityPanelTitle: t('visibilityPanelTitle'),
      visibilityParentHelp: t('fieldHelp.visibilityParent'),
    }),
    [t, tc],
  )
  const [areas, setAreas] = useState<RequirementArea[]>([])
  const [packages, setPackages] = useState<RequirementPackage[]>([])
  const [questions, setQuestions] = useState<RequirementSelectionQuestion[]>([])
  const [questionForm, setQuestionForm] =
    useState<QuestionForm>(initialQuestionForm)
  const [answerForm, setAnswerForm] = useState<AnswerForm>(initialAnswerForm)
  const [answerFormBaseline, setAnswerFormBaseline] =
    useState<AnswerForm>(initialAnswerForm)
  const [selectedQuestionId, setSelectedQuestionId] = useState<number | null>(
    null,
  )
  const [editingQuestionId, setEditingQuestionId] = useState<number | null>(
    null,
  )
  const [editingAnswerId, setEditingAnswerId] = useState<number | null>(null)
  const [expandedQuestionIds, setExpandedQuestionIds] = useState<Set<number>>(
    () => new Set(),
  )
  const [expandedAnswerSelection, setExpandedAnswerSelection] =
    useState<ExpandedAnswerSelection | null>(null)
  const [questionSearch, setQuestionSearch] = useState('')
  const [areaFilter, setAreaFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<
    '' | 'active' | 'archived' | 'inactive'
  >('')
  const [showQuestionForm, setShowQuestionForm] = useState(false)
  const [showAnswerForm, setShowAnswerForm] = useState(false)
  const [visibilityPanelQuestionId, setVisibilityPanelQuestionId] = useState<
    number | null
  >(null)
  const [hierarchyQuestionId, setHierarchyQuestionId] = useState<number | null>(
    null,
  )
  const [visibilityGroupsForm, setVisibilityGroupsForm] = useState<
    VisibilityGroupForm[]
  >([])
  const [packageSelectorOpen, setPackageSelectorOpen] = useState(false)
  const [packageSearch, setPackageSearch] = useState('')
  const [requirementSearch, setRequirementSearch] = useState('')
  const [requirementSearchResults, setRequirementSearchResults] = useState<
    RequirementSearchResult[]
  >([])
  const [requirementSearchStatus, setRequirementSearchStatus] = useState<
    'error' | 'idle' | 'loading' | 'ready'
  >('idle')
  const [matchedRequirementPreviewStatus, setMatchedRequirementPreviewStatus] =
    useState<'error' | 'idle' | 'loading' | 'ready'>('idle')
  const [matchedRequirementPreview, setMatchedRequirementPreview] = useState<
    MatchedRequirement[]
  >([])
  const [selectedPreviewRequirementId, setSelectedPreviewRequirementId] =
    useState<number | null>(null)
  const [draggedQuestionId, setDraggedQuestionId] = useState<number | null>(
    null,
  )
  const [dragOverQuestionId, setDragOverQuestionId] = useState<number | null>(
    null,
  )
  const [questionDragPreview, setQuestionDragPreview] =
    useState<QuestionDragPreviewState | null>(null)
  const [questionDropMarker, setQuestionDropMarker] =
    useState<QuestionDropMarkerState | null>(null)
  const [questionDragTransforms, setQuestionDragTransforms] = useState<
    Record<number, number>
  >({})
  const [reorderingQuestionId, setReorderingQuestionId] = useState<
    number | null
  >(null)
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
  const packageSelectorRef = useRef<HTMLDivElement>(null)
  const packageSelectorButtonRef = useRef<HTMLButtonElement>(null)
  const draggedQuestionRef = useRef<{
    areaId: number
    originalQuestions: RequirementSelectionQuestion[]
    questionId: number
  } | null>(null)
  const questionPointerDragRef = useRef<{
    abortController: AbortController
    areaId: number
    areaQuestions: RequirementSelectionQuestion[]
    hasStarted: boolean
    lastTargetQuestionId: number | null
    pointerId: number
    previewOffsetX: number
    previewOffsetY: number
    previewWidth: number
    question: RequirementSelectionQuestion
    questionId: number
    rowLayouts: QuestionRowLayout[]
    startX: number
    startY: number
  } | null>(null)
  const draggedAnswerRef = useRef<{
    answerId: number
    originalAnswers: RequirementSelectionAnswer[]
    questionId: number
  } | null>(null)
  const armedDragAnswerIdRef = useRef<number | null>(null)
  const dragDropCommittedRef = useRef(false)
  const dragPreviewedRef = useRef(false)

  useEffect(() => {
    questionsRef.current = questions
  }, [questions])

  const updateQuestionDragPreview = (
    pointerDrag: NonNullable<typeof questionPointerDragRef.current>,
    clientX: number,
    clientY: number,
  ) => {
    setQuestionDragPreview({
      question: pointerDrag.question,
      width: pointerDrag.previewWidth,
      x: clientX - pointerDrag.previewOffsetX,
      y: clientY - pointerDrag.previewOffsetY,
    })
  }

  const readQuestionRowLayouts = (areaId: number): QuestionRowLayout[] =>
    Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-question-drop-target="true"]',
      ),
    )
      .filter(candidate => candidate.dataset.questionAreaId === String(areaId))
      .map(candidate => {
        const questionId = Number(candidate.dataset.questionId)
        const rect = candidate.getBoundingClientRect()
        return {
          height: rect.height,
          left: rect.left,
          questionId,
          right: rect.right,
          top: rect.top,
          width: rect.width,
        }
      })
      .filter(layout => Number.isInteger(layout.questionId))

  const updateQuestionDropMarker = (targetLayout: QuestionRowLayout | null) => {
    if (!targetLayout) {
      setQuestionDropMarker(null)
      return
    }

    setQuestionDropMarker({
      height: targetLayout.height,
      width: targetLayout.width,
      x: targetLayout.left,
      y: targetLayout.top,
    })
  }

  const findQuestionDropTargetLayoutFromPoint = (
    pointerDrag: NonNullable<typeof questionPointerDragRef.current>,
    clientX: number,
    clientY: number,
  ) => {
    for (const layout of pointerDrag.rowLayouts) {
      const horizontallyInside =
        clientX >= layout.left - 24 && clientX <= layout.right + 24
      const verticallyInside =
        clientY >= layout.top && clientY <= layout.top + layout.height
      if (horizontallyInside && verticallyInside) {
        return layout
      }
    }

    return null
  }

  const buildQuestionDragTransforms = (
    rowLayouts: QuestionRowLayout[],
    questionId: number,
    targetQuestionId: number,
  ) => {
    const draggedIndex = rowLayouts.findIndex(
      layout => layout.questionId === questionId,
    )
    const targetIndex = rowLayouts.findIndex(
      layout => layout.questionId === targetQuestionId,
    )
    if (draggedIndex < 0 || targetIndex < 0 || draggedIndex === targetIndex) {
      return {}
    }

    const transforms: Record<number, number> = {}
    if (targetIndex < draggedIndex) {
      for (let index = targetIndex; index < draggedIndex; index += 1) {
        const layout = rowLayouts[index]
        const nextLayout = rowLayouts[index + 1]
        if (layout && nextLayout) {
          transforms[layout.questionId] = nextLayout.top - layout.top
        }
      }
      return transforms
    }

    for (let index = draggedIndex + 1; index <= targetIndex; index += 1) {
      const layout = rowLayouts[index]
      const previousLayout = rowLayouts[index - 1]
      if (layout && previousLayout) {
        transforms[layout.questionId] = previousLayout.top - layout.top
      }
    }
    return transforms
  }

  const selectedQuestion =
    questions.find(question => question.id === selectedQuestionId) ?? null
  const visibilityPanelQuestion =
    questions.find(question => question.id === visibilityPanelQuestionId) ??
    null
  const hierarchyQuestion =
    questions.find(question => question.id === hierarchyQuestionId) ?? null

  const packagesById = useMemo(
    () => new Map(packages.map(pkg => [pkg.id, pkg])),
    [packages],
  )
  const hierarchyBadgeCounts = useMemo(
    () => getRequirementSelectionHierarchyBadgeCounts(questions),
    [questions],
  )
  const hierarchyLayout = useMemo(
    () =>
      hierarchyQuestionId
        ? buildRequirementSelectionHierarchyLayout(
            questions,
            hierarchyQuestionId,
          )
        : null,
    [hierarchyQuestionId, questions],
  )
  const selectedPackages = useMemo(
    () =>
      answerForm.packageIds
        .map(packageId => packagesById.get(Number(packageId)))
        .filter((pkg): pkg is RequirementPackage => Boolean(pkg)),
    [answerForm.packageIds, packagesById],
  )
  const filteredPackages = useMemo(() => {
    const normalizedSearch = packageSearch.trim().toLocaleLowerCase()
    if (!normalizedSearch) return packages
    return packages.filter(pkg =>
      pkg.name.toLocaleLowerCase().includes(normalizedSearch),
    )
  }, [packageSearch, packages])
  const selectedRequirementIds = useMemo(
    () => new Set(answerForm.requirements.map(requirement => requirement.id)),
    [answerForm.requirements],
  )
  const previewPackageIds = useMemo(
    () =>
      answerForm.isNoRequirementSelection
        ? []
        : answerForm.packageIds
            .map(Number)
            .filter(id => Number.isInteger(id) && id > 0),
    [answerForm.isNoRequirementSelection, answerForm.packageIds],
  )
  const previewRequirementIds = useMemo(
    () =>
      answerForm.isNoRequirementSelection
        ? []
        : answerForm.requirements.map(requirement => requirement.id),
    [answerForm.isNoRequirementSelection, answerForm.requirements],
  )
  const isAnswerFormDirty = useMemo(
    () =>
      answerFormFingerprint(answerForm) !==
      answerFormFingerprint(answerFormBaseline),
    [answerForm, answerFormBaseline],
  )

  useEffect(() => {
    if (!packageSelectorOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (
        packageSelectorRef.current?.contains(target) ||
        packageSelectorButtonRef.current?.contains(target)
      ) {
        return
      }
      setPackageSelectorOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPackageSelectorOpen(false)
        packageSelectorButtonRef.current?.focus()
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [packageSelectorOpen])

  useEffect(() => {
    const search = requirementSearch.trim()
    if (
      !showAnswerForm ||
      answerForm.isNoRequirementSelection ||
      search.length < 2
    ) {
      setRequirementSearchResults([])
      setRequirementSearchStatus('idle')
      return
    }

    const controller = new AbortController()
    const buildSearchUrl = (key: 'descriptionSearch' | 'uniqueIdSearch') => {
      const params = new URLSearchParams({
        limit: '8',
        locale,
        sortBy: 'uniqueId',
        sortDirection: 'asc',
      })
      params.append('statuses', String(STATUS_PUBLISHED))
      params.set(key, search)
      return `/api/requirements?${params.toString()}`
    }

    setRequirementSearchStatus('loading')
    Promise.all([
      apiFetch(buildSearchUrl('uniqueIdSearch'), {
        signal: controller.signal,
      }),
      apiFetch(buildSearchUrl('descriptionSearch'), {
        signal: controller.signal,
      }),
    ])
      .then(async responses => {
        if (responses.some(response => !response.ok)) {
          throw new Error('Failed to search requirements')
        }
        const payloads = (await Promise.all(
          responses.map(response => response.json()),
        )) as Array<{
          requirements?: Array<{
            description?: string | null
            id: number
            uniqueId: string
            version?: { description?: string | null } | null
          }>
        }>
        const byId = new Map<number, RequirementSearchResult>()
        for (const payload of payloads) {
          for (const requirement of payload.requirements ?? []) {
            if (!byId.has(requirement.id)) {
              byId.set(
                requirement.id,
                normalizeRequirementSearchResult(requirement),
              )
            }
          }
        }
        setRequirementSearchResults(
          [...byId.values()].sort((left, right) =>
            left.uniqueId.localeCompare(right.uniqueId, locale),
          ),
        )
        setRequirementSearchStatus('ready')
      })
      .catch(error => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }
        setRequirementSearchResults([])
        setRequirementSearchStatus('error')
      })

    return () => controller.abort()
  }, [
    answerForm.isNoRequirementSelection,
    locale,
    requirementSearch,
    showAnswerForm,
  ])

  useEffect(() => {
    if (!showAnswerForm) {
      setMatchedRequirementPreview([])
      setMatchedRequirementPreviewStatus('idle')
      setSelectedPreviewRequirementId(null)
      return
    }

    if (previewPackageIds.length === 0 && previewRequirementIds.length === 0) {
      setMatchedRequirementPreview([])
      setMatchedRequirementPreviewStatus('idle')
      setSelectedPreviewRequirementId(null)
      return
    }

    const controller = new AbortController()
    const params = new URLSearchParams()
    for (const packageId of previewPackageIds) {
      params.append('packageIds', String(packageId))
    }
    for (const requirementId of previewRequirementIds) {
      params.append('requirementIds', String(requirementId))
    }

    setMatchedRequirementPreviewStatus('loading')
    apiFetch(
      `/api/requirement-selection-questions/matched-requirements?${params.toString()}`,
      { signal: controller.signal },
    )
      .then(async response => {
        if (!response.ok) {
          throw new Error(response.statusText || String(response.status))
        }
        const data = (await response.json()) as {
          requirements?: MatchedRequirement[]
        }
        const requirements = data.requirements ?? []
        setMatchedRequirementPreview(requirements)
        setMatchedRequirementPreviewStatus('ready')
        setSelectedPreviewRequirementId(current =>
          current &&
          requirements.some(requirement => requirement.id === current)
            ? current
            : null,
        )
      })
      .catch(error => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }
        setMatchedRequirementPreview([])
        setMatchedRequirementPreviewStatus('error')
        setSelectedPreviewRequirementId(null)
      })

    return () => controller.abort()
  }, [previewPackageIds, previewRequirementIds, showAnswerForm])

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

  const isQuestionReorderFiltered =
    questionSearch.trim().length > 0 || statusFilter !== ''

  const groupedQuestions = useMemo(() => {
    const groups: Array<{
      areaId: number
      areaName: string
      areaPrefix: string
      questions: RequirementSelectionQuestion[]
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

  const expandQuestion = useCallback((questionId: number) => {
    setExpandedQuestionIds(current => {
      if (current.has(questionId)) return current
      const next = new Set(current)
      next.add(questionId)
      return next
    })
  }, [])

  const toggleQuestionExpansion = useCallback(
    (questionId: number) => {
      const wasExpanded = expandedQuestionIds.has(questionId)
      setSelectedQuestionId(questionId)
      setExpandedQuestionIds(current => {
        const next = new Set(current)
        if (next.has(questionId)) {
          next.delete(questionId)
        } else {
          next.add(questionId)
        }
        return next
      })
      if (wasExpanded && visibilityPanelQuestionId === questionId) {
        setVisibilityPanelQuestionId(null)
        setVisibilityGroupsForm([])
      }
    },
    [expandedQuestionIds, visibilityPanelQuestionId],
  )

  const openQuestionForm = () => {
    setQuestionForm(initialQuestionForm)
    setEditingQuestionId(null)
    setError(null)
    setShowQuestionForm(true)
  }

  const openQuestionEditForm = (question: RequirementSelectionQuestion) => {
    expandQuestion(question.id)
    setQuestionForm({
      areaId: String(question.areaId),
      helpText: question.helpText ?? '',
      selectionType: question.selectionType,
      text: question.text,
    })
    setEditingQuestionId(question.id)
    setError(null)
    setShowQuestionForm(true)
  }

  const openVisibilityPanel = (question: RequirementSelectionQuestion) => {
    expandQuestion(question.id)
    setVisibilityPanelQuestionId(question.id)
    const nextForm = visibilityFormFromQuestion(question)
    setVisibilityGroupsForm(nextForm.length > 0 ? nextForm : [])
    setError(null)
  }

  const openHierarchyDialog = (question: RequirementSelectionQuestion) => {
    setHierarchyQuestionId(question.id)
  }

  const closeHierarchyDialog = () => {
    setHierarchyQuestionId(null)
  }

  const closeVisibilityPanel = () => {
    if (submitting) return
    setVisibilityPanelQuestionId(null)
    setVisibilityGroupsForm([])
  }

  const saveVisibilityGroups = async () => {
    if (!visibilityPanelQuestion) return
    setSubmitting(true)
    setError(null)
    try {
      const groups = visibilityGroupsForm
        .map(group => ({
          conditions: group.conditions
            .filter(
              condition =>
                condition.parentQuestionId && condition.answerIds.length > 0,
            )
            .map(condition => ({
              answerIds: condition.answerIds.map(Number),
              parentQuestionId: Number(condition.parentQuestionId),
            })),
        }))
        .filter(group => group.conditions.length > 0)
      const response = await apiFetch(
        `/api/requirement-selection-questions/${visibilityPanelQuestion.id}/visibility`,
        {
          body: JSON.stringify({ groups }),
          headers: { 'Content-Type': 'application/json' },
          method: 'PUT',
        },
      )
      if (!response.ok) {
        setError((await readResponseMessage(response)) ?? copy.error)
        return
      }
      closeVisibilityPanel()
      await reload()
    } catch {
      setError(copy.error)
    } finally {
      setSubmitting(false)
    }
  }

  const closeQuestionForm = () => {
    if (submitting) return
    setQuestionForm(initialQuestionForm)
    setEditingQuestionId(null)
    setShowQuestionForm(false)
  }

  const resetAnswerEditingState = useCallback(() => {
    setAnswerForm(initialAnswerForm)
    setAnswerFormBaseline(initialAnswerForm)
    setEditingAnswerId(null)
    setExpandedAnswerSelection(null)
    setPackageSelectorOpen(false)
    setPackageSearch('')
    setRequirementSearch('')
    setRequirementSearchResults([])
    setRequirementSearchStatus('idle')
    setShowAnswerForm(false)
  }, [])

  const openAnswerForm = (question: RequirementSelectionQuestion) => {
    expandQuestion(question.id)
    const nextSortOrder =
      question.answers.length > 0
        ? Math.max(...question.answers.map(answer => answer.sortOrder)) + 1
        : 0
    const nextAnswerForm = {
      ...initialAnswerForm,
      sortOrder: String(nextSortOrder),
    }
    setSelectedQuestionId(question.id)
    setAnswerForm(nextAnswerForm)
    setAnswerFormBaseline(nextAnswerForm)
    setEditingAnswerId(null)
    setExpandedAnswerSelection(null)
    setPackageSelectorOpen(false)
    setPackageSearch('')
    setRequirementSearch('')
    setRequirementSearchResults([])
    setRequirementSearchStatus('idle')
    setError(null)
    setShowAnswerForm(true)
  }

  const requestCloseAnswerForm = (anchorEl?: HTMLElement | null) => {
    if (submitting) return
    if (!isAnswerFormDirty) {
      resetAnswerEditingState()
      return
    }

    void confirm({
      anchorEl,
      confirmText: copy.discardChanges,
      defaultCancel: true,
      icon: 'caution',
      message: copy.unsavedChangesConfirm,
      variant: 'danger',
    }).then(confirmed => {
      if (confirmed) resetAnswerEditingState()
    })
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
      const nextQuestionIds = new Set(
        nextQuestions.map(question => question.id),
      )
      setQuestions(nextQuestions)
      setExpandedQuestionIds(current => {
        if (current.size === 0) return current
        const next = new Set(
          Array.from(current).filter(questionId =>
            nextQuestionIds.has(questionId),
          ),
        )
        return next.size === current.size ? current : next
      })
      setSelectedQuestionId(current => {
        const nextQuestionId =
          current && nextQuestionIds.has(current) ? current : null
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
    const areaId = Number(questionForm.areaId)
    const nextSortOrder =
      Math.max(
        -1,
        ...questionsRef.current
          .filter(question => question.areaId === areaId)
          .map(question => question.sortOrder),
      ) + 1
    setSubmitting(true)
    setError(null)
    try {
      const response = await apiFetch(
        editingQuestionId
          ? `/api/requirement-selection-questions/${editingQuestionId}`
          : '/api/requirement-selection-questions',
        {
          body: JSON.stringify({
            ...(editingQuestionId ? {} : { areaId, sortOrder: nextSortOrder }),
            helpText: questionForm.helpText || undefined,
            selectionType: questionForm.selectionType,
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
      expandQuestion(created.id)
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
              : answerForm.requirements.map(requirement => requirement.id),
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
      resetAnswerEditingState()
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
    expandQuestion(answer.questionId)
    const directRequirementIds = new Set(answer.requirementIds)
    const nextAnswerForm = {
      description: answer.description ?? '',
      isNoRequirementSelection: answer.isNoRequirementSelection,
      packageIds: answer.packageIds.map(String),
      requirements: answer.matchingRequirements
        .filter(requirement => directRequirementIds.has(requirement.id))
        .map(asSelectedRequirement),
      sortOrder: String(answer.sortOrder),
      text: answer.text,
    }
    setSelectedQuestionId(answer.questionId)
    setAnswerForm(nextAnswerForm)
    setAnswerFormBaseline(nextAnswerForm)
    setEditingAnswerId(answer.id)
    setPackageSelectorOpen(false)
    setPackageSearch('')
    setRequirementSearch('')
    setRequirementSearchResults([])
    setRequirementSearchStatus('idle')
    setError(null)
    setShowAnswerForm(true)
  }

  const persistQuestionOrder = async (
    areaId: number,
    orderedQuestions: RequirementSelectionQuestion[],
    movedQuestionId: number,
  ) => {
    const normalizedQuestions = orderedQuestions.map((question, index) => ({
      ...question,
      sortOrder: index,
    }))
    const updates = normalizedQuestions
      .map(question => ({ question, sortOrder: question.sortOrder }))
      .filter(({ question, sortOrder }) => {
        const originalQuestion = orderedQuestions.find(
          item => item.id === question.id,
        )
        return originalQuestion?.sortOrder !== sortOrder
      })

    if (updates.length === 0) return

    setQuestions(current => {
      const nextQuestions = replaceAreaQuestionOrder(
        current,
        areaId,
        normalizedQuestions,
      )
      questionsRef.current = nextQuestions
      return nextQuestions
    })
    setReorderingQuestionId(movedQuestionId)
    setSubmitting(true)
    setError(null)

    try {
      const responses = await Promise.all(
        updates.map(({ question, sortOrder }) =>
          apiFetch(`/api/requirement-selection-questions/${question.id}`, {
            body: JSON.stringify({ sortOrder }),
            headers: { 'Content-Type': 'application/json' },
            method: 'PUT',
          }),
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
      setReorderingQuestionId(null)
    }
  }

  const moveQuestionToIndex = (
    areaQuestions: RequirementSelectionQuestion[],
    questionId: number,
    targetIndex: number,
  ) => {
    const currentIndex = areaQuestions.findIndex(
      question => question.id === questionId,
    )
    if (currentIndex < 0) return

    const boundedTargetIndex = Math.max(
      0,
      Math.min(targetIndex, areaQuestions.length - 1),
    )
    if (currentIndex === boundedTargetIndex) return

    const orderedQuestions = [...areaQuestions]
    const [movedQuestion] = orderedQuestions.splice(currentIndex, 1)
    if (!movedQuestion) return

    orderedQuestions.splice(boundedTargetIndex, 0, movedQuestion)
    void persistQuestionOrder(
      movedQuestion.areaId,
      orderedQuestions,
      questionId,
    )
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

  const setVisibleDragImage = (
    event: React.DragEvent<HTMLElement>,
    sourceElement = event.currentTarget,
  ) => {
    const sourceRow = sourceElement
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

  const previewQuestionDropTarget = (
    pointerDrag: NonNullable<typeof questionPointerDragRef.current>,
    targetQuestion: RequirementSelectionQuestion,
  ) => {
    const draggedQuestion = draggedQuestionRef.current
    if (
      !draggedQuestion ||
      draggedQuestion.areaId !== pointerDrag.areaId ||
      draggedQuestion.questionId === targetQuestion.id
    ) {
      return
    }

    setDragOverQuestionId(targetQuestion.id)
    setQuestionDragTransforms(
      buildQuestionDragTransforms(
        pointerDrag.rowLayouts,
        draggedQuestion.questionId,
        targetQuestion.id,
      ),
    )
  }

  const restoreDraggedQuestionOrder = () => {
    const draggedQuestion = draggedQuestionRef.current
    if (!draggedQuestion) return

    setQuestions(current => {
      const nextQuestions = replaceAreaQuestionOrder(
        current,
        draggedQuestion.areaId,
        draggedQuestion.originalQuestions,
      )
      questionsRef.current = nextQuestions
      return nextQuestions
    })
  }

  const clearQuestionDragState = () => {
    draggedQuestionRef.current = null
    setDraggedQuestionId(null)
    setDragOverQuestionId(null)
    setQuestionDragPreview(null)
    setQuestionDropMarker(null)
    setQuestionDragTransforms({})
  }

  const handleQuestionDragHandlePointerDown = (
    event: React.PointerEvent<HTMLElement>,
    areaQuestions: RequirementSelectionQuestion[],
    question: RequirementSelectionQuestion,
  ) => {
    if (submitting || isQuestionReorderFiltered || areaQuestions.length < 2) {
      return
    }
    if (event.button !== 0 || (event.pointerType && !event.isPrimary)) {
      return
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
    const sourceRow = event.currentTarget.closest<HTMLElement>(
      '[data-question-drop-target="true"]',
    )
    const sourceRect = sourceRow?.getBoundingClientRect()
    const previewWidth =
      sourceRect && sourceRect.width > 0 ? sourceRect.width : 480
    const previewOffsetX = sourceRect
      ? Math.max(0, Math.min(event.clientX - sourceRect.left, previewWidth))
      : 22
    const previewOffsetY = sourceRect
      ? Math.max(0, Math.min(event.clientY - sourceRect.top, sourceRect.height))
      : 32
    const rowLayouts = readQuestionRowLayouts(question.areaId)
    const abortController = new AbortController()
    questionPointerDragRef.current = {
      abortController,
      areaId: question.areaId,
      areaQuestions,
      hasStarted: false,
      lastTargetQuestionId: null,
      pointerId: event.pointerId,
      previewOffsetX,
      previewOffsetY,
      previewWidth,
      question,
      questionId: question.id,
      rowLayouts,
      startX: event.clientX,
      startY: event.clientY,
    }
    window.addEventListener(
      'pointerup',
      pointerEvent => {
        finishQuestionPointerDrag(pointerEvent.pointerId)
      },
      { signal: abortController.signal },
    )
    window.addEventListener(
      'pointercancel',
      pointerEvent => {
        cancelQuestionPointerDrag(pointerEvent.pointerId)
      },
      { signal: abortController.signal },
    )
  }

  const handleQuestionDragHandlePointerMove = (
    event: React.PointerEvent<HTMLElement>,
  ) => {
    const pointerDrag = questionPointerDragRef.current
    if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) return

    if (!pointerDrag.hasStarted) {
      const deltaX = event.clientX - pointerDrag.startX
      const deltaY = event.clientY - pointerDrag.startY
      if (Math.hypot(deltaX, deltaY) < 4) return

      pointerDrag.hasStarted = true
      draggedQuestionRef.current = {
        areaId: pointerDrag.areaId,
        originalQuestions: pointerDrag.areaQuestions,
        questionId: pointerDrag.questionId,
      }
      setDraggedQuestionId(pointerDrag.questionId)
      setDragOverQuestionId(pointerDrag.questionId)
    }

    event.preventDefault()
    updateQuestionDragPreview(pointerDrag, event.clientX, event.clientY)
    const targetLayout = findQuestionDropTargetLayoutFromPoint(
      pointerDrag,
      event.clientX,
      event.clientY,
    )
    const targetQuestionId = targetLayout?.questionId ?? 0
    if (
      !Number.isInteger(targetQuestionId) ||
      targetQuestionId <= 0 ||
      targetQuestionId === pointerDrag.questionId
    ) {
      pointerDrag.lastTargetQuestionId = null
      setDragOverQuestionId(pointerDrag.questionId)
      setQuestionDragTransforms({})
      updateQuestionDropMarker(null)
      return
    }

    if (targetQuestionId === pointerDrag.lastTargetQuestionId) {
      updateQuestionDropMarker(targetLayout)
      return
    }

    const targetQuestion = questionsRef.current.find(
      question =>
        question.id === targetQuestionId &&
        question.areaId === pointerDrag.areaId,
    )
    if (!targetQuestion) {
      pointerDrag.lastTargetQuestionId = null
      setDragOverQuestionId(pointerDrag.questionId)
      setQuestionDragTransforms({})
      updateQuestionDropMarker(null)
      return
    }

    pointerDrag.lastTargetQuestionId = targetQuestion.id
    updateQuestionDropMarker(targetLayout ?? null)
    previewQuestionDropTarget(pointerDrag, targetQuestion)
  }

  const finishQuestionPointerDrag = (
    pointerId: number,
    captureElement?: HTMLElement,
  ) => {
    const pointerDrag = questionPointerDragRef.current
    if (!pointerDrag || pointerDrag.pointerId !== pointerId) {
      return
    }

    pointerDrag.abortController.abort()
    captureElement?.releasePointerCapture?.(pointerId)
    questionPointerDragRef.current = null
    if (!pointerDrag.hasStarted) {
      return
    }

    const areaQuestions = questionsRef.current.filter(
      question => question.areaId === pointerDrag.areaId,
    )
    const orderedQuestions = pointerDrag.lastTargetQuestionId
      ? (moveQuestionIntoTargetSlot(
          areaQuestions,
          pointerDrag.questionId,
          pointerDrag.lastTargetQuestionId,
        ) ?? areaQuestions)
      : areaQuestions
    clearQuestionDragState()
    void persistQuestionOrder(
      pointerDrag.areaId,
      orderedQuestions,
      pointerDrag.questionId,
    )
  }

  const cancelQuestionPointerDrag = (
    pointerId: number,
    captureElement?: HTMLElement,
  ) => {
    const pointerDrag = questionPointerDragRef.current
    if (pointerDrag && pointerDrag.pointerId === pointerId) {
      pointerDrag.abortController.abort()
      captureElement?.releasePointerCapture?.(pointerId)
      questionPointerDragRef.current = null
      if (pointerDrag.hasStarted) {
        restoreDraggedQuestionOrder()
      }
    }
    clearQuestionDragState()
  }

  const handleQuestionDragHandlePointerUp = (
    event: React.PointerEvent<HTMLElement>,
  ) => {
    finishQuestionPointerDrag(event.pointerId, event.currentTarget)
  }

  const handleQuestionDragHandlePointerCancel = (
    event: React.PointerEvent<HTMLElement>,
  ) => {
    cancelQuestionPointerDrag(event.pointerId, event.currentTarget)
  }

  const handleQuestionReorderKeyDown = (
    event: React.KeyboardEvent<HTMLElement>,
    areaQuestions: RequirementSelectionQuestion[],
    question: RequirementSelectionQuestion,
  ) => {
    if (submitting || isQuestionReorderFiltered || areaQuestions.length < 2) {
      return
    }

    const currentIndex = areaQuestions.findIndex(
      item => item.id === question.id,
    )
    if (currentIndex < 0) return

    const targetIndexByKey: Partial<Record<string, number>> = {
      ArrowDown: currentIndex + 1,
      ArrowUp: currentIndex - 1,
      End: areaQuestions.length - 1,
      Home: 0,
    }
    const targetIndex = targetIndexByKey[event.key]
    if (targetIndex == null) return

    event.preventDefault()
    moveQuestionToIndex(areaQuestions, question.id, targetIndex)
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

  const clearArmedAnswerDrag = () => {
    armedDragAnswerIdRef.current = null
    setArmedDragAnswerId(null)
  }

  const clearAnswerDragState = () => {
    draggedAnswerRef.current = null
    dragDropCommittedRef.current = false
    dragPreviewedRef.current = false
    clearArmedAnswerDrag()
    setDraggedAnswerId(null)
    setDragOverAnswerId(null)
  }

  const handleAnswerDragStart = (
    event: React.DragEvent<HTMLElement>,
    question: RequirementSelectionQuestion,
    answer: RequirementSelectionAnswer,
    sourceElement?: HTMLElement,
  ) => {
    event.stopPropagation()
    const startedFromAnswerHandle =
      armedDragAnswerId === answer.id ||
      armedDragAnswerIdRef.current === answer.id ||
      (event.target instanceof HTMLElement &&
        Boolean(event.target.closest('[data-answer-drag-handle="true"]')))

    if (submitting || question.answers.length < 2 || !startedFromAnswerHandle) {
      event.preventDefault()
      return
    }

    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(answer.id))
    setVisibleDragImage(event, sourceElement)
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
    armedDragAnswerIdRef.current = answer.id
    setArmedDragAnswerId(answer.id)
  }

  const handleAnswerDragEnd = (event?: React.DragEvent<HTMLElement>) => {
    event?.stopPropagation()
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
    event.stopPropagation()
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
      <RequiredFieldsHint />
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
      <button
        className="btn-primary inline-flex items-center gap-1.5"
        disabled={submitting}
        type="submit"
      >
        {editingQuestionId ? (
          <Save aria-hidden="true" className="h-4 w-4" />
        ) : (
          <Plus aria-hidden="true" className="h-4 w-4" />
        )}
        {editingQuestionId ? copy.save : copy.create}
      </button>
    </form>
  )

  const packageHelpTargetId = 'kuf-answer-package-selector'
  const hasPreviewInputs =
    previewPackageIds.length > 0 || previewRequirementIds.length > 0
  const matchedRequirementsContext =
    'requirementSelectionQuestions > answer form > requirements in selection'
  const selectableRequirementSearchResults = requirementSearchResults.filter(
    requirement => !selectedRequirementIds.has(requirement.id),
  )
  const requirementSearchHasQuery = requirementSearch.trim().length >= 2
  const matchedRequirementScrollOverflow =
    useScrollOverflowHint<HTMLDivElement>(
      [
        showAnswerForm ? 'open' : 'closed',
        matchedRequirementPreviewStatus,
        hasPreviewInputs ? 'with-inputs' : 'empty-inputs',
        matchedRequirementPreview.map(requirement => requirement.id).join(','),
        selectedPreviewRequirementId ?? 'none',
      ].join(':'),
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
      <RequiredFieldsHint />
      {showAnswerForm && error ? (
        <p
          className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(16rem,0.75fr)_minmax(0,1.65fr)] lg:items-start">
        <div
          className="space-y-4"
          {...devMarker({
            context: 'requirementSelectionQuestions',
            name: 'answer form column',
            value: 'fields',
          })}
        >
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
                  requirements: event.target.checked
                    ? []
                    : previous.requirements,
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
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="btn-primary inline-flex items-center gap-1.5"
              disabled={submitting}
              type="submit"
            >
              {editingAnswerId ? (
                <Save aria-hidden="true" className="h-4 w-4" />
              ) : (
                <Plus aria-hidden="true" className="h-4 w-4" />
              )}
              {editingAnswerId ? copy.save : copy.addAnswer}
            </button>
            <button
              className="btn-secondary inline-flex items-center gap-1.5"
              disabled={submitting}
              onClick={event => requestCloseAnswerForm(event.currentTarget)}
              type="button"
            >
              {copy.cancel}
            </button>
          </div>
        </div>

        <div
          className="space-y-4"
          {...devMarker({
            context: 'requirementSelectionQuestions',
            name: 'answer form column',
            value: 'source workspace',
          })}
        >
          <section
            aria-labelledby="kuf-answer-source-selection-heading"
            className="rounded-xl border border-secondary-200 bg-secondary-50/70 p-4 dark:border-secondary-700 dark:bg-secondary-900/40"
            {...devMarker({
              context: 'requirementSelectionQuestions',
              name: 'answer form workspace',
              value: 'source selection',
            })}
          >
            <h3
              className="text-sm font-semibold text-secondary-800 dark:text-secondary-100"
              id="kuf-answer-source-selection-heading"
            >
              {copy.sourceSelection}
            </h3>
            <div className="mt-4 grid gap-4 2xl:grid-cols-[minmax(14rem,0.8fr)_minmax(0,1.2fr)]">
              <div>
                <FieldLabelWithHelp
                  help={copy.answerPackagesHelp}
                  htmlFor={packageHelpTargetId}
                  label={copy.packages}
                />
                <div className="relative">
                  <button
                    aria-expanded={packageSelectorOpen}
                    aria-haspopup="dialog"
                    className={`${inputClassName} flex min-h-11 items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:bg-secondary-100 disabled:text-secondary-500 dark:disabled:bg-secondary-900/70 dark:disabled:text-secondary-500`}
                    disabled={answerForm.isNoRequirementSelection}
                    id={packageHelpTargetId}
                    onClick={() => setPackageSelectorOpen(open => !open)}
                    ref={packageSelectorButtonRef}
                    type="button"
                  >
                    <span className="truncate">
                      {copy.packageSelector} ({selectedPackages.length})
                    </span>
                    <ChevronDown
                      aria-hidden="true"
                      className={`h-4 w-4 shrink-0 transition-transform ${
                        packageSelectorOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {packageSelectorOpen &&
                  !answerForm.isNoRequirementSelection ? (
                    <div
                      className="static mt-2 w-full max-w-96 rounded-xl border border-secondary-200 bg-white p-3 shadow-xl dark:border-secondary-700 dark:bg-secondary-900 2xl:absolute 2xl:left-0 2xl:z-30"
                      ref={packageSelectorRef}
                    >
                      <label className="relative block">
                        <Search
                          aria-hidden="true"
                          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary-400"
                        />
                        <input
                          aria-label={`${copy.search} ${copy.packages}`}
                          className={`${inputClassName} pl-9`}
                          onChange={event =>
                            setPackageSearch(event.target.value)
                          }
                          value={packageSearch}
                        />
                      </label>
                      <fieldset
                        aria-label={copy.packages}
                        className="mt-3 max-h-56 space-y-1 overflow-y-auto overscroll-contain pr-1"
                      >
                        {filteredPackages.length > 0 ? (
                          filteredPackages.map(pkg => {
                            const packageId = String(pkg.id)
                            const inputId = `kuf-answer-package-${pkg.id}`
                            return (
                              <label
                                className="flex min-h-10 items-start gap-2 rounded-lg border border-transparent px-2 py-2 text-sm transition-colors hover:border-secondary-200 hover:bg-secondary-50 dark:hover:border-secondary-700 dark:hover:bg-secondary-800/70"
                                htmlFor={inputId}
                                key={pkg.id}
                              >
                                <input
                                  checked={answerForm.packageIds.includes(
                                    packageId,
                                  )}
                                  className="mt-0.5 h-4 w-4 rounded border-secondary-300 text-primary-700 focus:ring-primary-400/50"
                                  id={inputId}
                                  onChange={event =>
                                    setAnswerForm(previous => ({
                                      ...previous,
                                      packageIds: event.target.checked
                                        ? [
                                            ...previous.packageIds.filter(
                                              id => id !== packageId,
                                            ),
                                            packageId,
                                          ]
                                        : previous.packageIds.filter(
                                            id => id !== packageId,
                                          ),
                                    }))
                                  }
                                  type="checkbox"
                                />
                                <span>{pkg.name}</span>
                              </label>
                            )
                          })
                        ) : (
                          <p className="px-2 py-3 text-sm text-secondary-500 dark:text-secondary-400">
                            {copy.noPackageSearchResults}
                          </p>
                        )}
                      </fieldset>
                    </div>
                  ) : null}
                </div>
                {selectedPackages.length > 0 ? (
                  <fieldset className="mt-2 flex flex-wrap gap-1.5">
                    <legend className="sr-only">{copy.selectedPackages}</legend>
                    {selectedPackages.map(pkg => (
                      <span
                        className="inline-flex min-h-7 max-w-full items-center gap-1 rounded-full border border-secondary-200 bg-white px-2 text-xs text-secondary-700 dark:border-secondary-700 dark:bg-secondary-800 dark:text-secondary-200"
                        key={pkg.id}
                      >
                        <span className="truncate">{pkg.name}</span>
                        <button
                          aria-label={`${copy.removePackage} ${pkg.name}`}
                          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-secondary-500 hover:bg-secondary-100 hover:text-secondary-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 dark:text-secondary-300 dark:hover:bg-secondary-700 dark:hover:text-secondary-50"
                          disabled={answerForm.isNoRequirementSelection}
                          onClick={() =>
                            setAnswerForm(previous => ({
                              ...previous,
                              packageIds: previous.packageIds.filter(
                                id => id !== String(pkg.id),
                              ),
                            }))
                          }
                          type="button"
                        >
                          <X aria-hidden="true" className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </fieldset>
                ) : null}
              </div>

              <div>
                <FieldLabelWithHelp
                  help={copy.requirementIdsHelp}
                  htmlFor="kuf-answer-requirement-search"
                  label={copy.requirementIds}
                />
                <div className="relative">
                  <Search
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary-400"
                  />
                  <input
                    aria-autocomplete="list"
                    aria-controls="kuf-answer-requirement-search-results"
                    className={`${inputClassName} pl-9`}
                    disabled={answerForm.isNoRequirementSelection}
                    id="kuf-answer-requirement-search"
                    onChange={event => setRequirementSearch(event.target.value)}
                    placeholder={copy.searchRequirementIdsPlaceholder}
                    value={requirementSearch}
                  />
                  {requirementSearchHasQuery &&
                  !answerForm.isNoRequirementSelection ? (
                    <div
                      className="absolute left-0 right-0 z-20 mt-2 overflow-hidden rounded-xl border border-secondary-200 bg-white shadow-xl dark:border-secondary-700 dark:bg-secondary-900"
                      id="kuf-answer-requirement-search-results"
                    >
                      {requirementSearchStatus === 'loading' ? (
                        <p
                          className="px-3 py-3 text-sm text-secondary-600 dark:text-secondary-300"
                          role="status"
                        >
                          {copy.loading}
                        </p>
                      ) : requirementSearchStatus === 'error' ? (
                        <p
                          className="px-3 py-3 text-sm text-red-700 dark:text-red-300"
                          role="alert"
                        >
                          {copy.requirementsInSelectionError}
                        </p>
                      ) : selectableRequirementSearchResults.length === 0 ? (
                        <p className="px-3 py-3 text-sm text-secondary-500 dark:text-secondary-400">
                          {copy.noRequirementSearchResults}
                        </p>
                      ) : (
                        <ul className="max-h-64 divide-y divide-secondary-100 overflow-y-auto overscroll-contain dark:divide-secondary-800">
                          {selectableRequirementSearchResults.map(
                            requirement => (
                              <li key={requirement.id}>
                                <button
                                  className="flex min-h-12 w-full items-start gap-3 px-3 py-2 text-left text-sm hover:bg-secondary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 dark:hover:bg-secondary-800/70"
                                  onClick={() => {
                                    setAnswerForm(previous =>
                                      previous.requirements.some(
                                        item => item.id === requirement.id,
                                      )
                                        ? previous
                                        : {
                                            ...previous,
                                            requirements: [
                                              ...previous.requirements,
                                              requirement,
                                            ],
                                          },
                                    )
                                    setRequirementSearch('')
                                    setRequirementSearchResults([])
                                    setRequirementSearchStatus('idle')
                                  }}
                                  type="button"
                                >
                                  <span className="mt-0.5 shrink-0 font-mono text-xs font-semibold text-secondary-900 dark:text-secondary-100">
                                    {requirement.uniqueId}
                                  </span>
                                  {requirement.description ? (
                                    <span className="min-w-0 text-xs leading-5 text-secondary-600 dark:text-secondary-300">
                                      {requirement.description}
                                    </span>
                                  ) : null}
                                </button>
                              </li>
                            ),
                          )}
                        </ul>
                      )}
                    </div>
                  ) : null}
                </div>
                {answerForm.requirements.length > 0 ? (
                  <fieldset className="mt-2 flex flex-wrap gap-1.5">
                    <legend className="sr-only">
                      {copy.selectedRequirementIds}
                    </legend>
                    {answerForm.requirements.map(requirement => (
                      <span
                        className="inline-flex min-h-7 max-w-full items-center gap-1 rounded-full border border-primary-200 bg-primary-50 px-2 text-xs text-primary-900 dark:border-primary-900/60 dark:bg-primary-950/40 dark:text-primary-100"
                        key={requirement.id}
                      >
                        <span className="font-mono">
                          {requirement.uniqueId}
                        </span>
                        <button
                          aria-label={`${copy.removeRequirement} ${requirement.uniqueId}`}
                          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-primary-700 hover:bg-primary-100 hover:text-primary-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 dark:text-primary-200 dark:hover:bg-primary-900/60 dark:hover:text-primary-50"
                          disabled={answerForm.isNoRequirementSelection}
                          onClick={() =>
                            setAnswerForm(previous => ({
                              ...previous,
                              requirements: previous.requirements.filter(
                                item => item.id !== requirement.id,
                              ),
                            }))
                          }
                          type="button"
                        >
                          <X aria-hidden="true" className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </fieldset>
                ) : null}
              </div>
            </div>
          </section>

          <section
            aria-labelledby="kuf-answer-requirements-in-selection-heading"
            className="flex min-h-0 flex-col rounded-xl border border-secondary-200 bg-white p-4 dark:border-secondary-700 dark:bg-secondary-950/20"
            {...devMarker({
              context: 'requirementSelectionQuestions',
              name: 'answer form workspace',
              value: 'requirements in selection',
            })}
          >
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3
                  className="text-sm font-semibold text-secondary-800 dark:text-secondary-100"
                  id="kuf-answer-requirements-in-selection-heading"
                >
                  {copy.requirementsInSelection}
                </h3>
                <p className="mt-1 text-xs leading-5 text-secondary-500 dark:text-secondary-400">
                  {copy.requirementsInSelectionSource}
                </p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full border border-secondary-200 bg-secondary-100/80 px-2 py-1 text-xs font-medium text-secondary-600 dark:border-secondary-700 dark:bg-secondary-800/70 dark:text-secondary-300">
                <Lock aria-hidden="true" className="h-3 w-3" />
                {copy.matchingRequirementsReadOnly}
              </span>
            </div>
            <div className="relative min-h-0">
              <div
                className={`${answerSelectionListClassName} rounded-lg border border-secondary-200 bg-secondary-50/70 pb-8 shadow-inner dark:border-secondary-700 dark:bg-secondary-950/20`}
                ref={matchedRequirementScrollOverflow.scrollRef}
              >
                {matchedRequirementPreviewStatus === 'loading' ? (
                  <p
                    className="px-3 py-4 text-sm text-secondary-600 dark:text-secondary-300"
                    role="status"
                  >
                    {copy.loading}
                  </p>
                ) : matchedRequirementPreviewStatus === 'error' ? (
                  <p
                    className="px-3 py-4 text-sm text-red-700 dark:text-red-300"
                    role="alert"
                  >
                    {copy.requirementsInSelectionError}
                  </p>
                ) : !hasPreviewInputs ? (
                  <p className="px-3 py-4 text-sm text-secondary-500 dark:text-secondary-400">
                    {copy.requirementsInSelectionPrompt}
                  </p>
                ) : matchedRequirementPreview.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-secondary-500 dark:text-secondary-400">
                    {copy.requirementsInSelectionEmpty}
                  </p>
                ) : (
                  <ul className="divide-y divide-secondary-200 dark:divide-secondary-700">
                    {matchedRequirementPreview.map(requirement => (
                      <li key={requirement.id}>
                        <button
                          aria-expanded={
                            selectedPreviewRequirementId === requirement.id
                          }
                          aria-label={`${copy.openRequirementDetail} ${requirement.uniqueId}`}
                          className={`group flex min-h-16 w-full items-start gap-3 border-l-2 px-3 py-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 ${
                            selectedPreviewRequirementId === requirement.id
                              ? 'border-l-primary-500 bg-primary-50/80 text-primary-950 dark:bg-primary-950/30 dark:text-primary-100'
                              : 'border-l-transparent text-secondary-800 hover:bg-white/80 dark:text-secondary-100 dark:hover:bg-secondary-900/60'
                          }`}
                          onClick={() =>
                            setSelectedPreviewRequirementId(current =>
                              current === requirement.id
                                ? null
                                : requirement.id,
                            )
                          }
                          type="button"
                          {...devMarker({
                            context: matchedRequirementsContext,
                            name: 'requirement in selection',
                            value: requirement.uniqueId,
                          })}
                        >
                          <span className="mt-0.5 shrink-0 font-mono text-xs font-semibold">
                            {requirement.uniqueId}
                          </span>
                          <span className="min-w-0 flex-1">
                            {requirement.description ? (
                              <span className="block text-xs leading-5 text-secondary-600 dark:text-secondary-300">
                                {requirement.description}
                              </span>
                            ) : null}
                            <span className="mt-2 flex flex-wrap gap-1">
                              {requirement.direct ? (
                                <span className="inline-flex rounded-full border border-primary-200 bg-primary-50 px-2 py-0.5 text-[0.68rem] font-medium text-primary-900 dark:border-primary-900/60 dark:bg-primary-950/40 dark:text-primary-100">
                                  {copy.directRequirement}
                                </span>
                              ) : null}
                              {requirement.sourcePackages.map(pkg => (
                                <span
                                  className="inline-flex rounded-full border border-secondary-200 bg-white px-2 py-0.5 text-[0.68rem] font-medium text-secondary-700 dark:border-secondary-700 dark:bg-secondary-800 dark:text-secondary-200"
                                  key={pkg.id}
                                >
                                  {pkg.name}
                                </span>
                              ))}
                            </span>
                          </span>
                          <ChevronRight
                            aria-hidden="true"
                            className={`mt-0.5 h-4 w-4 shrink-0 text-secondary-400 transition-transform group-hover:text-secondary-600 dark:text-secondary-500 dark:group-hover:text-secondary-300 ${
                              selectedPreviewRequirementId === requirement.id
                                ? 'rotate-90'
                                : ''
                            }`}
                          />
                        </button>
                        {selectedPreviewRequirementId === requirement.id ? (
                          <CompactRequirementDetail
                            developerModeContext={matchedRequirementsContext}
                            requirementId={selectedPreviewRequirementId}
                          />
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <ScrollOverflowCue
                hasOverflowAbove={
                  matchedRequirementScrollOverflow.hasOverflowAbove
                }
                hasOverflowBelow={
                  matchedRequirementScrollOverflow.hasOverflowBelow
                }
                surface="preview"
              />
            </div>
          </section>
        </div>
      </div>
    </form>
  )

  const hierarchyDialogContent =
    hierarchyQuestion && hierarchyLayout ? (
      <div
        className="space-y-4"
        {...devMarker({
          context: 'requirementSelectionQuestions',
          name: 'hierarchy dialog',
          value: hierarchyQuestion.questionCode,
        })}
      >
        <div className="space-y-1">
          <p className="font-mono text-sm font-semibold text-primary-800 dark:text-primary-200">
            {hierarchyQuestion.questionCode}
          </p>
          <p className="text-sm text-secondary-700 dark:text-secondary-300">
            {hierarchyQuestion.text}
          </p>
          <p className="text-sm text-secondary-600 dark:text-secondary-400">
            {copy.hierarchyDialogIntro}
          </p>
        </div>
        <div
          className="max-h-[calc(100vh-18rem)] overflow-auto rounded-xl border border-secondary-200 bg-secondary-50/80 p-3 dark:border-secondary-800 dark:bg-secondary-950/50"
          {...devMarker({
            context: 'requirementSelectionQuestions',
            name: 'hierarchy graph',
            value: hierarchyQuestion.questionCode,
          })}
        >
          <div
            className="relative"
            style={{
              height: `${hierarchyLayout.height}px`,
              minWidth: '100%',
              width: `${hierarchyLayout.width}px`,
            }}
          >
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              focusable="false"
              height={hierarchyLayout.height}
              viewBox={`0 0 ${hierarchyLayout.width} ${hierarchyLayout.height}`}
              width={hierarchyLayout.width}
            >
              <defs>
                <marker
                  id="requirement-selection-hierarchy-arrow"
                  markerHeight="8"
                  markerWidth="8"
                  orient="auto"
                  refX="6"
                  refY="4"
                  viewBox="0 0 8 8"
                >
                  <path d="M0 0 L8 4 L0 8 Z" fill="currentColor" />
                </marker>
              </defs>
              {hierarchyLayout.edges.map(edge => (
                <path
                  className="text-primary-300 dark:text-primary-700"
                  d={edge.svgPath}
                  fill="none"
                  key={edge.id}
                  markerEnd="url(#requirement-selection-hierarchy-arrow)"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                />
              ))}
            </svg>
            {hierarchyLayout.nodes.map(node => {
              const conditionRows = node.conditionGroups.flatMap(
                (group, groupIndex) =>
                  group.conditions.map(condition => ({
                    condition,
                    groupIndex,
                  })),
              )
              const visibleConditionRows = conditionRows.slice(0, 2)
              const hiddenConditionRowCount =
                conditionRows.length - visibleConditionRows.length
              const nodeStatus =
                node.question.isArchived || !node.question.isActive
                  ? statusText(node.question, copy)
                  : null

              return (
                <fieldset
                  aria-label={`${node.question.questionCode}: ${
                    node.question.text
                  }${node.isFocus ? `, ${copy.hierarchyCurrentQuestion}` : ''}`}
                  className={`absolute flex flex-col overflow-hidden rounded-xl border bg-white p-3 text-sm shadow-sm dark:bg-secondary-900 ${
                    node.isFocus
                      ? 'border-primary-500 ring-2 ring-primary-400/70 dark:border-primary-400'
                      : 'border-secondary-200 dark:border-secondary-700'
                  }`}
                  key={node.id}
                  style={{
                    height: `${node.height}px`,
                    left: `${node.x}px`,
                    top: `${node.y}px`,
                    width: `${node.width}px`,
                  }}
                  title={node.question.text}
                  {...devMarker({
                    context: 'requirementSelectionQuestions',
                    name: 'hierarchy node',
                    value: node.question.questionCode,
                  })}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-mono text-xs font-semibold text-primary-800 dark:text-primary-200">
                        {node.question.questionCode}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-secondary-500 dark:text-secondary-400">
                        {node.question.areaName}
                      </div>
                    </div>
                    {nodeStatus ? (
                      <span className="shrink-0 rounded-md bg-secondary-100 px-1.5 py-0.5 text-[11px] font-medium text-secondary-700 dark:bg-secondary-800 dark:text-secondary-200">
                        {nodeStatus}
                      </span>
                    ) : null}
                  </div>
                  <p
                    className="mt-2 overflow-hidden font-medium leading-snug text-secondary-950 dark:text-secondary-50"
                    style={{
                      WebkitBoxOrient: 'vertical',
                      WebkitLineClamp: 2,
                      display: '-webkit-box',
                    }}
                  >
                    {node.question.text}
                  </p>
                  {visibleConditionRows.length > 0 ? (
                    <div className="mt-2 min-h-0 space-y-1 border-t border-secondary-100 pt-2 text-[11px] leading-snug text-secondary-600 dark:border-secondary-800 dark:text-secondary-300">
                      {visibleConditionRows.map(({ condition, groupIndex }) => {
                        const conditionStatus =
                          condition.parent.isArchived ||
                          condition.answers.some(answer => answer.isArchived)
                            ? copy.archived
                            : !condition.parent.isActive ||
                                condition.answers.some(
                                  answer => !answer.isActive,
                                )
                              ? copy.inactive
                              : null
                        return (
                          <div
                            className="truncate"
                            key={`${node.id}-${groupIndex}-${condition.parent.questionId}`}
                            title={`${copy.conditionGroup} ${groupIndex + 1}: ${
                              condition.parent.questionCode
                            }: ${condition.answers
                              .map(answer => answer.text)
                              .join(', ')}`}
                          >
                            <span className="font-semibold">
                              {copy.conditionGroup} {groupIndex + 1}
                            </span>
                            {': '}
                            <span className="font-mono">
                              {condition.parent.questionCode}
                            </span>
                            {': '}
                            {condition.answers
                              .map(answer => answer.text)
                              .join(', ')}
                            {conditionStatus ? (
                              <span className="ml-1 rounded bg-secondary-100 px-1 text-secondary-700 dark:bg-secondary-800 dark:text-secondary-200">
                                {conditionStatus}
                              </span>
                            ) : null}
                          </div>
                        )
                      })}
                      {hiddenConditionRowCount > 0 ? (
                        <div className="font-medium text-secondary-500 dark:text-secondary-400">
                          +{hiddenConditionRowCount}{' '}
                          {copy.hierarchyMoreConditionRows}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </fieldset>
              )
            })}
          </div>
        </div>
      </div>
    ) : null

  const questionDropMarkerContent = questionDropMarker ? (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed z-90 rounded-2xl bg-secondary-200/45 ring-2 ring-inset ring-secondary-500/75 dark:bg-secondary-700/45 dark:ring-secondary-400/70"
      data-question-drop-marker="true"
      style={{
        height: questionDropMarker.height,
        left: questionDropMarker.x,
        top: questionDropMarker.y,
        width: questionDropMarker.width,
      }}
    />
  ) : null

  const questionDragPreviewContent = questionDragPreview
    ? (() => {
        const { question } = questionDragPreview
        const answerCountText = `${question.answers.length} ${
          question.answers.length === 1
            ? copy.answerCountSingular
            : copy.answerCountPlural
        }`

        return (
          <div
            aria-hidden="true"
            className="pointer-events-none fixed z-80 overflow-hidden rounded-2xl border border-primary-200 bg-white/95 text-left shadow-2xl ring-2 ring-primary-300/70 backdrop-blur-sm dark:border-primary-800 dark:bg-secondary-900/95 dark:ring-primary-700/70"
            data-question-drag-preview="true"
            style={{
              left: questionDragPreview.x,
              maxWidth: 'calc(100vw - 1rem)',
              top: questionDragPreview.y,
              width: questionDragPreview.width,
            }}
          >
            <div className="flex items-stretch">
              <div className="inline-flex min-h-16 w-11 shrink-0 items-center justify-center border-r border-secondary-200 text-secondary-700 dark:border-secondary-800 dark:text-secondary-200">
                <GripVertical aria-hidden="true" className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1 px-4 py-4">
                <div className="flex items-start gap-3">
                  <ChevronRight
                    aria-hidden="true"
                    className="mt-1 h-4 w-4 shrink-0 text-secondary-500 dark:text-secondary-400"
                  />
                  <div className="min-w-0 flex-1">
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
                      <span className="text-xs text-secondary-500 dark:text-secondary-400">
                        {answerCountText}
                      </span>
                      {question.visibilityGroups.length > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-md border border-primary-200 bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-900 dark:border-primary-900/60 dark:bg-primary-950/40 dark:text-primary-100">
                          <Eye aria-hidden="true" className="h-3 w-3" />
                          {copy.visibilityButtonText}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-2 truncate font-medium text-secondary-950 dark:text-secondary-50">
                      {question.text}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      })()
    : null

  return (
    <div className="section-padding px-4 sm:px-6 lg:px-8">
      <div className="container-custom" ref={contentRef}>
        {questionDragPreviewContent}
        {questionDropMarkerContent}
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
          maxWidthClassName="max-w-7xl"
          onClose={() => requestCloseAnswerForm()}
          open={showAnswerForm}
          showHeader={false}
          title={
            editingAnswerId
              ? copy.editRequirementSelectionAnswer
              : copy.addAnswer
          }
          titleId={
            editingAnswerId
              ? 'requirement-selection-answer-edit-title'
              : 'requirement-selection-answer-create-title'
          }
        >
          {answerFormContent}
        </FormModal>
        <FormModal
          developerModeValue="requirement selection question hierarchy"
          maxWidthClassName="max-w-7xl"
          onClose={closeHierarchyDialog}
          open={Boolean(hierarchyDialogContent)}
          title={copy.hierarchyDialogTitle}
          titleId="requirement-selection-question-hierarchy-title"
        >
          {hierarchyDialogContent}
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
              groupedQuestions.map(group => (
                <section className="space-y-3" key={group.areaId}>
                  <div
                    className="sticky top-16 z-20 flex flex-wrap items-center gap-2 rounded-lg border border-primary-200 bg-primary-50/95 px-3 py-2 shadow-[0_8px_18px_-14px_rgba(67,56,202,0.45)] backdrop-blur dark:border-primary-800/70 dark:bg-primary-950/80"
                    {...devMarker({
                      context: 'requirementSelectionQuestions',
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
                      const detailsId = `requirement-selection-question-details-${question.id}`
                      const answerCountText = `${question.answers.length} ${
                        question.answers.length === 1
                          ? copy.answerCountSingular
                          : copy.answerCountPlural
                      }`
                      const hierarchyCount =
                        hierarchyBadgeCounts.get(question.id) ?? 0
                      const questionReorderEnabled =
                        !submitting &&
                        !isQuestionReorderFiltered &&
                        group.questions.length > 1
                      const questionReorderHint = isQuestionReorderFiltered
                        ? copy.reorderQuestionDisabledHint
                        : copy.reorderQuestionHint
                      const questionDragSurfaceClass =
                        draggedQuestionId === question.id
                          ? 'bg-secondary-200/95 ring-2 ring-inset ring-secondary-500/60 dark:bg-secondary-700/85 dark:ring-secondary-500/70'
                          : dragOverQuestionId === question.id &&
                              draggedQuestionId !== question.id
                            ? 'bg-secondary-100/95 ring-2 ring-inset ring-secondary-400/70 dark:bg-secondary-700/65 dark:ring-secondary-500/70'
                            : 'bg-white/80 dark:bg-secondary-900/60'
                      const questionDragTransform =
                        questionDragTransforms[question.id] ?? 0

                      return (
                        <li
                          className={`overflow-hidden rounded-2xl border shadow-sm transition-all duration-150 dark:border-secondary-800 ${questionDragSurfaceClass} ${
                            selectedQuestionId === question.id
                              ? 'ring-2 ring-primary-500'
                              : ''
                          } ${
                            reorderingQuestionId === question.id
                              ? 'opacity-70'
                              : ''
                          }`}
                          data-question-area-id={group.areaId}
                          data-question-drop-target="true"
                          data-question-id={question.id}
                          key={question.id}
                          style={
                            questionDragTransform
                              ? {
                                  transform: `translateY(${questionDragTransform}px)`,
                                }
                              : undefined
                          }
                        >
                          <div
                            className={`flex items-stretch ${
                              draggedQuestionId === question.id
                                ? 'invisible'
                                : ''
                            }`}
                          >
                            <button
                              aria-describedby={`kuf-question-reorder-hint-${question.id}`}
                              aria-label={copy.reorderQuestion}
                              className="inline-flex min-h-16 w-11 shrink-0 touch-none select-none self-stretch items-center justify-center border-r border-secondary-200 p-0 text-secondary-700 transition-colors hover:bg-secondary-50 hover:text-secondary-950 disabled:cursor-not-allowed disabled:opacity-40 dark:border-secondary-800 dark:text-secondary-200 dark:hover:bg-secondary-800 dark:hover:text-secondary-50"
                              data-question-drag-handle="true"
                              disabled={!questionReorderEnabled}
                              onKeyDown={event =>
                                handleQuestionReorderKeyDown(
                                  event,
                                  group.questions,
                                  question,
                                )
                              }
                              onPointerCancel={
                                handleQuestionDragHandlePointerCancel
                              }
                              onPointerDown={event =>
                                handleQuestionDragHandlePointerDown(
                                  event,
                                  group.questions,
                                  question,
                                )
                              }
                              onPointerMove={
                                handleQuestionDragHandlePointerMove
                              }
                              onPointerUp={handleQuestionDragHandlePointerUp}
                              title={questionReorderHint}
                              type="button"
                              {...devMarker({
                                context: 'requirementSelectionQuestions',
                                name: 'question reorder handle',
                                value: question.questionCode,
                              })}
                            >
                              <span
                                aria-hidden="true"
                                className="flex h-full min-h-16 w-full cursor-grab items-center justify-center active:cursor-grabbing"
                                data-question-drag-handle="true"
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
                              id={`kuf-question-reorder-hint-${question.id}`}
                            >
                              {questionReorderHint}
                            </span>
                            <button
                              aria-controls={detailsId}
                              aria-expanded={isExpanded}
                              className="block min-w-0 flex-1 px-4 py-4 text-left transition-colors hover:bg-secondary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400/60 dark:hover:bg-secondary-800/50"
                              onClick={() =>
                                toggleQuestionExpansion(question.id)
                              }
                              type="button"
                              {...devMarker({
                                context: 'requirementSelectionQuestions',
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
                                    <span className="text-xs text-secondary-500">
                                      {question.selectionType === 'multiple'
                                        ? copy.multiple
                                        : copy.single}
                                    </span>
                                    <span className="text-xs font-medium text-secondary-700 dark:text-secondary-300">
                                      {statusText(question, copy)}
                                    </span>
                                    <span className="text-xs text-secondary-500 dark:text-secondary-400">
                                      {answerCountText}
                                    </span>
                                    {question.visibilityGroups.length > 0 ? (
                                      <span className="inline-flex items-center gap-1 rounded-md border border-primary-200 bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-900 dark:border-primary-900/60 dark:bg-primary-950/40 dark:text-primary-100">
                                        <Eye
                                          aria-hidden="true"
                                          className="h-3 w-3"
                                        />
                                        {copy.visibilityButtonText}
                                      </span>
                                    ) : null}
                                  </span>
                                  <span className="mt-2 block font-medium text-secondary-950 dark:text-secondary-50">
                                    {question.text}
                                  </span>
                                </span>
                              </div>
                            </button>
                            {hierarchyCount > 0 ? (
                              <div className="flex shrink-0 items-start px-4 py-4 pl-0">
                                <button
                                  aria-label={`${copy.hierarchyBadgeAria}: ${
                                    question.questionCode
                                  }, ${hierarchyCount} ${
                                    hierarchyCount === 1
                                      ? copy.hierarchyQuestionCountSingular
                                      : copy.hierarchyQuestionCountPlural
                                  }`}
                                  className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-primary-200 bg-primary-50 px-2.5 text-xs font-medium text-primary-900 transition-colors hover:border-primary-300 hover:bg-primary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/60 dark:border-primary-900/60 dark:bg-primary-950/40 dark:text-primary-100 dark:hover:border-primary-800 dark:hover:bg-primary-950/70"
                                  onClick={() => openHierarchyDialog(question)}
                                  type="button"
                                  {...devMarker({
                                    context: 'requirementSelectionQuestions',
                                    name: 'hierarchy badge',
                                    value: question.questionCode,
                                  })}
                                >
                                  <GitBranch
                                    aria-hidden="true"
                                    className="h-3.5 w-3.5"
                                  />
                                  {copy.hierarchyBadgeLabel} · {hierarchyCount}
                                </button>
                              </div>
                            ) : null}
                          </div>
                          {isExpanded ? (
                            <div
                              className={`border-t border-secondary-200 p-4 dark:border-secondary-800 ${
                                visibilityPanelQuestionId === question.id
                                  ? 'grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(24rem,32rem)]'
                                  : ''
                              } ${
                                draggedQuestionId === question.id
                                  ? 'invisible'
                                  : ''
                              }`}
                              id={detailsId}
                            >
                              <div className="min-w-0">
                                {question.helpText && (
                                  <p className="mb-3 text-sm text-secondary-600 dark:text-secondary-400">
                                    {question.helpText}
                                  </p>
                                )}
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <button
                                    className="inline-flex min-h-10 items-center gap-1 rounded-lg border px-3 text-sm disabled:opacity-50"
                                    disabled={submitting}
                                    onClick={() =>
                                      openQuestionEditForm(question)
                                    }
                                    type="button"
                                  >
                                    <Pencil
                                      aria-hidden="true"
                                      className="h-4 w-4"
                                    />
                                    {copy.edit}
                                  </button>
                                  <button
                                    className="inline-flex min-h-10 items-center gap-1 rounded-lg border px-3 text-sm disabled:opacity-50"
                                    disabled={submitting}
                                    onClick={() =>
                                      openVisibilityPanel(question)
                                    }
                                    type="button"
                                  >
                                    <Eye
                                      aria-hidden="true"
                                      className="h-4 w-4"
                                    />
                                    {copy.visibilityButtonText}
                                  </button>
                                  <button
                                    className="inline-flex min-h-10 items-center gap-1 rounded-lg border px-3 text-sm disabled:opacity-50"
                                    disabled={submitting}
                                    onClick={() =>
                                      questionAction(
                                        question,
                                        question.isActive
                                          ? 'deactivate'
                                          : 'activate',
                                      )
                                    }
                                    type="button"
                                  >
                                    {question.isActive ? (
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
                                    {question.isActive
                                      ? copy.deactivate
                                      : copy.activate}
                                  </button>
                                  <button
                                    className="inline-flex min-h-10 items-center gap-1 rounded-lg border px-3 text-sm disabled:opacity-50"
                                    disabled={submitting}
                                    onClick={event =>
                                      questionAction(
                                        question,
                                        question.isArchived
                                          ? 'reactivate'
                                          : 'archive',
                                        event.currentTarget,
                                      )
                                    }
                                    type="button"
                                  >
                                    {question.isArchived ? (
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
                                    {question.isArchived
                                      ? copy.reactivate
                                      : copy.archive}
                                  </button>
                                  <button
                                    className="inline-flex min-h-10 items-center gap-1 rounded-lg border px-3 text-sm disabled:opacity-50"
                                    disabled={submitting}
                                    onClick={() =>
                                      questionAction(question, 'duplicate')
                                    }
                                    type="button"
                                  >
                                    <Copy
                                      aria-hidden="true"
                                      className="h-4 w-4"
                                    />
                                    {copy.clone}
                                  </button>
                                  <button
                                    className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-red-200 px-3 text-sm text-red-700 disabled:opacity-50 dark:border-red-800 dark:text-red-300"
                                    disabled={submitting}
                                    onClick={event =>
                                      questionAction(
                                        question,
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
                                {question.answers.length > 0 && (
                                  <ul className="mt-4 divide-y rounded-xl border dark:border-secondary-800">
                                    {question.answers.map(answer => {
                                      const answerReorderEnabled =
                                        !submitting &&
                                        question.answers.length > 1
                                      const answerDragSurfaceClass =
                                        draggedAnswerId === answer.id
                                          ? 'bg-secondary-200/95 ring-2 ring-inset ring-secondary-500/60 dark:bg-secondary-700/85 dark:ring-secondary-500/70'
                                          : dragOverAnswerId === answer.id &&
                                              draggedAnswerId !== answer.id
                                            ? 'bg-secondary-100/95 ring-2 ring-inset ring-secondary-400/70 dark:bg-secondary-700/65 dark:ring-secondary-500/70'
                                            : ''

                                      return (
                                        <li
                                          className={`transition-colors ${answerDragSurfaceClass} ${
                                            reorderingAnswerId === answer.id
                                              ? 'opacity-70'
                                              : ''
                                          }`}
                                          draggable={
                                            answerReorderEnabled
                                              ? true
                                              : undefined
                                          }
                                          key={answer.id}
                                          onDragEnd={handleAnswerDragEnd}
                                          onDragEnter={event => {
                                            event.stopPropagation()
                                            setDragOverAnswerId(answer.id)
                                          }}
                                          onDragOver={event => {
                                            event.stopPropagation()
                                            if (!draggedAnswerId) return
                                            event.preventDefault()
                                            event.dataTransfer.dropEffect =
                                              'move'
                                            setDragOverAnswerId(answer.id)
                                            previewAnswerMove(
                                              question.id,
                                              answer,
                                            )
                                          }}
                                          onDragStart={event =>
                                            handleAnswerDragStart(
                                              event,
                                              question,
                                              answer,
                                            )
                                          }
                                          onDrop={event =>
                                            handleAnswerDrop(
                                              event,
                                              question,
                                              answer,
                                            )
                                          }
                                        >
                                          <div
                                            className={`flex gap-3 p-3 ${
                                              draggedAnswerId === answer.id
                                                ? 'invisible'
                                                : ''
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
                                              className={`inline-flex min-h-11 w-8 shrink-0 touch-none select-none self-stretch items-center justify-center rounded-lg border border-secondary-300 p-0 text-secondary-700 transition-colors hover:bg-secondary-50 hover:text-secondary-950 dark:border-secondary-700 dark:text-secondary-200 dark:hover:bg-secondary-800 dark:hover:text-secondary-50 ${
                                                answerReorderEnabled
                                                  ? 'cursor-grab active:cursor-grabbing'
                                                  : 'cursor-not-allowed opacity-40'
                                              }`}
                                              data-answer-drag-handle="true"
                                              disabled={!answerReorderEnabled}
                                              onKeyDown={event =>
                                                handleAnswerReorderKeyDown(
                                                  event,
                                                  question,
                                                  answer,
                                                )
                                              }
                                              onPointerCancel={
                                                clearArmedAnswerDrag
                                              }
                                              onPointerDown={() =>
                                                handleAnswerDragHandlePointerDown(
                                                  question,
                                                  answer,
                                                )
                                              }
                                              onPointerUp={clearArmedAnswerDrag}
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
                                                <p className="font-medium">
                                                  {answer.text}
                                                </p>
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
                                                {!answer.isNoRequirementSelection
                                                  ? (() => {
                                                      const packageNames =
                                                        answer.packageIds
                                                          .map(packageId =>
                                                            packagesById.get(
                                                              packageId,
                                                            ),
                                                          )
                                                          .filter(
                                                            (
                                                              pkg,
                                                            ): pkg is RequirementPackage =>
                                                              Boolean(pkg),
                                                          )
                                                      const directRequirementIds =
                                                        new Set(
                                                          answer.requirementIds,
                                                        )
                                                      const directRequirements =
                                                        answer.matchingRequirements.filter(
                                                          requirement =>
                                                            directRequirementIds.has(
                                                              requirement.id,
                                                            ),
                                                        )
                                                      const unresolvedPackageCount =
                                                        answer.packageIds
                                                          .length -
                                                        packageNames.length
                                                      const unresolvedRequirementCount =
                                                        answer.requirementIds
                                                          .length -
                                                        directRequirements.length
                                                      const hasVisibleSources =
                                                        packageNames.length >
                                                          0 ||
                                                        directRequirements.length >
                                                          0 ||
                                                        unresolvedPackageCount >
                                                          0 ||
                                                        unresolvedRequirementCount >
                                                          0
                                                      const answerExpansion =
                                                        expandedAnswerSelection?.answerId ===
                                                        answer.id
                                                          ? expandedAnswerSelection
                                                          : null
                                                      const activeFilters =
                                                        answerExpansion?.filters ??
                                                        []
                                                      const filteredRequirements =
                                                        filterMatchedRequirementsBySources(
                                                          answer.matchingRequirements,
                                                          activeFilters,
                                                        )
                                                      const hasActiveSourceFilters =
                                                        activeFilters.length > 0
                                                      const displayedRequirementCount =
                                                        hasActiveSourceFilters
                                                          ? filteredRequirements.length
                                                          : answer.matchingRequirementCount
                                                      const requirementCountLabel =
                                                        displayedRequirementCount ===
                                                        1
                                                          ? copy.requirementCountSingular
                                                          : copy.requirementCountPlural

                                                      const toggleRequirementList =
                                                        () => {
                                                          setExpandedAnswerSelection(
                                                            current =>
                                                              current?.answerId ===
                                                              answer.id
                                                                ? null
                                                                : {
                                                                    answerId:
                                                                      answer.id,
                                                                    filters: [],
                                                                  },
                                                          )
                                                        }

                                                      const toggleSourceFilter =
                                                        (
                                                          filter: AnswerRequirementSourceFilter,
                                                        ) => {
                                                          setExpandedAnswerSelection(
                                                            current => {
                                                              if (
                                                                current?.answerId !==
                                                                answer.id
                                                              ) {
                                                                return {
                                                                  answerId:
                                                                    answer.id,
                                                                  filters: [
                                                                    filter,
                                                                  ],
                                                                }
                                                              }

                                                              const alreadyActive =
                                                                current.filters.some(
                                                                  item =>
                                                                    sourceFilterEquals(
                                                                      item,
                                                                      filter,
                                                                    ),
                                                                )
                                                              const filters =
                                                                alreadyActive
                                                                  ? current.filters.filter(
                                                                      item =>
                                                                        !sourceFilterEquals(
                                                                          item,
                                                                          filter,
                                                                        ),
                                                                    )
                                                                  : [
                                                                      ...current.filters,
                                                                      filter,
                                                                    ]

                                                              return {
                                                                answerId:
                                                                  answer.id,
                                                                filters,
                                                              }
                                                            },
                                                          )
                                                        }

                                                      const isSourceFilterActive =
                                                        (
                                                          filter: AnswerRequirementSourceFilter,
                                                        ) =>
                                                          activeFilters.some(
                                                            item =>
                                                              sourceFilterEquals(
                                                                item,
                                                                filter,
                                                              ),
                                                          )

                                                      if (
                                                        packageNames.length ===
                                                          0 &&
                                                        directRequirements.length ===
                                                          0 &&
                                                        unresolvedPackageCount ===
                                                          0 &&
                                                        unresolvedRequirementCount ===
                                                          0 &&
                                                        answer.matchingRequirementCount ===
                                                          0
                                                      ) {
                                                        return null
                                                      }

                                                      return (
                                                        <div className="mt-2 space-y-2">
                                                          <fieldset className="flex flex-wrap items-center gap-1.5 text-xs">
                                                            <legend className="sr-only">
                                                              {
                                                                copy.requirementSources
                                                              }
                                                            </legend>
                                                            {/*
                                              AI reviewers and agents: do not increase these
                                              compact answer pill dimensions; the compact row
                                              intentionally limits real estate usage.
                                            */}
                                                            {answer.matchingRequirementCount >
                                                            0 ? (
                                                              <button
                                                                aria-expanded={Boolean(
                                                                  answerExpansion,
                                                                )}
                                                                aria-label={`${
                                                                  answerExpansion
                                                                    ? copy.hideRequirementsInSelection
                                                                    : copy.showRequirementsInSelection
                                                                } ${answer.text}`}
                                                                className="inline-flex min-h-7 items-center gap-1 rounded-full border border-secondary-300 bg-white px-2.5 py-0.5 text-xs font-semibold text-secondary-800 shadow-sm transition-colors hover:border-secondary-400 hover:bg-secondary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 dark:border-secondary-600 dark:bg-secondary-950/60 dark:text-secondary-100 dark:hover:border-secondary-400 dark:hover:bg-secondary-800"
                                                                onClick={
                                                                  toggleRequirementList
                                                                }
                                                                type="button"
                                                              >
                                                                <ChevronDown
                                                                  aria-hidden="true"
                                                                  className={`h-3 w-3 transition-transform ${
                                                                    answerExpansion
                                                                      ? 'rotate-180'
                                                                      : ''
                                                                  }`}
                                                                />
                                                                <span>
                                                                  {
                                                                    displayedRequirementCount
                                                                  }
                                                                  {hasActiveSourceFilters
                                                                    ? `/${answer.matchingRequirementCount}`
                                                                    : ''}{' '}
                                                                  {
                                                                    requirementCountLabel
                                                                  }
                                                                </span>
                                                              </button>
                                                            ) : null}
                                                            {answer.matchingRequirementCount >
                                                              0 &&
                                                            hasVisibleSources ? (
                                                              <span
                                                                aria-hidden="true"
                                                                className="mx-0.5 h-5 w-px bg-secondary-200 dark:bg-secondary-700"
                                                                data-answer-source-separator="true"
                                                              />
                                                            ) : null}
                                                            {packageNames.map(
                                                              pkg => {
                                                                const filter: AnswerRequirementSourceFilter =
                                                                  {
                                                                    kind: 'package',
                                                                    sourceId:
                                                                      pkg.id,
                                                                  }
                                                                const active =
                                                                  isSourceFilterActive(
                                                                    filter,
                                                                  )
                                                                return (
                                                                  <button
                                                                    aria-label={`${copy.filterRequirementsByPackage} ${pkg.name}`}
                                                                    aria-pressed={
                                                                      active
                                                                    }
                                                                    className={`${answerSourcePillClassName} ${
                                                                      active
                                                                        ? 'border-primary-600 bg-primary-100 text-primary-950 shadow-sm ring-1 ring-primary-300 dark:border-primary-300 dark:bg-primary-900/70 dark:text-primary-50 dark:ring-primary-700/70'
                                                                        : 'border-secondary-200 bg-secondary-50 text-secondary-700 hover:border-secondary-300 hover:bg-secondary-100 dark:border-secondary-700 dark:bg-secondary-800 dark:text-secondary-200 dark:hover:border-secondary-500 dark:hover:bg-secondary-700'
                                                                    }`}
                                                                    key={pkg.id}
                                                                    onClick={() =>
                                                                      toggleSourceFilter(
                                                                        filter,
                                                                      )
                                                                    }
                                                                    type="button"
                                                                  >
                                                                    <span className="truncate">
                                                                      {pkg.name}
                                                                    </span>
                                                                  </button>
                                                                )
                                                              },
                                                            )}
                                                            {unresolvedPackageCount >
                                                            0 ? (
                                                              <span className="inline-flex min-h-7 items-center rounded-full border border-secondary-200 bg-secondary-50 px-2 py-0.5 text-secondary-700 dark:border-secondary-700 dark:bg-secondary-800 dark:text-secondary-200">
                                                                {copy.packages}:{' '}
                                                                {
                                                                  unresolvedPackageCount
                                                                }
                                                              </span>
                                                            ) : null}
                                                            {directRequirements.map(
                                                              requirement => {
                                                                const filter: AnswerRequirementSourceFilter =
                                                                  {
                                                                    kind: 'requirement',
                                                                    sourceId:
                                                                      requirement.id,
                                                                  }
                                                                const active =
                                                                  isSourceFilterActive(
                                                                    filter,
                                                                  )
                                                                return (
                                                                  <button
                                                                    aria-label={`${copy.filterRequirementsByRequirementId} ${requirement.uniqueId}`}
                                                                    aria-pressed={
                                                                      active
                                                                    }
                                                                    className={`${answerSourcePillClassName} font-mono ${
                                                                      active
                                                                        ? 'border-primary-700 bg-primary-100 text-primary-950 shadow-sm ring-1 ring-primary-300 dark:border-primary-300 dark:bg-primary-900/70 dark:text-primary-50 dark:ring-primary-700/70'
                                                                        : 'border-primary-200 bg-primary-50 text-primary-900 hover:border-primary-300 hover:bg-primary-100 dark:border-primary-900/60 dark:bg-primary-950/40 dark:text-primary-100 dark:hover:border-primary-700 dark:hover:bg-primary-900/60'
                                                                    }`}
                                                                    key={
                                                                      requirement.id
                                                                    }
                                                                    onClick={() =>
                                                                      toggleSourceFilter(
                                                                        filter,
                                                                      )
                                                                    }
                                                                    type="button"
                                                                  >
                                                                    {
                                                                      requirement.uniqueId
                                                                    }
                                                                  </button>
                                                                )
                                                              },
                                                            )}
                                                            {unresolvedRequirementCount >
                                                            0 ? (
                                                              <span className="inline-flex min-h-7 items-center rounded-full border border-primary-200 bg-primary-50 px-2 py-0.5 text-primary-900 dark:border-primary-900/60 dark:bg-primary-950/40 dark:text-primary-100">
                                                                {
                                                                  copy.requirementIds
                                                                }
                                                                :{' '}
                                                                {
                                                                  unresolvedRequirementCount
                                                                }
                                                              </span>
                                                            ) : null}
                                                          </fieldset>
                                                          {answerExpansion ? (
                                                            <ul
                                                              aria-label={
                                                                copy.requirementsInSelection
                                                              }
                                                              className="space-y-1 text-xs text-secondary-600 dark:text-secondary-300"
                                                            >
                                                              {filteredRequirements.map(
                                                                requirement => (
                                                                  <li
                                                                    className="rounded-md border border-secondary-200 bg-white px-2 py-2 dark:border-secondary-700 dark:bg-secondary-900/70"
                                                                    key={
                                                                      requirement.id
                                                                    }
                                                                  >
                                                                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                                                      <span className="font-mono font-semibold text-secondary-800 dark:text-secondary-100">
                                                                        {
                                                                          requirement.uniqueId
                                                                        }
                                                                      </span>
                                                                      {requirement.description ? (
                                                                        <span className="text-secondary-600 dark:text-secondary-300">
                                                                          {
                                                                            requirement.description
                                                                          }
                                                                        </span>
                                                                      ) : null}
                                                                    </div>
                                                                    <div className="mt-1 flex flex-wrap gap-1">
                                                                      {requirement.direct ? (
                                                                        <span className="inline-flex rounded-full border border-primary-200 bg-primary-50 px-2 py-0.5 text-[0.68rem] font-medium text-primary-900 dark:border-primary-900/60 dark:bg-primary-950/40 dark:text-primary-100">
                                                                          {
                                                                            copy.directRequirement
                                                                          }
                                                                        </span>
                                                                      ) : null}
                                                                      {requirement.sourcePackages.map(
                                                                        pkg => (
                                                                          <span
                                                                            className="inline-flex rounded-full border border-secondary-200 bg-white px-2 py-0.5 text-[0.68rem] font-medium text-secondary-700 dark:border-secondary-700 dark:bg-secondary-800 dark:text-secondary-200"
                                                                            key={
                                                                              pkg.id
                                                                            }
                                                                          >
                                                                            {
                                                                              pkg.name
                                                                            }
                                                                          </span>
                                                                        ),
                                                                      )}
                                                                    </div>
                                                                  </li>
                                                                ),
                                                              )}
                                                            </ul>
                                                          ) : null}
                                                        </div>
                                                      )
                                                    })()
                                                  : null}
                                                {answer.healthState ===
                                                  'missing_requirement_selection' && (
                                                  <span className="ml-2 inline-flex rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                                                    {
                                                      copy.missingRequirementSelection
                                                    }
                                                  </span>
                                                )}
                                              </div>
                                              <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
                                                <button
                                                  className="inline-flex min-h-11 min-w-11 items-center gap-1.5 rounded-lg border px-2 text-xs disabled:opacity-50"
                                                  disabled={submitting}
                                                  onClick={() =>
                                                    editAnswer(answer)
                                                  }
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
                                      )
                                    })}
                                  </ul>
                                )}
                                <div
                                  className={
                                    question.answers.length > 0
                                      ? 'mt-3'
                                      : 'mt-4'
                                  }
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
                                    <Plus
                                      aria-hidden="true"
                                      className="h-4 w-4"
                                    />
                                    {copy.addAnswer}
                                  </button>
                                </div>
                              </div>
                              {visibilityPanelQuestionId === question.id ? (
                                <aside
                                  aria-labelledby={`requirement-selection-visibility-title-${question.id}`}
                                  className="flex max-h-[calc(100vh-10rem)] min-h-0 flex-col rounded-xl border border-secondary-200 bg-white shadow-lg dark:border-secondary-800 dark:bg-secondary-950 xl:sticky xl:top-4"
                                >
                                  <div className="flex items-start justify-between gap-3 border-b border-secondary-200 px-4 py-3 dark:border-secondary-800">
                                    <div>
                                      <h2
                                        className="text-base font-semibold text-secondary-950 dark:text-secondary-50"
                                        id={`requirement-selection-visibility-title-${question.id}`}
                                      >
                                        {copy.visibilityPanelTitle}
                                      </h2>
                                      <p className="mt-1 text-sm text-secondary-500 dark:text-secondary-400">
                                        {copy.visibilityPanelDescription}
                                      </p>
                                    </div>
                                    <button
                                      aria-label={copy.cancel}
                                      className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border text-secondary-700 hover:bg-secondary-50 disabled:opacity-50 dark:border-secondary-700 dark:text-secondary-200 dark:hover:bg-secondary-900"
                                      disabled={submitting}
                                      onClick={closeVisibilityPanel}
                                      type="button"
                                    >
                                      <X
                                        aria-hidden="true"
                                        className="h-4 w-4"
                                      />
                                    </button>
                                  </div>
                                  <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
                                    {error ? (
                                      <p
                                        className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300"
                                        role="alert"
                                      >
                                        {error}
                                      </p>
                                    ) : null}
                                    {visibilityGroupsForm.length > 0 ? (
                                      <RequiredFieldsHint />
                                    ) : null}
                                    {visibilityGroupsForm.length === 0 ? (
                                      <div className="rounded-xl border border-secondary-200 bg-secondary-50 px-4 py-3 text-sm text-secondary-700 dark:border-secondary-800 dark:bg-secondary-900/50 dark:text-secondary-200">
                                        {copy.standaloneQuestionVisibility}
                                      </div>
                                    ) : null}
                                    {visibilityGroupsForm.map(
                                      (group, groupIndex) => (
                                        <section
                                          className="rounded-xl border border-secondary-200 bg-secondary-50/70 p-4 dark:border-secondary-800 dark:bg-secondary-900/40"
                                          key={group.key}
                                        >
                                          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                            <h3 className="text-sm font-semibold text-secondary-800 dark:text-secondary-100">
                                              {copy.conditionGroup}{' '}
                                              {groupIndex + 1}
                                            </h3>
                                            <button
                                              className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-red-200 px-2 text-xs text-red-700 disabled:opacity-50 dark:border-red-800 dark:text-red-300"
                                              disabled={submitting}
                                              onClick={() =>
                                                setVisibilityGroupsForm(
                                                  current =>
                                                    current.filter(
                                                      (_, index) =>
                                                        index !== groupIndex,
                                                    ),
                                                )
                                              }
                                              type="button"
                                            >
                                              <Trash2
                                                aria-hidden="true"
                                                className="h-3.5 w-3.5"
                                              />
                                              {copy.delete}
                                            </button>
                                          </div>
                                          <div className="space-y-4">
                                            {group.conditions.map(
                                              (condition, conditionIndex) => {
                                                const selectedParent =
                                                  questions.find(
                                                    item =>
                                                      String(item.id) ===
                                                      condition.parentQuestionId,
                                                  )
                                                const availableAnswers =
                                                  selectedParent?.answers ?? []
                                                const selectedAnswerRows =
                                                  availableAnswers.filter(
                                                    answer =>
                                                      condition.answerIds.includes(
                                                        String(answer.id),
                                                      ),
                                                  )
                                                const hasInactiveReference =
                                                  Boolean(
                                                    selectedParent &&
                                                      (!selectedParent.isActive ||
                                                        selectedParent.isArchived),
                                                  ) ||
                                                  selectedAnswerRows.some(
                                                    answer =>
                                                      !answer.isActive ||
                                                      answer.isArchived,
                                                  )
                                                const parentId = `visibility-parent-${groupIndex}-${conditionIndex}`
                                                const firstAnswerInputId = `visibility-answer-${groupIndex}-${conditionIndex}-${availableAnswers[0]?.id ?? 'none'}`

                                                return (
                                                  <div
                                                    className="rounded-lg border border-secondary-200 bg-white p-3 dark:border-secondary-700 dark:bg-secondary-950/40"
                                                    key={condition.key}
                                                  >
                                                    <div className="flex items-start justify-between gap-2">
                                                      <div className="min-w-0 flex-1">
                                                        <FieldLabelWithHelp
                                                          help={
                                                            copy.visibilityParentHelp
                                                          }
                                                          htmlFor={parentId}
                                                          label={
                                                            copy.parentQuestion
                                                          }
                                                          required
                                                        />
                                                        <select
                                                          className={
                                                            inputClassName
                                                          }
                                                          id={parentId}
                                                          onChange={event =>
                                                            setVisibilityGroupsForm(
                                                              current =>
                                                                current.map(
                                                                  (
                                                                    currentGroup,
                                                                    currentGroupIndex,
                                                                  ) =>
                                                                    currentGroupIndex !==
                                                                    groupIndex
                                                                      ? currentGroup
                                                                      : {
                                                                          ...currentGroup,
                                                                          conditions:
                                                                            currentGroup.conditions.map(
                                                                              (
                                                                                currentCondition,
                                                                                currentConditionIndex,
                                                                              ) =>
                                                                                currentConditionIndex !==
                                                                                conditionIndex
                                                                                  ? currentCondition
                                                                                  : {
                                                                                      ...currentCondition,
                                                                                      answerIds:
                                                                                        [],
                                                                                      parentQuestionId:
                                                                                        event
                                                                                          .target
                                                                                          .value,
                                                                                    },
                                                                            ),
                                                                        },
                                                                ),
                                                            )
                                                          }
                                                          value={
                                                            condition.parentQuestionId
                                                          }
                                                        >
                                                          <option value="">
                                                            -
                                                          </option>
                                                          {questions
                                                            .filter(
                                                              item =>
                                                                item.id !==
                                                                question.id,
                                                            )
                                                            .map(item => (
                                                              <option
                                                                key={item.id}
                                                                value={item.id}
                                                              >
                                                                {
                                                                  item.questionCode
                                                                }{' '}
                                                                ·{' '}
                                                                {item.areaName}{' '}
                                                                · {item.text}
                                                              </option>
                                                            ))}
                                                        </select>
                                                      </div>
                                                      {group.conditions.length >
                                                      1 ? (
                                                        <button
                                                          aria-label={
                                                            copy.delete
                                                          }
                                                          className="mt-7 inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-red-200 text-red-700 disabled:opacity-50 dark:border-red-800 dark:text-red-300"
                                                          disabled={submitting}
                                                          onClick={() =>
                                                            setVisibilityGroupsForm(
                                                              current =>
                                                                current.map(
                                                                  (
                                                                    currentGroup,
                                                                    currentGroupIndex,
                                                                  ) =>
                                                                    currentGroupIndex !==
                                                                    groupIndex
                                                                      ? currentGroup
                                                                      : {
                                                                          ...currentGroup,
                                                                          conditions:
                                                                            currentGroup.conditions.filter(
                                                                              (
                                                                                _,
                                                                                currentConditionIndex,
                                                                              ) =>
                                                                                currentConditionIndex !==
                                                                                conditionIndex,
                                                                            ),
                                                                        },
                                                                ),
                                                            )
                                                          }
                                                          type="button"
                                                        >
                                                          <Trash2
                                                            aria-hidden="true"
                                                            className="h-4 w-4"
                                                          />
                                                        </button>
                                                      ) : null}
                                                    </div>
                                                    {selectedParent ? (
                                                      <fieldset className="mt-3">
                                                        <FieldLabelWithHelp
                                                          help={
                                                            copy.visibilityAnswersHelp
                                                          }
                                                          htmlFor={
                                                            firstAnswerInputId
                                                          }
                                                          label={
                                                            copy.triggerAnswers
                                                          }
                                                          required
                                                        />
                                                        <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-secondary-200 bg-secondary-50/70 p-2 dark:border-secondary-700 dark:bg-secondary-900/50">
                                                          {availableAnswers.map(
                                                            answer => {
                                                              const answerId =
                                                                String(
                                                                  answer.id,
                                                                )
                                                              const inputId = `visibility-answer-${groupIndex}-${conditionIndex}-${answer.id}`
                                                              return (
                                                                <label
                                                                  className="flex min-h-10 items-start gap-2 rounded-md px-2 py-2 text-sm hover:bg-white dark:hover:bg-secondary-800"
                                                                  htmlFor={
                                                                    inputId
                                                                  }
                                                                  key={
                                                                    answer.id
                                                                  }
                                                                >
                                                                  <input
                                                                    checked={condition.answerIds.includes(
                                                                      answerId,
                                                                    )}
                                                                    className="mt-1 h-4 w-4 rounded border-secondary-300 text-primary-700 focus:ring-primary-400/50"
                                                                    id={inputId}
                                                                    onChange={event =>
                                                                      setVisibilityGroupsForm(
                                                                        current =>
                                                                          current.map(
                                                                            (
                                                                              currentGroup,
                                                                              currentGroupIndex,
                                                                            ) =>
                                                                              currentGroupIndex !==
                                                                              groupIndex
                                                                                ? currentGroup
                                                                                : {
                                                                                    ...currentGroup,
                                                                                    conditions:
                                                                                      currentGroup.conditions.map(
                                                                                        (
                                                                                          currentCondition,
                                                                                          currentConditionIndex,
                                                                                        ) =>
                                                                                          currentConditionIndex !==
                                                                                          conditionIndex
                                                                                            ? currentCondition
                                                                                            : {
                                                                                                ...currentCondition,
                                                                                                answerIds:
                                                                                                  event
                                                                                                    .target
                                                                                                    .checked
                                                                                                    ? [
                                                                                                        ...currentCondition.answerIds.filter(
                                                                                                          id =>
                                                                                                            id !==
                                                                                                            answerId,
                                                                                                        ),
                                                                                                        answerId,
                                                                                                      ]
                                                                                                    : currentCondition.answerIds.filter(
                                                                                                        id =>
                                                                                                          id !==
                                                                                                          answerId,
                                                                                                      ),
                                                                                              },
                                                                                      ),
                                                                                  },
                                                                          ),
                                                                      )
                                                                    }
                                                                    type="checkbox"
                                                                  />
                                                                  <span>
                                                                    <span className="block">
                                                                      {
                                                                        answer.text
                                                                      }
                                                                    </span>
                                                                    {(!answer.isActive ||
                                                                      answer.isArchived) && (
                                                                      <span className="mt-1 inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                                                                        <AlertTriangle
                                                                          aria-hidden="true"
                                                                          className="h-3 w-3"
                                                                        />
                                                                        {statusText(
                                                                          answer,
                                                                          copy,
                                                                        )}
                                                                      </span>
                                                                    )}
                                                                  </span>
                                                                </label>
                                                              )
                                                            },
                                                          )}
                                                        </div>
                                                      </fieldset>
                                                    ) : null}
                                                    {hasInactiveReference ? (
                                                      <p className="mt-3 inline-flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                                                        <AlertTriangle
                                                          aria-hidden="true"
                                                          className="mt-0.5 h-3.5 w-3.5 shrink-0"
                                                        />
                                                        <span>
                                                          {
                                                            copy.visibilityInactiveWarning
                                                          }
                                                        </span>
                                                      </p>
                                                    ) : null}
                                                  </div>
                                                )
                                              },
                                            )}
                                          </div>
                                          <button
                                            className="mt-3 inline-flex min-h-10 items-center gap-1 rounded-lg border px-3 text-sm disabled:opacity-50"
                                            disabled={submitting}
                                            onClick={() =>
                                              setVisibilityGroupsForm(current =>
                                                current.map(
                                                  (
                                                    currentGroup,
                                                    currentGroupIndex,
                                                  ) =>
                                                    currentGroupIndex !==
                                                    groupIndex
                                                      ? currentGroup
                                                      : {
                                                          ...currentGroup,
                                                          conditions: [
                                                            ...currentGroup.conditions,
                                                            createEmptyVisibilityConditionForm(),
                                                          ],
                                                        },
                                                ),
                                              )
                                            }
                                            type="button"
                                          >
                                            <Plus
                                              aria-hidden="true"
                                              className="h-4 w-4"
                                            />
                                            {copy.addVisibilityCondition}
                                          </button>
                                        </section>
                                      ),
                                    )}
                                    <button
                                      className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-sm disabled:opacity-50"
                                      disabled={submitting}
                                      onClick={() =>
                                        setVisibilityGroupsForm(current => [
                                          ...current,
                                          createEmptyVisibilityGroupForm(),
                                        ])
                                      }
                                      type="button"
                                    >
                                      <Plus
                                        aria-hidden="true"
                                        className="h-4 w-4"
                                      />
                                      {copy.addVisibilityGroup}
                                    </button>
                                  </div>
                                  <div className="flex justify-end gap-2 border-t border-secondary-200 px-4 py-3 dark:border-secondary-800">
                                    <button
                                      className="btn-secondary inline-flex items-center gap-1.5"
                                      disabled={submitting}
                                      onClick={closeVisibilityPanel}
                                      type="button"
                                    >
                                      {copy.cancel}
                                    </button>
                                    <button
                                      className="btn-primary inline-flex items-center gap-1.5"
                                      disabled={submitting}
                                      onClick={saveVisibilityGroups}
                                      type="button"
                                    >
                                      <Save
                                        aria-hidden="true"
                                        className="h-4 w-4"
                                      />
                                      {copy.saveVisibility}
                                    </button>
                                  </div>
                                </aside>
                              ) : null}
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
      </div>
    </div>
  )
}

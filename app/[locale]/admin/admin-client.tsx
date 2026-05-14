'use client'

import {
  Archive,
  ArrowDown,
  ArrowUp,
  BookOpen,
  Briefcase,
  Check,
  CheckCircle2,
  CircleAlert,
  CircleDot,
  CircleMinus,
  ClipboardCheck,
  ClipboardList,
  FileJson,
  FileText,
  FolderCog,
  FolderTree,
  Gauge,
  HelpCircle,
  Info,
  Languages,
  Layers,
  LayoutPanelTop,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  Theater,
  UserCog,
  Wrench,
  X,
  XCircle,
} from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import {
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import AnimatedHelpPanel from '@/components/AnimatedHelpPanel'
import { useAccessReviewExportDownload } from '@/components/access-review/useAccessReviewExportDownload'
import { useConfirmModal } from '@/components/ConfirmModal'
import { type HelpContent, useHelpContent } from '@/components/HelpPanel'
import { useDataSubjectExportDownload } from '@/components/privacy/useDataSubjectExportDownload'
import { Link, useRouter } from '@/i18n/routing'
import type {
  AccessReviewDecision,
  AccessReviewItem,
  AccessReviewRun,
  AccessReviewRunDetail,
} from '@/lib/access-review/types'
import { downloadBlob } from '@/lib/browser-download'
import { devMarker } from '@/lib/developer-mode-markers'
import { apiFetch } from '@/lib/http/api-fetch'
import { readResponseMessage } from '@/lib/http/response-message'
import { BUSINESS_TEXT_MAX_LENGTH } from '@/lib/http/validation-constants'
import { formatActorDisplayNameForLocale } from '@/lib/privacy/display-name'
import {
  getOrderedRequirementListColumns,
  getRequirementColumnDefinition,
  normalizeRequirementListColumnDefaults,
  type RequirementListColumnDefault,
} from '@/lib/requirements/list-view'
import {
  buildUiTerminologyPayload,
  getDefaultUiTerminology,
  UI_TERM_KEYS,
  type UiLocale,
  type UiTermTranslation,
} from '@/lib/ui-terminology'

const ADMIN_HELP: HelpContent = {
  sections: [
    {
      kind: 'text',
      bodyKey: 'admin.terminology.body',
      headingKey: 'admin.terminology.heading',
    },
    {
      kind: 'text',
      bodyKey: 'admin.columns.body',
      headingKey: 'admin.columns.heading',
    },
    {
      kind: 'text',
      bodyKey: 'admin.referenceData.body',
      headingKey: 'admin.referenceData.heading',
    },
    {
      kind: 'text',
      bodyKey: 'admin.privacy.body',
      headingKey: 'admin.privacy.heading',
    },
    {
      kind: 'text',
      bodyKey: 'admin.accessReview.body',
      headingKey: 'admin.accessReview.heading',
    },
    {
      kind: 'text',
      bodyKey: 'admin.archiving.body',
      headingKey: 'admin.archiving.heading',
    },
  ],
  titleKey: 'admin.title',
}

const ADMIN_PRIVACY_HELP: HelpContent = {
  sections: [
    {
      kind: 'text',
      bodyKey: 'adminPrivacy.overview.body',
      headingKey: 'adminPrivacy.overview.heading',
    },
    {
      kind: 'text',
      bodyKey: 'adminPrivacy.permissions.body',
      headingKey: 'adminPrivacy.permissions.heading',
    },
    {
      kind: 'text',
      bodyKey: 'adminPrivacy.search.body',
      headingKey: 'adminPrivacy.search.heading',
    },
    {
      kind: 'text',
      bodyKey: 'adminPrivacy.replacement.body',
      headingKey: 'adminPrivacy.replacement.heading',
    },
    {
      kind: 'text',
      bodyKey: 'adminPrivacy.preview.body',
      headingKey: 'adminPrivacy.preview.heading',
    },
    {
      kind: 'text',
      bodyKey: 'adminPrivacy.actions.body',
      headingKey: 'adminPrivacy.actions.heading',
    },
    {
      kind: 'text',
      bodyKey: 'adminPrivacy.execution.body',
      headingKey: 'adminPrivacy.execution.heading',
    },
    {
      kind: 'text',
      bodyKey: 'adminPrivacy.audit.body',
      headingKey: 'adminPrivacy.audit.heading',
    },
    {
      kind: 'text',
      bodyKey: 'adminPrivacy.caveats.body',
      headingKey: 'adminPrivacy.caveats.heading',
    },
  ],
  titleKey: 'adminPrivacy.title',
}

const ADMIN_ACCESS_REVIEW_HELP: HelpContent = {
  sections: [
    {
      kind: 'text',
      bodyKey: 'adminAccessReview.overview.body',
      headingKey: 'adminAccessReview.overview.heading',
    },
    {
      kind: 'text',
      bodyKey: 'adminAccessReview.scope.body',
      headingKey: 'adminAccessReview.scope.heading',
    },
    {
      kind: 'text',
      bodyKey: 'adminAccessReview.decisions.body',
      headingKey: 'adminAccessReview.decisions.heading',
    },
    {
      kind: 'text',
      bodyKey: 'adminAccessReview.evidence.body',
      headingKey: 'adminAccessReview.evidence.heading',
    },
  ],
  titleKey: 'adminAccessReview.title',
}

type AdminTab =
  | 'accessReview'
  | 'archiving'
  | 'columns'
  | 'privacy'
  | 'referenceData'
  | 'terminology'
type SaveState = 'error' | 'idle' | 'saved' | 'saving'
type AccessReviewSavingAction = 'cancel' | 'complete' | 'create' | 'decision'

const ADMIN_ROLE = 'Admin'
const PRIVACY_OFFICER_ROLE = 'PrivacyOfficer'

const adminTabs: { icon: typeof Languages; id: AdminTab }[] = [
  { icon: Languages, id: 'terminology' },
  { icon: LayoutPanelTop, id: 'columns' },
  { icon: FolderCog, id: 'referenceData' },
  { icon: ClipboardCheck, id: 'accessReview' },
  { icon: Archive, id: 'archiving' },
  { icon: ShieldCheck, id: 'privacy' },
]

const ADMIN_TAB_DEVELOPER_MODE_VALUES: Record<AdminTab, string> = {
  accessReview: 'access review',
  archiving: 'archiving',
  columns: 'columns',
  privacy: 'privacy',
  referenceData: 'reference data',
  terminology: 'terminology',
}

const ADMIN_TAB_QUERY_KEY = 'tab'
const DEFAULT_ADMIN_TAB: AdminTab = 'terminology'

function getAdminTabFromSearchParams(
  searchParams: URLSearchParams,
  options: { canUsePrivacy: boolean },
): AdminTab {
  const tab = searchParams.get(ADMIN_TAB_QUERY_KEY)

  if (!adminTabs.some(item => item.id === tab)) {
    return DEFAULT_ADMIN_TAB
  }

  if ((tab === 'privacy' || tab === 'archiving') && !options.canUsePrivacy) {
    return DEFAULT_ADMIN_TAB
  }

  return tab as AdminTab
}

function getAdminTabHref(tab: AdminTab, searchParams: URLSearchParams) {
  const query = Object.fromEntries(searchParams.entries())

  if (tab === DEFAULT_ADMIN_TAB) {
    delete query[ADMIN_TAB_QUERY_KEY]
  } else {
    query[ADMIN_TAB_QUERY_KEY] = tab
  }

  return Object.keys(query).length > 0
    ? { pathname: '/admin', query }
    : '/admin'
}

function createShippedTerminology() {
  return buildUiTerminologyPayload(getDefaultUiTerminology())
}

function createShippedColumnDefaults() {
  return normalizeRequirementListColumnDefaults(null)
}

type PrivacyAction = 'anonymize' | 'delete' | 'skip' | 'switch'
type ArchivingRetentionAction = 'delete'
type PrivacyHelpField =
  | 'replacementEmail'
  | 'replacementFirstName'
  | 'replacementHsaId'
  | 'replacementLastName'
  | 'replacementName'
  | 'targetHsaId'

interface PrivacyOccurrenceGroup {
  affectedReferences?: string[]
  allowedActions: PrivacyAction[]
  blockingReferences?: Array<{ objectKey: string; values: string[] }>
  controlledByGroupKey?: string | null
  count: number
  currentDisplayValue: string | null
  disabledReasonKey?: string | null
  fieldKey: string
  key: string
  objectKey: string
  readOnlyReasonKey?: string | null
  recommendedAction: PrivacyAction
  warningKey: string | null
}

interface PrivacyPreview {
  groups: PrivacyOccurrenceGroup[]
  previewToken: string
  targetFingerprint: string
  totalCount: number
}

interface ArchivingRetentionPolicy {
  action: ArchivingRetentionAction
  ageDays: number
  decisionReference: string | null
  id: number
  informationSet: string
  isEnabled: boolean
  lastRunAt: string | null
  latestRun: {
    archivedCount: number
    candidateCount: number
    completedAt: string
    deletedCount: number
    exceptionCount: number
    id: number
    skippedCount: number
  } | null
  policyKey: string
  statusCondition: string
}

interface ArchivingRetentionCandidate {
  action: ArchivingRetentionAction
  ageBasis: string
  blockedReasonKey: string | null
  currentDisplayValue: string | null
  fieldKey: string
  key: string
  objectKey: string
  reference: string
  requiresExport: boolean
  sourceKey: string
  subjectId: string
  subjectTable: string
}

interface ArchivingRetentionPreview {
  candidates: ArchivingRetentionCandidate[]
  cutoff: string
  policy: ArchivingRetentionPolicy
  previewToken: string
  summary: {
    archiveCount: number
    candidateCount: number
    deleteCount: number
    exceptionCount: number
    skippedCount: number
  }
}

interface ArchivingRetentionExportResponse {
  archive: Record<string, unknown>
  exportToken: string
}

type PrivacyExecutionRowStatus =
  | {
      action: PrivacyAction
      kind: 'completed' | 'skipped'
    }
  | {
      kind: 'failed'
      reason: string | null
    }

type PrivacyExecutionStatuses = Record<string, PrivacyExecutionRowStatus>

const PRIVACY_ACTIONS: PrivacyAction[] = [
  'switch',
  'anonymize',
  'delete',
  'skip',
]

function availablePrivacyActions(
  group: PrivacyOccurrenceGroup,
  options: { canSwitch: boolean },
): PrivacyAction[] {
  const available = options.canSwitch
    ? group.allowedActions
    : group.allowedActions.filter(action => action !== 'switch')
  return available.length > 0 ? available : ['skip']
}

function effectivePrivacyAction(
  group: PrivacyOccurrenceGroup,
  actions: Record<string, PrivacyAction>,
  options: { canSwitch: boolean } = { canSwitch: true },
): PrivacyAction {
  const availableActions = availablePrivacyActions(group, options)

  if (group.controlledByGroupKey) {
    const controllerAction = actions[group.controlledByGroupKey]
    return controllerAction === 'switch' && availableActions.includes('switch')
      ? 'switch'
      : 'skip'
  }

  const requested = actions[group.key] ?? group.recommendedAction
  if (availableActions.includes(requested)) return requested
  if (availableActions.includes(group.recommendedAction)) {
    return group.recommendedAction
  }
  return availableActions[0] ?? 'skip'
}

function executionStatusForAction(
  action: PrivacyAction,
): PrivacyExecutionRowStatus {
  return action === 'skip'
    ? { action, kind: 'skipped' }
    : { action, kind: 'completed' }
}

const ACCESS_REVIEW_DECISIONS: Exclude<AccessReviewDecision, 'pending'>[] = [
  'approved',
  'revoke_required',
  'changed',
  'not_applicable',
]

function accessReviewDecisionClass(decision: AccessReviewDecision): string {
  if (decision === 'approved') {
    return 'bg-emerald-50 text-emerald-800 dark:bg-transparent dark:text-emerald-300'
  }
  if (decision === 'revoke_required') {
    return 'bg-red-50 text-red-800 dark:bg-transparent dark:text-red-300'
  }
  if (decision === 'changed') {
    return 'bg-amber-50 text-amber-800 dark:bg-transparent dark:text-amber-300'
  }
  if (decision === 'not_applicable') {
    return 'bg-secondary-100 text-secondary-700 dark:bg-transparent dark:text-secondary-200'
  }
  if (decision === 'pending') {
    return 'bg-red-50 text-red-800 dark:bg-transparent dark:text-red-300'
  }
  return 'bg-primary-50 text-primary-800 dark:bg-transparent dark:text-primary-300'
}

function accessReviewRunStatusClass(status: AccessReviewRun['status']): string {
  if (status === 'cancelled') {
    return 'text-xs font-semibold text-red-700 dark:text-red-300'
  }
  if (status === 'completed') {
    return 'rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800 dark:bg-transparent dark:text-emerald-200'
  }
  if (status === 'draft') {
    return 'rounded-full bg-secondary-100 px-2 py-1 text-xs font-medium text-secondary-700 dark:bg-transparent dark:text-secondary-200'
  }
  return 'rounded-full bg-primary-50 px-2 py-1 text-xs font-medium text-primary-800 dark:bg-transparent dark:text-primary-200'
}

function preserveAccessReviewItemOrder(
  previousItems: AccessReviewItem[],
  nextItems: AccessReviewItem[],
): AccessReviewItem[] {
  const nextById = new Map(nextItems.map(item => [item.id, item]))
  const orderedItems = previousItems
    .map(item => nextById.get(item.id))
    .filter((item): item is AccessReviewItem => Boolean(item))
  const orderedIds = new Set(orderedItems.map(item => item.id))
  return [
    ...orderedItems,
    ...nextItems.filter(item => !orderedIds.has(item.id)),
  ]
}

function PrivacyErasurePanel() {
  const ta = useTranslations('admin')
  const tc = useTranslations('common')
  const locale = useLocale()
  const { confirm } = useConfirmModal()
  const [targetHsaId, setTargetHsaId] = useState('')
  const [replacementHsaId, setReplacementHsaId] = useState('')
  const [replacementName, setReplacementName] = useState('')
  const [replacementFirstName, setReplacementFirstName] = useState('')
  const [replacementLastName, setReplacementLastName] = useState('')
  const [replacementEmail, setReplacementEmail] = useState('')
  const [preview, setPreview] = useState<PrivacyPreview | null>(null)
  const [actions, setActions] = useState<Record<string, PrivacyAction>>({})
  const [executionStatuses, setExecutionStatuses] =
    useState<PrivacyExecutionStatuses | null>(null)
  const [openHelp, setOpenHelp] = useState<Set<PrivacyHelpField>>(
    () => new Set(),
  )
  const [status, setStatus] = useState<SaveState>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [messageScope, setMessageScope] = useState<'execute' | 'preview'>(
    'preview',
  )
  const dataSubjectExport = useDataSubjectExportDownload({
    locale,
    targetHsaId: preview ? targetHsaId.trim() : undefined,
  })

  const replacement =
    replacementHsaId.trim() ||
    replacementName.trim() ||
    replacementFirstName.trim() ||
    replacementLastName.trim() ||
    replacementEmail.trim()
      ? {
          displayName: replacementName.trim(),
          email: replacementEmail.trim() || undefined,
          firstName: replacementFirstName.trim() || undefined,
          hsaId: replacementHsaId.trim(),
          lastName: replacementLastName.trim() || undefined,
        }
      : null
  const canUseSwitchAction = Boolean(
    replacementHsaId.trim() && replacementName.trim(),
  )

  const previewPayload = () => ({
    replacement,
    target: {
      hsaId: targetHsaId.trim(),
    },
  })

  const toggleHelp = (field: PrivacyHelpField) => {
    setOpenHelp(current => {
      const next = new Set(current)
      if (next.has(field)) {
        next.delete(field)
      } else {
        next.add(field)
      }
      return next
    })
  }

  const helpButton = (field: PrivacyHelpField, label: string) => (
    <button
      aria-controls={`privacy-help-${field}`}
      aria-expanded={openHelp.has(field)}
      aria-label={`${tc('help')}: ${label}`}
      className="inline-flex min-h-11 min-w-11 items-center justify-center text-secondary-400 transition-colors hover:text-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:hover:text-primary-400"
      onClick={() => toggleHelp(field)}
      type="button"
    >
      <HelpCircle aria-hidden="true" className="h-3.5 w-3.5" />
    </button>
  )

  const helpPanel = (field: PrivacyHelpField) => (
    <AnimatedHelpPanel
      id={`privacy-help-${field}`}
      isOpen={openHelp.has(field)}
    >
      {ta(`privacy.fieldHelp.${field}` as Parameters<typeof ta>[0])}
    </AnimatedHelpPanel>
  )

  const resetExecutionFeedback = () => {
    setExecutionStatuses(null)
    setStatus(current => (current === 'saved' ? 'idle' : current))
    setMessage(null)
    setMessageScope('preview')
  }

  type PrivacyErrorBody = {
    debugMessage?: string
    details?: { groupKey?: string; reason?: string }
    error?: string
    issues?: Array<{ path?: string }>
  }

  const visibleErrorDetail = (
    body: PrivacyErrorBody | null,
    options: { includePublicError: boolean },
  ) => {
    const debugMessage =
      typeof body?.debugMessage === 'string' ? body.debugMessage.trim() : ''
    if (debugMessage) return debugMessage

    if (!options.includePublicError) return null
    const publicError = typeof body?.error === 'string' ? body.error.trim() : ''
    return publicError || null
  }

  const privacyErrorMessage = (
    response: Response,
    body: PrivacyErrorBody | null,
    copy: { fallback: string; serverFallback: string },
  ) => {
    if (response.status === 403) {
      return ta('privacy.permissionError')
    }
    if (response.status >= 500) {
      const detail = visibleErrorDetail(body, { includePublicError: false })
      return detail
        ? ta('privacy.serverErrorWithDetail', {
            detail,
            message: copy.serverFallback,
          })
        : copy.serverFallback
    }

    const issuePaths = body?.issues?.map(issue => issue.path ?? '') ?? []

    if (issuePaths.includes('replacement.displayName')) {
      return ta('privacy.replacementIncomplete')
    }
    if (issuePaths.includes('replacement.email')) {
      return ta('privacy.invalidReplacementEmail')
    }
    if (
      issuePaths.includes('target.hsaId') ||
      issuePaths.includes('replacement.hsaId')
    ) {
      return ta('privacy.invalidHsaId')
    }

    const detail = visibleErrorDetail(body, { includePublicError: true })
    return detail
      ? ta('privacy.errorWithDetail', {
          detail,
          message: copy.fallback,
        })
      : copy.fallback
  }

  const readPrivacyError = async (
    response: Response,
    copy: { fallback: string; serverFallback: string },
  ) => {
    const body = (await response
      .json()
      .catch(() => null)) as PrivacyErrorBody | null
    return {
      body,
      message: privacyErrorMessage(response, body, copy),
    }
  }

  const runPreview = async () => {
    setStatus('saving')
    setMessage(null)
    setMessageScope('preview')
    setExecutionStatuses(null)
    try {
      const response = await apiFetch('/api/privacy/erasure-preview', {
        body: JSON.stringify(previewPayload()),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      if (!response.ok) {
        setStatus('error')
        const error = await readPrivacyError(response, {
          fallback: ta('privacy.previewError'),
          serverFallback: ta('privacy.serverPreviewError'),
        })
        setMessage(error.message)
        return
      }
      const data = (await response.json()) as PrivacyPreview
      setPreview(data)
      setActions(
        Object.fromEntries(
          data.groups.map(group => [group.key, group.recommendedAction]),
        ),
      )
      setStatus('idle')
    } catch {
      setStatus('error')
      setMessage(ta('privacy.previewError'))
    }
  }

  const executeErasure = async () => {
    if (!preview) return
    const effectiveActions = Object.fromEntries(
      preview.groups.map(group => [
        group.key,
        effectivePrivacyAction(group, actions, {
          canSwitch: canUseSwitchAction,
        }),
      ]),
    ) as Record<string, PrivacyAction>
    const actionSummary = preview.groups.reduce(
      (summary, group) => {
        summary[effectiveActions[group.key]] += group.count
        return summary
      },
      { anonymize: 0, delete: 0, skip: 0, switch: 0 },
    )
    const confirmed = await confirm({
      confirmText: ta('privacy.execute'),
      icon: 'caution',
      message: ta('privacy.confirmMessage', actionSummary),
      title: ta('privacy.confirmTitle'),
      variant: 'danger',
    })
    if (!confirmed) return

    setStatus('saving')
    setMessage(null)
    setMessageScope('execute')
    try {
      const response = await apiFetch('/api/privacy/erasure-requests', {
        body: JSON.stringify({
          ...previewPayload(),
          actions: effectiveActions,
          previewToken: preview.previewToken,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      if (!response.ok) {
        const error = await readPrivacyError(response, {
          fallback: ta('privacy.executeError'),
          serverFallback: ta('privacy.serverExecuteError'),
        })
        const groupKey =
          response.status === 409 ? undefined : error.body?.details?.groupKey
        setStatus('error')
        setExecutionStatuses(
          groupKey && preview.groups.some(group => group.key === groupKey)
            ? {
                [groupKey]: {
                  kind: 'failed',
                  reason: error.body?.details?.reason ?? null,
                },
              }
            : null,
        )
        setMessage(
          response.status === 409 ? ta('privacy.stalePreview') : error.message,
        )
        return
      }
      setExecutionStatuses(
        Object.fromEntries(
          preview.groups.map(group => [
            group.key,
            executionStatusForAction(effectiveActions[group.key]),
          ]),
        ),
      )
      setStatus('saved')
      setMessageScope('preview')
      setMessage(ta('privacy.executeSuccess'))
    } catch {
      setStatus('error')
      setMessageScope('execute')
      setMessage(ta('privacy.executeError'))
    }
  }

  const hasSuccessfulExecution =
    preview && preview.groups.length > 0 && executionStatuses
      ? preview.groups.every(group => {
          const rowStatus = executionStatuses[group.key]
          return (
            rowStatus?.kind === 'completed' || rowStatus?.kind === 'skipped'
          )
        })
      : false

  return (
    <section
      aria-labelledby="privacy-tab"
      className="rounded-[2rem] border border-secondary-200/70 bg-white/90 p-6 shadow-sm dark:border-secondary-700/60 dark:bg-secondary-900/80"
      {...devMarker({
        context: 'admin center',
        name: 'tab panel',
        priority: 340,
        value: 'privacy',
      })}
      id="privacy-panel"
      role="tabpanel"
    >
      <div className="border-b border-secondary-200/70 pb-5 dark:border-secondary-700/60">
        <h2 className="text-xl font-semibold text-secondary-950 dark:text-secondary-50">
          {ta('privacy.title')}
        </h2>
        <p className="mt-1 text-sm text-secondary-600 dark:text-secondary-300">
          {ta('privacyDescription')}
        </p>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="block max-w-md space-y-1">
            <div className="flex items-center gap-1.5">
              <label
                className="text-sm font-medium text-secondary-700 dark:text-secondary-200"
                htmlFor="privacy-target-hsa-id"
              >
                {ta('privacy.targetHsaId')}
              </label>
              {helpButton('targetHsaId', ta('privacy.targetHsaId'))}
            </div>
            {helpPanel('targetHsaId')}
            <input
              className="w-full rounded-xl border border-secondary-200 bg-white px-3 py-2.5 font-mono text-sm dark:border-secondary-700 dark:bg-secondary-900"
              id="privacy-target-hsa-id"
              onChange={event => {
                resetExecutionFeedback()
                setTargetHsaId(event.target.value)
                setPreview(null)
                setActions({})
              }}
              required
              value={targetHsaId}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <label
                  className="text-sm font-medium text-secondary-700 dark:text-secondary-200"
                  htmlFor="privacy-replacement-hsa-id"
                >
                  {ta('privacy.replacementHsaId')}
                </label>
                {helpButton('replacementHsaId', ta('privacy.replacementHsaId'))}
              </div>
              {helpPanel('replacementHsaId')}
              <input
                className="w-full rounded-xl border border-secondary-200 bg-white px-3 py-2.5 font-mono text-sm dark:border-secondary-700 dark:bg-secondary-900"
                id="privacy-replacement-hsa-id"
                onChange={event => {
                  resetExecutionFeedback()
                  setReplacementHsaId(event.target.value)
                }}
                value={replacementHsaId}
              />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <label
                  className="text-sm font-medium text-secondary-700 dark:text-secondary-200"
                  htmlFor="privacy-replacement-name"
                >
                  {ta('privacy.replacementName')}
                </label>
                {helpButton('replacementName', ta('privacy.replacementName'))}
              </div>
              {helpPanel('replacementName')}
              <input
                className="w-full rounded-xl border border-secondary-200 bg-white px-3 py-2.5 text-sm dark:border-secondary-700 dark:bg-secondary-900"
                id="privacy-replacement-name"
                onChange={event => {
                  resetExecutionFeedback()
                  setReplacementName(event.target.value)
                }}
                value={replacementName}
              />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <label
                  className="text-sm font-medium text-secondary-700 dark:text-secondary-200"
                  htmlFor="privacy-replacement-first-name"
                >
                  {ta('privacy.replacementFirstName')}
                </label>
                {helpButton(
                  'replacementFirstName',
                  ta('privacy.replacementFirstName'),
                )}
              </div>
              {helpPanel('replacementFirstName')}
              <input
                className="w-full rounded-xl border border-secondary-200 bg-white px-3 py-2.5 text-sm dark:border-secondary-700 dark:bg-secondary-900"
                id="privacy-replacement-first-name"
                onChange={event => {
                  resetExecutionFeedback()
                  setReplacementFirstName(event.target.value)
                }}
                value={replacementFirstName}
              />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <label
                  className="text-sm font-medium text-secondary-700 dark:text-secondary-200"
                  htmlFor="privacy-replacement-last-name"
                >
                  {ta('privacy.replacementLastName')}
                </label>
                {helpButton(
                  'replacementLastName',
                  ta('privacy.replacementLastName'),
                )}
              </div>
              {helpPanel('replacementLastName')}
              <input
                className="w-full rounded-xl border border-secondary-200 bg-white px-3 py-2.5 text-sm dark:border-secondary-700 dark:bg-secondary-900"
                id="privacy-replacement-last-name"
                onChange={event => {
                  resetExecutionFeedback()
                  setReplacementLastName(event.target.value)
                }}
                value={replacementLastName}
              />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <label
                  className="text-sm font-medium text-secondary-700 dark:text-secondary-200"
                  htmlFor="privacy-replacement-email"
                >
                  {ta('privacy.replacementEmail')}
                </label>
                <span
                  aria-label={ta('privacy.replacementEmailOptional')}
                  className="inline-flex text-secondary-400 dark:text-secondary-500"
                  role="img"
                  title={ta('privacy.replacementEmailOptional')}
                >
                  <Info aria-hidden="true" className="h-3.5 w-3.5" />
                </span>
                {helpButton('replacementEmail', ta('privacy.replacementEmail'))}
              </div>
              {helpPanel('replacementEmail')}
              <input
                className="w-full rounded-xl border border-secondary-200 bg-white px-3 py-2.5 text-sm dark:border-secondary-700 dark:bg-secondary-900"
                id="privacy-replacement-email"
                onChange={event => {
                  resetExecutionFeedback()
                  setReplacementEmail(event.target.value)
                }}
                type="email"
                value={replacementEmail}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-secondary-200 px-4 py-2 text-sm font-medium text-secondary-700 transition-colors hover:bg-secondary-100 disabled:opacity-60 dark:border-secondary-700 dark:text-secondary-200 dark:hover:bg-secondary-800"
              disabled={status === 'saving' || !targetHsaId.trim()}
              onClick={runPreview}
              type="button"
            >
              <RefreshCw aria-hidden="true" className="h-4 w-4" />
              {ta('privacy.preview')}
            </button>
            {message && messageScope === 'preview' ? (
              <span
                className={`text-sm font-medium ${
                  status === 'error'
                    ? 'text-red-700 dark:text-red-400'
                    : 'text-emerald-700 dark:text-emerald-300'
                }`}
                role={status === 'error' ? 'alert' : 'status'}
              >
                {message}
              </span>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl border border-secondary-200/70 bg-secondary-50/70 p-4 dark:border-secondary-700/60 dark:bg-secondary-950/40">
          <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-secondary-700 dark:text-secondary-200">
            {ta('privacy.guidanceTitle')}
          </h3>
          <p className="mt-3 text-sm text-secondary-600 dark:text-secondary-300">
            {ta('privacy.guidanceBody')}
          </p>
        </div>
      </div>

      {preview ? (
        <div className="mt-6 overflow-hidden rounded-2xl border border-secondary-200/70 dark:border-secondary-700/60">
          <div className="flex flex-col gap-2 border-b border-secondary-200/70 bg-secondary-50 px-4 py-3 dark:border-secondary-700/60 dark:bg-secondary-950/40 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-secondary-900 dark:text-secondary-100">
                {ta('privacy.previewResult', { count: preview.totalCount })}
              </div>
              <div className="font-mono text-xs text-secondary-500 dark:text-secondary-400">
                {preview.targetFingerprint.slice(0, 16)}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-secondary-200 bg-white px-4 py-2 text-sm font-medium text-secondary-700 transition-colors hover:bg-secondary-100 disabled:opacity-60 dark:border-secondary-700 dark:bg-secondary-900 dark:text-secondary-200 dark:hover:bg-secondary-800"
                disabled={
                  status === 'saving' || dataSubjectExport.downloading !== null
                }
                onClick={() =>
                  void dataSubjectExport.download({ delivery: 'json' })
                }
                type="button"
              >
                <FileJson aria-hidden="true" className="h-4 w-4" />
                {dataSubjectExport.downloading === 'json'
                  ? ta('privacy.exportingJson')
                  : ta('privacy.exportJson')}
              </button>
              <button
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-secondary-200 bg-white px-4 py-2 text-sm font-medium text-secondary-700 transition-colors hover:bg-secondary-100 disabled:opacity-60 dark:border-secondary-700 dark:bg-secondary-900 dark:text-secondary-200 dark:hover:bg-secondary-800"
                disabled={
                  status === 'saving' || dataSubjectExport.downloading !== null
                }
                onClick={() =>
                  void dataSubjectExport.download({ delivery: 'pdf' })
                }
                type="button"
              >
                <FileText aria-hidden="true" className="h-4 w-4" />
                {dataSubjectExport.downloading === 'pdf'
                  ? ta('privacy.exportingPdf')
                  : ta('privacy.exportPdf')}
              </button>
              {dataSubjectExport.error ? (
                <span
                  className="text-sm font-medium text-red-700 dark:text-red-300"
                  role="alert"
                >
                  {ta('privacy.exportError', {
                    detail: dataSubjectExport.error,
                  })}
                </span>
              ) : null}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-secondary-200 text-sm dark:divide-secondary-700">
              <thead className="bg-white dark:bg-secondary-900">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">
                    {ta('privacy.object')}
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">
                    {ta('privacy.count')}
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">
                    {ta('privacy.affected')}
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">
                    {ta('privacy.currentValue')}
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">
                    {ta('privacy.action')}
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">
                    {ta(
                      executionStatuses ? 'privacy.status' : 'privacy.warning',
                    )}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-secondary-200 bg-white dark:divide-secondary-700 dark:bg-secondary-900">
                {preview.groups.map(group => {
                  const isReadOnly = Boolean(group.readOnlyReasonKey)
                  const isDisabled = Boolean(group.disabledReasonKey)
                  const actionValue = effectivePrivacyAction(group, actions, {
                    canSwitch: canUseSwitchAction,
                  })
                  const availableActions = availablePrivacyActions(group, {
                    canSwitch: canUseSwitchAction,
                  })
                  const rowExecutionStatus = executionStatuses?.[group.key]
                  const currentDisplayValue = formatActorDisplayNameForLocale(
                    group.currentDisplayValue,
                    locale,
                  )
                  return (
                    <tr
                      aria-disabled={isDisabled || isReadOnly || undefined}
                      className={
                        rowExecutionStatus?.kind === 'completed'
                          ? 'bg-emerald-50/70 dark:bg-emerald-950/20'
                          : rowExecutionStatus?.kind === 'skipped'
                            ? 'bg-secondary-50/80 dark:bg-secondary-950/30'
                            : rowExecutionStatus?.kind === 'failed'
                              ? 'bg-red-50/70 dark:bg-red-950/25'
                              : isDisabled
                                ? 'bg-red-50/60 dark:bg-red-950/20'
                                : isReadOnly
                                  ? 'bg-secondary-50/70 dark:bg-secondary-950/30'
                                  : undefined
                      }
                      key={group.key}
                    >
                      <td className="px-4 py-3">
                        <div
                          className={
                            isDisabled || isReadOnly
                              ? 'font-medium text-secondary-500 dark:text-secondary-400'
                              : 'font-medium text-secondary-900 dark:text-secondary-100'
                          }
                        >
                          {ta(`privacy.objects.${group.objectKey}`)}
                        </div>
                        <div className="text-xs text-secondary-500 dark:text-secondary-400">
                          {ta(`privacy.fields.${group.fieldKey}`)}
                        </div>
                      </td>
                      <td className="px-4 py-3">{group.count}</td>
                      <td className="max-w-xs px-4 py-3">
                        {group.affectedReferences?.length ? (
                          <ul className="list-disc space-y-1 pl-4 text-secondary-700 dark:text-secondary-200">
                            {group.affectedReferences.map(reference => (
                              <li key={`${group.key}-${reference}`}>
                                {reference}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-secondary-500 dark:text-secondary-400">
                            {ta('privacy.notAvailable')}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {currentDisplayValue ?? ta('privacy.notAvailable')}
                      </td>
                      <td className="px-4 py-3">
                        {isReadOnly ? (
                          <span className="inline-flex min-h-[40px] items-center rounded-lg border border-secondary-200 bg-secondary-100 px-3 py-2 text-secondary-500 dark:border-secondary-700 dark:bg-secondary-800 dark:text-secondary-400">
                            {ta(`privacy.actions.${actionValue}`)}
                          </span>
                        ) : (
                          <select
                            className="min-h-[40px] rounded-lg border border-secondary-200 bg-white px-3 py-2 disabled:cursor-not-allowed disabled:bg-secondary-100 disabled:text-secondary-500 dark:border-secondary-700 dark:bg-secondary-950 dark:disabled:bg-secondary-800 dark:disabled:text-secondary-400"
                            disabled={
                              isDisabled ||
                              status === 'saving' ||
                              hasSuccessfulExecution
                            }
                            onChange={event => {
                              resetExecutionFeedback()
                              const nextAction = event.target
                                .value as PrivacyAction
                              setActions(current => ({
                                ...current,
                                [group.key]: nextAction,
                                ...Object.fromEntries(
                                  preview.groups
                                    .filter(
                                      candidate =>
                                        candidate.controlledByGroupKey ===
                                        group.key,
                                    )
                                    .map(candidate => [
                                      candidate.key,
                                      nextAction === 'switch' &&
                                      availablePrivacyActions(candidate, {
                                        canSwitch: canUseSwitchAction,
                                      }).includes('switch')
                                        ? 'switch'
                                        : 'skip',
                                    ]),
                                ),
                              }))
                            }}
                            value={actionValue}
                          >
                            {PRIVACY_ACTIONS.filter(action =>
                              availableActions.includes(action),
                            ).map(action => (
                              <option key={action} value={action}>
                                {ta(`privacy.actions.${action}`)}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="max-w-sm px-4 py-3">
                        {rowExecutionStatus?.kind === 'completed' ? (
                          <span className="inline-flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-300">
                            <CheckCircle2
                              aria-hidden="true"
                              className="h-4 w-4"
                            />
                            {ta('privacy.executionStatus.completed')}
                          </span>
                        ) : rowExecutionStatus?.kind === 'skipped' ? (
                          <span className="inline-flex items-center gap-2 font-medium text-secondary-600 dark:text-secondary-300">
                            <CircleMinus
                              aria-hidden="true"
                              className="h-4 w-4"
                            />
                            {ta('privacy.executionStatus.skipped')}
                          </span>
                        ) : rowExecutionStatus?.kind === 'failed' ? (
                          <span
                            className="inline-flex items-center gap-2 font-medium text-red-700 dark:text-red-300"
                            role="alert"
                          >
                            <XCircle aria-hidden="true" className="h-4 w-4" />
                            {ta('privacy.executionStatus.failed', {
                              reason: rowExecutionStatus.reason
                                ? ta(
                                    `privacy.executionErrors.${rowExecutionStatus.reason}`,
                                  )
                                : ta('privacy.executeError'),
                            })}
                          </span>
                        ) : group.disabledReasonKey ? (
                          <div
                            className="font-medium text-red-700 dark:text-red-300"
                            role="alert"
                          >
                            <div>
                              {ta(
                                `privacy.blockers.${group.disabledReasonKey}`,
                              )}
                            </div>
                          </div>
                        ) : group.readOnlyReasonKey ? (
                          <span className="text-secondary-500 dark:text-secondary-400">
                            {ta(`privacy.readOnly.${group.readOnlyReasonKey}`)}
                          </span>
                        ) : (
                          <span className="text-secondary-600 dark:text-secondary-300">
                            {group.warningKey
                              ? ta(`privacy.warnings.${group.warningKey}`)
                              : ''}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {preview.totalCount > 0 && !hasSuccessfulExecution ? (
            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-secondary-200/70 bg-white px-4 py-4 dark:border-secondary-700/60 dark:bg-secondary-900">
              <button
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-red-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-800 disabled:opacity-60"
                disabled={status === 'saving'}
                onClick={executeErasure}
                type="button"
              >
                <ShieldCheck aria-hidden="true" className="h-4 w-4" />
                {ta('privacy.execute')}
              </button>
              {message && messageScope === 'execute' ? (
                <span
                  className={`max-w-2xl text-sm font-medium ${
                    status === 'error'
                      ? 'text-red-700 dark:text-red-400'
                      : 'text-emerald-700 dark:text-emerald-300'
                  }`}
                  role={status === 'error' ? 'alert' : 'status'}
                >
                  {message}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function archivingRetentionExportFilename(
  preview: ArchivingRetentionPreview,
): string {
  const date = new Date().toISOString().slice(0, 10)
  const policyKey = preview.policy.policyKey
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  return `arkivering-${policyKey || 'retention'}-${date}.json`
}

function ArchivingPanel() {
  const ta = useTranslations('admin')
  const locale = useLocale()
  const { confirm } = useConfirmModal()
  const [retentionPolicies, setRetentionPolicies] = useState<
    ArchivingRetentionPolicy[]
  >([])
  const [selectedRetentionPolicyId, setSelectedRetentionPolicyId] = useState<
    number | null
  >(null)
  const [retentionPreview, setRetentionPreview] =
    useState<ArchivingRetentionPreview | null>(null)
  const [retentionExportToken, setRetentionExportToken] = useState<
    string | null
  >(null)
  const [retentionStatus, setRetentionStatus] = useState<SaveState>('idle')
  const [retentionMessage, setRetentionMessage] = useState<string | null>(null)
  const selectedRetentionPolicy =
    retentionPolicies.find(policy => policy.id === selectedRetentionPolicyId) ??
    null

  const loadRetentionPolicies = useCallback(async () => {
    try {
      const response = await apiFetch('/api/admin/archiving/policies')
      if (!response.ok) {
        setRetentionStatus('error')
        setRetentionMessage(
          (await readResponseMessage(response)) ??
            ta('archiving.retention.loadError'),
        )
        return
      }
      const body = (await response.json()) as {
        policies?: ArchivingRetentionPolicy[]
      }
      const policies = body.policies ?? []
      setRetentionPolicies(current =>
        current.length === 0 && policies.length === 0 ? current : policies,
      )
      setSelectedRetentionPolicyId(
        current => current ?? policies[0]?.id ?? null,
      )
      setRetentionStatus('idle')
    } catch {
      setRetentionStatus('error')
      setRetentionMessage(ta('archiving.retention.loadError'))
    }
  }, [ta])

  useEffect(() => {
    void loadRetentionPolicies()
  }, [loadRetentionPolicies])

  const runRetentionPreview = async (policyId = selectedRetentionPolicyId) => {
    if (!policyId) return
    setRetentionStatus('saving')
    setRetentionMessage(null)
    try {
      const response = await apiFetch('/api/admin/archiving/preview', {
        body: JSON.stringify({ policyId }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      if (!response.ok) {
        setRetentionStatus('error')
        setRetentionPreview(null)
        setRetentionExportToken(null)
        setRetentionMessage(
          (await readResponseMessage(response)) ??
            ta('archiving.retention.previewError'),
        )
        return
      }
      const data = (await response.json()) as ArchivingRetentionPreview
      setRetentionPreview(data)
      setRetentionExportToken(null)
      setRetentionStatus('idle')
    } catch {
      setRetentionStatus('error')
      setRetentionPreview(null)
      setRetentionExportToken(null)
      setRetentionMessage(ta('archiving.retention.previewError'))
    }
  }

  const createRetentionException = async (
    candidate: ArchivingRetentionCandidate,
  ) => {
    if (!retentionPreview) return
    setRetentionStatus('saving')
    setRetentionMessage(null)
    try {
      const response = await apiFetch('/api/admin/archiving/exceptions', {
        body: JSON.stringify({
          policyId: retentionPreview.policy.id,
          reason: ta('archiving.retention.defaultExceptionReason'),
          sourceKey: candidate.sourceKey,
          subjectId: candidate.subjectId,
          subjectTable: candidate.subjectTable,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      if (!response.ok) {
        setRetentionStatus('error')
        setRetentionMessage(
          (await readResponseMessage(response)) ??
            ta('archiving.retention.exceptionError'),
        )
        return
      }
      await runRetentionPreview(retentionPreview.policy.id)
      setRetentionMessage(ta('archiving.retention.exceptionCreated'))
    } catch {
      setRetentionStatus('error')
      setRetentionMessage(ta('archiving.retention.exceptionError'))
    }
  }

  const executeRetention = async () => {
    if (!retentionPreview) return
    const confirmed = await confirm({
      confirmText: ta('archiving.retention.execute'),
      icon: 'caution',
      message: ta('archiving.retention.confirmMessage', {
        archiveCount: retentionPreview.summary.archiveCount,
        deleteCount: retentionPreview.summary.deleteCount,
      }),
      title: ta('archiving.retention.confirmTitle'),
      variant: 'danger',
    })
    if (!confirmed) return

    setRetentionStatus('saving')
    setRetentionMessage(null)
    try {
      const response = await apiFetch('/api/admin/archiving/runs', {
        body: JSON.stringify({
          ...(retentionExportToken
            ? { exportToken: retentionExportToken }
            : {}),
          policyId: retentionPreview.policy.id,
          previewToken: retentionPreview.previewToken,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      if (!response.ok) {
        setRetentionStatus('error')
        setRetentionMessage(
          response.status === 409
            ? ta('archiving.retention.stalePreview')
            : ((await readResponseMessage(response)) ??
                ta('archiving.retention.executeError')),
        )
        return
      }
      setRetentionPreview(null)
      setRetentionExportToken(null)
      setRetentionStatus('saved')
      setRetentionMessage(ta('archiving.retention.executeSuccess'))
      await loadRetentionPolicies()
    } catch {
      setRetentionStatus('error')
      setRetentionMessage(ta('archiving.retention.executeError'))
    }
  }

  const exportRetentionArchive = async () => {
    if (!retentionPreview) return
    setRetentionStatus('saving')
    setRetentionMessage(null)
    try {
      const response = await apiFetch('/api/admin/archiving/exports', {
        body: JSON.stringify({
          policyId: retentionPreview.policy.id,
          previewToken: retentionPreview.previewToken,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      if (!response.ok) {
        setRetentionStatus('error')
        setRetentionMessage(
          response.status === 409
            ? ta('archiving.retention.stalePreview')
            : ((await readResponseMessage(response)) ??
                ta('archiving.retention.exportError')),
        )
        return
      }
      const exportData =
        (await response.json()) as ArchivingRetentionExportResponse
      downloadBlob(
        new Blob([JSON.stringify(exportData.archive, null, 2)], {
          type: 'application/json;charset=utf-8',
        }),
        archivingRetentionExportFilename(retentionPreview),
      )
      setRetentionExportToken(exportData.exportToken)
      setRetentionStatus('saved')
      setRetentionMessage(ta('archiving.retention.exportSuccess'))
    } catch {
      setRetentionStatus('error')
      setRetentionMessage(ta('archiving.retention.exportError'))
    }
  }

  const retentionRequiresArchiveExport = Boolean(
    retentionPreview && retentionPreview.summary.archiveCount > 0,
  )

  return (
    <section
      aria-labelledby="archiving-tab"
      className="rounded-[2rem] border border-secondary-200/70 bg-white/88 p-6 shadow-soft dark:border-secondary-800 dark:bg-secondary-950/70"
      data-developer-mode-name="admin archiving panel"
      data-developer-mode-priority="330"
      data-developer-mode-value="retention and archive exports"
      id="archiving-panel"
      role="tabpanel"
    >
      <div>
        <h2 className="text-2xl font-semibold text-secondary-950 dark:text-secondary-50">
          {ta('archiving.title')}
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-secondary-600 dark:text-secondary-300">
          {ta('archiving.description')}
        </p>
      </div>

      <div className="mt-6 border-t border-secondary-200/70 pt-6 dark:border-secondary-700/60">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-secondary-950 dark:text-secondary-50">
              {ta('archiving.retention.title')}
            </h3>
            <p className="mt-1 max-w-3xl text-sm text-secondary-600 dark:text-secondary-300">
              {ta('archiving.retention.description')}
            </p>
          </div>
          <button
            className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-secondary-200 px-4 py-2 text-sm font-medium text-secondary-700 transition-colors hover:bg-secondary-100 disabled:opacity-60 dark:border-secondary-700 dark:text-secondary-200 dark:hover:bg-secondary-800"
            disabled={retentionStatus === 'saving'}
            onClick={() => void loadRetentionPolicies()}
            type="button"
          >
            <RefreshCw aria-hidden="true" className="h-4 w-4" />
            {ta('archiving.retention.reload')}
          </button>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
          <label className="block space-y-1">
            <span className="text-sm font-medium text-secondary-700 dark:text-secondary-200">
              {ta('archiving.retention.policy')}
            </span>
            <select
              className="min-h-[44px] w-full rounded-xl border border-secondary-200 bg-white px-3 py-2.5 text-sm dark:border-secondary-700 dark:bg-secondary-900"
              disabled={retentionStatus === 'saving'}
              onChange={event => {
                const policyId = Number(event.target.value)
                setSelectedRetentionPolicyId(policyId)
                setRetentionPreview(null)
                setRetentionExportToken(null)
                setRetentionMessage(null)
              }}
              value={selectedRetentionPolicyId ?? ''}
            >
              {retentionPolicies.map(policy => (
                <option key={policy.id} value={policy.id}>
                  {policy.informationSet}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button
              className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-60"
              disabled={
                retentionStatus === 'saving' ||
                !selectedRetentionPolicy ||
                !selectedRetentionPolicy.isEnabled
              }
              onClick={() => void runRetentionPreview()}
              type="button"
            >
              <ClipboardList aria-hidden="true" className="h-4 w-4" />
              {ta('archiving.retention.preview')}
            </button>
          </div>
        </div>

        {selectedRetentionPolicy ? (
          <div className="mt-4 rounded-2xl border border-secondary-200/70 bg-secondary-50/70 p-4 text-sm dark:border-secondary-700/60 dark:bg-secondary-950/40">
            <dl className="grid gap-3 md:grid-cols-4">
              <div>
                <dt className="font-medium text-secondary-700 dark:text-secondary-200">
                  {ta('archiving.retention.action')}
                </dt>
                <dd className="mt-1 text-secondary-600 dark:text-secondary-300">
                  {ta(
                    `archiving.retention.actions.${selectedRetentionPolicy.action}`,
                  )}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-secondary-700 dark:text-secondary-200">
                  {ta('archiving.retention.ageDays')}
                </dt>
                <dd className="mt-1 text-secondary-600 dark:text-secondary-300">
                  {selectedRetentionPolicy.ageDays}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-secondary-700 dark:text-secondary-200">
                  {ta('archiving.retention.lastRun')}
                </dt>
                <dd className="mt-1 text-secondary-600 dark:text-secondary-300">
                  {selectedRetentionPolicy.lastRunAt
                    ? new Date(
                        selectedRetentionPolicy.lastRunAt,
                      ).toLocaleString(locale)
                    : ta('privacy.notAvailable')}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-secondary-700 dark:text-secondary-200">
                  {ta('archiving.retention.state')}
                </dt>
                <dd className="mt-1 text-secondary-600 dark:text-secondary-300">
                  {selectedRetentionPolicy.isEnabled
                    ? ta('archiving.retention.enabled')
                    : ta('archiving.retention.disabled')}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-secondary-600 dark:text-secondary-300">
              {selectedRetentionPolicy.statusCondition}
            </p>
          </div>
        ) : null}

        {retentionMessage ? (
          <p
            className={`mt-4 text-sm font-medium ${
              retentionStatus === 'error'
                ? 'text-red-700 dark:text-red-300'
                : 'text-emerald-700 dark:text-emerald-300'
            }`}
            role={retentionStatus === 'error' ? 'alert' : 'status'}
          >
            {retentionMessage}
          </p>
        ) : null}

        {retentionPreview ? (
          <div className="mt-5 overflow-hidden rounded-2xl border border-secondary-200/70 dark:border-secondary-700/60">
            <div className="flex flex-col gap-2 border-b border-secondary-200/70 bg-secondary-50 px-4 py-3 dark:border-secondary-700/60 dark:bg-secondary-950/40 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-secondary-900 dark:text-secondary-100">
                  {ta('archiving.retention.previewResult', {
                    count: retentionPreview.summary.candidateCount,
                  })}
                </div>
                <div className="text-xs text-secondary-500 dark:text-secondary-400">
                  {ta('archiving.retention.cutoff', {
                    date: new Date(retentionPreview.cutoff).toLocaleDateString(
                      locale,
                    ),
                  })}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-secondary-200 bg-white px-4 py-2 text-sm font-medium text-secondary-700 transition-colors hover:bg-secondary-100 disabled:opacity-60 dark:border-secondary-700 dark:bg-secondary-900 dark:text-secondary-200 dark:hover:bg-secondary-800"
                  disabled={
                    retentionStatus === 'saving' ||
                    retentionPreview.summary.candidateCount === 0
                  }
                  onClick={() => void exportRetentionArchive()}
                  type="button"
                >
                  <FileJson aria-hidden="true" className="h-4 w-4" />
                  {ta('archiving.retention.exportJson')}
                </button>
                <button
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-red-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-800 disabled:opacity-60"
                  disabled={
                    retentionStatus === 'saving' ||
                    retentionPreview.summary.candidateCount === 0 ||
                    (retentionRequiresArchiveExport && !retentionExportToken)
                  }
                  onClick={() => void executeRetention()}
                  type="button"
                >
                  <ShieldCheck aria-hidden="true" className="h-4 w-4" />
                  {ta('archiving.retention.execute')}
                </button>
              </div>
            </div>
            {retentionRequiresArchiveExport && !retentionExportToken ? (
              <p className="border-b border-secondary-200/70 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-secondary-700/60 dark:bg-amber-950/30 dark:text-amber-100">
                {ta('archiving.retention.exportRequired')}
              </p>
            ) : null}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-secondary-200 text-sm dark:divide-secondary-700">
                <thead className="bg-white dark:bg-secondary-900">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">
                      {ta('privacy.object')}
                    </th>
                    <th className="px-4 py-3 text-left font-semibold">
                      {ta('privacy.affected')}
                    </th>
                    <th className="px-4 py-3 text-left font-semibold">
                      {ta('privacy.currentValue')}
                    </th>
                    <th className="px-4 py-3 text-left font-semibold">
                      {ta('archiving.retention.ageBasis')}
                    </th>
                    <th className="px-4 py-3 text-left font-semibold">
                      {ta('privacy.action')}
                    </th>
                    <th className="px-4 py-3 text-left font-semibold">
                      {ta('archiving.retention.exception')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-secondary-200 bg-white dark:divide-secondary-700 dark:bg-secondary-900">
                  {retentionPreview.candidates.map(candidate => (
                    <tr key={candidate.key}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-secondary-900 dark:text-secondary-100">
                          {ta(`privacy.objects.${candidate.objectKey}`)}
                        </div>
                        <div className="text-xs text-secondary-500 dark:text-secondary-400">
                          {ta(`privacy.fields.${candidate.fieldKey}`)}
                        </div>
                      </td>
                      <td className="px-4 py-3">{candidate.reference}</td>
                      <td className="px-4 py-3">
                        {formatActorDisplayNameForLocale(
                          candidate.currentDisplayValue,
                          locale,
                        ) ?? ta('privacy.notAvailable')}
                      </td>
                      <td className="px-4 py-3">
                        {new Date(candidate.ageBasis).toLocaleDateString(
                          locale,
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {ta(`archiving.retention.actions.${candidate.action}`)}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-secondary-200 px-3 py-2 text-xs font-medium text-secondary-700 transition-colors hover:bg-secondary-100 disabled:opacity-60 dark:border-secondary-700 dark:text-secondary-200 dark:hover:bg-secondary-800"
                          disabled={retentionStatus === 'saving'}
                          onClick={() =>
                            void createRetentionException(candidate)
                          }
                          type="button"
                        >
                          <CircleMinus aria-hidden="true" className="h-4 w-4" />
                          {ta('archiving.retention.createException')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}

function AccessReviewPanel({ canManage }: { canManage: boolean }) {
  const ta = useTranslations('admin')
  const tc = useTranslations('common')
  const locale = useLocale()
  const { confirm } = useConfirmModal()
  const [runs, setRuns] = useState<AccessReviewRun[]>([])
  const [hasLoadedRuns, setHasLoadedRuns] = useState(false)
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null)
  const [selectedDetail, setSelectedDetail] =
    useState<AccessReviewRunDetail | null>(null)
  const [externalEvidenceReference, setExternalEvidenceReference] = useState('')
  const [decisionDrafts, setDecisionDrafts] = useState<
    Record<
      number,
      {
        comment: string
        decision: Exclude<AccessReviewDecision, 'pending'>
      }
    >
  >({})
  const [unlockedDecisionItemIds, setUnlockedDecisionItemIds] = useState<
    Set<number>
  >(() => new Set())
  const [isExternalEvidenceHelpOpen, setIsExternalEvidenceHelpOpen] =
    useState(false)
  const [status, setStatus] = useState<SaveState>('idle')
  const [savingAction, setSavingAction] =
    useState<AccessReviewSavingAction | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const exportDownload = useAccessReviewExportDownload({
    locale,
    reviewId: selectedRunId,
  })
  const loadErrorMessage = ta('accessReview.loadError')
  const loadedRunsMessageRef = useRef<string | null>(null)

  const setDetail = useCallback(
    (
      detail: AccessReviewRunDetail | null,
      options?: { preserveItemOrder?: boolean; preserveUnlockedRows?: boolean },
    ) => {
      setSelectedDetail(current => {
        if (
          detail &&
          current?.run.id === detail.run.id &&
          options?.preserveItemOrder
        ) {
          return {
            ...detail,
            items: preserveAccessReviewItemOrder(current.items, detail.items),
          }
        }
        return detail
      })
      setDecisionDrafts(
        Object.fromEntries(
          (detail?.items ?? []).map(item => [
            item.id,
            {
              comment: item.comment ?? '',
              decision:
                item.decision === 'pending' ? 'approved' : item.decision,
            },
          ]),
        ),
      )
      if (!options?.preserveUnlockedRows) {
        setUnlockedDecisionItemIds(new Set())
      }
    },
    [],
  )

  useEffect(() => {
    if (loadedRunsMessageRef.current === loadErrorMessage) return
    let cancelled = false
    async function loadRuns() {
      setHasLoadedRuns(false)
      setMessage(null)
      try {
        const response = await apiFetch('/api/admin/access-reviews')
        if (!response.ok) {
          if (cancelled) return
          setHasLoadedRuns(false)
          setStatus('error')
          setMessage((await readResponseMessage(response)) ?? loadErrorMessage)
          return
        }
        const body = (await response.json()) as { runs?: AccessReviewRun[] }
        if (cancelled) return
        loadedRunsMessageRef.current = loadErrorMessage
        const nextRuns = body.runs ?? []
        setRuns(nextRuns)
        setHasLoadedRuns(true)
        setStatus('idle')
        setSelectedRunId(current => current ?? nextRuns[0]?.id ?? null)
      } catch {
        if (!cancelled) {
          loadedRunsMessageRef.current = loadErrorMessage
          setHasLoadedRuns(false)
          setStatus('error')
          setMessage(loadErrorMessage)
        }
      }
    }
    void loadRuns()
    return () => {
      cancelled = true
    }
  }, [loadErrorMessage])

  useEffect(() => {
    let cancelled = false
    async function loadDetail() {
      if (!selectedRunId) {
        setDetail(null)
        return
      }
      setStatus(current => (current === 'saving' ? current : 'idle'))
      try {
        const response = await apiFetch(
          `/api/admin/access-reviews/${selectedRunId}`,
        )
        if (!response.ok) {
          setStatus('error')
          setMessage((await readResponseMessage(response)) ?? loadErrorMessage)
          return
        }
        const detail = (await response.json()) as AccessReviewRunDetail
        if (cancelled) return
        setDetail(detail)
        setRuns(current => {
          const others = current.filter(run => run.id !== detail.run.id)
          return [detail.run, ...others].sort((left, right) => {
            return right.id - left.id
          })
        })
      } catch {
        if (!cancelled) {
          setStatus('error')
          setMessage(loadErrorMessage)
        }
      }
    }
    void loadDetail()
    return () => {
      cancelled = true
    }
  }, [loadErrorMessage, selectedRunId, setDetail])

  const updateRunFromDetail = (
    detail: AccessReviewRunDetail,
    options?: { preserveItemOrder?: boolean; preserveUnlockedRows?: boolean },
  ) => {
    setDetail(detail, options)
    setRuns(current =>
      current
        .map(run => (run.id === detail.run.id ? detail.run : run))
        .sort((left, right) => right.id - left.id),
    )
  }

  const createRun = async () => {
    if (!canManage) return
    exportDownload.clearError()
    setStatus('saving')
    setSavingAction('create')
    setMessage(null)
    try {
      const response = await apiFetch('/api/admin/access-reviews', {
        body: JSON.stringify({
          externalEvidenceReference: externalEvidenceReference.trim() || null,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      if (!response.ok) {
        setStatus('error')
        setSavingAction(null)
        setMessage(
          (await readResponseMessage(response)) ??
            ta('accessReview.createError'),
        )
        return
      }
      const detail = (await response.json()) as AccessReviewRunDetail
      setSelectedRunId(detail.run.id)
      updateRunFromDetail(detail)
      setStatus('saved')
      setSavingAction(null)
      setMessage(ta('accessReview.createSuccess'))
    } catch {
      setStatus('error')
      setSavingAction(null)
      setMessage(ta('accessReview.createError'))
    }
  }

  const saveDecision = async (item: AccessReviewItem) => {
    if (!canManage) return
    if (!selectedRunId) return
    const draft = decisionDrafts[item.id]
    if (!draft) return
    const comment = draft.comment.trim()
    if (comment.length > BUSINESS_TEXT_MAX_LENGTH) {
      setStatus('error')
      setSavingAction(null)
      setMessage(
        ta('accessReview.commentTooLong', {
          max: BUSINESS_TEXT_MAX_LENGTH,
        }),
      )
      return
    }
    exportDownload.clearError()
    setStatus('saving')
    setSavingAction('decision')
    setMessage(null)
    try {
      const response = await apiFetch(
        `/api/admin/access-reviews/${selectedRunId}/items/${item.id}`,
        {
          body: JSON.stringify({
            comment: comment || null,
            decision: draft.decision,
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'PATCH',
        },
      )
      if (!response.ok) {
        setStatus('error')
        setSavingAction(null)
        setMessage(
          (await readResponseMessage(response)) ??
            ta('accessReview.decisionError'),
        )
        return
      }
      updateRunFromDetail((await response.json()) as AccessReviewRunDetail, {
        preserveItemOrder: true,
        preserveUnlockedRows: true,
      })
      setUnlockedDecisionItemIds(current => {
        const next = new Set(current)
        next.delete(item.id)
        return next
      })
      setStatus('saved')
      setSavingAction(null)
      setMessage(null)
    } catch {
      setStatus('error')
      setSavingAction(null)
      setMessage(ta('accessReview.decisionError'))
    }
  }

  const completeRun = async () => {
    if (!selectedRunId || !canManage) return
    exportDownload.clearError()
    setStatus('saving')
    setSavingAction('complete')
    setMessage(null)
    try {
      const response = await apiFetch(
        `/api/admin/access-reviews/${selectedRunId}/complete`,
        { method: 'POST' },
      )
      if (!response.ok) {
        setStatus('error')
        setSavingAction(null)
        setMessage(
          (await readResponseMessage(response)) ??
            ta('accessReview.completeError'),
        )
        return
      }
      updateRunFromDetail((await response.json()) as AccessReviewRunDetail)
      setStatus('saved')
      setSavingAction(null)
      setMessage(ta('accessReview.completeSuccess'))
    } catch {
      setStatus('error')
      setSavingAction(null)
      setMessage(ta('accessReview.completeError'))
    }
  }

  const hasCurrentDetail = selectedDetail?.run.id === selectedRunId
  const isDetailLoading = Boolean(selectedRunId && !hasCurrentDetail)
  const displayedDetail = selectedDetail
  const displayedRun = displayedDetail?.run ?? null
  const selectedReviewerDisplayName = displayedRun
    ? (formatActorDisplayNameForLocale(
        displayedRun.reviewer.displayName,
        locale,
      ) ?? displayedRun.reviewer.displayName)
    : ''
  const isDisplayedRunClosed =
    displayedRun?.status === 'completed' || displayedRun?.status === 'cancelled'
  const isOverdue =
    displayedRun &&
    !isDisplayedRunClosed &&
    new Date(displayedRun.dueAt).getTime() < Date.now()
  const hasOpenRun = runs.some(
    run => run.status === 'draft' || run.status === 'in_review',
  )
  const isCreateDisabled = status === 'saving' || !hasLoadedRuns || hasOpenRun
  const accessReviewErrorMessage =
    status === 'error' && message
      ? message
      : exportDownload.error
        ? ta('accessReview.exportError', { detail: exportDownload.error })
        : null

  const dismissAccessReviewError = () => {
    setMessage(null)
    setStatus(current => (current === 'error' ? 'idle' : current))
    exportDownload.clearError()
  }

  const unlockDecision = (item: AccessReviewItem) => {
    if (!canManage) return
    if (isDisplayedRunClosed) return
    setMessage(null)
    exportDownload.clearError()
    setUnlockedDecisionItemIds(current => {
      const next = new Set(current)
      next.add(item.id)
      return next
    })
  }

  const cancelRun = async (
    run: AccessReviewRun,
    event: MouseEvent<HTMLButtonElement>,
  ) => {
    if (!canManage) return
    const confirmed = await confirm({
      anchorEl: event.currentTarget,
      confirmText: ta('accessReview.cancel'),
      icon: 'caution',
      message: ta('accessReview.cancelConfirmMessage', {
        id: run.id,
      }),
      title: ta('accessReview.cancelConfirmTitle'),
      variant: 'danger',
    })
    if (!confirmed) return

    setStatus('saving')
    setSavingAction('cancel')
    setMessage(null)
    exportDownload.clearError()
    try {
      const response = await apiFetch(
        `/api/admin/access-reviews/${run.id}/cancel`,
        { method: 'POST' },
      )
      if (!response.ok) {
        setStatus('error')
        setSavingAction(null)
        setMessage(
          (await readResponseMessage(response)) ??
            ta('accessReview.cancelError'),
        )
        return
      }
      const detail = (await response.json()) as AccessReviewRunDetail
      setSelectedRunId(detail.run.id)
      updateRunFromDetail(detail)
      setStatus('saved')
      setSavingAction(null)
      setMessage(ta('accessReview.cancelSuccess'))
    } catch {
      setStatus('error')
      setSavingAction(null)
      setMessage(ta('accessReview.cancelError'))
    }
  }

  return (
    <section
      aria-labelledby="accessReview-tab"
      className="rounded-[2rem] border border-secondary-200/70 bg-white/90 p-6 shadow-sm dark:border-secondary-700/60 dark:bg-secondary-900/80"
      {...devMarker({
        context: 'admin center',
        name: 'tab panel',
        priority: 340,
        value: 'access review',
      })}
      id="accessReview-panel"
      role="tabpanel"
    >
      {accessReviewErrorMessage ? (
        <div
          aria-atomic="true"
          aria-live="assertive"
          className="fixed inset-x-4 top-4 z-50 rounded-2xl border border-red-200 bg-white p-4 shadow-2xl shadow-red-950/10 dark:border-red-800/70 dark:bg-secondary-950 sm:inset-x-auto sm:right-6 sm:w-[min(28rem,calc(100vw-3rem))]"
          role="alert"
        >
          <div className="flex items-start gap-3">
            <XCircle
              aria-hidden="true"
              className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-300"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-red-800 dark:text-red-200">
                {ta('accessReview.errorPopupTitle')}
              </p>
              <p className="mt-1 break-words text-sm text-red-700 dark:text-red-300">
                {accessReviewErrorMessage}
              </p>
            </div>
            <button
              aria-label={ta('accessReview.dismissError')}
              className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-red-700 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:text-red-200 dark:hover:bg-red-950/40"
              onClick={dismissAccessReviewError}
              type="button"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-4 border-b border-secondary-200/70 pb-5 dark:border-secondary-700/60 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-secondary-950 dark:text-secondary-50">
            {ta('accessReview.title')}
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-secondary-600 dark:text-secondary-300">
            {ta('accessReviewDescription')}
          </p>
        </div>
      </div>

      {message ? (
        <div
          className={`mt-4 text-sm font-medium ${
            status === 'error'
              ? 'text-red-700 dark:text-red-300'
              : 'text-emerald-700 dark:text-emerald-300'
          }`}
          role={status === 'error' ? undefined : 'status'}
        >
          {message}
        </div>
      ) : null}

      {canManage ? (
        <div className="mt-6 rounded-2xl border border-secondary-200/70 bg-secondary-50/70 p-4 dark:border-secondary-700/60 dark:bg-secondary-950/40">
          <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-secondary-700 dark:text-secondary-200">
            {ta('accessReview.createTitle')}
          </h3>
          <div className="mt-4 max-w-3xl">
            <div className="flex items-center gap-1.5">
              <label
                className="text-sm font-medium text-secondary-700 dark:text-secondary-200"
                htmlFor="access-review-external-evidence-reference"
              >
                {ta('accessReview.externalEvidenceReference')}
              </label>
              <button
                aria-controls="access-review-external-evidence-help"
                aria-describedby={
                  isExternalEvidenceHelpOpen
                    ? 'access-review-external-evidence-help'
                    : undefined
                }
                aria-expanded={isExternalEvidenceHelpOpen}
                aria-label={`${tc('help')}: ${ta('accessReview.externalEvidenceReference')}`}
                className="inline-flex min-h-11 min-w-11 items-center justify-center text-secondary-400 transition-colors hover:text-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:hover:text-primary-400"
                onClick={() => setIsExternalEvidenceHelpOpen(open => !open)}
                type="button"
              >
                <HelpCircle aria-hidden="true" className="h-3.5 w-3.5" />
              </button>
            </div>
            <AnimatedHelpPanel
              id="access-review-external-evidence-help"
              isOpen={isExternalEvidenceHelpOpen}
            >
              {ta('accessReview.externalEvidenceHelp')}
            </AnimatedHelpPanel>
            <input
              className="w-full rounded-xl border border-secondary-200 bg-white px-3 py-2.5 text-sm dark:border-secondary-700 dark:bg-secondary-900"
              id="access-review-external-evidence-reference"
              onChange={event =>
                setExternalEvidenceReference(event.target.value)
              }
              value={externalEvidenceReference}
            />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-primary-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-800 disabled:opacity-60"
              disabled={isCreateDisabled}
              onClick={createRun}
              type="button"
            >
              <ClipboardCheck aria-hidden="true" className="h-4 w-4" />
              {status === 'saving' && savingAction === 'create'
                ? ta('accessReview.creating')
                : ta('accessReview.create')}
            </button>
            {hasOpenRun ? (
              <p className="text-sm text-secondary-600 dark:text-secondary-300">
                {ta('accessReview.createBlockedByOpenRun')}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="mt-6 grid gap-5 xl:grid-cols-[20rem_minmax(0,1fr)]">
        <aside className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-secondary-700 dark:text-secondary-200">
            {ta('accessReview.runs')}
          </h3>
          {runs.length > 0 ? (
            runs.map(run => (
              <button
                className={`w-full rounded-2xl border p-4 text-left transition-colors ${
                  selectedRunId === run.id
                    ? 'border-primary-300 bg-primary-50/70 dark:border-primary-700 dark:bg-primary-950/30'
                    : 'border-secondary-200 bg-white hover:bg-secondary-50 dark:border-secondary-700 dark:bg-secondary-900 dark:hover:bg-secondary-800'
                }`}
                key={run.id}
                onClick={() => setSelectedRunId(run.id)}
                type="button"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-secondary-950 dark:text-secondary-50">
                    {ta('accessReview.runNumber', { id: run.id })}
                  </span>
                  <span className={accessReviewRunStatusClass(run.status)}>
                    {ta(`accessReview.statuses.${run.status}`)}
                  </span>
                </div>
                <div className="mt-2 text-xs text-secondary-500 dark:text-secondary-400">
                  {ta('accessReview.dueAt')}: {run.dueAt.slice(0, 10)}
                </div>
                <div className="mt-1 text-xs text-secondary-500 dark:text-secondary-400">
                  {ta('accessReview.pendingCount', {
                    count: run.summary.pendingCount,
                  })}
                </div>
              </button>
            ))
          ) : hasLoadedRuns ? (
            <div className="rounded-2xl border border-secondary-200/70 bg-secondary-50/70 p-4 text-sm text-secondary-600 dark:border-secondary-700/60 dark:bg-secondary-950/40 dark:text-secondary-300">
              {ta('accessReview.noRuns')}
            </div>
          ) : null}
        </aside>

        <div className="min-w-0">
          {displayedRun && displayedDetail ? (
            <div aria-busy={isDetailLoading} className="space-y-5">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {[
                  [
                    'status',
                    ta(`accessReview.statuses.${displayedRun.status}`),
                  ],
                  ['due', displayedRun.dueAt.slice(0, 10)],
                  ['reviewer', selectedReviewerDisplayName],
                  [
                    'progress',
                    `${displayedRun.summary.itemCount - displayedRun.summary.pendingCount}/${displayedRun.summary.itemCount}`,
                  ],
                ].map(([key, value]) => (
                  <div
                    className="rounded-2xl border border-secondary-200/70 bg-secondary-50/70 p-4 dark:border-secondary-700/60 dark:bg-secondary-950/40"
                    key={key}
                  >
                    <div className="text-xs font-medium uppercase tracking-[0.14em] text-secondary-500 dark:text-secondary-400">
                      {ta(`accessReview.summary.${key}`)}
                    </div>
                    <div className="mt-2 font-semibold text-secondary-950 dark:text-secondary-50">
                      {value}
                    </div>
                  </div>
                ))}
              </div>

              {isOverdue ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
                  {ta('accessReview.overdue')}
                </div>
              ) : null}

              <div className="overflow-hidden rounded-2xl border border-secondary-200/70 dark:border-secondary-700/60">
                <div className="flex flex-col gap-3 border-b border-secondary-200/70 bg-secondary-50 px-4 py-3 dark:border-secondary-700/60 dark:bg-secondary-950/40 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-secondary-900 dark:text-secondary-100">
                        {ta('accessReview.items')}
                      </h3>
                      <span className="rounded-full bg-white px-2 py-1 text-xs font-medium text-secondary-600 dark:bg-secondary-900 dark:text-secondary-300">
                        {ta('accessReview.runNumber', { id: displayedRun.id })}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-secondary-500 dark:text-secondary-400">
                      {ta('accessReview.itemsDescription')}
                    </p>
                    {displayedRun.externalEvidenceReference ? (
                      <div className="mt-2 flex max-w-full items-center gap-2 text-xs text-secondary-500 dark:text-secondary-400">
                        <span className="shrink-0 font-medium">
                          {ta('accessReview.externalEvidenceReference')}:
                        </span>
                        <span
                          className="min-w-0 truncate rounded-full border border-secondary-200 bg-white px-2 py-1 text-secondary-700 dark:border-secondary-700 dark:bg-secondary-900 dark:text-secondary-200"
                          title={displayedRun.externalEvidenceReference}
                        >
                          {displayedRun.externalEvidenceReference}
                        </span>
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {canManage &&
                    displayedRun.status !== 'completed' &&
                    displayedRun.status !== 'cancelled' ? (
                      <button
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-60 dark:border-red-800 dark:bg-secondary-900 dark:text-red-200 dark:hover:bg-red-950/30"
                        disabled={isDetailLoading || status === 'saving'}
                        onClick={event => void cancelRun(displayedRun, event)}
                        type="button"
                      >
                        <XCircle aria-hidden="true" className="h-4 w-4" />
                        {ta('accessReview.cancel')}
                      </button>
                    ) : null}
                    {canManage &&
                    displayedRun.summary.pendingCount === 0 &&
                    displayedRun.status !== 'completed' &&
                    displayedRun.status !== 'cancelled' ? (
                      <button
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-primary-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-800 disabled:opacity-60"
                        disabled={isDetailLoading || status === 'saving'}
                        onClick={completeRun}
                        type="button"
                      >
                        <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                        {ta('accessReview.complete')}
                      </button>
                    ) : null}
                    {canManage ? (
                      <div className="flex min-w-0 max-w-full flex-nowrap items-center gap-2 overflow-x-auto">
                        <button
                          className="inline-flex min-h-[44px] shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-secondary-200 bg-white px-4 py-2 text-sm font-medium text-secondary-700 transition-colors hover:bg-secondary-100 disabled:opacity-60 dark:border-secondary-700 dark:bg-secondary-900 dark:text-secondary-200 dark:hover:bg-secondary-800"
                          disabled={
                            isDetailLoading ||
                            status === 'saving' ||
                            exportDownload.downloading !== null
                          }
                          onClick={() =>
                            void exportDownload.download({ delivery: 'json' })
                          }
                          type="button"
                        >
                          <FileJson aria-hidden="true" className="h-4 w-4" />
                          {exportDownload.downloading === 'json'
                            ? ta('accessReview.exportingJson')
                            : ta('accessReview.exportJson')}
                        </button>
                        <button
                          className="inline-flex min-h-[44px] shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-secondary-200 bg-white px-4 py-2 text-sm font-medium text-secondary-700 transition-colors hover:bg-secondary-100 disabled:opacity-60 dark:border-secondary-700 dark:bg-secondary-900 dark:text-secondary-200 dark:hover:bg-secondary-800"
                          disabled={
                            isDetailLoading ||
                            status === 'saving' ||
                            exportDownload.downloading !== null
                          }
                          onClick={() =>
                            void exportDownload.download({ delivery: 'pdf' })
                          }
                          type="button"
                        >
                          <FileText aria-hidden="true" className="h-4 w-4" />
                          {exportDownload.downloading === 'pdf'
                            ? ta('accessReview.exportingPdf')
                            : ta('accessReview.exportPdf')}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
                {exportDownload.error ? (
                  <div className="border-b border-secondary-200/70 bg-white px-4 py-3 text-sm font-medium text-red-700 dark:border-secondary-700/60 dark:bg-secondary-900 dark:text-red-300">
                    {ta('accessReview.exportError', {
                      detail: exportDownload.error,
                    })}
                  </div>
                ) : null}
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-secondary-200 text-sm dark:divide-secondary-700">
                    <thead className="bg-white dark:bg-secondary-900">
                      <tr>
                        {canManage && !isDisplayedRunClosed ? (
                          <th className="w-12 px-4 py-3 text-left font-semibold">
                            <span className="sr-only">
                              {ta('accessReview.lockState')}
                            </span>
                          </th>
                        ) : null}
                        <th className="px-4 py-3 text-left font-semibold">
                          {ta('accessReview.principal')}
                        </th>
                        <th className="px-4 py-3 text-left font-semibold">
                          {ta('accessReview.scope')}
                        </th>
                        <th className="px-4 py-3 text-left font-semibold">
                          {ta('accessReview.permission')}
                        </th>
                        <th className="px-4 py-3 text-left font-semibold">
                          {ta('accessReview.decision')}
                        </th>
                        <th className="px-4 py-3 text-left font-semibold">
                          {ta('accessReview.comment')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-secondary-200 bg-white dark:divide-secondary-700 dark:bg-secondary-900">
                      {displayedDetail.items.map(item => {
                        const draft = decisionDrafts[item.id] ?? {
                          comment: '',
                          decision: 'approved' as const,
                        }
                        const canChooseDecision =
                          canManage &&
                          !isDisplayedRunClosed &&
                          (item.decision === 'pending' ||
                            unlockedDecisionItemIds.has(item.id))
                        return (
                          <tr key={item.id}>
                            {canManage && !isDisplayedRunClosed ? (
                              <td className="px-4 py-3 align-middle">
                                <button
                                  aria-label={
                                    canChooseDecision
                                      ? ta('accessReview.rowNeedsReview')
                                      : ta('accessReview.rowApproved')
                                  }
                                  className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border transition-colors disabled:opacity-60 ${
                                    canChooseDecision
                                      ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200 dark:hover:bg-amber-900/40'
                                      : 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-700/60 dark:bg-emerald-950/30 dark:text-emerald-200 dark:hover:bg-emerald-900/40'
                                  }`}
                                  disabled={
                                    !canManage ||
                                    isDetailLoading ||
                                    status === 'saving'
                                  }
                                  onClick={() => {
                                    if (!canManage) return
                                    if (canChooseDecision) {
                                      void saveDecision(item)
                                    } else {
                                      unlockDecision(item)
                                    }
                                  }}
                                  title={
                                    canChooseDecision
                                      ? ta('accessReview.rowNeedsReview')
                                      : ta('accessReview.rowApproved')
                                  }
                                  type="button"
                                >
                                  {canChooseDecision ? (
                                    <CircleAlert
                                      aria-hidden="true"
                                      className="h-4 w-4"
                                    />
                                  ) : (
                                    <Check
                                      aria-hidden="true"
                                      className="h-4 w-4"
                                    />
                                  )}
                                </button>
                              </td>
                            ) : null}
                            <td className="px-4 py-3">
                              <div className="font-medium text-secondary-900 dark:text-secondary-100">
                                {formatActorDisplayNameForLocale(
                                  item.principal.displayName,
                                  locale,
                                ) ?? item.principal.displayName}
                              </div>
                              <div className="font-mono text-xs text-secondary-500 dark:text-secondary-400">
                                {item.principal.hsaId}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div>{item.scope.label}</div>
                              <div className="text-xs text-secondary-500 dark:text-secondary-400">
                                {item.scope.type}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div>
                                {ta(
                                  `accessReview.permissionTypes.${item.permissionType}`,
                                )}
                              </div>
                              <div className="text-xs text-secondary-500 dark:text-secondary-400">
                                {item.canGenerateAi
                                  ? ta('accessReview.aiEnabled')
                                  : ta('accessReview.aiDisabled')}
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-left align-middle">
                              {canChooseDecision ? (
                                <select
                                  className="mt-2 block min-h-[40px] rounded-lg border border-secondary-200 bg-white px-3 py-2 disabled:cursor-not-allowed disabled:bg-secondary-100 disabled:text-secondary-500 dark:border-secondary-700 dark:bg-secondary-950 dark:disabled:bg-secondary-800 dark:disabled:text-secondary-400"
                                  disabled={
                                    isDetailLoading || status === 'saving'
                                  }
                                  onChange={event =>
                                    setDecisionDrafts(current => ({
                                      ...current,
                                      [item.id]: {
                                        ...draft,
                                        decision: event.target.value as Exclude<
                                          AccessReviewDecision,
                                          'pending'
                                        >,
                                      },
                                    }))
                                  }
                                  value={draft.decision}
                                >
                                  {ACCESS_REVIEW_DECISIONS.map(decision => (
                                    <option key={decision} value={decision}>
                                      {ta(`accessReview.decisions.${decision}`)}
                                    </option>
                                  ))}
                                </select>
                              ) : item.decision === 'pending' ? (
                                <span className="text-sm text-secondary-500 dark:text-secondary-400">
                                  -
                                </span>
                              ) : (
                                <span
                                  className={`inline-flex whitespace-nowrap rounded-full px-2 py-1 text-xs font-semibold ${accessReviewDecisionClass(
                                    item.decision,
                                  )}`}
                                >
                                  {ta(
                                    `accessReview.decisions.${item.decision}`,
                                  )}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-left align-middle">
                              {canChooseDecision ? (
                                <textarea
                                  className="min-h-20 w-full max-w-sm rounded-xl border border-secondary-200 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-secondary-100 disabled:text-secondary-500 dark:border-secondary-700 dark:bg-secondary-950 dark:disabled:bg-secondary-800 dark:disabled:text-secondary-400"
                                  disabled={
                                    isDetailLoading || status === 'saving'
                                  }
                                  onChange={event =>
                                    setDecisionDrafts(current => ({
                                      ...current,
                                      [item.id]: {
                                        ...draft,
                                        comment: event.target.value,
                                      },
                                    }))
                                  }
                                  value={draft.comment}
                                />
                              ) : (
                                <div
                                  className={`max-w-md whitespace-pre-wrap text-sm ${
                                    item.comment
                                      ? 'text-secondary-700 dark:text-secondary-200'
                                      : 'text-secondary-500 dark:text-secondary-400'
                                  }`}
                                >
                                  {item.comment ?? '-'}
                                </div>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : isDetailLoading ? (
            <div aria-hidden="true" className="min-h-[32rem]" />
          ) : hasLoadedRuns && !selectedRunId ? (
            <div className="rounded-2xl border border-secondary-200/70 bg-secondary-50/70 p-6 text-sm text-secondary-600 dark:border-secondary-700/60 dark:bg-secondary-950/40 dark:text-secondary-300">
              {ta('accessReview.selectRun')}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}
export default function AdminClient({
  currentUserRoles = [],
  initialColumnDefaults,
  initialTerminology,
}: {
  currentUserRoles?: string[]
  initialColumnDefaults: RequirementListColumnDefault[]
  initialTerminology: UiTermTranslation[]
}) {
  const ta = useTranslations('admin')
  const tc = useTranslations('common')
  const tn = useTranslations('nav')
  const tr = useTranslations('requirement')
  const tis = useTranslations('improvementSuggestion')
  const terminologyLabel = useTranslations('terminology')
  const router = useRouter()
  const searchParams = useSearchParams()
  const canUsePrivacy = currentUserRoles.includes(PRIVACY_OFFICER_ROLE)
  const canManageAccessReviews = currentUserRoles.includes(ADMIN_ROLE)
  const [activeTab, setActiveTab] = useState<AdminTab>(() =>
    getAdminTabFromSearchParams(new URLSearchParams(searchParams), {
      canUsePrivacy,
    }),
  )
  const [activeLocale, setActiveLocale] = useState<UiLocale>('sv')
  const [terminology, setTerminology] = useState(initialTerminology)
  const [columnDefaults, setColumnDefaults] = useState<
    RequirementListColumnDefault[]
  >(() => normalizeRequirementListColumnDefaults(initialColumnDefaults))
  const [terminologySaveState, setTerminologySaveState] =
    useState<SaveState>('idle')
  const [columnSaveState, setColumnSaveState] = useState<SaveState>('idle')
  const terminologySaveTokenRef = useRef(0)
  const columnSaveTokenRef = useRef(0)
  useHelpContent(
    activeTab === 'privacy'
      ? ADMIN_PRIVACY_HELP
      : activeTab === 'accessReview'
        ? ADMIN_ACCESS_REVIEW_HELP
        : ADMIN_HELP,
  )
  const orderedColumns = useMemo(
    () => getOrderedRequirementListColumns(columnDefaults),
    [columnDefaults],
  )
  const isTerminologySaving = terminologySaveState === 'saving'
  const isColumnSaving = columnSaveState === 'saving'

  useEffect(() => {
    setActiveTab(
      getAdminTabFromSearchParams(new URLSearchParams(searchParams), {
        canUsePrivacy,
      }),
    )
  }, [canUsePrivacy, searchParams])

  const selectTab = (tab: AdminTab) => {
    if ((tab === 'privacy' || tab === 'archiving') && !canUsePrivacy) {
      return
    }

    setActiveTab(tab)
    router.replace(getAdminTabHref(tab, new URLSearchParams(searchParams)), {
      scroll: false,
    })
  }

  const updateTermValue = (
    key: UiTermTranslation['key'],
    field: 'definitePlural' | 'plural' | 'singular',
    value: string,
  ) => {
    setTerminology(current =>
      current.map(entry =>
        entry.key === key
          ? {
              ...entry,
              [activeLocale]: {
                ...entry[activeLocale],
                [field]: value,
              },
            }
          : entry,
      ),
    )
    setTerminologySaveState('idle')
  }

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
          if (column.columnId !== columnId) {
            return column
          }

          const definition = getRequirementColumnDefinition(column.columnId)
          if (!definition?.canHide) {
            return {
              ...column,
              defaultVisible: true,
            }
          }

          return {
            ...column,
            defaultVisible: !column.defaultVisible,
          }
        }),
      ),
    )
    setColumnSaveState('idle')
  }

  const saveTerminology = async () => {
    const requestToken = terminologySaveTokenRef.current + 1
    terminologySaveTokenRef.current = requestToken
    setTerminologySaveState('saving')

    try {
      const response = await apiFetch('/api/admin/terminology', {
        body: JSON.stringify({ terminology }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PUT',
      })

      if (requestToken !== terminologySaveTokenRef.current) {
        return
      }

      if (!response.ok) {
        setTerminologySaveState('error')
        return
      }

      const data = (await response.json()) as {
        terminology?: UiTermTranslation[]
      }
      if (requestToken !== terminologySaveTokenRef.current) {
        return
      }

      const nextTerminology = data.terminology ?? terminology
      setTerminology(nextTerminology)
      setTerminologySaveState('saved')
      router.refresh()
    } catch {
      if (requestToken === terminologySaveTokenRef.current) {
        setTerminologySaveState('error')
      }
    }
  }

  const saveColumns = async () => {
    const requestToken = columnSaveTokenRef.current + 1
    columnSaveTokenRef.current = requestToken
    setColumnSaveState('saving')

    try {
      const response = await apiFetch('/api/admin/requirement-columns', {
        body: JSON.stringify({ columns: columnDefaults }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PUT',
      })

      if (requestToken !== columnSaveTokenRef.current) {
        return
      }

      if (!response.ok) {
        setColumnSaveState('error')
        return
      }

      const data = (await response.json()) as {
        columns?: RequirementListColumnDefault[]
      }
      if (requestToken !== columnSaveTokenRef.current) {
        return
      }

      const nextColumns = normalizeRequirementListColumnDefaults(
        data.columns ?? columnDefaults,
      )
      setColumnDefaults(nextColumns)
      setColumnSaveState('saved')
    } catch {
      if (requestToken === columnSaveTokenRef.current) {
        setColumnSaveState('error')
      }
    }
  }

  const referenceDataItems = [
    {
      description: ta('areasDescription'),
      href: '/requirement-areas',
      icon: FolderTree,
      id: 'areas',
      label: tn('areas'),
    },
    {
      description: ta('typesDescription'),
      href: '/requirement-types',
      icon: Layers,
      id: 'types',
      label: tn('types'),
    },
    {
      description: ta('requirementPackagesDescription'),
      href: '/requirement-packages',
      icon: Theater,
      id: 'requirementPackages',
      label: tn('requirementPackages'),
    },
    {
      description: ta('statusesDescription'),
      href: '/requirement-statuses',
      icon: CircleDot,
      id: 'statuses',
      label: tn('statuses'),
    },
    {
      description: ta('qualityAttributesDescription'),
      href: '/quality-characteristics',
      icon: ShieldCheck,
      id: 'qualityCharacteristics',
      label: tn('qualityCharacteristics'),
    },
    {
      description: ta('riskLevelsDescription'),
      href: '/risk-levels',
      icon: Gauge,
      id: 'riskLevels',
      label: tn('riskLevels'),
    },
    {
      description: ta('responsibilityAreasDescription'),
      href: '/specifications/responsibility-areas',
      icon: Briefcase,
      id: 'responsibilityAreas',
      label: tn('responsibilityAreas'),
    },
    {
      description: ta('implementationTypesDescription'),
      href: '/specifications/implementation-types',
      icon: Wrench,
      id: 'implementationTypes',
      label: tn('implementationTypes'),
    },
    {
      description: ta('lifecycleStatusesDescription'),
      href: '/specifications/lifecycle-statuses',
      icon: RefreshCw,
      id: 'lifecycleStatuses',
      label: tn('lifecycleStatuses'),
    },
    {
      description: ta('specificationItemStatusesDescription'),
      href: '/specification-item-statuses',
      icon: ClipboardList,
      id: 'specificationItemStatuses',
      label: tn('specificationItemStatuses'),
    },
    {
      description: ta('areaOwnersDescription'),
      href: '/owners',
      icon: UserCog,
      id: 'areaOwners',
      label: tn('areaOwners'),
    },
    {
      description: ta('normReferencesDescription'),
      href: '/norm-references',
      icon: BookOpen,
      id: 'normReferences',
      label: tn('normReferences'),
    },
  ]

  const renderSaveState = (value: SaveState, errorMessage?: string) => {
    if (value === 'saved') {
      return (
        <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
          {ta('saved')}
        </span>
      )
    }

    if (value === 'error' && errorMessage) {
      return (
        <span
          className="text-sm font-medium text-red-700 dark:text-red-400"
          role="alert"
        >
          {errorMessage}
        </span>
      )
    }

    return null
  }

  return (
    <div className="section-padding px-4 sm:px-6 lg:px-8">
      <div className="container-custom space-y-6">
        <section className="overflow-hidden rounded-[2rem] border border-secondary-200/70 bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(238,242,255,0.82))] p-6 shadow-[0_24px_70px_-48px_rgba(15,23,42,0.55)] backdrop-blur-md dark:border-secondary-700/60 dark:bg-[linear-gradient(145deg,rgba(15,23,42,0.92),rgba(30,41,59,0.86))]">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-2xl xl:max-w-[28rem] 2xl:max-w-xl">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary-700 dark:text-primary-300">
                {tn('referenceData')}
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-secondary-950 dark:text-secondary-50">
                {ta('title')}
              </h1>
              <p className="mt-2 text-sm text-secondary-600 dark:text-secondary-300">
                {ta('description')}
              </p>
            </div>
            <div
              aria-label={ta('title')}
              className="flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-secondary-200/80 bg-white/80 p-1 dark:border-secondary-700/70 dark:bg-secondary-900/70 xl:w-max xl:shrink-0"
              {...devMarker({
                name: 'navigation',
                priority: 320,
                value: 'admin center tabs',
              })}
              role="tablist"
            >
              {adminTabs.map(tab => {
                const isDisabled =
                  (tab.id === 'privacy' || tab.id === 'archiving') &&
                  !canUsePrivacy
                const label =
                  tab.id === 'privacy'
                    ? ta('privacy.title')
                    : tab.id === 'accessReview'
                      ? ta('accessReview.title')
                      : tab.id === 'archiving'
                        ? ta('archiving.title')
                        : ta(tab.id)

                return (
                  <button
                    aria-controls={`${tab.id}-panel`}
                    aria-disabled={isDisabled ? 'true' : undefined}
                    aria-selected={activeTab === tab.id}
                    className={`inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-medium transition-colors ${
                      isDisabled
                        ? 'cursor-not-allowed text-secondary-400 opacity-50 hover:bg-transparent dark:text-secondary-500'
                        : activeTab === tab.id
                          ? 'bg-primary-700 text-white'
                          : 'text-secondary-700 hover:bg-secondary-100 dark:text-secondary-200 dark:hover:bg-secondary-800'
                    }`}
                    key={`admin-tab-${tab.id}`}
                    {...devMarker({
                      context: 'admin center',
                      name: 'edge tab',
                      priority: 360,
                      value: ADMIN_TAB_DEVELOPER_MODE_VALUES[tab.id],
                    })}
                    id={`${tab.id}-tab`}
                    onClick={() => selectTab(tab.id)}
                    role="tab"
                    title={
                      isDisabled ? ta('privacy.disabledTooltip') : undefined
                    }
                    type="button"
                  >
                    <tab.icon aria-hidden="true" className="h-4 w-4" />
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
        </section>

        {activeTab === 'terminology' ? (
          <section
            aria-labelledby="terminology-tab"
            className="rounded-[2rem] border border-secondary-200/70 bg-white/90 p-6 shadow-sm dark:border-secondary-700/60 dark:bg-secondary-900/80"
            {...devMarker({
              context: 'admin center',
              name: 'tab panel',
              priority: 340,
              value: 'terminology',
            })}
            id="terminology-panel"
            role="tabpanel"
          >
            <div className="flex flex-col gap-4 border-b border-secondary-200/70 pb-5 dark:border-secondary-700/60 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-secondary-950 dark:text-secondary-50">
                  {ta('terminology')}
                </h2>
                <p className="mt-1 text-sm text-secondary-600 dark:text-secondary-300">
                  {ta('terminologyDescription')}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="inline-flex rounded-full border border-secondary-200/80 bg-secondary-50/80 p-1 dark:border-secondary-700/70 dark:bg-secondary-950/50">
                  {(['sv', 'en'] as const).map(locale => (
                    <button
                      aria-pressed={activeLocale === locale}
                      className={`min-h-[44px] min-w-[44px] rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                        activeLocale === locale
                          ? 'bg-primary-700 text-white'
                          : 'text-secondary-700 hover:bg-white dark:text-secondary-200 dark:hover:bg-secondary-800'
                      }`}
                      disabled={isTerminologySaving}
                      key={locale}
                      onClick={() => setActiveLocale(locale)}
                      type="button"
                    >
                      {locale === 'sv' ? ta('swedish') : ta('english')}
                    </button>
                  ))}
                </div>
                {renderSaveState(
                  terminologySaveState,
                  ta('terminologySaveError'),
                )}
                <button
                  className="inline-flex min-h-[44px] min-w-[44px] items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium text-secondary-700 transition-colors hover:bg-secondary-100 dark:border-secondary-700 dark:text-secondary-200 dark:hover:bg-secondary-800"
                  disabled={isTerminologySaving}
                  onClick={() => {
                    setTerminology(createShippedTerminology())
                    setTerminologySaveState('idle')
                  }}
                  type="button"
                >
                  <RotateCcw aria-hidden="true" className="h-4 w-4" />
                  {tc('resetToDefault')}
                </button>
                <button
                  className="inline-flex min-h-[44px] min-w-[44px] items-center gap-2 rounded-full bg-primary-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-800 disabled:opacity-60"
                  disabled={isTerminologySaving}
                  onClick={saveTerminology}
                  type="button"
                >
                  <Save aria-hidden="true" className="h-4 w-4" />
                  {isTerminologySaving ? tc('loading') : tc('save')}
                </button>
              </div>
            </div>

            <div className="mt-6 grid gap-4">
              {UI_TERM_KEYS.map(key => {
                const entry =
                  terminology.find(term => term.key === key) ??
                  initialTerminology.find(term => term.key === key)
                if (!entry) {
                  return null
                }
                const localized = entry[activeLocale]

                return (
                  <article
                    className="rounded-2xl border border-secondary-200/70 bg-secondary-50/60 p-4 dark:border-secondary-700/60 dark:bg-secondary-950/40"
                    key={key}
                  >
                    <div className="mb-4 flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-secondary-700 dark:text-secondary-200">
                        {terminologyLabel(`${key}.plural`)}
                      </h3>
                      <span className="rounded-full bg-white px-2 py-1 text-[11px] font-medium text-secondary-500 dark:bg-secondary-900 dark:text-secondary-400">
                        {key}
                      </span>
                    </div>
                    <div className="grid gap-4 md:grid-cols-3">
                      <label className="space-y-1">
                        <span className="text-xs font-medium text-secondary-600 dark:text-secondary-300">
                          {ta('singular')}
                        </span>
                        <input
                          className="w-full rounded-xl border border-secondary-200 bg-white px-3 py-2.5 text-sm dark:border-secondary-700 dark:bg-secondary-900"
                          disabled={isTerminologySaving}
                          onChange={event =>
                            updateTermValue(key, 'singular', event.target.value)
                          }
                          value={localized.singular}
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs font-medium text-secondary-600 dark:text-secondary-300">
                          {ta('plural')}
                        </span>
                        <input
                          className="w-full rounded-xl border border-secondary-200 bg-white px-3 py-2.5 text-sm dark:border-secondary-700 dark:bg-secondary-900"
                          disabled={isTerminologySaving}
                          onChange={event =>
                            updateTermValue(key, 'plural', event.target.value)
                          }
                          value={localized.plural}
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs font-medium text-secondary-600 dark:text-secondary-300">
                          {ta('definitePlural')}
                        </span>
                        <input
                          className="w-full rounded-xl border border-secondary-200 bg-white px-3 py-2.5 text-sm dark:border-secondary-700 dark:bg-secondary-900"
                          disabled={isTerminologySaving}
                          onChange={event =>
                            updateTermValue(
                              key,
                              'definitePlural',
                              event.target.value,
                            )
                          }
                          value={localized.definitePlural}
                        />
                      </label>
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        ) : null}

        {activeTab === 'columns' ? (
          <section
            aria-labelledby="columns-tab"
            className="rounded-[2rem] border border-secondary-200/70 bg-white/90 p-6 shadow-sm dark:border-secondary-700/60 dark:bg-secondary-900/80"
            {...devMarker({
              context: 'admin center',
              name: 'tab panel',
              priority: 340,
              value: 'columns',
            })}
            id="columns-panel"
            role="tabpanel"
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
              <div className="flex flex-wrap items-center gap-3">
                {renderSaveState(columnSaveState, ta('columnsSaveError'))}
                <button
                  className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm font-medium text-secondary-700 transition-colors hover:bg-secondary-100 dark:border-secondary-700 dark:text-secondary-200 dark:hover:bg-secondary-800 sm:w-auto sm:min-w-[44px]"
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
                <button
                  className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full bg-primary-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-800 disabled:opacity-60 sm:w-auto sm:min-w-[44px]"
                  disabled={isColumnSaving}
                  onClick={saveColumns}
                  type="button"
                >
                  <Save aria-hidden="true" className="h-4 w-4" />
                  {isColumnSaving ? tc('loading') : tc('save')}
                </button>
              </div>
            </div>

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
                      </div>
                      <div className="mt-1 text-xs text-secondary-500 dark:text-secondary-400">
                        {column.id}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        className="inline-flex h-10 w-10 min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-secondary-200 bg-white text-secondary-700 transition-colors hover:bg-secondary-100 disabled:opacity-40 dark:border-secondary-700 dark:bg-secondary-900 dark:text-secondary-200 dark:hover:bg-secondary-800"
                        disabled={isColumnSaving || index === 0}
                        onClick={() => moveColumn(column.id, -1)}
                        type="button"
                      >
                        <ArrowUp aria-hidden="true" className="h-4 w-4" />
                        <span className="sr-only">{ta('moveUp')}</span>
                      </button>
                      <button
                        className="inline-flex h-10 w-10 min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-secondary-200 bg-white text-secondary-700 transition-colors hover:bg-secondary-100 disabled:opacity-40 dark:border-secondary-700 dark:bg-secondary-900 dark:text-secondary-200 dark:hover:bg-secondary-800"
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
          </section>
        ) : null}

        {activeTab === 'referenceData' ? (
          <section
            aria-labelledby="referenceData-tab"
            className="rounded-[2rem] border border-secondary-200/70 bg-white/90 p-6 shadow-sm dark:border-secondary-700/60 dark:bg-secondary-900/80"
            {...devMarker({
              context: 'admin center',
              name: 'tab panel',
              priority: 340,
              value: 'reference data',
            })}
            id="referenceData-panel"
            role="tabpanel"
          >
            <div className="border-b border-secondary-200/70 pb-5 dark:border-secondary-700/60">
              <h2 className="text-xl font-semibold text-secondary-950 dark:text-secondary-50">
                {ta('referenceData')}
              </h2>
              <p className="mt-1 text-sm text-secondary-600 dark:text-secondary-300">
                {ta('referenceDataDescription')}
              </p>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {referenceDataItems.map(item => (
                <Link
                  className="group rounded-[1.5rem] border border-secondary-200/70 bg-[linear-gradient(155deg,rgba(248,250,252,0.95),rgba(255,255,255,0.98))] p-5 transition-transform hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-lg dark:border-secondary-700/60 dark:bg-[linear-gradient(155deg,rgba(15,23,42,0.88),rgba(30,41,59,0.88))]"
                  data-testid={`reference-data-card-${item.id}`}
                  href={item.href}
                  key={item.href}
                >
                  <div className="flex items-start gap-4">
                    <div className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-primary-200/80 bg-primary-50 text-primary-700 transition-colors group-hover:border-primary-300 group-hover:bg-primary-100 dark:border-primary-800 dark:bg-primary-950/70 dark:text-primary-300 dark:group-hover:border-primary-700 dark:group-hover:bg-primary-950">
                      <item.icon
                        aria-hidden="true"
                        className="h-5 w-5"
                        data-testid={`reference-data-icon-${item.id}`}
                      />
                    </div>
                    <div>
                      <div className="text-lg font-semibold text-secondary-950 transition-colors group-hover:text-primary-700 dark:text-secondary-50 dark:group-hover:text-primary-300">
                        {item.label}
                      </div>
                      <p className="mt-2 text-sm text-secondary-600 dark:text-secondary-300">
                        {item.description}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {activeTab === 'accessReview' ? (
          <AccessReviewPanel canManage={canManageAccessReviews} />
        ) : null}

        {activeTab === 'archiving' && canUsePrivacy ? <ArchivingPanel /> : null}

        {activeTab === 'privacy' && canUsePrivacy ? (
          <PrivacyErasurePanel />
        ) : null}
      </div>
    </div>
  )
}

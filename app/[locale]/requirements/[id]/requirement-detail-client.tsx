'use client'

import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertCircle,
  AlertTriangle,
  Archive,
  Check,
  Clock,
  Edit,
  HelpCircle,
  PackagePlus,
  Printer,
  RotateCcw,
  Share2,
  Trash2,
  X,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useConfirmModal } from '@/components/ConfirmModal'
import DeviationDecisionModal from '@/components/DeviationDecisionModal'
import DeviationFormModal from '@/components/DeviationFormModal'
import DeviationPill from '@/components/DeviationPill'
import type { DeviationStep } from '@/components/DeviationStepper'
import DeviationStepper from '@/components/DeviationStepper'
import { type HelpContent, useHelpContent } from '@/components/HelpPanel'
import StatusBadge from '@/components/StatusBadge'
import StatusStepper from '@/components/StatusStepper'
import SuggestionFormModal from '@/components/SuggestionFormModal'
import SuggestionPill from '@/components/SuggestionPill'
import SuggestionResolutionModal from '@/components/SuggestionResolutionModal'
import type { SuggestionStep } from '@/components/SuggestionStepper'
import SuggestionStepper from '@/components/SuggestionStepper'
import VersionHistory from '@/components/VersionHistory'
import { Link, useRouter } from '@/i18n/routing'
import { devMarker } from '@/lib/developer-mode-markers'
import type { RequirementDetailResponse } from '@/lib/requirements/types'

const REQUIREMENT_DETAIL_HELP: HelpContent = {
  sections: [
    {
      kind: 'text',
      bodyKey: 'requirementDetail.status.body',
      headingKey: 'requirementDetail.status.heading',
    },
    {
      kind: 'text',
      bodyKey: 'requirementDetail.versions.body',
      headingKey: 'requirementDetail.versions.heading',
    },
    {
      kind: 'text',
      bodyKey: 'requirementDetail.reports.body',
      headingKey: 'requirementDetail.reports.heading',
    },
  ],
  titleKey: 'requirementDetail.title',
}

interface StatusInfo {
  color: string | null
  id: number
  nameEn: string
  nameSv: string
}

interface TransitionTarget {
  id: number
  nameEn: string
  nameSv: string
}

interface RequirementDetailClientPropsBase {
  defaultVersion?: number
  inline?: boolean
  onChange?: () => void | Promise<void>
  onClose?: () => void
  requirementId: number | string
}

interface RequirementDetailClientStandalone
  extends RequirementDetailClientPropsBase {
  packageItemId?: undefined
  packageSlug?: undefined
}

interface RequirementDetailClientPackageItem
  extends RequirementDetailClientPropsBase {
  packageItemId: number
  packageSlug: string
}

type RequirementDetailClientProps =
  | RequirementDetailClientStandalone
  | RequirementDetailClientPackageItem

function getResponseMessage(body: unknown): string | null {
  if (typeof body === 'string') {
    const trimmed = body.trim()
    return trimmed.length > 0 ? trimmed : null
  }

  if (body && typeof body === 'object') {
    const error = (body as { error?: unknown }).error
    if (typeof error === 'string' && error.trim().length > 0) {
      return error.trim()
    }

    const message = (body as { message?: unknown }).message
    if (typeof message === 'string' && message.trim().length > 0) {
      return message.trim()
    }
  }

  return null
}

async function readResponseMessage(res: Response): Promise<string | null> {
  if (typeof res.text === 'function') {
    const text = (await res.text().catch(() => '')).trim()
    if (text.length > 0) {
      try {
        return getResponseMessage(JSON.parse(text)) ?? text
      } catch {
        return getResponseMessage(text) ?? text
      }
    }
  }

  if (typeof res.json === 'function') {
    return getResponseMessage(await res.json().catch(() => null))
  }

  return null
}

export default function RequirementDetailClient({
  defaultVersion,
  inline,
  onChange,
  onClose,
  packageItemId,
  packageSlug,
  requirementId,
}: RequirementDetailClientProps) {
  useHelpContent(inline ? null : REQUIREMENT_DETAIL_HELP)
  const t = useTranslations('requirement')
  const tc = useTranslations('common')
  const tp = useTranslations('package')
  const td = useTranslations('deviation')
  const tf = useTranslations('improvementSuggestion')
  const router = useRouter()
  const locale = useLocale()
  const { confirm } = useConfirmModal()

  const isPackageItemContext = !!packageItemId && !!packageSlug

  const localName = (
    obj: { nameSv: string | null; nameEn: string | null } | null | undefined,
  ) =>
    obj
      ? locale === 'sv'
        ? (obj.nameSv ?? obj.nameEn)
        : (obj.nameEn ?? obj.nameSv)
      : null

  const [req, setReq] = useState<RequirementDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [transitions, setTransitions] = useState<TransitionTarget[]>([])
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [copied, setCopied] = useState<'inline' | 'page' | null>(null)
  const [showShareMenu, setShowShareMenu] = useState(false)
  const shareMenuRef = useRef<HTMLDivElement>(null)
  const [showReportMenu, setShowReportMenu] = useState(false)
  const reportMenuRef = useRef<HTMLDivElement>(null)
  const [statuses, setStatuses] = useState<StatusInfo[]>([])
  const [selectedVersionNumber, setSelectedVersionNumber] = useState<
    number | null
  >(null)
  const [showAddToPackage, setShowAddToPackage] = useState(false)
  const [packages, setPackages] = useState<{ id: number; name: string }[]>([])
  const [packagesError, setPackagesError] = useState<string | null>(null)
  const [packagesLoading, setPackagesLoading] = useState(false)
  const [addToPackageId, setAddToPackageId] = useState<string>('')
  const [addToPackageNeedsRefMode, setAddToPackageNeedsRefMode] = useState<
    'none' | 'existing' | 'new'
  >('none')
  const [addToPackageNeedsRefId, setAddToPackageNeedsRefId] = useState<
    number | ''
  >('')
  const [addToPackageNeedsRefText, setAddToPackageNeedsRefText] = useState('')
  const [availableNeedsRefs, setAvailableNeedsRefs] = useState<
    { id: number; text: string }[]
  >([])
  const [needsReferencesLoading, setNeedsReferencesLoading] = useState(false)
  const [needsReferencesError, setNeedsReferencesError] = useState<
    string | null
  >(null)
  const [openHelp, setOpenHelp] = useState<Set<string>>(() => new Set())
  const [addToPackageStatus, setAddToPackageStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')
  const [addToPackageError, setAddToPackageError] = useState<string | null>(
    null,
  )
  const addToPackageDialogSessionRef = useRef(0)
  const addToPackageSubmitAbortRef = useRef<AbortController | null>(null)
  const addToPackageCloseTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null)
  const addToPackageNeedsRefsRequestIdRef = useRef(0)
  const addToPackageNeedsRefsAbortRef = useRef<AbortController | null>(null)

  // ─── Deviation workflow state ──────────────────────────────────────────────
  interface DeviationData {
    createdAt: string
    createdBy: string | null
    decidedAt: string | null
    decidedBy: string | null
    decision: number | null
    decisionMotivation: string | null
    id: number
    isReviewRequested: number
    motivation: string
  }

  const [deviations, setDeviations] = useState<DeviationData[]>([])
  const [showDeviationForm, setShowDeviationForm] = useState(false)
  const [showEditDeviationForm, setShowEditDeviationForm] = useState(false)
  const [showDecisionForm, setShowDecisionForm] = useState(false)
  const [deviationSaving, setDeviationSaving] = useState(false)
  const [deviationError, setDeviationError] = useState<string | null>(null)

  const latestDeviation = useMemo(() => {
    if (deviations.length === 0) return null
    return deviations[deviations.length - 1]
  }, [deviations])

  const deviationHistory = useMemo(
    () => (deviations.length > 1 ? deviations.slice(0, -1) : []),
    [deviations],
  )

  const deviationStep = useMemo((): DeviationStep | null => {
    if (!latestDeviation) return null
    if (latestDeviation.decision !== null) return 'decided'
    if (latestDeviation.isReviewRequested === 1) return 'review_requested'
    return 'draft'
  }, [latestDeviation])

  const deviationFetchFailed = td('fetchFailed')
  const deviationSaveFailed = td('saveFailed')
  const deviationDeleteFailed = td('deleteFailed')
  const deviationReviewFailed = td('reviewFailed')
  const deviationRevertFailed = td('revertFailed')
  const deviationDecisionFailed = td('decisionFailed')

  const fetchDeviations = useCallback(async () => {
    if (!packageItemId) return
    try {
      const res = await fetch(`/api/package-item-deviations/${packageItemId}`)
      if (res.ok) {
        setDeviationError(null)
        const data = (await res.json()) as { deviations: DeviationData[] }
        setDeviations(data.deviations)
      } else {
        setDeviationError(deviationFetchFailed)
      }
    } catch {
      setDeviationError(deviationFetchFailed)
    }
  }, [packageItemId, deviationFetchFailed])

  useEffect(() => {
    if (isPackageItemContext) {
      void fetchDeviations()
    }
  }, [isPackageItemContext, fetchDeviations])

  const handleCreateDeviation = useCallback(
    async (motivation: string, createdBy: string) => {
      if (!packageItemId || !motivation) return
      setDeviationSaving(true)
      try {
        const res = await fetch(
          `/api/package-item-deviations/${packageItemId}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              motivation,
              createdBy: createdBy || null,
            }),
          },
        )
        if (res.ok) {
          setShowDeviationForm(false)
          await fetchDeviations()
        } else {
          setDeviationError(deviationSaveFailed)
        }
      } finally {
        setDeviationSaving(false)
      }
    },
    [packageItemId, fetchDeviations, deviationSaveFailed],
  )

  const handleEditDeviation = useCallback(
    async (motivation: string, _createdBy: string) => {
      if (!latestDeviation || !motivation) return
      setDeviationSaving(true)
      try {
        const res = await fetch(`/api/deviations/${latestDeviation.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ motivation }),
        })
        if (res.ok) {
          setShowEditDeviationForm(false)
          await fetchDeviations()
        } else {
          setDeviationError(deviationSaveFailed)
        }
      } finally {
        setDeviationSaving(false)
      }
    },
    [latestDeviation, fetchDeviations, deviationSaveFailed],
  )

  const handleDeleteDeviation = useCallback(async () => {
    if (!latestDeviation) return
    const confirmed = await confirm({
      message: td('deleteDeviationConfirm'),
      title: td('deleteDeviationConfirmTitle'),
      variant: 'danger',
      icon: 'caution',
    })
    if (!confirmed) return
    setDeviationSaving(true)
    try {
      const res = await fetch(`/api/deviations/${latestDeviation.id}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        await fetchDeviations()
      } else {
        setDeviationError(deviationDeleteFailed)
      }
    } finally {
      setDeviationSaving(false)
    }
  }, [latestDeviation, fetchDeviations, confirm, td, deviationDeleteFailed])

  const handleRequestReview = useCallback(async () => {
    if (!latestDeviation) return
    setDeviationSaving(true)
    try {
      const res = await fetch(
        `/api/deviations/${latestDeviation.id}/request-review`,
        { method: 'POST' },
      )
      if (res.ok) {
        await fetchDeviations()
      } else {
        setDeviationError(deviationReviewFailed)
      }
    } finally {
      setDeviationSaving(false)
    }
  }, [latestDeviation, fetchDeviations, deviationReviewFailed])

  const handleRevertToDraft = useCallback(async () => {
    if (!latestDeviation) return
    const confirmed = await confirm({
      message: td('revertToDraftConfirm'),
      title: td('revertToDraftConfirmTitle'),
      variant: 'default',
      icon: 'warning',
    })
    if (!confirmed) return
    setDeviationSaving(true)
    try {
      const res = await fetch(
        `/api/deviations/${latestDeviation.id}/revert-to-draft`,
        { method: 'POST' },
      )
      if (res.ok) {
        await fetchDeviations()
      } else {
        setDeviationError(deviationRevertFailed)
      }
    } finally {
      setDeviationSaving(false)
    }
  }, [latestDeviation, fetchDeviations, confirm, td, deviationRevertFailed])

  const handleRecordDecision = useCallback(
    async (decision: 1 | 2, motivation: string, decidedBy: string) => {
      if (!latestDeviation) return
      setDeviationSaving(true)
      try {
        const res = await fetch(
          `/api/deviations/${latestDeviation.id}/decision`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              decision,
              decisionMotivation: motivation,
              decidedBy,
            }),
          },
        )
        if (res.ok) {
          setShowDecisionForm(false)
          await Promise.all([fetchDeviations(), onChange?.()])
        } else {
          setDeviationError(deviationDecisionFailed)
        }
      } finally {
        setDeviationSaving(false)
      }
    },
    [latestDeviation, fetchDeviations, onChange, deviationDecisionFailed],
  )

  // ─── Suggestion workflow state ──────────────────────────────────────────────
  interface SuggestionData {
    content: string
    createdAt: string
    createdBy: string | null
    id: number
    isReviewRequested: number
    requirementVersionId: number | null
    resolution: number | null
    resolutionMotivation: string | null
    resolvedAt: string | null
    resolvedBy: string | null
  }

  const [suggestionItems, setSuggestionItems] = useState<SuggestionData[]>([])
  const [showSuggestionForm, setShowSuggestionForm] = useState(false)
  const [showEditSuggestionForm, setShowEditSuggestionForm] = useState(false)
  const [editSuggestionTarget, setEditSuggestionTarget] =
    useState<SuggestionData | null>(null)
  const [showResolutionForm, setShowResolutionForm] = useState(false)
  const [resolutionTarget, setResolutionTarget] =
    useState<SuggestionData | null>(null)
  const [suggestionSaving, setSuggestionSaving] = useState(false)
  const [suggestionError, setSuggestionError] = useState<string | null>(null)

  const suggestionFetchFailed = tf('fetchFailed')
  const suggestionSaveFailed = tf('saveFailed')
  const suggestionDeleteFailed = tf('deleteFailed')
  const suggestionReviewFailed = tf('reviewFailed')
  const suggestionRevertFailed = tf('revertFailed')
  const suggestionResolutionFailed = tf('resolutionFailed')

  const fetchSuggestions = useCallback(async () => {
    try {
      const res = await fetch(`/api/requirement-suggestions/${requirementId}`)
      if (res.ok) {
        setSuggestionError(null)
        const data = (await res.json()) as { suggestions: SuggestionData[] }
        setSuggestionItems(data.suggestions)
      } else {
        setSuggestionError(suggestionFetchFailed)
      }
    } catch {
      setSuggestionError(suggestionFetchFailed)
    }
  }, [requirementId, suggestionFetchFailed])

  useEffect(() => {
    void fetchSuggestions()
  }, [fetchSuggestions])

  const performSuggestionMutation = useCallback(
    async (
      input: RequestInfo,
      init?: RequestInit,
      errorMessage?: string,
    ): Promise<boolean> => {
      const res = await fetch(input, init)
      if (!res.ok) {
        const details = await readResponseMessage(res)
        console.error('Suggestion mutation failed:', details ?? res.statusText)
        setSuggestionError(errorMessage ?? details ?? res.statusText)
        return false
      }
      await Promise.all([fetchSuggestions(), onChange?.()])
      return true
    },
    [fetchSuggestions, onChange],
  )

  const handleCreateSuggestion = useCallback(
    async (content: string, createdBy: string) => {
      if (!content) return
      setSuggestionSaving(true)
      try {
        const versionId =
          req?.versions.find(v => v.versionNumber === selectedVersionNumber)
            ?.id ?? null
        const ok = await performSuggestionMutation(
          `/api/requirement-suggestions/${requirementId}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              content,
              createdBy: createdBy || null,
              requirementVersionId: versionId,
            }),
          },
          suggestionSaveFailed,
        )
        if (ok) {
          setShowSuggestionForm(false)
        }
      } finally {
        setSuggestionSaving(false)
      }
    },
    [
      requirementId,
      req,
      selectedVersionNumber,
      performSuggestionMutation,
      suggestionSaveFailed,
    ],
  )

  const handleEditSuggestion = useCallback(
    async (content: string, _createdBy: string) => {
      if (!editSuggestionTarget || !content) return
      setSuggestionSaving(true)
      try {
        const ok = await performSuggestionMutation(
          `/api/improvement-suggestions/${editSuggestionTarget.id}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content }),
          },
          suggestionSaveFailed,
        )
        if (ok) {
          setShowEditSuggestionForm(false)
          setEditSuggestionTarget(null)
        }
      } finally {
        setSuggestionSaving(false)
      }
    },
    [editSuggestionTarget, performSuggestionMutation, suggestionSaveFailed],
  )

  const handleDeleteSuggestion = useCallback(
    async (suggestionId: number, e?: React.MouseEvent<HTMLButtonElement>) => {
      const anchorEl = e?.currentTarget
      const confirmed = await confirm({
        message: tf('deleteSuggestionConfirm'),
        title: tf('deleteSuggestionConfirmTitle'),
        variant: 'danger',
        icon: 'caution',
        anchorEl,
      })
      if (!confirmed) return
      setSuggestionSaving(true)
      try {
        await performSuggestionMutation(
          `/api/improvement-suggestions/${suggestionId}`,
          { method: 'DELETE' },
          suggestionDeleteFailed,
        )
      } finally {
        setSuggestionSaving(false)
      }
    },
    [performSuggestionMutation, confirm, tf, suggestionDeleteFailed],
  )

  const handleSuggestionRequestReview = useCallback(
    async (suggestionId: number) => {
      setSuggestionSaving(true)
      try {
        await performSuggestionMutation(
          `/api/improvement-suggestions/${suggestionId}/request-review`,
          { method: 'POST' },
          suggestionReviewFailed,
        )
      } finally {
        setSuggestionSaving(false)
      }
    },
    [performSuggestionMutation, suggestionReviewFailed],
  )

  const handleSuggestionRevertToDraft = useCallback(
    async (suggestionId: number, e?: React.MouseEvent<HTMLButtonElement>) => {
      const anchorEl = e?.currentTarget
      const confirmed = await confirm({
        message: tf('revertToDraftConfirm'),
        title: tf('revertToDraftConfirmTitle'),
        variant: 'default',
        icon: 'warning',
        anchorEl,
      })
      if (!confirmed) return
      setSuggestionSaving(true)
      try {
        await performSuggestionMutation(
          `/api/improvement-suggestions/${suggestionId}/revert-to-draft`,
          { method: 'POST' },
          suggestionRevertFailed,
        )
      } finally {
        setSuggestionSaving(false)
      }
    },
    [performSuggestionMutation, confirm, tf, suggestionRevertFailed],
  )

  const handleRecordResolution = useCallback(
    async (resolution: 1 | 2, motivation: string, resolvedBy: string) => {
      if (!resolutionTarget) return
      setSuggestionSaving(true)
      try {
        const ok = await performSuggestionMutation(
          `/api/improvement-suggestions/${resolutionTarget.id}/resolution`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              resolution,
              resolutionMotivation: motivation,
              resolvedBy,
            }),
          },
          suggestionResolutionFailed,
        )
        if (ok) {
          setShowResolutionForm(false)
          setResolutionTarget(null)
        }
      } finally {
        setSuggestionSaving(false)
      }
    },
    [resolutionTarget, performSuggestionMutation, suggestionResolutionFailed],
  )

  const getSuggestionStep = useCallback(
    (fb: SuggestionData): SuggestionStep => {
      if (fb.resolution !== null) return 'resolved'
      if (fb.isReviewRequested === 1) return 'review_requested'
      return 'draft'
    },
    [],
  )

  const clearAddToPackageCloseTimer = useCallback(() => {
    if (addToPackageCloseTimerRef.current) {
      clearTimeout(addToPackageCloseTimerRef.current)
      addToPackageCloseTimerRef.current = null
    }
  }, [])

  const resetAddToPackageSubmitSession = useCallback(() => {
    addToPackageDialogSessionRef.current += 1
    addToPackageSubmitAbortRef.current?.abort()
    addToPackageSubmitAbortRef.current = null
    clearAddToPackageCloseTimer()
  }, [clearAddToPackageCloseTimer])

  const isActiveAddToPackageSession = useCallback(
    (sessionId: number, signal?: AbortSignal) =>
      !signal?.aborted && addToPackageDialogSessionRef.current === sessionId,
    [],
  )

  const closeAddToPackageDialog = useCallback(() => {
    resetAddToPackageSubmitSession()
    addToPackageNeedsRefsAbortRef.current?.abort()
    addToPackageNeedsRefsAbortRef.current = null
    setOpenHelp(new Set())
    setShowAddToPackage(false)
  }, [resetAddToPackageSubmitSession])

  const handleModalDocumentKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== 'Escape') {
        e.stopPropagation()
      }
    },
    [],
  )

  useEffect(() => {
    return () => {
      addToPackageSubmitAbortRef.current?.abort()
      addToPackageNeedsRefsAbortRef.current?.abort()
      clearAddToPackageCloseTimer()
    }
  }, [clearAddToPackageCloseTimer])

  const handleVersionSelect = useCallback(
    (versionNumber: number) => {
      setSelectedVersionNumber(versionNumber)
      if (!inline) {
        const url = `/${locale}/requirements/${requirementId}/${versionNumber}`
        window.history.replaceState(null, '', url)
      }
    },
    [inline, locale, requirementId],
  )

  const [triangleLeft, setTriangleLeft] = useState<number | null>(null)
  const [connectorHeight, setConnectorHeight] = useState<number | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const vhRef = useRef<HTMLDivElement>(null)

  const hasDataRef = useRef(false)

  const toggleHelp = (field: string) => {
    setOpenHelp(prev => {
      const next = new Set(prev)
      if (next.has(field)) {
        next.delete(field)
      } else {
        next.add(field)
      }
      return next
    })
  }

  const helpButton = (field: string, label: string) => (
    <button
      aria-controls={`help-${field}`}
      aria-expanded={openHelp.has(field)}
      aria-label={`${tc('help')}: ${label}`}
      className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center text-secondary-400 transition-colors hover:text-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:hover:text-primary-400"
      onClick={() => toggleHelp(field)}
      type="button"
    >
      <HelpCircle aria-hidden="true" className="h-3.5 w-3.5" />
    </button>
  )

  const helpPanel = (helpKey: string, field: string) =>
    openHelp.has(field) && (
      <p
        className="mt-1 mb-2 whitespace-pre-line rounded-lg border border-secondary-200 bg-secondary-50 px-3 py-2 text-xs text-secondary-500 dark:border-secondary-700 dark:bg-secondary-800/50 dark:text-secondary-400"
        id={`help-${field}`}
      >
        {tp(helpKey)}
      </p>
    )

  const fetchRequirement = useCallback(async () => {
    if (!hasDataRef.current) setLoading(true)
    const res = await fetch(`/api/requirements/${requirementId}`)
    if (res.ok) {
      setReq((await res.json()) as RequirementDetailResponse)
      hasDataRef.current = true
    }
    setLoading(false)
  }, [requirementId])

  const fetchTransitions = useCallback(async (statusId: number) => {
    const res = await fetch(`/api/requirement-statuses`)
    if (res.ok) {
      const data = (await res.json()) as {
        statuses?: StatusInfo[]
        transitions?: { fromStatus: StatusInfo; toStatus: StatusInfo }[]
      }
      if (data.statuses) setStatuses(data.statuses)
      const allowed = (data.transitions ?? [])
        .filter(tr => tr.fromStatus.id === statusId)
        .map(tr => tr.toStatus)
      setTransitions(allowed)
    }
  }, [])

  useEffect(() => {
    fetchRequirement()
  }, [fetchRequirement])

  // Fetch transitions whenever the current status changes
  const latestStatusId = req?.versions[0]?.status ?? null
  useEffect(() => {
    if (latestStatusId !== null) {
      fetchTransitions(latestStatusId)
    }
  }, [latestStatusId, fetchTransitions])

  // Compute the default display version number (published > archived > latest)
  const STATUS_DRAFT = 1
  const STATUS_REVIEW = 2
  const STATUS_PUBLISHED = 3
  const STATUS_ARCHIVED = 4
  const displayVersionNumber = useMemo(() => {
    if (!req) return null
    // If an explicit version was requested (via URL path segment), use it
    if (defaultVersion != null) {
      const match = req.versions.find(v => v.versionNumber === defaultVersion)
      if (match) return match.versionNumber
    }
    // For the full-page view (not inline) without explicit version,
    // only show published version — return null if none exists so we
    // can display a "no published version" message.
    if (!inline) {
      const published = req.versions.find(v => v.status === STATUS_PUBLISHED)
      return published?.versionNumber ?? null
    }
    // Inline view: published > archived > latest
    const dv =
      req.versions.find(v => v.status === STATUS_PUBLISHED) ??
      req.versions.find(v => v.status === STATUS_ARCHIVED) ??
      req.versions[0]
    return dv?.versionNumber ?? null
  }, [req, defaultVersion, inline])

  // Reset selected version when requirement data changes
  useEffect(() => {
    if (displayVersionNumber !== null) {
      setSelectedVersionNumber(displayVersionNumber)
    }
  }, [displayVersionNumber])

  // Measure triangle position pointing from card to selected version pill
  useEffect(() => {
    function measure() {
      const card = cardRef.current
      const vh = vhRef.current
      if (!card || !vh || selectedVersionNumber === null) {
        setTriangleLeft(null)
        return
      }

      // Reset any previously injected collision margins
      const allPills = vh.querySelectorAll(
        '[data-version-number]',
      ) as NodeListOf<HTMLElement>
      for (const p of allPills) {
        p.style.marginLeft = ''
      }

      const pill = vh.querySelector(
        `[data-version-number="${selectedVersionNumber}"]`,
      ) as HTMLElement | null
      if (!pill) {
        setTriangleLeft(null)
        return
      }

      const cardRect = card.getBoundingClientRect()
      const pillRect = pill.getBoundingClientRect()

      const firstPill = vh.querySelector(
        '[data-version-number]',
      ) as HTMLElement | null
      const wrapped =
        firstPill != null &&
        pillRect.top > firstPill.getBoundingClientRect().bottom

      // Line x relative to card: left-edge aligned when wrapped, centered otherwise
      const left = wrapped
        ? pillRect.left + 8 - cardRect.left
        : pillRect.left + pillRect.width / 2 - cardRect.left

      if (wrapped) {
        // Check if the vertical line collides with a top-row pill
        const firstPillTop = firstPill
          ? firstPill.getBoundingClientRect().top
          : 0
        for (const p of allPills) {
          const pRect = p.getBoundingClientRect()
          if (Math.abs(pRect.top - firstPillTop) > 4) continue
          const pLeft = pRect.left - cardRect.left
          const pRight = pLeft + pRect.width
          if (left >= pLeft - 2 && left <= pRight + 2) {
            // Shift this pill right just enough to clear the line (2px wide + 3px gap)
            const needed = left + 5 - pLeft
            if (needed > 0) {
              p.style.marginLeft = `${needed}px`
            }
            break
          }
        }

        // Re-read positions after possible reflow
        const updatedPillRect = pill.getBoundingClientRect()
        const updatedCardRect = card.getBoundingClientRect()
        const updatedLeft = updatedPillRect.left + 8 - updatedCardRect.left
        setTriangleLeft(
          Math.max(16, Math.min(updatedLeft, updatedCardRect.width - 16)),
        )
        const arrowTipOffset = 12
        setConnectorHeight(
          updatedPillRect.top - updatedCardRect.bottom - arrowTipOffset,
        )
      } else {
        setTriangleLeft(Math.max(16, Math.min(left, cardRect.width - 16)))
        setConnectorHeight(null)
      }
    }
    measure()
    const handleResizeObserver: ResizeObserverCallback = (
      _entries,
      _observer,
    ) => {
      measure()
    }
    const ro = new ResizeObserver(handleResizeObserver)
    if (vhRef.current) ro.observe(vhRef.current)
    if (cardRef.current) ro.observe(cardRef.current)
    // Re-measure when VersionHistory children change (expand/collapse toggles)
    const handleMutationObserver: MutationCallback = (
      _mutations,
      _observer,
    ) => {
      measure()
    }
    const mo = new MutationObserver(handleMutationObserver)
    if (vhRef.current)
      mo.observe(vhRef.current, { childList: true, subtree: true })
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      mo.disconnect()
      window.removeEventListener('resize', measure)
      // Reset any injected collision margins on cleanup
      if (vhRef.current) {
        const pills = vhRef.current.querySelectorAll(
          '[data-version-number]',
        ) as NodeListOf<HTMLElement>
        for (const p of pills) p.style.marginLeft = ''
      }
    }
  }, [selectedVersionNumber])

  // Close share menu when clicking outside
  useEffect(() => {
    if (!showShareMenu) return
    const handleClickOutside = (e: MouseEvent) => {
      if (
        shareMenuRef.current &&
        !shareMenuRef.current.contains(e.target as Node)
      ) {
        setShowShareMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showShareMenu])

  // Close report menu when clicking outside
  useEffect(() => {
    if (!showReportMenu) return
    const handleClickOutside = (e: MouseEvent) => {
      if (
        reportMenuRef.current &&
        !reportMenuRef.current.contains(e.target as Node)
      ) {
        setShowReportMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showReportMenu])

  // Filter suggestions to those linked to the currently selected version
  const selectedVersionId = req?.versions.find(
    v => v.versionNumber === selectedVersionNumber,
  )?.id
  const versionSuggestionItems = useMemo(
    () =>
      selectedVersionId != null
        ? suggestionItems.filter(
            s => s.requirementVersionId === selectedVersionId,
          )
        : suggestionItems,
    [suggestionItems, selectedVersionId],
  )

  if (loading) {
    const loadingContent = (
      <p className="text-secondary-600 dark:text-secondary-400 py-12 text-center">
        {tc('loading')}
      </p>
    )
    if (inline) {
      return loadingContent
    }
    if (onClose) {
      return (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm"
          onClick={onClose}
          onKeyDown={e => e.key === 'Escape' && onClose()}
          role="dialog"
        >
          <div
            className="relative mt-16 w-full max-w-5xl max-h-[calc(100vh-8rem)] overflow-y-auto rounded-2xl bg-white dark:bg-secondary-900 shadow-2xl"
            onClick={e => e.stopPropagation()}
            onKeyDown={handleModalDocumentKeyDown}
            role="document"
          >
            {loadingContent}
          </div>
        </div>
      )
    }
    return (
      <div className="section-padding px-4 sm:px-6 lg:px-8">
        <div className="container-custom">{loadingContent}</div>
      </div>
    )
  }

  if (!req) {
    const emptyContent = (
      <p className="text-secondary-600 dark:text-secondary-400 py-12 text-center">
        {tc('noResults')}
      </p>
    )
    if (inline) {
      return emptyContent
    }
    if (onClose) {
      return (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm"
          onClick={onClose}
          onKeyDown={e => e.key === 'Escape' && onClose()}
          role="dialog"
        >
          <div
            className="relative mt-16 w-full max-w-5xl max-h-[calc(100vh-8rem)] overflow-y-auto rounded-2xl bg-white dark:bg-secondary-900 shadow-2xl"
            onClick={e => e.stopPropagation()}
            onKeyDown={handleModalDocumentKeyDown}
            role="document"
          >
            {emptyContent}
          </div>
        </div>
      )
    }
    return (
      <div className="section-padding px-4 sm:px-6 lg:px-8">
        <div className="container-custom">{emptyContent}</div>
      </div>
    )
  }

  const latest = req.versions[0]
  const latestStatusForActions = latest?.status ?? STATUS_DRAFT
  const isLatestVersionArchived = latestStatusForActions === STATUS_ARCHIVED
  const isArchiving =
    req.versions.some(v => v.archiveInitiatedAt != null) ||
    latestStatusForActions === STATUS_ARCHIVED

  // Whether there's a pending draft or review version
  const hasPendingWork = req.versions.some(
    v => v.status === STATUS_DRAFT || v.status === STATUS_REVIEW,
  )
  // Whether there's a published version with newer pending work on top
  const publishedVersion = req.versions.find(v => v.status === STATUS_PUBLISHED)
  const hasPendingWorkAbovePublished =
    publishedVersion != null && hasPendingWork

  // Display version priority: Published > Archived > latest (draft/review)
  const displayVersion =
    req.versions.find(v => v.status === STATUS_PUBLISHED) ??
    req.versions.find(v => v.status === STATUS_ARCHIVED) ??
    latest

  // The version currently being viewed (controlled by pill selection)
  const selectedVersion =
    req.versions.find(v => v.versionNumber === selectedVersionNumber) ??
    displayVersion

  const newerVersionsThanSelected =
    selectedVersion == null
      ? []
      : req.versions.filter(
          version => version.versionNumber > selectedVersion.versionNumber,
        )

  const archivedVersionPreferredVersion =
    selectedVersion?.status === STATUS_ARCHIVED
      ? (newerVersionsThanSelected.find(
          version => version.status === STATUS_PUBLISHED,
        ) ??
        newerVersionsThanSelected.find(
          version => version.status === STATUS_REVIEW,
        ) ??
        newerVersionsThanSelected.find(
          version => version.status === STATUS_DRAFT,
        ) ??
        null)
      : null

  const archivedVersionBannerKey =
    archivedVersionPreferredVersion?.status === STATUS_PUBLISHED
      ? 'publishedVersionAvailableBanner'
      : archivedVersionPreferredVersion?.status === STATUS_REVIEW
        ? 'reviewVersionAvailableBanner'
        : archivedVersionPreferredVersion?.status === STATUS_DRAFT
          ? 'draftVersionAvailableBanner'
          : null

  const showsArchivedVersionAvailabilityBanner =
    archivedVersionPreferredVersion != null && archivedVersionBannerKey != null

  const hasPendingVersion =
    latest?.versionNumber != null &&
    displayVersion?.versionNumber != null &&
    latest.versionNumber !== displayVersion.versionNumber
  const pendingVersionNumber = latest?.versionNumber
  const pendingStatusLabel = hasPendingVersion
    ? ((locale === 'sv' ? latest?.statusNameSv : latest?.statusNameEn) ?? '')
    : ''

  const selectedViewVersionNumber = selectedVersion?.versionNumber ?? null
  const displayViewVersionNumber = displayVersion?.versionNumber ?? null
  const latestViewVersionNumber = latest?.versionNumber ?? null

  // Whether the user is viewing the latest (newest) version
  const isViewingLatest =
    selectedViewVersionNumber != null &&
    latestViewVersionNumber != null &&
    selectedViewVersionNumber === latestViewVersionNumber

  const isViewingDisplayVersion =
    selectedViewVersionNumber != null &&
    displayViewVersionNumber != null &&
    selectedViewVersionNumber === displayViewVersionNumber

  // Determine if the user is viewing a historical (non-default, non-latest) version
  const isViewingHistory =
    selectedViewVersionNumber != null &&
    displayViewVersionNumber != null &&
    latestViewVersionNumber != null &&
    selectedViewVersionNumber !== displayViewVersionNumber &&
    selectedViewVersionNumber !== latestViewVersionNumber

  const currentVersionNumber = selectedViewVersionNumber ?? 1
  const currentStatusId = selectedVersion?.status ?? STATUS_DRAFT
  const currentStatusLabel =
    (locale === 'sv'
      ? selectedVersion?.statusNameSv
      : selectedVersion?.statusNameEn) ?? ''
  const currentStatusColor = selectedVersion?.statusColor ?? null
  const canAddToPackage =
    currentStatusId === STATUS_PUBLISHED && isViewingDisplayVersion
  const detailContext =
    req == null
      ? undefined
      : inline
        ? `requirements table > inline detail pane: ${req.uniqueId}`
        : `requirement detail: ${req.uniqueId}`

  const buildDetailSectionContext = (sectionName: string) =>
    detailContext
      ? `${detailContext} > detail section: ${sectionName}`
      : undefined

  const getTransitionActionDeveloperModeValue = (
    transition: TransitionTarget,
  ) => {
    switch (transition.id) {
      case STATUS_DRAFT:
        return 'move to draft'
      case STATUS_REVIEW:
        return 'move to review'
      case STATUS_PUBLISHED:
        return 'publish'
      case STATUS_ARCHIVED:
        return 'archive'
      default:
        return `move to ${transition.nameEn.toLowerCase()}`
    }
  }

  const handleArchive = async (e?: React.MouseEvent<HTMLButtonElement>) => {
    const anchorEl = e?.currentTarget
    if (
      !(await confirm({
        message: t('archiveInitiateConfirm'),
        variant: 'danger',
        icon: 'caution',
        anchorEl,
      }))
    )
      return
    await fetch(`/api/requirements/${requirementId}`, { method: 'DELETE' })
    // Stay on the page — the requirement enters archiving review
    await Promise.all([fetchRequirement(), onChange?.()])
  }

  const handleApproveArchiving = async (
    e?: React.MouseEvent<HTMLButtonElement>,
  ) => {
    const anchorEl = e?.currentTarget
    if (
      !(await confirm({
        message: t('approveArchivingConfirm'),
        variant: 'danger',
        icon: 'caution',
        anchorEl,
      }))
    )
      return
    setIsTransitioning(true)
    try {
      await fetch(`/api/requirement-transitions/${requirementId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statusId: STATUS_ARCHIVED }),
      })
      await onChange?.()
      if (onClose) onClose()
      else router.push('/requirements')
    } finally {
      setIsTransitioning(false)
    }
  }

  const handleCancelArchiving = async (
    e?: React.MouseEvent<HTMLButtonElement>,
  ) => {
    const anchorEl = e?.currentTarget
    if (
      !(await confirm({
        message: t('cancelArchivingConfirm'),
        anchorEl,
      }))
    )
      return
    setIsTransitioning(true)
    try {
      await fetch(`/api/requirement-transitions/${requirementId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statusId: STATUS_PUBLISHED }),
      })
      await Promise.all([fetchRequirement(), onChange?.()])
    } finally {
      setIsTransitioning(false)
    }
  }

  const handleDeleteDraft = async (e?: React.MouseEvent<HTMLButtonElement>) => {
    const anchorEl = e?.currentTarget
    if (
      !(await confirm({
        message: t('deleteDraftConfirm'),
        variant: 'danger',
        icon: 'caution',
        anchorEl,
      }))
    )
      return
    const res = await fetch(`/api/requirements/${requirementId}/delete-draft`, {
      method: 'POST',
    })
    if (res.ok) {
      const data = (await res.json()) as { deleted?: string }
      if (data.deleted === 'requirement') {
        await onChange?.()
        if (onClose) onClose()
        else router.push('/requirements')
      } else {
        await Promise.all([fetchRequirement(), onChange?.()])
      }
    }
  }

  const handleTransition = async (
    targetStatusId: number,
    anchorEl?: HTMLElement,
  ) => {
    // Require confirmation when sending back from Review to Draft
    if (
      targetStatusId === STATUS_DRAFT &&
      latestStatusForActions === STATUS_REVIEW
    ) {
      if (
        !(await confirm({
          message: t('sendBackToDraftConfirm'),
          anchorEl,
        }))
      )
        return
    }
    // Require confirmation when publishing from Review
    if (targetStatusId === STATUS_PUBLISHED) {
      if (
        !(await confirm({
          message: t('publishConfirm'),
          icon: 'warning',
          anchorEl,
        }))
      )
        return
    }
    setIsTransitioning(true)
    try {
      await fetch(`/api/requirement-transitions/${requirementId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statusId: targetStatusId }),
      })
      await Promise.all([fetchRequirement(), onChange?.()])
    } finally {
      setIsTransitioning(false)
    }
  }

  const handleRestore = async (
    versionNumber: number,
    anchorEl?: HTMLElement,
  ) => {
    if (
      !(await confirm({
        message: t('restoreConfirm'),
        icon: 'info',
        defaultCancel: true,
        anchorEl,
      }))
    )
      return
    await fetch(`/api/requirements/${requirementId}/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ versionNumber }),
    })
    await Promise.all([fetchRequirement(), onChange?.()])
  }

  const handleShare = async (mode: 'inline' | 'page') => {
    const url = new URL(window.location.href)
    url.search = ''
    const shareUniqueId = req.uniqueId
    if (mode === 'inline') {
      url.pathname = `/${locale}/requirements`
      url.searchParams.set('selected', shareUniqueId)
    } else {
      const versionSuffix =
        selectedVersionNumber != null ? `/${selectedVersionNumber}` : ''
      url.pathname = `/${locale}/requirements/${shareUniqueId}${versionSuffix}`
    }
    try {
      await navigator.clipboard.writeText(url.toString())
      setCopied(mode)
    } catch {
      setCopied(null)
    }
    setShowShareMenu(false)
    setTimeout(() => setCopied(null), 2000)
  }

  // Full-page view without explicit version: if no published version exists,
  // show a notice instead of the requirement content.
  if (!inline && defaultVersion == null && displayVersionNumber == null) {
    const noPublishedContent = (
      <div className="py-12 text-center space-y-4">
        <h1 className="text-2xl font-bold text-secondary-900 dark:text-secondary-100">
          {req.uniqueId}
        </h1>
        <p className="text-secondary-600 dark:text-secondary-400">
          {t('noPublishedVersion')}
        </p>
      </div>
    )
    return (
      <div className="section-padding px-4 sm:px-6 lg:px-8">
        <div className="container-custom">{noPublishedContent}</div>
      </div>
    )
  }

  const handleOpenAddToPackage = async () => {
    resetAddToPackageSubmitSession()
    addToPackageNeedsRefsAbortRef.current?.abort()
    addToPackageNeedsRefsAbortRef.current = null
    addToPackageNeedsRefsRequestIdRef.current += 1
    setAddToPackageId('')
    setAddToPackageNeedsRefMode('none')
    setAddToPackageNeedsRefId('')
    setAddToPackageNeedsRefText('')
    setAvailableNeedsRefs([])
    setNeedsReferencesLoading(false)
    setNeedsReferencesError(null)
    setOpenHelp(new Set())
    setAddToPackageStatus('idle')
    setAddToPackageError(null)
    setPackagesError(null)
    setShowAddToPackage(true)
    if (packages.length === 0) {
      setPackagesLoading(true)
      try {
        const res = await fetch('/api/requirement-packages')
        if (!res.ok) {
          const details = await readResponseMessage(res)
          throw new Error(
            details
              ? `${tp('loadPackagesFailed')}: ${details}`
              : tp('loadPackagesFailed'),
          )
        }
        const data = (await res.json()) as {
          packages?: { id: number; name: string }[]
        }
        setPackages(data.packages ?? [])
      } catch (error) {
        console.error(
          'Failed to load packages for add-to-package dialog',
          error,
        )
        setPackages([])
        setPackagesError(
          error instanceof Error ? error.message : tp('loadPackagesFailed'),
        )
      } finally {
        setPackagesLoading(false)
      }
    }
  }

  const handlePackageSelect = async (pkgId: string) => {
    addToPackageNeedsRefsAbortRef.current?.abort()
    addToPackageNeedsRefsAbortRef.current = null
    addToPackageNeedsRefsRequestIdRef.current += 1
    const requestId = addToPackageNeedsRefsRequestIdRef.current
    setAddToPackageId(pkgId)
    setAddToPackageNeedsRefMode('none')
    setAddToPackageNeedsRefId('')
    setAddToPackageNeedsRefText('')
    setAvailableNeedsRefs([])
    setNeedsReferencesLoading(false)
    setNeedsReferencesError(null)
    if (!pkgId) {
      return
    }

    const controller = new AbortController()
    addToPackageNeedsRefsAbortRef.current = controller
    setNeedsReferencesLoading(true)

    try {
      const res = await fetch(
        `/api/requirement-packages/${pkgId}/needs-references`,
        { signal: controller.signal },
      )
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string
        } | null
        throw new Error(data?.error ?? tp('failedToLoadNeedsReferences'))
      }
      const data = (await res.json()) as {
        needsReferences: { id: number; text: string }[]
      }
      if (
        controller.signal.aborted ||
        addToPackageNeedsRefsRequestIdRef.current !== requestId
      ) {
        return
      }
      setAvailableNeedsRefs(data.needsReferences)
    } catch (error) {
      if ((error as { name?: string }).name !== 'AbortError') {
        console.error(
          'Failed to load needs references for add-to-package dialog',
          error,
        )
        if (
          !controller.signal.aborted &&
          addToPackageNeedsRefsRequestIdRef.current === requestId
        ) {
          setNeedsReferencesError(
            error instanceof Error
              ? error.message
              : tp('failedToLoadNeedsReferences'),
          )
        }
      }
    } finally {
      if (addToPackageNeedsRefsAbortRef.current === controller) {
        addToPackageNeedsRefsAbortRef.current = null
      }
      if (
        !controller.signal.aborted &&
        addToPackageNeedsRefsRequestIdRef.current === requestId
      ) {
        setNeedsReferencesLoading(false)
      }
    }
  }

  const handleSubmitAddToPackage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!addToPackageId || !req) return
    const sessionId = addToPackageDialogSessionRef.current
    addToPackageSubmitAbortRef.current?.abort()
    const controller = new AbortController()
    addToPackageSubmitAbortRef.current = controller
    clearAddToPackageCloseTimer()
    setAddToPackageStatus('loading')
    setAddToPackageError(null)
    const body: {
      requirementIds: number[]
      needsReferenceId?: number | null
      needsReferenceText?: string | null
    } = { requirementIds: [req.id] }
    if (
      addToPackageNeedsRefMode === 'existing' &&
      addToPackageNeedsRefId !== ''
    ) {
      body.needsReferenceId = Number(addToPackageNeedsRefId)
    } else if (
      addToPackageNeedsRefMode === 'new' &&
      addToPackageNeedsRefText.trim()
    ) {
      body.needsReferenceText = addToPackageNeedsRefText.trim()
    }
    try {
      const res = await fetch(
        `/api/requirement-packages/${addToPackageId}/items`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        },
      )
      if (!isActiveAddToPackageSession(sessionId, controller.signal)) {
        return
      }
      if (res.ok) {
        setAddToPackageStatus('success')
        addToPackageCloseTimerRef.current = setTimeout(() => {
          if (addToPackageDialogSessionRef.current === sessionId) {
            closeAddToPackageDialog()
          }
        }, 1200)
      } else {
        const data = (await res.json().catch(() => null)) as {
          error?: string
        } | null
        if (!isActiveAddToPackageSession(sessionId, controller.signal)) {
          return
        }
        setAddToPackageError(data?.error ?? tc('error'))
        setAddToPackageStatus('error')
      }
    } catch (error) {
      if ((error as { name?: string }).name === 'AbortError') {
        return
      }
      if (!isActiveAddToPackageSession(sessionId, controller.signal)) {
        return
      }
      setAddToPackageError(tc('error'))
      setAddToPackageStatus('error')
    } finally {
      if (addToPackageSubmitAbortRef.current === controller) {
        addToPackageSubmitAbortRef.current = null
      }
    }
  }

  const addToPackageDialog =
    typeof window !== 'undefined'
      ? createPortal(
          <AnimatePresence>
            {showAddToPackage ? (
              <motion.div
                animate={{ opacity: 1 }}
                aria-modal="true"
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
                exit={{ opacity: 0 }}
                initial={{ opacity: 0 }}
                onClick={closeAddToPackageDialog}
                onKeyDown={e => {
                  if (e.key === 'Escape') {
                    closeAddToPackageDialog()
                  }
                }}
                role="dialog"
                transition={{ duration: 0.16 }}
              >
                <motion.div
                  animate={{ opacity: 1, scale: 1 }}
                  className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-2xl dark:bg-secondary-900"
                  exit={{ opacity: 0, scale: 0.96 }}
                  initial={{ opacity: 0, scale: 0.96 }}
                  onClick={e => e.stopPropagation()}
                  onKeyDown={handleModalDocumentKeyDown}
                  role="document"
                  transition={{ duration: 0.16, ease: 'easeOut' }}
                >
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-secondary-900 dark:text-secondary-100">
                      {tp('addToPackage')}
                    </h2>
                    <button
                      aria-label={tc('close')}
                      className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg p-1.5 transition-colors hover:bg-secondary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:hover:bg-secondary-800"
                      onClick={closeAddToPackageDialog}
                      type="button"
                    >
                      <X aria-hidden="true" className="h-4 w-4" />
                    </button>
                  </div>
                  {addToPackageStatus === 'success' ? (
                    <p className="py-2 text-sm text-green-600 dark:text-green-400">
                      {tp('addToPackageSuccess')}
                    </p>
                  ) : packagesLoading ? (
                    <p className="py-2 text-sm text-secondary-500 dark:text-secondary-400">
                      {tp('loadingPackages')}
                    </p>
                  ) : packagesError ? (
                    <p
                      className="py-2 text-sm text-red-600 dark:text-red-400"
                      role="alert"
                    >
                      {packagesError}
                    </p>
                  ) : packages.length === 0 ? (
                    <p className="py-2 text-sm text-secondary-500 dark:text-secondary-400">
                      {tp('noPackagesAvailable')}
                    </p>
                  ) : (
                    <form
                      className="space-y-4"
                      onSubmit={handleSubmitAddToPackage}
                    >
                      <div>
                        <div className="mb-1 flex items-center gap-1.5">
                          <label
                            className="block text-sm font-medium text-secondary-700 dark:text-secondary-300"
                            htmlFor="atp-package"
                          >
                            {tp('selectPackage')} *
                          </label>
                          {helpButton('atp-package', tp('selectPackage'))}
                        </div>
                        {helpPanel('selectPackageHelp', 'atp-package')}
                        <select
                          className="min-h-[44px] w-full rounded-xl border border-secondary-200 bg-white px-3.5 py-2.5 text-sm text-secondary-900 transition-all duration-200 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-400/50 dark:border-secondary-700 dark:bg-secondary-800/50 dark:text-secondary-100"
                          id="atp-package"
                          onChange={e =>
                            void handlePackageSelect(e.target.value)
                          }
                          value={addToPackageId}
                        >
                          <option value="">—</option>
                          {packages.map(p => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <div className="mb-1 flex items-center gap-1.5">
                          <label
                            className="block text-sm font-medium text-secondary-700 dark:text-secondary-300"
                            htmlFor="atp-needs-ref"
                          >
                            {tp('needsReferenceLabel')}
                          </label>
                          {helpButton(
                            'atp-needs-ref',
                            tp('needsReferenceLabel'),
                          )}
                        </div>
                        {helpPanel('needsReferenceHelp', 'atp-needs-ref')}
                        <select
                          className="min-h-[44px] w-full rounded-xl border border-secondary-200 bg-white px-3.5 py-2.5 text-sm text-secondary-900 transition-all duration-200 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-400/50 dark:border-secondary-700 dark:bg-secondary-800/50 dark:text-secondary-100"
                          id="atp-needs-ref"
                          onChange={e => {
                            const v = e.target.value
                            if (v === 'none') {
                              setAddToPackageNeedsRefMode('none')
                              setAddToPackageNeedsRefId('')
                            } else if (v === 'new') {
                              setAddToPackageNeedsRefMode('new')
                              setAddToPackageNeedsRefId('')
                            } else {
                              setAddToPackageNeedsRefMode('existing')
                              setAddToPackageNeedsRefId(Number(v))
                            }
                          }}
                          value={
                            addToPackageNeedsRefMode === 'existing'
                              ? String(addToPackageNeedsRefId)
                              : addToPackageNeedsRefMode
                          }
                        >
                          <option value="none">{tp('noNeedsRef')}</option>
                          <option value="new">{tp('newNeedsRef')}</option>
                          {availableNeedsRefs.map(ref => (
                            <option key={ref.id} value={String(ref.id)}>
                              {ref.text}
                            </option>
                          ))}
                        </select>
                        {needsReferencesLoading ? (
                          <p className="mt-2 text-sm text-secondary-500 dark:text-secondary-400">
                            {tp('loadingNeedsReferences')}
                          </p>
                        ) : needsReferencesError ? (
                          <p
                            className="mt-2 text-sm text-red-600 dark:text-red-400"
                            role="alert"
                          >
                            {needsReferencesError}
                          </p>
                        ) : null}
                        {addToPackageNeedsRefMode === 'new' && (
                          <>
                            <div className="mt-2 mb-1 flex items-center gap-1.5">
                              <label
                                className="block text-sm font-medium text-secondary-700 dark:text-secondary-300"
                                htmlFor="atp-needs-ref-text"
                              >
                                {tp('addNeedsRefTextLabel')}
                              </label>
                              {helpButton(
                                'atp-needs-ref-text',
                                tp('addNeedsRefTextLabel'),
                              )}
                            </div>
                            {helpPanel(
                              'addNeedsRefTextHelp',
                              'atp-needs-ref-text',
                            )}
                            <textarea
                              className="w-full resize-none rounded-xl border border-secondary-200 bg-white px-3.5 py-2.5 text-sm text-secondary-900 transition-all duration-200 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-400/50 dark:border-secondary-700 dark:bg-secondary-800/50 dark:text-secondary-100"
                              id="atp-needs-ref-text"
                              onChange={e =>
                                setAddToPackageNeedsRefText(e.target.value)
                              }
                              rows={2}
                              value={addToPackageNeedsRefText}
                            />
                          </>
                        )}
                      </div>
                      {addToPackageError && (
                        <p
                          className="text-sm text-red-600 dark:text-red-400"
                          role="alert"
                        >
                          {addToPackageError}
                        </p>
                      )}
                      <div className="flex gap-3 pt-1">
                        <button
                          className="btn-primary"
                          disabled={
                            !addToPackageId || addToPackageStatus === 'loading'
                          }
                          type="submit"
                        >
                          {addToPackageStatus === 'loading'
                            ? tc('loading')
                            : tp('addToPackage')}
                        </button>
                        <button
                          className="min-h-11 rounded-xl border px-4 py-2.5 text-sm transition-all focus-visible:ring-2 focus-visible:ring-primary-400/50 dark:hover:border-secondary-600 dark:hover:bg-secondary-800 dark:hover:text-secondary-100"
                          onClick={closeAddToPackageDialog}
                          type="button"
                        >
                          {tc('cancel')}
                        </button>
                      </div>
                    </form>
                  )}
                </motion.div>
              </motion.div>
            ) : null}
          </AnimatePresence>,
          document.body,
        )
      : null

  const content = (
    <div
      className={
        onClose && !inline
          ? 'p-6 sm:p-8'
          : inline
            ? 'px-6 py-4'
            : 'section-padding px-4 sm:px-6 lg:px-8'
      }
    >
      <div
        className={onClose && !inline ? '' : inline ? '' : 'container-custom'}
      >
        {!inline && (
          <div className="flex items-center gap-3 mb-6">
            <h1 className="text-2xl font-bold text-secondary-900 dark:text-secondary-100">
              {req.uniqueId}
            </h1>
            <StatusBadge
              color={currentStatusColor}
              label={currentStatusLabel}
            />
          </div>
        )}

        {/* Lifecycle progress bar */}
        <div className={`mb-5 ${inline ? '' : ''}`}>
          {showsArchivedVersionAvailabilityBanner ? (
            <div className="flex items-center gap-2 mb-2 px-1 text-xs text-secondary-500 dark:text-secondary-400">
              <AlertCircle
                className="h-3.5 w-3.5 shrink-0"
                style={{
                  color:
                    archivedVersionPreferredVersion.statusColor ?? undefined,
                }}
              />
              <span>
                {t(archivedVersionBannerKey, {
                  version: String(
                    archivedVersionPreferredVersion.versionNumber,
                  ),
                })}
                {' — '}
                {t('displayedVersion')}{' '}
                <span className="font-medium">v{currentVersionNumber}</span>
              </span>
            </div>
          ) : isViewingHistory ? (
            <div className="flex items-center gap-2 mb-2 px-1 text-xs text-secondary-500 dark:text-secondary-400">
              <Clock
                className="h-3.5 w-3.5 shrink-0"
                style={{ color: currentStatusColor ?? undefined }}
              />
              <span>
                {t('viewingOlderVersion', {
                  version: String(currentVersionNumber),
                })}
              </span>
            </div>
          ) : null}
          {hasPendingVersion &&
            isViewingDisplayVersion &&
            !showsArchivedVersionAvailabilityBanner && (
              <div className="flex items-center gap-2 mb-2 px-1 text-xs text-secondary-500 dark:text-secondary-400">
                <AlertCircle
                  className="h-3.5 w-3.5 shrink-0"
                  style={{ color: latest?.statusColor ?? undefined }}
                />
                <span>
                  {t('pendingVersionBanner', {
                    version: String(pendingVersionNumber),
                    status: pendingStatusLabel,
                  })}
                  {' — '}
                  {t('displayedVersion')}{' '}
                  <span className="font-medium">v{currentVersionNumber}</span>
                </span>
              </div>
            )}
          {isPackageItemContext && deviationStep ? (
            <DeviationStepper
              currentStep={deviationStep}
              developerModeContext={detailContext}
            />
          ) : !isPackageItemContext ? (
            <StatusStepper
              currentStatusId={currentStatusId}
              developerModeContext={detailContext}
              statuses={
                statuses.length === 0
                  ? statuses
                  : isArchiving || currentStatusId === STATUS_ARCHIVED
                    ? [3, 2, 4]
                        .map(id => statuses.find(s => s.id === id))
                        .filter(
                          (s): s is (typeof statuses)[number] => s != null,
                        )
                    : statuses.filter(s => s.id !== STATUS_ARCHIVED)
              }
            />
          ) : null}
        </div>

        {/* Deviation pill (above main content, only in package item context) */}
        {isPackageItemContext && latestDeviation && (
          <div className="mb-4">
            <DeviationPill
              developerModeContext={detailContext}
              history={deviationHistory}
              latest={latestDeviation}
            />
          </div>
        )}

        <div className="grid grid-cols-1 gap-6">
          {/* Main content */}
          <div className="space-y-6">
            <div className="relative flex flex-col sm:flex-row gap-3">
              <div
                className="relative flex-1 min-w-0 bg-white/80 dark:bg-secondary-900/60 backdrop-blur-sm rounded-2xl border shadow-sm p-6 space-y-5"
                ref={cardRef}
              >
                <div
                  {...devMarker({
                    context: detailContext,
                    name: 'detail section',
                    priority: 350,
                    value: 'requirement text',
                  })}
                >
                  <h3 className="text-sm font-medium text-secondary-600 dark:text-secondary-400 mb-1">
                    {t('description')}
                  </h3>
                  <p className="text-secondary-900 dark:text-secondary-100 whitespace-pre-wrap">
                    {selectedVersion?.description ?? '—'}
                  </p>
                </div>

                <div
                  {...devMarker({
                    context: detailContext,
                    name: 'detail section',
                    priority: 350,
                    value: 'acceptance criteria',
                  })}
                >
                  <h3 className="text-sm font-medium text-secondary-600 dark:text-secondary-400 mb-1">
                    {t('acceptanceCriteria')}
                  </h3>
                  <p className="text-secondary-900 dark:text-secondary-100 whitespace-pre-wrap">
                    {selectedVersion?.acceptanceCriteria ?? '—'}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-3 gap-y-4">
                  {req.area && (
                    <div
                      {...devMarker({
                        context: detailContext,
                        name: 'detail section',
                        priority: 350,
                        value: 'area',
                      })}
                    >
                      <h3 className="text-sm font-medium text-secondary-600 dark:text-secondary-400 mb-1">
                        {t('area')}
                      </h3>
                      <p className="text-secondary-900 dark:text-secondary-100">
                        {req.area.name}
                      </p>
                      {req.area.ownerName && (
                        <p className="text-xs text-secondary-500 dark:text-secondary-400 mt-0.5">
                          {t('areaOwner')}: {req.area.ownerName}
                        </p>
                      )}
                    </div>
                  )}
                  <div
                    {...devMarker({
                      context: detailContext,
                      name: 'detail section',
                      priority: 350,
                      value: 'category',
                    })}
                  >
                    <h3 className="text-sm font-medium text-secondary-600 dark:text-secondary-400 mb-1">
                      {t('category')}
                    </h3>
                    <p className="text-secondary-900 dark:text-secondary-100">
                      {localName(selectedVersion?.category) ?? '—'}
                    </p>
                  </div>
                  {selectedVersion?.type && (
                    <div
                      {...devMarker({
                        context: detailContext,
                        name: 'detail section',
                        priority: 350,
                        value: 'type',
                      })}
                    >
                      <h3 className="text-sm font-medium text-secondary-600 dark:text-secondary-400 mb-1">
                        {t('type')}
                      </h3>
                      <p className="text-secondary-900 dark:text-secondary-100">
                        {localName(selectedVersion.type)}
                      </p>
                    </div>
                  )}
                  <div
                    {...devMarker({
                      context: detailContext,
                      name: 'detail section',
                      priority: 350,
                      value: 'quality characteristic',
                    })}
                  >
                    <h3 className="text-sm font-medium text-secondary-600 dark:text-secondary-400 mb-1">
                      {t('qualityCharacteristic')}
                    </h3>
                    <p className="text-secondary-900 dark:text-secondary-100">
                      {selectedVersion?.qualityCharacteristic
                        ? localName(selectedVersion.qualityCharacteristic)
                        : '—'}
                    </p>
                  </div>
                  <div
                    {...devMarker({
                      context: detailContext,
                      name: 'detail section',
                      priority: 350,
                      value: 'risk level',
                    })}
                  >
                    <h3 className="text-sm font-medium text-secondary-600 dark:text-secondary-400 mb-1">
                      {t('riskLevel')}
                    </h3>
                    <p className="text-secondary-900 dark:text-secondary-100 inline-flex items-center gap-1.5">
                      {selectedVersion?.riskLevel ? (
                        <>
                          {selectedVersion.riskLevel.color && (
                            <span
                              className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                              style={{
                                backgroundColor:
                                  selectedVersion.riskLevel.color,
                              }}
                            />
                          )}
                          {localName(selectedVersion.riskLevel)}
                        </>
                      ) : (
                        '—'
                      )}
                    </p>
                  </div>
                  <div
                    {...devMarker({
                      context: detailContext,
                      name: 'detail section',
                      priority: 350,
                      value: 'requires testing',
                    })}
                  >
                    <h3 className="text-sm font-medium text-secondary-600 dark:text-secondary-400 mb-1">
                      {t('requiresTesting')}
                    </h3>
                    <p className="text-secondary-900 dark:text-secondary-100">
                      {selectedVersion?.requiresTesting ? tc('yes') : tc('no')}
                    </p>
                  </div>
                  <div
                    {...devMarker({
                      context: detailContext,
                      name: 'detail section',
                      priority: 350,
                      value: 'verification method',
                    })}
                  >
                    <h3 className="text-sm font-medium text-secondary-600 dark:text-secondary-400 mb-1">
                      {t('verificationMethod')}
                    </h3>
                    <p className="text-secondary-900 dark:text-secondary-100">
                      {selectedVersion?.verificationMethod || '—'}
                    </p>
                  </div>
                  <div
                    {...devMarker({
                      context: detailContext,
                      name: 'detail section',
                      priority: 350,
                      value: 'package count',
                    })}
                  >
                    <h3 className="text-sm font-medium text-secondary-600 dark:text-secondary-400 mb-1">
                      {t('packageCount')}
                    </h3>
                    <p className="text-secondary-900 dark:text-secondary-100">
                      {req.packageCount ?? 0}
                    </p>
                  </div>
                </div>

                <div
                  {...devMarker({
                    context: detailContext,
                    name: 'detail section',
                    priority: 355,
                    value: 'normReferences',
                  })}
                >
                  <h3 className="text-sm font-medium text-secondary-600 dark:text-secondary-400 mb-1">
                    {t('normReferences')}
                  </h3>
                  {selectedVersion?.versionNormReferences &&
                  selectedVersion.versionNormReferences.length > 0 ? (
                    <ul className="flex flex-wrap gap-2">
                      {selectedVersion.versionNormReferences.map(vnr => (
                        <li
                          className="text-xs bg-secondary-100 dark:bg-secondary-800 px-2.5 py-1 rounded-full font-medium"
                          key={`normref-chip-${vnr.normReference.id}`}
                          title={`${vnr.normReference.name} (${vnr.normReference.reference})`}
                          {...devMarker({
                            context: detailContext,
                            name: 'normref-chip',
                            priority: 354,
                            value: vnr.normReference.normReferenceId,
                          })}
                        >
                          {vnr.normReference.uri ? (
                            <a
                              className="underline hover:text-primary-600 dark:hover:text-primary-400"
                              href={vnr.normReference.uri}
                              rel="noopener noreferrer"
                              target="_blank"
                            >
                              {vnr.normReference.normReferenceId}
                            </a>
                          ) : (
                            vnr.normReference.normReferenceId
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-secondary-500 dark:text-secondary-400">
                      {tc('noneAvailable')}
                    </p>
                  )}
                </div>

                <div
                  {...devMarker({
                    context: detailContext,
                    name: 'detail section',
                    priority: 350,
                    value: 'scenarios',
                  })}
                >
                  <h3 className="text-sm font-medium text-secondary-600 dark:text-secondary-400 mb-1">
                    {t('scenario')}
                  </h3>
                  {selectedVersion?.versionScenarios &&
                  selectedVersion.versionScenarios.length > 0 ? (
                    <ul className="flex flex-wrap gap-2">
                      {selectedVersion.versionScenarios.map(vs => (
                        <li
                          className="text-xs bg-secondary-100 dark:bg-secondary-800 px-2.5 py-1 rounded-full font-medium"
                          key={`scenario-chip-${vs.scenario.id}`}
                          {...devMarker({
                            context: buildDetailSectionContext('scenarios'),
                            name: 'scenario chip',
                            priority: 360,
                            value: vs.scenario.nameEn,
                          })}
                        >
                          {localName(vs.scenario)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-secondary-500 dark:text-secondary-400">
                      {tc('noneAvailable')}
                    </p>
                  )}
                </div>

                {/* Downward triangle indicator pointing to selected version pill */}
                {triangleLeft !== null && (
                  <div
                    className="absolute -bottom-1.75 -translate-x-1/2 pointer-events-none z-10"
                    style={{
                      left: triangleLeft,
                      transition: 'left 200ms ease',
                    }}
                  >
                    <div className="w-3 h-3 rotate-45 bg-white dark:bg-secondary-900 border-b border-r border-secondary-200 dark:border-secondary-700" />
                  </div>
                )}
              </div>

              {/* Dotted vertical connector from arrow tip to wrapped pill */}
              {triangleLeft !== null &&
                connectorHeight !== null &&
                connectorHeight > 0 && (
                  <div
                    className="absolute pointer-events-none z-10"
                    style={{
                      left: `calc(${triangleLeft}px + 0.1px)`,
                      top: 'calc(100% + 12px)',
                      height: connectorHeight,
                      transition: 'left 200ms ease, height 200ms ease',
                      borderLeft: '2px dotted var(--color-secondary-400)',
                    }}
                  />
                )}

              {/* Action buttons column */}
              {isPackageItemContext ? (
                <div className="flex flex-col gap-2 shrink-0">
                  {/* Print button — always available */}
                  <div className="relative" ref={reportMenuRef}>
                    <button
                      className="btn-secondary inline-flex items-center gap-1.5 w-full justify-center min-h-[44px] min-w-[44px]"
                      onClick={() => setShowReportMenu(prev => !prev)}
                      title={tc('print')}
                      type="button"
                    >
                      <Printer aria-hidden="true" className="h-4 w-4" />
                      {tc('print')}
                    </button>
                    {showReportMenu && (
                      <div className="absolute right-0 z-20 mt-1 w-64 rounded-xl border bg-white dark:bg-secondary-800 shadow-lg py-1">
                        {deviationStep === 'review_requested' ? (
                          <>
                            <button
                              className="flex items-center gap-2 w-full px-3 py-2 min-h-[44px] text-sm text-left hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors"
                              onClick={() => {
                                setShowReportMenu(false)
                                window.open(
                                  `/${locale}/requirements/reports/print/deviation-review/${requirementId}?pkg=${packageSlug}&item=${packageItemId}`,
                                  '_blank',
                                )
                              }}
                              type="button"
                            >
                              <Printer aria-hidden="true" className="h-4 w-4" />
                              {td('printDeviationReviewReport')}
                            </button>
                            <button
                              className="flex items-center gap-2 w-full px-3 py-2 min-h-[44px] text-sm text-left hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors"
                              onClick={() => {
                                setShowReportMenu(false)
                                window.open(
                                  `/${locale}/requirements/reports/pdf/deviation-review/${requirementId}?pkg=${packageSlug}&item=${packageItemId}`,
                                  '_blank',
                                )
                              }}
                              type="button"
                            >
                              <Printer aria-hidden="true" className="h-4 w-4" />
                              {td('downloadDeviationReviewReportPdf')}
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              className="flex items-center gap-2 w-full px-3 py-2 min-h-[44px] text-sm text-left hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors"
                              onClick={() => {
                                setShowReportMenu(false)
                                window.open(
                                  `/${locale}/requirements/reports/print/history/${requirementId}`,
                                  '_blank',
                                )
                              }}
                              type="button"
                            >
                              <Printer aria-hidden="true" className="h-4 w-4" />
                              {t('printHistoryReport')}
                            </button>
                            <button
                              className="flex items-center gap-2 w-full px-3 py-2 min-h-[44px] text-sm text-left hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors"
                              onClick={() => {
                                setShowReportMenu(false)
                                window.open(
                                  `/${locale}/requirements/reports/pdf/history/${requirementId}`,
                                  '_blank',
                                )
                              }}
                              type="button"
                            >
                              <Printer aria-hidden="true" className="h-4 w-4" />
                              {t('downloadHistoryReportPdf')}
                            </button>
                            <div className="border-t border-secondary-200 dark:border-secondary-700 my-1" />
                            <button
                              className="flex items-center gap-2 w-full px-3 py-2 min-h-[44px] text-sm text-left hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors"
                              onClick={() => {
                                setShowReportMenu(false)
                                window.open(
                                  `/${locale}/requirements/reports/print/suggestion-history/${requirementId}`,
                                  '_blank',
                                )
                              }}
                              type="button"
                            >
                              <Printer aria-hidden="true" className="h-4 w-4" />
                              {t('printSuggestionHistoryReport')}
                            </button>
                            <button
                              className="flex items-center gap-2 w-full px-3 py-2 min-h-[44px] text-sm text-left hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors"
                              onClick={() => {
                                setShowReportMenu(false)
                                window.open(
                                  `/${locale}/requirements/reports/pdf/suggestion-history/${requirementId}`,
                                  '_blank',
                                )
                              }}
                              type="button"
                            >
                              <Printer aria-hidden="true" className="h-4 w-4" />
                              {t('downloadSuggestionHistoryReportPdf')}
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  {/* Deviation workflow buttons */}
                  {deviationError && (
                    <p
                      className="text-sm text-red-600 dark:text-red-400"
                      role="alert"
                    >
                      {deviationError}
                    </p>
                  )}
                  {deviationStep === null || deviationStep === 'decided' ? (
                    <button
                      className="inline-flex items-center gap-1.5 w-full justify-center rounded-xl border border-amber-500 bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600 hover:border-amber-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 disabled:opacity-50 min-h-[44px] min-w-[44px]"
                      disabled={deviationSaving}
                      onClick={() => setShowDeviationForm(true)}
                      type="button"
                    >
                      <AlertTriangle aria-hidden="true" className="h-4 w-4" />
                      {td('requestDeviation')}
                    </button>
                  ) : deviationStep === 'draft' ? (
                    <>
                      <button
                        className="inline-flex items-center gap-1.5 w-full justify-center rounded-xl border border-amber-500 bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600 hover:border-amber-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 disabled:opacity-50 min-h-[44px] min-w-[44px]"
                        disabled={deviationSaving}
                        onClick={() => setShowEditDeviationForm(true)}
                        type="button"
                      >
                        <Edit aria-hidden="true" className="h-4 w-4" />
                        {td('editDeviation')}
                      </button>
                      <button
                        className="btn-secondary inline-flex items-center gap-1.5 w-full justify-center text-red-600 dark:text-red-400 border-red-200 dark:border-red-800/60 hover:bg-red-50 dark:hover:bg-red-950/20 min-h-[44px] min-w-[44px]"
                        disabled={deviationSaving}
                        onClick={() => void handleDeleteDeviation()}
                        type="button"
                      >
                        <Trash2 aria-hidden="true" className="h-4 w-4" />
                        {td('deleteDeviation')}
                      </button>
                      <button
                        className="btn-primary inline-flex items-center gap-1.5 w-full justify-center"
                        disabled={deviationSaving}
                        onClick={handleRequestReview}
                        type="button"
                      >
                        {td('requestReview')}
                      </button>
                    </>
                  ) : deviationStep === 'review_requested' ? (
                    <>
                      <button
                        className="btn-secondary inline-flex items-center gap-1.5 w-full justify-center"
                        disabled={deviationSaving}
                        onClick={handleRevertToDraft}
                        type="button"
                      >
                        {td('revertToDraft')}
                      </button>
                      <button
                        className="btn-primary inline-flex items-center gap-1.5 w-full justify-center"
                        disabled={deviationSaving}
                        onClick={() => setShowDecisionForm(true)}
                        type="button"
                      >
                        {td('markDecided')}
                      </button>
                    </>
                  ) : null}
                  {/* Deviation creation modal */}
                  <DeviationFormModal
                    loading={deviationSaving}
                    onClose={() => setShowDeviationForm(false)}
                    onSubmit={handleCreateDeviation}
                    open={showDeviationForm}
                    riskLevel={
                      selectedVersion?.riskLevel
                        ? {
                            color: selectedVersion.riskLevel.color,
                            name: localName(selectedVersion.riskLevel),
                          }
                        : null
                    }
                  />
                  {/* Deviation edit modal */}
                  <DeviationFormModal
                    initialCreatedBy={latestDeviation?.createdBy ?? ''}
                    initialMotivation={latestDeviation?.motivation ?? ''}
                    loading={deviationSaving}
                    onClose={() => setShowEditDeviationForm(false)}
                    onSubmit={handleEditDeviation}
                    open={showEditDeviationForm}
                    riskLevel={
                      selectedVersion?.riskLevel
                        ? {
                            color: selectedVersion.riskLevel.color,
                            name: localName(selectedVersion.riskLevel),
                          }
                        : null
                    }
                    title={td('editDeviation')}
                  />
                  {/* Decision modal */}
                  <DeviationDecisionModal
                    loading={deviationSaving}
                    onClose={() => setShowDecisionForm(false)}
                    onSubmit={handleRecordDecision}
                    open={showDecisionForm}
                  />
                </div>
              ) : (
                <div className="flex flex-col gap-2 shrink-0">
                  <div className="relative" ref={reportMenuRef}>
                    <button
                      className="btn-secondary inline-flex items-center gap-1.5 w-full justify-center min-h-[44px] min-w-[44px]"
                      {...devMarker({
                        context: detailContext,
                        name: 'report print button',
                        priority: 290,
                        value: 'reports',
                      })}
                      onClick={() => setShowReportMenu(prev => !prev)}
                      title={tc('print')}
                      type="button"
                    >
                      <Printer aria-hidden="true" className="h-4 w-4" />
                      {tc('print')}
                    </button>
                    {showReportMenu && (
                      <div className="absolute right-0 z-20 mt-1 w-64 rounded-xl border bg-white dark:bg-secondary-800 shadow-lg py-1">
                        <button
                          className="flex items-center gap-2 w-full px-3 py-2 min-h-[44px] text-sm text-left hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors"
                          {...devMarker({
                            context: detailContext,
                            name: 'report option',
                            priority: 295,
                            value: 'print history',
                          })}
                          onClick={() => {
                            setShowReportMenu(false)
                            window.open(
                              `/${locale}/requirements/reports/print/history/${requirementId}`,
                              '_blank',
                            )
                          }}
                          type="button"
                        >
                          <Printer aria-hidden="true" className="h-4 w-4" />
                          {t('printHistoryReport')}
                        </button>
                        <button
                          className="flex items-center gap-2 w-full px-3 py-2 min-h-[44px] text-sm text-left hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors"
                          {...devMarker({
                            context: detailContext,
                            name: 'report option',
                            priority: 296,
                            value: 'download history pdf',
                          })}
                          onClick={() => {
                            setShowReportMenu(false)
                            window.open(
                              `/${locale}/requirements/reports/pdf/history/${requirementId}`,
                              '_blank',
                            )
                          }}
                          type="button"
                        >
                          <Printer aria-hidden="true" className="h-4 w-4" />
                          {t('downloadHistoryReportPdf')}
                        </button>
                        <div className="border-t border-secondary-200 dark:border-secondary-700 my-1" />
                        <button
                          className="flex items-center gap-2 w-full px-3 py-2 min-h-[44px] text-sm text-left hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors"
                          {...devMarker({
                            context: detailContext,
                            name: 'report option',
                            priority: 299,
                            value: 'print suggestion history',
                          })}
                          onClick={() => {
                            setShowReportMenu(false)
                            window.open(
                              `/${locale}/requirements/reports/print/suggestion-history/${requirementId}`,
                              '_blank',
                            )
                          }}
                          type="button"
                        >
                          <Printer aria-hidden="true" className="h-4 w-4" />
                          {t('printSuggestionHistoryReport')}
                        </button>
                        <button
                          className="flex items-center gap-2 w-full px-3 py-2 min-h-[44px] text-sm text-left hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors"
                          {...devMarker({
                            context: detailContext,
                            name: 'report option',
                            priority: 300,
                            value: 'download suggestion history pdf',
                          })}
                          onClick={() => {
                            setShowReportMenu(false)
                            window.open(
                              `/${locale}/requirements/reports/pdf/suggestion-history/${requirementId}`,
                              '_blank',
                            )
                          }}
                          type="button"
                        >
                          <Printer aria-hidden="true" className="h-4 w-4" />
                          {t('downloadSuggestionHistoryReportPdf')}
                        </button>
                        {currentStatusId === STATUS_REVIEW && (
                          <>
                            <div className="border-t border-secondary-200 dark:border-secondary-700 my-1" />
                            <button
                              className="flex items-center gap-2 w-full px-3 py-2 min-h-[44px] text-sm text-left hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors"
                              {...devMarker({
                                context: detailContext,
                                name: 'report option',
                                priority: 297,
                                value: 'print review',
                              })}
                              onClick={() => {
                                setShowReportMenu(false)
                                window.open(
                                  `/${locale}/requirements/reports/print/review/${requirementId}`,
                                  '_blank',
                                )
                              }}
                              type="button"
                            >
                              <Printer aria-hidden="true" className="h-4 w-4" />
                              {t('printReviewReport')}
                            </button>
                            <button
                              className="flex items-center gap-2 w-full px-3 py-2 min-h-[44px] text-sm text-left hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors"
                              {...devMarker({
                                context: detailContext,
                                name: 'report option',
                                priority: 298,
                                value: 'download review pdf',
                              })}
                              onClick={() => {
                                setShowReportMenu(false)
                                window.open(
                                  `/${locale}/requirements/reports/pdf/review/${requirementId}`,
                                  '_blank',
                                )
                              }}
                              type="button"
                            >
                              <Printer aria-hidden="true" className="h-4 w-4" />
                              {t('downloadReviewReportPdf')}
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  {canAddToPackage && (
                    <button
                      className="btn-secondary inline-flex items-center gap-1.5 w-full justify-center min-h-[44px] min-w-[44px]"
                      {...devMarker({
                        context: detailContext,
                        name: 'detail action',
                        priority: 360,
                        value: 'add to package',
                      })}
                      onClick={handleOpenAddToPackage}
                      title={tp('addToPackage')}
                      type="button"
                    >
                      <PackagePlus aria-hidden="true" className="h-4 w-4" />
                      {tp('addToPackage')}
                    </button>
                  )}
                  <div className="relative" ref={shareMenuRef}>
                    <button
                      className="btn-secondary inline-flex items-center gap-1.5 w-full justify-center min-h-[44px] min-w-[44px]"
                      {...devMarker({
                        context: detailContext,
                        name: 'share toggle',
                        priority: 300,
                        value: 'share',
                      })}
                      onClick={() => setShowShareMenu(prev => !prev)}
                      title={tc('share')}
                      type="button"
                    >
                      {copied ? (
                        <Check
                          aria-hidden="true"
                          className="h-4 w-4 text-green-500"
                        />
                      ) : (
                        <Share2 aria-hidden="true" className="h-4 w-4" />
                      )}
                      {copied ? tc('copied') : tc('share')}
                    </button>
                    {showShareMenu && (
                      <div className="absolute right-0 z-20 mt-1 w-52 rounded-xl border bg-white dark:bg-secondary-800 shadow-lg py-1">
                        <button
                          className="flex items-center gap-2 w-full px-3 py-2 min-h-[44px] min-w-[44px] text-sm text-left hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors"
                          {...devMarker({
                            context: detailContext,
                            name: 'share option',
                            priority: 310,
                            value: 'share inline',
                          })}
                          onClick={() => handleShare('inline')}
                          type="button"
                        >
                          {copied === 'inline' ? (
                            <Check
                              aria-hidden="true"
                              className="h-4 w-4 text-green-500"
                            />
                          ) : (
                            <Share2 aria-hidden="true" className="h-4 w-4" />
                          )}
                          {t('shareLinkInline')}
                        </button>
                        <button
                          className="flex items-center gap-2 w-full px-3 py-2 min-h-[44px] min-w-[44px] text-sm text-left hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors"
                          {...devMarker({
                            context: detailContext,
                            name: 'share option',
                            priority: 310,
                            value: 'share page',
                          })}
                          onClick={() => handleShare('page')}
                          type="button"
                        >
                          {copied === 'page' ? (
                            <Check
                              aria-hidden="true"
                              className="h-4 w-4 text-green-500"
                            />
                          ) : (
                            <Share2 aria-hidden="true" className="h-4 w-4" />
                          )}
                          {t('shareLinkPage')}
                        </button>
                      </div>
                    )}
                  </div>
                  {isViewingHistory ? (
                    <>
                      <button
                        className={`btn-secondary inline-flex items-center gap-1.5 w-full justify-center${hasPendingWork ? ' opacity-60 cursor-not-allowed' : ''}`}
                        {...devMarker({
                          context: detailContext,
                          name: 'detail action',
                          priority: 360,
                          value: 'restore version',
                        })}
                        disabled={hasPendingWork}
                        onClick={e =>
                          handleRestore(
                            selectedVersion?.versionNumber ?? 0,
                            e.currentTarget as HTMLElement,
                          )
                        }
                        title={
                          hasPendingWork
                            ? t('restoreBlockedByPendingWork')
                            : undefined
                        }
                        type="button"
                      >
                        <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
                        {tc('restoreVersion')}
                      </button>
                      <button
                        className="btn-primary inline-flex items-center gap-1.5 w-full justify-center"
                        {...devMarker({
                          context: detailContext,
                          name: 'detail action',
                          priority: 360,
                          value: 'back to latest',
                        })}
                        onClick={() =>
                          handleVersionSelect(
                            displayVersion?.versionNumber ?? 1,
                          )
                        }
                        type="button"
                      >
                        {t('backToLatest')}
                      </button>
                    </>
                  ) : !isLatestVersionArchived ? (
                    isArchiving && isViewingLatest ? (
                      <>
                        <button
                          className="btn-primary inline-flex items-center gap-1.5 w-full justify-center"
                          {...devMarker({
                            context: detailContext,
                            name: 'detail action',
                            priority: 360,
                            value: 'approve archiving',
                          })}
                          disabled={isTransitioning}
                          onClick={handleApproveArchiving}
                          title={t('approveArchivingTooltip')}
                          type="button"
                        >
                          <Archive aria-hidden="true" className="h-4 w-4" />
                          {t('approveArchiving')}
                        </button>
                        <button
                          className="btn-secondary inline-flex items-center gap-1.5 w-full justify-center"
                          {...devMarker({
                            context: detailContext,
                            name: 'detail action',
                            priority: 360,
                            value: 'cancel archiving',
                          })}
                          disabled={isTransitioning}
                          onClick={handleCancelArchiving}
                          title={t('cancelArchivingTooltip')}
                          type="button"
                        >
                          <RotateCcw
                            aria-hidden="true"
                            className="h-3.5 w-3.5"
                          />
                          {t('cancelArchiving')}
                        </button>
                      </>
                    ) : (
                      <>
                        {isViewingLatest &&
                          transitions
                            .filter(tr => tr.id !== STATUS_ARCHIVED)
                            .filter(
                              tr =>
                                !(
                                  latestStatusForActions === STATUS_PUBLISHED &&
                                  tr.id === STATUS_REVIEW
                                ),
                            )
                            .map(tr => (
                              <button
                                className="btn-secondary inline-flex items-center gap-1.5 w-full justify-center"
                                key={`transition-action-${tr.id}`}
                                {...devMarker({
                                  context: detailContext,
                                  name: 'detail action',
                                  priority: 360,
                                  value:
                                    getTransitionActionDeveloperModeValue(tr),
                                })}
                                disabled={isTransitioning}
                                onClick={e =>
                                  handleTransition(tr.id, e.currentTarget)
                                }
                                title={t(`transitionTooltip${tr.nameSv}`)}
                                type="button"
                              >
                                {t(`transitionTo${tr.nameSv}`)}
                              </button>
                            ))}
                        {currentStatusId !== STATUS_REVIEW &&
                          (hasPendingWorkAbovePublished &&
                          !isViewingLatest &&
                          currentStatusId === STATUS_PUBLISHED ? (
                            <button
                              className="btn-primary inline-flex items-center gap-1.5 w-full justify-center opacity-60 cursor-not-allowed"
                              {...devMarker({
                                context: detailContext,
                                name: 'detail action',
                                priority: 360,
                                value: 'edit',
                              })}
                              disabled
                              title={t('editBlockedByPendingWork')}
                              type="button"
                            >
                              <Edit aria-hidden="true" className="h-4 w-4" />
                              {tc('edit')}
                            </button>
                          ) : (
                            <Link
                              className="btn-primary inline-flex items-center gap-1.5 w-full justify-center"
                              {...devMarker({
                                context: detailContext,
                                name: 'detail action',
                                priority: 360,
                                value: 'edit',
                              })}
                              href={`/requirements/${req.uniqueId}/edit`}
                              title={tc('editTooltip')}
                            >
                              <span className="contents">
                                <Edit aria-hidden="true" className="h-4 w-4" />
                                {tc('edit')}
                              </span>
                            </Link>
                          ))}
                        {isViewingLatest &&
                          latestStatusForActions === STATUS_PUBLISHED && (
                            <button
                              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border text-sm font-medium text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition-all duration-200 w-full justify-center"
                              {...devMarker({
                                context: detailContext,
                                name: 'detail action',
                                priority: 360,
                                value: 'archive',
                              })}
                              onClick={handleArchive}
                              title={tc('archiveTooltip')}
                              type="button"
                            >
                              <Archive aria-hidden="true" className="h-4 w-4" />
                              {tc('archive')}
                            </button>
                          )}
                        {hasPendingWorkAbovePublished &&
                          !isViewingLatest &&
                          currentStatusId === STATUS_PUBLISHED && (
                            <button
                              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border text-sm font-medium text-secondary-400 dark:text-secondary-500 cursor-not-allowed opacity-60 w-full justify-center"
                              disabled
                              title={t('archiveBlockedByPendingWork')}
                              type="button"
                            >
                              <Archive aria-hidden="true" className="h-4 w-4" />
                              {tc('archive')}
                            </button>
                          )}
                        {currentStatusId === STATUS_DRAFT &&
                          isViewingLatest && (
                            <button
                              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border text-sm font-medium text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition-all duration-200 w-full justify-center"
                              {...devMarker({
                                context: detailContext,
                                name: 'detail action',
                                priority: 360,
                                value: 'delete draft',
                              })}
                              onClick={handleDeleteDraft}
                              type="button"
                            >
                              <Trash2 aria-hidden="true" className="h-4 w-4" />
                              {tc('delete')}
                            </button>
                          )}
                      </>
                    )
                  ) : (
                    <button
                      className={`btn-secondary inline-flex items-center gap-1.5 w-full justify-center${hasPendingWork ? ' opacity-60 cursor-not-allowed' : ''}`}
                      {...devMarker({
                        context: detailContext,
                        name: 'detail action',
                        priority: 360,
                        value: 'restore version',
                      })}
                      disabled={hasPendingWork}
                      onClick={e =>
                        handleRestore(
                          selectedVersion?.versionNumber ?? 0,
                          e.currentTarget as HTMLElement,
                        )
                      }
                      title={
                        hasPendingWork
                          ? t('restoreBlockedByPendingWork')
                          : undefined
                      }
                      type="button"
                    >
                      <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
                      {tc('restoreVersion')}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Version history */}
            <VersionHistory
              developerModeContext={detailContext}
              onVersionSelect={handleVersionSelect}
              ref={vhRef}
              selectedVersionNumber={
                selectedVersionNumber ?? currentVersionNumber
              }
              versions={req.versions}
            />

            {/* Improvement suggestions section */}
            <section
              aria-label="improvement-suggestions"
              className="bg-white/80 dark:bg-secondary-900/60 backdrop-blur-sm rounded-2xl border shadow-sm p-6 space-y-4"
              {...devMarker({
                context: detailContext,
                name: 'detail section',
                priority: 350,
                value: 'improvement-suggestions',
              })}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-secondary-900 dark:text-secondary-100">
                  {tf('title')}
                  {versionSuggestionItems.length > 0 && (
                    <span className="ml-2 text-xs font-normal text-secondary-500 dark:text-secondary-400">
                      ({versionSuggestionItems.length})
                    </span>
                  )}
                </h3>
                <button
                  className="btn-primary text-xs px-3 py-1.5 min-h-[44px] inline-flex items-center"
                  disabled={suggestionSaving}
                  onClick={() => setShowSuggestionForm(true)}
                  type="button"
                >
                  + {tf('newSuggestion')}
                </button>
              </div>

              {suggestionError && (
                <p
                  className="mt-2 text-sm text-red-600 dark:text-red-400"
                  role="alert"
                >
                  {suggestionError}
                </p>
              )}

              {!suggestionError && versionSuggestionItems.length === 0 ? (
                <p className="text-sm text-secondary-500 dark:text-secondary-400">
                  {tf('noSuggestions')}
                </p>
              ) : (
                <div className="space-y-4">
                  {versionSuggestionItems.map(fb => {
                    const step = getSuggestionStep(fb)
                    const isResolved = fb.resolution !== null
                    return (
                      <div className="space-y-2" key={fb.id}>
                        <SuggestionStepper
                          currentStep={step}
                          developerModeContext={detailContext}
                        />
                        <SuggestionPill
                          developerModeContext={detailContext}
                          step={step}
                          suggestion={fb}
                        />
                        {!isResolved && (
                          <div className="flex flex-wrap gap-2">
                            {step === 'draft' && (
                              <>
                                <button
                                  className="text-xs btn-secondary px-3 py-1 min-h-[44px] inline-flex items-center"
                                  disabled={suggestionSaving}
                                  onClick={() => {
                                    setEditSuggestionTarget(fb)
                                    setShowEditSuggestionForm(true)
                                  }}
                                  type="button"
                                >
                                  {tf('editSuggestion')}
                                </button>
                                <button
                                  className="text-xs btn-secondary px-3 py-1 min-h-[44px] inline-flex items-center text-red-600 dark:text-red-400"
                                  disabled={suggestionSaving}
                                  onClick={e =>
                                    void handleDeleteSuggestion(fb.id, e)
                                  }
                                  type="button"
                                >
                                  {tf('deleteSuggestion')}
                                </button>
                                <button
                                  className="text-xs btn-primary px-3 py-1 min-h-[44px] inline-flex items-center"
                                  disabled={suggestionSaving}
                                  onClick={() =>
                                    void handleSuggestionRequestReview(fb.id)
                                  }
                                  type="button"
                                >
                                  {tf('requestReview')}
                                </button>
                              </>
                            )}
                            {step === 'review_requested' && (
                              <>
                                <button
                                  className="text-xs btn-secondary px-3 py-1 min-h-[44px] inline-flex items-center"
                                  disabled={suggestionSaving}
                                  onClick={e =>
                                    void handleSuggestionRevertToDraft(fb.id, e)
                                  }
                                  type="button"
                                >
                                  {tf('revertToDraft')}
                                </button>
                                <button
                                  className="text-xs btn-primary px-3 py-1 min-h-[44px] inline-flex items-center"
                                  disabled={suggestionSaving}
                                  onClick={() => {
                                    setResolutionTarget(fb)
                                    setShowResolutionForm(true)
                                  }}
                                  type="button"
                                >
                                  {tf('markResolved')}
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </section>

            {/* Suggestion modals */}
            <SuggestionFormModal
              loading={suggestionSaving}
              onClose={() => setShowSuggestionForm(false)}
              onSubmit={handleCreateSuggestion}
              open={showSuggestionForm}
            />
            <SuggestionFormModal
              initialContent={editSuggestionTarget?.content ?? ''}
              initialCreatedBy={editSuggestionTarget?.createdBy ?? ''}
              loading={suggestionSaving}
              onClose={() => {
                setShowEditSuggestionForm(false)
                setEditSuggestionTarget(null)
              }}
              onSubmit={handleEditSuggestion}
              open={showEditSuggestionForm}
              title={tf('editSuggestion')}
            />
            <SuggestionResolutionModal
              loading={suggestionSaving}
              onClose={() => {
                setShowResolutionForm(false)
                setResolutionTarget(null)
              }}
              onSubmit={handleRecordResolution}
              open={showResolutionForm}
            />
          </div>
        </div>
      </div>
    </div>
  )

  if (inline) {
    return (
      <>
        {content}
        {addToPackageDialog}
      </>
    )
  }

  if (onClose) {
    return (
      <>
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm"
          onClick={onClose}
          onKeyDown={e => e.key === 'Escape' && onClose()}
          role="dialog"
        >
          <div
            className="relative mt-8 mb-8 w-full max-w-5xl max-h-[calc(100vh-4rem)] overflow-y-auto rounded-2xl bg-white dark:bg-secondary-900 shadow-2xl"
            onClick={e => e.stopPropagation()}
            onKeyDown={handleModalDocumentKeyDown}
            role="document"
          >
            <button
              aria-label={tc('close')}
              className="sticky top-0 z-10 float-right mt-4 mr-4 inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-secondary-100 p-2 transition-colors hover:bg-secondary-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:bg-secondary-800 dark:hover:bg-secondary-700 dark:focus-visible:ring-offset-secondary-900"
              onClick={onClose}
              type="button"
            >
              <X
                aria-hidden="true"
                className="h-5 w-5 text-secondary-600 dark:text-secondary-300"
              />
            </button>
            {content}
          </div>
        </div>
        {addToPackageDialog}
      </>
    )
  }

  return (
    <>
      {content}
      {addToPackageDialog}
    </>
  )
}

'use client'

import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertCircle,
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
import StatusBadge from '@/components/StatusBadge'
import StatusStepper from '@/components/StatusStepper'
import VersionHistory from '@/components/VersionHistory'
import { Link, useRouter } from '@/i18n/routing'
import { devMarker } from '@/lib/developer-mode-markers'

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

interface RequirementDetail {
  area: { name: string; ownerName: string | null } | null
  id: number
  isArchived: boolean
  uniqueId: string
  versions: {
    id: number
    versionNumber: number
    description: string | null
    acceptanceCriteria: string | null
    requiresTesting: boolean
    verificationMethod: string | null
    category: { nameSv: string; nameEn: string } | null
    type: { nameSv: string; nameEn: string } | null
    qualityCharacteristic: { nameSv: string; nameEn: string } | null
    ownerName: string | null
    status: number
    statusNameSv: string | null
    statusNameEn: string | null
    statusColor: string | null
    createdAt: string
    editedAt: string | null
    publishedAt: string | null
    archivedAt: string | null
    archiveInitiatedAt: string | null
    references: { id: number; name: string; uri: string | null }[]
    versionScenarios: {
      scenario: { id: number; nameSv: string; nameEn: string }
    }[]
  }[]
}

interface RequirementDetailClientProps {
  defaultVersion?: number
  inline?: boolean
  onChange?: () => void | Promise<void>
  onClose?: () => void
  requirementId: number | string
}

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
  requirementId,
}: RequirementDetailClientProps) {
  const t = useTranslations('requirement')
  const tc = useTranslations('common')
  const tp = useTranslations('package')
  const router = useRouter()
  const locale = useLocale()
  const { confirm } = useConfirmModal()

  const localName = (
    obj: { nameSv: string; nameEn: string } | null | undefined,
  ) => (obj ? (locale === 'sv' ? obj.nameSv : obj.nameEn) : null)

  const [req, setReq] = useState<RequirementDetail | null>(null)
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
        const url = `/${locale}/kravkatalog/${requirementId}/${versionNumber}`
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
      setReq(await res.json())
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
    const ro = new ResizeObserver(measure)
    if (vhRef.current) ro.observe(vhRef.current)
    if (cardRef.current) ro.observe(cardRef.current)
    // Re-measure when VersionHistory children change (expand/collapse toggles)
    const mo = new MutationObserver(measure)
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
  const latestStatusForActions = latest?.status ?? 1
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
    latest &&
    displayVersion &&
    latest.versionNumber !== displayVersion.versionNumber
  const pendingVersionNumber = latest?.versionNumber
  const pendingStatusLabel = hasPendingVersion
    ? ((locale === 'sv' ? latest?.statusNameSv : latest?.statusNameEn) ?? '')
    : ''

  // Whether the user is viewing the latest (newest) version
  const isViewingLatest =
    selectedVersion?.versionNumber === latest?.versionNumber

  const isViewingDisplayVersion =
    selectedVersion?.versionNumber === displayVersion?.versionNumber

  // Determine if the user is viewing a historical (non-default, non-latest) version
  const isViewingHistory =
    selectedVersion &&
    selectedVersion.versionNumber !== displayVersion?.versionNumber &&
    selectedVersion.versionNumber !== latest?.versionNumber

  const currentVersionNumber = selectedVersion?.versionNumber ?? 1
  const currentStatusId = selectedVersion?.status ?? 1
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
      await fetch(`/api/requirements/${requirementId}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statusId: STATUS_ARCHIVED }),
      })
      await onChange?.()
      if (onClose) onClose()
      else router.push('/kravkatalog')
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
      await fetch(`/api/requirements/${requirementId}/transition`, {
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
        else router.push('/kravkatalog')
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
      await fetch(`/api/requirements/${requirementId}/transition`, {
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
      url.pathname = url.pathname.replace(
        /\/kravkatalog(\/.*)?$/,
        '/kravkatalog',
      )
      url.searchParams.set('selected', shareUniqueId)
    } else {
      const versionSuffix =
        selectedVersionNumber != null ? `/${selectedVersionNumber}` : ''
      url.pathname = url.pathname.replace(
        /\/kravkatalog(\/.*)?$/,
        `/kravkatalog/${shareUniqueId}${versionSuffix}`,
      )
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
                          className="w-full rounded-xl border border-secondary-200 bg-white px-3.5 py-2.5 text-sm text-secondary-900 transition-all duration-200 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-400/50 dark:border-secondary-700 dark:bg-secondary-800/50 dark:text-secondary-100"
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
                        <p className="text-sm text-red-600 dark:text-red-400">
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
            ? 'p-6'
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
          <StatusStepper
            currentStatusId={currentStatusId}
            developerModeContext={detailContext}
            statuses={
              statuses.length === 0
                ? statuses
                : isArchiving || currentStatusId === STATUS_ARCHIVED
                  ? [3, 2, 4]
                      .map(id => statuses.find(s => s.id === id))
                      .filter((s): s is (typeof statuses)[number] => s != null)
                  : statuses.filter(s => s.id !== STATUS_ARCHIVED)
            }
          />
        </div>

        <div className="grid grid-cols-1 gap-6">
          {/* Main content */}
          <div className="space-y-6">
            <div className="relative flex gap-4">
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

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
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
                  {selectedVersion?.qualityCharacteristic && (
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
                        {localName(selectedVersion.qualityCharacteristic)}
                      </p>
                    </div>
                  )}
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
                </div>

                {selectedVersion?.references &&
                  selectedVersion.references.length > 0 && (
                    <div
                      {...devMarker({
                        context: detailContext,
                        name: 'detail section',
                        priority: 350,
                        value: 'references',
                      })}
                    >
                      <h3 className="text-sm font-medium text-secondary-600 dark:text-secondary-400 mb-1">
                        {t('reference')}
                      </h3>
                      <ul className="space-y-1">
                        {selectedVersion.references.map(ref => (
                          <li
                            className="text-sm"
                            key={`reference-item-${ref.id}`}
                            {...devMarker({
                              context: buildDetailSectionContext('references'),
                              name: 'reference item',
                              priority: 360,
                              value: ref.name,
                            })}
                          >
                            {ref.uri ? (
                              <a
                                className="text-primary-700 dark:text-primary-300 hover:underline"
                                href={ref.uri}
                                rel="noopener noreferrer"
                                target="_blank"
                              >
                                {ref.name}
                              </a>
                            ) : (
                              ref.name
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

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
                            `/${locale}/kravkatalog/reports/print/history/${requirementId}`,
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
                            `/${locale}/kravkatalog/reports/pdf/history/${requirementId}`,
                            '_blank',
                          )
                        }}
                        type="button"
                      >
                        <Printer aria-hidden="true" className="h-4 w-4" />
                        {t('downloadHistoryReportPdf')}
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
                                `/${locale}/kravkatalog/reports/print/review/${requirementId}`,
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
                                `/${locale}/kravkatalog/reports/pdf/review/${requirementId}`,
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
                        handleVersionSelect(displayVersion?.versionNumber ?? 1)
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
                        <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
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
                            href={`/kravkatalog/${req.uniqueId}/redigera`}
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
                      {currentStatusId === STATUS_DRAFT && isViewingLatest && (
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

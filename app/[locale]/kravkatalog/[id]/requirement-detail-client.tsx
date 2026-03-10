'use client'

import {
  AlertCircle,
  Archive,
  Clock,
  Edit,
  RotateCcw,
  TestTube2,
  Trash2,
  X,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useConfirmModal } from '@/components/ConfirmModal'
import StatusBadge from '@/components/StatusBadge'
import StatusStepper from '@/components/StatusStepper'
import VersionHistory from '@/components/VersionHistory'
import { Link, useRouter } from '@/i18n/routing'

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
  area: { name: string } | null
  id: number
  isArchived: boolean
  uniqueId: string
  versions: {
    id: number
    versionNumber: number
    description: string | null
    acceptanceCriteria: string | null
    requiresTesting: boolean
    category: { nameSv: string; nameEn: string } | null
    type: { nameSv: string; nameEn: string } | null
    typeCategory: { nameSv: string; nameEn: string } | null
    ownerName: string | null
    status: number
    statusNameSv: string | null
    statusNameEn: string | null
    statusColor: string | null
    createdAt: string
    editedAt: string | null
    publishedAt: string | null
    archivedAt: string | null
    references: { id: number; name: string; uri: string | null }[]
    versionScenarios: {
      scenario: { id: number; nameSv: string; nameEn: string }
    }[]
  }[]
}

interface RequirementDetailClientProps {
  inline?: boolean
  onChange?: () => void | Promise<void>
  onClose?: () => void
  requirementId: number
}

export default function RequirementDetailClient({
  inline,
  onChange,
  onClose,
  requirementId,
}: RequirementDetailClientProps) {
  const t = useTranslations('requirement')
  const tc = useTranslations('common')
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
  const [statuses, setStatuses] = useState<StatusInfo[]>([])
  const [selectedVersionNumber, setSelectedVersionNumber] = useState<
    number | null
  >(null)
  const [triangleLeft, setTriangleLeft] = useState<number | null>(null)
  const [connectorHeight, setConnectorHeight] = useState<number | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const vhRef = useRef<HTMLDivElement>(null)

  const hasDataRef = useRef(false)

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
    const dv =
      req.versions.find(v => v.status === STATUS_PUBLISHED) ??
      req.versions.find(v => v.status === STATUS_ARCHIVED) ??
      req.versions[0]
    return dv?.versionNumber ?? null
  }, [req])

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
            onKeyDown={e => e.stopPropagation()}
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
            onKeyDown={e => e.stopPropagation()}
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

  const handleArchive = async (e?: React.MouseEvent<HTMLButtonElement>) => {
    const anchorEl = e?.currentTarget
    if (
      !(await confirm({
        message: t('archiveConfirm'),
        variant: 'danger',
        icon: 'caution',
        anchorEl,
      }))
    )
      return
    await fetch(`/api/requirements/${requirementId}`, { method: 'DELETE' })
    onChange?.()
    if (onClose) onClose()
    else router.push('/kravkatalog')
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
            statuses={statuses}
          />
        </div>

        <div
          className={`grid grid-cols-1 ${inline ? '' : 'lg:grid-cols-3'} gap-6`}
        >
          {/* Main content */}
          <div className={`${inline ? '' : 'lg:col-span-2'} space-y-6`}>
            <div className="relative flex gap-4">
              <div
                className="relative flex-1 min-w-0 bg-white/80 dark:bg-secondary-900/60 backdrop-blur-sm rounded-2xl border shadow-sm p-6 space-y-5"
                ref={cardRef}
              >
                <div>
                  <h3 className="text-sm font-medium text-secondary-600 dark:text-secondary-400 mb-1">
                    {t('description')}
                  </h3>
                  <p className="text-secondary-900 dark:text-secondary-100 whitespace-pre-wrap">
                    {selectedVersion?.description ?? '—'}
                  </p>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-secondary-600 dark:text-secondary-400 mb-1">
                    {t('acceptanceCriteria')}
                  </h3>
                  <p className="text-secondary-900 dark:text-secondary-100 whitespace-pre-wrap">
                    {selectedVersion?.acceptanceCriteria ?? '—'}
                  </p>
                </div>

                {selectedVersion?.references &&
                  selectedVersion.references.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-secondary-600 dark:text-secondary-400 mb-1">
                        {t('reference')}
                      </h3>
                      <ul className="space-y-1">
                        {selectedVersion.references.map(ref => (
                          <li className="text-sm" key={ref.id}>
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

                {selectedVersion?.versionScenarios &&
                  selectedVersion.versionScenarios.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-secondary-600 dark:text-secondary-400 mb-1">
                        {t('scenario')}
                      </h3>
                      <ul className="flex flex-wrap gap-2">
                        {selectedVersion.versionScenarios.map(vs => (
                          <li
                            className="text-xs bg-secondary-100 dark:bg-secondary-800 px-2.5 py-1 rounded-full font-medium"
                            key={vs.scenario.id}
                          >
                            {localName(vs.scenario)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

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
                {isViewingHistory ? (
                  <>
                    <button
                      className="btn-secondary inline-flex items-center gap-1.5 w-full justify-center"
                      onClick={e =>
                        handleRestore(
                          selectedVersion?.versionNumber ?? 0,
                          e.currentTarget as HTMLElement,
                        )
                      }
                      type="button"
                    >
                      <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
                      {tc('restoreVersion')}
                    </button>
                    <button
                      className="btn-primary inline-flex items-center gap-1.5 w-full justify-center"
                      onClick={() =>
                        setSelectedVersionNumber(
                          displayVersion?.versionNumber ?? 1,
                        )
                      }
                      type="button"
                    >
                      {t('backToLatest')}
                    </button>
                  </>
                ) : !isLatestVersionArchived ? (
                  <>
                    {isViewingLatest &&
                      transitions
                        .filter(tr => tr.id !== 4)
                        .map(tr => (
                          <button
                            className="btn-secondary inline-flex items-center gap-1.5 w-full justify-center"
                            disabled={isTransitioning}
                            key={tr.id}
                            onClick={e =>
                              handleTransition(tr.id, e.currentTarget)
                            }
                            title={t(`transitionTooltip${tr.nameSv}`)}
                            type="button"
                          >
                            {t(`transitionTo${tr.nameSv}`)}
                          </button>
                        ))}
                    {currentStatusId !== STATUS_REVIEW && (
                      <Link
                        className="btn-primary inline-flex items-center gap-1.5 w-full justify-center"
                        href={`/kravkatalog/${req.id}/redigera`}
                        title={tc('editTooltip')}
                      >
                        <Edit aria-hidden="true" className="h-4 w-4" />
                        {tc('edit')}
                      </Link>
                    )}
                    {isViewingLatest &&
                      latestStatusForActions === STATUS_PUBLISHED && (
                        <button
                          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border text-sm font-medium text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition-all duration-200 w-full justify-center"
                          onClick={handleArchive}
                          title={tc('archiveTooltip')}
                          type="button"
                        >
                          <Archive aria-hidden="true" className="h-4 w-4" />
                          {tc('archive')}
                        </button>
                      )}
                    {currentStatusId === STATUS_DRAFT && isViewingLatest && (
                      <button
                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border text-sm font-medium text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition-all duration-200 w-full justify-center"
                        onClick={handleDeleteDraft}
                        type="button"
                      >
                        <Trash2 aria-hidden="true" className="h-4 w-4" />
                        {tc('delete')}
                      </button>
                    )}
                  </>
                ) : (
                  <button
                    className="btn-secondary inline-flex items-center gap-1.5 w-full justify-center"
                    onClick={e =>
                      handleRestore(
                        selectedVersion?.versionNumber ?? 0,
                        e.currentTarget as HTMLElement,
                      )
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
              onVersionSelect={setSelectedVersionNumber}
              ref={vhRef}
              selectedVersionNumber={
                selectedVersionNumber ?? currentVersionNumber
              }
              versions={req.versions}
            />
          </div>

          {/* Sidebar */}
          {!inline && (
            <div className="space-y-4">
              <div className="glass rounded-2xl p-5 space-y-3 text-sm">
                <div>
                  <span className="text-secondary-600 dark:text-secondary-400">
                    {t('area')}:
                  </span>{' '}
                  <span className="font-medium">{req.area?.name ?? '—'}</span>
                </div>
                <div>
                  <span className="text-secondary-600 dark:text-secondary-400">
                    {t('category')}:
                  </span>{' '}
                  <span className="font-medium">
                    {localName(selectedVersion?.category) ?? '—'}
                  </span>
                </div>
                <div>
                  <span className="text-secondary-600 dark:text-secondary-400">
                    {t('type')}:
                  </span>{' '}
                  <span className="font-medium">
                    {localName(selectedVersion?.type) ?? '—'}
                  </span>
                </div>
                <div>
                  <span className="text-secondary-600 dark:text-secondary-400">
                    {t('typeCategory')}:
                  </span>{' '}
                  <span className="font-medium">
                    {localName(selectedVersion?.typeCategory) ?? '—'}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-secondary-600 dark:text-secondary-400">
                    {t('requiresTesting')}:
                  </span>
                  {selectedVersion?.requiresTesting ? (
                    <TestTube2 className="h-4 w-4 text-primary-700 dark:text-primary-300" />
                  ) : (
                    <span className="font-medium">{tc('no')}</span>
                  )}
                </div>
                <div>
                  <span className="text-secondary-600 dark:text-secondary-400">
                    {tc('version')}:
                  </span>{' '}
                  <span className="font-medium">v{currentVersionNumber}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  if (inline) {
    return content
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
          className="relative mt-8 mb-8 w-full max-w-5xl max-h-[calc(100vh-4rem)] overflow-y-auto rounded-2xl bg-white dark:bg-secondary-900 shadow-2xl"
          onClick={e => e.stopPropagation()}
          onKeyDown={e => e.stopPropagation()}
          role="document"
        >
          <button
            aria-label={tc('close')}
            className="sticky top-0 float-right mt-4 mr-4 z-10 p-2 rounded-full bg-secondary-100 dark:bg-secondary-800 hover:bg-secondary-200 dark:hover:bg-secondary-700 transition-colors"
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
    )
  }

  return content
}

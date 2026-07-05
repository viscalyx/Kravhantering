'use client'

import { AlertCircle, Clock, X } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import type { KeyboardEvent, MouseEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useConfirmModal } from '@/components/ConfirmModal'
import DeviationPill from '@/components/DeviationPill'
import DeviationStepper from '@/components/DeviationStepper'
import { type HelpContent, useHelpContent } from '@/components/HelpPanel'
import RequirementDetailCard from '@/components/RequirementDetailCard'
import RequirementDetailSections from '@/components/RequirementDetailSections'
import StatusBadge from '@/components/StatusBadge'
import StatusIcon from '@/components/StatusIcon'
import StatusStepper from '@/components/StatusStepper'
import VersionHistory from '@/components/VersionHistory'
import { useRouter } from '@/i18n/routing'
import { apiFetch } from '@/lib/http/api-fetch'
import { readResponseMessage } from '@/lib/http/response-message'
import { formatActorDisplayNameForLocale } from '@/lib/privacy/display-name'
import {
  STATUS_ARCHIVED,
  STATUS_DRAFT,
  STATUS_PUBLISHED,
  STATUS_REVIEW,
} from '@/lib/requirements/status-constants.mjs'
import type {
  DeleteDraftResult,
  RequirementDetailPermissions,
  RequirementDetailResponse,
} from '@/lib/requirements/types'
import AddToSpecificationDialog from './_detail/AddToSpecificationDialog'
import ImprovementSuggestionsSection from './_detail/ImprovementSuggestionsSection'
import { getLocalizedName } from './_detail/localized-name'
import RequirementActionRail from './_detail/RequirementActionRail'
import SpecificationDeviationRail from './_detail/SpecificationDeviationRail'
import { useAddToSpecificationDialog } from './_detail/use-add-to-specification-dialog'
import { useDeviationWorkflow } from './_detail/use-deviation-workflow'
import { useRequirementDetailData } from './_detail/use-requirement-detail-data'
import { useSpecificationItemContext } from './_detail/use-specification-item-context'
import { useSuggestionWorkflow } from './_detail/use-suggestion-workflow'
import { useVersionPillConnector } from './_detail/use-version-pill-connector'
import {
  getDisplayVersionNumber,
  getRequirementVersionState,
} from './_detail/version-state'

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

interface SpecificationDeviationPermissions {
  canEditContent: boolean
  canReviewDecisions: boolean
}

interface RequirementDetailClientPropsBase {
  defaultVersion?: number
  inline?: boolean
  onChange?: (detail?: RequirementDetailResponse) => void | Promise<void>
  onClose?: () => void
  requirementId: number | string
  specificationPermissions?: SpecificationDeviationPermissions
}

interface RequirementDetailClientStandalone
  extends RequirementDetailClientPropsBase {
  specificationId?: undefined
  specificationItemId?: undefined
}

interface RequirementDetailClientSpecificationItem
  extends RequirementDetailClientPropsBase {
  specificationId: number
  specificationItemId: number
}

type RequirementDetailClientProps =
  | RequirementDetailClientStandalone
  | RequirementDetailClientSpecificationItem

export default function RequirementDetailClient({
  defaultVersion,
  inline,
  onChange,
  onClose,
  specificationPermissions,
  specificationItemId,
  specificationId,
  requirementId,
}: RequirementDetailClientProps) {
  useHelpContent(inline ? null : REQUIREMENT_DETAIL_HELP)
  const t = useTranslations('requirement')
  const tc = useTranslations('common')
  const tp = useTranslations('specification')
  const router = useRouter()
  const locale = useLocale()
  const { confirm } = useConfirmModal()
  const workflowStepperAnchorRef = useRef<HTMLDivElement>(null)
  const workflowStepperRestoreFrameRef = useRef<number | null>(null)

  const {
    loading,
    refreshRequirement,
    requirement: req,
    statuses,
    transitions,
  } = useRequirementDetailData({ requirementId })
  const { isSpecificationItemContext, specificationItemDetail } =
    useSpecificationItemContext({
      specificationItemId,
      specificationId,
    })

  const [isTransitioning, setIsTransitioning] = useState(false)
  const [selectedVersionNumber, setSelectedVersionNumber] = useState<
    number | null
  >(null)

  const displayVersionNumber = useMemo(
    () => getDisplayVersionNumber({ defaultVersion, inline, requirement: req }),
    [req, defaultVersion, inline],
  )

  useEffect(() => {
    if (displayVersionNumber !== null) {
      setSelectedVersionNumber(displayVersionNumber)
    }
  }, [displayVersionNumber])

  const deviationWorkflow = useDeviationWorkflow({
    isSpecificationItemContext,
    onChange,
    specificationItemId,
  })
  const suggestionWorkflow = useSuggestionWorkflow({
    onChange,
    requirement: req,
    requirementId,
    selectedVersionNumber,
  })
  const addToSpecificationDialog = useAddToSpecificationDialog({
    requirementInternalId: req?.id ?? null,
  })
  const { cardRef, connectorHeight, triangleLeft, versionHistoryRef } =
    useVersionPillConnector(selectedVersionNumber)

  const restoreWorkflowStepperVisibility = useCallback(() => {
    const anchor = workflowStepperAnchorRef.current
    if (!anchor || typeof window === 'undefined') {
      return
    }

    const rect = anchor.getBoundingClientRect()
    const viewportHeight = Math.max(
      window.innerHeight,
      document.documentElement.clientHeight,
    )
    const safeTop = inline ? 112 : 16
    const safeBottom = viewportHeight - 16

    if (rect.top >= safeTop && rect.bottom <= safeBottom) {
      return
    }

    anchor.scrollIntoView?.({
      behavior: 'auto',
      block: 'nearest',
      inline: 'nearest',
    })
  }, [inline])

  const scheduleWorkflowStepperVisibilityRestore = useCallback(() => {
    if (typeof window === 'undefined') {
      return
    }

    if (workflowStepperRestoreFrameRef.current !== null) {
      window.cancelAnimationFrame(workflowStepperRestoreFrameRef.current)
    }

    workflowStepperRestoreFrameRef.current = window.requestAnimationFrame(
      () => {
        workflowStepperRestoreFrameRef.current = window.requestAnimationFrame(
          () => {
            workflowStepperRestoreFrameRef.current = null
            restoreWorkflowStepperVisibility()
          },
        )
      },
    )
  }, [restoreWorkflowStepperVisibility])

  useEffect(
    () => () => {
      if (
        typeof window !== 'undefined' &&
        workflowStepperRestoreFrameRef.current !== null
      ) {
        window.cancelAnimationFrame(workflowStepperRestoreFrameRef.current)
      }
    },
    [],
  )

  const localName = useCallback(
    (
      obj: { nameSv: string | null; nameEn: string | null } | null | undefined,
    ) => getLocalizedName(locale, obj),
    [locale],
  )

  const handleModalDocumentKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'Escape') {
        event.stopPropagation()
      }
    },
    [],
  )

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
          onKeyDown={event => event.key === 'Escape' && onClose()}
          role="dialog"
        >
          <div
            className="relative mt-16 w-full max-w-5xl max-h-[calc(100vh-8rem)] overflow-y-auto rounded-2xl bg-white dark:bg-secondary-900 shadow-2xl"
            onClick={event => event.stopPropagation()}
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
          onKeyDown={event => event.key === 'Escape' && onClose()}
          role="dialog"
        >
          <div
            className="relative mt-16 w-full max-w-5xl max-h-[calc(100vh-8rem)] overflow-y-auto rounded-2xl bg-white dark:bg-secondary-900 shadow-2xl"
            onClick={event => event.stopPropagation()}
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

  const {
    archivedVersionBannerKey,
    archivedVersionPreferredVersion,
    currentStatusId,
    currentVersionNumber,
    displayVersion,
    hasPendingVersion,
    hasPendingWork,
    hasPendingWorkAbovePublished,
    isArchiving,
    isLatestVersionArchived,
    isViewingDisplayVersion,
    isViewingHistory,
    isViewingLatest,
    latest,
    latestStatusForActions,
    pendingStatusLabel,
    pendingVersionNumber,
    selectedVersion,
    showsArchivedVersionAvailabilityBanner,
  } = getRequirementVersionState(req, selectedVersionNumber, locale)

  const currentStatusLabel =
    (locale === 'sv'
      ? selectedVersion?.statusNameSv
      : selectedVersion?.statusNameEn) ?? ''
  const currentStatusColor = selectedVersion?.statusColor ?? null
  const currentStatusIconName = selectedVersion?.statusIconName ?? null
  const canAddToSpecification =
    currentStatusId === STATUS_PUBLISHED && isViewingDisplayVersion
  const areaOwnerName = formatActorDisplayNameForLocale(
    req.area?.ownerName,
    locale,
  )
  const detailContext = inline
    ? `requirements table > inline detail pane: ${req.uniqueId}`
    : `requirement detail: ${req.uniqueId}`
  const permissions: RequirementDetailPermissions = req.permissions ?? {
    allowedTransitionStatusIds: [],
    canArchive: false,
    canDeleteDraft: false,
    canEdit: false,
    canManageSuggestions: false,
    canReactivate: false,
    canRestore: false,
    canViewHistory: false,
  }
  const canMutateRequirementLifecycle =
    permissions.canArchive ||
    permissions.canDeleteDraft ||
    permissions.canEdit ||
    permissions.canReactivate ||
    permissions.canRestore ||
    permissions.allowedTransitionStatusIds.length > 0
  const showReadOnlyNotice =
    !isSpecificationItemContext && !canMutateRequirementLifecycle

  const buildDetailSectionContext = (sectionName: string) =>
    `${detailContext} > detail section: ${sectionName}`

  const detailMetadata = [
    ...(req.area
      ? [
          {
            id: 'area',
            label: t('area'),
            markerValue: 'area',
            value: (
              <>
                {req.area.name}
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
      value: localName(selectedVersion?.category) ?? '—',
    },
    ...(selectedVersion?.type
      ? [
          {
            id: 'type',
            label: t('type'),
            markerValue: 'type',
            value: localName(selectedVersion.type),
          },
        ]
      : []),
    {
      id: 'quality-characteristic',
      label: t('qualityCharacteristic'),
      markerValue: 'quality characteristic',
      value: selectedVersion?.qualityCharacteristic
        ? localName(selectedVersion.qualityCharacteristic)
        : '—',
    },
    {
      id: 'priority-level',
      label: t('priorityLevel'),
      markerValue: 'priority level',
      value: selectedVersion?.priorityLevel ? (
        <StatusBadge
          color={selectedVersion.priorityLevel.color}
          iconName={selectedVersion.priorityLevel.iconName}
          label={localName(selectedVersion.priorityLevel) ?? ''}
          size="sm"
        />
      ) : (
        '—'
      ),
    },
    {
      id: 'verifiable',
      label: t('verifiable'),
      markerValue: 'verifiable',
      value: selectedVersion?.verifiable ? tc('yes') : tc('no'),
    },
    {
      id: 'verification-method',
      label: t('verificationMethod'),
      markerValue: 'verification method',
      value: selectedVersion?.verificationMethod || '—',
    },
    ...(isSpecificationItemContext
      ? [
          {
            id: 'needs-reference',
            label: tp('needsReference'),
            markerValue: 'needs reference',
            value: specificationItemDetail?.needsReference ?? '—',
          },
          {
            id: 'specification-item-status',
            label: t('specificationItemStatus'),
            markerValue: 'usage status',
            value:
              specificationItemDetail?.specificationItemStatusNameEn ||
              specificationItemDetail?.specificationItemStatusNameSv ? (
                <StatusBadge
                  color={specificationItemDetail.specificationItemStatusColor}
                  iconName={
                    specificationItemDetail.specificationItemStatusIconName
                  }
                  label={
                    locale === 'sv'
                      ? (specificationItemDetail.specificationItemStatusNameSv ??
                        specificationItemDetail.specificationItemStatusNameEn ??
                        '')
                      : (specificationItemDetail.specificationItemStatusNameEn ??
                        specificationItemDetail.specificationItemStatusNameSv ??
                        '')
                  }
                  size="sm"
                />
              ) : (
                '—'
              ),
          },
        ]
      : []),
    {
      id: 'specification-count',
      label: t('specificationCount'),
      markerValue: 'specification count',
      value: req.specificationCount,
    },
  ]

  const detailReferences =
    selectedVersion?.versionNormReferences?.map(vnr => ({
      href: vnr.normReference.uri,
      id: `normref-chip-${vnr.normReference.id}`,
      label: vnr.normReference.normReferenceId,
      markerValue: vnr.normReference.normReferenceId,
      title: `${vnr.normReference.name} (${vnr.normReference.reference})`,
    })) ?? []

  const detailRequirementPackages =
    selectedVersion?.versionRequirementPackages?.map(
      versionRequirementPackage => {
        const requirementPackage = versionRequirementPackage.requirementPackage
        const requirementPackageLabel =
          requirementPackage.name?.trim() || String(requirementPackage.id)
        const requirementPackageMarkerValue = requirementPackageLabel

        return {
          id: `requirementPackage-chip-${requirementPackage.id}`,
          label: requirementPackageLabel,
          markerContext: buildDetailSectionContext('requirementPackages'),
          markerValue: requirementPackageMarkerValue,
          purposeAndScope: requirementPackage.purposeAndScope,
        }
      },
    ) ?? []

  const handleArchive = async (event?: MouseEvent<HTMLButtonElement>) => {
    const anchorEl = event?.currentTarget
    if (
      !(await confirm({
        message: t('archiveInitiateConfirm'),
        variant: 'danger',
        icon: 'caution',
        anchorEl,
      }))
    )
      return
    const res = await apiFetch(`/api/requirements/${requirementId}`, {
      method: 'DELETE',
    })
    if (!res.ok) {
      const details = await readResponseMessage(res)
      console.error('Archive initiation failed:', details ?? res.statusText)
      await confirm({
        message: details ?? t('transitionFailed'),
        showCancel: false,
        icon: 'warning',
        anchorEl,
      })
      return
    }
    let archivedDetail: RequirementDetailResponse | undefined
    try {
      const responseBody = (await res.json()) as {
        detail?: RequirementDetailResponse
      }
      archivedDetail = responseBody.detail
    } catch {
      archivedDetail = undefined
    }
    await Promise.all([refreshRequirement(), onChange?.(archivedDetail)])
  }

  const handleApproveArchiving = async (
    event?: MouseEvent<HTMLButtonElement>,
  ) => {
    const anchorEl = event?.currentTarget
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
      const res = await apiFetch(
        `/api/requirement-transitions/${requirementId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ statusId: STATUS_ARCHIVED }),
        },
      )
      if (!res.ok) {
        const details = await readResponseMessage(res)
        console.error('Approve archiving failed:', details ?? res.statusText)
        await confirm({
          message: details ?? t('transitionFailed'),
          showCancel: false,
          anchorEl,
        })
        return
      }
      await onChange?.()
      if (onClose) onClose()
      else router.push('/requirements')
    } finally {
      setIsTransitioning(false)
    }
  }

  const handleCancelArchiving = async (
    event?: MouseEvent<HTMLButtonElement>,
  ) => {
    const anchorEl = event?.currentTarget
    if (
      !(await confirm({
        message: t('cancelArchivingConfirm'),
        anchorEl,
      }))
    )
      return
    setIsTransitioning(true)
    try {
      const res = await apiFetch(
        `/api/requirement-transitions/${requirementId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ statusId: STATUS_PUBLISHED }),
        },
      )
      if (!res.ok) {
        const details = await readResponseMessage(res)
        console.error('Cancel archiving failed:', details ?? res.statusText)
        await confirm({
          message: details ?? t('transitionFailed'),
          showCancel: false,
          anchorEl,
        })
        return
      }
      await Promise.all([refreshRequirement(), onChange?.()])
    } finally {
      setIsTransitioning(false)
    }
  }

  const handleDeleteDraft = async (event?: MouseEvent<HTMLButtonElement>) => {
    const anchorEl = event?.currentTarget
    let dangerDescription: string | undefined

    const deleteWouldRemoveRequirement =
      req?.versions.length === 1 && req.versions[0]?.status === STATUS_DRAFT
    if (deleteWouldRemoveRequirement) {
      try {
        const suggestionsRes = await apiFetch(
          `/api/requirement-suggestions/${req.id}`,
        )
        if (!suggestionsRes.ok) {
          throw new Error(
            (await readResponseMessage(suggestionsRes)) ??
              suggestionsRes.statusText,
          )
        }
        const data = (await suggestionsRes.json()) as {
          suggestions?: unknown[]
        }
        const suggestionCount = Array.isArray(data.suggestions)
          ? data.suggestions.length
          : 0
        if (suggestionCount > 0) {
          dangerDescription = t('deleteDraftCascadeWarning', {
            count: suggestionCount,
          })
        }
      } catch (error) {
        console.error(
          'Failed to check improvement suggestions before deleting draft:',
          error,
        )
        await confirm({
          anchorEl,
          icon: 'caution',
          message: t('deleteDraftSuggestionCheckFailed'),
          showCancel: false,
          variant: 'danger',
        })
        return
      }
    }

    if (
      !(await confirm({
        dangerDescription,
        message: t('deleteDraftConfirm'),
        variant: 'danger',
        icon: 'caution',
        anchorEl,
      }))
    )
      return
    const res = await apiFetch(
      `/api/requirements/${requirementId}/delete-draft`,
      { method: 'POST' },
    )
    if (res.ok) {
      const data = (await res.json()) as DeleteDraftResult
      const requirementDeleted = data.deleted.some(
        item => item.type === 'requirement',
      )
      if (requirementDeleted) {
        if (onClose) onClose()
        else router.push('/requirements')
        await onChange?.()
      } else {
        await Promise.all([refreshRequirement(), onChange?.()])
      }
    }
  }

  const handleTransition = async (
    targetStatusId: number,
    anchorEl?: HTMLElement,
  ) => {
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
      const res = await apiFetch(
        `/api/requirement-transitions/${requirementId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ statusId: targetStatusId }),
        },
      )
      if (!res.ok) {
        const details = await readResponseMessage(res)
        console.error('Status transition failed:', details ?? res.statusText)
        await confirm({
          message: details ?? t('transitionFailed'),
          showCancel: false,
          anchorEl,
        })
        return
      }
      await Promise.all([refreshRequirement(), onChange?.()])
      scheduleWorkflowStepperVisibilityRestore()
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
    const res = await apiFetch(`/api/requirements/${requirementId}/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ versionNumber }),
    })
    if (!res.ok) {
      const details = await readResponseMessage(res)
      console.error(
        'Restore requirement version failed:',
        details ?? res.statusText,
      )
      await confirm({
        message: details ?? t('transitionFailed'),
        showCancel: false,
        icon: 'warning',
        anchorEl,
      })
      return
    }
    await Promise.all([refreshRequirement(), onChange?.()])
  }

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

  const priorityLevelForDeviation = selectedVersion?.priorityLevel
    ? {
        color: selectedVersion.priorityLevel.color,
        name: localName(selectedVersion.priorityLevel),
      }
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
              iconName={currentStatusIconName}
              label={currentStatusLabel}
            />
          </div>
        )}

        {showReadOnlyNotice && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-secondary-200 bg-secondary-50 px-3 py-2 text-sm text-secondary-700 dark:border-secondary-700 dark:bg-secondary-900/60 dark:text-secondary-200">
            <AlertCircle
              aria-hidden="true"
              className="mt-0.5 h-4 w-4 shrink-0 text-secondary-500 dark:text-secondary-400"
            />
            <p>{t('readOnlyNotice')}</p>
          </div>
        )}

        <div
          className="mb-5 scroll-mt-32"
          data-requirement-detail-stepper-anchor="true"
          ref={workflowStepperAnchorRef}
        >
          {showsArchivedVersionAvailabilityBanner &&
          archivedVersionPreferredVersion &&
          archivedVersionBannerKey ? (
            <div className="flex items-center gap-2 mb-2 px-1 text-xs text-secondary-500 dark:text-secondary-400">
              {archivedVersionPreferredVersion.statusIconName ? (
                <StatusIcon
                  aria-hidden="true"
                  className="h-3.5 w-3.5 shrink-0"
                  name={archivedVersionPreferredVersion.statusIconName}
                  style={{
                    color:
                      archivedVersionPreferredVersion.statusColor ?? undefined,
                  }}
                />
              ) : (
                <AlertCircle
                  aria-hidden="true"
                  className="h-3.5 w-3.5 shrink-0"
                  style={{
                    color:
                      archivedVersionPreferredVersion.statusColor ?? undefined,
                  }}
                />
              )}
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
                aria-hidden="true"
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
                {latest?.statusIconName ? (
                  <StatusIcon
                    aria-hidden="true"
                    className="h-3.5 w-3.5 shrink-0"
                    name={latest.statusIconName}
                    style={{ color: latest.statusColor ?? undefined }}
                  />
                ) : (
                  <AlertCircle
                    aria-hidden="true"
                    className="h-3.5 w-3.5 shrink-0"
                    style={{ color: latest?.statusColor ?? undefined }}
                  />
                )}
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
          {isSpecificationItemContext && deviationWorkflow.deviationStep ? (
            <DeviationStepper
              currentStep={deviationWorkflow.deviationStep}
              developerModeContext={detailContext}
            />
          ) : !isSpecificationItemContext ? (
            <StatusStepper
              currentStatusId={currentStatusId}
              developerModeContext={detailContext}
              isArchiving={isArchiving}
              statuses={
                statuses.length === 0
                  ? statuses
                  : isArchiving || currentStatusId === STATUS_ARCHIVED
                    ? [3, 2, 4]
                        .map(id => statuses.find(status => status.id === id))
                        .filter(
                          (status): status is (typeof statuses)[number] =>
                            status != null,
                        )
                    : statuses.filter(status => status.id !== STATUS_ARCHIVED)
              }
            />
          ) : null}
        </div>

        {isSpecificationItemContext && deviationWorkflow.latestDeviation && (
          <div className="mb-4">
            <DeviationPill
              developerModeContext={detailContext}
              history={deviationWorkflow.deviationHistory}
              latest={deviationWorkflow.latestDeviation}
            />
          </div>
        )}

        <div className="grid grid-cols-1 gap-6">
          <div className="space-y-6">
            <div className="relative flex flex-col sm:flex-row gap-3">
              <RequirementDetailCard ref={cardRef}>
                <RequirementDetailSections
                  acceptanceCriteria={
                    selectedVersion?.acceptanceCriteria ?? '—'
                  }
                  acceptanceCriteriaLabel={t('acceptanceCriteria')}
                  description={selectedVersion?.description ?? '—'}
                  descriptionLabel={t('description')}
                  developerModeContext={detailContext}
                  emptyLabel={tc('noneAvailable')}
                  metadata={detailMetadata}
                  references={detailReferences}
                  referencesLabel={t('normReferences')}
                  requirementPackages={detailRequirementPackages}
                  requirementPackagesLabel={t('requirementPackage')}
                />

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
              </RequirementDetailCard>

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

              {isSpecificationItemContext &&
              specificationItemId != null &&
              specificationId ? (
                <SpecificationDeviationRail
                  canManageDeviationDrafts={
                    specificationPermissions?.canEditContent === true
                  }
                  canReviewDeviationDecisions={
                    specificationPermissions?.canReviewDecisions === true
                  }
                  detailContext={detailContext}
                  locale={locale}
                  priorityLevel={priorityLevelForDeviation}
                  requirementId={requirementId}
                  specificationId={specificationId}
                  specificationItemId={specificationItemId}
                  workflow={deviationWorkflow}
                />
              ) : (
                <RequirementActionRail
                  allowedTransitionStatusIds={
                    permissions.allowedTransitionStatusIds
                  }
                  canAddToSpecification={canAddToSpecification}
                  canArchive={permissions.canArchive}
                  canDeleteDraft={permissions.canDeleteDraft}
                  canEdit={permissions.canEdit}
                  canRestore={permissions.canRestore}
                  currentStatusId={currentStatusId}
                  detailContext={detailContext}
                  displayVersionNumber={displayVersion?.versionNumber}
                  hasPendingWork={hasPendingWork}
                  hasPendingWorkAbovePublished={hasPendingWorkAbovePublished}
                  isArchiving={isArchiving}
                  isLatestVersionArchived={isLatestVersionArchived}
                  isTransitioning={isTransitioning}
                  isViewingHistory={isViewingHistory}
                  isViewingLatest={isViewingLatest}
                  latestStatusForActions={latestStatusForActions}
                  latestVersionNumber={latest?.versionNumber}
                  locale={locale}
                  onApproveArchiving={handleApproveArchiving}
                  onArchive={handleArchive}
                  onCancelArchiving={handleCancelArchiving}
                  onDeleteDraft={handleDeleteDraft}
                  onOpenAddToSpecification={addToSpecificationDialog.openDialog}
                  onRestore={handleRestore}
                  onTransition={handleTransition}
                  onVersionSelect={handleVersionSelect}
                  requirementId={requirementId}
                  requirementUniqueId={req.uniqueId}
                  selectedVersionNumber={selectedVersionNumber}
                  selectedVersionNumberForRestore={
                    selectedVersion?.versionNumber
                  }
                  transitions={transitions}
                />
              )}
            </div>

            <VersionHistory
              developerModeContext={detailContext}
              onVersionSelect={handleVersionSelect}
              ref={versionHistoryRef}
              selectedVersionNumber={
                selectedVersionNumber ?? currentVersionNumber
              }
              versions={req.versions}
            />

            <ImprovementSuggestionsSection
              detailContext={detailContext}
              workflow={suggestionWorkflow}
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
        <AddToSpecificationDialog
          dialog={addToSpecificationDialog}
          onDocumentKeyDown={handleModalDocumentKeyDown}
        />
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
          onKeyDown={event => event.key === 'Escape' && onClose()}
          role="dialog"
        >
          <div
            className="relative mt-8 mb-8 w-full max-w-5xl max-h-[calc(100vh-4rem)] overflow-y-auto rounded-2xl bg-white dark:bg-secondary-900 shadow-2xl"
            onClick={event => event.stopPropagation()}
            onKeyDown={handleModalDocumentKeyDown}
            role="document"
          >
            <button
              aria-label={tc('close')}
              className="sticky top-0 z-10 float-right mt-4 mr-4 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-secondary-100 p-2 transition-colors hover:bg-secondary-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:bg-secondary-800 dark:hover:bg-secondary-700 dark:focus-visible:ring-offset-secondary-900"
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
        <AddToSpecificationDialog
          dialog={addToSpecificationDialog}
          onDocumentKeyDown={handleModalDocumentKeyDown}
        />
      </>
    )
  }

  return (
    <>
      {content}
      <AddToSpecificationDialog
        dialog={addToSpecificationDialog}
        onDocumentKeyDown={handleModalDocumentKeyDown}
      />
    </>
  )
}

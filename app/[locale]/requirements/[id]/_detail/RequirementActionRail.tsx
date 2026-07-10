'use client'

import {
  Archive,
  Check,
  Edit,
  FolderPlus,
  RotateCcw,
  Share2,
  Trash2,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import {
  AppMenu,
  AppMenuContent,
  AppMenuItem,
  AppMenuTrigger,
} from '@/components/primitives/AppMenu'
import StatusIcon from '@/components/StatusIcon'
import { Link } from '@/i18n/routing'
import { devMarker } from '@/lib/developer-mode-markers'
import {
  STATUS_ARCHIVED,
  STATUS_DRAFT,
  STATUS_PUBLISHED,
  STATUS_REVIEW,
} from '@/lib/requirements/status-constants.mjs'
import RequirementReportMenu from './RequirementReportMenu'
import type { TransitionTarget } from './types'

interface RequirementActionRailProps {
  allowedTransitionStatusIds: number[]
  canAddToSpecification: boolean
  canArchive: boolean
  canDeleteDraft: boolean
  canEdit: boolean
  canRestore: boolean
  currentStatusId: number
  detailContext?: string
  displayVersionNumber?: number
  hasPendingWork: boolean
  hasPendingWorkAbovePublished: boolean
  isArchiving: boolean
  isLatestVersionArchived: boolean
  isTransitioning: boolean
  isViewingHistory: boolean
  isViewingLatest: boolean
  latestStatusForActions: number
  latestVersionNumber?: number
  locale: string
  onApproveArchiving: (
    event?: ReactMouseEvent<HTMLButtonElement>,
  ) => Promise<void>
  onArchive: (event?: ReactMouseEvent<HTMLButtonElement>) => Promise<void>
  onCancelArchiving: (
    event?: ReactMouseEvent<HTMLButtonElement>,
  ) => Promise<void>
  onDeleteDraft: (event?: ReactMouseEvent<HTMLButtonElement>) => Promise<void>
  onOpenAddToSpecification: () => Promise<void>
  onRestore: (versionNumber: number, anchorEl?: HTMLElement) => Promise<void>
  onTransition: (
    targetStatusId: number,
    anchorEl?: HTMLElement,
  ) => Promise<void>
  onVersionSelect: (versionNumber: number) => void
  requirementId: number | string
  requirementUniqueId: string
  selectedVersionNumber: number | null
  selectedVersionNumberForRestore?: number
  transitions: TransitionTarget[]
}

function getTransitionActionDeveloperModeValue(
  transition: TransitionTarget,
): string {
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

export default function RequirementActionRail({
  allowedTransitionStatusIds,
  canAddToSpecification,
  canArchive,
  canDeleteDraft,
  canEdit,
  canRestore,
  currentStatusId,
  detailContext,
  displayVersionNumber,
  hasPendingWork,
  hasPendingWorkAbovePublished,
  isArchiving,
  isLatestVersionArchived,
  isTransitioning,
  isViewingHistory,
  isViewingLatest,
  latestStatusForActions,
  latestVersionNumber,
  locale,
  onApproveArchiving,
  onArchive,
  onCancelArchiving,
  onDeleteDraft,
  onOpenAddToSpecification,
  onRestore,
  onTransition,
  onVersionSelect,
  requirementId,
  requirementUniqueId,
  selectedVersionNumber,
  selectedVersionNumberForRestore,
  transitions,
}: RequirementActionRailProps) {
  const t = useTranslations('requirement')
  const tc = useTranslations('common')
  const tp = useTranslations('specification')
  const [copied, setCopied] = useState<'inline' | 'page' | null>(null)
  const [showShareMenu, setShowShareMenu] = useState(false)
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const allowedTransitionIds = new Set(allowedTransitionStatusIds)
  const restoreDisabled =
    !canRestore || hasPendingWork || selectedVersionNumberForRestore == null
  const backToLatestVersionNumber = latestVersionNumber ?? displayVersionNumber

  useEffect(
    () => () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current)
      }
    },
    [],
  )

  const handleShare = async (mode: 'inline' | 'page') => {
    const url = new URL(window.location.href)
    url.search = ''
    if (mode === 'inline') {
      url.pathname = `/${locale}/requirements`
      url.searchParams.set('selected', requirementUniqueId)
    } else {
      const versionSuffix =
        selectedVersionNumber != null ? `/${selectedVersionNumber}` : ''
      url.pathname = `/${locale}/requirements/${requirementUniqueId}${versionSuffix}`
    }
    try {
      await navigator.clipboard.writeText(url.toString())
      setCopied(mode)
    } catch {
      setCopied(null)
    }
    if (copyTimeoutRef.current) {
      clearTimeout(copyTimeoutRef.current)
    }
    copyTimeoutRef.current = setTimeout(() => {
      setCopied(null)
      copyTimeoutRef.current = null
    }, 2000)
  }

  return (
    <div className="flex flex-col gap-2 shrink-0">
      <RequirementReportMenu
        currentStatusId={currentStatusId}
        detailContext={detailContext}
        locale={locale}
        requirementId={requirementId}
        variant="standalone"
      />
      {canAddToSpecification && (
        <button
          className="btn-secondary inline-flex items-center gap-1.5 w-full justify-center min-h-11 min-w-11"
          {...devMarker({
            context: detailContext,
            name: 'detail action',
            priority: 360,
            value: 'add to specification',
          })}
          onClick={() => void onOpenAddToSpecification()}
          title={tp('addToSpecification')}
          type="button"
        >
          <FolderPlus aria-hidden="true" className="h-4 w-4" />
          {tp('addToSpecification')}
        </button>
      )}
      <AppMenu onOpenChange={setShowShareMenu} open={showShareMenu}>
        <AppMenuTrigger>
          <button
            className="btn-secondary inline-flex items-center gap-1.5 w-full justify-center min-h-11 min-w-11"
            {...devMarker({
              context: detailContext,
              name: 'share toggle',
              priority: 300,
              value: 'share',
            })}
            title={tc('share')}
            type="button"
          >
            {copied ? (
              <Check aria-hidden="true" className="h-4 w-4 text-green-500" />
            ) : (
              <Share2 aria-hidden="true" className="h-4 w-4" />
            )}
            {copied ? tc('copied') : tc('share')}
          </button>
        </AppMenuTrigger>
        <span aria-live="polite" className="sr-only" role="status">
          {copied ? tc('copied') : ''}
        </span>
        <AppMenuContent
          align="end"
          className="z-50 w-full max-w-xs rounded-xl border border-secondary-200 bg-white py-1 text-secondary-900 shadow-lg dark:border-secondary-700 dark:bg-secondary-800 dark:text-secondary-100"
          matchTriggerWidth
          sideOffset={4}
        >
          <AppMenuItem
            className="flex min-h-11 min-w-11 w-full items-center gap-2 px-3 py-2 text-left text-sm text-secondary-700 transition-colors hover:bg-secondary-50 hover:text-secondary-900 dark:text-secondary-100 dark:hover:bg-secondary-700 dark:hover:text-white"
            {...devMarker({
              context: detailContext,
              name: 'share option',
              priority: 310,
              value: 'share inline',
            })}
            onAction={() => void handleShare('inline')}
          >
            {copied === 'inline' ? (
              <Check aria-hidden="true" className="h-4 w-4 text-green-500" />
            ) : (
              <Share2 aria-hidden="true" className="h-4 w-4" />
            )}
            {t('shareLinkInline')}
          </AppMenuItem>
          <AppMenuItem
            className="flex min-h-11 min-w-11 w-full items-center gap-2 px-3 py-2 text-left text-sm text-secondary-700 transition-colors hover:bg-secondary-50 hover:text-secondary-900 dark:text-secondary-100 dark:hover:bg-secondary-700 dark:hover:text-white"
            {...devMarker({
              context: detailContext,
              name: 'share option',
              priority: 310,
              value: 'share page',
            })}
            onAction={() => void handleShare('page')}
          >
            {copied === 'page' ? (
              <Check aria-hidden="true" className="h-4 w-4 text-green-500" />
            ) : (
              <Share2 aria-hidden="true" className="h-4 w-4" />
            )}
            {t('shareLinkPage')}
          </AppMenuItem>
        </AppMenuContent>
      </AppMenu>
      {isViewingHistory ? (
        <>
          {canRestore && (
            <button
              className={`btn-secondary inline-flex items-center gap-1.5 w-full justify-center${restoreDisabled ? ' opacity-60 cursor-not-allowed' : ''}`}
              {...devMarker({
                context: detailContext,
                name: 'detail action',
                priority: 360,
                value: 'restore version',
              })}
              disabled={restoreDisabled}
              onClick={event => {
                if (selectedVersionNumberForRestore == null) return
                void onRestore(
                  selectedVersionNumberForRestore,
                  event.currentTarget,
                )
              }}
              title={
                hasPendingWork ? t('restoreBlockedByPendingWork') : undefined
              }
              type="button"
            >
              <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
              {tc('restoreVersion')}
            </button>
          )}
          <button
            className="btn-primary inline-flex items-center gap-1.5 w-full justify-center"
            {...devMarker({
              context: detailContext,
              name: 'detail action',
              priority: 360,
              value: 'back to latest',
            })}
            disabled={backToLatestVersionNumber == null}
            onClick={() => {
              if (backToLatestVersionNumber == null) return
              onVersionSelect(backToLatestVersionNumber)
            }}
            type="button"
          >
            {t('backToLatest')}
          </button>
        </>
      ) : !isLatestVersionArchived ? (
        isArchiving && isViewingLatest ? (
          <>
            {allowedTransitionIds.has(STATUS_ARCHIVED) && (
              <button
                className="btn-primary inline-flex items-center gap-1.5 w-full justify-center"
                {...devMarker({
                  context: detailContext,
                  name: 'detail action',
                  priority: 360,
                  value: 'approve archiving',
                })}
                disabled={isTransitioning}
                onClick={event => void onApproveArchiving(event)}
                title={t('approveArchivingTooltip')}
                type="button"
              >
                <Archive aria-hidden="true" className="h-4 w-4" />
                {t('approveArchiving')}
              </button>
            )}
            {allowedTransitionIds.has(STATUS_PUBLISHED) && (
              <button
                className="btn-secondary inline-flex items-center gap-1.5 w-full justify-center"
                {...devMarker({
                  context: detailContext,
                  name: 'detail action',
                  priority: 360,
                  value: 'cancel archiving',
                })}
                disabled={isTransitioning}
                onClick={event => void onCancelArchiving(event)}
                title={t('cancelArchivingTooltip')}
                type="button"
              >
                <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
                {t('cancelArchiving')}
              </button>
            )}
          </>
        ) : (
          <>
            {isViewingLatest &&
              transitions
                .filter(transition => allowedTransitionIds.has(transition.id))
                .filter(transition => transition.id !== STATUS_ARCHIVED)
                .filter(
                  transition =>
                    !(
                      latestStatusForActions === STATUS_PUBLISHED &&
                      transition.id === STATUS_REVIEW
                    ),
                )
                .map(transition => (
                  <button
                    className="btn-secondary inline-flex items-center gap-1.5 w-full justify-center"
                    key={`transition-action-${transition.id}`}
                    {...devMarker({
                      context: detailContext,
                      name: 'detail action',
                      priority: 360,
                      value: getTransitionActionDeveloperModeValue(transition),
                    })}
                    disabled={isTransitioning}
                    onClick={event =>
                      void onTransition(transition.id, event.currentTarget)
                    }
                    title={t(`transitionTooltip${transition.nameSv}`)}
                    type="button"
                  >
                    <StatusIcon
                      className="h-3.5 w-3.5 shrink-0"
                      name={transition.iconName}
                    />
                    {t(`transitionTo${transition.nameSv}`)}
                  </button>
                ))}
            {canEdit &&
              currentStatusId !== STATUS_REVIEW &&
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
                  href={`/requirements/${requirementUniqueId}/edit`}
                  title={tc('editTooltip')}
                >
                  <span className="contents">
                    <Edit aria-hidden="true" className="h-4 w-4" />
                    {tc('edit')}
                  </span>
                </Link>
              ))}
            {canArchive &&
              isViewingLatest &&
              latestStatusForActions === STATUS_PUBLISHED && (
                <button
                  className="btn-destructive inline-flex items-center gap-1.5 w-full justify-center"
                  {...devMarker({
                    context: detailContext,
                    name: 'detail action',
                    priority: 360,
                    value: 'archive',
                  })}
                  onClick={event => void onArchive(event)}
                  title={tc('archiveTooltip')}
                  type="button"
                >
                  <Archive aria-hidden="true" className="h-4 w-4" />
                  {tc('archive')}
                </button>
              )}
            {canArchive &&
              hasPendingWorkAbovePublished &&
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
            {canDeleteDraft &&
              currentStatusId === STATUS_DRAFT &&
              isViewingLatest && (
                <button
                  className="btn-destructive inline-flex items-center gap-1.5 w-full justify-center"
                  {...devMarker({
                    context: detailContext,
                    name: 'detail action',
                    priority: 360,
                    value: 'delete draft',
                  })}
                  onClick={event => void onDeleteDraft(event)}
                  type="button"
                >
                  <Trash2 aria-hidden="true" className="h-4 w-4" />
                  {tc('delete')}
                </button>
              )}
          </>
        )
      ) : (
        canRestore && (
          <button
            className={`btn-secondary inline-flex items-center gap-1.5 w-full justify-center${restoreDisabled ? ' opacity-60 cursor-not-allowed' : ''}`}
            {...devMarker({
              context: detailContext,
              name: 'detail action',
              priority: 360,
              value: 'restore version',
            })}
            disabled={restoreDisabled}
            onClick={event => {
              if (selectedVersionNumberForRestore == null) return
              void onRestore(
                selectedVersionNumberForRestore,
                event.currentTarget,
              )
            }}
            title={
              hasPendingWork ? t('restoreBlockedByPendingWork') : undefined
            }
            type="button"
          >
            <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
            {tc('restoreVersion')}
          </button>
        )
      )}
    </div>
  )
}

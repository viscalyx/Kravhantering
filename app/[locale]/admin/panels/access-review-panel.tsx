'use client'

import {
  Check,
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  FileJson,
  FileText,
  X,
  XCircle,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { type MouseEvent, useCallback, useEffect, useState } from 'react'
import AnimatedHelpPanel from '@/components/AnimatedHelpPanel'
import { useAccessReviewExportDownload } from '@/components/access-review/useAccessReviewExportDownload'
import { useConfirmModal } from '@/components/ConfirmModal'
import FieldHelpButton from '@/components/FieldHelpButton'
import type {
  AccessReviewDecision,
  AccessReviewItem,
  AccessReviewRun,
  AccessReviewRunDetail,
} from '@/lib/access-review/types'
import { devMarker } from '@/lib/developer-mode-markers'
import { apiFetch } from '@/lib/http/api-fetch'
import { readResponseMessage } from '@/lib/http/response-message'
import { BUSINESS_TEXT_MAX_LENGTH } from '@/lib/http/validation-constants'
import { formatActorDisplayNameForLocale } from '@/lib/privacy/display-name'

type SaveState = 'error' | 'idle' | 'saved' | 'saving'
type AccessReviewSavingAction = 'cancel' | 'complete' | 'create' | 'decision'

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

export default function AccessReviewPanel({
  canManage,
}: {
  canManage: boolean
}) {
  const ta = useTranslations('admin')
  const tc = useTranslations('common')
  const locale = useLocale()
  const { confirm } = useConfirmModal()
  const [runs, setRuns] = useState<AccessReviewRun[]>([])
  const [hasLoadedRuns, setHasLoadedRuns] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [completedLoadAttempt, setCompletedLoadAttempt] = useState<
    number | null
  >(null)
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
    let cancelled = false
    async function loadRuns() {
      setHasLoadedRuns(false)
      setStatus('idle')
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
        const nextRuns = body.runs ?? []
        setRuns(nextRuns)
        setHasLoadedRuns(true)
        setStatus('idle')
        setSelectedRunId(current => current ?? nextRuns[0]?.id ?? null)
      } catch {
        if (!cancelled) {
          setHasLoadedRuns(false)
          setStatus('error')
          setMessage(loadErrorMessage)
        }
      } finally {
        if (!cancelled) setCompletedLoadAttempt(loadAttempt)
      }
    }
    void loadRuns()
    return () => {
      cancelled = true
    }
  }, [loadAttempt, loadErrorMessage])

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
  const isRunListLoading = completedLoadAttempt !== loadAttempt
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
    <>
      <section
        aria-labelledby="accessReview-tab"
        className="rounded-4xl border border-secondary-200/70 bg-white/90 p-6 shadow-sm dark:border-secondary-700/60 dark:bg-secondary-900/80"
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
                <p className="mt-1 wrap-break-word text-sm text-red-700 dark:text-red-300">
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

        {message && status !== 'error' ? (
          <div
            className="mt-4 text-sm font-medium text-emerald-700 dark:text-emerald-300"
            role="status"
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
                <FieldHelpButton
                  controls="access-review-external-evidence-help"
                  expanded={isExternalEvidenceHelpOpen}
                  label={`${tc('help')}: ${ta('accessReview.externalEvidenceReference')}`}
                  onClick={() => setIsExternalEvidenceHelpOpen(open => !open)}
                />
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
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-800 disabled:opacity-60"
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
          <aside aria-busy={isRunListLoading} className="space-y-3">
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
            ) : status === 'error' && !isRunListLoading ? (
              <button
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-secondary-200 px-4 py-2 text-sm font-medium text-secondary-700 transition-colors hover:bg-secondary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 disabled:opacity-60 dark:border-secondary-700 dark:text-secondary-200 dark:hover:bg-secondary-800"
                onClick={() => setLoadAttempt(current => current + 1)}
                type="button"
              >
                {tc('retry')}
              </button>
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
                          {ta('accessReview.runNumber', {
                            id: displayedRun.id,
                          })}
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
                          className="btn-destructive inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm disabled:opacity-60 dark:bg-secondary-900 dark:text-red-200 dark:hover:bg-red-950/30"
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
                          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-800 disabled:opacity-60"
                          disabled={isDetailLoading || status === 'saving'}
                          onClick={completeRun}
                          type="button"
                        >
                          <CheckCircle2
                            aria-hidden="true"
                            className="h-4 w-4"
                          />
                          {ta('accessReview.complete')}
                        </button>
                      ) : null}
                      {canManage ? (
                        <div className="flex min-w-0 max-w-full flex-nowrap items-center gap-2 overflow-x-auto">
                          <button
                            className="inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-secondary-200 bg-white px-4 py-2 text-sm font-medium text-secondary-700 transition-colors hover:bg-secondary-100 disabled:opacity-60 dark:border-secondary-700 dark:bg-secondary-900 dark:text-secondary-200 dark:hover:bg-secondary-800"
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
                            className="inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-secondary-200 bg-white px-4 py-2 text-sm font-medium text-secondary-700 transition-colors hover:bg-secondary-100 disabled:opacity-60 dark:border-secondary-700 dark:bg-secondary-900 dark:text-secondary-200 dark:hover:bg-secondary-800"
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
                                    className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border transition-colors disabled:opacity-60 ${
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
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-left align-middle">
                                {canChooseDecision ? (
                                  <select
                                    className="mt-2 block min-h-10 rounded-lg border border-secondary-200 bg-white px-3 py-2 disabled:cursor-not-allowed disabled:bg-secondary-100 disabled:text-secondary-500 dark:border-secondary-700 dark:bg-secondary-950 dark:disabled:bg-secondary-800 dark:disabled:text-secondary-400"
                                    disabled={
                                      isDetailLoading || status === 'saving'
                                    }
                                    onChange={event =>
                                      setDecisionDrafts(current => ({
                                        ...current,
                                        [item.id]: {
                                          ...draft,
                                          decision: event.target
                                            .value as Exclude<
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
                                        {ta(
                                          `accessReview.decisions.${decision}`,
                                        )}
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
              <div aria-hidden="true" className="min-h-128" />
            ) : hasLoadedRuns && !selectedRunId ? (
              <div className="rounded-2xl border border-secondary-200/70 bg-secondary-50/70 p-6 text-sm text-secondary-600 dark:border-secondary-700/60 dark:bg-secondary-950/40 dark:text-secondary-300">
                {ta('accessReview.selectRun')}
              </div>
            ) : null}
          </div>
        </div>
      </section>
      {exportDownload.dialog}
    </>
  )
}

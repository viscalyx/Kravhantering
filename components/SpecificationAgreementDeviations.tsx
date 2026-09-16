'use client'

import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock3,
  FilePenLine,
  Pencil,
  Send,
  XCircle,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { type ReactNode, useState } from 'react'
import { createPortal } from 'react-dom'
import { useConfirmModal } from '@/components/ConfirmModal'
import DeviationDecisionModal from '@/components/DeviationDecisionModal'
import DeviationFollowup from '@/components/DeviationFollowup'
import DeviationFormModal, {
  type DeviationPriorityLevel,
} from '@/components/DeviationFormModal'
import FieldLabelWithHelp from '@/components/FieldLabelWithHelp'
import FormModal from '@/components/FormModal'
import type { SpecificationAgreementView } from '@/components/SpecificationAgreementBox'
import { devMarker } from '@/lib/developer-mode-markers'
import { apiFetch } from '@/lib/http/api-fetch'
import { formatActorDisplayNameForLocale } from '@/lib/privacy/display-name'
import {
  type AgreementHttpError,
  agreementErrorMessage,
} from '@/lib/specifications/agreement-errors'
import type { AgreementRequirementHistory } from '@/lib/specifications/agreement-history'
import type { AgreementItem } from '@/lib/specifications/agreements'
import {
  deviationApplicability,
  deviationNeedsFollowup,
} from '@/lib/specifications/deviation-applicability'

export default function SpecificationAgreementDeviations({
  item,
  view,
  onChange,
  specificationId,
  createActionTarget,
  priorityLevel,
  showLaterEvents = false,
  history,
  historyOnly = false,
}: {
  item: AgreementItem
  view: SpecificationAgreementView
  onChange: () => Promise<void>
  specificationId: number
  createActionTarget?: HTMLElement | null
  priorityLevel?: DeviationPriorityLevel | null
  showLaterEvents?: boolean
  history?: AgreementRequirementHistory
  historyOnly?: boolean
}) {
  const t = useTranslations('deviation')
  const ta = useTranslations('agreement')
  const tc = useTranslations('common')
  const locale = useLocale()
  const { confirm } = useConfirmModal()
  const [editing, setEditing] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const [renewing, setRenewing] = useState<number | null>(null)
  const [closing, setClosing] = useState(false)
  const [deciding, setDeciding] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cancellingDeviationId, setCancellingDeviationId] = useState<
    number | null
  >(null)
  const [cancellationReason, setCancellationReason] = useState('')
  const [success, setSuccess] = useState<string | null>(null)
  const cancellingCase = view.deviations.find(
    deviation =>
      deviation.itemRef === item.itemRef &&
      deviation.id === cancellingDeviationId,
  )
  const selected = view.selectedAgreement
  const active =
    (!selected || ['draft', 'upcoming', 'current'].includes(selected.state)) &&
    !item.isRemoved
  const cases = view.deviations.filter(
    deviation => deviation.itemRef === item.itemRef,
  )
  const frozenAt =
    selected?.cancelledAt ?? selected?.endedAt ?? selected?.replacedAt
  const isLater = (value: Date | null | undefined) =>
    !!(
      frozenAt &&
      value &&
      new Date(value).getTime() > new Date(frozenAt).getTime()
    )
  const endingsFor = (deviationId: number) =>
    view.deviationEndings.filter(
      ending =>
        ending.itemRef === item.itemRef && ending.deviationId === deviationId,
    )
  const applicability = (
    deviation: (typeof cases)[number],
    historical = !!frozenAt,
  ) =>
    deviationApplicability(
      deviation,
      cases,
      view.deviationEndings,
      historical && frozenAt ? new Date(frozenAt) : new Date(),
    )
  const states = cases.map(deviation => applicability(deviation))
  const needsFollowup = deviationNeedsFollowup(
    states,
    item.specificationItemStatusId,
    active,
  )
  const latestApproval = [...cases]
    .filter(deviation => deviation.decision === 1)
    .sort(
      (a, b) =>
        new Date(b.decidedAt ?? 0).getTime() -
          new Date(a.decidedAt ?? 0).getTime() || b.id - a.id,
    )[0]
  const latestApprovalClosed =
    !!latestApproval &&
    endingsFor(latestApproval.id).some(
      ending => ending.endingKind === 'closed' && ending.endedAt,
    )
  const frozenCase = (id: number) =>
    item.deviationStateSnapshot?.find(deviation => deviation.id === id)
  const changedAfterFreeze = (deviation: (typeof cases)[number]) => {
    const snapshot = frozenCase(deviation.id)
    return (
      !!snapshot &&
      (snapshot.motivation !== deviation.motivation ||
        snapshot.isReviewRequested !== deviation.isReviewRequested) &&
      isLater(deviation.updatedAt)
    )
  }
  const laterCases = frozenAt
    ? cases.filter(
        deviation =>
          isLater(deviation.createdAt) ||
          changedAfterFreeze(deviation) ||
          isLater(deviation.decidedAt) ||
          (applicability(deviation, true) === 'applicable' &&
            applicability(deviation, false) === 'expired') ||
          endingsFor(deviation.id).some(
            ending =>
              isLater(ending.recordedAt) ||
              isLater(ending.endedAt) ||
              isLater(ending.cancelledAt),
          ),
      )
    : []
  const path = item.itemRef.startsWith('lib:')
    ? '/api/deviations'
    : '/api/specification-local-deviations'
  const formatDate = (value: Date | null | undefined) =>
    value
      ? new Intl.DateTimeFormat(locale, {
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(new Date(value))
      : ta('notRecorded')
  const actor = (value: string | null | undefined) =>
    formatActorDisplayNameForLocale(value, locale) || ta('notRecorded')
  const mutate = async (
    url: string,
    body: Record<string, unknown>,
    method = 'POST',
  ) => {
    setBusy(true)
    setError(null)
    setSuccess(null)
    try {
      const response = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, agreementId: selected?.id }),
      })
      const result = (await response.json()) as AgreementHttpError | null
      if (!response.ok) {
        setError(agreementErrorMessage(result ?? {}, ta))
        return
      }
      await onChange()
      setCreating(false)
      setRenewing(null)
      setEditing(null)
      setDeciding(null)
      setCancellingDeviationId(null)
      if (body.operation === 'cancel_deviation')
        setSuccess(ta('cancelDeviationSuccess'))
    } catch {
      setError(t('saveFailed'))
    } finally {
      setBusy(false)
    }
  }
  const endingState = (deviationId: number, historical: boolean) => {
    const visible = endingsFor(deviationId).filter(
      ending => !historical || !isLater(ending.recordedAt),
    )
    return {
      ended: visible.find(
        ending => ending.endedAt && (!historical || !isLater(ending.endedAt)),
      ),
      planned: visible.find(
        ending =>
          (!ending.cancelledAt ||
            (historical && isLater(ending.cancelledAt))) &&
          (!ending.endedAt || (historical && isLater(ending.endedAt))),
      ),
    }
  }
  const visibleCases = cases
    .filter(
      deviation =>
        !isLater(deviation.createdAt) &&
        (!frozenAt ||
          item.deviationStateSnapshot == null ||
          !!frozenCase(deviation.id)),
    )
    .sort(
      (a, b) =>
        new Date(b.createdAt ?? 0).getTime() -
          new Date(a.createdAt ?? 0).getTime() || b.id - a.id,
    )
  const importantCases = visibleCases.filter(
    deviation =>
      deviation.decision === null ||
      isLater(deviation.decidedAt) ||
      (deviation.decision === 1 && applicability(deviation) === 'applicable'),
  )
  const shownCases = historyOnly
    ? visibleCases
    : importantCases.length
      ? importantCases
      : visibleCases.slice(0, 1)
  const previousCases = visibleCases.filter(
    deviation => !shownCases.includes(deviation),
  )
  const historicalEntries = new Map<
    string,
    NonNullable<typeof history>['entries'][number]
  >()
  for (const agreementId of history?.ancestorAgreementIds ?? []) {
    for (const entry of history?.entries ?? []) {
      if (
        entry.agreementId !== agreementId ||
        entry.item.itemRef === item.itemRef ||
        historicalEntries.has(entry.item.itemRef)
      )
        continue
      if (
        history?.deviations?.some(
          deviation => deviation.itemRef === entry.item.itemRef,
        )
      )
        historicalEntries.set(entry.item.itemRef, entry)
    }
  }
  const renderCase = (
    current: (typeof cases)[number],
    historical: boolean,
    laterEvent = false,
  ): ReactNode => {
    const snapshot = historical ? frozenCase(current.id) : undefined
    const deviation = snapshot ? { ...current, ...snapshot } : current
    const motivation =
      historical && !snapshot
        ? ta('missingHistoricalValue')
        : deviation.motivation
    const decision =
      historical && isLater(deviation.decidedAt) ? null : deviation.decision
    const { ended, planned } = endingState(deviation.id, historical)
    const state = applicability(current, historical)
    const muted = decision === 3 || (decision === 1 && state !== 'applicable')
    const Icon = muted
      ? Ban
      : decision === 1
        ? CheckCircle2
        : decision === 2
          ? XCircle
          : deviation.isReviewRequested
            ? Send
            : FilePenLine
    const statusKey =
      decision === 1
        ? 'statusApproved'
        : decision === 2
          ? 'statusRejected'
          : decision === 3
            ? 'statusCancelled'
            : deviation.isReviewRequested
              ? 'stepReviewRequested'
              : 'stepDraft'
    const Container = laterEvent ? 'div' : 'article'
    return (
      <Container
        aria-label={laterEvent ? undefined : motivation}
        className={`space-y-2 rounded-xl border px-4 py-3 text-sm ${muted ? 'border-secondary-200 bg-secondary-50 text-secondary-700 dark:border-secondary-700 dark:bg-secondary-800/50 dark:text-secondary-300' : decision === 1 ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950/30 dark:text-green-300' : decision === 2 ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300' : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200'}`}
        key={deviation.id}
        {...devMarker({
          context: 'requirements specification detail',
          name: 'deviation case',
          value: ended ? 'ended' : statusKey,
          priority: 350,
        })}
      >
        <p
          className="flex flex-wrap items-center gap-1.5 font-medium"
          role="status"
        >
          <Icon aria-hidden="true" className="h-4 w-4" />
          {ended
            ? ta('deviationEndedOn', { date: formatDate(ended.endedAt) })
            : historical && decision === null && !snapshot
              ? ta('missingHistoricalValue')
              : t(statusKey)}
          {decision === 1 && planned && !ended && (
            <span className="inline-flex items-center gap-1.5">
              <Clock3 aria-hidden="true" className="h-4 w-4" />
              {ta('endingPlanned')} · {planned.plannedEffectiveDate}
            </span>
          )}
        </p>
        {decision === 1 && (
          <div
            className="space-y-1"
            {...devMarker({
              name: 'approval applicability',
              value: state,
              priority: 350,
            })}
          >
            <p role="status">{t(`applicability.${state}`)}</p>
            <p
              {...devMarker({
                name: 'approval validity',
                value: 'inclusive calendar end date',
                priority: 350,
              })}
            >
              {deviation.validThrough
                ? t('validThroughValue', { date: deviation.validThrough })
                : t('unlimitedValidity')}
            </p>
            {deviation.conditions && (
              <p className="whitespace-pre-wrap wrap-break-word">
                {t('conditions')}: {deviation.conditions}
              </p>
            )}
          </div>
        )}
        {deviation.renewsDeviationId && (
          <p>{t('renewalOf', { id: deviation.renewsDeviationId })}</p>
        )}
        <p className="whitespace-pre-wrap wrap-break-word">{motivation}</p>
        {!historical && frozenAt && changedAfterFreeze(current) && (
          <p>
            {ta('deviationChangedOn', { date: formatDate(current.updatedAt) })}
          </p>
        )}
        {deviation.decision !== null &&
          !(historical && isLater(deviation.decidedAt)) && (
            <p className="whitespace-pre-wrap wrap-break-word">
              {deviation.decisionMotivation}
            </p>
          )}
        {endingsFor(deviation.id).map(ending => {
          const events = [
            {
              key: 'endingPlanned',
              at: ending.endingKind ? null : ending.recordedAt,
              detail: ending.plannedEffectiveDate,
            },
            { key: 'deviationEnded', at: ending.endedAt, detail: null },
            { key: 'endingCancelled', at: ending.cancelledAt, detail: null },
          ].filter(
            event =>
              event.at &&
              (!frozenAt ||
                (historical ? !isLater(event.at) : isLater(event.at))),
          )
          return events.map(event => (
            <p key={`${ending.id}:${event.key}`}>
              {ta(event.key)} · {ending.agreementReference} ·{' '}
              {formatDate(event.at)}
              {event.detail ? ` · ${event.detail}` : ''}
              {ending.endingKind && (
                <> · {t(`applicability.${ending.endingKind}`)}</>
              )}
              {ending.reason && <> · {ending.reason}</>}
              {ending.recordedBy && <> · {actor(ending.recordedBy)}</>}
            </p>
          ))
        })}
        <details>
          <summary className="min-h-6 cursor-pointer rounded py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
            {ta('registrationInformation')}
          </summary>
          <p>
            {tc('createdAt')}: {formatDate(deviation.createdAt)} ·{' '}
            {actor(deviation.createdBy)}
          </p>
          {decision !== null && (
            <p>
              {t(statusKey)} · {formatDate(deviation.decidedAt)} ·{' '}
              {actor(deviation.decidedBy)}
            </p>
          )}
        </details>
        {active &&
          !historical &&
          deviation.id === latestApproval?.id &&
          decision === 1 && (
            <div
              className="flex flex-wrap justify-end gap-2"
              {...devMarker({
                name: 'approval actions',
                value: 'renew or close shared permission',
                priority: 350,
              })}
            >
              {view.canAuthor &&
                !latestApprovalClosed &&
                !cases.some(value => value.decision === null) && (
                  <button
                    className="btn-secondary"
                    disabled={busy}
                    onClick={() => {
                      setRenewing(deviation.id)
                      setCreating(true)
                      setError(null)
                    }}
                    type="button"
                  >
                    {t('renewDeviation')}
                  </button>
                )}
              {view.canDecide &&
                !cases.some(value => value.decision === null) &&
                applicability(deviation) === 'applicable' &&
                !endingsFor(deviation.id).some(ending => ending.endedAt) && (
                  <button
                    className="btn-secondary"
                    {...devMarker({
                      name: 'close approval',
                      value:
                        'end applicable shared permission without pending renewal',
                    })}
                    disabled={busy}
                    onClick={() => {
                      setClosing(true)
                      setCancellationReason('')
                      setCancellingDeviationId(deviation.id)
                      setError(null)
                    }}
                    type="button"
                  >
                    {t('closeApproval')}
                  </button>
                )}
            </div>
          )}
        {active && deviation.decision === null && (
          <div className="flex flex-wrap justify-end gap-2">
            {view.canAuthor && !deviation.isReviewRequested && (
              <button
                className="btn-secondary text-center"
                disabled={busy}
                onClick={() => {
                  setError(null)
                  setEditing(deviation.id)
                }}
                type="button"
              >
                <Pencil
                  aria-hidden="true"
                  className="mr-1.5 inline-block h-4 w-4 align-middle"
                />
                {t('editDeviation')}
              </button>
            )}
            {view.canAuthor && !!deviation.isReviewRequested && (
              <button
                className="btn-secondary"
                disabled={busy}
                onClick={async event => {
                  const accepted = await confirm({
                    message: t('revertToDraftConfirm'),
                    title: t('revertToDraftConfirmTitle'),
                    anchorEl: event.currentTarget,
                  })
                  if (accepted)
                    await mutate(`${path}/${deviation.id}/revert-to-draft`, {})
                }}
                type="button"
              >
                {t('revertToDraft')}
              </button>
            )}
            {view.canAuthor && !deviation.isReviewRequested && (
              <button
                className="btn-primary"
                disabled={busy}
                onClick={() =>
                  void mutate(`${path}/${deviation.id}/request-review`, {})
                }
                type="button"
              >
                {t('requestReview')}
              </button>
            )}
            {view.canReviewDeviations && !!deviation.isReviewRequested && (
              <button
                className="btn-primary"
                disabled={busy}
                onClick={() => {
                  setError(null)
                  setDeciding(deviation.id)
                }}
                type="button"
              >
                {t('recordDecision')}
              </button>
            )}
            {view.canAuthor && (
              <button
                className="btn-secondary"
                disabled={busy}
                onClick={() => {
                  setError(null)
                  setClosing(false)
                  setCancellationReason('')
                  setCancellingDeviationId(deviation.id)
                }}
                type="button"
              >
                {ta('cancelDeviation')}
              </button>
            )}
          </div>
        )}
        {historical && showLaterEvents && laterCases.includes(current) && (
          <details className="space-y-2 border-t border-secondary-200 pt-2 dark:border-secondary-700">
            <summary className="min-h-6 cursor-pointer rounded py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
              {ta('laterEvents')}
            </summary>
            <section
              aria-label={ta('laterEvents')}
              {...devMarker({
                context: 'requirements specification detail',
                name: 'history section',
                value: 'later shared deviation events',
                priority: 350,
              })}
            >
              <p>{ta('laterEventsHelp')}</p>
              {renderCase(current, false, true)}
            </section>
          </details>
        )}
      </Container>
    )
  }

  const createAction = active &&
    (!latestApproval || latestApprovalClosed) &&
    view.canAuthor &&
    !cases.some(
      deviation =>
        deviation.decision === null ||
        (deviation.decision === 1 && applicability(deviation) === 'applicable'),
    ) && (
      <button
        className="min-h-11 w-full text-center rounded-xl border border-amber-500 bg-amber-500 px-3 py-2 text-sm font-semibold text-secondary-950 shadow-sm hover:border-amber-600 hover:bg-amber-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 disabled:opacity-50 dark:border-amber-500 dark:bg-amber-500 dark:text-secondary-950 dark:hover:bg-amber-400"
        disabled={busy}
        {...devMarker({
          name: 'deviation request',
          value: 'new request without renewal link',
          priority: 350,
        })}
        onClick={() => {
          setError(null)
          setRenewing(null)
          setCreating(true)
        }}
        type="button"
      >
        <AlertTriangle
          aria-hidden="true"
          className="mr-1.5 inline-block h-4 w-4 align-middle"
        />
        {t('requestDeviation')}
      </button>
    )

  return (
    <section
      aria-label={t('title')}
      className="space-y-3"
      {...devMarker({
        context: 'requirements specification detail',
        name: 'deviation section',
        value: 'selected agreement requirement deviations',
        priority: 350,
      })}
    >
      {needsFollowup && (
        <DeviationFollowup closed={states.includes('closed')} />
      )}
      {frozenAt && item.deviationStateSnapshot == null && (
        <p className="text-sm">{ta('missingHistoricalHelp')}</p>
      )}
      {visibleCases.length > 0 && (
        <h3 className="text-sm font-semibold">{t('title')}</h3>
      )}
      {shownCases.map(deviation => renderCase(deviation, !!frozenAt))}
      {(previousCases.length > 0 || historicalEntries.size > 0) && (
        <details
          className="space-y-3"
          {...devMarker({
            context: 'requirements specification detail',
            name: 'deviation history',
            value: 'requirement deviation history',
            priority: 350,
          })}
        >
          <summary className="min-h-6 cursor-pointer rounded py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
            {t('historyLabel')}
          </summary>
          {previousCases.map(deviation => renderCase(deviation, !!frozenAt))}
          {[...historicalEntries.values()].map(entry => (
            <div className="space-y-2" key={entry.item.itemRef}>
              <p className="text-sm font-medium">
                {entry.agreementReference} · {entry.item.uniqueId}
              </p>
              <SpecificationAgreementDeviations
                historyOnly
                item={entry.item}
                onChange={async () => {}}
                showLaterEvents
                specificationId={specificationId}
                view={{
                  ...view,
                  selectedAgreement:
                    view.agreements.find(
                      agreement => agreement.id === entry.agreementId,
                    ) ?? null,
                  deviations: history?.deviations ?? [],
                  deviationEndings: history?.deviationEndings ?? [],
                  canAuthor: false,
                  canReviewDeviations: false,
                }}
              />
            </div>
          ))}
        </details>
      )}
      {showLaterEvents &&
        laterCases.some(deviation => !visibleCases.includes(deviation)) && (
          <details className="space-y-3">
            <summary className="min-h-6 cursor-pointer rounded py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
              {ta('laterEvents')}
            </summary>
            <section
              aria-label={ta('laterEvents')}
              className="space-y-3"
              {...devMarker({
                context: 'requirements specification detail',
                name: 'history section',
                value: 'later shared deviation events',
                priority: 350,
              })}
            >
              <p className="text-sm">{ta('laterEventsHelp')}</p>
              {laterCases
                .filter(deviation => !visibleCases.includes(deviation))
                .map(deviation => renderCase(deviation, false))}
            </section>
          </details>
        )}
      {createActionTarget
        ? createPortal(createAction, createActionTarget)
        : createAction}
      {error &&
        !creating &&
        editing === null &&
        deciding === null &&
        cancellingDeviationId === null && (
          <p className="text-sm text-red-700 dark:text-red-300" role="alert">
            {error}
          </p>
        )}
      {success && (
        <p
          className="text-sm text-secondary-700 dark:text-secondary-300"
          role="status"
        >
          {success}
        </p>
      )}
      <DeviationFormModal
        affectedRequirementIds={[item.uniqueId]}
        error={error}
        initialMotivation={
          cases.find(deviation => deviation.id === editing)?.motivation
        }
        loading={busy}
        onClose={() => {
          setCreating(false)
          setRenewing(null)
          setEditing(null)
          setError(null)
        }}
        onSubmit={motivation =>
          void mutate(
            editing !== null
              ? `${path}/${editing}`
              : `/api/specification-item-deviations/${encodeURIComponent(item.itemRef)}`,
            {
              motivation,
              ...(renewing !== null ? { renewsDeviationId: renewing } : {}),
            },
            editing !== null ? 'PUT' : 'POST',
          )
        }
        open={creating || editing !== null}
        priorityLevel={priorityLevel}
        scopeNotice={
          renewing !== null
            ? t('sharedApprovalScope', {
                references:
                  cases.find(value => value.id === renewing)
                    ?.agreementReferences ??
                  selected?.agreementReference ??
                  item.uniqueId,
              })
            : creating &&
                item.currentAgreementReference &&
                selected?.state !== 'current'
              ? ta('sharedDeviationScope', {
                  reference: item.currentAgreementReference,
                })
              : undefined
        }
        title={editing !== null ? t('editDeviation') : undefined}
      />
      <FormModal
        closeDisabled={busy}
        developerModeValue="agreement deviation cancellation"
        onClose={() => setCancellingDeviationId(null)}
        open={cancellingDeviationId !== null}
        title={closing ? t('closeApproval') : ta('cancelDeviation')}
        titleId={`cancel-deviation-${item.itemRef}`}
      >
        <form
          className="space-y-4 p-5"
          onSubmit={async event => {
            event.preventDefault()
            if (cancellingDeviationId === null) return
            await mutate(
              `/api/requirements-specifications/${specificationId}/agreement`,
              {
                operation: closing ? 'close_deviation' : 'cancel_deviation',
                itemRef: item.itemRef,
                deviationId: cancellingDeviationId,
                reason: cancellationReason.trim(),
              },
            )
          }}
        >
          <p>
            {closing
              ? t('closeApprovalHelp')
              : ta('cancelDeviationExplanation')}
          </p>
          {cancellingCase?.agreementReferences && (
            <p>
              {closing
                ? t('sharedApprovalScope', {
                    references: cancellingCase.agreementReferences,
                  })
                : ta('cancelDeviationSharedScope', {
                    references: cancellingCase.agreementReferences,
                  })}
            </p>
          )}
          <p className="whitespace-pre-wrap wrap-break-word">
            {cancellingCase?.motivation}
          </p>
          <FieldLabelWithHelp
            help={ta('cancelDeviationReasonHelp')}
            htmlFor={`deviation-cancellation-${item.itemRef}`}
            label={ta('reason')}
            required
          />
          <textarea
            className="w-full rounded-lg border border-secondary-300 bg-white p-3 text-secondary-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:border-secondary-600 dark:bg-secondary-900 dark:text-secondary-100"
            id={`deviation-cancellation-${item.itemRef}`}
            maxLength={10000}
            onChange={event => setCancellationReason(event.target.value)}
            required
            value={cancellationReason}
          />
          {error && (
            <p className="text-sm text-red-700 dark:text-red-300" role="alert">
              {error}
            </p>
          )}
          <div
            className="flex flex-wrap justify-end gap-3"
            {...devMarker({
              context: 'requirements specification detail',
              name: 'form actions',
              value: 'end deviation without a decision',
              priority: 350,
            })}
          >
            <button
              className="btn-secondary"
              disabled={busy}
              onClick={() => setCancellingDeviationId(null)}
              type="button"
            >
              {tc('close')}
            </button>
            <button
              className="btn-destructive"
              disabled={busy || !cancellationReason.trim()}
              type="submit"
            >
              {busy
                ? ta('working')
                : closing
                  ? t('closeApproval')
                  : ta('cancelDeviation')}
            </button>
          </div>
        </form>
      </FormModal>
      <DeviationDecisionModal
        error={error}
        loading={busy}
        onClose={() => {
          setDeciding(null)
          setError(null)
        }}
        onSubmit={(decision, decisionMotivation, terms) =>
          void mutate(`${path}/${deciding}/decision`, {
            decision,
            decisionMotivation,
            ...terms,
          })
        }
        open={deciding !== null}
        scopeNotice={
          cases.find(value => value.id === deciding)?.renewsDeviationId
            ? t('sharedApprovalScope', {
                references:
                  cases.find(value => value.id === deciding)
                    ?.agreementReferences ??
                  selected?.agreementReference ??
                  item.uniqueId,
              })
            : undefined
        }
      />
    </section>
  )
}

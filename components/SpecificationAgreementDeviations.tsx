'use client'

import { CheckCircle2, Clock3, FilePenLine, Send, XCircle } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'
import { useConfirmModal } from '@/components/ConfirmModal'
import DeviationDecisionModal from '@/components/DeviationDecisionModal'
import DeviationFormModal from '@/components/DeviationFormModal'
import type { SpecificationAgreementView } from '@/components/SpecificationAgreementBox'
import { devMarker } from '@/lib/developer-mode-markers'
import { apiFetch } from '@/lib/http/api-fetch'
import { formatActorDisplayNameForLocale } from '@/lib/privacy/display-name'
import {
  type AgreementHttpError,
  agreementErrorMessage,
} from '@/lib/specifications/agreement-errors'
import type { AgreementItem } from '@/lib/specifications/agreements'

export default function SpecificationAgreementDeviations({
  item,
  view,
  onChange,
  onCancel,
  showLaterEvents = false,
}: {
  item: AgreementItem
  view: SpecificationAgreementView
  onChange: () => Promise<void>
  onCancel: (id: number) => void
  showLaterEvents?: boolean
}) {
  const t = useTranslations('deviation')
  const ta = useTranslations('agreement')
  const locale = useLocale()
  const { confirm } = useConfirmModal()
  const [editing, setEditing] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const [deciding, setDeciding] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
  const laterCases = frozenAt
    ? cases.filter(
        deviation =>
          isLater(deviation.createdAt) ||
          isLater(deviation.decidedAt) ||
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
          timeZone: 'Europe/Stockholm',
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
    try {
      const response = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, agreementId: selected?.id }),
      })
      const result = (await response.json()) as AgreementHttpError
      if (!response.ok) throw new Error(agreementErrorMessage(result, ta))
      await onChange()
      setCreating(false)
      setEditing(null)
      setDeciding(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('saveFailed'))
    } finally {
      setBusy(false)
    }
  }
  const renderCase = (
    deviation: (typeof cases)[number],
    historical: boolean,
  ) => (
    <div
      className="space-y-2 rounded-lg border border-secondary-200 p-3 text-sm dark:border-secondary-700"
      key={deviation.id}
    >
      <p className="flex items-center gap-1.5 font-medium" role="status">
        {historical && isLater(deviation.decidedAt) ? (
          <Clock3 aria-hidden="true" className="h-4 w-4" />
        ) : deviation.decision === 1 ? (
          <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
        ) : deviation.decision === 2 || deviation.decision === 3 ? (
          <XCircle aria-hidden="true" className="h-4 w-4" />
        ) : deviation.isReviewRequested ? (
          <Send aria-hidden="true" className="h-4 w-4" />
        ) : (
          <FilePenLine aria-hidden="true" className="h-4 w-4" />
        )}
        {t(
          historical && isLater(deviation.decidedAt)
            ? 'statusPending'
            : deviation.decision === 1
              ? 'statusApproved'
              : deviation.decision === 2
                ? 'statusRejected'
                : deviation.decision === 3
                  ? 'statusCancelled'
                  : deviation.isReviewRequested
                    ? 'stepReviewRequested'
                    : 'stepDraft',
        )}
      </p>
      <p className="whitespace-pre-wrap wrap-break-word">
        {deviation.motivation}
      </p>
      {deviation.decision !== null &&
        !(historical && isLater(deviation.decidedAt)) && (
          <>
            <p className="whitespace-pre-wrap wrap-break-word">
              {deviation.decisionMotivation}
            </p>
            <p>
              {formatDate(deviation.decidedAt)} · {actor(deviation.decidedBy)}
            </p>
          </>
        )}
      {endingsFor(deviation.id).map(ending => {
        const events = [
          {
            key: 'endingPlanned',
            at: ending.recordedAt,
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
          </p>
        ))
      })}
      <details>
        <summary className="min-h-6 cursor-pointer rounded py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
          {ta('registrationInformation')}
        </summary>
        <p>
          {formatDate(deviation.createdAt)} · {actor(deviation.createdBy)}
        </p>
      </details>
      {active && deviation.decision === null && (
        <div className="flex flex-wrap gap-2">
          {view.canAuthor && !deviation.isReviewRequested && (
            <button
              className="btn-secondary"
              disabled={busy}
              onClick={() => {
                setError(null)
                setEditing(deviation.id)
              }}
              type="button"
            >
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
              className="btn-secondary"
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
              onClick={() => onCancel(deviation.id)}
              type="button"
            >
              {ta('cancelDeviation')}
            </button>
          )}
        </div>
      )}
    </div>
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
      <h3 className="text-sm font-semibold">{t('title')}</h3>
      {cases
        .filter(deviation => !isLater(deviation.createdAt))
        .map(deviation => renderCase(deviation, !!frozenAt))}
      {showLaterEvents && laterCases.length > 0 && (
        <section
          aria-label={ta('laterEvents')}
          className="space-y-3 border-t border-secondary-200 pt-3 dark:border-secondary-700"
          {...devMarker({
            context: 'requirements specification detail',
            name: 'history section',
            value: 'later shared deviation events',
            priority: 350,
          })}
        >
          <h4 className="text-sm font-semibold">{ta('laterEvents')}</h4>
          <p className="text-sm">{ta('laterEventsHelp')}</p>
          {laterCases.map(deviation => renderCase(deviation, false))}
        </section>
      )}
      {active &&
        view.canAuthor &&
        !cases.some(
          deviation =>
            deviation.decision === null ||
            (deviation.decision === 1 &&
              !endingsFor(deviation.id).some(ending => ending.endedAt)),
        ) && (
          <button
            className="btn-secondary"
            disabled={busy}
            onClick={() => {
              setError(null)
              setCreating(true)
            }}
            type="button"
          >
            {t('requestDeviation')}
          </button>
        )}
      {error && !creating && editing === null && deciding === null && (
        <p className="text-sm text-red-700 dark:text-red-300" role="alert">
          {error}
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
          setEditing(null)
          setError(null)
        }}
        onSubmit={motivation =>
          void mutate(
            editing !== null
              ? `${path}/${editing}`
              : `/api/specification-item-deviations/${encodeURIComponent(item.itemRef)}`,
            { motivation },
            editing !== null ? 'PUT' : 'POST',
          )
        }
        open={creating || editing !== null}
        scopeNotice={
          creating &&
          item.currentAgreementReference &&
          selected?.state !== 'current'
            ? ta('sharedDeviationScope', {
                reference: item.currentAgreementReference,
              })
            : undefined
        }
        title={editing !== null ? t('editDeviation') : undefined}
      />
      <DeviationDecisionModal
        error={error}
        loading={busy}
        onClose={() => {
          setDeciding(null)
          setError(null)
        }}
        onSubmit={(decision, decisionMotivation) =>
          void mutate(`${path}/${deciding}/decision`, {
            decision,
            decisionMotivation,
          })
        }
        open={deciding !== null}
      />
    </section>
  )
}

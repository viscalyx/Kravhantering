'use client'

import {
  CheckCircle2,
  ChevronDown,
  Clock,
  FilePenLine,
  History,
  Pencil,
  Plus,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useConfirmModal } from '@/components/ConfirmModal'
import FieldLabelWithHelp from '@/components/FieldLabelWithHelp'
import FormModal from '@/components/FormModal'
import { devMarker } from '@/lib/developer-mode-markers'
import { apiFetch } from '@/lib/http/api-fetch'
import { formatActorDisplayNameForLocale } from '@/lib/privacy/display-name'
import {
  type AgreementHttpError,
  agreementErrorMessage,
} from '@/lib/specifications/agreement-errors'
import type {
  AgreementMutationInput,
  createSpecificationAgreementWorkflow,
} from '@/lib/specifications/agreements'

export type SpecificationAgreementView = Awaited<
  ReturnType<ReturnType<typeof createSpecificationAgreementWorkflow>['read']>
>

interface ComponentProps {
  itemRefs?: string
  onContextChange: (
    view: SpecificationAgreementView,
    refreshItems?: boolean,
  ) => void
  refreshKey?: number
  specificationId: number
}

const iconButton =
  'inline-flex min-h-6 min-w-6 items-center justify-center rounded-md text-secondary-600 hover:bg-secondary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-40 dark:text-secondary-300 dark:hover:bg-secondary-800'
const fieldClass =
  'w-full rounded-lg border border-secondary-300 bg-white px-3 py-2 text-secondary-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:border-secondary-600 dark:bg-secondary-950 dark:text-secondary-100'

function StateIcon({ state }: { state: string }) {
  const Icon =
    state === 'draft'
      ? FilePenLine
      : state === 'upcoming'
        ? Clock
        : state === 'current'
          ? CheckCircle2
          : History
  return <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
}

export default function SpecificationAgreementBox({
  specificationId,
  onContextChange,
  refreshKey = 0,
  itemRefs = '',
}: ComponentProps) {
  const t = useTranslations('agreement')
  const tc = useTranslations('common')
  const locale = useLocale()
  const { confirm } = useConfirmModal()
  const [view, setView] = useState<SpecificationAgreementView | null>(null)
  const [endPreview, setEndPreview] = useState<Array<{
    id: number
    itemRef: string
    uniqueId: string
    motivation: string
  }> | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<
    'create' | 'details' | 'cancel' | 'end' | 'correct' | null
  >(null)
  const [selectorOpen, setSelectorOpen] = useState(false)
  const selectorTrigger = useRef<HTMLButtonElement>(null)
  const selectorPanel = useRef<HTMLDivElement>(null)
  const [selectorPosition, setSelectorPosition] = useState({
    top: 0,
    left: 0,
    width: 320,
  })
  useEffect(() => {
    if (!selectorOpen) return
    const position = () => {
      const rect = selectorTrigger.current?.getBoundingClientRect()
      if (!rect) return
      const width = Math.min(360, window.innerWidth - 16)
      setSelectorPosition({
        width,
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        top: Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 240)),
      })
    }
    position()
    selectorPanel.current
      ?.querySelector<HTMLElement>('button, summary')
      ?.focus()
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !selectorPanel.current?.contains(event.target) &&
        !selectorTrigger.current?.contains(event.target)
      )
        setSelectorOpen(false)
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setSelectorOpen(false)
        selectorTrigger.current?.focus()
      }
    }
    const blur = (event: FocusEvent) => {
      if (
        event.target instanceof Node &&
        !selectorPanel.current?.contains(event.target) &&
        !selectorTrigger.current?.contains(event.target)
      )
        setSelectorOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', handleEscape)
    document.addEventListener('focusin', blur)
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', handleEscape)
      document.removeEventListener('focusin', blur)
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, true)
    }
  }, [selectorOpen])
  const [reference, setReference] = useState('')
  const [date, setDate] = useState('')
  const [description, setDescription] = useState('')
  const [reason, setReason] = useState('')
  const selectedId = useRef<number | undefined>(undefined)
  const requestId = useRef(0)
  const onContextChangeRef = useRef(onContextChange)
  useEffect(() => {
    onContextChangeRef.current = onContextChange
  }, [onContextChange])
  const triggerRef = useRef<HTMLButtonElement>(null)
  const referenceRef = useRef<HTMLInputElement>(null)
  const loadedSpecificationId = useRef(specificationId)

  const load = useCallback(
    async (agreementId?: number, refreshItems = false) => {
      const request = ++requestId.current
      setBusy(true)
      setError(null)
      try {
        const parameters = new URLSearchParams()
        if (agreementId !== undefined)
          parameters.set('agreementId', String(agreementId))
        if (itemRefs) parameters.set('itemRefs', itemRefs)
        const query = parameters.size ? `?${parameters}` : ''
        const response = await fetch(
          `/api/requirements-specifications/${specificationId}/agreement${query}`,
        )
        if (!response.ok) throw new Error(t('loadFailed'))
        const next = (await response.json()) as SpecificationAgreementView
        if (request !== requestId.current) return
        selectedId.current = next.selectedAgreement?.id
        setView(next)
        onContextChangeRef.current(next, refreshItems)
      } catch (cause) {
        if (request === requestId.current)
          setError(cause instanceof Error ? cause.message : t('loadFailed'))
      } finally {
        if (request === requestId.current) setBusy(false)
      }
    },
    [specificationId, t, itemRefs],
  )

  useEffect(() => {
    void refreshKey
    if (loadedSpecificationId.current !== specificationId) {
      loadedSpecificationId.current = specificationId
      selectedId.current = undefined
      setView(null)
      setDialog(null)
      setSelectorOpen(false)
    }
    void load(selectedId.current)
    return () => {
      requestId.current += 1
    }
  }, [load, refreshKey, specificationId])

  const mutate = async (input: AgreementMutationInput) => {
    setBusy(true)
    setError(null)
    try {
      const response = await apiFetch(
        `/api/requirements-specifications/${specificationId}/agreement`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        },
      )
      const result = (await response.json()) as AgreementHttpError & {
        agreementId?: number
      }
      if (!response.ok) {
        await load(selectedId.current)
        throw new Error(agreementErrorMessage(result, t))
      }
      await load(
        input.operation === 'discard' || input.operation === 'cancel'
          ? undefined
          : (result.agreementId ?? selectedId.current),
        true,
      )
      setDialog(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('saveFailed'))
    } finally {
      setBusy(false)
    }
  }

  const selected = view?.selectedAgreement
  const today = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
  }).format(new Date())
  const timestamp = (value: Date | null | undefined) =>
    value
      ? new Intl.DateTimeFormat(locale, {
          dateStyle: 'medium',
          timeStyle: 'short',
          timeZone: 'Europe/Stockholm',
        }).format(new Date(value))
      : t('notRecorded')
  const actorName = (value: string | null | undefined) =>
    formatActorDisplayNameForLocale(value, locale) || t('notRecorded')
  const affectedEndDeviations =
    endPreview ??
    (view?.deviations ?? []).filter(
      deviation =>
        (view?.items ?? []).some(
          item => item.itemRef === deviation.itemRef && !item.isRemoved,
        ) &&
        (deviation.decision === null ||
          (deviation.decision === 1 &&
            !(view?.deviationEndings ?? []).some(
              ending =>
                ending.itemRef === deviation.itemRef &&
                ending.deviationId === deviation.id &&
                ending.endedAt !== null,
            ))),
    )
  const confirmationDeviations = view?.confirmationDeviations ?? []
  const pendingConfirmationDeviation = confirmationDeviations.some(
    deviation => deviation.decision === null,
  )
  const first = !view?.agreements.some(
    agreement => agreement.state !== 'cancelled',
  )
  const pending = view?.agreements.some(agreement =>
    ['draft', 'upcoming'].includes(agreement.state),
  )
  const previousAgreements =
    view?.agreements.filter(
      agreement => !['current', 'draft', 'upcoming'].includes(agreement.state),
    ) ?? []
  const openCreate = () => {
    setReference('')
    setDate('')
    setDescription('')
    setDialog('create')
  }
  const entry = (
    agreement: NonNullable<SpecificationAgreementView['selectedAgreement']>,
  ) => (
    <li key={agreement.id}>
      <button
        aria-current={selected?.id === agreement.id ? 'true' : undefined}
        className="flex min-h-8 w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-secondary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:hover:bg-secondary-800"
        disabled={busy}
        onClick={() => {
          setSelectorOpen(false)
          void load(agreement.id)
        }}
        type="button"
      >
        <StateIcon state={agreement.state} />
        <span className="min-w-0 wrap-break-word">
          {agreement.agreementReference} · {agreement.effectiveDate} ·{' '}
          {t(`states.${agreement.state}`)}
        </span>
      </button>
    </li>
  )

  return (
    <div
      className="relative min-w-0 rounded-xl border border-secondary-200/70 bg-white/50 px-3 py-2.5 backdrop-blur-sm dark:border-secondary-700/70 dark:bg-secondary-900/40"
      {...devMarker({
        context: 'requirements specification detail',
        name: 'metadata card',
        value: 'agreement selector',
        priority: 350,
      })}
    >
      <dt className="text-[11px] font-semibold uppercase tracking-normal text-secondary-500 wrap-break-word dark:text-secondary-400">
        {t('heading')}
      </dt>
      <dd className="mt-1 text-sm text-secondary-800 dark:text-secondary-100">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2">
          <div className="min-w-0" role="status">
            {busy && !view ? (
              t('working')
            ) : selected ? (
              <span className="font-medium wrap-break-word">
                {selected.agreementReference}
              </span>
            ) : (
              t('none')
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {(selected || view?.canDecide) && (
              <button
                aria-haspopup="dialog"
                aria-label={selected ? t('details') : t('register')}
                className={iconButton}
                disabled={busy}
                onClick={() => (selected ? setDialog('details') : openCreate())}
                ref={triggerRef}
                type="button"
              >
                <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
              </button>
            )}
            {!!view?.agreements.length && (
              <button
                aria-controls={`agreement-selector-${specificationId}`}
                aria-expanded={selectorOpen}
                aria-haspopup="dialog"
                aria-label={t('select')}
                className={iconButton}
                disabled={busy}
                onClick={() => setSelectorOpen(open => !open)}
                ref={selectorTrigger}
                type="button"
              >
                <ChevronDown aria-hidden="true" className="h-4 w-4" />
              </button>
            )}
            {!first && view?.canAuthor && (
              <button
                aria-label={t('newAgreement')}
                className={iconButton}
                disabled={busy || pending}
                onClick={openCreate}
                title={pending ? t('pendingBlocker') : t('newAgreement')}
                type="button"
              >
                <Plus aria-hidden="true" className="h-4 w-4" />
              </button>
            )}
          </div>
          {selected && (
            <div
              className="col-span-2 mt-0.5 flex items-start gap-1 text-xs text-secondary-600 dark:text-secondary-300"
              role="status"
              {...devMarker({
                context: 'requirements specification detail',
                name: 'status',
                value: 'agreement effective date and state',
                priority: 350,
              })}
            >
              <StateIcon state={selected.state} />
              <span className="min-w-0 flex-1 wrap-break-word">
                {selected.effectiveDate} · {t(`states.${selected.state}`)}
              </span>
            </div>
          )}
        </div>
        {selectorOpen &&
          view &&
          createPortal(
            <div
              aria-label={t('select')}
              className="fixed z-50 overflow-y-auto rounded-lg border border-secondary-200 bg-white p-2 text-secondary-900 shadow-lg dark:border-secondary-700 dark:bg-secondary-900 dark:text-secondary-100"
              id={`agreement-selector-${specificationId}`}
              ref={selectorPanel}
              role="dialog"
              style={{
                ...selectorPosition,
                maxHeight: `calc(100dvh - ${selectorPosition.top + 8}px)`,
              }}
              {...devMarker({
                context: 'requirements specification detail',
                name: 'popover',
                value: 'agreement context selector',
                priority: 350,
              })}
            >
              <ul>
                {view.agreements
                  .filter(agreement =>
                    ['current', 'draft', 'upcoming'].includes(agreement.state),
                  )
                  .map(entry)}
              </ul>
              {previousAgreements.length > 0 && (
                <details
                  open={
                    !!selected &&
                    !['draft', 'upcoming', 'current'].includes(selected.state)
                  }
                  {...devMarker({
                    context: 'requirements specification detail',
                    name: 'disclosure',
                    value: 'previous agreements',
                    priority: 350,
                  })}
                >
                  <summary className="min-h-6 cursor-pointer px-2 py-1 text-xs">
                    {t('previousAgreements')}
                  </summary>
                  <ul>{previousAgreements.map(entry)}</ul>
                </details>
              )}
            </div>,
            document.body,
          )}
        {error && !dialog && (
          <p
            className="mt-2 text-xs text-red-700 dark:text-red-300"
            role="alert"
          >
            {error}
          </p>
        )}
      </dd>
      <FormModal
        closeDisabled={busy}
        developerModeValue="agreement registration and details"
        initialFocusRef={
          dialog === 'create' || dialog === 'correct' ? referenceRef : undefined
        }
        onClose={() => setDialog(null)}
        open={dialog !== null}
        returnFocusRef={triggerRef}
        title={
          dialog === 'create'
            ? first
              ? t('register')
              : t('newAgreement')
            : dialog === 'cancel'
              ? t('cancelAgreement')
              : dialog === 'end'
                ? t('endAgreement')
                : dialog === 'correct'
                  ? t('correct')
                  : t('details')
        }
        titleId={`agreement-dialog-${specificationId}`}
      >
        <div className="space-y-4">
          {error && (
            <p className="text-sm text-red-700 dark:text-red-300" role="alert">
              {error}
            </p>
          )}

          {(dialog === 'cancel' || dialog === 'end') && selected ? (
            <form
              className="space-y-4"
              onSubmit={event => {
                event.preventDefault()
                void mutate(
                  dialog === 'end'
                    ? {
                        operation: 'end',
                        agreementId: selected.id,
                        reason: reason.trim(),
                        endDate: date,
                      }
                    : {
                        operation: 'cancel',
                        agreementId: selected.id,
                        reason: reason.trim(),
                      },
                )
              }}
            >
              <p>{t(dialog === 'end' ? 'endWarning' : 'cancelWarning')}</p>
              {dialog === 'end' && affectedEndDeviations.length > 0 && (
                <section
                  aria-label={t('affectedDeviations')}
                  className="space-y-2"
                >
                  <h3 className="text-sm font-semibold">
                    {t('affectedDeviations')}
                  </h3>
                  <ul className="list-disc space-y-1 pl-5 text-sm">
                    {affectedEndDeviations.map(deviation => (
                      <li key={`${deviation.itemRef}:${deviation.id}`}>
                        {'uniqueId' in deviation
                          ? deviation.uniqueId
                          : view?.items.find(
                              item => item.itemRef === deviation.itemRef,
                            )?.uniqueId}{' '}
                        · {deviation.motivation}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {dialog === 'end' && (
                <div>
                  <FieldLabelWithHelp
                    help={t('endDateHelp')}
                    htmlFor="agreement-end-date"
                    label={t('endDate')}
                    required
                  />
                  <input
                    className={fieldClass}
                    id="agreement-end-date"
                    max={new Intl.DateTimeFormat('sv-SE', {
                      timeZone: 'Europe/Stockholm',
                    }).format(new Date())}
                    min={selected.effectiveDate}
                    onChange={event => setDate(event.target.value)}
                    required
                    type="date"
                    value={date}
                  />
                </div>
              )}
              <div>
                <FieldLabelWithHelp
                  help={t(
                    dialog === 'end' ? 'endReasonHelp' : 'cancelReasonHelp',
                  )}
                  htmlFor="agreement-cancel-reason"
                  label={t('reason')}
                  required
                />
                <textarea
                  className={fieldClass}
                  id="agreement-cancel-reason"
                  maxLength={10000}
                  onChange={event => setReason(event.target.value)}
                  required
                  value={reason}
                />
              </div>
              <button
                className="btn-destructive"
                disabled={busy || !reason.trim() || (dialog === 'end' && !date)}
                type="submit"
              >
                {busy
                  ? t('working')
                  : t(dialog === 'end' ? 'endAgreement' : 'cancelAgreement')}
              </button>
            </form>
          ) : dialog === 'create' || dialog === 'correct' ? (
            <form
              className="space-y-4"
              onSubmit={async event => {
                event.preventDefault()
                if (dialog === 'correct' && selected) {
                  const immediate =
                    selected.state === 'upcoming' &&
                    selected.effectiveDate !== date &&
                    date === today
                  if (
                    immediate &&
                    !(await confirm({
                      title: t('immediateTitle'),
                      message: t('immediateWarning'),
                      confirmText: t('saveCorrection'),
                      anchorEl: event.currentTarget,
                      icon: 'caution',
                    }))
                  )
                    return
                  await mutate({
                    operation: 'correct',
                    agreementId: selected.id,
                    agreementReference: reference,
                    effectiveDate: date,
                    description: description.trim(),
                    ...(immediate ? { confirmImmediateActivation: true } : {}),
                  })
                  return
                }
                void mutate({
                  operation: first ? 'establish' : 'create_draft',
                  agreementReference: reference,
                  effectiveDate: date,
                  ...(description.trim()
                    ? { description: description.trim() }
                    : {}),
                })
              }}
            >
              <div>
                <FieldLabelWithHelp
                  help={t('referenceHelp')}
                  htmlFor="agreement-reference"
                  label={t('reference')}
                  required
                />
                <input
                  className={fieldClass}
                  id="agreement-reference"
                  maxLength={450}
                  onChange={event => setReference(event.target.value)}
                  ref={referenceRef}
                  required
                  value={reference}
                />
              </div>
              <div>
                <FieldLabelWithHelp
                  help={t('effectiveDateHelp')}
                  htmlFor="agreement-date"
                  label={t('effectiveDate')}
                  required
                />
                <input
                  className={fieldClass}
                  disabled={
                    dialog === 'correct' &&
                    !['draft', 'upcoming'].includes(selected?.state ?? '')
                  }
                  id="agreement-date"
                  min={dialog === 'correct' || !first ? today : undefined}
                  onChange={event => setDate(event.target.value)}
                  required
                  type="date"
                  value={date}
                />
              </div>
              <div>
                <FieldLabelWithHelp
                  help={t('descriptionHelp')}
                  htmlFor="agreement-description"
                  label={t('description')}
                />
                <textarea
                  className={fieldClass}
                  id="agreement-description"
                  maxLength={10000}
                  onChange={event => setDescription(event.target.value)}
                  value={description}
                />
              </div>
              {first && dialog === 'create' && (
                <p>{t('confirmationWarning')}</p>
              )}
              <button
                className="btn-primary"
                disabled={busy || !reference.trim() || !date}
                type="submit"
              >
                {busy
                  ? t('working')
                  : dialog === 'correct'
                    ? t('saveCorrection')
                    : first
                      ? t('confirm')
                      : t('createDraft')}
              </button>
            </form>
          ) : (
            selected && (
              <>
                <dl className="grid gap-3">
                  <div>
                    <dt className="text-xs">{t('reference')}</dt>
                    <dd>{selected.agreementReference}</dd>
                  </div>
                  <div>
                    <dt className="text-xs">{t('effectiveDate')}</dt>
                    <dd>{selected.effectiveDate}</dd>
                  </div>
                </dl>
                <p className="flex items-center gap-2" role="status">
                  <StateIcon state={selected.state} />
                  {t(`states.${selected.state}`)}
                </p>
                {selected.description && (
                  <p className="whitespace-pre-wrap wrap-break-word">
                    {selected.description}
                  </p>
                )}
                <details
                  {...devMarker({
                    context: 'requirements specification detail',
                    name: 'expandable section',
                    value: 'agreement registration information',
                    priority: 350,
                  })}
                >
                  <summary className="min-h-6 min-w-6 cursor-pointer rounded py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
                    {t('registrationInformation')}
                  </summary>
                  <dl className="mt-2 grid gap-3 text-sm">
                    <div>
                      <dt>{t('registered')}</dt>
                      <dd>
                        {timestamp(selected.createdAt)} ·{' '}
                        {actorName(selected.createdBy)}
                      </dd>
                    </div>
                    {selected.confirmedAt && (
                      <div>
                        <dt>{t('confirmed')}</dt>
                        <dd>
                          {timestamp(selected.confirmedAt)} ·{' '}
                          {actorName(selected.confirmedBy)}
                        </dd>
                      </div>
                    )}
                    {selected.cancelledAt && (
                      <div>
                        <dt>{t('cancelled')}</dt>
                        <dd>
                          {timestamp(selected.cancelledAt)} ·{' '}
                          {actorName(selected.cancelledBy)}
                          <p className="whitespace-pre-wrap wrap-break-word">
                            {selected.cancellationReason}
                          </p>
                        </dd>
                      </div>
                    )}
                    {selected.endedAt && (
                      <>
                        <div>
                          <dt>{t('endDate')}</dt>
                          <dd>{selected.endDate}</dd>
                        </div>
                        <div>
                          <dt>{t('endRecorded')}</dt>
                          <dd>
                            {timestamp(selected.endedAt)} ·{' '}
                            {actorName(selected.endedBy)}
                            <p className="whitespace-pre-wrap wrap-break-word">
                              {selected.endReason}
                            </p>
                          </dd>
                        </div>
                      </>
                    )}
                  </dl>
                  {!!view?.corrections?.length && (
                    <section
                      aria-label={t('correctionHistory')}
                      className="mt-4 space-y-3"
                    >
                      <h3 className="font-medium">{t('correctionHistory')}</h3>
                      {view.corrections.map(correction => (
                        <div
                          className="space-y-1 rounded border border-secondary-200 p-3 dark:border-secondary-700"
                          key={correction.id}
                        >
                          <p>
                            {timestamp(correction.correctedAt)} ·{' '}
                            {actorName(correction.correctedBy)}
                          </p>
                          <dl className="grid gap-2">
                            <div>
                              <dt>{t('previousValues')}</dt>
                              <dd className="whitespace-pre-wrap wrap-break-word">
                                {correction.oldAgreementReference} ·{' '}
                                {correction.oldEffectiveDate}
                                <p>{correction.oldDescription || t('none')}</p>
                              </dd>
                            </div>
                            <div>
                              <dt>{t('newValues')}</dt>
                              <dd className="whitespace-pre-wrap wrap-break-word">
                                {correction.newAgreementReference} ·{' '}
                                {correction.newEffectiveDate}
                                <p>{correction.newDescription || t('none')}</p>
                              </dd>
                            </div>
                          </dl>
                        </div>
                      ))}
                    </section>
                  )}
                </details>
                {selected.state === 'draft' && (
                  <section
                    className="space-y-3"
                    {...devMarker({
                      context: 'requirements specification detail',
                      name: 'confirmation section',
                      value: 'agreement content lock and deviation endings',
                      priority: 350,
                    })}
                  >
                    <p>{t('confirmationWarning')}</p>
                    {selected.effectiveDate < today && (
                      <p role="alert">{t('expiredDraftWarning')}</p>
                    )}
                    {confirmationDeviations.length > 0 && (
                      <>
                        <p>{t('confirmationDeviations')}</p>
                        <ul className="list-disc space-y-1 pl-5">
                          {confirmationDeviations.map(deviation => (
                            <li
                              key={`${deviation.itemRef}:${deviation.deviationId}`}
                            >
                              {deviation.motivation}
                            </li>
                          ))}
                        </ul>
                        {pendingConfirmationDeviation && (
                          <>
                            <p>{t('pendingDeviationWarning')}</p>
                            <button
                              className="btn-secondary"
                              disabled={busy}
                              onClick={() => {
                                const current = view?.agreements.find(
                                  agreement => agreement.state === 'current',
                                )
                                if (current) {
                                  setDialog(null)
                                  void load(current.id)
                                }
                              }}
                              type="button"
                            >
                              {t('openCurrent')}
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </section>
                )}
                {selected.state === 'current' && view?.canDecide && pending && (
                  <p className="text-sm">
                    {t('pendingBlocker')}{' '}
                    <button
                      className="min-h-6 min-w-6 rounded text-primary-700 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-primary-300"
                      onClick={async () => {
                        const pendingAgreement = view.agreements.find(
                          agreement =>
                            ['draft', 'upcoming'].includes(agreement.state),
                        )
                        if (pendingAgreement) await load(pendingAgreement.id)
                      }}
                      type="button"
                    >
                      {t('openPending')}
                    </button>
                  </p>
                )}
                <div
                  className="flex flex-wrap justify-end gap-3 border-t border-secondary-200 pt-4 dark:border-secondary-700"
                  {...devMarker({
                    context: 'requirements specification detail',
                    name: 'dialog actions',
                    value: 'agreement details actions',
                    priority: 350,
                  })}
                >
                  {view?.canDecide && (
                    <>
                      <button
                        className="btn-secondary"
                        disabled={busy}
                        onClick={() => {
                          setReference(selected.agreementReference)
                          setDate(selected.effectiveDate)
                          setDescription(selected.description ?? '')
                          setDialog('correct')
                        }}
                        type="button"
                      >
                        {t('correct')}
                      </button>
                      {selected.state === 'upcoming' && (
                        <button
                          className="btn-destructive"
                          disabled={busy}
                          onClick={() => {
                            setReason('')
                            setDialog('cancel')
                          }}
                          type="button"
                        >
                          {t('cancelAgreement')}
                        </button>
                      )}
                      {selected.state === 'current' && (
                        <button
                          className="btn-destructive"
                          disabled={busy || pending}
                          onClick={async () => {
                            setReason('')
                            setDate('')
                            setEndPreview(null)
                            setBusy(true)
                            setError(null)
                            try {
                              const response = await apiFetch(
                                `/api/requirements-specifications/${specificationId}/agreement?agreementId=${selected.id}&endPreview=true`,
                              )
                              const result = await response.json()
                              if (!response.ok)
                                throw new Error(
                                  agreementErrorMessage(result, t),
                                )
                              setEndPreview(result)
                              setDialog('end')
                            } catch (cause) {
                              setError(
                                cause instanceof Error
                                  ? cause.message
                                  : t('loadFailed'),
                              )
                            } finally {
                              setBusy(false)
                            }
                          }}
                          title={pending ? t('pendingBlocker') : undefined}
                          type="button"
                        >
                          {t('endAgreement')}
                        </button>
                      )}
                      {selected.state === 'draft' && (
                        <button
                          className="min-h-9 rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-40 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-950"
                          disabled={busy}
                          onClick={async event => {
                            if (
                              await confirm({
                                title: t('discardTitle'),
                                message: t('discardWarning'),
                                confirmText: t('discard'),
                                variant: 'danger',
                                icon: 'caution',
                                anchorEl: event.currentTarget,
                              })
                            ) {
                              await mutate({
                                operation: 'discard',
                                agreementId: selected.id,
                              })
                            }
                          }}
                          type="button"
                        >
                          {t('discard')}
                        </button>
                      )}
                      {selected.state === 'draft' && (
                        <button
                          className="btn-primary"
                          disabled={
                            busy ||
                            pendingConfirmationDeviation ||
                            selected.effectiveDate < today
                          }
                          onClick={async event => {
                            const authorizeDeviationEndings =
                              confirmationDeviations.length > 0
                            if (
                              authorizeDeviationEndings &&
                              !(await confirm({
                                title: t('confirm'),
                                message: t('plannedEndingWarning'),
                                confirmText: t('confirmAndPlanEndings'),
                                icon: 'warning',
                                anchorEl: event.currentTarget,
                              }))
                            )
                              return
                            await mutate({
                              operation: 'confirm',
                              agreementId: selected.id,
                              ...(authorizeDeviationEndings
                                ? { authorizeDeviationEndings: true }
                                : {}),
                            })
                          }}
                          type="button"
                        >
                          {busy ? t('working') : t('confirm')}
                        </button>
                      )}
                    </>
                  )}
                  <button
                    className="btn-secondary"
                    disabled={busy}
                    onClick={() => setDialog(null)}
                    type="button"
                  >
                    {tc('close')}
                  </button>
                </div>
              </>
            )
          )}
        </div>
      </FormModal>
    </div>
  )
}

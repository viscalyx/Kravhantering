'use client'

import { CircleAlert, Info, RefreshCw } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useConfirmModal } from '@/components/ConfirmModal'
import type { AiAdminConnectionDetail } from '@/lib/ai/admin-service'
import {
  type AiConnectionFinancialStatus,
  retainAiFinancialSnapshots,
} from '@/lib/ai/financial-contracts'
import { devMarker } from '@/lib/developer-mode-markers'
import { apiFetch } from '@/lib/http/api-fetch'
import { Field, inputClassName } from './form-controls'

export default function FinancialStatusPanel({
  connection,
  expanded,
}: {
  connection: AiAdminConnectionDetail
  expanded: boolean
}) {
  const t = useTranslations('admin.aiConnections.financial')
  const locale = useLocale()
  const { confirm } = useConfirmModal()
  const [status, setStatus] = useState<AiConnectionFinancialStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const requestRef = useRef<AbortController | null>(null)
  const path = `/api/admin/ai-connections/${connection.id}/actions`
  const refresh = useCallback(
    async (signal: AbortSignal) => {
      const response = await apiFetch(path, {
        method: 'POST',
        signal,
        body: JSON.stringify({ action: 'fetch_financial_status' }),
        headers: { 'Content-Type': 'application/json' },
      })
      if (!response.ok) throw new Error('financial_status_unavailable')
      const current: AiConnectionFinancialStatus = await response.json()
      if (!signal.aborted)
        setStatus(previous => retainAiFinancialSnapshots(previous, current))
    },
    [path],
  )

  const load = useCallback(async () => {
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    setBusy(true)
    setFailed(false)
    try {
      await refresh(controller.signal)
    } catch {
      if (!controller.signal.aborted) {
        setStatus(null)
        setFailed(true)
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false)
    }
  }, [refresh])

  useEffect(() => {
    if (expanded) void load()
    return () => requestRef.current?.abort()
  }, [expanded, load])

  async function mutate(
    action: string,
    values: Record<string, string>,
  ): Promise<void> {
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    setBusy(true)
    setFailed(false)
    let committed = false
    try {
      const response = await apiFetch(path, {
        method: 'POST',
        signal: controller.signal,
        body: JSON.stringify({ action, ...values }),
        headers: { 'Content-Type': 'application/json' },
      })
      if (!response.ok) throw new Error('management_action_failed')
      if (controller.signal.aborted) return
      committed = true
      if (action !== 'write_management_credential') setStatus(null)
      await refresh(controller.signal)
    } catch {
      if (!controller.signal.aborted) {
        if (committed) setStatus(null)
        setFailed(true)
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false)
    }
  }

  async function remove(
    secretVersionId: string,
    anchorEl: HTMLElement,
  ): Promise<void> {
    if (
      await confirm({
        anchorEl,
        title: t('remove'),
        message: t('removeHelp'),
        confirmText: t('remove'),
        variant: 'danger',
        icon: 'caution',
      })
    )
      await mutate('remove_management_credential', { secretVersionId })
  }

  const managementSupported = status?.capabilities.operations.some(
    item => item.credentialPurpose === 'management',
  )
  return (
    <section
      aria-labelledby={`ai-financial-${connection.id}`}
      className="space-y-4 rounded-2xl border border-secondary-200 p-4 text-secondary-950 dark:border-secondary-700 dark:text-secondary-50"
      {...devMarker({
        name: 'AI provider financial status',
        context: 'AI connection details',
      })}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h5 className="font-semibold" id={`ai-financial-${connection.id}`}>
          {t('title')}
        </h5>
        <button
          className="btn-secondary inline-flex min-h-9 items-center gap-2 px-3! py-2! text-sm"
          disabled={busy}
          onClick={() => void load()}
          type="button"
          {...devMarker({
            name: 'Refresh AI provider finances',
            context: 'AI connection details',
          })}
        >
          <RefreshCw
            aria-hidden="true"
            className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`}
          />
          {busy ? t('loading') : t('refresh')}
        </button>
      </div>
      <p className="flex items-start gap-2 text-sm text-secondary-600 dark:text-secondary-300">
        <Info aria-hidden="true" className="h-4 w-4 shrink-0" />
        {t('providerReported')}
      </p>
      {failed ? (
        <p className="flex gap-2 text-sm" role="alert">
          <CircleAlert aria-hidden="true" className="h-4 w-4" />
          {t('requestFailed')}
        </p>
      ) : null}
      <div aria-busy={busy} className="space-y-3" role="status">
        {status ? (
          <p className="flex gap-2 text-sm">
            <Info aria-hidden="true" className="h-4 w-4 shrink-0" />
            {t(`support.${status.capabilities.support}`)}
          </p>
        ) : null}
        {status?.results.map(result => (
          <section
            className="rounded-xl bg-secondary-50 p-3 dark:bg-secondary-950/50"
            key={result.operation.id}
            {...devMarker({
              name: 'AI financial scope values',
              context: 'AI provider financial status',
            })}
          >
            <h6 className="font-semibold">
              {t(`scope.${result.operation.scope}`)}
            </h6>
            <p className="mt-1 flex gap-2 text-sm">
              <Info aria-hidden="true" className="h-4 w-4 shrink-0" />
              {t(`state.${result.state}`)}
            </p>
            {result.refreshError ? (
              <p className="text-sm">{t(`state.${result.refreshError}`)}</p>
            ) : null}
            {result.lastSuccessfulAt ? (
              <p className="mt-1 text-xs">
                {t('lastSuccess', {
                  time: new Date(result.lastSuccessfulAt).toLocaleString(
                    locale,
                  ),
                })}
              </p>
            ) : null}
            {result.snapshot ? (
              <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                {result.snapshot.measurements.map(item => (
                  <div key={`${item.field}-${item.period}`}>
                    <dt className="text-secondary-600 dark:text-secondary-300">
                      {t(`field.${item.field}`)} · {t(`period.${item.period}`)}
                    </dt>
                    <dd className="font-medium">
                      {item.state === 'available' && item.amount !== null
                        ? `${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(item.amount))} ${item.currency}`
                        : t(`measurement.${item.state}`)}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </section>
        ))}
      </div>
      {managementSupported ||
      status?.managementCredential.active ||
      status?.managementCredential.candidates.length ? (
        <div
          className="space-y-3 border-t border-secondary-200 pt-4 dark:border-secondary-700"
          {...devMarker({
            name: 'AI management credential controls',
            context: 'AI connection details',
          })}
        >
          <h6 className="font-semibold">{t('credentialTitle')}</h6>
          <p className="text-sm text-secondary-600 dark:text-secondary-300">
            {t('credentialHelp')}
          </p>
          {status?.managementCredential.active ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm">
                {t('verified', {
                  time: new Date(
                    status.managementCredential.active.verifiedAt,
                  ).toLocaleString(locale),
                })}
              </p>
              <button
                className="btn-destructive min-h-9 px-3! py-2! text-sm"
                disabled={busy}
                onClick={event =>
                  status.managementCredential.active &&
                  void remove(
                    status.managementCredential.active.id,
                    event.currentTarget,
                  )
                }
                type="button"
              >
                {t('remove')}
              </button>
            </div>
          ) : null}
          {managementSupported ? (
            <form
              className="space-y-3"
              onSubmit={event => {
                event.preventDefault()
                const form = event.currentTarget
                const secret = String(
                  new FormData(form).get('managementCredential') ?? '',
                )
                form.reset()
                void mutate('write_management_credential', { secret })
              }}
            >
              <Field
                help={t('credentialHelp')}
                id={`ai-management-${connection.id}`}
                label={t('credentialLabel')}
                required
              >
                <input
                  autoComplete="new-password"
                  className={inputClassName()}
                  disabled={busy}
                  id={`ai-management-${connection.id}`}
                  maxLength={16384}
                  name="managementCredential"
                  required
                  type="password"
                />
              </Field>
              <button
                className="btn-secondary min-h-9 px-3! py-2! text-sm"
                disabled={busy}
                type="submit"
              >
                {t('register')}
              </button>
            </form>
          ) : null}
          {status?.managementCredential.candidates.map(candidate => (
            <div
              className="flex flex-wrap items-center gap-3"
              key={candidate.id}
            >
              <span className="text-sm">
                {t('candidate', {
                  time: new Date(candidate.createdAt).toLocaleString(locale),
                })}
              </span>
              {managementSupported ? (
                <button
                  className="btn-primary min-h-9 px-3! py-2! text-sm"
                  disabled={busy}
                  onClick={() =>
                    void mutate('verify_management_credential', {
                      secretVersionId: candidate.id,
                    })
                  }
                  type="button"
                >
                  {t('verify')}
                </button>
              ) : null}
              <button
                className="btn-destructive min-h-9 px-3! py-2! text-sm"
                disabled={busy}
                onClick={event =>
                  void remove(candidate.id, event.currentTarget)
                }
                type="button"
              >
                {t('discard')}
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}

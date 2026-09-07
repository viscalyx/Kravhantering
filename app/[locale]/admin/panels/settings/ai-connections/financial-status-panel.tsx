'use client'

import {
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Info,
  RefreshCw,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'
import { useConfirmModal } from '@/components/ConfirmModal'
import type { AiAdminConnectionDetail } from '@/lib/ai/admin-service'
import { devMarker } from '@/lib/developer-mode-markers'
import { useFinancialStatus } from './financial-status-context'
import { FinancialAmount } from './financial-status-summary'
import { Field, inputClassName } from './form-controls'

export default function FinancialStatusPanel({
  connection,
}: {
  connection: AiAdminConnectionDetail
}) {
  const t = useTranslations('admin.aiConnections.financial')
  const locale = useLocale()
  const { confirm } = useConfirmModal()
  const { status, busy, failed, load, mutate } = useFinancialStatus()
  const [open, setOpen] = useState(false)

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
        name: 'AI organization and connection finances',
        context: 'AI connection details',
      })}
    >
      <h5 className="font-semibold" id={`ai-financial-${connection.id}`}>
        <button
          aria-controls={`ai-financial-content-${connection.id}`}
          aria-expanded={open}
          className="flex min-h-9 w-full items-center gap-2 rounded-lg text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
          onClick={() => setOpen(value => !value)}
          type="button"
          {...devMarker({
            name: 'Toggle AI provider financial details',
            context: 'AI connection details',
          })}
        >
          {open ? (
            <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0" />
          ) : (
            <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0" />
          )}
          {t('title')}
        </button>
      </h5>
      <div hidden={!open} id={`ai-financial-content-${connection.id}`}>
        {open ? (
          <div className="space-y-4">
            <div className="flex justify-end">
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
                    context: 'AI organization and connection finances',
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
                    <p className="text-sm">
                      {t(`state.${result.refreshError}`)}
                    </p>
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
                            {t(`field.${item.field}`)} ·{' '}
                            {t(`period.${item.period}`)}
                          </dt>
                          <dd className="font-medium">
                            <FinancialAmount measurement={item} />
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
                        time: new Date(candidate.createdAt).toLocaleString(
                          locale,
                        ),
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
          </div>
        ) : null}
      </div>
    </section>
  )
}

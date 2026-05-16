import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { routing } from '@/i18n/routing'
import {
  type ActionAuditDecision,
  listActionAuditEvents,
} from '@/lib/audit/action-audit'
import { isValidClientIp } from '@/lib/auth/client-ip'
import { getSession, isSignedIn } from '@/lib/auth/session'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { formatActorDisplayNameForLocale } from '@/lib/privacy/display-name'

type PageParams = Promise<{ locale: string }>
type SearchParams = Promise<Record<string, string | string[] | undefined>>

function resolveLocale(requestedLocale: string): 'sv' | 'en' {
  return routing.locales.includes(requestedLocale as 'sv' | 'en')
    ? (requestedLocale as 'sv' | 'en')
    : routing.defaultLocale
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function positiveInteger(value: string | undefined): number | undefined {
  if (!value || !/^[1-9]\d*$/.test(value)) return undefined
  return Number(value)
}

function date(value: string | undefined): Date | undefined {
  if (!value) return undefined
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

function decision(value: string | undefined): ActionAuditDecision | undefined {
  return value === 'allowed' || value === 'denied' ? value : undefined
}

function clientIp(value: string | undefined): string | undefined {
  return value && isValidClientIp(value) ? value : undefined
}

function csvHref(searchParams: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams)) {
    const firstValue = first(value)
    if (firstValue) params.set(key, firstValue)
  }
  params.set('format', 'csv')
  return `/api/admin/audit-events?${params.toString()}`
}

export async function generateMetadata({
  params,
}: {
  params: PageParams
}): Promise<Metadata> {
  const { locale: requestedLocale } = await params
  const locale = resolveLocale(requestedLocale)
  const t = await getTranslations({ locale, namespace: 'admin.auditLog' })
  return { title: t('title') }
}

export default async function AuditLogPage({
  params,
  searchParams,
}: {
  params: PageParams
  searchParams: SearchParams
}) {
  const { locale: requestedLocale } = await params
  const locale = resolveLocale(requestedLocale)
  const t = await getTranslations({ locale, namespace: 'admin.auditLog' })
  const session = await getSession()
  if (!isSignedIn(session) || !session.roles.includes('Admin')) {
    notFound()
  }

  const query = await searchParams
  const db = await getRequestSqlServerDataSource()
  const page = positiveInteger(first(query.page))
  const pageSize = positiveInteger(first(query.pageSize)) ?? 50
  const result = await listActionAuditEvents(db, {
    action: first(query.action),
    actorHsaId: first(query.actor_hsa_id),
    clientIp: clientIp(first(query.client_ip)),
    decision: decision(first(query.decision)),
    from: date(first(query.from)),
    page,
    pageSize,
    targetId: first(query.target_id),
    targetKind: first(query.target_kind),
    to: date(first(query.to)),
  })

  const totalPages = Math.max(
    1,
    Math.ceil(result.pagination.total / result.pagination.pageSize),
  )
  const currentPage = result.pagination.page
  const nextParams = new URLSearchParams()
  const previousParams = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    const firstValue = first(value)
    if (!firstValue || key === 'format') continue
    nextParams.set(key, firstValue)
    previousParams.set(key, firstValue)
  }
  nextParams.set('page', String(currentPage + 1))
  previousParams.set('page', String(Math.max(1, currentPage - 1)))

  return (
    <main className="section-padding px-4 sm:px-6 lg:px-8">
      <div className="container-custom space-y-6">
        <section className="rounded-[2rem] border border-secondary-200/70 bg-white/90 p-6 shadow-sm dark:border-secondary-700/60 dark:bg-secondary-900/80">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary-700 dark:text-primary-300">
                {t('eyebrow')}
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-secondary-950 dark:text-secondary-50">
                {t('title')}
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-secondary-600 dark:text-secondary-300">
                {t('description')}
              </p>
            </div>
            <a className="btn-secondary" href={csvHref(query)}>
              {t('exportCsv')}
            </a>
          </div>
        </section>

        <section className="rounded-[2rem] border border-secondary-200/70 bg-white/90 p-6 shadow-sm dark:border-secondary-700/60 dark:bg-secondary-900/80">
          <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="space-y-1 text-sm font-medium text-secondary-700 dark:text-secondary-200">
              <span>{t('actorHsaId')}</span>
              <input
                className="w-full rounded-xl border border-secondary-300 bg-white px-3 py-2 text-sm dark:border-secondary-700 dark:bg-secondary-950"
                defaultValue={first(query.actor_hsa_id) ?? ''}
                name="actor_hsa_id"
              />
            </label>
            <label className="space-y-1 text-sm font-medium text-secondary-700 dark:text-secondary-200">
              <span>{t('action')}</span>
              <input
                className="w-full rounded-xl border border-secondary-300 bg-white px-3 py-2 text-sm dark:border-secondary-700 dark:bg-secondary-950"
                defaultValue={first(query.action) ?? ''}
                name="action"
              />
            </label>
            <label className="space-y-1 text-sm font-medium text-secondary-700 dark:text-secondary-200">
              <span>{t('targetKind')}</span>
              <input
                className="w-full rounded-xl border border-secondary-300 bg-white px-3 py-2 text-sm dark:border-secondary-700 dark:bg-secondary-950"
                defaultValue={first(query.target_kind) ?? ''}
                name="target_kind"
              />
            </label>
            <label className="space-y-1 text-sm font-medium text-secondary-700 dark:text-secondary-200">
              <span>{t('targetId')}</span>
              <input
                className="w-full rounded-xl border border-secondary-300 bg-white px-3 py-2 text-sm dark:border-secondary-700 dark:bg-secondary-950"
                defaultValue={first(query.target_id) ?? ''}
                name="target_id"
              />
            </label>
            <label className="space-y-1 text-sm font-medium text-secondary-700 dark:text-secondary-200">
              <span>{t('clientIp')}</span>
              <input
                className="w-full rounded-xl border border-secondary-300 bg-white px-3 py-2 text-sm dark:border-secondary-700 dark:bg-secondary-950"
                defaultValue={first(query.client_ip) ?? ''}
                name="client_ip"
              />
            </label>
            <label className="space-y-1 text-sm font-medium text-secondary-700 dark:text-secondary-200">
              <span>{t('decision')}</span>
              <select
                className="w-full rounded-xl border border-secondary-300 bg-white px-3 py-2 text-sm dark:border-secondary-700 dark:bg-secondary-950"
                defaultValue={first(query.decision) ?? ''}
                name="decision"
              >
                <option value="">{t('allDecisions')}</option>
                <option value="allowed">{t('allowed')}</option>
                <option value="denied">{t('denied')}</option>
              </select>
            </label>
            <label className="space-y-1 text-sm font-medium text-secondary-700 dark:text-secondary-200">
              <span>{t('from')}</span>
              <input
                className="w-full rounded-xl border border-secondary-300 bg-white px-3 py-2 text-sm dark:border-secondary-700 dark:bg-secondary-950"
                defaultValue={first(query.from) ?? ''}
                name="from"
                type="datetime-local"
              />
            </label>
            <label className="space-y-1 text-sm font-medium text-secondary-700 dark:text-secondary-200">
              <span>{t('to')}</span>
              <input
                className="w-full rounded-xl border border-secondary-300 bg-white px-3 py-2 text-sm dark:border-secondary-700 dark:bg-secondary-950"
                defaultValue={first(query.to) ?? ''}
                name="to"
                type="datetime-local"
              />
            </label>
            <input name="pageSize" type="hidden" value={String(pageSize)} />
            <div className="flex items-end gap-2">
              <button className="btn-primary" type="submit">
                {t('filter')}
              </button>
              <a className="btn-secondary" href={`/${locale}/admin/audit-log`}>
                {t('clear')}
              </a>
            </div>
          </form>
        </section>

        <section className="overflow-hidden rounded-[2rem] border border-secondary-200/70 bg-white/90 shadow-sm dark:border-secondary-700/60 dark:bg-secondary-900/80">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-secondary-200 text-sm dark:divide-secondary-700">
              <thead className="bg-secondary-50 text-left text-xs font-semibold uppercase tracking-wide text-secondary-600 dark:bg-secondary-900 dark:text-secondary-300">
                <tr>
                  <th className="px-4 py-3">{t('occurredAt')}</th>
                  <th className="px-4 py-3">{t('actor')}</th>
                  <th className="px-4 py-3">{t('action')}</th>
                  <th className="px-4 py-3">{t('target')}</th>
                  <th className="px-4 py-3">{t('decision')}</th>
                  <th className="px-4 py-3">{t('requestId')}</th>
                  <th className="px-4 py-3">{t('clientIp')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-secondary-100 dark:divide-secondary-800">
                {result.events.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center" colSpan={7}>
                      {t('empty')}
                    </td>
                  </tr>
                ) : (
                  result.events.map(event => (
                    <tr key={event.id}>
                      <td className="whitespace-nowrap px-4 py-3">
                        {event.occurredAt}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-secondary-900 dark:text-secondary-50">
                          {formatActorDisplayNameForLocale(
                            event.actorDisplayName,
                            locale,
                          ) || event.actorKind}
                        </div>
                        <div className="text-xs text-secondary-500">
                          {event.actorHsaId ?? event.actorClientId ?? ''}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {event.action}
                      </td>
                      <td className="px-4 py-3">
                        <div>{event.targetKind}</div>
                        <div className="text-xs text-secondary-500">
                          {event.targetUniqueId ?? event.targetId ?? ''}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {event.decision === 'allowed'
                          ? t('allowed')
                          : t('denied')}
                        {event.denialReason ? (
                          <div className="text-xs text-secondary-500">
                            {event.denialReason}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {event.requestId ?? ''}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {event.clientIp ?? ''}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-secondary-200 px-4 py-3 text-sm dark:border-secondary-700">
            <span>
              {t('pagination', {
                page: currentPage,
                totalPages,
                total: result.pagination.total,
              })}
            </span>
            <div className="flex gap-2">
              <a
                aria-disabled={currentPage <= 1}
                className={`btn-secondary ${currentPage <= 1 ? 'pointer-events-none opacity-50' : ''}`}
                href={`?${previousParams.toString()}`}
              >
                {t('previous')}
              </a>
              <a
                aria-disabled={currentPage >= totalPages}
                className={`btn-secondary ${currentPage >= totalPages ? 'pointer-events-none opacity-50' : ''}`}
                href={`?${nextParams.toString()}`}
              >
                {t('next')}
              </a>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}

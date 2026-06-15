import type { ActionAuditEventListResult } from '@/lib/audit/action-audit'
import {
  type ActionAuditLogSearchParams,
  actionAuditLogCsvHref,
  actionAuditLogHref,
  actionAuditLogPageSize,
  firstSearchParamValue,
} from '@/lib/audit/action-audit-query'
import { formatActorDisplayNameForLocale } from '@/lib/privacy/display-name'

export type ActionAuditLogLabels = {
  action: string
  actor: string
  actorHsaId: string
  allDecisions: string
  allowed: string
  clear: string
  clientIp: string
  decision: string
  denied: string
  description: string
  empty: string
  exportCsv: string
  eyebrow: string
  filter: string
  from: string
  next: string
  occurredAt: string
  pagination: (values: {
    page: number
    total: number
    totalPages: number
  }) => string
  previous: string
  requestId: string
  target: string
  targetId: string
  targetKind: string
  title: string
  to: string
}

export type ActionAuditLogInitialState = {
  query: ActionAuditLogSearchParams
  result: ActionAuditEventListResult
}

type ActionAuditLogViewProps = {
  basePath: string
  labels: ActionAuditLogLabels
  loadingLabel?: string
  locale: string
  preservedParams?: Record<string, string>
  query: ActionAuditLogSearchParams
  result?: ActionAuditEventListResult
  showEyebrow?: boolean
  titleElement?: 'h1' | 'h2'
}

function hiddenParams(params: Record<string, string>) {
  return Object.entries(params).map(([key, value]) => (
    <input key={key} name={key} type="hidden" value={value} />
  ))
}

export default function ActionAuditLogView({
  basePath,
  labels,
  loadingLabel,
  locale,
  preservedParams = {},
  query,
  result,
  showEyebrow = true,
  titleElement = 'h1',
}: ActionAuditLogViewProps) {
  const Heading = titleElement
  const pageSize = actionAuditLogPageSize(query)
  const headingClass =
    titleElement === 'h1'
      ? `${showEyebrow ? 'mt-3 ' : ''}text-3xl font-semibold tracking-tight text-secondary-950 dark:text-secondary-50`
      : 'text-xl font-semibold text-secondary-950 dark:text-secondary-50'

  if (!result) {
    return (
      <>
        <section className="rounded-4xl border border-secondary-200/70 bg-white/90 p-6 shadow-sm dark:border-secondary-700/60 dark:bg-secondary-900/80">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              {showEyebrow ? (
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary-700 dark:text-primary-300">
                  {labels.eyebrow}
                </p>
              ) : null}
              <Heading className={headingClass}>{labels.title}</Heading>
              <p className="mt-2 max-w-3xl text-sm text-secondary-600 dark:text-secondary-300">
                {labels.description}
              </p>
            </div>
            <a
              className="btn-secondary"
              href={actionAuditLogCsvHref(query, locale)}
            >
              {labels.exportCsv}
            </a>
          </div>
        </section>

        <section
          className="rounded-4xl border border-secondary-200/70 bg-white/90 p-6 text-sm text-secondary-600 shadow-sm dark:border-secondary-700/60 dark:bg-secondary-900/80 dark:text-secondary-300"
          role="status"
        >
          {loadingLabel}
        </section>
      </>
    )
  }

  const totalPages = Math.max(
    1,
    Math.ceil(result.pagination.total / result.pagination.pageSize),
  )
  const currentPage = result.pagination.page
  const isPreviousDisabled = currentPage <= 1
  const isNextDisabled = currentPage >= totalPages
  const previousHref = actionAuditLogHref({
    basePath,
    overrides: { page: Math.max(1, currentPage - 1) },
    preservedParams,
    query,
  })
  const nextHref = actionAuditLogHref({
    basePath,
    overrides: { page: currentPage + 1 },
    preservedParams,
    query,
  })
  const clearHref = actionAuditLogHref({
    basePath,
    preservedParams,
    query: {},
  })

  return (
    <>
      <section className="rounded-4xl border border-secondary-200/70 bg-white/90 p-6 shadow-sm dark:border-secondary-700/60 dark:bg-secondary-900/80">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            {showEyebrow ? (
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary-700 dark:text-primary-300">
                {labels.eyebrow}
              </p>
            ) : null}
            <Heading className={headingClass}>{labels.title}</Heading>
            <p className="mt-2 max-w-3xl text-sm text-secondary-600 dark:text-secondary-300">
              {labels.description}
            </p>
          </div>
          <a
            className="btn-secondary"
            href={actionAuditLogCsvHref(query, locale)}
          >
            {labels.exportCsv}
          </a>
        </div>
      </section>

      <section className="rounded-4xl border border-secondary-200/70 bg-white/90 p-6 shadow-sm dark:border-secondary-700/60 dark:bg-secondary-900/80">
        <form
          action={basePath}
          className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
          method="get"
        >
          {hiddenParams(preservedParams)}
          <label className="space-y-1 text-sm font-medium text-secondary-700 dark:text-secondary-200">
            <span>{labels.actorHsaId}</span>
            <input
              className="w-full rounded-xl border border-secondary-300 bg-white px-3 py-2 text-sm dark:border-secondary-700 dark:bg-secondary-950"
              defaultValue={firstSearchParamValue(query.actor_hsa_id) ?? ''}
              name="actor_hsa_id"
            />
          </label>
          <label className="space-y-1 text-sm font-medium text-secondary-700 dark:text-secondary-200">
            <span>{labels.action}</span>
            <input
              className="w-full rounded-xl border border-secondary-300 bg-white px-3 py-2 text-sm dark:border-secondary-700 dark:bg-secondary-950"
              defaultValue={firstSearchParamValue(query.action) ?? ''}
              name="action"
            />
          </label>
          <label className="space-y-1 text-sm font-medium text-secondary-700 dark:text-secondary-200">
            <span>{labels.targetKind}</span>
            <input
              className="w-full rounded-xl border border-secondary-300 bg-white px-3 py-2 text-sm dark:border-secondary-700 dark:bg-secondary-950"
              defaultValue={firstSearchParamValue(query.target_kind) ?? ''}
              name="target_kind"
            />
          </label>
          <label className="space-y-1 text-sm font-medium text-secondary-700 dark:text-secondary-200">
            <span>{labels.targetId}</span>
            <input
              className="w-full rounded-xl border border-secondary-300 bg-white px-3 py-2 text-sm dark:border-secondary-700 dark:bg-secondary-950"
              defaultValue={firstSearchParamValue(query.target_id) ?? ''}
              name="target_id"
            />
          </label>
          <label className="space-y-1 text-sm font-medium text-secondary-700 dark:text-secondary-200">
            <span>{labels.clientIp}</span>
            <input
              className="w-full rounded-xl border border-secondary-300 bg-white px-3 py-2 text-sm dark:border-secondary-700 dark:bg-secondary-950"
              defaultValue={firstSearchParamValue(query.client_ip) ?? ''}
              name="client_ip"
            />
          </label>
          <label className="space-y-1 text-sm font-medium text-secondary-700 dark:text-secondary-200">
            <span>{labels.decision}</span>
            <select
              className="w-full rounded-xl border border-secondary-300 bg-white px-3 py-2 text-sm dark:border-secondary-700 dark:bg-secondary-950"
              defaultValue={firstSearchParamValue(query.decision) ?? ''}
              name="decision"
            >
              <option value="">{labels.allDecisions}</option>
              <option value="allowed">{labels.allowed}</option>
              <option value="denied">{labels.denied}</option>
            </select>
          </label>
          <label className="space-y-1 text-sm font-medium text-secondary-700 dark:text-secondary-200">
            <span>{labels.from}</span>
            <input
              className="w-full rounded-xl border border-secondary-300 bg-white px-3 py-2 text-sm dark:border-secondary-700 dark:bg-secondary-950"
              defaultValue={firstSearchParamValue(query.from) ?? ''}
              name="from"
              type="datetime-local"
            />
          </label>
          <label className="space-y-1 text-sm font-medium text-secondary-700 dark:text-secondary-200">
            <span>{labels.to}</span>
            <input
              className="w-full rounded-xl border border-secondary-300 bg-white px-3 py-2 text-sm dark:border-secondary-700 dark:bg-secondary-950"
              defaultValue={firstSearchParamValue(query.to) ?? ''}
              name="to"
              type="datetime-local"
            />
          </label>
          <input name="pageSize" type="hidden" value={String(pageSize)} />
          <div className="flex items-end gap-2">
            <button className="btn-primary" type="submit">
              {labels.filter}
            </button>
            <a className="btn-secondary" href={clearHref}>
              {labels.clear}
            </a>
          </div>
        </form>
      </section>

      <section className="overflow-hidden rounded-4xl border border-secondary-200/70 bg-white/90 shadow-sm dark:border-secondary-700/60 dark:bg-secondary-900/80">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-secondary-200 text-sm dark:divide-secondary-700">
            <thead className="bg-secondary-50 text-left text-xs font-semibold uppercase tracking-wide text-secondary-600 dark:bg-secondary-900 dark:text-secondary-300">
              <tr>
                <th className="px-4 py-3">{labels.occurredAt}</th>
                <th className="px-4 py-3">{labels.actor}</th>
                <th className="px-4 py-3">{labels.action}</th>
                <th className="px-4 py-3">{labels.target}</th>
                <th className="px-4 py-3">{labels.decision}</th>
                <th className="px-4 py-3">{labels.requestId}</th>
                <th className="px-4 py-3">{labels.clientIp}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-secondary-100 dark:divide-secondary-800">
              {result.events.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center" colSpan={7}>
                    {labels.empty}
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
                        ? labels.allowed
                        : labels.denied}
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
            {labels.pagination({
              page: currentPage,
              total: result.pagination.total,
              totalPages,
            })}
          </span>
          <div className="flex gap-2">
            {isPreviousDisabled ? (
              <span
                aria-disabled={isPreviousDisabled}
                className={`btn-secondary ${isPreviousDisabled ? 'pointer-events-none opacity-50' : ''}`}
              >
                {labels.previous}
              </span>
            ) : (
              <a
                aria-disabled={isPreviousDisabled}
                className={`btn-secondary ${isPreviousDisabled ? 'pointer-events-none opacity-50' : ''}`}
                href={previousHref}
              >
                {labels.previous}
              </a>
            )}
            {isNextDisabled ? (
              <span
                aria-disabled={isNextDisabled}
                className={`btn-secondary ${isNextDisabled ? 'pointer-events-none opacity-50' : ''}`}
              >
                {labels.next}
              </span>
            ) : (
              <a
                aria-disabled={isNextDisabled}
                className={`btn-secondary ${isNextDisabled ? 'pointer-events-none opacity-50' : ''}`}
                href={nextHref}
              >
                {labels.next}
              </a>
            )}
          </div>
        </div>
      </section>
    </>
  )
}

'use client'

// THROWAWAY #1353: before + four layout alternatives on the existing
// stewardship route, selected by ?variant=. Every interaction is memory-only.
import {
  Archive,
  CheckCircle2,
  ListChecks,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  UsersRound,
} from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { type ReactNode, useRef, useState } from 'react'
import FormModal from '@/components/FormModal'
import ListWorkspace from '@/components/ListWorkspace'
import PrototypeSwitcher, {
  type PrototypeVariant,
  prototypeVariants,
} from '@/components/PrototypeSwitcher'
import { devMarker } from '@/lib/developer-mode-markers'
import {
  formatActorDisplayNameForLocale,
  formatActorDisplayNameSummaryForLocale,
} from '@/lib/privacy/display-name'
import styles from './package-layout.prototype.module.css'

export interface PrototypePackage {
  coAuthors?: { displayName: string; hsaId: string }[]
  id: number
  isArchived: boolean
  leadDisplayName: string
  leadHsaId: string
  linkedRequirementCount: number
  name: string
  permissions?: { canManageAssignments: boolean }
  purposeAndScope: string
}

interface LayoutProps {
  actions: (row: PrototypePackage) => ReactNode
  coAuthors: (row: PrototypePackage) => ReactNode
  count: (row: PrototypePackage) => ReactNode
  countWidth: number
  identity: (row: PrototypePackage) => ReactNode
  labels: string[]
  rows: PrototypePackage[]
  status: (row: PrototypePackage) => ReactNode
}

export function VariantA(props: LayoutProps & { before?: boolean }) {
  return (
    <div
      className={`${styles.surface} ${styles.scroll}`}
      data-prototype-surface="table"
    >
      <table
        className={`${styles.table} ${props.before ? '' : styles.compact}`}
      >
        {!props.before && (
          <colgroup>
            <col style={{ width: '20%' }} />
            <col />
            <col style={{ width: 150 }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: props.countWidth }} />
            <col style={{ width: 142 }} />
          </colgroup>
        )}
        <thead>
          <tr>
            {props.labels.map(label => (
              <th key={label} scope="col">
                {props.before && label === props.labels[6] ? null : label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.rows.map(row => (
            <tr data-prototype-row={row.id} key={row.id}>
              <td className="font-medium">
                <span className={props.before ? undefined : 'wrap-anywhere'}>
                  {row.name}
                </span>
              </td>
              <td
                className={`${styles.purpose} ${props.before ? 'min-w-64' : ''}`}
              >
                {row.purposeAndScope}
              </td>
              <td>{props.identity(row)}</td>
              <td>{props.coAuthors(row)}</td>
              <td>{props.status(row)}</td>
              <td className="text-center">{props.count(row)}</td>
              <td>{props.actions(row)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function VariantB(props: LayoutProps) {
  return (
    <div className={styles.surface} data-prototype-surface="rows">
      {props.rows.map(row => (
        <article
          className={styles.band}
          data-prototype-row={row.id}
          key={row.id}
        >
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-3">
              <h2 className="min-w-0 wrap-anywhere text-base font-semibold">
                {row.name}
              </h2>
              {props.status(row)}
              {props.count(row)}
            </div>
            <p className={styles.purpose}>{row.purposeAndScope}</p>
          </div>
          <div className={styles.bandAside}>
            <div>
              <p className="mb-1 text-xs text-secondary-600 dark:text-secondary-400">
                {props.labels[2]}
              </p>
              {props.identity(row)}
            </div>
            <div>
              <p className="mb-1 text-xs text-secondary-600 dark:text-secondary-400">
                {props.labels[3]}
              </p>
              {props.coAuthors(row)}
            </div>
            {props.actions(row)}
          </div>
        </article>
      ))}
    </div>
  )
}

export function VariantC(
  props: LayoutProps & {
    selectedId: number | null
    select: (id: number) => void
  },
) {
  const selected =
    props.rows.find(row => row.id === props.selectedId) ?? props.rows[0]
  return (
    <div
      className={`${styles.surface} ${styles.split}`}
      data-prototype-surface="split"
    >
      <div className={styles.selectionList}>
        {props.rows.map(row => (
          <button
            aria-pressed={row.id === selected?.id}
            className={styles.selection}
            key={row.id}
            onClick={() => props.select(row.id)}
            type="button"
          >
            <span className="mb-2 block wrap-anywhere font-semibold">
              {row.name}
            </span>
            {props.status(row)}
          </button>
        ))}
      </div>
      {selected && (
        <article className={styles.detail} data-prototype-row={selected.id}>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <h2 className="min-w-0 flex-1 wrap-anywhere text-xl font-semibold">
              {selected.name}
            </h2>
            {props.actions(selected)}
          </div>
          <div className="mb-6 flex items-center gap-4">
            {props.status(selected)}
            {props.count(selected)}
          </div>
          <h3 className="mb-2 text-xs font-medium text-secondary-600 dark:text-secondary-400">
            {props.labels[1]}
          </h3>
          <p className={`${styles.purpose} mb-6 max-w-[75ch]`}>
            {selected.purposeAndScope}
          </p>
          <div className="grid gap-6 border-t pt-5 sm:grid-cols-2">
            <div>
              <h3 className="mb-2 text-xs text-secondary-600 dark:text-secondary-400">
                {props.labels[2]}
              </h3>
              {props.identity(selected)}
            </div>
            <div>
              <h3 className="mb-2 text-xs text-secondary-600 dark:text-secondary-400">
                {props.labels[3]}
              </h3>
              {props.coAuthors(selected)}
            </div>
          </div>
        </article>
      )}
    </div>
  )
}

type Action = 'edit' | 'archive' | 'delete' | 'coAuthors' | 'count' | 'create'

export default function PackageLayoutPrototype({
  items,
  loading,
}: {
  items: PrototypePackage[]
  loading: boolean
}) {
  const t = useTranslations('packagePrototype')
  const tp = useTranslations('requirementPackage')
  const tc = useTranslations('common')
  const locale = useLocale()
  const queryVariant = useSearchParams().get('variant')
  const variant: PrototypeVariant = prototypeVariants.includes(
    queryVariant as PrototypeVariant,
  )
    ? (queryVariant as PrototypeVariant)
    : 'A'
  const before = variant === 'before' || variant === 'D'
  const [stress, setStress] = useState(false)
  const [filter, setFilter] = useState('')
  const [patches, setPatches] = useState<
    Record<number, Partial<PrototypePackage>>
  >({})
  const [removed, setRemoved] = useState<number[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [dialog, setDialog] = useState<{
    action: Action
    row: PrototypePackage
  } | null>(null)
  const [draft, setDraft] = useState({ name: '', purposeAndScope: '' })
  const closeRef = useRef<HTMLButtonElement>(null)
  const [lastAction, setLastAction] = useState('')
  const fixture = (
    index: number,
    overrides: Partial<PrototypePackage>,
  ): PrototypePackage => ({
    id: -index,
    name: t(`fixture.name${index}`),
    purposeAndScope: t(`fixture.purpose${index}`),
    leadDisplayName: 'Anna Exempelsson',
    leadHsaId: 'SE5560000001-prototype',
    isArchived: false,
    linkedRequirementCount: 14,
    coAuthors: [
      { displayName: 'Bo Exempelsson', hsaId: 'SE5560000001-prototype2' },
    ],
    permissions: { canManageAssignments: true },
    ...overrides,
  })
  const stressRows = [
    fixture(1, { linkedRequirementCount: 14 }),
    fixture(2, {
      linkedRequirementCount: 209,
      leadHsaId: `SE5560000001-${'prototype'.repeat(8)}`,
      coAuthors: [
        {
          displayName: t('fixture.longPerson'),
          hsaId: 'SE5560000001-prototype3',
        },
      ],
    }),
    fixture(3, {
      linkedRequirementCount: 0,
      leadDisplayName: 'no-user',
      isArchived: true,
      coAuthors: [],
    }),
    fixture(4, {
      linkedRequirementCount: 1,
      permissions: { canManageAssignments: false },
      coAuthors: [],
    }),
  ]
  const source = stress ? stressRows : items
  const rows = source
    .filter(row => !removed.includes(row.id))
    .map(row => ({ ...row, ...patches[row.id] }))
    .filter(row =>
      `${row.name} ${row.purposeAndScope}`
        .toLocaleLowerCase(locale)
        .includes(filter.toLocaleLowerCase(locale)),
    )
  const labels = [
    tp('name'),
    tp('purposeAndScope'),
    tp('lead'),
    tp('coAuthors'),
    tp('status'),
    tp('linkedRequirements'),
    t('actions'),
  ]
  const open = (action: Action, row: PrototypePackage) => {
    setDialog({ action, row })
    setDraft({ name: row.name, purposeAndScope: row.purposeAndScope })
    setLastAction(`${action}: ${row.name}`)
  }
  const reset = () => {
    setPatches({})
    setRemoved([])
    setFilter('')
    setSelectedId(null)
    setLastAction('')
  }
  const applyPreview = () => {
    if (!dialog) return
    const { action, row } = dialog
    if (action === 'archive')
      setPatches(previous => ({
        ...previous,
        [row.id]: { ...previous[row.id], isArchived: !row.isArchived },
      }))
    if (action === 'delete') setRemoved(previous => [...previous, row.id])
    if (action === 'edit')
      setPatches(previous => ({
        ...previous,
        [row.id]: { ...previous[row.id], ...draft },
      }))
    setLastAction(`${action}: ${row.name} (${t('memoryOnly')})`)
    setDialog(null)
  }
  const actionLabel = (action: Action, row?: PrototypePackage) =>
    action === 'edit'
      ? tc('edit')
      : action === 'delete'
        ? tc('delete')
        : action === 'coAuthors'
          ? tp('manageCoAuthors')
          : action === 'count'
            ? tp('linkedRequirements')
            : action === 'create'
              ? tp('newRequirementPackage')
              : row?.isArchived
                ? tp('reactivate')
                : tp('archive')
  const layoutProps: LayoutProps = {
    rows,
    countWidth: locale === 'sv' ? 92 : 144,
    labels,
    identity: row => (
      <div
        className={before ? '' : styles.identity}
        {...devMarker({
          context: 'package prototype',
          name: 'responsible identity',
        })}
      >
        <span className={before ? 'block' : styles.identityName}>
          {formatActorDisplayNameForLocale(row.leadDisplayName, locale) ??
            row.leadHsaId}
        </span>
        <span
          className={
            before
              ? 'block whitespace-nowrap text-xs text-secondary-500'
              : styles.hsa
          }
          tabIndex={before ? undefined : 0}
          title={row.leadHsaId}
        >
          {row.leadHsaId}
        </span>
      </div>
    ),
    coAuthors: row => (
      <span
        className={`${before ? 'whitespace-normal wrap-break-word' : 'wrap-anywhere'} text-secondary-600 dark:text-secondary-400`}
      >
        {formatActorDisplayNameSummaryForLocale(
          (row.coAuthors ?? []).map(person => person.displayName),
          locale,
        )}
      </span>
    ),
    status: row =>
      variant === 'before' ? (
        <span>{row.isArchived ? tp('archived') : tp('active')}</span>
      ) : (
        <span
          className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-1 text-xs font-medium ${row.isArchived ? 'bg-secondary-100 text-secondary-700 dark:bg-secondary-800 dark:text-secondary-200' : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'}`}
          role="status"
          {...devMarker({
            context: 'package prototype',
            name: 'package status',
            value: row.isArchived ? 'archived' : 'active',
          })}
        >
          {row.isArchived ? (
            <Archive aria-hidden="true" size={13} />
          ) : (
            <CheckCircle2 aria-hidden="true" size={13} />
          )}
          {row.isArchived
            ? variant === 'D'
              ? t('archivedBadge')
              : tp('archived')
            : variant === 'D'
              ? t('activeBadge')
              : tp('active')}
        </span>
      ),
    count: row => (
      <button
        aria-label={`${tp('linkedRequirements')}: ${row.name}, ${row.linkedRequirementCount}`}
        className={`${styles.count} ${before ? styles.beforeCount : ''}`}
        onClick={() => open('count', row)}
        type="button"
        {...devMarker({
          context: 'package prototype',
          name: 'linked requirements count',
        })}
      >
        {t('count', { count: row.linkedRequirementCount })}
      </button>
    ),
    actions: row => (
      <div
        className={`${styles.actions} ${before ? styles.beforeActions : ''}`}
        {...devMarker({ context: 'package prototype', name: 'row actions' })}
      >
        {(['coAuthors', 'edit', 'archive', 'delete'] as const)
          .filter(
            action =>
              action !== 'coAuthors' || row.permissions?.canManageAssignments,
          )
          .map(action => {
            const Icon =
              action === 'coAuthors'
                ? UsersRound
                : action === 'edit'
                  ? Pencil
                  : action === 'delete'
                    ? Trash2
                    : row.isArchived
                      ? RotateCcw
                      : Archive
            return (
              <button
                aria-label={actionLabel(action, row)}
                className={`${styles.action} ${action === 'delete' ? 'text-red-700 dark:text-red-300' : 'text-secondary-700 dark:text-secondary-200'}`}
                key={action}
                onClick={() => open(action, row)}
                title={actionLabel(action, row)}
                type="button"
              >
                <Icon aria-hidden="true" size={16} />
              </button>
            )
          })}
      </div>
    ),
  }
  const checks = t.raw('checks') as { change: string; verify: string }[]
  return (
    <div
      className="section-padding pb-32 text-secondary-900 dark:text-secondary-100"
      {...devMarker({
        context: 'package prototype',
        name: 'prototype workspace',
        value: variant,
      })}
    >
      <ListWorkspace context="package prototype" reserveActions>
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{t('title')}</h1>
            <p className="mt-1 text-sm text-secondary-600 dark:text-secondary-400">
              {t('question')}
            </p>
          </div>
          <span className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
            {t('badge')}
          </span>
        </div>
        <details className="mb-4 rounded-xl border border-secondary-200 bg-secondary-50 p-3 text-sm dark:border-secondary-700 dark:bg-secondary-900">
          <summary className="cursor-pointer font-medium">{t('guide')}</summary>
          <p className="my-3">{t('instructions')}</p>
          <ol className="list-decimal space-y-3 pl-5">
            {checks.map(check => (
              <li key={check.change}>
                <strong>{check.change}</strong>
                <p className="text-secondary-600 dark:text-secondary-400">
                  {check.verify}
                </p>
              </li>
            ))}
          </ol>
        </details>
        <div className="mb-4 flex flex-wrap items-end gap-4">
          <label className="block min-w-48 flex-1 text-sm">
            {tp('filterByName')}
            <input
              className="mt-1 block min-h-9 w-full rounded-lg border bg-white px-3 dark:bg-secondary-900"
              onChange={event => setFilter(event.target.value)}
              placeholder={tp('filterByNamePlaceholder')}
              value={filter}
            />
          </label>
          <label className="flex min-h-9 items-center gap-2 text-sm">
            <input
              checked={stress}
              onChange={event => {
                setStress(event.target.checked)
                reset()
              }}
              type="checkbox"
            />
            {t('stress')}
          </label>
          <button
            className="min-h-9 rounded-lg border px-3 text-sm hover:bg-secondary-100 dark:hover:bg-secondary-800"
            onClick={reset}
            type="button"
          >
            {t('reset')}
          </button>
        </div>
        <div
          className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm"
          role="status"
        >
          <p>
            <strong>{t(`variant.${variant}`)}</strong>
            <span className="ml-2 text-secondary-600 dark:text-secondary-400">
              {t(`description.${variant}`)}
            </span>
          </p>
          <span className="text-xs text-secondary-600 dark:text-secondary-400">
            {t('visible', { count: rows.length })}
          </span>
        </div>
        <div className="relative">
          <button
            aria-label={tp('newRequirementPackage')}
            className="absolute top-0 -right-14 flex h-11 w-11 items-center justify-center rounded-full bg-primary-700 text-white shadow-sm focus-visible:outline-2 focus-visible:outline-primary-500 dark:bg-primary-600"
            onClick={() => open('create', stressRows[0])}
            title={tp('newRequirementPackage')}
            type="button"
          >
            <Plus aria-hidden="true" size={20} />
          </button>
          {loading && !stress ? (
            <p role="status">{tc('loading')}</p>
          ) : rows.length === 0 ? (
            <p className="rounded-xl border p-6">{tc('noResults')}</p>
          ) : variant === 'B' ? (
            <VariantB {...layoutProps} />
          ) : variant === 'C' ? (
            <VariantC
              {...layoutProps}
              select={setSelectedId}
              selectedId={selectedId}
            />
          ) : (
            <VariantA {...layoutProps} before={before} />
          )}
        </div>
        <details className="mt-5 rounded-xl border p-3 text-xs">
          <summary className="cursor-pointer font-medium">{t('state')}</summary>
          <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap wrap-anywhere">
            {JSON.stringify(
              {
                variant,
                source: stress ? 'synthetic' : 'live read-only',
                filter,
                selectedId:
                  variant === 'C'
                    ? (rows.find(row => row.id === selectedId)?.id ??
                      rows[0]?.id ??
                      null)
                    : null,
                lastAction,
                patches,
                removed,
                visibleCount: rows.length,
                rows: rows.map(row => ({
                  id: row.id,
                  name: row.name,
                  purposeAndScope: row.purposeAndScope,
                  leadHsaId: row.leadHsaId,
                  isArchived: row.isArchived,
                  linkedRequirementCount: row.linkedRequirementCount,
                  permissions: row.permissions,
                  leadDisplayName: formatActorDisplayNameForLocale(
                    row.leadDisplayName,
                    locale,
                  ),
                  coAuthors: row.coAuthors?.map(person => ({
                    displayName: formatActorDisplayNameForLocale(
                      person.displayName,
                      locale,
                    ),
                  })),
                })),
              },
              null,
              2,
            )}
          </pre>
        </details>
        <p
          className="mt-2 text-xs text-secondary-600 dark:text-secondary-400"
          role="status"
        >
          {lastAction || t('memoryOnly')}
        </p>
      </ListWorkspace>
      <PrototypeSwitcher current={variant} />
      <FormModal
        developerModeValue="package prototype interaction"
        initialFocusRef={closeRef}
        onClose={() => setDialog(null)}
        open={dialog !== null}
        title={`${t('badge')} · ${dialog ? actionLabel(dialog.action, dialog.row) : ''}`}
        titleId="package-prototype-dialog"
      >
        {dialog && (
          <div className="space-y-4 p-6">
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              {t('memoryOnly')}
            </p>
            {dialog.action !== 'create' && (
              <h3 className="font-semibold">{dialog.row.name}</h3>
            )}
            {dialog.action === 'edit' ? (
              <>
                <label className="block text-sm">
                  {tp('name')}
                  <input
                    className="mt-1 block w-full rounded-lg border bg-transparent p-2"
                    onChange={event =>
                      setDraft(previous => ({
                        ...previous,
                        name: event.target.value,
                      }))
                    }
                    value={draft.name}
                  />
                  <span className="mt-1 block text-xs text-secondary-600 dark:text-secondary-400">
                    {tp('nameHelp')}
                  </span>
                </label>
                <label className="block text-sm">
                  {tp('purposeAndScope')}
                  <textarea
                    className="mt-1 block w-full rounded-lg border bg-transparent p-2"
                    onChange={event =>
                      setDraft(previous => ({
                        ...previous,
                        purposeAndScope: event.target.value,
                      }))
                    }
                    rows={6}
                    value={draft.purposeAndScope}
                  />
                  <span className="mt-1 block text-xs text-secondary-600 dark:text-secondary-400">
                    {tp('purposeAndScopeHelp')}
                  </span>
                </label>
              </>
            ) : dialog.action === 'count' ? (
              <p className="flex items-center gap-2">
                <ListChecks aria-hidden="true" size={18} />
                {t('countPreview', {
                  count: dialog.row.linkedRequirementCount,
                })}
              </p>
            ) : dialog.action === 'coAuthors' ? (
              <p>
                {layoutProps.coAuthors(dialog.row)} · {t('stub')}
              </p>
            ) : (
              <p>{t('stub')}</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                className="min-h-9 rounded-lg border px-4"
                onClick={() => setDialog(null)}
                ref={closeRef}
                type="button"
              >
                {tc('close')}
              </button>
              {['edit', 'archive', 'delete'].includes(dialog.action) && (
                <button
                  className="min-h-9 rounded-lg bg-primary-700 px-4 text-white dark:bg-primary-600"
                  onClick={applyPreview}
                  type="button"
                >
                  {t('applyPreview')}
                </button>
              )}
            </div>
          </div>
        )}
      </FormModal>
    </div>
  )
}

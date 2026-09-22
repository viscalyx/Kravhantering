'use client'

// THROWAWAY #1358: before + four structurally different norm-library layouts.
// Question: which layout makes long names and issuers easiest to compare?
import {
  Archive,
  CheckCircle2,
  ExternalLink,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { useRef, useState } from 'react'
import FormModal from '@/components/FormModal'
import ListWorkspace from '@/components/ListWorkspace'
import PrototypeVariantSwitcher from '@/components/PrototypeVariantSwitcher'
import { devMarker } from '@/lib/developer-mode-markers'
import { getBrowserLinkUri } from '@/lib/norm-references/browser-link-uri'

interface Norm {
  id: number
  isArchived: boolean
  issuer: string
  linkedRequirementCount: number
  name: string
  normReferenceId: string
  reference: string
  type: string
  updatedAt: string
  uri: string | null
  version: string | null
}
type Action = 'edit' | 'archive' | 'delete' | 'create'
type VariantProps = {
  rows: Norm[]
  act: (action: Action, row: Norm, anchor: HTMLButtonElement) => void
}
const actionClass =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 hover:bg-primary-50 dark:hover:bg-primary-950/30'
const surface =
  'relative overflow-x-auto rounded-2xl border bg-white/80 shadow-sm dark:bg-secondary-900/60'
const rowClass =
  'border-b last:border-b-0 hover:bg-primary-50/40 dark:hover:bg-primary-950/20'

const examples: Norm[] = [
  {
    id: -13581,
    normReferenceId: 'PROTOTYPE-001',
    name: 'Exempel: Lång normbenämning för tillgängliga digitala tjänster och gemensamma informationssystem',
    type: 'Standard',
    reference: 'EN 301 549 / kapitel 9–11 / bilaga A',
    version: '3.2.1',
    issuer: 'Europeiska unionens råd och Europaparlamentet',
    uri: 'https://example.com',
    isArchived: false,
    linkedRequirementCount: 14,
    updatedAt: '',
  },
  {
    id: -13582,
    normReferenceId: 'PROTOTYPE-002',
    name: 'Exempel: Arkiverad norm utan extern länk',
    type: 'Riktlinje',
    reference: 'REF-2024/kapitel-2',
    version: null,
    issuer: 'Myndigheten för samhällsskydd och beredskap (MSB)',
    uri: null,
    isArchived: true,
    linkedRequirementCount: 209,
    updatedAt: '',
  },
  {
    id: -13583,
    normReferenceId: 'PROTOTYPE-003',
    name: 'Exempel: Noll kopplade krav',
    type: 'Standard',
    reference:
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    version: '2026',
    issuer: 'Exempelorganisation',
    uri: 'urn:example:reference',
    isArchived: false,
    linkedRequirementCount: 0,
    updatedAt: '',
  },
  {
    id: -13584,
    normReferenceId: 'PROTOTYPE-004',
    name: 'Exempel: Ett kopplat krav',
    type: 'Lag',
    reference: 'SFS 2026:001',
    version: '1',
    issuer: 'Riksdagen',
    uri: 'https://example.com',
    isArchived: false,
    linkedRequirementCount: 1,
    updatedAt: '',
  },
]

function NormStatus({ row }: { row: Norm }) {
  const t = useTranslations('normReference')
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-1 text-xs font-medium ${row.isArchived ? 'bg-secondary-100 text-secondary-700 dark:bg-secondary-800 dark:text-secondary-200' : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'}`}
      role="status"
      {...devMarker({
        context: 'normReferences',
        name: 'norm status',
        value: row.isArchived ? 'archived' : 'active',
      })}
    >
      {row.isArchived ? (
        <Archive aria-hidden size={13} />
      ) : (
        <CheckCircle2 aria-hidden size={13} />
      )}
      {row.isArchived ? t('archived') : t('active')}
    </span>
  )
}
function NormName({
  row,
  inlineUri = false,
}: {
  row: Norm
  inlineUri?: boolean
}) {
  const t = useTranslations('normReference')
  const uri = getBrowserLinkUri(row.uri)
  return (
    <span
      className={
        inlineUri
          ? '[overflow-wrap:anywhere]'
          : 'grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2'
      }
    >
      <span className="min-w-0 wrap-break-word" data-prototype-name>
        {row.name}
      </span>
      {uri && (
        <a
          aria-label={t('openUri')}
          className={`${inlineUri ? `${actionClass.replace('h-11 w-11', 'h-6 w-6')} ml-1 align-top` : actionClass} text-primary-700 dark:text-primary-300`}
          href={uri}
          rel="noopener noreferrer"
          target="_blank"
          title={t('openUri')}
          {...devMarker({
            context: 'normReferences',
            name: 'table action',
            value: 'open URI',
          })}
        >
          <ExternalLink aria-hidden size={16} />
        </a>
      )}
    </span>
  )
}
function Actions({ row, act }: { row: Norm; act: VariantProps['act'] }) {
  const t = useTranslations('normReference')
  const c = useTranslations('common')
  return (
    <div className="flex justify-end gap-1" data-prototype-actions>
      <button
        aria-label={c('edit')}
        className={`${actionClass} text-primary-700 dark:text-primary-300`}
        onClick={e => act('edit', row, e.currentTarget)}
        title={c('edit')}
        type="button"
      >
        <Pencil aria-hidden size={16} />
      </button>
      <button
        aria-label={row.isArchived ? t('reactivate') : t('archive')}
        className={actionClass}
        onClick={e => act('archive', row, e.currentTarget)}
        title={row.isArchived ? t('reactivate') : t('archive')}
        type="button"
      >
        {row.isArchived ? (
          <RotateCcw aria-hidden size={16} />
        ) : (
          <Archive aria-hidden size={16} />
        )}
      </button>
      <button
        aria-label={c('delete')}
        className={`${actionClass} text-red-700 dark:text-red-400`}
        onClick={e => act('delete', row, e.currentTarget)}
        title={c('delete')}
        type="button"
      >
        <Trash2 aria-hidden size={16} />
      </button>
    </div>
  )
}

export function VariantA({
  rows,
  act,
  before = false,
}: VariantProps & { before?: boolean }) {
  const t = useTranslations('normReference')
  const c = useTranslations('common')
  const en = useLocale() === 'en'
  const cell = before ? 'px-4 py-3' : 'px-1.5 py-2'
  return (
    <div
      className={surface}
      data-prototype-scroll
      {...devMarker({
        context: 'normReferences',
        name: 'prototype comparison table',
        value: before ? 'before' : 'A',
      })}
    >
      <table
        className={before ? 'w-full text-sm' : 'w-full table-fixed text-sm'}
        style={before ? undefined : { minWidth: en ? 1140 : 1040 }}
      >
        {!before && (
          <colgroup>
            <col style={{ width: 94 }} />
            <col />
            <col style={{ width: 72 }} />
            <col style={{ width: 104 }} />
            <col style={{ width: 64 }} />
            <col />
            <col style={{ width: 84 }} />
            <col style={{ width: en ? 154 : 72 }} />
            <col style={{ width: 148 }} />
          </colgroup>
        )}
        <thead>
          <tr className="border-b bg-secondary-50/80 text-left text-secondary-700 dark:bg-secondary-800/30 dark:text-secondary-300">
            {[
              'normReferenceId',
              'name',
              'type',
              'reference',
              'version',
              'issuer',
              'status',
              'linkedRequirements',
            ].map(key => (
              <th
                className={`${cell} font-medium ${key === 'linkedRequirements' ? 'text-center' : ''}`}
                key={key}
                scope="col"
              >
                {t(key)}
              </th>
            ))}
            <th className={cell} scope="col">
              <span className="sr-only">{c('actions')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr
              className={rowClass}
              data-norm-id={row.normReferenceId}
              key={row.id}
            >
              <td
                className={`${cell} font-mono text-xs ${before ? '' : '[overflow-wrap:anywhere]'}`}
              >
                {row.normReferenceId}
              </td>
              <td className={`${cell} font-medium`}>
                <NormName row={row} />
              </td>
              <td className={cell}>{row.type}</td>
              <td
                className={`${cell} ${before ? '' : '[overflow-wrap:anywhere]'}`}
              >
                {row.reference}
              </td>
              <td
                className={`${cell} ${before ? '' : '[overflow-wrap:anywhere]'}`}
              >
                {row.version ?? '-'}
              </td>
              <td
                className={`${cell} ${before ? '' : '[overflow-wrap:anywhere]'}`}
              >
                {row.issuer}
              </td>
              <td className={cell}>
                {before ? (
                  row.isArchived ? (
                    t('archived')
                  ) : (
                    t('active')
                  )
                ) : (
                  <NormStatus row={row} />
                )}
              </td>
              <td
                className={`${cell} text-center ${before ? '' : 'whitespace-nowrap'}`}
              >
                {t('requirementCount', { count: row.linkedRequirementCount })}
              </td>
              <td className={`${cell} text-right`}>
                <Actions act={act} row={row} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function VariantB({ rows, act }: VariantProps) {
  const t = useTranslations('normReference')
  const p = useTranslations('prototypeNormLayout')
  return (
    <div
      className={surface}
      data-prototype-scroll
      {...devMarker({
        context: 'normReferences',
        name: 'prototype grouped rows',
        value: 'B',
      })}
    >
      <table className="w-full min-w-[900px] table-fixed text-left text-sm">
        <colgroup>
          <col style={{ width: '47%' }} />
          <col style={{ width: '27%' }} />
          <col style={{ width: '26%' }} />
        </colgroup>
        <thead className="border-b bg-secondary-50 dark:bg-secondary-800/30">
          <tr>
            <th className="p-4" scope="col">
              {p('identity')}
            </th>
            <th className="p-4" scope="col">
              {t('issuer')}
            </th>
            <th className="p-4" scope="col">
              {p('statusActions')}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr
              className={rowClass}
              data-norm-id={row.normReferenceId}
              key={row.id}
            >
              <td className="p-4 align-top">
                <div className="mb-2 font-medium">
                  <NormName row={row} />
                </div>
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
                  <dt>{t('normReferenceId')}</dt>
                  <dd className="font-mono [overflow-wrap:anywhere]">
                    {row.normReferenceId}
                  </dd>
                  <dt>{t('reference')}</dt>
                  <dd className="[overflow-wrap:anywhere]">{row.reference}</dd>
                  <dt>{t('version')}</dt>
                  <dd>{row.version ?? '-'}</dd>
                </dl>
              </td>
              <td className="p-4 align-top">
                <p className="[overflow-wrap:anywhere]">{row.issuer}</p>
                <p className="mt-3 text-xs text-secondary-500 dark:text-secondary-400">
                  {t('type')}: {row.type}
                </p>
              </td>
              <td className="p-4 align-top">
                <div className="flex flex-wrap items-center gap-3">
                  <NormStatus row={row} />
                  <span className="whitespace-nowrap text-xs">
                    {t('requirementCount', {
                      count: row.linkedRequirementCount,
                    })}
                  </span>
                </div>
                <div className="mt-4">
                  <Actions act={act} row={row} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function VariantD({ rows, act }: VariantProps) {
  const t = useTranslations('normReference')
  const p = useTranslations('prototypeNormLayout')
  return (
    <div
      className={surface}
      data-prototype-scroll
      {...devMarker({
        context: 'normReferences',
        name: 'prototype separate identification',
        value: 'D',
      })}
    >
      <table className="w-full min-w-[1000px] table-fixed text-left text-sm">
        <colgroup>
          <col style={{ width: '47%' }} />
          <col style={{ width: '27%' }} />
          <col style={{ width: '26%' }} />
        </colgroup>
        <thead className="border-b bg-secondary-50 dark:bg-secondary-800/30">
          <tr>
            <th className="p-4" scope="col">
              {t('name')}
            </th>
            <th className="p-4" scope="col">
              {p('identification')}
            </th>
            <th className="p-4" scope="col">
              {p('statusActions')}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr
              className={rowClass}
              data-norm-id={row.normReferenceId}
              key={row.id}
            >
              <td className="h-px p-4 align-top">
                <div
                  className="grid h-full grid-rows-[1fr_auto_1fr] gap-3"
                  data-prototype-name-cell
                >
                  <div className="font-medium leading-6">
                    <NormName inlineUri row={row} />
                  </div>
                  <div
                    className="text-sm text-secondary-600 dark:text-secondary-400"
                    data-prototype-centered-metadata
                  >
                    <p
                      className="[overflow-wrap:anywhere]"
                      data-prototype-issuer
                    >
                      <span className="text-xs font-medium">
                        {t('issuer')}:
                      </span>{' '}
                      {row.issuer}
                    </p>
                  </div>
                </div>
              </td>
              <td className="p-4 align-top">
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs">
                  <dt className="leading-6">{t('normReferenceId')}</dt>
                  <dd className="font-mono text-sm leading-6 [overflow-wrap:anywhere]">
                    {row.normReferenceId}
                  </dd>
                  <dt>{t('reference')}</dt>
                  <dd className="[overflow-wrap:anywhere]">{row.reference}</dd>
                  <dt>{t('version')}</dt>
                  <dd className="[overflow-wrap:anywhere]">
                    {row.version ?? '-'}
                  </dd>
                  <dt>{t('type')}</dt>
                  <dd className="[overflow-wrap:anywhere]" data-prototype-type>
                    {row.type}
                  </dd>
                </dl>
              </td>
              <td className="p-4 align-top">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-1">
                  <div>
                    <NormStatus row={row} />
                  </div>
                  <Actions act={act} row={row} />
                  <span className="col-span-2 whitespace-nowrap text-xs">
                    {t('requirementCount', {
                      count: row.linkedRequirementCount,
                    })}
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function VariantC({
  rows,
  act,
  selected,
  select,
}: VariantProps & { selected: number | null; select: (id: number) => void }) {
  const t = useTranslations('normReference')
  const p = useTranslations('prototypeNormLayout')
  const row = rows.find(r => r.id === selected) ?? rows[0]
  return (
    <div
      className="grid items-start gap-4 lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]"
      {...devMarker({
        context: 'normReferences',
        name: 'prototype list and detail',
        value: 'C',
      })}
    >
      <div className="overflow-hidden rounded-2xl border bg-white/80 dark:bg-secondary-900/60">
        <h2 className="border-b px-4 py-3 text-sm font-semibold">
          {p('selectNorm')}
        </h2>
        {rows.map(item => (
          <button
            aria-pressed={item.id === row?.id}
            className={`block min-h-11 w-full border-b p-4 text-left last:border-0 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500 ${item.id === row?.id ? 'bg-primary-50 dark:bg-primary-950/50' : 'hover:bg-secondary-50 dark:hover:bg-secondary-800'}`}
            key={item.id}
            onClick={() => select(item.id)}
            type="button"
          >
            <span className="block text-xs text-secondary-600 dark:text-secondary-400">
              {item.normReferenceId}
            </span>
            <span className="mt-1 block font-medium [overflow-wrap:anywhere]">
              {item.name}
            </span>
            <span className="mt-2 block">
              <NormStatus row={item} />
            </span>
          </button>
        ))}
      </div>
      {row && (
        <section
          aria-label={p('selectedNorm')}
          className="min-w-0 rounded-2xl border bg-white/80 p-5 dark:bg-secondary-900/60 lg:sticky lg:top-6"
          data-norm-id={row.normReferenceId}
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <NormStatus row={row} />
            <span className="text-sm">
              {t('requirementCount', { count: row.linkedRequirementCount })}
            </span>
          </div>
          <h2 className="mb-6 text-xl font-semibold">
            <NormName row={row} />
          </h2>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-4 text-sm">
            {(
              [
                'normReferenceId',
                'type',
                'reference',
                'version',
                'issuer',
              ] as const
            ).map(key => (
              <div className="contents" key={key}>
                <dt className="text-secondary-500 dark:text-secondary-400">
                  {t(key)}
                </dt>
                <dd className="[overflow-wrap:anywhere]">{row[key] ?? '-'}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-6 border-t pt-3">
            <Actions act={act} row={row} />
          </div>
        </section>
      )}
    </div>
  )
}

export default function NormLayoutPrototype({
  items,
  loading,
}: {
  items: Norm[]
  loading: boolean
}) {
  const t = useTranslations('normReference')
  const p = useTranslations('prototypeNormLayout')
  const c = useTranslations('common')
  const nav = useTranslations('nav')
  const params = useSearchParams()
  const variant = ['before', 'A', 'B', 'C', 'D'].includes(
    params.get('variant') ?? '',
  )
    ? (params.get('variant') ?? 'A')
    : 'A'
  const variants = ['before', 'A', 'B', 'C', 'D'].map(key => ({
    key,
    label: p(`variants.${key}`),
  }))
  const [query, setQuery] = useState('')
  const [edgeCases, setEdgeCases] = useState(false)
  const [changes, setChanges] = useState<Record<number, Norm | null>>({})
  const [selected, setSelected] = useState<number | null>(null)
  const [dialog, setDialog] = useState<{ action: Action; row: Norm } | null>(
    null,
  )
  const [draft, setDraft] = useState('')
  const [lastAction, setLastAction] = useState('—')
  const returnFocus = useRef<HTMLElement | null>(null)
  const initialFocus = useRef<HTMLButtonElement | null>(null)
  const source = [...items, ...(edgeCases ? examples : [])]
  const allRows = [
    ...source
      .map(row => (changes[row.id] === undefined ? row : changes[row.id]))
      .filter((r): r is Norm => r !== null),
    ...Object.values(changes).filter(
      (r): r is Norm =>
        r !== null &&
        !source.some(s => s.id === r.id) &&
        !examples.some(s => s.id === r.id),
    ),
  ]
  const rows = allRows.filter(row =>
    [row.normReferenceId, row.name, row.type, row.reference, row.issuer].some(
      value =>
        value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
    ),
  )
  const act: VariantProps['act'] = (action, row, anchor) => {
    returnFocus.current = anchor
    setDialog({ action, row })
    setDraft(row.name)
  }
  const save = () => {
    if (!dialog) return
    const { action, row } = dialog
    const value =
      action === 'delete'
        ? null
        : {
            ...row,
            name: action === 'edit' || action === 'create' ? draft : row.name,
            isArchived: action === 'archive' ? !row.isArchived : row.isArchived,
          }
    setChanges(old => ({ ...old, [row.id]: value }))
    setLastAction(`${action}: ${row.normReferenceId}`)
    setDialog(null)
  }
  const actionLabel = dialog
    ? dialog.action === 'edit'
      ? c('edit')
      : dialog.action === 'create'
        ? t('newNormReference')
        : dialog.action === 'delete'
          ? c('delete')
          : dialog.row.isArchived
            ? t('reactivate')
            : t('archive')
    : ''
  return (
    <div className="section-padding pb-32 text-secondary-900 dark:text-secondary-100">
      <ListWorkspace context="normReferences" reserveActions>
        <header className="mb-6">
          <h1 className="text-2xl font-bold">{nav('normLibrary')}</h1>
          <p className="mt-2 text-sm font-semibold text-amber-800 dark:text-amber-200">
            {p('notice')}
          </p>
          <p className="mt-1 max-w-3xl text-sm text-secondary-600 dark:text-secondary-400">
            {p('question')}
          </p>
        </header>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <label className="block w-full max-w-lg text-xs">
            {t('filterByName')}
            <input
              className="mt-1 min-h-11 w-full rounded-xl border bg-white px-3 text-sm dark:bg-secondary-900"
              id="prototype-filter"
              onChange={e => setQuery(e.target.value)}
              placeholder={t('filterByNamePlaceholder')}
              value={query}
            />
          </label>
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
            <input
              checked={edgeCases}
              className="h-6 w-6"
              onChange={e => setEdgeCases(e.target.checked)}
              type="checkbox"
            />
            {p('examples')}
          </label>
          <button
            className="min-h-11 rounded-lg border px-3 text-sm hover:bg-secondary-100 dark:hover:bg-secondary-800"
            onClick={() => {
              setChanges({})
              setQuery('')
              setSelected(null)
              setLastAction(p('reset'))
            }}
            type="button"
          >
            {p('reset')}
          </button>
        </div>
        <details
          className="mb-4 rounded-xl border bg-secondary-50 p-3 text-sm dark:bg-secondary-900"
          data-prototype-guide
        >
          <summary className="min-h-6 cursor-pointer font-medium">
            {p('guide')}
          </summary>
          <p className="my-3">{p('guideIntro')}</p>
          <ol className="list-decimal space-y-2 pl-5">
            {[
              'space',
              'fields',
              'links',
              'statuses',
              'actions',
              'alternatives',
              'matrix',
              'state',
            ].map(key => (
              <li key={key}>{p(`checks.${key}`)}</li>
            ))}
          </ol>
        </details>
        <p aria-live="polite" className="mb-3 text-sm">
          <strong>
            {variant} · {p(`variants.${variant}`)}
          </strong>{' '}
          — {p(`descriptions.${variant}`)}
        </p>
        <div className="relative">
          <button
            aria-label={t('newNormReference')}
            className="absolute -right-14 top-0 inline-flex h-11 w-11 items-center justify-center rounded-full bg-primary-600 text-white shadow hover:bg-primary-700 focus-visible:ring-2 focus-visible:ring-primary-400"
            onClick={e =>
              act(
                'create',
                {
                  ...examples[0],
                  id: -Date.now(),
                  normReferenceId: `PROTOTYPE-NEW-${Object.keys(changes).length + 1}`,
                  name: p('newName'),
                  reference: 'DEMO/2026',
                  issuer: 'Exempelorganisation',
                  linkedRequirementCount: 0,
                },
                e.currentTarget,
              )
            }
            title={t('newNormReference')}
            type="button"
          >
            <Plus aria-hidden size={18} />
          </button>
          {loading ? (
            <p role="status">{c('loading')}</p>
          ) : rows.length === 0 ? (
            <p className="rounded-xl border p-8" role="status">
              {query ? c('noResults') : t('emptyState')}
            </p>
          ) : variant === 'before' || variant === 'A' ? (
            <VariantA act={act} before={variant === 'before'} rows={rows} />
          ) : variant === 'B' ? (
            <VariantB act={act} rows={rows} />
          ) : variant === 'D' ? (
            <VariantD act={act} rows={rows} />
          ) : (
            <VariantC
              act={act}
              rows={rows}
              select={setSelected}
              selected={selected}
            />
          )}
        </div>
        <details
          className="mt-5 rounded-xl border p-3 text-sm"
          data-prototype-state
        >
          <summary className="min-h-6 cursor-pointer font-medium">
            {p('state')} · {variant} · {rows.length}/{allRows.length} ·{' '}
            {lastAction}
          </summary>
          <pre className="mt-3 max-h-96 overflow-auto text-xs">
            {JSON.stringify(
              {
                variant,
                query,
                edgeCases,
                loadedRecords: items.length,
                visibleIds: rows.map(r => r.normReferenceId),
                selected:
                  variant === 'C'
                    ? (rows.find(r => r.id === selected) ?? rows[0])
                        ?.normReferenceId
                    : null,
                lastAction,
                changes,
              },
              null,
              2,
            )}
          </pre>
        </details>
      </ListWorkspace>
      <PrototypeVariantSwitcher current={variant} variants={variants} />
      <FormModal
        developerModeValue="prototype action preview"
        initialFocusRef={initialFocus}
        onClose={() => setDialog(null)}
        open={dialog !== null}
        returnFocusRef={returnFocus}
        title={`${p('preview')}: ${actionLabel}`}
        titleId="norm-prototype-dialog"
      >
        <p className="mb-4 text-sm text-amber-800 dark:text-amber-200">
          {p('memoryOnly')}
        </p>
        <p className="mb-4 text-sm">{dialog?.row.normReferenceId}</p>
        {(dialog?.action === 'edit' || dialog?.action === 'create') && (
          <label className="block text-sm">
            {t('name')}
            <input
              className="mt-2 min-h-11 w-full rounded-lg border bg-white p-2 dark:bg-secondary-900"
              onChange={e => setDraft(e.target.value)}
              value={draft}
            />
            <details className="my-2">
              <summary
                aria-label={p('fieldHelp')}
                className="inline-flex min-h-6 min-w-6 cursor-pointer items-center justify-center rounded-full border"
              >
                ?
              </summary>
              <p>{p('nameHelp')}</p>
            </details>
          </label>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            className="min-h-11 rounded-lg border px-4"
            onClick={() => setDialog(null)}
            ref={initialFocus}
            type="button"
          >
            {c('cancel')}
          </button>
          <button
            className="min-h-11 rounded-lg bg-primary-600 px-4 text-white disabled:opacity-50"
            disabled={!draft.trim()}
            onClick={save}
            type="button"
          >
            {p('apply')}
          </button>
        </div>
      </FormModal>
    </div>
  )
}

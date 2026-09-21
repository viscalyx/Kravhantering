'use client'

// Three throwaway layouts plus Before on /requirement-areas?variant=.
// Question: which structure best exposes descriptions and responsibility?
import { Pencil, Plus, Trash2, UsersRound } from 'lucide-react'
import type { Route } from 'next'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { useTheme } from 'next-themes'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import type { CrudAdminColumn } from '@/components/CrudAdminPanel'
import ListWorkspace from '@/components/ListWorkspace'
import PrototypeSwitcher, {
  PROTOTYPE_VARIANTS,
  type PrototypeVariant,
} from '@/components/PrototypeSwitcher'
import { devMarker } from '@/lib/developer-mode-markers'
import {
  formatActorDisplayNameForLocale,
  formatActorDisplayNameSummaryForLocale,
} from '@/lib/privacy/display-name'
import type { Area } from './requirement-areas-client'
import styles from './requirement-areas-prototype.module.css'
import { prototypeAreas } from './requirement-areas-prototype-data'

interface LayoutProps {
  actions: (area: Area) => ReactNode
  areas: Area[]
  coAuthors: (area: Area) => ReactNode
  owner: (area: Area) => ReactNode
}

export function VariantA({ areas, actions, owner, coAuthors }: LayoutProps) {
  const t = useTranslations('area')
  const tc = useTranslations('common')
  return (
    <div className={styles.surface}>
      <div className={styles.scroll}>
        <table
          className={styles.table}
          {...devMarker({
            context: 'areas',
            name: 'prototype table',
            value: 'A',
          })}
        >
          <colgroup>
            <col className={styles.prefixWidth} />
            <col style={{ width: '18%' }} />
            <col />
            <col style={{ width: '17%' }} />
            <col style={{ width: '15%' }} />
            <col className={styles.actionsWidth} />
          </colgroup>
          <thead>
            <tr>
              {['prefix', 'name', 'description', 'owner', 'coAuthors'].map(
                key => (
                  <th key={key}>{t(key)}</th>
                ),
              )}
              <th>
                <span className="sr-only">{tc('actions')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {areas.map(area => (
              <tr data-prototype-row={area.prefix} key={area.id}>
                <td className={styles.prefix}>{area.prefix}</td>
                <td>
                  <span className={styles.name}>{area.name}</span>
                </td>
                <td className={styles.description} data-prototype-description>
                  {area.description || '—'}
                </td>
                <td data-prototype-owner>{owner(area)}</td>
                <td data-prototype-coauthors>{coAuthors(area)}</td>
                <td>{actions(area)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function VariantB({ areas, actions, owner, coAuthors }: LayoutProps) {
  const t = useTranslations('area')
  return (
    <div
      className={styles.surface}
      {...devMarker({ context: 'areas', name: 'prototype rows', value: 'B' })}
    >
      {areas.map(area => (
        <article
          className={styles.narrative}
          data-prototype-row={area.prefix}
          key={area.id}
        >
          <div className={styles.narrativeHeading}>
            <span className={styles.prefix}>{area.prefix}</span>
            <h2 className={styles.name}>{area.name}</h2>
            {actions(area)}
          </div>
          <p className={styles.description} data-prototype-description>
            {area.description || '—'}
          </p>
          <dl className={styles.responsibility}>
            <div data-prototype-owner>
              <dt>{t('owner')}</dt>
              <dd>{owner(area)}</dd>
            </div>
            <div data-prototype-coauthors>
              <dt>{t('coAuthors')}</dt>
              <dd>{coAuthors(area)}</dd>
            </div>
          </dl>
        </article>
      ))}
    </div>
  )
}

export function VariantC({ areas, actions, owner, coAuthors }: LayoutProps) {
  const t = useTranslations('area')
  return (
    <div
      className={styles.cards}
      {...devMarker({ context: 'areas', name: 'prototype cards', value: 'C' })}
    >
      {areas.map(area => (
        <article
          className={`${styles.surface} ${styles.card}`}
          data-prototype-row={area.prefix}
          key={area.id}
        >
          <div className={styles.cardHeading}>
            <span className={styles.prefix}>{area.prefix}</span>
            {actions(area)}
          </div>
          <h2 className={styles.name}>{area.name}</h2>
          <p className={styles.description} data-prototype-description>
            {area.description || '—'}
          </p>
          <dl className={styles.responsibility}>
            <div data-prototype-owner>
              <dt>{t('owner')}</dt>
              <dd>{owner(area)}</dd>
            </div>
            <div data-prototype-coauthors>
              <dt>{t('coAuthors')}</dt>
              <dd>{coAuthors(area)}</dd>
            </div>
          </dl>
        </article>
      ))}
    </div>
  )
}

export default function RequirementAreasPrototype({
  areas: liveAreas,
  columns,
  loading,
  error,
}: {
  areas: Area[]
  columns: CrudAdminColumn<Area>[]
  loading: boolean
  error: string | null
}) {
  const t = useTranslations('prototype1354')
  const ta = useTranslations('area')
  const tc = useTranslations('common')
  const tn = useTranslations('nav')
  const locale = useLocale()
  const params = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const selected = params.get('variant')
  const variant: PrototypeVariant =
    PROTOTYPE_VARIANTS.find(value => value === selected) ?? 'A'
  const sample = ['stress', 'empty'].includes(params.get('sample') ?? '')
    ? params.get('sample')
    : 'live'
  const areas =
    sample === 'stress'
      ? prototypeAreas(locale)
      : sample === 'empty'
        ? []
        : liveAreas
  const [lastAction, setLastAction] = useState('')
  const [notes, setNotes] = useState('')
  const [geometry, setGeometry] = useState({ viewport: 0, workspace: 0 })
  const contentRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = contentRef.current
    if (!element) return
    const observer = new ResizeObserver(() =>
      setGeometry({
        viewport: window.innerWidth,
        workspace: Math.round(element.getBoundingClientRect().width),
      }),
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const state = {
    variant,
    sample,
    rows: areas.length,
    locale,
    theme: mounted ? resolvedTheme : undefined,
    ...geometry,
    persistence: 'none',
    lastAction,
    notes,
  }
  const changeSample = (value: string) => {
    const next = new URLSearchParams(params.toString())
    next.set('sample', value)
    router.replace(`${pathname}?${next}` as Route, { scroll: false })
  }
  const previewAction = (action: string, area?: Area) =>
    setLastAction(
      t('actionFeedback', { action, name: area?.name ?? tn('areas') }),
    )
  const actions = (area: Area) => (
    <div
      className={`${styles.actions} ${variant === 'before' ? styles.beforeActions : ''}`}
    >
      {area.permissions?.canManageAssignments && (
        <button
          aria-label={`${ta('manageCoAuthors')}: ${area.name}`}
          className={styles.action}
          onClick={() => previewAction(ta('manageCoAuthors'), area)}
          title={ta('manageCoAuthors')}
          type="button"
          {...devMarker({
            context: 'areas',
            name: 'prototype action',
            value: 'co-authors',
          })}
        >
          <UsersRound aria-hidden="true" className="size-4" />
        </button>
      )}
      <button
        aria-label={`${tc('edit')}: ${area.name}`}
        className={styles.action}
        onClick={() => previewAction(tc('edit'), area)}
        title={tc('edit')}
        type="button"
        {...devMarker({
          context: 'areas',
          name: 'prototype action',
          value: 'edit',
        })}
      >
        <Pencil aria-hidden="true" className="size-4" />
      </button>
      <button
        aria-label={`${tc('delete')}: ${area.name}`}
        className={`${styles.action} text-red-700 dark:text-red-400`}
        onClick={() => previewAction(tc('delete'), area)}
        title={tc('delete')}
        type="button"
        {...devMarker({
          context: 'areas',
          name: 'prototype action',
          value: 'delete',
        })}
      >
        <Trash2 aria-hidden="true" className="size-4" />
      </button>
    </div>
  )
  const owner = (area: Area) => (
    <div className={styles.person}>
      <span>
        {formatActorDisplayNameForLocale(area.ownerDisplayName, locale) ??
          area.ownerHsaId}
      </span>
      <span className={styles.hsa}>{area.ownerHsaId}</span>
    </div>
  )
  const coAuthors = (area: Area) => (
    <span className={styles.coauthors}>
      {formatActorDisplayNameSummaryForLocale(
        area.coAuthors.map(author => author.displayName),
        locale,
      )}
    </span>
  )
  const layoutProps = { areas, actions, owner, coAuthors }

  return (
    <div
      className={`section-padding ${styles.prototype}`}
      data-prototype-dataset={sample}
      data-prototype-variant={variant}
      data-theme={mounted ? resolvedTheme : undefined}
    >
      <ListWorkspace context="areas">
        <div ref={contentRef}>
          <aside
            className={styles.review}
            {...devMarker({
              context: 'areas',
              name: 'prototype review',
              value: variant,
            })}
          >
            <div className={styles.reviewTop}>
              <div>
                <strong>{t('badge')}</strong>
                <p>{t('question')}</p>
              </div>
              <label className={styles.sampleLabel}>
                {t('dataset')}
                <select
                  className={styles.select}
                  onChange={event => changeSample(event.target.value)}
                  value={sample ?? 'live'}
                >
                  <option value="live">{t('live')}</option>
                  <option value="stress">{t('stress')}</option>
                  <option value="empty">{t('empty')}</option>
                </select>
              </label>
            </div>
            <p className={styles.verdict}>{t(`summaries.${variant}`)}</p>
            <details className={styles.details}>
              <summary>{t('state')}</summary>
              <p>{t('readOnly')}</p>
              <p>{t('keyboard')}</p>
              <label>
                {t('notes')}
                <textarea
                  className={styles.notes}
                  onChange={event => setNotes(event.target.value)}
                  rows={2}
                  value={notes}
                />
              </label>
              <pre>{JSON.stringify(state, null, 2)}</pre>
            </details>
          </aside>
          <div className="mb-6 flex items-center justify-between gap-3">
            <h1 className="text-2xl font-bold text-secondary-900 dark:text-secondary-100">
              {tn('areas')}
            </h1>
            <button
              className="btn-primary inline-flex items-center gap-1.5"
              onClick={() => previewAction(tc('create'))}
              type="button"
              {...devMarker({
                context: 'areas',
                name: 'prototype action',
                value: 'create',
              })}
            >
              <Plus aria-hidden="true" className="size-4" />
              {tc('create')}
            </button>
          </div>
          <p className={styles.feedback} role="status">
            {lastAction}
          </p>
          {sample === 'live' && loading ? (
            <p role="status">{tc('loading')}</p>
          ) : sample === 'live' && error ? (
            <p role="alert">{error}</p>
          ) : areas.length === 0 ? (
            <div className={`${styles.surface} ${styles.empty}`}>
              <p>{ta('emptyState')}</p>
              <button
                className="btn-primary"
                onClick={() => previewAction(tc('create'))}
                type="button"
              >
                {tc('create')}
              </button>
            </div>
          ) : variant === 'before' ? (
            <div
              className="overflow-hidden rounded-2xl border bg-white/80 shadow-sm backdrop-blur-sm dark:bg-secondary-900/60"
              {...devMarker({
                context: 'areas',
                name: 'prototype table',
                value: 'before',
              })}
            >
              <div className="w-full overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-secondary-50/80 text-left text-secondary-700 dark:bg-secondary-800/30 dark:text-secondary-300">
                      {columns.map(column => (
                        <th className="px-4 py-3 font-medium" key={column.key}>
                          {column.header}
                        </th>
                      ))}
                      <th className="px-4 py-3">
                        <span className="sr-only">{tc('actions')}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {areas.map(area => (
                      <tr
                        className="border-b transition-colors hover:bg-primary-50/40 dark:hover:bg-primary-950/20"
                        data-prototype-row={area.prefix}
                        key={area.id}
                      >
                        {columns.map(column => (
                          <td
                            className={column.className ?? 'py-3 px-4'}
                            data-prototype-description={
                              column.key === 'description' ? '' : undefined
                            }
                            key={column.key}
                          >
                            {column.render(area)}
                          </td>
                        ))}
                        <td className="px-4 py-3 text-right">
                          {actions(area)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : variant === 'A' ? (
            <VariantA {...layoutProps} />
          ) : variant === 'B' ? (
            <VariantB {...layoutProps} />
          ) : (
            <VariantC {...layoutProps} />
          )}
        </div>
      </ListWorkspace>
      <PrototypeSwitcher current={variant} />
    </div>
  )
}

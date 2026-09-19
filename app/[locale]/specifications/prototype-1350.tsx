'use client'

// Throwaway question: which layout and view controls make names and responsibility
// easiest to scan? Existing /specifications route, ?variant=baseline|A|B|C|D.
import {
  Check,
  Info,
  LayoutGrid,
  Pencil,
  Plus,
  Rows2,
  Search,
  Table2,
  Trash2,
  UsersRound,
  X,
} from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import FloatingActionRail from '@/components/FloatingActionRail'
import ListWorkspace from '@/components/ListWorkspace'
import Prototype1350Switcher, {
  type Prototype1350Variant,
  prototype1350Variants,
} from '@/components/Prototype1350Switcher'
import { devMarker } from '@/lib/developer-mode-markers'
import { formatActorDisplayNameForLocale } from '@/lib/privacy/display-name'
import type {
  RequirementsSpecificationsInitialData,
  SpecificationTaxonomyItem,
} from '@/lib/specifications/preload-types'
import {
  prototype1350Examples,
  type PrototypeSpecification as Specification,
} from './prototype-1350.data'
import styles from './prototype-1350.module.css'

const selectableLayouts = ['baseline', 'B', 'C'] as const
type SelectableLayout = (typeof selectableLayouts)[number]

type LayoutProps = {
  rows: Specification[]
  label: (key: string) => string
  name: (row: Specification) => ReactNode
  owner: (row: Specification) => ReactNode
  classifications: (row: Specification) => ReactNode
  actions: (row: Specification) => ReactNode
  taxonomy: (value: SpecificationTaxonomyItem | null) => string
}

export function VariantA(p: LayoutProps) {
  return (
    <div className={styles.scroll}>
      <table className={styles.compact}>
        <colgroup>
          <col />
          <col className={styles.ownerColumn} />
          <col className={styles.classificationColumn} />
          <col className={styles.actionsColumn} />
        </colgroup>
        <thead>
          <tr>
            {['name', 'responsible', 'classifications', 'actions'].map(key => (
              <th key={key}>{p.label(key)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {p.rows.map(row => (
            <tr data-prototype-row={row.id} key={row.id}>
              <td>{p.name(row)}</td>
              <td>{p.owner(row)}</td>
              <td>{p.classifications(row)}</td>
              <td>{p.actions(row)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function VariantB(p: LayoutProps) {
  return (
    <div className={styles.records}>
      {p.rows.map(row => (
        <article
          className={styles.record}
          data-prototype-row={row.id}
          key={row.id}
        >
          <div className={styles.recordMain}>
            <div>{p.name(row)}</div>
            <div>{p.owner(row)}</div>
            <div>{p.actions(row)}</div>
          </div>
          <div className={styles.recordMeta}>
            <div>{p.classifications(row)}</div>
          </div>
        </article>
      ))}
    </div>
  )
}

export function VariantC(p: LayoutProps) {
  return (
    <div className={styles.cards}>
      {p.rows.map(row => (
        <article
          className={styles.card}
          data-prototype-row={row.id}
          key={row.id}
        >
          <div className={styles.cardTitle}>{p.name(row)}</div>
          <div className={styles.cardOwner}>
            <span className={styles.caption}>{p.label('responsible')}</span>
            {p.owner(row)}
          </div>
          {p.classifications(row)}
          <div className={styles.cardFooter}>{p.actions(row)}</div>
        </article>
      ))}
    </div>
  )
}

function Baseline(p: LayoutProps) {
  return (
    <div className={styles.scroll}>
      <table className={styles.baseline}>
        <colgroup>
          <col />
          <col />
          <col />
          <col />
          <col />
          <col style={{ width: 176 }} />
        </colgroup>
        <thead>
          <tr>
            {[
              'name',
              'responsible',
              'governanceObjectType',
              'implementationType',
              'lifecycleStatus',
              'actions',
            ].map(key => (
              <th key={key}>
                {key === 'actions' ? (
                  <span className="sr-only">{p.label(key)}</span>
                ) : (
                  p.label(key)
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {p.rows.map(row => (
            <tr data-prototype-row={row.id} key={row.id}>
              <td>{p.name(row)}</td>
              <td>{p.owner(row)}</td>
              <td>{p.taxonomy(row.governanceObjectType)}</td>
              <td>{p.taxonomy(row.implementationType)}</td>
              <td>{p.taxonomy(row.lifecycleStatus)}</td>
              <td>{p.actions(row)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function Prototype1350({
  initialData,
}: {
  initialData: RequirementsSpecificationsInitialData
}) {
  const locale = useLocale()
  const t = useTranslations('prototype1350')
  const ts = useTranslations('specification')
  const tc = useTranslations('common')
  const tn = useTranslations('nav')
  const query = useSearchParams()
  const rawVariant = query.get('variant')
  const variant = prototype1350Variants.includes(
    rawVariant as Prototype1350Variant,
  )
    ? (rawVariant as Prototype1350Variant)
    : 'A'
  const [selectedLayout, setSelectedLayout] =
    useState<SelectableLayout>('baseline')
  const layout = variant === 'D' ? selectedLayout : variant
  const [source, setSource] = useState('examples')
  const [search, setSearch] = useState('')
  const [lastAction, setLastAction] = useState('')
  const [viewport, setViewport] = useState({ width: 0, height: 0 })
  const [helpOpen, setHelpOpen] = useState(false)
  const surface = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const update = () =>
      setViewport({ width: window.innerWidth, height: window.innerHeight })
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  const allRows =
    source === 'live'
      ? initialData.specifications
      : prototype1350Examples(locale)
  const rows = allRows
    .filter(row =>
      row.name
        .toLocaleLowerCase(locale)
        .includes(search.toLocaleLowerCase(locale)),
    )
    .sort((left, right) =>
      left.name.localeCompare(right.name, locale, { sensitivity: 'base' }),
    )
  const taxonomy = (value: SpecificationTaxonomyItem | null) =>
    value ? (locale === 'sv' ? value.nameSv : value.nameEn) : '—'
  const action = (kind: string, row?: Specification) =>
    setLastAction(
      t('preview', { action: kind, name: row?.name ?? ts('newSpecification') }),
    )
  const label = (key: string) =>
    key === 'classifications' || key === 'actions' ? t(key) : ts(key)
  const rowTools: LayoutProps = {
    rows,
    label,
    taxonomy,
    name: row => (
      <button
        className={styles.name}
        data-prototype-name
        onClick={() => action(t('open'), row)}
        type="button"
      >
        {row.name}
      </button>
    ),
    owner: row => (
      <div className={styles.owner} data-prototype-owner>
        {row.responsibleDisplayName && (
          <div className={styles.person}>
            {formatActorDisplayNameForLocale(
              row.responsibleDisplayName,
              locale,
            )}
          </div>
        )}
        <div
          className={styles.hsa}
          data-prototype-hsa
          // biome-ignore lint/a11y/noNoninteractiveTabindex: Focus enables keyboard scrolling of long identifiers.
          tabIndex={0}
          title={row.responsibleHsaId}
        >
          {row.responsibleHsaId}
        </div>
      </div>
    ),
    classifications: row => (
      <dl className={styles.classifications}>
        {(
          [
            ['governanceObjectType', row.governanceObjectType],
            ['implementationType', row.implementationType],
            ['lifecycleStatus', row.lifecycleStatus],
          ] as const
        ).map(([key, value]) => (
          <div key={key}>
            <dt>{ts(key)}</dt>
            <dd>{taxonomy(value)}</dd>
          </div>
        ))}
      </dl>
    ),
    actions: row => (
      <div className={styles.actions}>
        {(
          [
            [
              row.permissions?.canManageAssignments ?? false,
              ts('manageCoAuthors'),
              UsersRound,
            ],
            [row.permissions?.canEditContent ?? true, tc('edit'), Pencil],
            [row.permissions?.canEditContent ?? true, tc('delete'), Trash2],
          ] as const
        ).map(([allowed, name, Icon], index) =>
          allowed ? (
            <button
              aria-label={`${name}: ${row.name}`}
              className={`${styles.iconButton} ${index === 2 ? styles.danger : ''}`}
              key={name}
              onClick={() => action(name, row)}
              title={name}
              type="button"
              {...devMarker({
                context: 'prototype 1350',
                name: 'table action',
                value: name,
              })}
            >
              <Icon aria-hidden="true" size={15} />
            </button>
          ) : (
            <span className={styles.actionSpace} key={name} />
          ),
        )}
      </div>
    ),
  }
  return (
    <div
      className={`section-padding ${styles.prototype}`}
      data-prototype-layout={layout}
      data-prototype-variant={variant}
      {...devMarker({
        context: 'prototype 1350',
        name: 'layout comparison',
        value: variant,
      })}
    >
      <ListWorkspace context="prototype 1350" reserveActions>
        <aside className={styles.review}>
          <div className={styles.reviewTitle}>
            <span className={styles.tag}>{t('throwaway')}</span>
            <strong>#1350 · {t(`variants.${variant}.name`)}</strong>
          </div>
          <p>{t(`variants.${variant}.description`)}</p>
          <div className={styles.reviewControls}>
            <label>
              {t('data')}{' '}
              <select
                onChange={event => {
                  setSource(event.target.value)
                }}
                value={source}
              >
                <option value="examples">{t('examples')}</option>
                <option value="live">{t('live')}</option>
              </select>
            </label>
            <span>
              {viewport.width} × {viewport.height} ·{' '}
              {t('visibleRows', { count: rows.length })}
            </span>
            <details>
              <summary>{t('state')}</summary>
              <pre>
                {JSON.stringify(
                  {
                    variant,
                    layout,
                    source,
                    search,
                    sort: 'name ascending',
                    visibleIds: rows.map(row => row.id),
                    viewport,
                    lastAction,
                  },
                  null,
                  2,
                )}
              </pre>
            </details>
          </div>
          <details className={styles.guide}>
            <summary>{t('reviewGuide')}</summary>
            <ol>
              {[
                'names',
                'sorting',
                ...(variant === 'D' ? ['viewSwitching'] : []),
                'identity',
                'classification',
                'actions',
                'header',
                'responsive',
              ].map(key => (
                <li key={key}>
                  <strong>{t(`checks.${key}.title`)}</strong> —{' '}
                  {t(`checks.${key}.verify`)}
                </li>
              ))}
            </ol>
            <p>{t('tradeoff')}</p>
          </details>
        </aside>
        {initialData.errors.length > 0 && source === 'live' && (
          <p role="status">{ts('partialDataLoadWarning')}</p>
        )}
        <div
          className={
            variant === 'baseline' ? styles.baselineToolbar : styles.toolbar
          }
        >
          {variant === 'D' ? (
            <div className={styles.titleGroup}>
              <h1>{tn('specifications')}</h1>
              <fieldset
                aria-label={t('viewSwitcher')}
                className={styles.viewSwitcher}
                data-prototype-view-switcher
                {...devMarker({
                  context: 'prototype 1350',
                  name: 'view switcher',
                  value: selectedLayout,
                })}
                onKeyDown={event => {
                  if (
                    !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(
                      event.key,
                    )
                  )
                    return
                  event.preventDefault()
                  const index = selectableLayouts.indexOf(selectedLayout)
                  const next =
                    event.key === 'Home'
                      ? 'baseline'
                      : event.key === 'End'
                        ? 'C'
                        : selectableLayouts[
                            (index + (event.key === 'ArrowLeft' ? 2 : 1)) % 3
                          ]
                  setSelectedLayout(next)
                  event.currentTarget
                    .querySelector<HTMLButtonElement>(`[data-layout="${next}"]`)
                    ?.focus()
                }}
              >
                {selectableLayouts.map(key => {
                  const Icon =
                    key === 'baseline'
                      ? Table2
                      : key === 'B'
                        ? Rows2
                        : LayoutGrid
                  const selected = selectedLayout === key
                  return (
                    <button
                      aria-label={t(`views.${key}`)}
                      aria-pressed={selected}
                      className={`${styles.viewButton} ${selected ? styles.viewSelected : ''}`}
                      data-layout={key}
                      key={key}
                      onClick={() => setSelectedLayout(key)}
                      tabIndex={selected ? 0 : -1}
                      title={t(`views.${key}`)}
                      type="button"
                    >
                      <Icon aria-hidden="true" size={18} />
                      {selected && (
                        <Check
                          aria-hidden="true"
                          className={styles.viewCheck}
                          size={10}
                        />
                      )}
                    </button>
                  )
                })}
              </fieldset>
            </div>
          ) : (
            <h1>{tn('specifications')}</h1>
          )}
          <div className={styles.searchGroup}>
            <label htmlFor="prototype-name-filter">{ts('filterByName')}</label>
            <div className={styles.searchRow}>
              <Search aria-hidden="true" size={16} />
              <input
                id="prototype-name-filter"
                onChange={event => setSearch(event.target.value)}
                placeholder={ts('filterByNamePlaceholder')}
                type="search"
                value={search}
              />
              <button
                aria-expanded={helpOpen}
                aria-label={t('filterHelp')}
                className={styles.iconButton}
                onClick={() => setHelpOpen(!helpOpen)}
                type="button"
              >
                <Info aria-hidden="true" size={16} />
              </button>
              {search && (
                <button
                  aria-label={tc('clearSearch')}
                  className={styles.iconButton}
                  onClick={() => setSearch('')}
                  type="button"
                >
                  <X aria-hidden="true" size={16} />
                </button>
              )}
            </div>
            {helpOpen && <p>{t('filterHelpText')}</p>}
          </div>
        </div>
        <div className={styles.surface} ref={surface}>
          {layout === 'baseline' ? (
            <Baseline {...rowTools} />
          ) : layout === 'A' ? (
            <VariantA {...rowTools} />
          ) : layout === 'B' ? (
            <VariantB {...rowTools} />
          ) : (
            <VariantC {...rowTools} />
          )}
          {!rows.length && <p className={styles.empty}>{t('empty')}</p>}
        </div>
        <FloatingActionRail
          anchorRef={surface}
          developerModeContext="prototype 1350"
          items={[
            {
              id: 'create',
              ariaLabel: ts('newSpecification'),
              icon: <Plus aria-hidden="true" size={20} />,
              onClick: () => action(ts('newSpecification')),
              variant: 'primary',
              hidden:
                source === 'live' &&
                !initialData.collectionPermissions?.canCreateSpecification,
            },
          ]}
        />
        <p className={styles.preview} role="status">
          {lastAction || t('noWrites')}
        </p>
        <Prototype1350Switcher current={variant} />
      </ListWorkspace>
    </div>
  )
}

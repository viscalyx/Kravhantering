'use client'

// THROWAWAY: alternative presentations sharing the real panel's in-memory edits.
import {
  ArrowDown,
  ArrowUp,
  Check,
  LockKeyhole,
  RotateCcw,
  Save,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import DirtyStateButton from '@/components/DirtyStateButton'
import { devMarker } from '@/lib/developer-mode-markers'
import styles from './admin-layout-prototype.module.css'

export interface PrototypeColumnRow {
  id: string
  keyLabel: string
  label: string
  locked: boolean
  visible: boolean
}
interface Props {
  dirty: boolean
  move: (id: string, direction: -1 | 1) => void
  reset: () => void
  rows: PrototypeColumnRow[]
  save: () => void
  saved: boolean
  toggle: (id: string) => void
}
function Title() {
  const t = useTranslations('admin')
  return (
    <div>
      <h2 className={styles.panelTitle}>{t('columns')}</h2>
      <p className={styles.panelDescription}>{t('columnsDescription')}</p>
    </div>
  )
}
function Actions({ dirty, saved, save, reset }: Props) {
  const t = useTranslations('common')
  const p = useTranslations('adminLayoutPrototype')
  return (
    <div className={styles.actions}>
      {saved && (
        <span className={styles.saved} role="status">
          <Check aria-hidden="true" size={14} />
          {p('savedLocally')}
        </span>
      )}
      <button className={styles.secondaryButton} onClick={reset} type="button">
        <RotateCcw aria-hidden="true" size={14} />
        {t('resetToDefault')}
      </button>
      <DirtyStateButton
        className={styles.saveButton}
        dirty={dirty}
        onClick={save}
        type="button"
      >
        <Save aria-hidden="true" size={14} />
        {t('save')}
      </DirtyStateButton>
    </div>
  )
}
function Name({ row }: { row: PrototypeColumnRow }) {
  return (
    <div className={styles.name}>
      <span>{row.label}</span>
      <span className={styles.key}>{row.keyLabel}</span>
    </div>
  )
}
function Order({
  row,
  index,
  props,
}: {
  row: PrototypeColumnRow
  index: number
  props: Props
}) {
  const t = useTranslations('admin')
  return (
    <div className={styles.order}>
      <button
        aria-label={`${t('moveUp')}: ${row.label}`}
        className={styles.orderButton}
        disabled={index === 0}
        onClick={() => props.move(row.id, -1)}
        type="button"
      >
        <ArrowUp aria-hidden="true" size={15} />
      </button>
      <button
        aria-label={`${t('moveDown')}: ${row.label}`}
        className={styles.orderButton}
        disabled={index === props.rows.length - 1}
        onClick={() => props.move(row.id, 1)}
        type="button"
      >
        <ArrowDown aria-hidden="true" size={15} />
      </button>
    </div>
  )
}
function Visibility({ row, props }: { row: PrototypeColumnRow; props: Props }) {
  const t = useTranslations('admin')
  return (
    <label className={styles.visibility}>
      <input
        aria-label={`${t('defaultVisible')}: ${row.label}`}
        checked={row.visible}
        disabled={row.locked}
        onChange={() => props.toggle(row.id)}
        type="checkbox"
      />
      <span>
        {t('defaultVisible')}
        {row.locked && (
          <span className={styles.lock}>
            <LockKeyhole aria-hidden="true" size={12} />
            {t('locked')}
          </span>
        )}
      </span>
    </label>
  )
}
function Panel({ children }: { children: React.ReactNode }) {
  return (
    <section
      aria-labelledby="columns-tab"
      className={styles.panel}
      id="columns-panel"
      role="tabpanel"
      {...devMarker({
        name: 'tab panel',
        value: 'columns prototype',
        context: 'admin center',
      })}
    >
      {children}
    </section>
  )
}
export function VariantA(props: Props) {
  return (
    <Panel>
      <div className={styles.toolbar}>
        <Title />
        <Actions {...props} />
      </div>
      <div className={styles.rows}>
        {props.rows.map((row, index) => (
          <article
            className={styles.row}
            data-testid={`admin-column-row-${row.id}`}
            key={row.id}
            {...devMarker({
              name: 'column settings row',
              value: row.id,
              context: 'prototype compact rows',
            })}
          >
            <Name row={row} />
            <Order index={index} props={props} row={row} />
            <Visibility props={props} row={row} />
          </article>
        ))}
      </div>
    </Panel>
  )
}
export function VariantB(props: Props) {
  const p = useTranslations('adminLayoutPrototype')
  return (
    <Panel>
      <div className={styles.toolbar}>
        <Title />
        <span className={styles.count}>
          {p('columnCount', { count: props.rows.length })}
        </span>
      </div>
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">{p('column')}</th>
              <th scope="col">{p('order')}</th>
              <th scope="col">{p('visibility')}</th>
            </tr>
          </thead>
          <tbody>
            {props.rows.map((row, index) => (
              <tr
                data-testid={`admin-column-row-${row.id}`}
                key={row.id}
                {...devMarker({
                  name: 'column settings row',
                  value: row.id,
                  context: 'prototype settings table',
                })}
              >
                <td className={styles.number}>{index + 1}</td>
                <td>
                  <Name row={row} />
                </td>
                <td>
                  <Order index={index} props={props} row={row} />
                </td>
                <td>
                  <Visibility props={props} row={row} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={styles.tableActions} data-prototype-actions="true">
        <p className={styles.panelDescription}>
          {p('changesPending', {
            count: props.rows.filter(row => row.visible).length,
          })}
        </p>
        <Actions {...props} />
      </div>
    </Panel>
  )
}
export function VariantC(props: Props) {
  const p = useTranslations('adminLayoutPrototype')
  return (
    <Panel>
      <div className={styles.split}>
        <div className={styles.side}>
          <Title />
          <div className={styles.summary}>
            <strong>
              {props.rows.filter(row => row.visible).length}
              <span> / {props.rows.length}</span>
            </strong>
            <p>{p('visibleColumns')}</p>
          </div>
          <Actions {...props} />
        </div>
        <div className={styles.rows}>
          {props.rows.map((row, index) => (
            <article
              className={styles.splitRow}
              data-testid={`admin-column-row-${row.id}`}
              key={row.id}
              {...devMarker({
                name: 'column settings row',
                value: row.id,
                context: 'prototype split workspace',
              })}
            >
              <span className={styles.number}>
                {String(index + 1).padStart(2, '0')}
              </span>
              <Name row={row} />
              <Order index={index} props={props} row={row} />
              <Visibility props={props} row={row} />
            </article>
          ))}
        </div>
      </div>
    </Panel>
  )
}

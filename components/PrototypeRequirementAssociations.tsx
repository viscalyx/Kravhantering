'use client'

import { Info, Pencil, Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useLayoutEffect, useRef, useState } from 'react'
import FieldHelpButton from '@/components/FieldHelpButton'
import FormModal from '@/components/FormModal'
import PrototypeAssociationCreateModal, {
  type PrototypeAssociationDraft,
} from '@/components/PrototypeAssociationCreateModal'
import RequirementPackagePurposeTooltip from '@/components/RequirementPackagePurposeTooltip'
import StatusBadge from '@/components/StatusBadge'
import type {
  NormReferenceOption,
  RequirementPackageOption,
} from '@/hooks/useTaxonomyOptions'
import { devMarker } from '@/lib/developer-mode-markers'
import { ARRAY_INPUT_MAX_ITEMS } from '@/lib/http/validation-constants'

interface Props {
  compact?: boolean
  disabled?: boolean
  kind: 'packages' | 'norms'
  modal?: boolean
  norms: NormReferenceOption[]
  onChange: (ids: number[]) => void
  onCreate?: (item: PrototypeAssociationDraft) => number
  packages: RequirementPackageOption[]
  selected: number[]
  table?: boolean
}

/** Throwaway #1349: visible purpose and an optional draft/apply modal picker. */
export default function PrototypeRequirementAssociations({
  kind,
  compact = false,
  modal = false,
  table = false,
  packages,
  norms,
  selected,
  disabled = false,
  onChange,
  onCreate,
}: Props) {
  const t = useTranslations('prototype1349')
  const tr = useTranslations('requirement')
  const tc = useTranslations('common')
  const isPackage = kind === 'packages'
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<number[]>([])
  const [selectedOnOpen, setSelectedOnOpen] = useState<number[]>([])
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [createdThisOpen, setCreatedThisOpen] = useState<number[]>([])
  const createRef = useRef<HTMLButtonElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  const [help, setHelp] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  // Keep the parent dialog visible, but only expose the top dialog to input/AT.
  useLayoutEffect(() => {
    if (!creating) return
    const dialog = pickerRef.current?.closest<HTMLElement>('[role="dialog"]')
    if (!dialog) return
    dialog.inert = true
    dialog.setAttribute('aria-hidden', 'true')
    dialog.setAttribute('aria-modal', 'false')
    return () => {
      dialog.inert = false
      dialog.removeAttribute('aria-hidden')
      dialog.setAttribute('aria-modal', 'true')
    }
  }, [creating])
  const ids = modal ? draft : selected
  const items = isPackage
    ? packages.map(item => ({
        ...item,
        reference: '',
        purpose: item.purposeAndScope?.trim() ?? '',
      }))
    : norms.map(item => ({
        ...item,
        reference: item.normReferenceId,
        purpose: '',
      }))
  const visible = items.filter(
    item =>
      (!item.isArchived ||
        ids.includes(item.id) ||
        (table && selectedOnOpen.includes(item.id))) &&
      `${item.name} ${item.reference} ${item.purpose}`
        .toLocaleLowerCase()
        .includes(modal ? query.toLocaleLowerCase() : ''),
  )
  const hiddenCreated = items.filter(
    item =>
      createdThisOpen.includes(item.id) &&
      draft.includes(item.id) &&
      !visible.some(row => row.id === item.id),
  )
  const upperIds = [...selectedOnOpen, ...createdThisOpen]
  const groups = [
    ...(upperIds.length > 0
      ? [
          {
            key: 'previous',
            label: t('selectedOnOpen'),
            items: [
              ...visible.filter(item => selectedOnOpen.includes(item.id)),
              ...createdThisOpen.flatMap(id =>
                visible.filter(item => item.id === id),
              ),
            ],
          },
        ]
      : []),
    {
      key: 'other',
      label: t('otherOptions'),
      items: visible.filter(item => !upperIds.includes(item.id)),
    },
  ]
  const title = tr(isPackage ? 'requirementPackage' : 'normReferences')
  const close = () => setOpen(false)
  const toggle = (id: number, checked: boolean) => {
    const next = checked ? [...ids, id] : ids.filter(value => value !== id)
    if (modal) setDraft(next)
    else onChange(next)
  }
  const checkbox = (item: (typeof items)[number]) => (
    <input
      aria-describedby={
        isPackage
          ? `prototype-${kind}-${modal ? 'modal' : 'inline'}-${item.id}-purpose`
          : undefined
      }
      aria-label={`${item.reference ? `${item.reference} ` : ''}${item.name}`}
      checked={ids.includes(item.id)}
      disabled={
        disabled ||
        (!ids.includes(item.id) &&
          (Boolean(item.isArchived) || ids.length >= ARRAY_INPUT_MAX_ITEMS))
      }
      id={`prototype-${kind}-${item.id}-checkbox`}
      onChange={event => toggle(item.id, event.target.checked)}
      type="checkbox"
    />
  )
  const choices = (
    <>
      {isPackage && !table && (
        <p className="prototype-1349-purpose-guidance">
          {t('purposeGuidance')}
        </p>
      )}
      {table ? (
        <table
          aria-label={title}
          className="prototype-1349-picker-table"
          {...devMarker({ name: 'prototype association table', value: kind })}
        >
          <colgroup>
            <col className="prototype-1349-table-check" />
            <col className="prototype-1349-table-primary" />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">{t('tableSelect')}</span>
              </th>
              <th scope="col">
                {t(isPackage ? 'tablePackageName' : 'tableReferenceId')}
              </th>
              <th scope="col">
                {t(isPackage ? 'tablePurpose' : 'tableNormName')}
              </th>
            </tr>
          </thead>
          {groups.map(group => (
            <tbody
              aria-labelledby={`prototype-${kind}-${group.key}-heading`}
              key={group.key}
              {...devMarker({
                name: 'prototype selection group',
                value: `${kind} ${group.key}`,
              })}
            >
              <tr>
                <td className="prototype-1349-group-heading" colSpan={3}>
                  <h3 id={`prototype-${kind}-${group.key}-heading`}>
                    {group.label}
                  </h3>
                </td>
              </tr>
              {group.items.map(item => (
                <tr key={item.id}>
                  <td>{checkbox(item)}</td>
                  <td>
                    <label
                      className={
                        isPackage
                          ? undefined
                          : 'font-mono text-xs text-secondary-500 dark:text-secondary-400'
                      }
                      htmlFor={`prototype-${kind}-${item.id}-checkbox`}
                    >
                      {isPackage ? item.name : item.reference}
                      {isPackage && item.isArchived
                        ? ` (${t('archived')})`
                        : ''}
                    </label>
                  </td>
                  <td>
                    {isPackage ? (
                      <p
                        className="prototype-1349-table-purpose"
                        id={`prototype-${kind}-modal-${item.id}-purpose`}
                      >
                        {item.purpose || t('missingPurpose')}
                      </p>
                    ) : (
                      <label htmlFor={`prototype-${kind}-${item.id}-checkbox`}>
                        {item.name}
                        {item.isArchived ? ` (${t('archived')})` : ''}
                      </label>
                    )}
                  </td>
                </tr>
              ))}
              {group.items.length === 0 && (
                <tr>
                  <td colSpan={3}>{t('noMatches')}</td>
                </tr>
              )}
            </tbody>
          ))}
        </table>
      ) : (
        visible.map(item => (
          <div className="prototype-1349-choice" key={item.id}>
            <label
              className="prototype-1349-choice-name"
              htmlFor={`prototype-${kind}-${item.id}-checkbox`}
            >
              {checkbox(item)}
              <span>
                {item.reference && (
                  <span className="font-mono text-xs text-secondary-500 dark:text-secondary-400">
                    {item.reference}{' '}
                  </span>
                )}
                {item.name}
                {item.isArchived ? ` (${t('archived')})` : ''}
              </span>
            </label>
            {isPackage && (
              <div
                className="prototype-1349-purpose"
                id={`prototype-${kind}-${modal ? 'modal' : 'inline'}-${item.id}-purpose`}
              >
                <p>{item.purpose || t('missingPurpose')}</p>
              </div>
            )}
          </div>
        ))
      )}
      {!table && visible.length === 0 && <p>{t('noMatches')}</p>}
      {ids.length >= ARRAY_INPUT_MAX_ITEMS && (
        <p role="status">
          {tr('associationSelectionLimit', { limit: ARRAY_INPUT_MAX_ITEMS })}
        </p>
      )}
    </>
  )

  const triggerLabel = t(
    table
      ? isPackage
        ? 'choosePackages'
        : 'selectNorm'
      : isPackage
        ? 'addPackages'
        : 'addNorms',
  )
  const trigger = (
    <button
      aria-expanded={open}
      aria-haspopup="dialog"
      aria-label={compact ? triggerLabel : undefined}
      className={
        compact ? 'prototype-1349-compact-trigger' : 'prototype-1349-button'
      }
      disabled={disabled}
      onClick={() => {
        setDraft([...selected])
        setSelectedOnOpen([...selected])
        setQuery('')
        setCreatedThisOpen([])
        setOpen(true)
      }}
      ref={triggerRef}
      title={compact ? triggerLabel : undefined}
      type="button"
      {...devMarker({ name: 'prototype selection trigger', value: kind })}
    >
      {compact ? (
        <>
          <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
          <span>{t('applySelection')}</span>
        </>
      ) : (
        triggerLabel
      )}
    </button>
  )

  return (
    <fieldset
      className={`prototype-1349-association-fieldset${compact ? ' prototype-1349-association-compact' : ''}`}
      {...devMarker({
        name: 'prototype association selection',
        value: `${kind} ${modal ? 'modal' : 'inline'}`,
      })}
    >
      <div className="prototype-1349-association-heading">
        <legend className="contents">{title}</legend>
        <FieldHelpButton
          controls={`prototype-${kind}-help`}
          expanded={help}
          label={t('helpFor', { name: title })}
          onClick={() => setHelp(!help)}
        />
        {compact && trigger}
      </div>
      {help && (
        <p
          className="prototype-1349-purpose-guidance"
          id={`prototype-${kind}-help`}
        >
          {isPackage ? t('purposeGuidance') : t('normGuidance')}
        </p>
      )}
      {modal ? (
        <div className="prototype-1349-summary">
          {!compact && trigger}
          {!compact && (
            <p className="prototype-1349-selection-count" role="status">
              {t('selectedCount', { count: selected.length })}
            </p>
          )}
          <div className="prototype-1349-badges">
            {items
              .filter(item => selected.includes(item.id))
              .map(item => {
                const badge = (
                  <span
                    className="prototype-1349-selection-badge"
                    key={item.id}
                  >
                    <StatusBadge
                      className="prototype-1349-badge-text"
                      color={null}
                      iconName={isPackage ? 'Package' : 'BookOpen'}
                      label={
                        item.reference
                          ? table
                            ? item.reference
                            : `${item.reference} ${item.name}`
                          : item.name
                      }
                    />
                    <button
                      aria-label={t('removeSelection', { name: item.name })}
                      onClick={() =>
                        onChange(selected.filter(id => id !== item.id))
                      }
                      type="button"
                    >
                      ×
                    </button>
                  </span>
                )
                return isPackage || table ? (
                  <RequirementPackagePurposeTooltip
                    key={item.id}
                    purposeAndScope={
                      isPackage
                        ? item.purpose || t('missingPurpose')
                        : item.name
                    }
                    wrapperClassName="inline-flex min-w-0"
                  >
                    {badge}
                  </RequirementPackagePurposeTooltip>
                ) : (
                  <span className="inline-flex min-w-0" key={item.id}>
                    {badge}
                  </span>
                )
              })}
          </div>
          {selected.length === 0 && (
            <p className="prototype-1349-empty">{t('noSelection')}</p>
          )}
        </div>
      ) : (
        <div className="prototype-1349-association-list">{choices}</div>
      )}
      <FormModal
        closeDisabled={creating}
        developerModeValue={`prototype ${kind} picker`}
        initialFocusRef={searchRef}
        maxWidthClassName="max-w-3xl"
        onClose={close}
        open={open && modal}
        returnFocusRef={triggerRef}
        title={t(isPackage ? 'choosePackages' : 'chooseNorms')}
        titleId={`prototype-${kind}-title`}
      >
        <div
          className="prototype-1349-picker"
          ref={pickerRef}
          {...devMarker({ name: 'prototype modal draft', value: kind })}
        >
          {isPackage && table && (
            <p className="prototype-1349-purpose-guidance">
              {t('purposeGuidance')}
            </p>
          )}
          <div className="prototype-1349-picker-toolbar">
            <div className="min-w-0 flex-1">
              <label htmlFor={`prototype-${kind}-search`}>
                {t('searchAssociations')}
              </label>
              <input
                id={`prototype-${kind}-search`}
                onChange={event => setQuery(event.target.value)}
                ref={searchRef}
                type="search"
                value={query}
              />
            </div>
            {compact && onCreate && (
              <button
                className="prototype-1349-button inline-flex items-center justify-center gap-1.5"
                disabled={draft.length >= ARRAY_INPUT_MAX_ITEMS}
                onClick={() => setCreating(true)}
                ref={createRef}
                type="button"
                {...devMarker({
                  name: 'prototype create association trigger',
                  value: kind,
                })}
              >
                <Plus aria-hidden="true" className="h-4 w-4" />
                {t(isPackage ? 'createPackage' : 'createNorm')}
              </button>
            )}
          </div>
          {hiddenCreated.length > 0 && (
            <div
              className="mb-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
              role="status"
              {...devMarker({
                name: 'prototype hidden created items notice',
                value: kind,
              })}
            >
              <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0 space-y-1 wrap-break-word">
                {hiddenCreated.map(item => (
                  <p key={item.id}>
                    {t(
                      isPackage ? 'hiddenCreatedPackage' : 'hiddenCreatedNorm',
                      {
                        name: item.reference
                          ? `${item.reference} — ${item.name}`
                          : item.name,
                      },
                    )}
                  </p>
                ))}
              </div>
            </div>
          )}
          <div className="prototype-1349-picker-list">{choices}</div>
          <div className="prototype-1349-picker-footer">
            <p role="status">{t('draftCount', { count: draft.length })}</p>
            <button
              className="prototype-1349-button"
              onClick={close}
              type="button"
            >
              {tc('cancel')}
            </button>
            <button
              className="btn-primary"
              onClick={() => {
                onChange(draft)
                close()
              }}
              type="button"
            >
              {t('applySelection')}
            </button>
          </div>
        </div>
      </FormModal>
      {creating && onCreate && (
        <PrototypeAssociationCreateModal
          kind={kind}
          normIds={norms.map(item => item.normReferenceId)}
          onClose={() => setCreating(false)}
          onCreate={item => {
            const id = onCreate(item)
            setDraft(current => [...current, id])
            setCreatedThisOpen(current => [...current, id])
            setCreating(false)
          }}
          returnFocusRef={createRef}
        />
      )}
    </fieldset>
  )
}

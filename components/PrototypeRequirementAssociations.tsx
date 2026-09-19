'use client'

import { useTranslations } from 'next-intl'
import { useRef, useState } from 'react'
import FieldHelpButton from '@/components/FieldHelpButton'
import FormModal from '@/components/FormModal'
import RequirementPackagePurposeTooltip from '@/components/RequirementPackagePurposeTooltip'
import StatusBadge from '@/components/StatusBadge'
import type {
  NormReferenceOption,
  RequirementPackageOption,
} from '@/hooks/useTaxonomyOptions'
import { devMarker } from '@/lib/developer-mode-markers'
import { ARRAY_INPUT_MAX_ITEMS } from '@/lib/http/validation-constants'

interface Props {
  disabled?: boolean
  kind: 'packages' | 'norms'
  modal?: boolean
  norms: NormReferenceOption[]
  onChange: (ids: number[]) => void
  packages: RequirementPackageOption[]
  selected: number[]
}

/** Throwaway #1349: visible purpose and an optional draft/apply modal picker. */
export default function PrototypeRequirementAssociations({
  kind,
  modal = false,
  packages,
  norms,
  selected,
  disabled = false,
  onChange,
}: Props) {
  const t = useTranslations('prototype1349')
  const tr = useTranslations('requirement')
  const tc = useTranslations('common')
  const isPackage = kind === 'packages'
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<number[]>([])
  const [query, setQuery] = useState('')
  const [help, setHelp] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
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
      (!item.isArchived || ids.includes(item.id)) &&
      `${item.name} ${item.reference} ${item.purpose}`
        .toLocaleLowerCase()
        .includes(modal ? query.toLocaleLowerCase() : ''),
  )
  const title = tr(isPackage ? 'requirementPackage' : 'normReferences')
  const close = () => setOpen(false)
  const toggle = (id: number, checked: boolean) => {
    const next = checked ? [...ids, id] : ids.filter(value => value !== id)
    if (modal) setDraft(next)
    else onChange(next)
  }
  const choices = (
    <>
      {isPackage && (
        <p className="prototype-1349-purpose-guidance">
          {t('purposeGuidance')}
        </p>
      )}
      {visible.map(item => (
        <div className="prototype-1349-choice" key={item.id}>
          <label className="prototype-1349-choice-name">
            <input
              aria-describedby={
                isPackage
                  ? `prototype-${kind}-${modal ? 'modal' : 'inline'}-${item.id}-purpose`
                  : undefined
              }
              checked={ids.includes(item.id)}
              disabled={
                disabled ||
                (!ids.includes(item.id) &&
                  (Boolean(item.isArchived) ||
                    ids.length >= ARRAY_INPUT_MAX_ITEMS))
              }
              onChange={event => toggle(item.id, event.target.checked)}
              type="checkbox"
            />
            <span>
              {item.reference && (
                <span className="font-mono text-xs">{item.reference} </span>
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
      ))}
      {visible.length === 0 && <p>{t('noMatches')}</p>}
      {ids.length >= ARRAY_INPUT_MAX_ITEMS && (
        <p role="status">
          {tr('associationSelectionLimit', { limit: ARRAY_INPUT_MAX_ITEMS })}
        </p>
      )}
    </>
  )

  return (
    <fieldset
      className="prototype-1349-association-fieldset"
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
          <button
            className="prototype-1349-button"
            disabled={disabled}
            onClick={() => {
              setDraft([...selected])
              setQuery('')
              setOpen(true)
            }}
            ref={triggerRef}
            type="button"
          >
            {t(isPackage ? 'addPackages' : 'addNorms')}
          </button>
          <p className="prototype-1349-selection-count" role="status">
            {t('selectedCount', { count: selected.length })}
          </p>
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
                          ? `${item.reference} ${item.name}`
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
                return isPackage ? (
                  <RequirementPackagePurposeTooltip
                    key={item.id}
                    purposeAndScope={item.purpose || t('missingPurpose')}
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
          {...devMarker({ name: 'prototype modal draft', value: kind })}
        >
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
    </fieldset>
  )
}

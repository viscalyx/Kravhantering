'use client'

import { CircleAlert, Info, Pencil, Plus, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { type RefObject, useLayoutEffect, useRef, useState } from 'react'
import AnimatedHelpPanel from '@/components/AnimatedHelpPanel'
import FieldHelpButton from '@/components/FieldHelpButton'
import FieldLabelWithHelp from '@/components/FieldLabelWithHelp'
import FormModal from '@/components/FormModal'
import RequirementAssociationCreateModal from '@/components/RequirementAssociationCreateModal'
import RequirementPackagePurposeTooltip from '@/components/RequirementPackagePurposeTooltip'
import StatusBadge from '@/components/StatusBadge'
import type {
  NormReferenceOption,
  RequirementPackageOption,
} from '@/hooks/useTaxonomyOptions'
import { devMarker } from '@/lib/developer-mode-markers'
import { ARRAY_INPUT_MAX_ITEMS } from '@/lib/http/validation-constants'

interface RequirementAssociationPickerProps {
  disabled: boolean
  idPrefix: string
  items: (RequirementPackageOption | NormReferenceOption)[]
  kind: 'packages' | 'norms'
  onChange: (ids: number[]) => void
  onCreated?: (item: RequirementPackageOption | NormReferenceOption) => void
  selected: number[]
  statusId: string
}

const buttonClassName =
  'min-h-6 min-w-6 rounded-lg border px-3 py-2 text-sm hover:bg-secondary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-50 dark:hover:bg-secondary-800'
const cellClassName =
  'border-b border-secondary-200 px-2 py-3 text-left align-top wrap-anywhere dark:border-secondary-700'

/** Keep a containing dialog visible while only its nested dialog accepts input. */
function useInertDialog(
  active: boolean,
  contentRef: RefObject<HTMLElement | null>,
) {
  useLayoutEffect(() => {
    if (!active) return
    const dialog = contentRef.current?.closest<HTMLElement>('[role="dialog"]')
    if (!dialog) return
    const wasInert = dialog.inert
    const hidden = dialog.getAttribute('aria-hidden')
    const modal = dialog.getAttribute('aria-modal')
    dialog.inert = true
    dialog.setAttribute('aria-hidden', 'true')
    dialog.setAttribute('aria-modal', 'false')
    return () => {
      dialog.inert = wasInert
      if (hidden === null) dialog.removeAttribute('aria-hidden')
      else dialog.setAttribute('aria-hidden', hidden)
      if (modal === null) dialog.removeAttribute('aria-modal')
      else dialog.setAttribute('aria-modal', modal)
    }
  }, [active, contentRef])
}

export default function RequirementAssociationPicker({
  onCreated,
  disabled,
  idPrefix,
  items,
  kind,
  onChange,
  selected,
  statusId,
}: RequirementAssociationPickerProps) {
  const t = useTranslations('requirementAssociations')
  const tr = useTranslations('requirement')
  const tc = useTranslations('common')
  const isPackage = kind === 'packages'
  const [open, setOpen] = useState(false)
  const [help, setHelp] = useState(false)
  const [draft, setDraft] = useState<number[]>([])
  const [selectedOnOpen, setSelectedOnOpen] = useState<number[]>([])
  const [creating, setCreating] = useState(false)
  const [createdThisOpen, setCreatedThisOpen] = useState<number[]>([])
  const pickerRef = useRef<HTMLDivElement>(null)
  const createRef = useRef<HTMLButtonElement>(null)
  const [query, setQuery] = useState('')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  useInertDialog(creating, pickerRef)
  useInertDialog(open, triggerRef)
  const title = tr(isPackage ? 'requirementPackage' : 'normReferences')
  const rows = items.map(item => ({
    ...item,
    reference: 'normReferenceId' in item ? item.normReferenceId : '',
    purpose:
      'purposeAndScope' in item ? (item.purposeAndScope?.trim() ?? '') : '',
  }))
  const visible = rows.filter(
    item =>
      (!item.isArchived || selectedOnOpen.includes(item.id)) &&
      `${item.name} ${item.reference} ${item.purpose}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
  )
  const upperIds = [...selectedOnOpen, ...createdThisOpen]
  const hiddenCreated = rows.filter(
    item =>
      createdThisOpen.includes(item.id) &&
      draft.includes(item.id) &&
      !visible.some(row => row.id === item.id),
  )
  const groups = [
    ...(upperIds.length
      ? [
          {
            key: 'selected',
            label: t('selectedOnOpen'),
            items: upperIds.flatMap(id =>
              visible.filter(item => item.id === id),
            ),
          },
        ]
      : []),
    {
      key: 'available',
      label: t('otherOptions'),
      items: visible.filter(item => !upperIds.includes(item.id)),
    },
  ]
  const limitReached = (open ? draft : selected).length >= ARRAY_INPUT_MAX_ITEMS
  const limitId = `${idPrefix}-selection-limit`
  const close = () => setOpen(false)

  return (
    <fieldset
      className="m-0 min-w-0 border-0 p-0"
      {...devMarker({ name: 'association selection', value: kind })}
    >
      <legend className="sr-only">{title}</legend>
      <div className="mb-1 flex items-center gap-1.5 text-sm font-medium">
        <span aria-hidden="true">{title}</span>
        <FieldHelpButton
          controls={`${idPrefix}-help`}
          expanded={help}
          label={`${tc('help')}: ${title}`}
          onClick={() => setHelp(!help)}
        />
        <button
          aria-describedby={disabled ? statusId : undefined}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={t(isPackage ? 'choosePackages' : 'chooseNorms')}
          className="ml-auto inline-flex min-h-7 min-w-6 shrink-0 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-xs text-primary-700 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-50 dark:text-primary-300 dark:hover:bg-secondary-800"
          disabled={disabled}
          onClick={() => {
            setDraft([...selected])
            setSelectedOnOpen([...selected])
            setQuery('')
            setCreatedThisOpen([])
            setOpen(true)
          }}
          ref={triggerRef}
          type="button"
          {...devMarker({ name: 'association selection trigger', value: kind })}
        >
          <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
          {t('applySelection')}
        </button>
      </div>
      <AnimatedHelpPanel id={`${idPrefix}-help`} isOpen={help}>
        {tr.rich(isPackage ? 'requirementPackageHelp' : 'normReferencesHelp', {
          strong: chunks => <strong>{chunks}</strong>,
        })}
      </AnimatedHelpPanel>
      <div className="rounded-xl border border-secondary-200 p-4 dark:border-secondary-700">
        <div className="flex flex-wrap gap-2">
          {rows
            .filter(item => selected.includes(item.id))
            .map(item => (
              <span
                className="inline-flex min-w-0 max-w-full items-center gap-0.5 rounded-2xl border border-secondary-300 bg-secondary-100 px-1 py-0.5 dark:border-secondary-600 dark:bg-secondary-800"
                key={item.id}
              >
                <RequirementPackagePurposeTooltip
                  purposeAndScope={
                    isPackage ? item.purpose || t('missingPurpose') : item.name
                  }
                  wrapperClassName="inline-flex min-w-0 max-w-full"
                >
                  <button
                    aria-label={`${item.reference ? `${item.reference} ` : ''}${item.name}`}
                    className="min-h-6 min-w-6 rounded-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                    type="button"
                  >
                    <StatusBadge
                      className="min-w-0 whitespace-normal wrap-anywhere"
                      color={null}
                      iconName={isPackage ? 'Package' : 'BookOpen'}
                      label={`${item.reference || item.name}${item.isArchived ? ` (${t('archived')})` : ''}`}
                    />
                  </button>
                </RequirementPackagePurposeTooltip>
                <button
                  aria-label={t('removeSelection', { name: item.name })}
                  className="inline-flex min-h-6 min-w-6 shrink-0 items-center justify-center rounded-full hover:bg-secondary-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:hover:bg-secondary-700"
                  disabled={disabled}
                  onClick={() =>
                    onChange(selected.filter(id => id !== item.id))
                  }
                  type="button"
                >
                  <X aria-hidden="true" className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
        </div>
        {!selected.length && (
          <p className="text-xs text-secondary-600 dark:text-secondary-300">
            {t('noSelection')}
          </p>
        )}
      </div>
      {limitReached && (
        <p
          className="mt-2 flex gap-2 text-sm text-amber-800 dark:text-amber-200"
          id={limitId}
          role="status"
          {...devMarker({
            context: 'requirement form',
            name: 'selection limit',
            value: kind,
          })}
        >
          <CircleAlert aria-hidden="true" className="h-4 w-4 shrink-0" />
          {tr('associationSelectionLimit', { limit: ARRAY_INPUT_MAX_ITEMS })}
        </p>
      )}
      <FormModal
        closeDisabled={creating}
        developerModeValue={`${kind} picker`}
        initialFocusRef={searchRef}
        maxWidthClassName="max-w-3xl"
        onClose={close}
        open={open}
        returnFocusRef={triggerRef}
        title={t(isPackage ? 'choosePackages' : 'chooseNorms')}
        titleId={`${idPrefix}-title`}
      >
        <div
          ref={pickerRef}
          {...devMarker({ name: 'association draft', value: kind })}
        >
          {isPackage && (
            <p className="mb-3 text-xs leading-relaxed text-secondary-600 dark:text-secondary-300">
              {t('purposeGuidance')}
            </p>
          )}
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1 basis-60">
              <FieldLabelWithHelp
                help={t('searchHelp')}
                htmlFor={`${idPrefix}-search`}
                label={t('searchAssociations')}
              />
              <input
                className="mt-1 w-full rounded-lg border bg-white px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:bg-secondary-800"
                id={`${idPrefix}-search`}
                onChange={event => setQuery(event.target.value)}
                ref={searchRef}
                type="search"
                value={query}
              />
            </div>
            {onCreated && (
              <button
                className={`${buttonClassName} inline-flex min-h-10 items-center gap-1.5`}
                disabled={disabled || limitReached}
                onClick={() => setCreating(true)}
                ref={createRef}
                type="button"
                {...devMarker({
                  name: 'create association trigger',
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
              className="mb-3 flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
              role="status"
              {...devMarker({
                name: 'hidden created associations',
                value: kind,
              })}
            >
              <Info aria-hidden="true" className="h-4 w-4 shrink-0" />
              <div className="min-w-0 wrap-anywhere">
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
          <div
            className="max-h-[55dvh] overflow-y-auto px-1"
            {...devMarker({ name: 'association table scroll', value: kind })}
          >
            <table
              aria-label={title}
              className="w-full table-fixed border-collapse text-sm"
              {...devMarker({ name: 'association table', value: kind })}
            >
              <colgroup>
                <col className="w-10" />
                <col className="w-[38%]" />
                <col />
              </colgroup>
              <thead>
                <tr>
                  {[
                    'tableSelect',
                    isPackage ? 'tablePackageName' : 'tableReferenceId',
                    isPackage ? 'tablePurpose' : 'tableNormName',
                  ].map((key, index) => (
                    <th
                      className={`${cellClassName} sticky top-0 z-10 bg-white font-medium dark:bg-secondary-900`}
                      key={key}
                      scope="col"
                    >
                      <span className={index === 0 ? 'sr-only' : undefined}>
                        {t(key)}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              {groups.map(group => (
                <tbody
                  aria-labelledby={`${idPrefix}-${group.key}`}
                  key={group.key}
                  {...devMarker({
                    name: 'association selection group',
                    value: `${kind} ${group.key}`,
                  })}
                >
                  <tr>
                    <td
                      className={`${cellClassName} bg-secondary-100 text-xs font-semibold dark:bg-secondary-800`}
                      colSpan={3}
                    >
                      <h3 id={`${idPrefix}-${group.key}`}>{group.label}</h3>
                    </td>
                  </tr>
                  {group.items.map(item => (
                    <tr key={item.id}>
                      <td className={cellClassName}>
                        <input
                          aria-describedby={
                            limitReached
                              ? limitId
                              : isPackage
                                ? `${idPrefix}-${item.id}-purpose`
                                : undefined
                          }
                          aria-label={`${item.reference ? `${item.reference} ` : ''}${item.name}`}
                          checked={draft.includes(item.id)}
                          disabled={
                            disabled ||
                            (!draft.includes(item.id) && limitReached)
                          }
                          id={`${idPrefix}-${item.id}-checkbox`}
                          onChange={event =>
                            setDraft(
                              event.target.checked
                                ? [...draft, item.id]
                                : draft.filter(id => id !== item.id),
                            )
                          }
                          type="checkbox"
                        />
                      </td>
                      <td className={cellClassName}>
                        <label
                          className={`block min-h-6 cursor-pointer ${isPackage ? '' : 'font-mono text-xs text-secondary-500 dark:text-secondary-400'}`}
                          htmlFor={`${idPrefix}-${item.id}-checkbox`}
                        >
                          {isPackage ? item.name : item.reference}
                          {isPackage && item.isArchived
                            ? ` (${t('archived')})`
                            : ''}
                        </label>
                      </td>
                      <td className={cellClassName}>
                        {isPackage ? (
                          <p
                            className="whitespace-pre-wrap text-xs leading-relaxed"
                            id={`${idPrefix}-${item.id}-purpose`}
                          >
                            {item.purpose || t('missingPurpose')}
                          </p>
                        ) : (
                          <label
                            className="block min-h-6 cursor-pointer"
                            htmlFor={`${idPrefix}-${item.id}-checkbox`}
                          >
                            {item.name}
                            {item.isArchived ? ` (${t('archived')})` : ''}
                          </label>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!group.items.length && (
                    <tr>
                      <td className={cellClassName} colSpan={3}>
                        {t('noMatches')}
                      </td>
                    </tr>
                  )}
                </tbody>
              ))}
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3 pt-4">
            <p className="flex-1 text-sm" role="status">
              {t('draftCount', { count: draft.length })}
            </p>
            <button className={buttonClassName} onClick={close} type="button">
              {tc('cancel')}
            </button>
            <button
              className="btn-primary"
              disabled={disabled || draft.length > ARRAY_INPUT_MAX_ITEMS}
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
      {creating && onCreated && (
        <RequirementAssociationCreateModal
          kind={kind}
          onClose={() => setCreating(false)}
          onCreate={item => {
            onCreated(item)
            setDraft(current => [...current, item.id])
            setCreatedThisOpen(current => [...current, item.id])
            setCreating(false)
          }}
          returnFocusRef={createRef}
        />
      )}
    </fieldset>
  )
}

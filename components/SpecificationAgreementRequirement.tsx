'use client'

import { Pencil, Trash2, Undo2 } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'
import { useConfirmModal } from '@/components/ConfirmModal'
import FieldLabelWithHelp from '@/components/FieldLabelWithHelp'
import FormModal from '@/components/FormModal'
import RequirementDetailCard from '@/components/RequirementDetailCard'
import RequirementDetailSections from '@/components/RequirementDetailSections'
import RequirementRemovalButton from '@/components/RequirementRemovalButton'
import type { SpecificationAgreementView } from '@/components/SpecificationAgreementBox'
import SpecificationAgreementDeviations from '@/components/SpecificationAgreementDeviations'
import SpecificationAgreementHistory from '@/components/SpecificationAgreementHistory'
import SpecificationLibraryVersionUpdate from '@/components/SpecificationLibraryVersionUpdate'
import SpecificationLocalRequirementForm from '@/components/SpecificationLocalRequirementForm'
import StatusBadge from '@/components/StatusBadge'
import type { AsyncResourceState } from '@/hooks/useAsyncResource'
import { useAsyncResource } from '@/hooks/useAsyncResource'
import { useDiscardChangesConfirmation } from '@/hooks/useDiscardChangesConfirmation'
import { devMarker } from '@/lib/developer-mode-markers'
import { apiFetch } from '@/lib/http/api-fetch'
import type { RequirementRow } from '@/lib/requirements/list-view'
import { DEFAULT_SPECIFICATION_ITEM_STATUS_ID } from '@/lib/specification-item-status-constants'
import {
  type AgreementHttpError,
  agreementErrorMessage,
} from '@/lib/specifications/agreement-errors'
import type { AgreementRequirementHistory } from '@/lib/specifications/agreement-history'
import type {
  AgreementItem,
  AgreementMutationInput,
} from '@/lib/specifications/agreements'
import { deviationApplicability } from '@/lib/specifications/deviation-applicability'

interface ComponentProps {
  item: AgreementItem
  needsReferencesResource: AsyncResourceState<{ id: number; text: string }[]>
  onChange: (itemRef?: string) => Promise<void>
  onRemoveFromSpecification?: (anchor: HTMLElement) => void | Promise<void>
  removeFromSpecificationDisabled?: boolean
  row?: RequirementRow
  specificationId: number
  view: SpecificationAgreementView
}

export default function SpecificationAgreementRequirement({
  item,
  view,
  row,
  specificationId,
  needsReferencesResource,
  onChange,
  onRemoveFromSpecification,
  removeFromSpecificationDisabled,
}: ComponentProps) {
  const t = useTranslations('agreement')
  const tr = useTranslations('requirement')
  const tc = useTranslations('common')
  const ts = useTranslations('specification')
  const locale = useLocale()
  const confirmDiscard = useDiscardChangesConfirmation()
  const { confirm } = useConfirmModal()
  const [editingNote, setEditingNote] = useState(false)
  const [note, setNote] = useState('')
  const [editing, setEditing] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deviationActionTarget, setDeviationActionTarget] =
    useState<HTMLDivElement | null>(null)
  const [historyActionTarget, setHistoryActionTarget] =
    useState<HTMLDivElement | null>(null)
  const editTrigger = useRef<HTMLButtonElement>(null)
  const selected = view.selectedAgreement
  const historyResource = useAsyncResource<AgreementRequirementHistory>({
    key: `agreement-history:${specificationId}:${selected?.id}:${item.itemRef}`,
    enabled: !!selected,
    loadOnMount: false,
    fetcher: async signal => {
      const query = new URLSearchParams({
        agreementId: String(selected?.id),
        historyItemRef: item.itemRef,
      })
      const response = await apiFetch(
        `/api/requirements-specifications/${specificationId}/agreement?${query}`,
        { signal },
      )
      if (!response.ok) throw new Error(t('historyFailed'))
      return response.json() as Promise<AgreementRequirementHistory>
    },
    getErrorMessage: () => t('historyFailed'),
  })
  const reloadHistory = historyResource.reload
  useEffect(() => {
    if (view.selectedAgreement) void reloadHistory()
  }, [reloadHistory, view])
  const canEdit =
    view.canEditContent && selected?.state === 'draft' && !item.isRemoved
  const canUndo =
    view.canEditContent &&
    selected?.state === 'draft' &&
    item.changeDate === selected.effectiveDate
  const pendingDeviations = view.deviations.filter(
    deviation =>
      deviation.itemRef === item.itemRef && deviation.decision === null,
  )
  const approvedDeviations = view.deviations.filter(
    deviation =>
      deviation.itemRef === item.itemRef &&
      deviationApplicability(
        deviation,
        view.deviations,
        view.deviationEndings,
        new Date(),
      ) === 'applicable',
  )
  const endingRequired = approvedDeviations.length > 0
  const endingWarning = t(
    item.currentAgreementReference
      ? 'plannedEndingWarning'
      : 'draftEndingWarning',
  )
  const endingAction = t(
    item.currentAgreementReference
      ? 'saveAndPlanEnding'
      : 'saveAndEndDeviation',
  )
  const removalReason =
    busy || removeFromSpecificationDisabled
      ? tc('saving')
      : !view.canEditContent
        ? t('contentLockedError')
        : pendingDeviations.length > 0
          ? t('pendingDeviationWarning')
          : endingRequired && !view.canDecide
            ? t('responsibleEndingRequired')
            : item.specificationItemStatusId !==
                DEFAULT_SPECIFICATION_ITEM_STATUS_ID
              ? t('removalRequiresIncluded')
              : undefined
  const local = item.itemRef.startsWith('local:')
  const canCompare =
    view.canEditContent &&
    !item.isRemoved &&
    !local &&
    item.newerPublishedVersionId !== null
  const name = (sv?: string | null, en?: string | null) =>
    (locale === 'sv' ? sv || en : en || sv) || '—'

  const mutate = async (input: AgreementMutationInput) => {
    setBusy(true)
    setError(null)
    try {
      const response = await apiFetch(
        `/api/requirements-specifications/${specificationId}/agreement`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        },
      )
      const result = (await response.json()) as AgreementHttpError & {
        itemRef?: string
      }
      if (!response.ok) throw new Error(agreementErrorMessage(result, t))
      await onChange(result.itemRef)
      setEditing(false)
      setDirty(false)
    } finally {
      setBusy(false)
    }
  }

  const changeMembership = async (
    operation: 'remove_requirement' | 'undo_requirement',
    anchorEl: HTMLElement,
  ) => {
    if (!selected) return
    const endApprovals =
      endingRequired && !(operation === 'undo_requirement' && item.isRemoved)
    if (endApprovals && !view.canDecide) {
      setError(t('responsibleEndingRequired'))
      return
    }
    if (
      (operation === 'remove_requirement' || endApprovals) &&
      !(await confirm({
        title: t(
          operation === 'remove_requirement'
            ? 'removeRequirement'
            : 'undoRequirement',
        ),
        message: endApprovals
          ? `${item.uniqueId} · ${item.currentAgreementReference ?? selected.agreementReference} · ${selected.effectiveDate}\n${endingWarning}`
          : t('removeRequirementWarning', { id: item.uniqueId }),
        confirmText: endApprovals ? endingAction : t('removeRequirement'),
        variant: 'danger',
        icon: 'caution',
        anchorEl,
      }))
    )
      return
    try {
      await mutate({
        operation,
        agreementId: selected.id,
        itemRef: item.itemRef,
        ...(endApprovals ? { authorizeDeviationEndings: true } : {}),
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('saveFailed'))
    }
  }

  return (
    <div
      className="space-y-3 px-4 py-3"
      {...devMarker({
        context: 'requirements specification detail',
        name: 'detail pane',
        value: 'selected agreement requirement',
        priority: 350,
      })}
    >
      <SpecificationAgreementDeviations
        createActionTarget={deviationActionTarget}
        history={historyResource.data}
        item={item}
        onChange={onChange}
        priorityLevel={
          row?.version?.priorityLevelId
            ? {
                id: row.version.priorityLevelId,
                code: row.version.priorityLevelCode ?? '',
                name: name(
                  row.version.priorityLevelNameSv,
                  row.version.priorityLevelNameEn,
                ),
                color: row.version.priorityLevelColor,
                iconName: row.version.priorityLevelIconName ?? null,
                sortOrder: row.version.priorityLevelSortOrder ?? 0,
              }
            : null
        }
        showLaterEvents
        specificationId={specificationId}
        view={view}
      />
      <div className="flex flex-col gap-3 sm:flex-row">
        <RequirementDetailCard>
          <RequirementDetailSections
            acceptanceCriteria={item.acceptanceCriteria || '—'}
            acceptanceCriteriaLabel={tr('acceptanceCriteria')}
            description={item.description}
            descriptionLabel={tr('description')}
            developerModeContext="requirements specification detail > selected agreement requirement"
            emptyLabel={tc('noneAvailable')}
            metadata={[
              { id: 'identity', label: tr('uniqueId'), value: item.uniqueId },
              {
                id: 'category',
                label: tr('category'),
                value: name(
                  row?.version?.categoryNameSv,
                  row?.version?.categoryNameEn,
                ),
              },
              {
                id: 'type',
                label: tr('type'),
                value: name(row?.version?.typeNameSv, row?.version?.typeNameEn),
              },
              {
                id: 'quality',
                label: tr('qualityCharacteristic'),
                value: name(
                  row?.version?.qualityCharacteristicNameSv,
                  row?.version?.qualityCharacteristicNameEn,
                ),
              },
              {
                id: 'priority',
                label: tr('priorityLevel'),
                value: name(
                  row?.version?.priorityLevelNameSv,
                  row?.version?.priorityLevelNameEn,
                ),
              },
              {
                id: 'verifiable',
                label: tr('verifiable'),
                value: item.verifiable ? tc('yes') : tc('no'),
              },
              {
                id: 'needs-reference',
                label: ts('needsReference'),
                value: item.needsReference || '—',
              },
              {
                id: 'note',
                label: t('requirementNote'),
                value: (
                  <span className="whitespace-pre-wrap">
                    {item.note || '—'}
                    {view.canFollowUp && (
                      <button
                        aria-label={t('editNote')}
                        className="ml-2 inline-flex min-h-6 min-w-6 items-center justify-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                        onClick={() => {
                          setNote(item.note ?? '')
                          setEditingNote(true)
                          setError(null)
                        }}
                        type="button"
                      >
                        <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </span>
                ),
              },
              {
                id: 'usage-status',
                label: tr('specificationItemStatus'),
                value: (
                  <StatusBadge
                    color={row?.specificationItemStatusColor ?? null}
                    iconName={row?.specificationItemStatusIconName}
                    label={name(
                      row?.specificationItemStatusNameSv,
                      row?.specificationItemStatusNameEn,
                    )}
                    size="sm"
                  />
                ),
              },
              ...(item.sourceUniqueId
                ? [
                    {
                      id: 'source',
                      label: t('sourceRequirement'),
                      value: `${item.sourceUniqueId} · ${tr('version')} ${item.sourceVersionNumber}`,
                    },
                  ]
                : []),
            ]}
            references={(item.normReferences?.split('; ') ?? []).map(
              (label, index) => ({ id: `${index}-${label}`, label }),
            )}
            referencesLabel={tr('normReferences')}
            requirementPackages={
              row?.requirementPackages?.map(p => ({
                id: p.id,
                label: p.name,
                purposeAndScope: p.purposeAndScope,
              })) ?? []
            }
            requirementPackagesLabel={tr('requirementPackage')}
            showRequirementPackages={!local}
            verificationMethod={
              item.verifiable ? item.verificationMethod || '—' : '—'
            }
            verificationMethodLabel={tr('verificationMethod')}
          />
        </RequirementDetailCard>
        <fieldset
          aria-label={t('requirementActionColumn')}
          className="flex shrink-0 flex-col gap-2 sm:w-56"
          {...devMarker({
            context: 'requirements specification detail',
            name: 'compact centered requirement actions',
            value: 'requirement action column',
            priority: 350,
          })}
        >
          <div ref={setDeviationActionTarget} />
          {(canEdit || (!selected && onRemoveFromSpecification)) && (
            <RequirementRemovalButton
              className="btn-destructive px-3 text-center"
              reason={removalReason}
              {...devMarker({
                context: 'requirements specification detail',
                name: 'detail action',
                value: 'remove requirement',
                priority: 350,
              })}
              onClick={event =>
                selected
                  ? void changeMembership(
                      'remove_requirement',
                      event.currentTarget,
                    )
                  : void onRemoveFromSpecification?.(event.currentTarget)
              }
            >
              <Trash2
                aria-hidden="true"
                className="mr-2 inline-block h-4 w-4 align-middle"
              />
              {t('removeRequirement')}
            </RequirementRemovalButton>
          )}

          {canEdit && (
            <button
              className="btn-secondary px-3 text-center"
              disabled={busy || pendingDeviations.length > 0}
              onClick={() => {
                setDirty(false)
                setEditing(true)
              }}
              ref={editTrigger}
              title={
                pendingDeviations.length
                  ? t('pendingDeviationWarning')
                  : undefined
              }
              type="button"
            >
              <Pencil
                aria-hidden="true"
                className="mr-2 inline-block h-4 w-4 align-middle"
              />
              {t('editRequirement')}
            </button>
          )}

          {selected && canCompare && (
            <SpecificationLibraryVersionUpdate
              agreementId={selected?.id}
              authorizeDeviationEndings={endingRequired}
              disabled={
                busy ||
                pendingDeviations.length > 0 ||
                (endingRequired && !view.canDecide)
              }
              disabledReason={
                pendingDeviations.length
                  ? t('pendingDeviationWarning')
                  : endingRequired && !view.canDecide
                    ? t('responsibleEndingRequired')
                    : undefined
              }
              endingWarning={
                endingRequired ? (
                  <div className="space-y-2 text-sm">
                    <p>
                      {item.currentAgreementReference ??
                        selected?.agreementReference}{' '}
                      · {selected?.effectiveDate}
                    </p>
                    <p>{endingWarning}</p>
                  </div>
                ) : undefined
              }
              itemRef={item.itemRef}
              onChange={onChange}
              specificationId={specificationId}
              submitLabel={endingRequired ? endingAction : undefined}
            />
          )}
          {canUndo && (
            <button
              className="btn-secondary px-3 text-center"
              disabled={
                busy || (!item.isRemoved && pendingDeviations.length > 0)
              }
              onClick={event =>
                void changeMembership('undo_requirement', event.currentTarget)
              }
              type="button"
            >
              <Undo2
                aria-hidden="true"
                className="mr-2 inline-block h-4 w-4 align-middle"
              />
              {t('undoRequirement')}
            </button>
          )}

          <div className="contents" ref={setHistoryActionTarget} />
        </fieldset>
      </div>
      {selected && (
        <SpecificationAgreementHistory
          actionTarget={historyActionTarget}
          item={item}
          key={`${selected.id}:${item.itemRef}`}
          resource={historyResource}
          view={view}
        />
      )}
      {canEdit && pendingDeviations.length > 0 && (
        <p className="text-sm">{t('pendingDeviationWarning')}</p>
      )}
      {error && (
        <p className="text-sm text-red-700 dark:text-red-300" role="alert">
          {error}
        </p>
      )}
      <FormModal
        closeDisabled={busy}
        developerModeValue="agreement requirement follow-up note"
        onClose={async () => {
          if (note !== (item.note ?? '') && !(await confirmDiscard())) return
          setEditingNote(false)
        }}
        open={editingNote}
        title={t('editNote')}
        titleId={`agreement-note-${item.itemRef}`}
      >
        <form
          className="space-y-4 p-5"
          onSubmit={async event => {
            event.preventDefault()
            setBusy(true)
            setError(null)
            try {
              const response = await apiFetch(
                `/api/requirements-specifications/${specificationId}/items/${encodeURIComponent(item.itemRef)}`,
                {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    agreementId: selected?.id,
                    note: note || null,
                  }),
                },
              )
              const result = (await response.json()) as AgreementHttpError
              if (!response.ok)
                throw new Error(agreementErrorMessage(result, t))
              await onChange()
              setEditingNote(false)
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : t('saveFailed'))
            } finally {
              setBusy(false)
            }
          }}
        >
          <FieldLabelWithHelp
            help={t('noteHelp')}
            htmlFor={`agreement-note-input-${item.itemRef}`}
            label={t('requirementNote')}
          />
          <textarea
            className="min-h-32 w-full rounded-lg border border-secondary-300 bg-white p-3 text-secondary-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:border-secondary-600 dark:bg-secondary-900 dark:text-secondary-100"
            id={`agreement-note-input-${item.itemRef}`}
            maxLength={100000}
            onChange={event => setNote(event.target.value)}
            value={note}
          />
          {error && <p role="alert">{error}</p>}
          <button
            className="btn-primary"
            disabled={busy || note === (item.note ?? '')}
            type="submit"
          >
            {busy ? t('working') : tc('save')}
          </button>
        </form>
      </FormModal>
      <FormModal
        closeDisabled={busy}
        developerModeValue="agreement requirement content editor"
        maxWidthClassName="max-w-5xl"
        onClose={async () => {
          if (!dirty || (await confirmDiscard())) setEditing(false)
        }}
        open={editing}
        returnFocusRef={editTrigger}
        title={t('editRequirement')}
        titleId={`agreement-edit-${item.itemRef}`}
      >
        <div className="space-y-4 p-5">
          {!local && (
            <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
              {t('localConversionWarning')}
            </p>
          )}
          {endingRequired && (
            <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
              <p>
                {item.currentAgreementReference
                  ? `${item.currentAgreementReference} → `
                  : ''}
                {selected?.agreementReference} · {selected?.effectiveDate}
              </p>
              <p>{endingWarning}</p>
              <ul>
                {approvedDeviations.map(deviation => (
                  <li key={deviation.id}>{deviation.motivation}</li>
                ))}
              </ul>
              {!view.canDecide && <p>{t('responsibleEndingRequired')}</p>}
            </div>
          )}
          <SpecificationLocalRequirementForm
            initialValue={{
              description: item.description,
              acceptanceCriteria: item.acceptanceCriteria ?? '',
              verificationMethod: item.verificationMethod ?? '',
              verifiable: Boolean(item.verifiable),
              categoryId: String(item.requirementCategoryId ?? ''),
              typeId: String(item.requirementTypeId ?? ''),
              qualityCharacteristicId: String(
                item.qualityCharacteristicId ?? '',
              ),
              priorityLevelId: String(item.priorityLevelId ?? ''),
              needsReferenceId: String(item.needsReferenceId ?? ''),
              normReferenceIds: item.normReferenceIds,
            }}
            needsReferencesResource={needsReferencesResource}
            onCancel={() => setEditing(false)}
            onDirtyChange={setDirty}
            onSubmit={async content => {
              if (endingRequired && !view.canDecide)
                throw new Error(t('responsibleEndingRequired'))
              if (selected)
                await mutate({
                  operation: 'save_requirement',
                  agreementId: selected.id,
                  itemRef: item.itemRef,
                  content,
                  ...(endingRequired
                    ? { authorizeDeviationEndings: true }
                    : {}),
                })
            }}
            submitLabel={endingRequired ? endingAction : tc('save')}
          />
        </div>
      </FormModal>
    </div>
  )
}

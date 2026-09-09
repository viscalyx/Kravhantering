'use client'

import { AlertTriangle } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { type RefObject, useId, useRef, useState } from 'react'
import FormModal from '@/components/FormModal'
import type { RequirementFormFieldValues } from '@/components/RequirementFormFields'
import {
  compareRequirementEdits,
  formatRequirementEditValue,
} from '@/components/requirement-edit-reconciliation'
import type { TaxonomyOptions } from '@/hooks/useTaxonomyOptions'
import { devMarker } from '@/lib/developer-mode-markers'

interface RequirementEditReconciliationProps {
  local: RequirementFormFieldValues
  onApply: (values: RequirementFormFieldValues) => void
  onClose: () => void
  returnFocusRef: RefObject<HTMLElement | null>
  server: RequirementFormFieldValues
  starting: RequirementFormFieldValues
  taxonomyOptions: TaxonomyOptions
}

export const REQUIREMENT_EDIT_LABELS = {
  acceptanceCriteria: 'acceptanceCriteria',
  areaId: 'area',
  categoryId: 'category',
  description: 'description',
  normReferenceIds: 'normReferences',
  priorityLevelId: 'priorityLevel',
  qualityCharacteristicId: 'qualityCharacteristic',
  requirementPackageIds: 'requirementPackage',
  typeId: 'type',
  verifiable: 'verifiable',
  verificationMethod: 'verificationMethod',
} as const satisfies Record<keyof RequirementFormFieldValues, string>

export default function RequirementEditReconciliation({
  starting,
  local,
  server,
  taxonomyOptions,
  onApply,
  onClose,
  returnFocusRef,
}: RequirementEditReconciliationProps) {
  const t = useTranslations('requirement')
  const tc = useTranslations('common')
  const locale = useLocale()
  const titleId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const [choices, setChoices] = useState<Record<string, 'local' | 'server'>>({})
  const groups = compareRequirementEdits(starting, local, server)
  const unresolved = groups.some(
    group => group.conflict && !choices[group.fields[0]],
  )
  const proposed = { ...local }
  for (const group of groups) {
    const choice = choices[group.fields[0]]
    const source =
      choice === 'local' ? local : choice === 'server' ? server : group.proposed
    for (const field of group.fields) {
      Object.assign(proposed, { [field]: source[field] })
    }
  }

  const formatValue = (
    values: RequirementFormFieldValues,
    field: keyof RequirementFormFieldValues,
  ) =>
    formatRequirementEditValue(values, field, taxonomyOptions, locale, {
      yes: tc('yes'),
      no: tc('no'),
      empty: t('reconciliation.empty'),
    })

  return (
    <FormModal
      developerModeValue="requirement edit reconciliation"
      initialFocusRef={cancelRef}
      maxWidthClassName="max-w-5xl"
      onClose={onClose}
      open
      returnFocusRef={returnFocusRef}
      title={t('reconciliation.title')}
      titleId={titleId}
    >
      <p className="mb-4 text-sm text-secondary-700 dark:text-secondary-300">
        {t('reconciliation.dependentFields')}
      </p>
      <div className="space-y-5">
        {groups
          .filter(group => group.changed)
          .map(group => {
            const key = group.fields[0]
            return (
              <section
                aria-label={group.fields
                  .map(field => t(REQUIREMENT_EDIT_LABELS[field]))
                  .join(' / ')}
                className="rounded-xl border border-secondary-200 p-4 dark:border-secondary-700"
                key={key}
                {...devMarker({
                  context: 'requirement edit reconciliation',
                  name: 'comparison',
                  value: key,
                })}
              >
                <h3 className="mb-3 font-semibold text-secondary-900 dark:text-secondary-100">
                  {group.fields
                    .map(field => t(REQUIREMENT_EDIT_LABELS[field]))
                    .join(' / ')}
                </h3>
                <div className="grid gap-4 sm:grid-cols-3">
                  {(['starting', 'local', 'server'] as const).map(source => (
                    <div key={source}>
                      <h4 className="text-sm font-semibold text-secondary-700 dark:text-secondary-300">
                        {t(`reconciliation.${source}`)}
                      </h4>
                      <dl className="mt-2 space-y-2 text-sm text-secondary-900 dark:text-secondary-100">
                        {group.fields.map(field => (
                          <div key={field}>
                            {group.fields.length > 1 && (
                              <dt className="font-medium">
                                {t(REQUIREMENT_EDIT_LABELS[field])}
                              </dt>
                            )}
                            {group.fields.length === 1 && (
                              <dt className="sr-only">
                                {t(REQUIREMENT_EDIT_LABELS[field])}
                              </dt>
                            )}
                            <dd className="whitespace-pre-wrap wrap-anywhere">
                              {formatValue(
                                { starting, local, server }[source],
                                field,
                              )}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ))}
                </div>
                {group.conflict && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(['local', 'server'] as const).map(choice => (
                      <button
                        aria-pressed={choices[key] === choice}
                        className="btn-secondary min-h-6 min-w-6 focus-visible:ring-2 focus-visible:ring-primary-500"
                        key={choice}
                        onClick={() =>
                          setChoices(previous => ({
                            ...previous,
                            [key]: choice,
                          }))
                        }
                        type="button"
                      >
                        {t(
                          choice === 'local'
                            ? 'reconciliation.keepLocal'
                            : 'reconciliation.keepServer',
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {(!group.conflict || choices[key]) && (
                  <p className="mt-3 whitespace-pre-wrap text-sm text-secondary-700 wrap-anywhere dark:text-secondary-300">
                    <strong>{t('reconciliation.proposed')}: </strong>
                    {group.fields
                      .map(
                        field =>
                          `${t(REQUIREMENT_EDIT_LABELS[field])}: ${formatValue(proposed, field)}`,
                      )
                      .join('\n')}
                  </p>
                )}
              </section>
            )
          })}
      </div>
      <p
        className="my-4 flex items-start gap-2 text-sm text-secondary-700 dark:text-secondary-300"
        role="status"
      >
        {unresolved && (
          <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0" />
        )}
        {t(
          unresolved ? 'reconciliation.unresolved' : 'reconciliation.resolved',
        )}
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          className="btn-primary"
          disabled={unresolved}
          onClick={() => onApply(proposed)}
          type="button"
        >
          {t('reconciliation.apply')}
        </button>
        <button
          className="btn-secondary"
          onClick={onClose}
          ref={cancelRef}
          type="button"
        >
          {t('reconciliation.cancel')}
        </button>
      </div>
    </FormModal>
  )
}

'use client'

import { Eye, FilePenLine, GitCompareArrows, History } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { type ReactNode, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import FormModal from '@/components/FormModal'
import RequirementDetailCard from '@/components/RequirementDetailCard'
import RequirementDetailSections from '@/components/RequirementDetailSections'
import type { SpecificationAgreementView } from '@/components/SpecificationAgreementBox'
import type { AsyncResourceState } from '@/hooks/useAsyncResource'
import { devMarker } from '@/lib/developer-mode-markers'
import type { AgreementRequirementHistory } from '@/lib/specifications/agreement-history'
import type { AgreementItem } from '@/lib/specifications/agreements'

interface ComponentProps {
  actionTarget: HTMLElement | null
  item: AgreementItem
  resource: AsyncResourceState<AgreementRequirementHistory>
  view: SpecificationAgreementView
}

export default function SpecificationAgreementHistory({
  actionTarget,
  item,
  resource,
  view,
}: ComponentProps) {
  const t = useTranslations('agreement')
  const tr = useTranslations('requirement')
  const tc = useTranslations('common')
  const ts = useTranslations('specification')
  const locale = useLocale()
  const history = resource.data
  const busy = resource.loading || resource.refreshing
  const error = resource.error || resource.refreshError
  const [comparing, setComparing] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const selected = view.selectedAgreement
  const hasHistory = (history?.changes.length ?? 0) > 0
  const hasPreviousAgreement =
    !!selected &&
    view.agreements.some(
      agreement =>
        agreement.id < selected.id &&
        ['current', 'previous', 'ended'].includes(agreement.state),
    )
  const content = (value: AgreementItem, comparison?: AgreementItem) => {
    const changed = (key: keyof AgreementItem) =>
      !!comparison &&
      JSON.stringify(value[key]) !== JSON.stringify(comparison[key])
    const text = (
      key: 'description' | 'acceptanceCriteria' | 'verificationMethod',
    ) =>
      changed(key) ? (
        <div className="border-l-2 border-primary-600 pl-2 dark:border-primary-400">
          <span className="sr-only">{t('changedField')}: </span>
          {value[key] || '—'}
        </div>
      ) : (
        value[key] || '—'
      )
    const metadataValue = (key: keyof AgreementItem, label: ReactNode) =>
      changed(key) ? (
        <span className="border-l-2 border-primary-600 pl-2 dark:border-primary-400">
          <span className="sr-only">{t('changedField')}: </span>
          {label}
        </span>
      ) : (
        label
      )
    const name = (
      sv: string | null | undefined,
      en: string | null | undefined,
    ) => (locale === 'sv' ? sv || en : en || sv) || '—'
    return (
      <RequirementDetailCard>
        <RequirementDetailSections
          acceptanceCriteria={text('acceptanceCriteria')}
          acceptanceCriteriaLabel={tr('acceptanceCriteria')}
          description={text('description')}
          descriptionLabel={tr('description')}
          emptyLabel={tc('noneAvailable')}
          metadata={[
            {
              id: 'identity',
              label: tr('uniqueId'),
              value: metadataValue('uniqueId', value.uniqueId),
            },
            {
              id: 'category',
              label: tr('category'),
              value: metadataValue(
                'requirementCategoryId',
                name(value.categoryNameSv, value.categoryNameEn),
              ),
            },
            {
              id: 'type',
              label: tr('type'),
              value: metadataValue(
                'requirementTypeId',
                name(value.typeNameSv, value.typeNameEn),
              ),
            },
            {
              id: 'quality',
              label: tr('qualityCharacteristic'),
              value: metadataValue(
                'qualityCharacteristicId',
                name(
                  value.qualityCharacteristicNameSv,
                  value.qualityCharacteristicNameEn,
                ),
              ),
            },
            {
              id: 'priority',
              label: tr('priorityLevel'),
              value: metadataValue(
                'priorityLevelId',
                name(value.priorityLevelNameSv, value.priorityLevelNameEn),
              ),
            },
            {
              id: 'verifiable',
              label: tr('verifiable'),
              value: metadataValue(
                'verifiable',
                value.verifiable ? tc('yes') : tc('no'),
              ),
            },
            {
              id: 'needs',
              label: ts('needsReference'),
              value: metadataValue(
                'needsReference',
                value.needsReference || '—',
              ),
            },
            {
              id: 'note',
              label: t('requirementNote'),
              value: metadataValue('note', value.note || '—'),
            },
            ...(value.sourceUniqueId
              ? [
                  {
                    id: 'source',
                    label: t('sourceRequirement'),
                    value: `${value.sourceUniqueId} · ${tr('version')} ${value.sourceVersionNumber}`,
                  },
                ]
              : []),
          ]}
          references={(value.normReferences?.split('; ') ?? []).map(
            (label, index) => ({ id: index, label }),
          )}
          referencesLabel={tr('normReferences')}
          requirementPackages={[]}
          requirementPackagesLabel={tr('requirementPackage')}
          showRequirementPackages={false}
          verificationMethod={text('verificationMethod')}
          verificationMethodLabel={tr('verificationMethod')}
        />
      </RequirementDetailCard>
    )
  }
  return (
    <div
      className="space-y-3"
      {...devMarker({
        context: 'requirements specification detail',
        name: 'history section',
        value: 'agreement requirement content history',
        priority: 350,
      })}
    >
      {hasPreviousAgreement &&
        actionTarget &&
        createPortal(
          <button
            className="btn-secondary w-full px-3 text-center"
            disabled={busy}
            onClick={() => {
              setComparing(true)
              void resource.reload()
            }}
            {...devMarker({
              context: 'requirements specification detail',
              name: 'requirement action',
              value: 'compare previous agreement',
              priority: 350,
            })}
            ref={trigger}
            type="button"
          >
            <GitCompareArrows
              aria-hidden="true"
              className="mr-2 inline-block h-4 w-4 align-middle"
            />
            {t('comparePrevious')}
          </button>,
          actionTarget,
        )}
      {busy && !history && <p role="status">{t('working')}</p>}
      {error && !comparing && (
        <div className="space-y-2 text-sm" role="alert">
          <p>{error}</p>
          <button
            className="btn-secondary"
            onClick={() => void resource.reload()}
            type="button"
          >
            {tc('retry')}
          </button>
        </div>
      )}
      {hasHistory && (
        <details>
          <summary className="flex min-h-6 cursor-pointer items-center gap-2 rounded py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
            <History aria-hidden="true" className="h-4 w-4" />
            {t('requirementHistory')}
          </summary>
          <p className="mt-2 text-sm">
            <Eye
              aria-hidden="true"
              className="mr-1.5 inline-block h-4 w-4 align-middle"
            />
            {t('viewingAgreement', {
              reference: selected?.agreementReference ?? '',
            })}
          </p>
          <ol className="space-y-3 pt-3">
            {history?.changes.map(change => {
              const agreement = view.agreements.find(
                value => value.id === change.agreementId,
              )
              return (
                <li
                  className="space-y-1 rounded-lg border border-secondary-200 p-3 text-sm dark:border-secondary-700"
                  key={change.agreementId}
                  {...devMarker({
                    context: 'requirements specification detail',
                    name: 'requirement change',
                    value: change.kind,
                    priority: 350,
                  })}
                >
                  <p className="font-medium">
                    <FilePenLine
                      aria-hidden="true"
                      className="mr-1.5 inline-block h-4 w-4 align-middle"
                    />
                    {t(`historyChanges.${change.kind}`)} ·{' '}
                    {change.agreementReference}
                    {change.agreementId === selected?.id && (
                      <span className="ml-2 inline-block rounded border border-primary-300 px-2 py-0.5 text-xs text-primary-800 dark:border-primary-700 dark:text-primary-200">
                        <Eye
                          aria-hidden="true"
                          className="mr-1 inline-block h-3 w-3 align-middle"
                        />
                        {t('viewingAgreementBadge')}
                      </span>
                    )}
                  </p>
                  <p>
                    {t('effectiveDate')}:{' '}
                    <time dateTime={change.effectiveDate}>
                      {change.effectiveDate}
                    </time>
                    {agreement && (
                      <>
                        {' '}
                        · {t(`states.${agreement.state}`)}
                        {agreement.state === 'cancelled' && (
                          <> — {t('neverEffective')}</>
                        )}
                      </>
                    )}
                  </p>
                  {change.previousAgreementReference && (
                    <p>
                      {t('historyComparedWith', {
                        reference: change.previousAgreementReference,
                      })}
                    </p>
                  )}
                  {change.kind === 'libraryUpdated' && (
                    <p>
                      {tr('version')} {change.previousVersion} →{' '}
                      {change.version}
                    </p>
                  )}
                </li>
              )
            })}
          </ol>
        </details>
      )}
      <FormModal
        developerModeValue="compare previous agreement requirement"
        maxWidthClassName="max-w-6xl"
        onClose={() => setComparing(false)}
        open={comparing}
        returnFocusRef={trigger}
        title={t('comparePrevious')}
        titleId={`agreement-comparison-${item.itemRef}`}
      >
        <div className="space-y-3 p-5">
          {busy && <p role="status">{t('working')}</p>}
          {error && <p role="alert">{error}</p>}
          {history &&
            (history.previous ? (
              <div className="grid gap-4 lg:grid-cols-2">
                <section className="min-w-0 space-y-2">
                  <h3 className="font-semibold">
                    {history.previous.agreementReference} ·{' '}
                    {history.previous.effectiveDate}
                  </h3>
                  {content(history.previous.item, item)}
                </section>
                <section className="min-w-0 space-y-2">
                  <h3 className="font-semibold">
                    {selected?.agreementReference} · {selected?.effectiveDate}
                  </h3>
                  {content(item, history.previous.item)}
                </section>
              </div>
            ) : (
              <p>{t('noPreviousRequirement')}</p>
            ))}
          <button
            className="btn-secondary"
            onClick={() => setComparing(false)}
            type="button"
          >
            {tc('close')}
          </button>
        </div>
      </FormModal>
    </div>
  )
}

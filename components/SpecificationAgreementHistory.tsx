'use client'

import { FilePenLine, GitCompareArrows, History } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { type ReactNode, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import FormModal from '@/components/FormModal'
import RequirementDetailCard from '@/components/RequirementDetailCard'
import RequirementDetailSections from '@/components/RequirementDetailSections'
import type { SpecificationAgreementView } from '@/components/SpecificationAgreementBox'
import SpecificationAgreementDeviations from '@/components/SpecificationAgreementDeviations'
import { devMarker } from '@/lib/developer-mode-markers'
import { apiFetch } from '@/lib/http/api-fetch'
import type { AgreementRequirementHistory } from '@/lib/specifications/agreement-history'
import type { AgreementItem } from '@/lib/specifications/agreements'

interface ComponentProps {
  actionTarget: HTMLElement | null
  item: AgreementItem
  specificationId: number
  view: SpecificationAgreementView
}

export default function SpecificationAgreementHistory({
  actionTarget,
  item,
  specificationId,
  view,
}: ComponentProps) {
  const t = useTranslations('agreement')
  const tr = useTranslations('requirement')
  const tc = useTranslations('common')
  const ts = useTranslations('specification')
  const locale = useLocale()
  const [history, setHistory] = useState<AgreementRequirementHistory | null>(
    null,
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [comparing, setComparing] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const selected = view.selectedAgreement
  const hasHistory = view.agreements.length > 1
  const hasPreviousAgreement =
    !!selected &&
    view.agreements.some(
      agreement =>
        agreement.id < selected.id &&
        ['current', 'previous', 'ended'].includes(agreement.state),
    )
  const load = async () => {
    if (!selected || busy) return
    setBusy(true)
    setError(null)
    try {
      const query = new URLSearchParams({
        agreementId: String(selected.id),
        historyItemRef: item.itemRef,
      })
      const response = await apiFetch(
        `/api/requirements-specifications/${specificationId}/agreement?${query}`,
      )
      if (!response.ok) throw new Error(t('historyFailed'))
      setHistory((await response.json()) as AgreementRequirementHistory)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('historyFailed'))
    } finally {
      setBusy(false)
    }
  }
  if (!hasHistory && !hasPreviousAgreement) return null

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
            className="btn-secondary inline-flex w-full items-center gap-2"
            disabled={busy}
            onClick={() => {
              setComparing(true)
              void load()
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
            <GitCompareArrows aria-hidden="true" className="h-4 w-4" />
            {t('comparePrevious')}
          </button>,
          actionTarget,
        )}
      {hasHistory && (
        <details
          onToggle={event => {
            if (event.currentTarget.open) void load()
          }}
        >
          <summary className="flex min-h-6 cursor-pointer items-center gap-2 rounded py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
            <History aria-hidden="true" className="h-4 w-4" />
            {t('requirementHistory')}
          </summary>
          {busy && <p role="status">{t('working')}</p>}
          {error && !comparing && <p role="alert">{error}</p>}
          <div className="space-y-3 pt-3">
            {history?.entries.map(entry => (
              <section
                className="space-y-2"
                key={`${entry.agreementId}:${entry.item.itemRef}`}
              >
                <h4 className="text-sm font-semibold">
                  {entry.agreementReference} · {entry.effectiveDate}
                </h4>
                {entry.item.changeDate && (
                  <p
                    className="flex items-center gap-1.5 text-xs text-primary-800 dark:text-primary-200"
                    role="status"
                  >
                    <FilePenLine aria-hidden="true" className="h-4 w-4" />
                    {tr(
                      entry.item.isRemoved
                        ? 'agreementRemoved'
                        : 'agreementChange',
                    )}{' '}
                    ·{' '}
                    <time dateTime={entry.item.changeDate}>
                      {entry.item.changeDate}
                    </time>
                  </p>
                )}
                {content(entry.item)}
                <SpecificationAgreementDeviations
                  item={entry.item}
                  onChange={async () => {}}
                  showLaterEvents
                  specificationId={specificationId}
                  view={{
                    ...view,
                    deviations: history.deviations ?? view.deviations,
                    deviationEndings:
                      history.deviationEndings ?? view.deviationEndings,
                    selectedAgreement:
                      view.agreements.find(
                        agreement => agreement.id === entry.agreementId,
                      ) ?? null,
                    canAuthor: false,
                    canReviewDeviations: false,
                  }}
                />
              </section>
            ))}
          </div>
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

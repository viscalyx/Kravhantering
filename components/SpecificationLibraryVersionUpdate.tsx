'use client'

import { RefreshCw } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { type ReactNode, useRef, useState } from 'react'
import FormModal from '@/components/FormModal'
import RequirementDetailCard from '@/components/RequirementDetailCard'
import RequirementDetailSections from '@/components/RequirementDetailSections'
import { devMarker } from '@/lib/developer-mode-markers'
import { apiFetch } from '@/lib/http/api-fetch'
import type { createSpecificationAgreementWorkflow } from '@/lib/specifications/agreements'

type Comparison = Awaited<
  ReturnType<ReturnType<typeof createSpecificationAgreementWorkflow>['compare']>
>

interface ComponentProps {
  agreementId?: number
  authorizeDeviationEndings?: boolean
  disabled?: boolean
  disabledReason?: string
  endingWarning?: ReactNode
  itemRef: string
  onChange: (itemRef?: string) => Promise<void>
  specificationId: number
  submitLabel?: string
}

export default function SpecificationLibraryVersionUpdate({
  agreementId,
  authorizeDeviationEndings,
  disabled,
  disabledReason,
  endingWarning,
  itemRef,
  onChange,
  specificationId,
  submitLabel,
}: ComponentProps) {
  const t = useTranslations('agreement')
  const tr = useTranslations('requirement')
  const tc = useTranslations('common')
  const locale = useLocale()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [comparison, setComparison] = useState<Comparison | null>(null)
  const [error, setError] = useState<string | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  const loadComparison = async () => {
    setOpen(true)
    setBusy(true)
    setComparison(null)
    setError(null)
    try {
      const query = new URLSearchParams({ itemRef })
      if (agreementId !== undefined)
        query.set('agreementId', String(agreementId))
      const response = await apiFetch(
        `/api/requirements-specifications/${specificationId}/agreement?${query}`,
      )
      if (!response.ok) throw new Error(t('compareFailed'))
      setComparison((await response.json()) as Comparison)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('compareFailed'))
    } finally {
      setBusy(false)
    }
  }

  const adopt = async () => {
    if (!comparison) return
    setBusy(true)
    setError(null)
    try {
      const response = await apiFetch(
        `/api/requirements-specifications/${specificationId}/agreement`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            operation: 'adopt',
            itemRef,
            targetVersionId: comparison.published.id,
            ...(agreementId !== undefined ? { agreementId } : {}),
            ...(authorizeDeviationEndings
              ? { authorizeDeviationEndings: true }
              : {}),
          }),
        },
      )
      const result = (await response.json()) as { itemRef?: string }
      if (!response.ok) throw new Error(t('adoptFailed'))
      await onChange(result.itemRef)
      setOpen(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('adoptFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        className="btn-secondary px-3 text-center"
        disabled={disabled || busy}
        onClick={() => void loadComparison()}
        ref={trigger}
        title={disabledReason}
        type="button"
        {...devMarker({
          context: 'requirements specification detail',
          name: 'detail action',
          value: 'compare newer library version',
          priority: 350,
        })}
      >
        <RefreshCw
          aria-hidden="true"
          className="mr-2 inline-block h-4 w-4 align-middle"
        />
        {t('updateFromLibrary')}
      </button>
      <FormModal
        closeDisabled={busy}
        developerModeValue="compare complete library versions"
        maxWidthClassName="max-w-6xl"
        onClose={() => setOpen(false)}
        open={open}
        returnFocusRef={trigger}
        title={t('compareLibraryVersions')}
        titleId={`compare-library-${itemRef}`}
      >
        <div className="space-y-4 p-5">
          {busy && !comparison && <p role="status">{t('working')}</p>}
          {comparison && (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                {(['pinned', 'published'] as const).map(kind => {
                  const content = comparison[kind]
                  const other =
                    comparison[kind === 'pinned' ? 'published' : 'pinned']
                  const highlight = (
                    key: keyof typeof content,
                    value: ReactNode,
                  ) =>
                    content[key] !== other[key] ? (
                      <span className="border-l-2 border-primary-600 pl-2 dark:border-primary-400">
                        <span className="sr-only">{t('changedField')}: </span>
                        {value}
                      </span>
                    ) : (
                      value
                    )
                  const name = (sv: string | null, en: string | null) =>
                    (locale === 'sv' ? sv || en : en || sv) || '—'
                  return (
                    <section
                      aria-label={t(
                        kind === 'pinned'
                          ? 'selectedVersion'
                          : 'newPublishedVersion',
                      )}
                      className="min-w-0 space-y-2"
                      key={kind}
                    >
                      <h3 className="font-medium">
                        {t(
                          kind === 'pinned'
                            ? 'selectedVersion'
                            : 'newPublishedVersion',
                        )}{' '}
                        · {tr('version')} {content.versionNumber}
                      </h3>
                      <RequirementDetailCard>
                        <RequirementDetailSections
                          acceptanceCriteria={highlight(
                            'acceptanceCriteria',
                            content.acceptanceCriteria || '—',
                          )}
                          acceptanceCriteriaLabel={tr('acceptanceCriteria')}
                          description={highlight(
                            'description',
                            content.description,
                          )}
                          descriptionLabel={tr('description')}
                          developerModeContext="requirements specification detail > library version comparison"
                          emptyLabel={tc('noneAvailable')}
                          metadata={[
                            {
                              id: 'category',
                              label: tr('category'),
                              value: highlight(
                                'category',
                                name(content.category, content.categoryEn),
                              ),
                            },
                            {
                              id: 'type',
                              label: tr('type'),
                              value: highlight(
                                'type',
                                name(content.type, content.typeEn),
                              ),
                            },
                            {
                              id: 'quality',
                              label: tr('qualityCharacteristic'),
                              value: highlight(
                                'qualityCharacteristic',
                                name(
                                  content.qualityCharacteristic,
                                  content.qualityCharacteristicEn,
                                ),
                              ),
                            },
                            {
                              id: 'priority',
                              label: tr('priorityLevel'),
                              value: highlight(
                                'priority',
                                content.priority || '—',
                              ),
                            },
                            {
                              id: 'verifiable',
                              label: tr('verifiable'),
                              value: highlight(
                                'verifiable',
                                content.verifiable ? tc('yes') : tc('no'),
                              ),
                            },
                          ]}
                          references={(
                            content.normReferences?.split('; ') ?? []
                          ).map((label, index) => ({ id: index, label }))}
                          referencesLabel={
                            content.normReferences !== other.normReferences
                              ? `${tr('normReferences')} · ${t('changedField')}`
                              : tr('normReferences')
                          }
                          requirementPackages={[]}
                          requirementPackagesLabel={tr('requirementPackage')}
                          showRequirementPackages={false}
                          verificationMethod={highlight(
                            'verificationMethod',
                            content.verifiable
                              ? content.verificationMethod || '—'
                              : '—',
                          )}
                          verificationMethodLabel={tr('verificationMethod')}
                        />
                      </RequirementDetailCard>
                    </section>
                  )
                })}
              </div>
              {endingWarning}
              <button
                className="btn-primary"
                disabled={busy || disabled}
                onClick={() => void adopt()}
                type="button"
              >
                {busy ? t('working') : submitLabel || t('adoptComparedVersion')}
              </button>
            </>
          )}
          {error && (
            <p className="text-sm text-red-700 dark:text-red-300" role="alert">
              {error}
            </p>
          )}
        </div>
      </FormModal>
    </>
  )
}

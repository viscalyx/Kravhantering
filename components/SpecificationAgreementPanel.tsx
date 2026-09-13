'use client'

import { History } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import FieldLabelWithHelp from '@/components/FieldLabelWithHelp'
import { devMarker } from '@/lib/developer-mode-markers'
import { apiFetch } from '@/lib/http/api-fetch'
import type {
  AgreementMutationInput,
  createSpecificationAgreementWorkflow,
} from '@/lib/specifications/agreements'
import type { AmendmentChange } from '@/lib/specifications/amendments'

type Workflow = ReturnType<typeof createSpecificationAgreementWorkflow>
type AgreementView = Awaited<ReturnType<Workflow['read']>>
type Comparison = Awaited<ReturnType<Workflow['compare']>>

function AgreementField({
  name,
  children,
  required = true,
}: {
  name: string
  children: ReactNode
  required?: boolean
}) {
  const t = useTranslations('agreement')
  return (
    <div>
      <FieldLabelWithHelp
        help={t(`${name}Help`)}
        htmlFor={`agreement-${name}`}
        label={t(name)}
        required={required}
      />
      {children}
    </div>
  )
}

export default function SpecificationAgreementPanel({
  specificationId,
  onChanged,
}: {
  specificationId: number
  onChanged: () => void
}) {
  const t = useTranslations('agreement')
  const locale = useLocale()
  const [view, setView] = useState<AgreementView | null>(null)
  const [comparison, setComparison] = useState<Comparison | null>(null)
  const [error, setError] = useState('')
  const [reason, setReason] = useState('')
  const [agreementReference, setAgreementReference] = useState('')
  const [effectiveDate, setEffectiveDate] = useState('')
  const [mutating, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const loadSequence = useRef(0)
  const busy = mutating || loading
  const [comparedItemRef, setComparedItemRef] = useState('')
  const [tab, setTab] = useState<'current' | 'original' | 'history'>('current')
  const [changes, setChanges] = useState<
    Array<AmendmentChange & { uiKey: string }>
  >([])
  const [changeKind, setChangeKind] = useState<
    'remove' | 'change_local' | 'add_library' | 'add_local'
  >('remove')
  const [selectedItemRef, setSelectedItemRef] = useState('')
  const [selectedVersionId, setSelectedVersionId] = useState('')
  const [versionSearch, setVersionSearch] = useState('')
  const [localText, setLocalText] = useState('')
  const [usageStatus, setUsageStatus] = useState(1)
  const [replacesAmendmentId, setReplacesAmendmentId] = useState<
    number | undefined
  >()
  const endpoint = `/api/requirements-specifications/${specificationId}/agreement`
  const loadErrorMessage = t('loadError')
  const load = useCallback(
    async (search = '') => {
      const sequence = ++loadSequence.current
      setLoading(true)
      setError('')
      try {
        const response = await apiFetch(
          `${endpoint}?versionSearch=${encodeURIComponent(search)}`,
        )
        if (!response.ok) throw new Error(loadErrorMessage)
        const nextView = await response.json()
        if (sequence === loadSequence.current) setView(nextView)
      } catch (error) {
        if (sequence === loadSequence.current) {
          setError(error instanceof Error ? error.message : loadErrorMessage)
        }
      } finally {
        if (sequence === loadSequence.current) setLoading(false)
      }
    },
    [endpoint, loadErrorMessage],
  )
  useEffect(() => {
    void load()
    return () => {
      loadSequence.current += 1
    }
  }, [load])

  async function compare(itemRef: string) {
    setBusy(true)
    try {
      setError('')
      const response = await apiFetch(
        `${endpoint}?itemRef=${encodeURIComponent(itemRef)}`,
      )
      if (!response.ok) throw new Error(t('comparisonUnavailable'))
      setComparison(await response.json())
      setComparedItemRef(itemRef)
    } catch (error) {
      setError(error instanceof Error ? error.message : t('loadError'))
    } finally {
      setBusy(false)
    }
  }

  async function mutate(input: AgreementMutationInput) {
    setBusy(true)
    setError('')
    try {
      const response = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(
          payload?.details?.reason
            ? t(`errors.${payload.details.reason}`)
            : t('mutationError'),
        )
      }
      setComparison(null)
      setReason('')
      if (input.operation === 'prepare_amendment') {
        setChanges([])
        setReplacesAmendmentId(undefined)
      }
      await load()
      onChanged()
    } catch (error) {
      setError(error instanceof Error ? error.message : t('mutationError'))
    } finally {
      setBusy(false)
    }
  }

  function stageChange() {
    const change: AmendmentChange =
      changeKind === 'add_local'
        ? { kind: 'add_local', description: localText }
        : changeKind === 'add_library'
          ? { kind: 'add_library', targetVersionId: Number(selectedVersionId) }
          : changeKind === 'change_local'
            ? {
                kind: 'change_local',
                itemRef: selectedItemRef,
                description: localText,
              }
            : { kind: 'remove', itemRef: selectedItemRef }
    setChanges(previous => [
      ...previous,
      { ...change, uiKey: crypto.randomUUID() },
    ])
    setSelectedItemRef('')
    setLocalText('')
  }

  function downloadView() {
    if (!view) return
    const items =
      tab === 'original'
        ? view.originalItems
        : tab === 'history'
          ? view.historyItems
          : view.currentItems
    const itemRefs = new Set(items.map(item => item.itemRef))
    const blob = new Blob(
      [
        JSON.stringify(
          {
            context: tab,
            establishmentStatus: view.establishmentStatus,
            agreementReference: view.agreementReference,
            items,
            deviations: view.deviations.filter(deviation =>
              itemRefs.has(
                deviation.itemRef as `lib:${number}` | `local:${number}`,
              ),
            ),
            amendments: view.amendments,
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    )
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `specification-${specificationId}-${tab}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  function comparisonValue(
    version: Comparison['pinned'],
    field: keyof Comparison['pinned'],
  ) {
    const englishFields = {
      category: 'categoryEn',
      type: 'typeEn',
      qualityCharacteristic: 'qualityCharacteristicEn',
    } as const
    const localizedField =
      locale === 'en' && field in englishFields
        ? englishFields[field as keyof typeof englishFields]
        : field
    const value = version[localizedField]
    return typeof value === 'boolean'
      ? t(value ? 'yes' : 'no')
      : String(value ?? '—')
  }

  const displayedItems =
    tab === 'original'
      ? view?.originalItems
      : tab === 'history'
        ? view?.historyItems
        : view?.currentItems
  const canChange = view?.canAuthor && tab === 'current'
  const canEstablish =
    view?.canDecide &&
    ['editable', 'assessment'].includes(view.establishmentStatus)
  const disabled = busy || !reason.trim()

  return (
    <section
      aria-busy={busy}
      aria-label={t('title')}
      className="mb-5 space-y-4 rounded-xl border border-secondary-200 bg-white p-4 text-secondary-900 dark:border-secondary-700 dark:bg-secondary-900 dark:text-secondary-100"
      id="agreement-history"
      {...devMarker({ name: 'agreement and version history', priority: 350 })}
    >
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <History aria-hidden="true" className="h-5 w-5" />
        {t('title')}
      </h2>
      {view && (
        <p className="text-sm" role="status">
          {t(`states.${view.establishmentStatus}`)}
          {view.agreementReference ? ` · ${view.agreementReference}` : ''}
        </p>
      )}
      <p className="text-sm">{t('overview')}</p>
      {view?.agreement && (
        <div className="text-sm">
          <p>
            {view.agreement.reason}{' '}
            {String(view.agreement.date ?? '').slice(0, 10)}
          </p>
          {view.agreement.establishedAt && (
            <p>
              {t('recordedBy')}:{' '}
              {view.agreement.establishedByHsaId ?? t('anonymousActor')} ·{' '}
              {String(view.agreement.establishedAt)}
            </p>
          )}
          {view.agreement.endedAt && (
            <p>
              {t('endAgreement')}: {view.agreement.endReason} ·{' '}
              {String(view.agreement.endDate).slice(0, 10)} ·{' '}
              {view.agreement.endedByHsaId ?? t('anonymousActor')}
            </p>
          )}
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {busy && <p role="status">{t('working')}</p>}
      {comparison ? (
        <div className="space-y-3">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="text-left font-medium">
                {t('comparison')}
              </caption>
              <thead>
                <tr>
                  <th scope="col">{t('field')}</th>
                  <th scope="col">{t('pinned')}</th>
                  <th scope="col">{t('published')}</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    'versionNumber',
                    'description',
                    'acceptanceCriteria',
                    'verificationMethod',
                    'verifiable',
                    'category',
                    'type',
                    'qualityCharacteristic',
                    'priority',
                    'normReferences',
                  ] as const
                ).map(key => (
                  <tr
                    className="border-t border-secondary-200 dark:border-secondary-700"
                    key={key}
                  >
                    <th className="p-2 align-top" scope="row">
                      {t(`fields.${key}`)}
                    </th>
                    <td className="whitespace-pre-wrap p-2 align-top">
                      {comparisonValue(comparison.pinned, key)}
                    </td>
                    <td className="whitespace-pre-wrap p-2 align-top">
                      {comparisonValue(comparison.published, key)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>{t('adoptionHelp')}</p>
          {view?.canAuthor && view.establishmentStatus === 'established' && (
            <button
              className="btn-primary"
              disabled={busy}
              onClick={() => {
                setChanges(previous => [
                  ...previous,
                  {
                    kind: 'replace_library',
                    uiKey: crypto.randomUUID(),
                    itemRef: comparedItemRef,
                    targetVersionId: comparison.published.id,
                  },
                ])
                setComparison(null)
              }}
              type="button"
            >
              {t('stageReplacement')}
            </button>
          )}
          <button
            className="btn-secondary"
            disabled={busy}
            onClick={() => setComparison(null)}
            type="button"
          >
            {t('keep')}
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {(['current', 'original', 'history'] as const).map(value => (
              <button
                aria-pressed={tab === value}
                className="btn-secondary"
                key={value}
                onClick={() => setTab(value)}
                type="button"
              >
                {t(value)}
              </button>
            ))}
            <button
              className="btn-secondary"
              disabled={!view}
              onClick={downloadView}
              type="button"
            >
              {t('export')}
            </button>
          </div>
          <ul className="max-h-80 space-y-3 overflow-auto">
            {displayedItems?.map(item => (
              <li
                className="space-y-2 rounded-lg border border-secondary-200 p-3 dark:border-secondary-700"
                key={item.itemRef}
              >
                <p className="whitespace-pre-wrap">{item.description}</p>
                <p className="text-sm">
                  {item.versionNumber ? `v${item.versionNumber} · ` : ''}
                  {t(`usage.${item.specificationItemStatusId}`)}
                </p>
                {item.needsReference && (
                  <p>
                    {t('needsReference')}: {item.needsReference}
                  </p>
                )}
                {item.acceptanceCriteria && (
                  <p>
                    {t('fields.acceptanceCriteria')}: {item.acceptanceCriteria}
                  </p>
                )}
                {item.normReferences && (
                  <p>
                    {t('fields.normReferences')}: {item.normReferences}
                  </p>
                )}
                {tab !== 'current' && (
                  <p className="text-sm">
                    {String(item.validFrom)} – {String(item.validUntil ?? '')}
                  </p>
                )}
                {item.note && (
                  <p>
                    {t('note')}: {item.note}
                  </p>
                )}
                {item.amendmentId && (
                  <p>{t('changedThrough', { id: item.amendmentId })}</p>
                )}
                {item.reassessmentRequired && (
                  <p>{t('reassessmentRequired')}</p>
                )}
                {canChange && item.newerPublishedVersionId && (
                  <button
                    className="btn-secondary"
                    disabled={busy}
                    onClick={() => void compare(item.itemRef)}
                    type="button"
                  >
                    {t('compare')}
                  </button>
                )}
                {canChange && item.reassessmentRequired && (
                  <button
                    className="btn-primary"
                    disabled={disabled}
                    onClick={() =>
                      void mutate({
                        operation: 'reassess',
                        itemRef: item.itemRef,
                        reason,
                        specificationItemStatusId: usageStatus,
                      })
                    }
                    type="button"
                  >
                    {t('reassess')}
                  </button>
                )}
                {view?.deviations
                  ?.filter(deviation => deviation.itemRef === item.itemRef)
                  .map(deviation => (
                    <div
                      className="border-l-2 border-secondary-300 pl-3 dark:border-secondary-600"
                      key={deviation.id}
                    >
                      <p>
                        {t(`deviation.${deviation.decision ?? 'active'}`)} ·{' '}
                        {deviation.motivation}
                      </p>
                      {deviation.decisionMotivation && (
                        <p>{deviation.decisionMotivation}</p>
                      )}
                      {canChange && deviation.decision === null && (
                        <button
                          className="btn-secondary"
                          disabled={disabled}
                          onClick={() =>
                            void mutate({
                              operation: 'cancel_deviation',
                              itemRef: item.itemRef,
                              deviationId: deviation.id,
                              reason,
                            })
                          }
                          type="button"
                        >
                          {t('cancelDeviation')}
                        </button>
                      )}
                    </div>
                  ))}
              </li>
            ))}
          </ul>
        </>
      )}
      {view?.canAuthor && (
        <div className="space-y-3 border-t border-secondary-200 pt-3 dark:border-secondary-700">
          <AgreementField name="reason">
            <textarea
              className="rounded-lg border border-secondary-300 bg-white px-3 py-2 text-secondary-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:border-secondary-600 dark:bg-secondary-800 dark:text-secondary-100 w-full"
              id="agreement-reason"
              maxLength={10000}
              onChange={event => setReason(event.target.value)}
              value={reason}
            />
          </AgreementField>
          {comparison && view.establishmentStatus === 'editable' && (
            <button
              className="btn-primary"
              disabled={disabled}
              onClick={() =>
                void mutate({
                  operation: 'adopt',
                  reason,
                  itemRef: comparedItemRef,
                  targetVersionId: comparison.published.id,
                })
              }
              type="button"
            >
              {t('adopt')}
            </button>
          )}
          {!comparison && (
            <>
              {(canEstablish || view.establishmentStatus === 'established') && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <AgreementField name="agreementReference">
                    <input
                      className="rounded-lg border border-secondary-300 bg-white px-3 py-2 text-secondary-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:border-secondary-600 dark:bg-secondary-800 dark:text-secondary-100 w-full"
                      id="agreement-agreementReference"
                      maxLength={2000}
                      onChange={event =>
                        setAgreementReference(event.target.value)
                      }
                      value={agreementReference}
                    />
                  </AgreementField>
                  <AgreementField name="effectiveDate">
                    <input
                      className="rounded-lg border border-secondary-300 bg-white px-3 py-2 text-secondary-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:border-secondary-600 dark:bg-secondary-800 dark:text-secondary-100 w-full"
                      id="agreement-effectiveDate"
                      onChange={event => setEffectiveDate(event.target.value)}
                      type="date"
                      value={effectiveDate}
                    />
                  </AgreementField>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {view.canDecide &&
                  view.establishmentStatus === 'assessment' && (
                    <button
                      className="btn-secondary"
                      disabled={disabled}
                      onClick={() =>
                        void mutate({ operation: 'confirm_editable', reason })
                      }
                      type="button"
                    >
                      {t('confirmEditable')}
                    </button>
                  )}
                {canEstablish && (
                  <button
                    className="btn-primary"
                    disabled={
                      disabled || !agreementReference.trim() || !effectiveDate
                    }
                    onClick={() =>
                      void mutate({
                        operation: 'establish',
                        reason,
                        agreementReference,
                        effectiveDate,
                      })
                    }
                    type="button"
                  >
                    {t('establish')}
                  </button>
                )}
                {view.canDecide &&
                  view.establishmentStatus === 'established' && (
                    <button
                      className="btn-secondary"
                      disabled={disabled || !effectiveDate}
                      onClick={() =>
                        void mutate({
                          operation: 'end_agreement',
                          reason,
                          effectiveDate,
                        })
                      }
                      type="button"
                    >
                      {t('endAgreement')}
                    </button>
                  )}
              </div>
              {view.currentItems.some(item => item.reassessmentRequired) && (
                <AgreementField name="usageStatus">
                  <select
                    className="rounded-lg border border-secondary-300 bg-white px-3 py-2 text-secondary-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:border-secondary-600 dark:bg-secondary-800 dark:text-secondary-100"
                    id="agreement-usageStatus"
                    onChange={event =>
                      setUsageStatus(Number(event.target.value))
                    }
                    value={usageStatus}
                  >
                    {[1, 2, 3, 4, 5, 6].map(id => (
                      <option key={id} value={id}>
                        {t(`usage.${id}`)}
                      </option>
                    ))}
                  </select>
                </AgreementField>
              )}
              {view.establishmentStatus === 'established' && (
                <fieldset
                  className="space-y-3 rounded-lg border border-secondary-200 p-3 dark:border-secondary-700"
                  disabled={busy}
                >
                  <legend>{t('prepare')}</legend>
                  <AgreementField name="changeKind">
                    <select
                      className="rounded-lg border border-secondary-300 bg-white px-3 py-2 text-secondary-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:border-secondary-600 dark:bg-secondary-800 dark:text-secondary-100 w-full"
                      id="agreement-changeKind"
                      onChange={event =>
                        setChangeKind(event.target.value as typeof changeKind)
                      }
                      value={changeKind}
                    >
                      {(
                        [
                          'remove',
                          'change_local',
                          'add_library',
                          'add_local',
                        ] as const
                      ).map(kind => (
                        <option key={kind} value={kind}>
                          {t(`changes.${kind}`)}
                        </option>
                      ))}
                    </select>
                  </AgreementField>
                  {changeKind === 'add_library' && (
                    <AgreementField name="versionSearch" required={false}>
                      <input
                        className="w-full rounded-lg border border-secondary-300 bg-transparent px-3 py-2 dark:border-secondary-600"
                        id="agreement-versionSearch"
                        maxLength={250}
                        onChange={event => setVersionSearch(event.target.value)}
                        value={versionSearch}
                      />
                      <button
                        className="btn-secondary"
                        onClick={() => void load(versionSearch)}
                        type="button"
                      >
                        {t('searchVersions')}
                      </button>
                    </AgreementField>
                  )}
                  {changeKind === 'add_library' ? (
                    <AgreementField name="libraryVersion">
                      <select
                        className="rounded-lg border border-secondary-300 bg-white px-3 py-2 text-secondary-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:border-secondary-600 dark:bg-secondary-800 dark:text-secondary-100 w-full"
                        id="agreement-libraryVersion"
                        onChange={event =>
                          setSelectedVersionId(event.target.value)
                        }
                        value={selectedVersionId}
                      >
                        <option value="">{t('select')}</option>
                        {view.availableVersions?.map(version => (
                          <option key={version.id} value={version.id}>
                            {version.uniqueId} v{version.versionNumber} —{' '}
                            {version.description}
                          </option>
                        ))}
                      </select>
                    </AgreementField>
                  ) : (
                    changeKind !== 'add_local' && (
                      <AgreementField name="application">
                        <select
                          className="rounded-lg border border-secondary-300 bg-white px-3 py-2 text-secondary-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:border-secondary-600 dark:bg-secondary-800 dark:text-secondary-100 w-full"
                          id="agreement-application"
                          onChange={event =>
                            setSelectedItemRef(event.target.value)
                          }
                          value={selectedItemRef}
                        >
                          <option value="">{t('select')}</option>
                          {view.currentItems
                            .filter(
                              item =>
                                changeKind !== 'change_local' ||
                                item.itemRef.startsWith('local:'),
                            )
                            .map(item => (
                              <option key={item.itemRef} value={item.itemRef}>
                                {item.description}
                              </option>
                            ))}
                        </select>
                      </AgreementField>
                    )
                  )}
                  {(changeKind === 'change_local' ||
                    changeKind === 'add_local') && (
                    <AgreementField name="localText">
                      <textarea
                        className="rounded-lg border border-secondary-300 bg-white px-3 py-2 text-secondary-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:border-secondary-600 dark:bg-secondary-800 dark:text-secondary-100 w-full"
                        id="agreement-localText"
                        maxLength={10000}
                        onChange={event => setLocalText(event.target.value)}
                        value={localText}
                      />
                    </AgreementField>
                  )}
                  <button
                    className="btn-secondary"
                    disabled={
                      changeKind === 'add_local'
                        ? !localText.trim()
                        : changeKind === 'add_library'
                          ? !selectedVersionId
                          : !selectedItemRef ||
                            (changeKind === 'change_local' && !localText.trim())
                    }
                    onClick={stageChange}
                    type="button"
                  >
                    {t('stageChange')}
                  </button>
                  <ul>
                    {changes.map((change, index) => (
                      <li
                        className="flex items-center gap-2"
                        key={change.uiKey}
                      >
                        <span>
                          {t(`changes.${change.kind}`)}:{' '}
                          {'itemRef' in change
                            ? view.currentItems.find(
                                item => item.itemRef === change.itemRef,
                              )?.description
                            : 'targetVersionId' in change
                              ? view.availableVersions?.find(
                                  version =>
                                    version.id === change.targetVersionId,
                                )?.description
                              : change.description}
                        </span>
                        <button
                          className="btn-secondary"
                          onClick={() =>
                            setChanges(previous =>
                              previous.filter((_, row) => row !== index),
                            )
                          }
                          type="button"
                        >
                          {t('discardChange')}
                        </button>
                      </li>
                    ))}
                  </ul>
                  {replacesAmendmentId && (
                    <p>{t('corrects', { id: replacesAmendmentId })}</p>
                  )}
                  <button
                    className="btn-primary"
                    disabled={
                      disabled ||
                      !agreementReference.trim() ||
                      !effectiveDate ||
                      !changes.length
                    }
                    onClick={() =>
                      void mutate({
                        operation: 'prepare_amendment',
                        reason,
                        agreementReference,
                        effectiveDate,
                        changes: changes.map(
                          ({ uiKey: _uiKey, ...change }) => change,
                        ),
                        ...(replacesAmendmentId ? { replacesAmendmentId } : {}),
                      })
                    }
                    type="button"
                  >
                    {t('prepare')}
                  </button>
                </fieldset>
              )}
            </>
          )}
        </div>
      )}
      {!!view?.amendments.length && (
        <div className="space-y-3">
          <h3 className="font-semibold">{t('amendments')}</h3>
          {view.amendments.map(amendment => (
            <article
              className="space-y-2 rounded-lg border border-secondary-200 p-3 dark:border-secondary-700"
              key={amendment.id}
            >
              <h4 className="font-semibold">
                {t('amendmentNumber', { id: amendment.id })} ·{' '}
                <span role="status">
                  {t(`amendmentStates.${amendment.status}`)}
                </span>
              </h4>
              <p>
                {t('recordedBy')}:{' '}
                {amendment.createdByHsaId ?? t('anonymousActor')} ·{' '}
                {String(amendment.createdAt)}
              </p>
              {amendment.decidedAt && (
                <p>
                  {t('decide')}:{' '}
                  {amendment.decidedByHsaId ?? t('anonymousActor')} ·{' '}
                  {String(amendment.decidedAt)}
                </p>
              )}
              {amendment.cancelledAt && (
                <p>
                  {t('cancelAmendment')}:{' '}
                  {amendment.cancelledByHsaId ?? t('anonymousActor')} ·{' '}
                  {String(amendment.cancelledAt)}
                </p>
              )}
              <p>{amendment.reason}</p>
              <p>
                {amendment.agreementReference} ·{' '}
                {amendment.effectiveDate
                  ? String(amendment.effectiveDate).slice(0, 10)
                  : ''}
              </p>
              {amendment.replacesAmendmentId && (
                <p>{t('corrects', { id: amendment.replacesAmendmentId })}</p>
              )}
              {amendment.cancellationReason && (
                <p>
                  {t('cancellationReason')}: {amendment.cancellationReason}
                </p>
              )}
              <ul>
                {amendment.changes.map((change, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: Stored amendment proposals and their order are immutable.
                  <li key={`${index}-${change.kind}`}>
                    {t(`changes.${change.kind}`)} ·{' '}
                    {'itemRef' in change
                      ? [...view.currentItems, ...view.historyItems].find(
                          item => item.itemRef === change.itemRef,
                        )?.description
                      : t('newRequirement')}{' '}
                    {'description' in change
                      ? change.description
                      : 'targetVersionId' in change
                        ? `v${view.selectedVersions?.find(version => version.id === change.targetVersionId)?.versionNumber ?? ''}: ${view.selectedVersions?.find(version => version.id === change.targetVersionId)?.description ?? ''}`
                        : ''}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                {view.canDecide && amendment.status === 'draft' && (
                  <button
                    className="btn-primary"
                    disabled={busy}
                    onClick={() =>
                      void mutate({
                        operation: 'decide_amendment',
                        amendmentId: amendment.id,
                      })
                    }
                    type="button"
                  >
                    {t('decide')}
                  </button>
                )}
                {view.canDecide &&
                  ['draft', 'decided'].includes(amendment.status) && (
                    <button
                      className="btn-secondary"
                      disabled={disabled}
                      onClick={() =>
                        void mutate({
                          operation: 'cancel_amendment',
                          amendmentId: amendment.id,
                          reason,
                        })
                      }
                      type="button"
                    >
                      {t('cancelAmendment')}
                    </button>
                  )}
                {view.canAuthor &&
                  ['cancelled', 'effective'].includes(amendment.status) &&
                  view.establishmentStatus === 'established' && (
                    <button
                      className="btn-secondary"
                      onClick={() => setReplacesAmendmentId(amendment.id)}
                      type="button"
                    >
                      {t('prepareCorrection')}
                    </button>
                  )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

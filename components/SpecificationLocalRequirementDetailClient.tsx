'use client'

import { AlertTriangle, Pencil, Printer, Trash2 } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useConfirmModal } from '@/components/ConfirmModal'
import DeviationDecisionModal from '@/components/DeviationDecisionModal'
import DeviationFormModal from '@/components/DeviationFormModal'
import DeviationPill from '@/components/DeviationPill'
import type { DeviationStep } from '@/components/DeviationStepper'
import RequirementDetailSections from '@/components/RequirementDetailSections'
import SpecificationLocalRequirementForm, {
  type SpecificationLocalRequirementSubmitPayload,
} from '@/components/SpecificationLocalRequirementForm'
import { devMarker } from '@/lib/developer-mode-markers'
import { apiFetch } from '@/lib/http/api-fetch'
import { DEFAULT_SPECIFICATION_ITEM_STATUS_ID } from '@/lib/specification-item-status-constants'

interface SpecificationLocalRequirementDetail {
  acceptanceCriteria: string | null
  createdAt: string
  description: string
  id: number
  itemRef: string
  needsReference: string | null
  needsReferenceId: number | null
  normReferences: {
    id: number
    name: string
    normReferenceId: string
    uri: string | null
  }[]
  qualityCharacteristic: { id: number; nameEn: string; nameSv: string } | null
  requirementArea: { id: number; name: string } | null
  requirementCategory: { id: number; nameEn: string; nameSv: string } | null
  requirementType: { id: number; nameEn: string; nameSv: string } | null
  requiresTesting: boolean
  riskLevel: {
    color: string
    id: number
    nameEn: string
    nameSv: string
  } | null
  scenarios: {
    id: number
    nameEn: string | null
    nameSv: string | null
  }[]
  specificationId: number
  specificationItemStatusColor: string | null
  specificationItemStatusId: number | null
  specificationItemStatusNameEn: string | null
  specificationItemStatusNameSv: string | null
  uniqueId: string
  updatedAt: string
  verificationMethod: string | null
}

interface DeviationData {
  createdAt: string
  createdBy: string | null
  decidedAt: string | null
  decidedBy: string | null
  decision: number | null
  decisionMotivation: string | null
  id: number
  isReviewRequested: number
  motivation: string
}

interface SpecificationLocalRequirementDetailClientProps {
  localRequirementId: number
  needsReferences: { id: number; text: string }[]
  onChange?: () => void | Promise<void>
  specificationSlug: string
}

function readResponseError(body: unknown): string | null {
  if (!body || typeof body !== 'object') {
    return null
  }

  const error = (body as { error?: unknown }).error
  if (typeof error === 'string' && error.trim().length > 0) {
    return error.trim()
  }

  return null
}

export default function SpecificationLocalRequirementDetailClient({
  localRequirementId,
  needsReferences,
  onChange,
  specificationSlug,
}: SpecificationLocalRequirementDetailClientProps) {
  const t = useTranslations('requirement')
  const tp = useTranslations('specification')
  const td = useTranslations('deviation')
  const tc = useTranslations('common')
  const locale = useLocale()
  const { confirm } = useConfirmModal()

  const localName = useCallback(
    (
      value:
        | { nameEn: string | null; nameSv: string | null }
        | null
        | undefined,
    ) =>
      value
        ? locale === 'sv'
          ? (value.nameSv ?? value.nameEn)
          : (value.nameEn ?? value.nameSv)
        : null,
    [locale],
  )

  const [requirement, setRequirement] =
    useState<SpecificationLocalRequirementDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showEditForm, setShowEditForm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deviations, setDeviations] = useState<DeviationData[]>([])
  const [deviationError, setDeviationError] = useState<string | null>(null)
  const [deviationSaving, setDeviationSaving] = useState(false)
  const [showDeviationForm, setShowDeviationForm] = useState(false)
  const [showEditDeviationForm, setShowEditDeviationForm] = useState(false)
  const [showDecisionForm, setShowDecisionForm] = useState(false)

  const latestDeviation = useMemo(() => {
    if (deviations.length === 0) {
      return null
    }
    return deviations[deviations.length - 1]
  }, [deviations])

  const deviationHistory = useMemo(
    () => (deviations.length > 1 ? deviations.slice(0, -1) : []),
    [deviations],
  )

  const deviationStep = useMemo((): DeviationStep | null => {
    if (!latestDeviation) {
      return null
    }
    if (latestDeviation.decision !== null) {
      return 'decided'
    }
    if (latestDeviation.isReviewRequested === 1) {
      return 'review_requested'
    }
    return 'draft'
  }, [latestDeviation])

  const fetchRequirement = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await apiFetch(
        `/api/specifications/${specificationSlug}/local-requirements/${localRequirementId}`,
      )

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as unknown
        throw new Error(
          readResponseError(body) ?? tp('localRequirementNotFound'),
        )
      }

      setRequirement(
        (await response.json()) as SpecificationLocalRequirementDetail,
      )
    } catch (fetchError) {
      setRequirement(null)
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : tc('unexpectedError'),
      )
    } finally {
      setLoading(false)
    }
  }, [localRequirementId, specificationSlug, tc, tp])

  const fetchDeviations = useCallback(
    async (signal?: AbortSignal) => {
      if (!requirement?.itemRef) {
        setDeviations([])
        return
      }

      try {
        const response = await apiFetch(
          `/api/specification-item-deviations/${encodeURIComponent(requirement.itemRef)}`,
          signal ? { signal } : undefined,
        )

        if (signal?.aborted) return

        if (!response.ok) {
          setDeviationError(td('fetchFailed'))
          return
        }

        const data = (await response.json()) as {
          deviations: DeviationData[]
        }
        if (signal?.aborted) return
        setDeviationError(null)
        setDeviations(data.deviations)
      } catch (fetchError) {
        if (
          fetchError instanceof DOMException &&
          fetchError.name === 'AbortError'
        )
          return
        setDeviationError(td('fetchFailed'))
      }
    },
    [requirement?.itemRef, td],
  )

  useEffect(() => {
    void fetchRequirement()
  }, [fetchRequirement])

  useEffect(() => {
    setDeviations([])
    setDeviationError(null)
    const controller = new AbortController()
    void fetchDeviations(controller.signal)
    return () => controller.abort()
  }, [fetchDeviations])

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchRequirement(), fetchDeviations(), onChange?.()])
  }, [fetchDeviations, fetchRequirement, onChange])

  const handlePrint = useCallback(() => {
    if (!requirement?.itemRef) {
      return
    }

    window.open(
      `/${locale}/specifications/${encodeURIComponent(
        specificationSlug,
      )}/reports/print/list?refs=${encodeURIComponent(requirement.itemRef)}`,
      '_blank',
    )
  }, [locale, specificationSlug, requirement?.itemRef])

  const railSecondaryButtonClass =
    'btn-secondary inline-flex items-center gap-1.5 w-full justify-center min-h-[44px] min-w-[44px] disabled:cursor-not-allowed disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none'
  const railPrimaryButtonClass =
    'btn-primary inline-flex items-center gap-1.5 w-full justify-center min-h-[44px] min-w-[44px] disabled:cursor-not-allowed disabled:pointer-events-none'
  const railDangerButtonClass =
    'btn-secondary inline-flex items-center gap-1.5 w-full justify-center text-red-600 dark:text-red-400 border-red-200 dark:border-red-800/60 hover:bg-red-50 dark:hover:bg-red-950/20 min-h-[44px] min-w-[44px] disabled:cursor-not-allowed disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none disabled:text-secondary-400 dark:disabled:text-secondary-500 disabled:border-secondary-200 dark:disabled:border-secondary-700 disabled:bg-white dark:disabled:bg-secondary-800'
  const railAmberButtonClass =
    'inline-flex items-center gap-1.5 w-full justify-center rounded-xl border border-amber-500 bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600 hover:border-amber-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 disabled:opacity-50 min-h-[44px] min-w-[44px]'

  const handleEditSubmit = useCallback(
    async (payload: SpecificationLocalRequirementSubmitPayload) => {
      const response = await apiFetch(
        `/api/specifications/${specificationSlug}/local-requirements/${localRequirementId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      )

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as unknown
        throw new Error(readResponseError(body) ?? tc('error'))
      }

      setShowEditForm(false)
      await refreshAll()
    },
    [localRequirementId, specificationSlug, refreshAll, tc],
  )

  const handleDelete = useCallback(
    async (event?: React.MouseEvent<HTMLButtonElement>) => {
      if (isDeleting) return
      const anchorEl = event?.currentTarget
      const confirmed = await confirm({
        anchorEl,
        confirmText: tc('delete'),
        icon: 'caution',
        message: tp('deleteLocalRequirementConfirm'),
        title: tp('deleteLocalRequirementConfirmTitle'),
        variant: 'danger',
      })

      if (!confirmed) {
        return
      }

      setIsDeleting(true)
      try {
        const response = await apiFetch(
          `/api/specifications/${specificationSlug}/local-requirements/${localRequirementId}`,
          {
            method: 'DELETE',
          },
        )

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as unknown
          setError(readResponseError(body) ?? tc('error'))
          return
        }

        await onChange?.()
      } catch (deleteError) {
        setError(
          deleteError instanceof Error ? deleteError.message : tc('error'),
        )
      } finally {
        setIsDeleting(false)
      }
    },
    [
      confirm,
      isDeleting,
      localRequirementId,
      onChange,
      specificationSlug,
      tc,
      tp,
    ],
  )

  const performDeviationMutation = useCallback(
    async (
      input: RequestInfo,
      init?: RequestInit,
      fallbackError?: string,
      afterSuccess?: () => void,
    ) => {
      setDeviationSaving(true)

      try {
        const response = await apiFetch(input, init)
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as unknown
          setDeviationError(
            readResponseError(body) ?? fallbackError ?? tc('error'),
          )
          return false
        }

        setDeviationError(null)
        afterSuccess?.()
        await Promise.all([fetchDeviations(), onChange?.()])
        return true
      } catch (mutationError) {
        setDeviationError(
          mutationError instanceof Error
            ? mutationError.message
            : (fallbackError ?? tc('error')),
        )
        return false
      } finally {
        setDeviationSaving(false)
      }
    },
    [fetchDeviations, onChange, tc],
  )

  const handleCreateDeviation = useCallback(
    async (motivation: string, createdBy: string) => {
      if (!requirement?.itemRef || !motivation) {
        return
      }

      await performDeviationMutation(
        `/api/specification-item-deviations/${encodeURIComponent(requirement.itemRef)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            createdBy: createdBy || null,
            motivation,
          }),
        },
        td('saveFailed'),
        () => setShowDeviationForm(false),
      )
    },
    [performDeviationMutation, requirement?.itemRef, td],
  )

  const handleEditDeviation = useCallback(
    async (motivation: string, createdBy: string) => {
      if (!latestDeviation || !motivation) {
        return
      }

      await performDeviationMutation(
        `/api/specification-local-deviations/${latestDeviation.id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ motivation, createdBy: createdBy || null }),
        },
        td('saveFailed'),
        () => setShowEditDeviationForm(false),
      )
    },
    [latestDeviation, performDeviationMutation, td],
  )

  const handleDeleteDeviation = useCallback(
    async (event?: React.MouseEvent<HTMLButtonElement>) => {
      if (!latestDeviation) {
        return
      }

      const anchorEl = event?.currentTarget
      const confirmed = await confirm({
        anchorEl,
        icon: 'caution',
        message: td('deleteDeviationConfirm'),
        title: td('deleteDeviationConfirmTitle'),
        variant: 'danger',
      })

      if (!confirmed) {
        return
      }

      await performDeviationMutation(
        `/api/specification-local-deviations/${latestDeviation.id}`,
        { method: 'DELETE' },
        td('deleteFailed'),
      )
    },
    [confirm, latestDeviation, performDeviationMutation, td],
  )

  const handleRequestReview = useCallback(async () => {
    if (!latestDeviation) {
      return
    }

    await performDeviationMutation(
      `/api/specification-local-deviations/${latestDeviation.id}/request-review`,
      { method: 'POST' },
      td('reviewFailed'),
    )
  }, [latestDeviation, performDeviationMutation, td])

  const handleRevertToDraft = useCallback(
    async (event?: React.MouseEvent<HTMLButtonElement>) => {
      if (!latestDeviation) {
        return
      }

      const anchorEl = event?.currentTarget
      const confirmed = await confirm({
        anchorEl,
        icon: 'warning',
        message: td('revertToDraftConfirm'),
        title: td('revertToDraftConfirmTitle'),
        variant: 'default',
      })

      if (!confirmed) {
        return
      }

      await performDeviationMutation(
        `/api/specification-local-deviations/${latestDeviation.id}/revert-to-draft`,
        { method: 'POST' },
        td('revertFailed'),
      )
    },
    [confirm, latestDeviation, performDeviationMutation, td],
  )

  const handleRecordDecision = useCallback(
    async (decision: 1 | 2, motivation: string, decidedBy: string) => {
      if (!latestDeviation) {
        return
      }

      await performDeviationMutation(
        `/api/specification-local-deviations/${latestDeviation.id}/decision`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            decidedBy,
            decision,
            decisionMotivation: motivation,
          }),
        },
        td('decisionFailed'),
        () => setShowDecisionForm(false),
      )
    },
    [latestDeviation, performDeviationMutation, td],
  )

  if (loading) {
    return (
      <div className="flex min-h-40 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600 dark:border-primary-700 dark:border-t-primary-400" />
      </div>
    )
  }

  if (!requirement) {
    return (
      <div
        className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300"
        role="alert"
      >
        {error ?? tp('localRequirementNotFound')}
      </div>
    )
  }

  const metadata = [
    {
      id: 'area',
      label: t('area'),
      markerValue: 'area',
      value: requirement.requirementArea?.name ?? '—',
    },
    {
      id: 'category',
      label: t('category'),
      markerValue: 'category',
      value: localName(requirement.requirementCategory) ?? '—',
    },
    {
      id: 'type',
      label: t('type'),
      markerValue: 'type',
      value: localName(requirement.requirementType) ?? '—',
    },
    {
      id: 'quality-characteristic',
      label: t('qualityCharacteristic'),
      markerValue: 'quality characteristic',
      value: localName(requirement.qualityCharacteristic) ?? '—',
    },
    {
      id: 'risk-level',
      label: t('riskLevel'),
      markerValue: 'risk level',
      value: requirement.riskLevel ? (
        <span className="inline-flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: requirement.riskLevel.color }}
          />
          {localName(requirement.riskLevel)}
        </span>
      ) : (
        '—'
      ),
    },
    {
      id: 'requires-testing',
      label: t('requiresTesting'),
      markerValue: 'requires testing',
      value: requirement.requiresTesting ? tc('yes') : tc('no'),
    },
    {
      id: 'verification-method',
      label: t('verificationMethod'),
      markerValue: 'verification method',
      value:
        requirement.requiresTesting && requirement.verificationMethod
          ? requirement.verificationMethod
          : '—',
    },
    {
      id: 'needs-reference',
      label: tp('needsReference'),
      markerValue: 'needs reference',
      value: requirement.needsReference ?? '—',
    },
    {
      id: 'specification-item-status',
      label: t('specificationItemStatus'),
      markerValue: 'specification item status',
      value:
        requirement.specificationItemStatusNameEn ||
        requirement.specificationItemStatusNameSv ? (
          <span className="inline-flex items-center gap-2">
            {requirement.specificationItemStatusColor ? (
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{
                  backgroundColor: requirement.specificationItemStatusColor,
                }}
              />
            ) : null}
            {locale === 'sv'
              ? (requirement.specificationItemStatusNameSv ??
                requirement.specificationItemStatusNameEn)
              : (requirement.specificationItemStatusNameEn ??
                requirement.specificationItemStatusNameSv)}
          </span>
        ) : (
          '—'
        ),
    },
    {
      id: 'created-at',
      label: tc('createdAt'),
      markerValue: 'created at',
      value: new Date(requirement.createdAt).toLocaleDateString(locale),
    },
    {
      id: 'updated-at',
      label: tc('updatedAt'),
      markerValue: 'updated at',
      value: new Date(requirement.updatedAt).toLocaleDateString(locale),
    },
  ]

  const detailContext =
    'requirements specification detail > detail pane: specification-local requirement'
  const buildDetailSectionContext = (sectionName: string) =>
    `${detailContext} > detail section: ${sectionName}`

  const references = requirement.normReferences.map(reference => ({
    href: reference.uri,
    id: `specification-local-normref-${reference.id}`,
    label: reference.normReferenceId,
    markerContext: buildDetailSectionContext('normReferences'),
    markerValue: reference.normReferenceId,
    title: reference.name,
  }))

  const scenarios = requirement.scenarios.map(scenario => ({
    id: `specification-local-scenario-${scenario.id}`,
    label:
      locale === 'sv'
        ? (scenario.nameSv ?? scenario.nameEn)
        : (scenario.nameEn ?? scenario.nameSv),
    markerContext: buildDetailSectionContext('scenarios'),
    markerValue: scenario.nameEn ?? scenario.nameSv ?? String(scenario.id),
  }))

  const hasPendingDeviation =
    deviationStep === 'draft' || deviationStep === 'review_requested'
  const canMutateLocalRequirement =
    requirement.specificationItemStatusId ===
      DEFAULT_SPECIFICATION_ITEM_STATUS_ID && !hasPendingDeviation
  const localRequirementMutationTooltip = canMutateLocalRequirement
    ? undefined
    : tp('localRequirementActionDisabledTooltip')

  return (
    <div
      {...devMarker({
        context: 'requirements specification detail',
        name: 'detail pane',
        priority: 330,
        value: 'specification local requirement',
      })}
    >
      {showEditForm ? (
        <div className="px-6 py-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-700 dark:text-amber-300">
                  {tp('editLocalRequirement')}
                </p>
                <h3 className="mt-1 font-mono text-sm text-secondary-900 dark:text-secondary-100">
                  {requirement.uniqueId}
                </h3>
              </div>
            </div>

            <SpecificationLocalRequirementForm
              initialValue={{
                acceptanceCriteria: requirement.acceptanceCriteria ?? '',
                description: requirement.description,
                needsReferenceId: requirement.needsReferenceId
                  ? String(requirement.needsReferenceId)
                  : '',
                normReferenceIds: requirement.normReferences.map(
                  reference => reference.id,
                ),
                qualityCharacteristicId: requirement.qualityCharacteristic
                  ? String(requirement.qualityCharacteristic.id)
                  : '',
                areaId: requirement.requirementArea
                  ? String(requirement.requirementArea.id)
                  : '',
                categoryId: requirement.requirementCategory
                  ? String(requirement.requirementCategory.id)
                  : '',
                typeId: requirement.requirementType
                  ? String(requirement.requirementType.id)
                  : '',
                requiresTesting: requirement.requiresTesting,
                riskLevelId: requirement.riskLevel
                  ? String(requirement.riskLevel.id)
                  : '',
                scenarioIds: requirement.scenarios.map(scenario => scenario.id),
                verificationMethod: requirement.verificationMethod ?? '',
              }}
              needsReferences={needsReferences}
              onCancel={() => setShowEditForm(false)}
              onSubmit={handleEditSubmit}
              submitLabel={tc('save')}
            />
          </div>
        </div>
      ) : (
        <div className="px-6 py-4">
          <div className="space-y-6">
            {error ? (
              <p
                className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300"
                role="alert"
              >
                {error}
              </p>
            ) : null}

            {latestDeviation ? (
              <div className="mb-4">
                <DeviationPill
                  developerModeContext={detailContext}
                  history={deviationHistory}
                  latest={latestDeviation}
                />
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-6">
              <div className="space-y-6">
                <div className="relative flex flex-col gap-3 sm:flex-row">
                  <div className="relative flex-1 min-w-0 rounded-2xl border bg-white/80 p-6 shadow-sm backdrop-blur-sm space-y-5 dark:bg-secondary-900/60">
                    <RequirementDetailSections
                      acceptanceCriteria={requirement.acceptanceCriteria ?? '—'}
                      acceptanceCriteriaLabel={t('acceptanceCriteria')}
                      description={requirement.description}
                      descriptionLabel={t('description')}
                      developerModeContext={detailContext}
                      emptyLabel={tc('noneAvailable')}
                      metadata={metadata}
                      references={references}
                      referencesLabel={t('normReferences')}
                      scenarios={scenarios}
                      scenariosLabel={t('scenario')}
                    />
                  </div>

                  <div className="shrink-0">
                    <div className="flex flex-col gap-2">
                      {deviationStep !== 'draft' ? (
                        <button
                          className={railSecondaryButtonClass}
                          {...devMarker({
                            context: detailContext,
                            name: 'report print button',
                            priority: 289,
                            value: 'reports',
                          })}
                          onClick={handlePrint}
                          title={tc('print')}
                          type="button"
                        >
                          <Printer aria-hidden="true" className="h-4 w-4" />
                          {tc('print')}
                        </button>
                      ) : null}

                      {deviationError ? (
                        <p
                          className="text-sm text-red-600 dark:text-red-400"
                          role="alert"
                        >
                          {deviationError}
                        </p>
                      ) : null}

                      {deviationStep === null || deviationStep === 'decided' ? (
                        <button
                          className={railAmberButtonClass}
                          disabled={deviationSaving}
                          onClick={() => setShowDeviationForm(true)}
                          type="button"
                        >
                          <AlertTriangle
                            aria-hidden="true"
                            className="h-4 w-4"
                          />
                          {td('requestDeviation')}
                        </button>
                      ) : deviationStep === 'draft' ? (
                        <>
                          <button
                            className={railAmberButtonClass}
                            disabled={deviationSaving}
                            onClick={() => setShowEditDeviationForm(true)}
                            type="button"
                          >
                            <Pencil aria-hidden="true" className="h-4 w-4" />
                            {td('editDeviation')}
                          </button>
                          <button
                            className={railDangerButtonClass}
                            disabled={deviationSaving}
                            onClick={event => void handleDeleteDeviation(event)}
                            type="button"
                          >
                            <Trash2 aria-hidden="true" className="h-4 w-4" />
                            {td('deleteDeviation')}
                          </button>
                          <button
                            className={railPrimaryButtonClass}
                            disabled={deviationSaving}
                            onClick={() => void handleRequestReview()}
                            type="button"
                          >
                            {td('requestReview')}
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className={railSecondaryButtonClass}
                            disabled={deviationSaving}
                            onClick={event => void handleRevertToDraft(event)}
                            type="button"
                          >
                            {td('revertToDraft')}
                          </button>
                          <button
                            className={railPrimaryButtonClass}
                            disabled={deviationSaving}
                            onClick={() => setShowDecisionForm(true)}
                            type="button"
                          >
                            {td('recordDecision')}
                          </button>
                        </>
                      )}

                      <span
                        className="inline-flex w-full"
                        title={localRequirementMutationTooltip}
                      >
                        <button
                          className={railSecondaryButtonClass}
                          disabled={!canMutateLocalRequirement || isDeleting}
                          {...devMarker({
                            context: detailContext,
                            name: 'detail action',
                            priority: 290,
                            value: 'edit local requirement',
                          })}
                          onClick={() => setShowEditForm(true)}
                          type="button"
                        >
                          <Pencil aria-hidden="true" className="h-4 w-4" />
                          {tc('edit')}
                        </button>
                      </span>
                      <span
                        className="inline-flex w-full"
                        title={localRequirementMutationTooltip}
                      >
                        <button
                          className={railDangerButtonClass}
                          disabled={!canMutateLocalRequirement || isDeleting}
                          {...devMarker({
                            context: detailContext,
                            name: 'detail action',
                            priority: 291,
                            value: 'delete local requirement',
                          })}
                          onClick={event => void handleDelete(event)}
                          type="button"
                        >
                          <Trash2 aria-hidden="true" className="h-4 w-4" />
                          {tc('delete')}
                        </button>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <DeviationFormModal
        loading={deviationSaving}
        onClose={() => setShowDeviationForm(false)}
        onSubmit={handleCreateDeviation}
        open={showDeviationForm}
      />
      <DeviationFormModal
        initialCreatedBy={latestDeviation?.createdBy ?? ''}
        initialMotivation={latestDeviation?.motivation ?? ''}
        loading={deviationSaving}
        onClose={() => setShowEditDeviationForm(false)}
        onSubmit={handleEditDeviation}
        open={showEditDeviationForm}
        title={td('editDeviation')}
      />
      <DeviationDecisionModal
        loading={deviationSaving}
        onClose={() => setShowDecisionForm(false)}
        onSubmit={handleRecordDecision}
        open={showDecisionForm}
      />
    </div>
  )
}

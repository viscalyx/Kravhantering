'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { AlertTriangle, LibraryBig, Pencil, Trash2 } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useConfirmModal } from '@/components/ConfirmModal'
import DeviationDecisionModal from '@/components/DeviationDecisionModal'
import DeviationFormModal from '@/components/DeviationFormModal'
import DeviationPill from '@/components/DeviationPill'
import type { DeviationStep } from '@/components/DeviationStepper'
import RequirementDetailCard from '@/components/RequirementDetailCard'
import RequirementDetailSections from '@/components/RequirementDetailSections'
import SpecificationLocalRequirementForm, {
  type SpecificationLocalRequirementSubmitPayload,
} from '@/components/SpecificationLocalRequirementForm'
import StatusBadge from '@/components/StatusBadge'
import { useModalFocus } from '@/hooks/useModalFocus'
import { useRouter } from '@/i18n/routing'
import { devMarker } from '@/lib/developer-mode-markers'
import { apiFetch } from '@/lib/http/api-fetch'
import { dialogPanelMotion, fadeMotion } from '@/lib/reduced-motion'
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
  priorityLevel: {
    color: string
    iconName: string | null
    id: number
    nameEn: string
    nameSv: string
  } | null
  qualityCharacteristic: { id: number; nameEn: string; nameSv: string } | null
  requirementArea: null
  requirementCategory: { id: number; nameEn: string; nameSv: string } | null
  requirementPackages: {
    id: number
    name: string | null
  }[]
  requirementType: { id: number; nameEn: string; nameSv: string } | null
  requiresTesting: boolean
  specificationId: number
  specificationItemStatusColor: string | null
  specificationItemStatusIconName: string | null
  specificationItemStatusId: number | null
  specificationItemStatusNameEn: string | null
  specificationItemStatusNameSv: string | null
  uniqueId: string
  updatedAt: string
  verificationMethod: string | null
}

interface SpecificationLocalRequirementUsageStatusSnapshot {
  specificationItemStatusColor: string | null
  specificationItemStatusIconName: string | null
  specificationItemStatusId: number | null
  specificationItemStatusNameEn: string | null
  specificationItemStatusNameSv: string | null
}

function applyUsageStatusSnapshot(
  requirement: SpecificationLocalRequirementDetail,
  usageStatus: SpecificationLocalRequirementUsageStatusSnapshot | undefined,
) {
  if (!usageStatus) {
    return requirement
  }

  if (
    requirement.specificationItemStatusId ===
      usageStatus.specificationItemStatusId &&
    requirement.specificationItemStatusNameSv ===
      usageStatus.specificationItemStatusNameSv &&
    requirement.specificationItemStatusNameEn ===
      usageStatus.specificationItemStatusNameEn &&
    requirement.specificationItemStatusColor ===
      usageStatus.specificationItemStatusColor &&
    requirement.specificationItemStatusIconName ===
      usageStatus.specificationItemStatusIconName
  ) {
    return requirement
  }

  return {
    ...requirement,
    specificationItemStatusColor: usageStatus.specificationItemStatusColor,
    specificationItemStatusIconName:
      usageStatus.specificationItemStatusIconName,
    specificationItemStatusId: usageStatus.specificationItemStatusId,
    specificationItemStatusNameEn: usageStatus.specificationItemStatusNameEn,
    specificationItemStatusNameSv: usageStatus.specificationItemStatusNameSv,
  }
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

interface GraduationTargetArea {
  id: number
  name: string
  prefix: string
}

interface SpecificationLocalRequirementDetailClientProps {
  localRequirementId: number
  needsReferences: { id: number; text: string }[]
  onChange?: () => void | Promise<void>
  specificationSlug: string
  usageStatus?: SpecificationLocalRequirementUsageStatusSnapshot
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

interface GraduationTargetAreaModalProps {
  areas: GraduationTargetArea[]
  error: string | null
  idPrefix: string
  loading: boolean
  onClose: () => void
  onSelectArea: (areaId: string) => void
  onSubmit: () => void
  open: boolean
  selectedAreaId: string
}

function GraduationTargetAreaModal({
  areas,
  error,
  idPrefix,
  loading,
  onClose,
  onSelectArea,
  onSubmit,
  open,
  selectedAreaId,
}: GraduationTargetAreaModalProps) {
  const tp = useTranslations('specification')
  const tc = useTranslations('common')
  const shouldReduceMotion = useReducedMotion()
  const modalRef = useRef<HTMLDivElement>(null)
  const selectRef = useRef<HTMLSelectElement>(null)
  const selectedArea = areas.find(area => String(area.id) === selectedAreaId)
  const titleId = `${idPrefix}-title`
  const descriptionId = `${idPrefix}-description`
  const targetHelpId = `${idPrefix}-target-help`
  const selectId = `${idPrefix}-target-area`
  const { handleKeyDown } = useModalFocus({
    closeDisabled: loading,
    initialFocusRef: selectRef,
    modalRef,
    onClose,
    open,
  })

  if (typeof window === 'undefined') {
    return null
  }

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          key="graduation-target-area-modal"
          {...fadeMotion(shouldReduceMotion)}
        >
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-black/45 backdrop-blur-sm"
          />
          <motion.div
            aria-describedby={`${descriptionId} ${targetHelpId}`}
            aria-labelledby={titleId}
            aria-modal="true"
            className="relative z-50 w-full max-w-lg rounded-lg border border-secondary-200 bg-white p-5 shadow-2xl dark:border-secondary-700 dark:bg-secondary-900"
            {...devMarker({
              name: 'dialog',
              priority: 420,
              value: 'graduate-local-requirement',
            })}
            onKeyDown={handleKeyDown}
            ref={modalRef}
            role="dialog"
            {...dialogPanelMotion(shouldReduceMotion)}
          >
            <div className="space-y-4">
              <div className="space-y-1">
                <h2
                  className="text-base font-semibold text-secondary-900 dark:text-secondary-100"
                  id={titleId}
                >
                  {tp('graduateLocalRequirementConfirmTitle')}
                </h2>
                <p
                  className="text-sm text-secondary-600 dark:text-secondary-300"
                  id={descriptionId}
                >
                  {tp('graduateLocalRequirementConfirm')}
                </p>
              </div>

              <div className="space-y-2">
                <label
                  className="block text-xs font-semibold uppercase tracking-[0.08em] text-secondary-500 dark:text-secondary-400"
                  htmlFor={selectId}
                >
                  {tp('graduateLocalRequirementTargetLabel')}
                </label>
                <select
                  aria-describedby={targetHelpId}
                  className="min-h-11 w-full rounded-lg border border-secondary-300 bg-white px-3.5 py-2.5 text-sm text-secondary-900 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-400/50 dark:border-secondary-600 dark:bg-secondary-800/50 dark:text-secondary-100"
                  disabled={loading}
                  id={selectId}
                  onChange={event => onSelectArea(event.target.value)}
                  ref={selectRef}
                  value={selectedAreaId}
                >
                  {areas.map(area => (
                    <option key={area.id} value={area.id}>
                      {area.name} ({area.prefix})
                    </option>
                  ))}
                </select>
                <p
                  className="text-sm text-secondary-600 dark:text-secondary-300"
                  id={targetHelpId}
                >
                  {tp('graduateLocalRequirementTargetHelp')}
                </p>
              </div>

              {error ? (
                <p
                  className="text-sm text-red-600 dark:text-red-400"
                  role="alert"
                >
                  {error}
                </p>
              ) : null}

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  className="btn-secondary min-h-11 w-full justify-center"
                  disabled={loading}
                  onClick={onClose}
                  type="button"
                >
                  {tc('cancel')}
                </button>
                <button
                  className="btn-primary min-h-11 w-full justify-center"
                  disabled={loading || !selectedArea}
                  onClick={() => onSubmit()}
                  type="button"
                >
                  {tp('graduateLocalRequirementConfirmText')}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}

export default function SpecificationLocalRequirementDetailClient({
  localRequirementId,
  needsReferences,
  onChange,
  specificationSlug,
  usageStatus,
}: SpecificationLocalRequirementDetailClientProps) {
  const t = useTranslations('requirement')
  const tp = useTranslations('specification')
  const td = useTranslations('deviation')
  const tc = useTranslations('common')
  const locale = useLocale()
  const router = useRouter()
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
  const [graduationTargetAreas, setGraduationTargetAreas] = useState<
    GraduationTargetArea[]
  >([])
  const [graduationTargetAreasLoaded, setGraduationTargetAreasLoaded] =
    useState(false)
  const [graduationError, setGraduationError] = useState<string | null>(null)
  const [isGraduating, setIsGraduating] = useState(false)
  const [selectedGraduationAreaId, setSelectedGraduationAreaId] =
    useState<string>('')
  const [showGraduationModal, setShowGraduationModal] = useState(false)
  const usageStatusRef = useRef(usageStatus)

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
        `/api/requirements-specifications/${specificationSlug}/local-requirements/${localRequirementId}`,
      )

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as unknown
        throw new Error(
          readResponseError(body) ?? tp('localRequirementNotFound'),
        )
      }

      const detail =
        (await response.json()) as SpecificationLocalRequirementDetail
      setRequirement(applyUsageStatusSnapshot(detail, usageStatusRef.current))
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

  const fetchGraduationTargetAreas = useCallback(
    async (signal?: AbortSignal) => {
      if (!requirement) {
        setGraduationTargetAreas([])
        setSelectedGraduationAreaId('')
        setGraduationTargetAreasLoaded(false)
        return
      }

      setGraduationTargetAreasLoaded(false)
      try {
        const response = await apiFetch(
          `/api/requirements-specifications/${specificationSlug}/local-requirements/${localRequirementId}/graduation-target-areas`,
          signal ? { signal } : undefined,
        )

        if (signal?.aborted) return

        if (!response.ok) {
          setGraduationTargetAreas([])
          setSelectedGraduationAreaId('')
          return
        }

        const data = (await response.json()) as {
          areas?: GraduationTargetArea[]
        }
        if (signal?.aborted) return

        const areas = data.areas ?? []
        setGraduationTargetAreas(areas)
        setSelectedGraduationAreaId(current =>
          areas.some(area => String(area.id) === current)
            ? current
            : areas[0]
              ? String(areas[0].id)
              : '',
        )
      } catch (fetchError) {
        if (
          fetchError instanceof DOMException &&
          fetchError.name === 'AbortError'
        )
          return
        setGraduationTargetAreas([])
        setSelectedGraduationAreaId('')
      } finally {
        if (!signal?.aborted) {
          setGraduationTargetAreasLoaded(true)
        }
      }
    },
    [localRequirementId, requirement, specificationSlug],
  )

  useEffect(() => {
    void fetchRequirement()
  }, [fetchRequirement])

  useEffect(() => {
    usageStatusRef.current = usageStatus

    if (!usageStatus) {
      return
    }

    setRequirement(current => {
      if (!current) {
        return current
      }

      return applyUsageStatusSnapshot(current, usageStatus)
    })
  }, [usageStatus])

  useEffect(() => {
    setDeviations([])
    setDeviationError(null)
    const controller = new AbortController()
    void fetchDeviations(controller.signal)
    return () => controller.abort()
  }, [fetchDeviations])

  useEffect(() => {
    setGraduationError(null)
    const controller = new AbortController()
    void fetchGraduationTargetAreas(controller.signal)
    return () => controller.abort()
  }, [fetchGraduationTargetAreas])

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchRequirement(), fetchDeviations(), onChange?.()])
  }, [fetchDeviations, fetchRequirement, onChange])

  const railSecondaryButtonClass =
    'btn-secondary inline-flex items-center gap-1.5 w-full justify-center min-h-11 min-w-11 disabled:cursor-not-allowed disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none'
  const railPrimaryButtonClass =
    'btn-primary inline-flex items-center gap-1.5 w-full justify-center min-h-11 min-w-11 disabled:cursor-not-allowed disabled:pointer-events-none'
  const railDangerButtonClass =
    'btn-destructive inline-flex items-center gap-1.5 w-full justify-center min-h-11 min-w-11'
  const railAmberButtonClass =
    'inline-flex items-center gap-1.5 w-full justify-center rounded-xl border border-amber-500 bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600 hover:border-amber-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 disabled:opacity-50 min-h-11 min-w-11'

  const handleEditSubmit = useCallback(
    async (payload: SpecificationLocalRequirementSubmitPayload) => {
      const response = await apiFetch(
        `/api/requirements-specifications/${specificationSlug}/local-requirements/${localRequirementId}`,
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
          `/api/requirements-specifications/${specificationSlug}/local-requirements/${localRequirementId}`,
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

  const handleGraduate = useCallback(async () => {
    if (!selectedGraduationAreaId || isGraduating) {
      return
    }

    setIsGraduating(true)
    setGraduationError(null)

    try {
      const response = await apiFetch(
        `/api/requirements-specifications/${specificationSlug}/local-requirements/${localRequirementId}/graduate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requirementAreaId: Number(selectedGraduationAreaId),
          }),
        },
      )

      const body = (await response.json().catch(() => null)) as
        | {
            detail?: { uniqueId?: string }
            newRequirementUniqueId?: string
            newRequirementVersionNumber?: number
          }
        | Record<string, unknown>
        | null

      if (!response.ok) {
        setGraduationError(
          readResponseError(body) ?? tp('graduateLocalRequirementFailed'),
        )
        return
      }

      const uniqueId =
        body && typeof body === 'object'
          ? ((body as { newRequirementUniqueId?: unknown })
              .newRequirementUniqueId ??
            (body as { detail?: { uniqueId?: unknown } }).detail?.uniqueId)
          : null
      const versionNumber =
        body && typeof body === 'object'
          ? (body as { newRequirementVersionNumber?: unknown })
              .newRequirementVersionNumber
          : null

      if (
        typeof uniqueId !== 'string' ||
        uniqueId.length === 0 ||
        typeof versionNumber !== 'number' ||
        !Number.isInteger(versionNumber) ||
        versionNumber < 1
      ) {
        setGraduationError(tp('graduateLocalRequirementFailed'))
        return
      }

      await onChange?.()
      setShowGraduationModal(false)
      router.push(
        `/requirements/${encodeURIComponent(uniqueId)}/${versionNumber}`,
      )
    } catch (graduateError) {
      setGraduationError(
        graduateError instanceof Error
          ? graduateError.message
          : tp('graduateLocalRequirementFailed'),
      )
    } finally {
      setIsGraduating(false)
    }
  }, [
    isGraduating,
    localRequirementId,
    onChange,
    router,
    selectedGraduationAreaId,
    specificationSlug,
    tp,
  ])

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
    async (motivation: string) => {
      if (!requirement?.itemRef || !motivation) {
        return
      }

      await performDeviationMutation(
        `/api/specification-item-deviations/${encodeURIComponent(requirement.itemRef)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
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
    async (motivation: string) => {
      if (!latestDeviation || !motivation) {
        return
      }

      await performDeviationMutation(
        `/api/specification-local-deviations/${latestDeviation.id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ motivation }),
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
    async (decision: 1 | 2, motivation: string) => {
      if (!latestDeviation) {
        return
      }

      await performDeviationMutation(
        `/api/specification-local-deviations/${latestDeviation.id}/decision`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
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

  const priorityLevelLabel = localName(requirement.priorityLevel)?.trim()

  const metadata = [
    {
      id: 'area',
      label: t('area'),
      markerValue: 'area',
      value: '-',
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
      id: 'priority-level',
      label: t('priorityLevel'),
      markerValue: 'priority level',
      value:
        requirement.priorityLevel && priorityLevelLabel ? (
          <StatusBadge
            color={requirement.priorityLevel.color}
            iconName={requirement.priorityLevel.iconName}
            label={priorityLevelLabel}
            size="sm"
          />
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
          <StatusBadge
            color={requirement.specificationItemStatusColor}
            iconName={requirement.specificationItemStatusIconName}
            label={
              locale === 'sv'
                ? (requirement.specificationItemStatusNameSv ??
                  requirement.specificationItemStatusNameEn ??
                  '')
                : (requirement.specificationItemStatusNameEn ??
                  requirement.specificationItemStatusNameSv ??
                  '')
            }
            size="sm"
          />
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

  const requirementPackages = requirement.requirementPackages.map(
    requirementPackage => {
      const label = requirementPackage.name ?? String(requirementPackage.id)
      return {
        id: `specification-local-requirementPackage-${requirementPackage.id}`,
        label,
        markerContext: buildDetailSectionContext('requirementPackages'),
        markerValue: label,
      }
    },
  )

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
      <GraduationTargetAreaModal
        areas={graduationTargetAreas}
        error={graduationError}
        idPrefix={`graduate-local-${localRequirementId}`}
        loading={isGraduating}
        onClose={() => {
          if (!isGraduating) {
            setShowGraduationModal(false)
          }
        }}
        onSelectArea={setSelectedGraduationAreaId}
        onSubmit={() => void handleGraduate()}
        open={showGraduationModal}
        selectedAreaId={selectedGraduationAreaId}
      />

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
                categoryId: requirement.requirementCategory
                  ? String(requirement.requirementCategory.id)
                  : '',
                typeId: requirement.requirementType
                  ? String(requirement.requirementType.id)
                  : '',
                requiresTesting: requirement.requiresTesting,
                priorityLevelId: requirement.priorityLevel
                  ? String(requirement.priorityLevel.id)
                  : '',
                requirementPackageIds: requirement.requirementPackages.map(
                  requirementPackage => requirementPackage.id,
                ),
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
                  <RequirementDetailCard>
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
                      requirementPackages={requirementPackages}
                      requirementPackagesLabel={t('requirementPackage')}
                    />
                  </RequirementDetailCard>

                  <div className="shrink-0 sm:w-64">
                    {graduationTargetAreasLoaded ? (
                      <div className="flex flex-col gap-2">
                        {deviationError ? (
                          <p
                            className="text-sm text-red-600 dark:text-red-400"
                            role="alert"
                          >
                            {deviationError}
                          </p>
                        ) : null}

                        {deviationStep === null ||
                        deviationStep === 'decided' ? (
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
                              onClick={event =>
                                void handleDeleteDeviation(event)
                              }
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

                        {graduationTargetAreas.length > 0 ? (
                          <>
                            <span className="inline-flex w-full">
                              <button
                                className={railSecondaryButtonClass}
                                disabled={isGraduating}
                                {...devMarker({
                                  context: detailContext,
                                  name: 'detail action',
                                  priority: 292,
                                  value: 'graduate local requirement',
                                })}
                                onClick={() => {
                                  setGraduationError(null)
                                  setShowGraduationModal(true)
                                }}
                                type="button"
                              >
                                <LibraryBig
                                  aria-hidden="true"
                                  className="h-4 w-4"
                                />
                                {tp('graduateLocalRequirement')}
                              </button>
                            </span>

                            {graduationError ? (
                              <p
                                className="text-sm text-red-600 dark:text-red-400"
                                role="alert"
                              >
                                {graduationError}
                              </p>
                            ) : null}
                          </>
                        ) : null}

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
                    ) : null}
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

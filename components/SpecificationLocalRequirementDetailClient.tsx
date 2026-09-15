'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { LibraryBig, Pencil, Trash2, X } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useConfirmModal } from '@/components/ConfirmModal'
import RequirementDetailCard from '@/components/RequirementDetailCard'
import RequirementDetailSections from '@/components/RequirementDetailSections'
import type { SpecificationAgreementView } from '@/components/SpecificationAgreementBox'
import SpecificationAgreementDeviations from '@/components/SpecificationAgreementDeviations'
import SpecificationLocalRequirementForm, {
  type SpecificationLocalRequirementSubmitPayload,
} from '@/components/SpecificationLocalRequirementForm'
import StatusBadge from '@/components/StatusBadge'
import type { AsyncResourceState } from '@/hooks/useAsyncResource'
import { useDiscardChangesConfirmation } from '@/hooks/useDiscardChangesConfirmation'
import { useModalFocus } from '@/hooks/useModalFocus'
import { useRouter } from '@/i18n/routing'
import { devMarker } from '@/lib/developer-mode-markers'
import { apiFetch } from '@/lib/http/api-fetch'
import { dialogPanelMotion, fadeMotion } from '@/lib/reduced-motion'
import type {
  RequirementDetailPrefetchContext,
  SpecificationLocalRequirementDetailCache,
} from '@/lib/requirements/detail-prefetch'
import { DEFAULT_SPECIFICATION_ITEM_STATUS_ID } from '@/lib/specification-item-status-constants'
import type { AgreementItem } from '@/lib/specifications/agreements'
import type { SpecificationLocalRequirementDetail } from '@/lib/specifications/local-requirement-detail'

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

interface GraduationTargetArea {
  id: number
  name: string
  prefix: string
}

interface SpecificationLocalRequirementDetailClientProps {
  agreementItem: AgreementItem
  agreementView: SpecificationAgreementView
  approvedDeviationEndingRequired?: boolean
  detailCache?: SpecificationLocalRequirementDetailCache
  detailPrefetchContext?: RequirementDetailPrefetchContext
  localRequirementId: number
  needsReferencesResource: AsyncResourceState<{ id: number; text: string }[]>
  onChange?: (localRequirementId?: number) => void | Promise<void>
  permissions?: {
    canAuthorizeDeviationEndings?: boolean
    canEditContent: boolean
    canChangeContent?: boolean
    canReviewDecisions: boolean
  }
  specificationId: number
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

interface SpecificationLocalRequirementEditModalProps {
  needsReferencesResource: AsyncResourceState<{ id: number; text: string }[]>
  onClose: () => void
  onSubmit: (
    payload: SpecificationLocalRequirementSubmitPayload,
  ) => Promise<void>
  open: boolean
  requirement: SpecificationLocalRequirementDetail | null
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

function SpecificationLocalRequirementEditModal({
  needsReferencesResource,
  onClose,
  onSubmit,
  open,
  requirement,
}: SpecificationLocalRequirementEditModalProps) {
  const tp = useTranslations('specification')
  const tc = useTranslations('common')
  const shouldReduceMotion = useReducedMotion()
  const confirmDiscardChanges = useDiscardChangesConfirmation()
  const modalRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const [formDirty, setFormDirty] = useState(false)
  const initialValue = useMemo(
    () =>
      requirement
        ? {
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
            verifiable: requirement.verifiable,
            priorityLevelId: requirement.priorityLevel
              ? String(requirement.priorityLevel.id)
              : '',
            verificationMethod: requirement.verificationMethod ?? '',
          }
        : undefined,
    [requirement],
  )

  useEffect(() => {
    if (!open) {
      setFormDirty(false)
    }
  }, [open])

  const requestClose = useCallback(
    async (anchorEl?: HTMLElement | null) => {
      if (formDirty && !(await confirmDiscardChanges(anchorEl))) return
      setFormDirty(false)
      onClose()
    },
    [confirmDiscardChanges, formDirty, onClose],
  )

  const { handleKeyDown } = useModalFocus({
    modalRef,
    initialFocusRef: closeButtonRef,
    onClose: () => {
      void requestClose()
    },
    open,
  })

  if (typeof window === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open && requirement ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          key="specification-local-requirement-edit-backdrop"
          {...fadeMotion(shouldReduceMotion)}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <motion.div
            aria-labelledby="specification-local-requirement-edit-title"
            aria-modal="true"
            className="relative z-50 max-h-[calc(100dvh-2rem)] w-full max-w-4xl overflow-y-auto overscroll-contain rounded-2xl bg-white shadow-2xl dark:bg-secondary-900"
            {...devMarker({
              name: 'dialog',
              priority: 421,
              value: 'edit local requirement',
            })}
            onKeyDown={handleKeyDown}
            ref={modalRef}
            role="dialog"
            {...dialogPanelMotion(shouldReduceMotion)}
          >
            <div className="p-6">
              <div className="mb-5 flex items-start justify-between gap-3">
                <div>
                  <h2
                    className="text-lg font-semibold text-secondary-900 dark:text-secondary-100"
                    id="specification-local-requirement-edit-title"
                  >
                    {tp('editLocalRequirement')}
                  </h2>
                  <p className="mt-1 font-mono text-sm text-secondary-700 dark:text-secondary-300">
                    {requirement.uniqueId}
                  </p>
                </div>
                <button
                  aria-label={tc('close')}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg p-1.5 transition-colors hover:bg-secondary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:hover:bg-secondary-800"
                  onClick={event => void requestClose(event.currentTarget)}
                  ref={closeButtonRef}
                  type="button"
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>

              <SpecificationLocalRequirementForm
                initialValue={initialValue}
                needsReferencesResource={needsReferencesResource}
                onCancel={() => {
                  setFormDirty(false)
                  onClose()
                }}
                onDirtyChange={setFormDirty}
                onSubmit={onSubmit}
                submitLabel={tc('save')}
              />
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}

export default function SpecificationLocalRequirementDetailClient({
  agreementView,
  agreementItem,
  approvedDeviationEndingRequired = false,
  detailCache,
  detailPrefetchContext,
  localRequirementId,
  needsReferencesResource,
  onChange,
  permissions,
  specificationId,
  usageStatus,
}: SpecificationLocalRequirementDetailClientProps) {
  const ta = useTranslations('agreement')
  const t = useTranslations('requirement')
  const tp = useTranslations('specification')
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
  const [deviationActionTarget, setDeviationActionTarget] =
    useState<HTMLDivElement | null>(null)
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

  useEffect(() => {
    if (requirement && detailCache && detailPrefetchContext) {
      detailCache.markUsable(
        { localRequirementId, specificationId },
        detailPrefetchContext,
      )
    }
  }, [
    detailCache,
    detailPrefetchContext,
    localRequirementId,
    requirement,
    specificationId,
  ])

  const handleOpenEditForm = useCallback(() => {
    setShowEditForm(true)
    if (needsReferencesResource.data === undefined) {
      void needsReferencesResource.reload()
    }
  }, [needsReferencesResource])
  const usageStatusRef = useRef(usageStatus)

  const fetchRequirement = useCallback(
    async (authoritative = false) => {
      setLoading(true)
      setError(null)

      try {
        let detail: SpecificationLocalRequirementDetail
        if (detailCache && detailPrefetchContext) {
          detail = await detailCache.load(
            { localRequirementId, specificationId },
            authoritative ? 'refresh' : 'activate',
            detailPrefetchContext,
          )
        } else {
          const response = await apiFetch(
            `/api/requirements-specifications/${specificationId}/local-requirements/${localRequirementId}`,
          )

          if (!response.ok) {
            const body = (await response.json().catch(() => null)) as unknown
            throw new Error(
              readResponseError(body) ?? tp('localRequirementNotFound'),
            )
          }

          detail =
            (await response.json()) as SpecificationLocalRequirementDetail
        }
        setRequirement(applyUsageStatusSnapshot(detail, usageStatusRef.current))
      } catch (fetchError) {
        if (
          typeof fetchError === 'object' &&
          fetchError !== null &&
          'name' in fetchError &&
          fetchError.name === 'AbortError'
        ) {
          return
        }
        setRequirement(null)
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : tc('unexpectedError'),
        )
      } finally {
        setLoading(false)
      }
    },
    [
      detailCache,
      detailPrefetchContext,
      localRequirementId,
      specificationId,
      tc,
      tp,
    ],
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
          `/api/requirements-specifications/${specificationId}/local-requirements/${localRequirementId}/graduation-target-areas`,
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
    [localRequirementId, requirement, specificationId],
  )

  useEffect(() => {
    void fetchRequirement(false)
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
    setGraduationError(null)
    const controller = new AbortController()
    void fetchGraduationTargetAreas(controller.signal)
    return () => controller.abort()
  }, [fetchGraduationTargetAreas])

  const railSecondaryButtonClass =
    'btn-secondary w-full px-3 text-center min-h-11 min-w-11 disabled:cursor-not-allowed disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none'
  const railDangerButtonClass =
    'btn-destructive w-full px-3 text-center min-h-11 min-w-11'
  const handleEditSubmit = useCallback(
    async (payload: SpecificationLocalRequirementSubmitPayload) => {
      if (approvedDeviationEndingRequired) {
        if (!permissions?.canAuthorizeDeviationEndings)
          throw new Error(ta('responsibleEndingRequired'))
        if (
          !(await confirm({
            title: ta('editRequirement'),
            message: ta('workingContentEndingWarning'),
            confirmText: ta('saveAndEndDeviation'),
            icon: 'warning',
          }))
        )
          return
      }
      const response = await apiFetch(
        `/api/requirements-specifications/${specificationId}/local-requirements/${localRequirementId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...payload,
            ...(approvedDeviationEndingRequired
              ? { authorizeDeviationEndings: true }
              : {}),
          }),
        },
      )

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as unknown
        throw new Error(readResponseError(body) ?? tc('error'))
      }

      const saved = (await response.json()) as {
        localRequirement: { id: number }
      }
      setShowEditForm(false)
      await onChange?.(saved.localRequirement.id)
    },
    [
      approvedDeviationEndingRequired,
      permissions?.canAuthorizeDeviationEndings,
      confirm,
      localRequirementId,
      specificationId,
      onChange,
      ta,
      tc,
    ],
  )

  const handleDelete = useCallback(
    async (event?: React.MouseEvent<HTMLButtonElement>) => {
      if (isDeleting) return
      const anchorEl = event?.currentTarget
      if (
        approvedDeviationEndingRequired &&
        !permissions?.canAuthorizeDeviationEndings
      ) {
        setError(ta('responsibleEndingRequired'))
        return
      }
      const confirmed = await confirm({
        anchorEl,
        confirmText: tc('delete'),
        icon: 'caution',
        message: approvedDeviationEndingRequired
          ? `${tp('deleteLocalRequirementConfirm')}\n${ta('workingContentEndingWarning')}`
          : tp('deleteLocalRequirementConfirm'),
        title: tp('deleteLocalRequirementConfirmTitle'),
        variant: 'danger',
      })

      if (!confirmed) {
        return
      }

      setIsDeleting(true)
      try {
        const response = await apiFetch(
          `/api/requirements-specifications/${specificationId}/local-requirements/${localRequirementId}`,
          {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              authorizeDeviationEndings: approvedDeviationEndingRequired,
            }),
          },
        )

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as unknown
          setError(readResponseError(body) ?? tc('error'))
          return
        }

        if (detailCache && detailPrefetchContext) {
          detailCache.invalidate(
            { localRequirementId, specificationId },
            detailPrefetchContext,
          )
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
      approvedDeviationEndingRequired,
      permissions?.canAuthorizeDeviationEndings,
      ta,
      confirm,
      detailCache,
      detailPrefetchContext,
      isDeleting,
      localRequirementId,
      onChange,
      specificationId,
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
        `/api/requirements-specifications/${specificationId}/local-requirements/${localRequirementId}/graduate`,
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
    specificationId,
    tp,
  ])

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
  const priorityLevelBadgeLabel =
    requirement.priorityLevel && priorityLevelLabel
      ? `${requirement.priorityLevel.code} – ${priorityLevelLabel}`
      : null
  const priorityLevelForDeviation = requirement.priorityLevel
    ? {
        code: requirement.priorityLevel.code,
        color: requirement.priorityLevel.color,
        iconName: requirement.priorityLevel.iconName,
        id: requirement.priorityLevel.id,
        name: priorityLevelLabel ?? '',
        sortOrder: requirement.priorityLevel.sortOrder,
      }
    : null

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
        requirement.priorityLevel && priorityLevelBadgeLabel ? (
          <StatusBadge
            color={requirement.priorityLevel.color}
            iconName={requirement.priorityLevel.iconName}
            label={priorityLevelBadgeLabel}
            size="sm"
          />
        ) : (
          '—'
        ),
    },
    {
      id: 'verifiable',
      label: t('verifiable'),
      markerValue: 'verifiable',
      value: requirement.verifiable ? tc('yes') : tc('no'),
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

  const hasPendingDeviation = agreementView.deviations.some(
    deviation =>
      deviation.itemRef === agreementItem.itemRef &&
      deviation.decision === null,
  )
  const canEditContent = permissions?.canEditContent === true
  const canChangeContent =
    canEditContent && permissions?.canChangeContent !== false
  const canMutateLocalRequirement =
    canChangeContent &&
    requirement.specificationItemStatusId ===
      DEFAULT_SPECIFICATION_ITEM_STATUS_ID &&
    !hasPendingDeviation
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

      <SpecificationLocalRequirementEditModal
        needsReferencesResource={needsReferencesResource}
        onClose={() => setShowEditForm(false)}
        onSubmit={handleEditSubmit}
        open={showEditForm}
        requirement={requirement}
      />

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

          <SpecificationAgreementDeviations
            createActionTarget={deviationActionTarget}
            item={agreementItem}
            onChange={async () => {
              await onChange?.()
            }}
            priorityLevel={priorityLevelForDeviation}
            specificationId={specificationId}
            view={agreementView}
          />

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
                    requirementPackages={[]}
                    requirementPackagesLabel={t('requirementPackage')}
                    showRequirementPackages={false}
                    verificationMethod={
                      requirement.verifiable && requirement.verificationMethod
                        ? requirement.verificationMethod
                        : '—'
                    }
                    verificationMethodLabel={t('verificationMethod')}
                  />
                </RequirementDetailCard>

                <fieldset
                  aria-label={ta('requirementActionColumn')}
                  className="shrink-0 space-y-2 sm:w-56"
                  {...devMarker({
                    context: detailContext,
                    name: 'compact centered requirement actions',
                    value: 'requirement action column',
                    priority: 350,
                  })}
                >
                  <div ref={setDeviationActionTarget} />
                  {canChangeContent && graduationTargetAreasLoaded ? (
                    <>
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
                          <Trash2
                            aria-hidden="true"
                            className="mr-1.5 inline-block h-4 w-4 align-middle"
                          />
                          {tc('delete')}
                        </button>
                      </span>
                    </>
                  ) : null}
                  {canChangeContent && graduationTargetAreasLoaded && (
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
                        onClick={handleOpenEditForm}
                        type="button"
                      >
                        <Pencil
                          aria-hidden="true"
                          className="mr-1.5 inline-block h-4 w-4 align-middle"
                        />
                        {tc('edit')}
                      </button>
                    </span>
                  )}
                  {graduationTargetAreasLoaded ? (
                    <div className="flex flex-col gap-2">
                      {canChangeContent && graduationTargetAreas.length > 0 ? (
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
                                className="mr-1.5 inline-block h-4 w-4 align-middle"
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
                    </div>
                  ) : null}
                </fieldset>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

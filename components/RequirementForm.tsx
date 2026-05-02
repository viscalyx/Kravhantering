'use client'

import { motion } from 'framer-motion'
import { AlertTriangle, ExternalLink, Plus, RotateCcw, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import NormReferenceFormFields from '@/components/NormReferenceFormFields'
import RequirementFormFields, {
  type RequirementFormFieldValues,
} from '@/components/RequirementFormFields'
import { useRouter } from '@/i18n/routing'
import { apiFetch } from '@/lib/http/api-fetch'
import type { RequirementDetailResponse } from '@/lib/requirements/types'

interface RequirementFormProps {
  baseRevisionToken?: string | null
  baseVersionId?: number | null
  initialData?: Partial<
    Omit<RequirementFormFieldValues, 'normReferenceIds' | 'scenarioIds'>
  >
  initialNormReferenceIds?: number[]
  initialScenarioIds?: number[]
  mode: 'create' | 'edit'
  onRefreshLatest?: () => Promise<void> | void
  requirementId?: number | string
}

interface RequirementEditErrorPayload {
  code?: string
  details?: {
    latest?: RequirementDetailResponse | null
    reason?: string
  }
  error?: string
}

interface NormReferenceOption {
  id: number
  issuer: string
  name: string
  normReferenceId: string
  reference: string
  type: string
}

const EMPTY_FORM: RequirementFormFieldValues = {
  acceptanceCriteria: '',
  areaId: '',
  categoryId: '',
  description: '',
  normReferenceIds: [],
  qualityCharacteristicId: '',
  requiresTesting: false,
  riskLevelId: '',
  scenarioIds: [],
  typeId: '',
  verificationMethod: '',
}

export default function RequirementForm({
  baseRevisionToken,
  baseVersionId,
  initialData,
  initialNormReferenceIds,
  initialScenarioIds,
  onRefreshLatest,
  requirementId,
  mode,
}: RequirementFormProps) {
  const tc = useTranslations('common')
  const t = useTranslations('requirement')
  const router = useRouter()

  const [showCreateNormRef, setShowCreateNormRef] = useState(false)
  const [normRefForm, setNormRefForm] = useState({
    normReferenceId: '',
    name: '',
    type: '',
    reference: '',
    version: '',
    issuer: '',
    uri: '',
  })
  const [normRefSubmitting, setNormRefSubmitting] = useState(false)
  const [normRefError, setNormRefError] = useState<string | null>(null)
  const [createdNormRefs, setCreatedNormRefs] = useState<
    { id: number; name: string; normReferenceId: string }[]
  >([])

  const [submitting, setSubmitting] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [staleConflict, setStaleConflict] = useState<{
    latest: RequirementDetailResponse | null
  } | null>(null)
  const [saveDestination, setSaveDestination] = useState<'inline' | 'page'>(
    () => {
      try {
        const stored = globalThis.localStorage?.getItem(
          'requirement-save-destination',
        )
        if (stored === 'page') return 'page'
      } catch {
        // ignore
      }
      return 'inline'
    },
  )

  const [form, setForm] = useState<RequirementFormFieldValues>({
    ...EMPTY_FORM,
    ...initialData,
    normReferenceIds: initialNormReferenceIds ?? [],
    scenarioIds: initialScenarioIds ?? [],
  })

  const dirtyFields = useRef<Set<string>>(new Set())
  const prevInitialData = useRef(initialData)
  const prevNormReferenceIds = useRef(initialNormReferenceIds)
  const prevScenarioIds = useRef(initialScenarioIds)

  useEffect(() => {
    const dataChanged = initialData !== prevInitialData.current
    const normRefsChanged =
      initialNormReferenceIds !== prevNormReferenceIds.current
    const scenariosChanged = initialScenarioIds !== prevScenarioIds.current
    if (!dataChanged && !normRefsChanged && !scenariosChanged) return

    prevInitialData.current = initialData
    prevNormReferenceIds.current = initialNormReferenceIds
    prevScenarioIds.current = initialScenarioIds

    if (dataChanged) {
      dirtyFields.current = new Set()
    }

    setForm(() => ({
      ...EMPTY_FORM,
      ...(initialData ?? {}),
      normReferenceIds: initialNormReferenceIds ?? [],
      scenarioIds: initialScenarioIds ?? [],
    }))
  }, [initialData, initialNormReferenceIds, initialScenarioIds])

  const handleFieldsChange = (values: RequirementFormFieldValues) => {
    for (const key of Object.keys(
      values,
    ) as (keyof RequirementFormFieldValues)[]) {
      if (values[key] !== form[key]) {
        dirtyFields.current.add(key)
      }
    }
    setForm(values)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    setStaleConflict(null)

    try {
      const url =
        mode === 'create'
          ? '/api/requirements'
          : `/api/requirements/${requirementId}`
      const res = await apiFetch(url, {
        method: mode === 'create' ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          areaId: form.areaId ? Number(form.areaId) : undefined,
          categoryId: form.categoryId ? Number(form.categoryId) : undefined,
          typeId: form.typeId ? Number(form.typeId) : undefined,
          qualityCharacteristicId: form.qualityCharacteristicId
            ? Number(form.qualityCharacteristicId)
            : undefined,
          riskLevelId: form.riskLevelId ? Number(form.riskLevelId) : undefined,
          description: form.description || undefined,
          baseRevisionToken: mode === 'edit' ? baseRevisionToken : undefined,
          baseVersionId: mode === 'edit' ? baseVersionId : undefined,
          acceptanceCriteria: form.acceptanceCriteria || undefined,
          requiresTesting: form.requiresTesting,
          verificationMethod: form.requiresTesting
            ? form.verificationMethod || undefined
            : undefined,
          normReferenceIds:
            mode === 'edit'
              ? form.normReferenceIds
              : form.normReferenceIds.length > 0
                ? form.normReferenceIds
                : undefined,
          scenarioIds:
            mode === 'edit'
              ? form.scenarioIds
              : form.scenarioIds.length > 0
                ? form.scenarioIds
                : undefined,
        }),
      })

      if (res.ok) {
        const data = (await res.json()) as {
          id?: number
          uniqueId?: string
          requirement?: { id: number; uniqueId: string }
          version?: { versionNumber: number } | number
        }
        const targetUniqueId =
          mode === 'create'
            ? data.requirement?.uniqueId
            : (data.uniqueId ?? requirementId)
        if (saveDestination === 'page') {
          const versionNumber =
            typeof data.version === 'object'
              ? data.version?.versionNumber
              : data.version
          const versionSuffix = versionNumber ? `/${versionNumber}` : ''
          router.push(`/requirements/${targetUniqueId}${versionSuffix}`)
        } else {
          router.push(`/requirements?selected=${targetUniqueId}`)
        }
      } else {
        const err = (await res
          .json()
          .catch(() => null)) as RequirementEditErrorPayload | null
        if (
          res.status === 409 &&
          err?.code === 'conflict' &&
          err.details?.reason === 'stale_requirement_edit'
        ) {
          setStaleConflict({ latest: err.details.latest ?? null })
          setError(null)
          return
        }
        setError(err?.error ?? res.statusText)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  const latestConflictVersion = staleConflict?.latest?.versions[0]
  const latestConflictTarget = staleConflict?.latest?.uniqueId
  const latestConflictHref = staleConflict?.latest
    ? latestConflictVersion?.versionNumber
      ? `/requirements/${latestConflictTarget}/${latestConflictVersion.versionNumber}`
      : `/requirements/${latestConflictTarget}`
    : null

  const handleRefreshLatest = async () => {
    if (!onRefreshLatest || isRefreshing) return
    setIsRefreshing(true)
    setError(null)
    try {
      await onRefreshLatest()
      setStaleConflict(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : tc('error'))
    } finally {
      setIsRefreshing(false)
    }
  }

  const normReferenceCreateButton = (
    <button
      className="inline-flex items-center gap-1 text-sm text-primary-700 dark:text-primary-300 hover:underline min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded"
      disabled={isRefreshing}
      onClick={() => setShowCreateNormRef(true)}
      type="button"
    >
      <Plus aria-hidden="true" className="h-3.5 w-3.5" />
      {tc('create')}
    </button>
  )

  return (
    <motion.form
      animate={{ opacity: 1, y: 0 }}
      initial={{ opacity: 0, y: 8 }}
      onSubmit={handleSubmit}
      transition={{ duration: 0.15 }}
    >
      <RequirementFormFields
        additionalNormReferences={createdNormRefs}
        layout="sidebar"
        normReferenceActions={normReferenceCreateButton}
        onChange={handleFieldsChange}
        values={form}
      />

      {showCreateNormRef &&
        createPortal(
          <NormReferenceModal
            normRefError={normRefError}
            normRefForm={normRefForm}
            normRefSubmitting={normRefSubmitting}
            onCancel={() => {
              setShowCreateNormRef(false)
              setNormRefError(null)
            }}
            onSave={async () => {
              setNormRefSubmitting(true)
              setNormRefError(null)
              try {
                const res = await apiFetch('/api/norm-references', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    normReferenceId: normRefForm.normReferenceId || undefined,
                    name: normRefForm.name,
                    type: normRefForm.type,
                    reference: normRefForm.reference,
                    version: normRefForm.version || null,
                    issuer: normRefForm.issuer,
                    uri: normRefForm.uri || null,
                  }),
                })
                if (!res.ok) {
                  const data = (await res.json().catch(() => null)) as {
                    error?: string
                  } | null
                  setNormRefError(data?.error ?? tc('error'))
                } else {
                  const created = (await res.json()) as NormReferenceOption
                  setCreatedNormRefs(prev => [
                    ...prev,
                    {
                      id: created.id,
                      name: created.name,
                      normReferenceId: created.normReferenceId,
                    },
                  ])
                  setForm(prev => ({
                    ...prev,
                    normReferenceIds: [...prev.normReferenceIds, created.id],
                  }))
                  setNormRefForm({
                    normReferenceId: '',
                    name: '',
                    type: '',
                    reference: '',
                    version: '',
                    issuer: '',
                    uri: '',
                  })
                  setShowCreateNormRef(false)
                }
              } catch {
                setNormRefError(tc('error'))
              } finally {
                setNormRefSubmitting(false)
              }
            }}
            onSetField={(field, value) =>
              setNormRefForm(prev => ({ ...prev, [field]: value }))
            }
          />,
          document.body,
        )}

      {staleConflict && (
        <div
          className="mt-5 rounded-xl border border-amber-200 bg-amber-50/90 p-4 text-sm text-amber-800 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-200"
          role="alert"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle
              aria-hidden="true"
              className="mt-0.5 h-4 w-4 shrink-0 text-amber-500"
            />
            <div>
              <p className="font-semibold">{t('staleEditConflict')}</p>
              <p className="mt-1">{t('staleEditConflictHelp')}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {latestConflictHref && (
                  <button
                    className="inline-flex min-h-11 min-w-11 items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-700 dark:bg-secondary-900 dark:text-amber-100 dark:hover:bg-amber-950"
                    disabled={isRefreshing}
                    onClick={() => router.push(latestConflictHref)}
                    type="button"
                  >
                    <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
                    {t('staleEditViewLatest')}
                  </button>
                )}
                {onRefreshLatest && (
                  <button
                    className="inline-flex min-h-11 min-w-11 items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-700 dark:bg-secondary-900 dark:text-amber-100 dark:hover:bg-amber-950"
                    disabled={isRefreshing}
                    onClick={handleRefreshLatest}
                    type="button"
                  >
                    <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
                    {isRefreshing ? tc('loading') : t('staleEditReload')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-5 text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-3 pt-4 mt-5 border-t">
        <div className="flex items-center gap-3">
          <button
            className="btn-primary"
            disabled={submitting || isRefreshing}
            type="submit"
          >
            {submitting ? tc('saving') : tc('save')}
          </button>
          <button
            className="px-4 py-2.5 rounded-xl border text-sm font-medium min-h-11 min-w-11 text-secondary-700 dark:text-secondary-300 hover:bg-secondary-50 dark:hover:bg-secondary-800 transition-all duration-200"
            disabled={submitting || isRefreshing}
            onClick={() => router.back()}
            type="button"
          >
            {tc('cancel')}
          </button>
        </div>
        <div className="flex items-center gap-2 text-sm text-secondary-600 dark:text-secondary-400">
          <span>{t('afterSave')}</span>
          <div className="inline-flex rounded-lg border overflow-hidden text-xs font-medium">
            <button
              aria-label={t('afterSaveInline')}
              aria-pressed={saveDestination === 'inline'}
              className={`min-h-11 min-w-11 px-3 py-1.5 transition-colors focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 ${saveDestination === 'inline' ? 'bg-primary-600 text-white' : 'bg-white dark:bg-secondary-800 hover:bg-secondary-50 dark:hover:bg-secondary-700'}`}
              disabled={submitting || isRefreshing}
              onClick={() => {
                setSaveDestination('inline')
                try {
                  localStorage.setItem('requirement-save-destination', 'inline')
                } catch {
                  // ignore
                }
              }}
              type="button"
            >
              {t('afterSaveInline')}
            </button>
            <button
              aria-label={t('afterSavePage')}
              aria-pressed={saveDestination === 'page'}
              className={`min-h-11 min-w-11 px-3 py-1.5 transition-colors focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 ${saveDestination === 'page' ? 'bg-primary-600 text-white' : 'bg-white dark:bg-secondary-800 hover:bg-secondary-50 dark:hover:bg-secondary-700'}`}
              disabled={submitting || isRefreshing}
              onClick={() => {
                setSaveDestination('page')
                try {
                  localStorage.setItem('requirement-save-destination', 'page')
                } catch {
                  // ignore
                }
              }}
              type="button"
            >
              {t('afterSavePage')}
            </button>
          </div>
        </div>
      </div>
    </motion.form>
  )
}

interface NormReferenceModalProps {
  normRefError: string | null
  normRefForm: {
    issuer: string
    name: string
    normReferenceId: string
    reference: string
    type: string
    uri: string
    version: string
  }
  normRefSubmitting: boolean
  onCancel: () => void
  onSave: () => void
  onSetField: (field: string, value: string) => void
}

function NormReferenceModal({
  normRefError,
  normRefForm,
  normRefSubmitting,
  onCancel,
  onSave,
  onSetField,
}: NormReferenceModalProps) {
  const t = useTranslations('requirement')
  const tc = useTranslations('common')
  const overlayRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const previouslyFocused = useRef<Element | null>(null)

  useEffect(() => {
    previouslyFocused.current = document.activeElement
    closeButtonRef.current?.focus()

    return () => {
      if (previouslyFocused.current instanceof HTMLElement) {
        previouslyFocused.current.focus()
      }
    }
  }, [])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    const FOCUSABLE =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !normRefSubmitting) {
        onCancel()
        return
      }
      if (e.key === 'Tab') {
        const focusable = Array.from(
          dialog.querySelectorAll<HTMLElement>(FOCUSABLE),
        )
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault()
            last.focus()
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault()
            first.focus()
          }
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel, normRefSubmitting])

  const canSave =
    !normRefSubmitting &&
    normRefForm.name.trim() !== '' &&
    normRefForm.type.trim() !== '' &&
    normRefForm.reference.trim() !== '' &&
    normRefForm.issuer.trim() !== ''

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      ref={overlayRef}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={normRefSubmitting ? undefined : onCancel}
      />
      <motion.div
        animate={{ opacity: 1, scale: 1 }}
        aria-describedby="modal-desc-norm-ref"
        aria-labelledby="modal-title-norm-ref"
        aria-modal="true"
        className="relative z-10 w-full max-w-md rounded-2xl bg-white dark:bg-secondary-900 border shadow-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
        initial={{ opacity: 0, scale: 0.95 }}
        ref={dialogRef}
        role="dialog"
        transition={{ duration: 0.15 }}
      >
        <div className="flex items-center justify-between">
          <h2
            className="text-base font-semibold text-secondary-900 dark:text-secondary-100"
            id="modal-title-norm-ref"
          >
            {t('addNewNormReference')}
          </h2>
          <button
            aria-label={tc('cancel')}
            className="inline-flex items-center justify-center min-h-11 min-w-11 rounded-lg text-secondary-400 hover:text-secondary-600 dark:hover:text-secondary-300 transition-colors focus-visible:ring-2 focus-visible:ring-primary-400/50 disabled:opacity-50 disabled:pointer-events-none"
            disabled={normRefSubmitting}
            onClick={onCancel}
            ref={closeButtonRef}
            type="button"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>

        <div
          className="rounded-xl border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-3 py-2"
          id="modal-desc-norm-ref"
        >
          <p className="text-xs text-amber-800 dark:text-amber-200">
            {t('newNormReferenceWarning')}
          </p>
        </div>

        {normRefError && (
          <p className="text-xs text-red-600 dark:text-red-400" role="alert">
            {normRefError}
          </p>
        )}

        <div className="space-y-3">
          <NormReferenceFormFields
            form={normRefForm}
            idPrefix="modal-nr"
            onSetField={onSetField}
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            className="btn-primary"
            disabled={!canSave}
            onClick={onSave}
            type="button"
          >
            {normRefSubmitting ? tc('saving') : tc('save')}
          </button>
          <button
            className="px-4 py-2.5 rounded-xl border text-sm min-h-11 min-w-11 text-secondary-600 dark:text-secondary-300 hover:bg-secondary-50 dark:hover:bg-secondary-800 transition-all duration-200 focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2"
            disabled={normRefSubmitting}
            onClick={onCancel}
            type="button"
          >
            {tc('cancel')}
          </button>
        </div>
      </motion.div>
    </div>
  )
}

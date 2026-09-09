'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { AlertTriangle, ExternalLink, Plus, RotateCcw } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import DirtyStateButton from '@/components/DirtyStateButton'
import FormActionRow from '@/components/FormActionRow'
import NormReferenceModal from '@/components/NormReferenceModal'
import ReferenceDataStatus, {
  ReferenceDataSaveHint,
} from '@/components/ReferenceDataStatus'
import RequirementEditReconciliation, {
  REQUIREMENT_EDIT_LABELS,
} from '@/components/RequirementEditReconciliation'
import RequirementFormFields, {
  type RequirementFormFieldValues,
} from '@/components/RequirementFormFields'
import {
  formatRequirementEditValue,
  type RequirementEditSnapshot,
} from '@/components/requirement-edit-reconciliation'
import { useDiscardChangesConfirmation } from '@/hooks/useDiscardChangesConfirmation'
import { useTaxonomyOptions } from '@/hooks/useTaxonomyOptions'
import { useUnsavedRequirementEdit } from '@/hooks/useUnsavedRequirementEdit'
import { useRouter } from '@/i18n/routing'
import { devMarker } from '@/lib/developer-mode-markers'
import { createDirtySnapshot } from '@/lib/forms/dirty-state'
import { apiFetch } from '@/lib/http/api-fetch'
import { ARRAY_INPUT_MAX_ITEMS } from '@/lib/http/validation-constants'
import { offsetPanelMotion } from '@/lib/reduced-motion'

interface RequirementFormProps {
  baseRevisionToken?: string | null
  baseVersionId?: number | null
  initialData?: Partial<
    Omit<
      RequirementFormFieldValues,
      'normReferenceIds' | 'requirementPackageIds'
    >
  >
  initialNormReferenceIds?: number[]
  initialRequirementPackageIds?: number[]
  mode: 'create' | 'edit'
  onRefreshLatest?: () => Promise<RequirementEditSnapshot>
  requirementId?: number | string
}

interface RequirementEditErrorPayload {
  code?: string
  details?: {
    latest?: LatestEditConflictSummary | null
    reason?: string
  }
  error?: string
}

interface LatestEditConflictSummary {
  uniqueId: string
  versionNumber: number | null
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
  verifiable: false,
  priorityLevelId: '',
  requirementPackageIds: [],
  typeId: '',
  verificationMethod: '',
}

const EMPTY_NORM_REFERENCE_FORM = {
  issuer: '',
  name: '',
  normReferenceId: '',
  reference: '',
  type: '',
  uri: '',
  version: '',
}

const REQUIREMENT_DIRTY_SNAPSHOT_OPTIONS = {
  unorderedArrayPaths: ['normReferenceIds', 'requirementPackageIds'],
} as const

function createInitialRequirementForm(
  initialData: RequirementFormProps['initialData'],
  initialNormReferenceIds: RequirementFormProps['initialNormReferenceIds'],
  initialRequirementPackageIds: RequirementFormProps['initialRequirementPackageIds'],
): RequirementFormFieldValues {
  return {
    ...EMPTY_FORM,
    ...initialData,
    normReferenceIds: initialNormReferenceIds ?? [],
    requirementPackageIds: initialRequirementPackageIds ?? [],
  }
}

function toRequirementPayload(
  form: RequirementFormFieldValues,
  options: {
    baseRevisionToken?: string | null
    baseVersionId?: number | null
    includeEditTokens: boolean
    mode: RequirementFormProps['mode']
  },
) {
  return {
    areaId: form.areaId ? Number(form.areaId) : undefined,
    categoryId: form.categoryId ? Number(form.categoryId) : undefined,
    typeId: form.typeId ? Number(form.typeId) : undefined,
    qualityCharacteristicId: form.qualityCharacteristicId
      ? Number(form.qualityCharacteristicId)
      : undefined,
    priorityLevelId: form.priorityLevelId
      ? Number(form.priorityLevelId)
      : undefined,
    description: form.description || undefined,
    baseRevisionToken:
      options.includeEditTokens && options.mode === 'edit'
        ? options.baseRevisionToken
        : undefined,
    baseVersionId:
      options.includeEditTokens && options.mode === 'edit'
        ? options.baseVersionId
        : undefined,
    acceptanceCriteria: form.acceptanceCriteria || undefined,
    verifiable: form.verifiable,
    verificationMethod: form.verifiable
      ? form.verificationMethod || undefined
      : undefined,
    normReferenceIds:
      options.mode === 'edit'
        ? form.normReferenceIds
        : form.normReferenceIds.length > 0
          ? form.normReferenceIds
          : undefined,
    requirementPackageIds:
      options.mode === 'edit'
        ? form.requirementPackageIds
        : form.requirementPackageIds.length > 0
          ? form.requirementPackageIds
          : undefined,
  }
}

function createRequirementPayloadSignature(
  form: RequirementFormFieldValues,
  mode: RequirementFormProps['mode'],
) {
  return createDirtySnapshot(
    toRequirementPayload(form, { includeEditTokens: false, mode }),
    REQUIREMENT_DIRTY_SNAPSHOT_OPTIONS,
  )
}

function createInitialRequirementSignature(
  initialData: RequirementFormProps['initialData'],
  initialNormReferenceIds: RequirementFormProps['initialNormReferenceIds'],
  initialRequirementPackageIds: RequirementFormProps['initialRequirementPackageIds'],
  mode: RequirementFormProps['mode'],
) {
  return createRequirementPayloadSignature(
    createInitialRequirementForm(
      initialData,
      initialNormReferenceIds,
      initialRequirementPackageIds,
    ),
    mode,
  )
}

function toNormReferencePayload(form: typeof EMPTY_NORM_REFERENCE_FORM) {
  return {
    issuer: form.issuer,
    name: form.name,
    normReferenceId: form.normReferenceId || undefined,
    reference: form.reference,
    type: form.type,
    uri: form.uri || null,
    version: form.version || null,
  }
}

export default function RequirementForm({
  baseRevisionToken,
  baseVersionId,
  initialData,
  initialNormReferenceIds,
  initialRequirementPackageIds,
  onRefreshLatest,
  requirementId,
  mode,
}: RequirementFormProps) {
  const tc = useTranslations('common')
  const t = useTranslations('requirement')
  const router = useRouter()
  const locale = useLocale()
  const shouldReduceMotion = useReducedMotion()
  const confirmDiscardChanges = useDiscardChangesConfirmation()

  const formRef = useRef<HTMLFormElement>(null)
  const recoveryReturnFocusRef = useRef<HTMLElement | null>(null)
  const [showCreateNormRef, setShowCreateNormRef] = useState(false)
  const [normRefForm, setNormRefForm] = useState(EMPTY_NORM_REFERENCE_FORM)
  const [normRefSubmitting, setNormRefSubmitting] = useState(false)
  const [normRefError, setNormRefError] = useState<string | null>(null)
  const [createdNormRefs, setCreatedNormRefs] = useState<
    { id: number; name: string; normReferenceId: string }[]
  >([])

  const [submitting, setSubmitting] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [staleConflict, setStaleConflict] = useState<{
    latest: LatestEditConflictSummary | null
  } | null>(null)
  const [comparison, setComparison] = useState<RequirementEditSnapshot | null>(
    null,
  )
  const [restriction, setRestriction] = useState<string | null>(null)
  const [copyStatus, setCopyStatus] = useState<'copied' | 'copyFailed' | null>(
    null,
  )
  const [copying, setCopying] = useState(false)
  const [editTokens, setEditTokens] = useState({
    baseRevisionToken,
    baseVersionId,
  })
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

  const initialRequirementSignature = useMemo(
    () =>
      createInitialRequirementSignature(
        initialData,
        initialNormReferenceIds,
        initialRequirementPackageIds,
        mode,
      ),
    [initialData, initialNormReferenceIds, initialRequirementPackageIds, mode],
  )
  const [form, setForm] = useState<RequirementFormFieldValues>(() =>
    createInitialRequirementForm(
      initialData,
      initialNormReferenceIds,
      initialRequirementPackageIds,
    ),
  )
  const [startingForm, setStartingForm] = useState(form)
  const [baselineSignature, setBaselineSignature] = useState(
    initialRequirementSignature,
  )

  const [recoveryReferenceIds, setRecoveryReferenceIds] = useState({
    normReferenceIds: [] as number[],
    requirementPackageIds: [] as number[],
  })
  const taxonomyOptions = useTaxonomyOptions(
    form.typeId,
    [
      ...new Set([
        ...(initialNormReferenceIds ?? []),
        ...recoveryReferenceIds.normReferenceIds,
      ]),
    ],
    {
      selectedRequirementPackageIds: [
        ...new Set([
          ...(initialRequirementPackageIds ?? []),
          ...recoveryReferenceIds.requirementPackageIds,
        ]),
      ],
      variant: 'library',
    },
  )
  const referenceDataStatusId = useId()
  const referenceDataSaveHintId = useId()

  const appliedInitialRequirementSignature = useRef(initialRequirementSignature)

  useEffect(() => {
    if (
      appliedInitialRequirementSignature.current === initialRequirementSignature
    ) {
      return
    }

    appliedInitialRequirementSignature.current = initialRequirementSignature
    const nextForm = createInitialRequirementForm(
      initialData,
      initialNormReferenceIds,
      initialRequirementPackageIds,
    )
    setForm(nextForm)
    setStartingForm(nextForm)
    setEditTokens({ baseRevisionToken, baseVersionId })
    setBaselineSignature(initialRequirementSignature)
  }, [
    baseRevisionToken,
    baseVersionId,
    initialData,
    initialNormReferenceIds,
    initialRequirementPackageIds,
    initialRequirementSignature,
  ])

  const handleFieldsChange = (values: RequirementFormFieldValues) => {
    setForm(values)
  }

  const currentSignature = createRequirementPayloadSignature(form, mode)
  const formDirty = baselineSignature !== currentSignature
  const { allowNavigation, navigateBack } = useUnsavedRequirementEdit(
    mode === 'edit' && formDirty,
  )
  const associationSelectionsValid =
    form.normReferenceIds.length <= ARRAY_INPUT_MAX_ITEMS &&
    form.requirementPackageIds.length <= ARRAY_INPUT_MAX_ITEMS
  const associationSelectionLimitHintIds =
    [
      form.normReferenceIds.length > ARRAY_INPUT_MAX_ITEMS &&
        'normReferences-selection-limit',
      form.requirementPackageIds.length > ARRAY_INPUT_MAX_ITEMS &&
        'requirementPackage-selection-limit',
    ]
      .filter(Boolean)
      .join(' ') || undefined
  const normRefFormDirty =
    createDirtySnapshot(toNormReferencePayload(normRefForm)) !==
    createDirtySnapshot(toNormReferencePayload(EMPTY_NORM_REFERENCE_FORM))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (
      submitting ||
      isRefreshing ||
      comparison ||
      staleConflict ||
      restriction ||
      !formDirty ||
      !associationSelectionsValid ||
      !taxonomyOptions.readiness.canSave
    ) {
      return
    }
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
        body: JSON.stringify(
          toRequirementPayload(form, {
            ...editTokens,
            includeEditTokens: true,
            mode,
          }),
        ),
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
        allowNavigation()
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
        if (mode === 'edit' && (res.status === 409 || res.status === 403)) {
          setStaleConflict({ latest: null })
          if (res.status === 403) setRestriction(t('reconciliation.restricted'))
        }
        setError(err?.error ?? res.statusText)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = async (anchorEl?: HTMLElement | null) => {
    if (submitting || isRefreshing) return
    if (formDirty && !(await confirmDiscardChanges(anchorEl))) return
    navigateBack(() => router.back())
  }

  const latestConflictTarget = staleConflict?.latest?.uniqueId
  const latestConflictHref = staleConflict?.latest
    ? staleConflict.latest.versionNumber
      ? `/requirements/${latestConflictTarget}/${staleConflict.latest.versionNumber}`
      : `/requirements/${latestConflictTarget}`
    : null

  const handleRefreshLatest = async (
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    recoveryReturnFocusRef.current = event.currentTarget
    if (!onRefreshLatest || isRefreshing) return
    setIsRefreshing(true)
    setError(null)
    try {
      const snapshot = await onRefreshLatest()
      const blocked =
        snapshot.restriction === 'review'
          ? t('editNotAllowedStatusReview')
          : snapshot.restriction === 'archived'
            ? t('editNotAllowedStatusArchived')
            : snapshot.restriction === 'permission'
              ? t('reconciliation.restricted')
              : null
      setRestriction(blocked)
      setRecoveryReferenceIds(previous => ({
        normReferenceIds: [
          ...new Set([
            ...previous.normReferenceIds,
            ...snapshot.values.normReferenceIds,
          ]),
        ],
        requirementPackageIds: [
          ...new Set([
            ...previous.requirementPackageIds,
            ...snapshot.values.requirementPackageIds,
          ]),
        ],
      }))
      if (!blocked) setComparison(snapshot)
    } catch (e) {
      setError(e instanceof Error ? e.message : tc('error'))
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleCopy = async () => {
    setCopying(true)
    setCopyStatus(null)
    try {
      const text = Object.entries(REQUIREMENT_EDIT_LABELS)
        .map(([field, label]) => {
          const value = formatRequirementEditValue(
            form,
            field as keyof RequirementFormFieldValues,
            {
              ...taxonomyOptions,
              normReferences: [
                ...taxonomyOptions.normReferences,
                ...createdNormRefs,
              ],
            },
            locale,
            { yes: tc('yes'), no: tc('no'), empty: '' },
          )
          return `${t(label)}: ${value}`
        })
        .join('\n\n')
      await navigator.clipboard.writeText(text)
      setCopyStatus('copied')
    } catch {
      setCopyStatus('copyFailed')
    } finally {
      setCopying(false)
    }
  }

  const normReferenceCreateButton = (
    <button
      aria-describedby={
        form.normReferenceIds.length >= ARRAY_INPUT_MAX_ITEMS
          ? 'normReferences-selection-limit'
          : taxonomyOptions.readiness.canSave
            ? undefined
            : referenceDataStatusId
      }
      className="inline-flex items-center gap-1 text-sm text-primary-700 dark:text-primary-300 hover:underline min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded"
      disabled={
        isRefreshing ||
        !taxonomyOptions.readiness.canSave ||
        form.normReferenceIds.length >= ARRAY_INPUT_MAX_ITEMS
      }
      onClick={() => setShowCreateNormRef(true)}
      type="button"
    >
      <Plus aria-hidden="true" className="h-3.5 w-3.5" />
      {tc('create')}
    </button>
  )

  return (
    <motion.form
      onSubmit={handleSubmit}
      ref={formRef}
      {...offsetPanelMotion(shouldReduceMotion)}
    >
      <ReferenceDataStatus
        id={referenceDataStatusId}
        readiness={taxonomyOptions.readiness}
      />

      <fieldset
        className="m-0 min-w-0 border-0 p-0"
        disabled={submitting || isRefreshing || Boolean(comparison)}
      >
        <RequirementFormFields
          additionalNormReferences={createdNormRefs}
          layout="sidebar"
          normReferenceActions={normReferenceCreateButton}
          onChange={handleFieldsChange}
          referenceDataReadiness={taxonomyOptions.readiness}
          referenceDataStatusId={referenceDataStatusId}
          taxonomyOptions={taxonomyOptions}
          values={form}
        />
      </fieldset>

      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence initial={false}>
            {showCreateNormRef ? (
              <NormReferenceModal
                key="create-norm-reference-modal"
                normRefError={normRefError}
                normRefForm={normRefForm}
                normRefFormDirty={normRefFormDirty}
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
                      body: JSON.stringify(toNormReferencePayload(normRefForm)),
                      headers: { 'Content-Type': 'application/json' },
                      method: 'POST',
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
                        normReferenceIds:
                          prev.normReferenceIds.length < ARRAY_INPUT_MAX_ITEMS
                            ? [...prev.normReferenceIds, created.id]
                            : prev.normReferenceIds,
                      }))
                      setNormRefForm(EMPTY_NORM_REFERENCE_FORM)
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
              />
            ) : null}
          </AnimatePresence>,
          document.body,
        )}

      {comparison && (
        <RequirementEditReconciliation
          local={form}
          onApply={values => {
            recoveryReturnFocusRef.current =
              formRef.current?.querySelector('textarea') ?? null
            setForm(values)
            setStartingForm(comparison.values)
            setBaselineSignature(
              createRequirementPayloadSignature(comparison.values, mode),
            )
            setEditTokens({
              baseVersionId: comparison.baseVersionId,
              baseRevisionToken: comparison.baseRevisionToken,
            })
            setComparison(null)
            setStaleConflict(null)
            setCopyStatus(null)
          }}
          onClose={() => setComparison(null)}
          returnFocusRef={recoveryReturnFocusRef}
          server={comparison.values}
          starting={startingForm}
          taxonomyOptions={taxonomyOptions}
        />
      )}

      {staleConflict && (
        <div
          className="mt-5 rounded-xl border border-amber-200 bg-amber-50/90 p-4 text-sm text-amber-800 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-200"
          role="alert"
          {...devMarker({
            name: 'conflict recovery',
            value: 'requirement edit',
          })}
        >
          <div className="flex items-start gap-3">
            <AlertTriangle
              aria-hidden="true"
              className="mt-0.5 h-4 w-4 shrink-0 text-amber-500"
            />
            <div>
              <p className="font-semibold">{t('staleEditConflict')}</p>
              <p className="mt-1">{t('staleEditConflictHelp')}</p>
              {restriction && (
                <p className="mt-2 font-semibold">{restriction}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {latestConflictHref && (
                  <button
                    className="inline-flex min-h-11 min-w-11 items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-700 dark:bg-secondary-900 dark:text-amber-100 dark:hover:bg-amber-950"
                    disabled={isRefreshing}
                    onClick={async event => {
                      if (
                        formDirty &&
                        !(await confirmDiscardChanges(event.currentTarget))
                      )
                        return
                      allowNavigation()
                      router.push(latestConflictHref)
                    }}
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
                    {isRefreshing ? tc('loading') : t('reconciliation.compare')}
                  </button>
                )}
                <button
                  className="btn-secondary"
                  disabled={copying}
                  onClick={handleCopy}
                  type="button"
                  {...devMarker({
                    name: 'copy action',
                    value: 'unsaved requirement edit',
                  })}
                >
                  {copying ? tc('loading') : t('reconciliation.copy')}
                </button>
              </div>
              {copyStatus && (
                <p className="mt-2" role="status">
                  {t(`reconciliation.${copyStatus}`)}
                </p>
              )}
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
        <FormActionRow
          hint={
            !associationSelectionsValid ? null : taxonomyOptions.readiness
                .canSave ? undefined : (
              <ReferenceDataSaveHint id={referenceDataSaveHintId} />
            )
          }
        >
          <DirtyStateButton
            aria-describedby={
              !associationSelectionsValid
                ? associationSelectionLimitHintIds
                : taxonomyOptions.readiness.canSave
                  ? undefined
                  : referenceDataSaveHintId
            }
            className="btn-primary"
            dirty={formDirty}
            disabled={
              submitting ||
              isRefreshing ||
              Boolean(staleConflict) ||
              Boolean(comparison) ||
              Boolean(restriction) ||
              !associationSelectionsValid ||
              !taxonomyOptions.readiness.canSave
            }
            type="submit"
          >
            {submitting ? tc('saving') : tc('save')}
          </DirtyStateButton>
          <button
            className="px-4 py-2.5 rounded-xl border text-sm font-medium min-h-11 min-w-11 text-secondary-700 dark:text-secondary-300 hover:bg-secondary-50 dark:hover:bg-secondary-800 transition-all duration-200"
            disabled={submitting || isRefreshing}
            onClick={event => void handleCancel(event.currentTarget)}
            type="button"
          >
            {tc('cancel')}
          </button>
        </FormActionRow>
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

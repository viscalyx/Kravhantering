'use client'

import {
  Activity,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  KeyRound,
  Link2,
  LoaderCircle,
  Plus,
  RefreshCw,
  Route,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  Wrench,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useState } from 'react'
import AutoDismissStatusToast from '@/components/AutoDismissStatusToast'
import { useConfirmModal } from '@/components/ConfirmModal'
import FormModal from '@/components/FormModal'
import type { AiCapability } from '@/lib/ai/admin-contracts'
import type {
  AiAdminAttestationRecord,
  AiAdminCapabilityDiscoveryResult,
  AiAdminCatalogItem,
  AiAdminConnectionDetail,
  AiAdminModelRecord,
  AiAdminModelRevisionRecord,
  AiAdminRunProfileRecord,
  AiAdminRunProfileRevisionRecord,
} from '@/lib/ai/admin-service'
import { AI_CAPABILITY_KEYS } from '@/lib/ai/capability-keys'
import type { AiRunProfileKey } from '@/lib/ai/profile-resolver'
import { devMarker } from '@/lib/developer-mode-markers'
import { AttestationForm, ConnectionForm, SecretForm } from './connection-forms'
import { ModelForm, ProfileForm } from './model-profile-forms'
import {
  AnimatedRegistrySection,
  attestationBlockerState,
  BlockerText,
  healthTone,
  lifecycleTone,
  revisionTone,
  StatusBadge,
} from './registry-sections'
import {
  type RegistryMutationFeedback,
  type RegistryRequestError,
  useRegistryRequestState,
} from './use-registry-request-state'

type DialogState =
  | { connection: AiAdminConnectionDetail | null; kind: 'connection' }
  | { connection: AiAdminConnectionDetail; kind: 'attestation' }
  | { connection: AiAdminConnectionDetail; kind: 'secret' }
  | {
      connection: AiAdminConnectionDetail
      kind: 'model'
      model: AiAdminModelRecord | null
    }
  | { kind: 'profile'; profile: AiAdminRunProfileRecord }
  | null

type CatalogStatus = 'idle' | 'loaded' | 'loading' | 'unavailable'
type PendingModelAction = {
  kind: 'health' | 'verification'
  revisionId: string
}

const OPERATIONAL_HEALTH_VALUES = [
  'degraded',
  'healthy',
  'unavailable',
  'unknown',
] as const
const MODEL_CAPABILITY_KEYS = AI_CAPABILITY_KEYS
const MODEL_VERIFICATION_CHECKS = [
  'adapterConformance',
  'cancellationHandled',
  'completed',
  'schemaValid',
] as const
const MODEL_VERIFICATION_FAILURE_CATEGORIES = [
  'adapter_failure',
  'authentication_failed',
  'cancelled',
  'capability_mismatch',
  'connection_unavailable',
  'deadline_exceeded',
  'invalid_response',
  'rate_limited',
  'request_rejected',
] as const

interface ModelVerificationFeedback {
  failedCapabilities: readonly (typeof MODEL_CAPABILITY_KEYS)[number][]
  failedChecks: readonly (typeof MODEL_VERIFICATION_CHECKS)[number][]
  failureCategory:
    | (typeof MODEL_VERIFICATION_FAILURE_CATEGORIES)[number]
    | 'unknown'
  passed: boolean
  unevaluatedCapabilities: readonly (typeof MODEL_CAPABILITY_KEYS)[number][]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function modelVerificationPassed(value: unknown): boolean {
  return (
    isRecord(value) &&
    isRecord(value.revision) &&
    value.revision.status === 'verified' &&
    isRecord(value.verification) &&
    value.verification.outcome === 'passed'
  )
}

function modelVerificationFeedback(value: unknown): ModelVerificationFeedback {
  const passed = modelVerificationPassed(value)
  const verification =
    isRecord(value) && isRecord(value.verification) ? value.verification : null
  const capabilityValues = verification?.failedCapabilities
  const checkValues = verification?.failedChecks
  const unevaluatedCapabilityValues = verification?.unevaluatedCapabilities
  const failedCapabilities = Array.isArray(capabilityValues)
    ? MODEL_CAPABILITY_KEYS.filter(capability =>
        capabilityValues.includes(capability),
      )
    : []
  const failedChecks = Array.isArray(checkValues)
    ? MODEL_VERIFICATION_CHECKS.filter(check => checkValues.includes(check))
    : []
  const unevaluatedCapabilities = Array.isArray(unevaluatedCapabilityValues)
    ? MODEL_CAPABILITY_KEYS.filter(capability =>
        unevaluatedCapabilityValues.includes(capability),
      )
    : []
  const category = verification?.failureCategory
  const failureCategory = MODEL_VERIFICATION_FAILURE_CATEGORIES.find(
    candidate => candidate === category,
  )
  return {
    failedCapabilities,
    failedChecks,
    failureCategory: failureCategory ?? 'unknown',
    passed,
    unevaluatedCapabilities,
  }
}

function latestRevision(
  model: Readonly<AiAdminModelRecord>,
): AiAdminModelRevisionRecord | undefined {
  return model.revisions.reduce<AiAdminModelRevisionRecord | undefined>(
    (selected, revision) =>
      !selected || revision.revisionNumber > selected.revisionNumber
        ? revision
        : selected,
    undefined,
  )
}

function catalogModelKey(
  externalModelId: string,
  externalModelVersion: string | null,
): string {
  return JSON.stringify([externalModelId, externalModelVersion])
}

function availableCatalogItems(
  connection: AiAdminConnectionDetail,
  editedModel: AiAdminModelRecord | null,
  catalog: readonly AiAdminCatalogItem[],
): readonly AiAdminCatalogItem[] {
  const registered = new Set(
    connection.models
      .filter(model => model.id !== editedModel?.id)
      .flatMap(model =>
        model.revisions.map(revision =>
          catalogModelKey(
            revision.externalModelId,
            revision.externalModelVersion,
          ),
        ),
      ),
  )
  return catalog.filter(
    item =>
      !registered.has(
        catalogModelKey(item.externalModelId, item.externalModelVersion),
      ),
  )
}

function capabilityDiscoveryResult(
  value: unknown,
): AiAdminCapabilityDiscoveryResult | null {
  if (
    !isRecord(value) ||
    !isRecord(value.assessments) ||
    !isRecord(value.capabilities)
  ) {
    return null
  }
  const rawAssessments = value.assessments
  const rawCapabilities = value.capabilities
  const capabilities = Object.fromEntries(
    MODEL_CAPABILITY_KEYS.map(capability => [
      capability,
      rawCapabilities[capability],
    ]),
  )
  if (
    MODEL_CAPABILITY_KEYS.some(
      capability => typeof capabilities[capability] !== 'boolean',
    )
  ) {
    return null
  }
  const assessments = Object.fromEntries(
    MODEL_CAPABILITY_KEYS.map(capability => {
      const assessment = rawAssessments[capability]
      if (!isRecord(assessment)) return [capability, null]
      const support = assessment.support
      const failureCategory = assessment.failureCategory
      return [
        capability,
        (support === 'supported' ||
          support === 'unsupported' ||
          support === 'unknown') &&
        (failureCategory === null || typeof failureCategory === 'string')
          ? { failureCategory, support }
          : null,
      ]
    }),
  )
  if (MODEL_CAPABILITY_KEYS.some(capability => !assessments[capability])) {
    return null
  }
  return {
    assessments: assessments as AiAdminCapabilityDiscoveryResult['assessments'],
    capabilities: capabilities as AiCapability,
  }
}

function operationalHealth(
  value: unknown,
): (typeof OPERATIONAL_HEALTH_VALUES)[number] {
  if (!isRecord(value)) return 'unknown'
  const health = value.operationalHealth
  return (
    OPERATIONAL_HEALTH_VALUES.find(candidate => candidate === health) ??
    'unknown'
  )
}

function profileName(
  t: ReturnType<typeof useTranslations>,
  key: AiRunProfileKey,
): string {
  return t(`profiles.${key}`)
}

function effectiveProfileStatus(profile: AiAdminRunProfileRecord): {
  key: 'active' | 'blocked' | 'notActivated' | 'suspended'
  tone: 'danger' | 'neutral' | 'success'
} {
  if (profile.operationalStatus === 'suspended') {
    return { key: 'suspended', tone: 'danger' }
  }
  if (!profile.activeRevisionId) {
    return { key: 'notActivated', tone: 'neutral' }
  }
  if (profile.blockers.length > 0) {
    return { key: 'blocked', tone: 'danger' }
  }
  return { key: 'active', tone: 'success' }
}

function profileRevisionMetadata(
  t: ReturnType<typeof useTranslations>,
  profile: AiAdminRunProfileRecord,
  revisions: readonly AiAdminRunProfileRevisionRecord[],
): string | null {
  const activeRevision = profile.activeRevisionId
    ? revisions.find(revision => revision.id === profile.activeRevisionId)
    : undefined
  const draftRevision = profile.draftRevision
  if (activeRevision && draftRevision) {
    return t('profile.revisionMetadata.activeAndDraft', {
      activeNumber: activeRevision.revisionNumber,
      draftNumber: draftRevision.revisionNumber,
    })
  }
  if (activeRevision) {
    return t('profile.revisionMetadata.active', {
      number: activeRevision.revisionNumber,
    })
  }
  if (draftRevision) {
    return t('profile.revisionMetadata.draft', {
      number: draftRevision.revisionNumber,
    })
  }
  return null
}

function RequestErrorAlert({
  actionLabel,
  error,
  loading = false,
  onAction,
}: {
  actionLabel?: string
  error: RegistryRequestError
  loading?: boolean
  onAction?: () => void
}) {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100"
      role="alert"
      {...devMarker({
        context: 'AI connection registry',
        name: 'AI connection error feedback',
      })}
    >
      <span className="flex min-w-0 items-start gap-2">
        <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{error.message}</span>
      </span>
      {onAction && actionLabel ? (
        <button
          className="btn-secondary px-3! py-1.5! text-xs"
          disabled={loading}
          onClick={onAction}
          type="button"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  )
}

export default function AiConnectionsPanel() {
  const t = useTranslations('admin.aiConnections')
  const tc = useTranslations('common')
  const { confirm } = useConfirmModal()
  const {
    busy,
    candidateBlockers,
    clearError,
    connections,
    details,
    error,
    loading,
    loadRegistry,
    message,
    messageDetails,
    messageTone,
    mutateAndReload,
    mutation,
    profiles,
    profileRevisions,
    setCandidateBlockers,
    setMessage,
  } = useRegistryRequestState()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<DialogState>(null)
  const [candidateId, setCandidateId] = useState<string | null>(null)
  const [savedAttestation, setSavedAttestation] =
    useState<AiAdminAttestationRecord | null>(null)
  const [dialogCatalogByConnection, setDialogCatalogByConnection] = useState<
    Readonly<Record<string, readonly AiAdminCatalogItem[]>>
  >({})
  const [visibleCatalogByConnection, setVisibleCatalogByConnection] = useState<
    Readonly<Record<string, readonly AiAdminCatalogItem[]>>
  >({})
  const [catalogStatusByConnection, setCatalogStatusByConnection] = useState<
    Readonly<Record<string, CatalogStatus>>
  >({})
  const [pendingModelAction, setPendingModelAction] =
    useState<PendingModelAction | null>(null)
  const dismissMessage = useCallback(() => setMessage(null), [setMessage])
  function closeDialog() {
    clearError()
    setDialog(null)
    setCandidateId(null)
    setSavedAttestation(null)
  }

  function openDialog(nextDialog: Exclude<DialogState, null>) {
    clearError()
    setDialog(nextDialog)
  }

  const modelRevisions = Object.values(details).flatMap(connection =>
    connection.models.flatMap(model => {
      const latest = latestRevision(model)
      return latest?.status === 'verified'
        ? [{ connection, model, revision: latest }]
        : []
    }),
  )

  function profilesForConnection(connection: AiAdminConnectionDetail) {
    const revisionIds = new Set(
      connection.models.flatMap(model =>
        model.revisions.map(revision => revision.id),
      ),
    )
    return profiles.filter(profile =>
      profileRevisions[profile.profileKey].some(revision =>
        (revision.status === 'active' || revision.status === 'draft') &&
        revision.modelRevisionId
          ? revisionIds.has(revision.modelRevisionId)
          : false,
      ),
    )
  }

  function modelUsedByProfile(model: AiAdminModelRecord): boolean {
    const revisionIds = new Set(model.revisions.map(revision => revision.id))
    return Object.values(profileRevisions).some(revisions =>
      revisions.some(
        revision =>
          (revision.status === 'active' || revision.status === 'draft') &&
          revision.modelRevisionId !== null &&
          revisionIds.has(revision.modelRevisionId),
      ),
    )
  }

  async function connectionAction(
    connection: AiAdminConnectionDetail,
    action: Record<string, unknown>,
    successKey: string,
    feedback: RegistryMutationFeedback,
  ) {
    await mutateAndReload(
      `/api/admin/ai-connections/${connection.id}/actions`,
      action,
      successKey,
      feedback,
    )
  }

  async function verifyModelRevision(
    connection: AiAdminConnectionDetail,
    revision: AiAdminModelRevisionRecord,
  ) {
    setPendingModelAction({
      kind: 'verification',
      revisionId: revision.id,
    })
    try {
      const response = await mutation(
        `/api/admin/ai-connections/${connection.id}/actions`,
        {
          action: 'verify_model_revision',
          modelRevisionId: revision.id,
          revisionToken: revision.revisionToken,
        },
        { actionLabel: t('actions.verifyModel') },
      )
      if (!response) return
      const feedback = modelVerificationFeedback(await response.json())
      await loadRegistry()
      if (feedback.passed) {
        setMessage(t('model.verified'))
      } else {
        const failureDetails = [
          t('model.verificationFailureReason', {
            reason: t(
              `model.verificationFailureCategories.${feedback.failureCategory}`,
            ),
          }),
          ...(feedback.failedCapabilities.length > 0
            ? [
                t('model.verificationFailedCapabilities', {
                  capabilities: feedback.failedCapabilities
                    .map(capability => t(`capabilities.${capability}`))
                    .join(', '),
                }),
              ]
            : []),
          ...(feedback.failedChecks.length > 0
            ? [
                t('model.verificationFailedChecks', {
                  checks: feedback.failedChecks
                    .map(check => t(`model.verificationChecks.${check}`))
                    .join(', '),
                }),
              ]
            : []),
          ...(feedback.unevaluatedCapabilities.length > 0
            ? [
                t('model.verificationUnevaluatedCapabilities', {
                  capabilities: feedback.unevaluatedCapabilities
                    .map(capability => t(`capabilities.${capability}`))
                    .join(', '),
                }),
              ]
            : []),
        ]
        setMessage(t('model.verificationFailed'), 'warning', failureDetails)
      }
    } finally {
      setPendingModelAction(null)
    }
  }

  async function probeModelHealth(
    connection: AiAdminConnectionDetail,
    revision: AiAdminModelRevisionRecord,
  ) {
    setPendingModelAction({ kind: 'health', revisionId: revision.id })
    try {
      const response = await mutation(
        `/api/admin/ai-connections/${connection.id}/actions`,
        {
          action: 'probe_health',
          modelRevisionId: revision.id,
          revisionToken: revision.revisionToken,
        },
        { actionLabel: t('actions.probeHealth') },
      )
      if (!response) return
      const health = operationalHealth(await response.json())
      await loadRegistry()
      setMessage(
        t(`health.probeResult.${health}`),
        health === 'healthy' ? 'success' : 'warning',
      )
    } finally {
      setPendingModelAction(null)
    }
  }

  async function fetchCatalog(
    connection: AiAdminConnectionDetail,
    notify = true,
  ): Promise<readonly AiAdminCatalogItem[] | null> {
    const connectionId = connection.id.toLowerCase()
    if (notify) {
      setVisibleCatalogByConnection(current => ({
        ...current,
        [connectionId]: [],
      }))
    } else {
      setDialogCatalogByConnection(current => ({
        ...current,
        [connectionId]: [],
      }))
      setCatalogStatusByConnection(current => ({
        ...current,
        [connectionId]: 'loading',
      }))
    }
    const response = await mutation(
      `/api/admin/ai-connections/${connection.id}/actions`,
      { action: 'fetch_catalog' },
      {
        actionLabel: t('actions.fetchCatalog'),
        suppressError: !notify,
      },
    )
    if (!response) {
      if (!notify) {
        setCatalogStatusByConnection(current => ({
          ...current,
          [connectionId]: 'unavailable',
        }))
      }
      return null
    }
    const items = (await response.json()) as AiAdminCatalogItem[]
    if (notify) {
      setVisibleCatalogByConnection(current => ({
        ...current,
        [connectionId]: items,
      }))
      setMessage(t('catalog.loaded'))
    } else {
      setDialogCatalogByConnection(current => ({
        ...current,
        [connectionId]: items,
      }))
      setCatalogStatusByConnection(current => ({
        ...current,
        [connectionId]: items.length > 0 ? 'loaded' : 'unavailable',
      }))
    }
    return items
  }

  async function discoverModelCapabilities(
    connection: AiAdminConnectionDetail,
    input: {
      capabilities: readonly (keyof AiCapability)[]
      externalModelId: string
      externalModelVersion: string | null
    },
  ): Promise<AiAdminCapabilityDiscoveryResult | null> {
    const response = await mutation(
      `/api/admin/ai-connections/${connection.id}/actions`,
      { action: 'discover_model_capabilities', ...input },
      { actionLabel: t('actions.checkCapabilities') },
    )
    if (!response) return null
    const result = capabilityDiscoveryResult(await response.json())
    if (!result) {
      setMessage(t('model.capabilityCheckInvalid'), 'warning')
      return null
    }
    const unknown = input.capabilities.filter(
      capability => result.assessments[capability].support === 'unknown',
    )
    setMessage(
      unknown.length > 0
        ? t('model.capabilityCheckIncomplete')
        : t('model.capabilitiesChecked'),
      unknown.length > 0 ? 'warning' : 'success',
      unknown.length > 0
        ? unknown.map(capability => {
            const category =
              MODEL_VERIFICATION_FAILURE_CATEGORIES.find(
                candidate =>
                  candidate === result.assessments[capability].failureCategory,
              ) ?? 'unknown'
            return t('model.capabilityCheckUnknownReason', {
              capability: t(`capabilities.${capability}`),
              reason: t(`model.verificationFailureCategories.${category}`),
            })
          })
        : [],
    )
    return result
  }

  function openModelForm(
    connection: AiAdminConnectionDetail,
    model: AiAdminModelRecord | null,
  ) {
    openDialog({ connection, kind: 'model', model })
    const connectionId = connection.id.toLowerCase()
    if (!connection.adapterAvailability.available) {
      setDialogCatalogByConnection(current => ({
        ...current,
        [connectionId]: [],
      }))
      setCatalogStatusByConnection(current => ({
        ...current,
        [connectionId]: 'unavailable',
      }))
      return
    }
    void fetchCatalog(connection, false)
  }

  async function confirmRetirement(
    connection: AiAdminConnectionDetail,
    revision?: AiAdminModelRevisionRecord,
    anchorEl?: HTMLElement,
  ) {
    const accepted = await confirm({
      anchorEl,
      confirmText: revision
        ? t('actions.retireModel')
        : t('actions.retireConnection'),
      icon: 'caution',
      message: revision
        ? t('model.retireConfirmMessage')
        : t('lifecycle.retireConfirmMessage'),
      title: revision
        ? t('model.retireConfirmTitle')
        : t('lifecycle.retireConfirmTitle'),
      variant: 'danger',
    })
    if (!accepted) return
    await connectionAction(
      connection,
      revision
        ? {
            action: 'retire_model_revision',
            modelRevisionId: revision.id,
            revisionToken: revision.revisionToken,
          }
        : {
            action: 'set_lifecycle',
            revisionToken: connection.revisionToken,
            status: 'retired',
          },
      revision ? 'model.retired' : 'lifecycle.retiredMessage',
      revision
        ? {
            actionLabel: t('actions.retireModel'),
          }
        : {
            actionLabel: t('actions.retireConnection'),
          },
    )
  }

  async function confirmModelDeletion(
    connection: AiAdminConnectionDetail,
    model: AiAdminModelRecord,
    anchorEl?: HTMLElement,
  ): Promise<void> {
    const accepted = await confirm({
      anchorEl,
      confirmText: t('actions.deleteModel'),
      icon: 'caution',
      message: t('model.deleteConfirmMessage'),
      title: t('model.deleteConfirmTitle'),
      variant: 'danger',
    })
    if (!accepted) return
    await connectionAction(
      connection,
      {
        action: 'delete_connection_model',
        modelId: model.id,
        revisionToken: model.revisionToken,
      },
      'model.deleted',
      { actionLabel: t('actions.deleteModel') },
    )
  }

  async function activateProfile(profile: AiAdminRunProfileRecord) {
    const draft = profile.draftRevision
    if (!draft?.modelRevisionId) return
    const target = modelRevisions.find(
      ({ revision }) => revision.id === draft.modelRevisionId,
    )
    if (
      !target?.connection.adapterAvailability.available ||
      target.connection.lifecycleStatus !== 'active'
    ) {
      return
    }
    const activated = await mutateAndReload(
      `/api/admin/ai-run-profiles/${profile.profileKey}/actions`,
      {
        action: 'activate_revision',
        connectionRevisionToken: target.connection.revisionToken,
        modelRevisionToken: target.revision.revisionToken,
        profileRevisionId: draft.id,
        profileRevisionToken: draft.revisionToken,
        profileToken: profile.revisionToken,
      },
      'profile.activated',
      {
        actionLabel: t('actions.activateProfile'),
      },
    )
    if (activated) {
      setCandidateBlockers(current => ({
        ...current,
        [profile.profileKey]: [],
      }))
    }
  }

  return (
    <div
      className="rounded-3xl border border-secondary-200 bg-white dark:border-secondary-700 dark:bg-secondary-900"
      {...devMarker({
        context: 'admin settings',
        name: 'AI connection registry',
        priority: 500,
      })}
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-secondary-200 p-5 dark:border-secondary-700">
        <div className="max-w-3xl">
          <h3
            className="flex items-center gap-2 text-lg font-semibold text-secondary-950 dark:text-secondary-50"
            id="admin-ai-connections-title"
          >
            <Link2
              aria-hidden="true"
              className="h-5 w-5 text-primary-700 dark:text-primary-300"
            />
            {t('title')}
          </h3>
          <p className="mt-1 text-sm leading-6 text-secondary-600 dark:text-secondary-300">
            {t('description')}
          </p>
          <p className="mt-2 text-xs font-medium text-secondary-500 dark:text-secondary-400">
            {t('noFallback')}
          </p>
        </div>
        <button
          className="btn-primary inline-flex min-h-10 items-center gap-2 px-4! py-2! text-sm"
          onClick={() => openDialog({ connection: null, kind: 'connection' })}
          type="button"
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
          {t('actions.addConnection')}
        </button>
      </div>

      {message ? (
        <AutoDismissStatusToast
          details={messageDetails}
          key={`${messageTone}-${message}`}
          message={message}
          onDismiss={dismissMessage}
          tone={messageTone}
        />
      ) : null}
      {error ? (
        <div className="fixed inset-x-4 bottom-4 z-80 ml-auto max-w-xl sm:left-auto sm:right-4">
          <RequestErrorAlert
            actionLabel={error.kind === 'load' ? tc('retry') : tc('close')}
            error={error}
            loading={loading}
            onAction={
              error.kind === 'load'
                ? () => void loadRegistry()
                : () => clearError()
            }
          />
        </div>
      ) : null}

      {loading ? (
        <p
          className="p-5 text-sm text-secondary-600 dark:text-secondary-300"
          role="status"
        >
          {t('loading')}
        </p>
      ) : null}
      {!loading && connections.length === 0 ? (
        <p className="p-5 text-sm text-secondary-600 dark:text-secondary-300">
          {t('empty')}
        </p>
      ) : null}

      <div className="divide-y divide-secondary-200 dark:divide-secondary-700">
        {connections.map(connection => {
          const detail = details[connection.id]
          const expanded = expandedId === connection.id
          const catalog =
            visibleCatalogByConnection[connection.id.toLowerCase()] ?? []
          return (
            <article key={connection.id}>
              <button
                aria-controls={`ai-connection-${connection.id}`}
                aria-expanded={expanded}
                className={`grid w-full gap-3 p-5 text-left transition-colors sm:grid-cols-[minmax(0,1fr)_minmax(10rem,auto)_minmax(10rem,auto)_auto] sm:items-center ${expanded ? 'bg-primary-50/70 dark:bg-primary-950/30' : 'hover:bg-secondary-50 dark:hover:bg-secondary-800/40'}`}
                onClick={() => {
                  setExpandedId(current =>
                    current === connection.id ? null : connection.id,
                  )
                }}
                type="button"
              >
                <span className="min-w-0">
                  <span className="block font-semibold text-secondary-950 dark:text-secondary-50">
                    {connection.administrationName}
                  </span>
                  <span className="mt-1 block truncate text-xs text-secondary-500 dark:text-secondary-400">
                    {connection.publicName}
                  </span>
                </span>
                <span>
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-secondary-500 dark:text-secondary-400">
                    {t('lifecycle.label')}
                  </span>
                  <StatusBadge tone={lifecycleTone(connection.lifecycleStatus)}>
                    {t(`lifecycle.${connection.lifecycleStatus}`)}
                  </StatusBadge>
                </span>
                <span>
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-secondary-500 dark:text-secondary-400">
                    {t('health.label')}
                  </span>
                  <StatusBadge tone={healthTone(connection.operationalHealth)}>
                    {t(`health.${connection.operationalHealth}`)}
                  </StatusBadge>
                </span>
                <span className="inline-flex min-h-9 min-w-9 items-center justify-center justify-self-end rounded-full text-secondary-600 dark:text-secondary-300">
                  {expanded ? (
                    <ChevronDown aria-hidden="true" className="h-4 w-4" />
                  ) : (
                    <ChevronRight aria-hidden="true" className="h-4 w-4" />
                  )}
                </span>
              </button>
              {detail ? (
                <AnimatedRegistrySection
                  expanded={expanded}
                  id={`ai-connection-${connection.id}`}
                >
                  <div className="space-y-5 border-t border-primary-200 bg-white p-5 dark:border-primary-900 dark:bg-secondary-900">
                    {!detail.adapterAvailability.available ? (
                      <div
                        className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
                        role="status"
                        {...devMarker({
                          context: 'AI connection registry',
                          name: 'AI adapter unavailable status',
                        })}
                      >
                        <TriangleAlert
                          aria-hidden="true"
                          className="h-5 w-5 shrink-0"
                        />
                        <p>
                          {t('adapter.unavailable', {
                            adapter: `${detail.adapterKey}@${detail.adapterVersion}`,
                          })}
                        </p>
                      </div>
                    ) : null}
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <h4 className="text-xl font-semibold text-secondary-950 dark:text-secondary-50">
                          {detail.administrationName}
                        </h4>
                        <p className="mt-1 text-sm text-secondary-600 dark:text-secondary-300">
                          {detail.description ?? t('values.noDescription')}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          className="btn-secondary inline-flex min-h-10 items-center gap-2 px-4! py-2! text-sm"
                          onClick={() =>
                            openDialog({
                              connection: detail,
                              kind: 'connection',
                            })
                          }
                          type="button"
                        >
                          <Wrench aria-hidden="true" className="h-4 w-4" />
                          {t('actions.editConnection')}
                        </button>
                        <button
                          className="btn-secondary inline-flex min-h-10 items-center gap-2 px-4! py-2! text-sm"
                          onClick={() =>
                            openDialog({ connection: detail, kind: 'secret' })
                          }
                          type="button"
                        >
                          <KeyRound aria-hidden="true" className="h-4 w-4" />
                          {t('actions.manageSecret')}
                        </button>
                        <button
                          className="btn-secondary inline-flex min-h-10 items-center gap-2 px-4! py-2! text-sm"
                          onClick={() =>
                            openDialog({
                              connection: detail,
                              kind: 'attestation',
                            })
                          }
                          type="button"
                        >
                          <ShieldCheck aria-hidden="true" className="h-4 w-4" />
                          {t('actions.manageAttestation')}
                        </button>
                      </div>
                    </div>

                    {detail.blockers.length > 0 ? (
                      <section
                        aria-labelledby={`ai-blockers-${detail.id}`}
                        className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40"
                      >
                        <h5
                          className="flex items-center gap-2 font-semibold text-amber-950 dark:text-amber-100"
                          id={`ai-blockers-${detail.id}`}
                        >
                          <TriangleAlert
                            aria-hidden="true"
                            className="h-4 w-4"
                          />
                          {t('blockers.title')}
                        </h5>
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900 dark:text-amber-100">
                          {detail.blockers.map(blocker => (
                            <li key={`${blocker.code}-${blocker.field ?? ''}`}>
                              <BlockerText
                                attestationState={attestationBlockerState(
                                  detail,
                                )}
                                blocker={blocker}
                              />
                            </li>
                          ))}
                        </ul>
                      </section>
                    ) : null}

                    <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                      <section className="rounded-2xl bg-secondary-50 p-4 dark:bg-secondary-950/50">
                        <h5 className="font-semibold text-secondary-950 dark:text-secondary-50">
                          {t('configuration.title')}
                        </h5>
                        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
                          {[
                            [
                              t('fields.adapterKey.label'),
                              `${detail.adapterKey}@${detail.adapterVersion}`,
                            ],
                            [t('fields.endpointUrl.label'), detail.endpointUrl],
                            [
                              t('fields.authenticationType.label'),
                              t(`authentication.${detail.authenticationType}`),
                            ],
                            [
                              t('fields.tlsPolicyKey.label'),
                              detail.tlsPolicyKey,
                            ],
                            [
                              t('fields.egressPolicyKey.label'),
                              detail.egressPolicyKey,
                            ],
                            [
                              t('fields.maximumConcurrency.label'),
                              String(detail.maximumConcurrency),
                            ],
                          ].map(([label, value]) => (
                            <div key={label}>
                              <dt className="text-xs font-semibold uppercase tracking-wide text-secondary-500 dark:text-secondary-400">
                                {label}
                              </dt>
                              <dd className="mt-1 wrap-break-word font-medium text-secondary-900 dark:text-secondary-100">
                                {value}
                              </dd>
                            </div>
                          ))}
                        </dl>
                        <p className="mt-4 rounded-xl border border-secondary-200 bg-white p-3 text-xs leading-5 text-secondary-600 dark:border-secondary-700 dark:bg-secondary-900 dark:text-secondary-300">
                          <strong>{t('configuration.dataPolicy')}:</strong>{' '}
                          {detail.dataPolicySummary}
                        </p>
                        <p className="mt-3 text-xs text-secondary-600 dark:text-secondary-300">
                          {detail.attestation
                            ? t(
                                `attestation.status.${detail.attestation.status}`,
                              )
                            : t('attestation.missing')}
                        </p>
                      </section>

                      <section className="rounded-2xl border border-secondary-200 p-4 dark:border-secondary-700">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <h5 className="font-semibold text-secondary-950 dark:text-secondary-50">
                              {t('model.title')}
                            </h5>
                            <p className="mt-1 text-xs text-secondary-500 dark:text-secondary-400">
                              {t('model.description')}
                            </p>
                          </div>
                          <button
                            className="btn-secondary inline-flex min-h-9 items-center gap-2 px-3! py-1.5! text-sm"
                            onClick={() => openModelForm(detail, null)}
                            type="button"
                          >
                            <Plus aria-hidden="true" className="h-4 w-4" />
                            {t('actions.addModel')}
                          </button>
                        </div>
                        <div className="mt-4 space-y-3">
                          {detail.models.length === 0 ? (
                            <p className="rounded-xl border border-dashed border-secondary-300 p-4 text-sm text-secondary-600 dark:border-secondary-700 dark:text-secondary-300">
                              {t('model.empty')}
                            </p>
                          ) : null}
                          {detail.models.map(model => {
                            const latest = latestRevision(model)
                            if (!latest) return null
                            const usedByProfile = modelUsedByProfile(model)
                            const verifying =
                              pendingModelAction?.kind === 'verification' &&
                              pendingModelAction.revisionId === latest.id
                            const probingHealth =
                              pendingModelAction?.kind === 'health' &&
                              pendingModelAction.revisionId === latest.id
                            return (
                              <article
                                className="rounded-xl bg-secondary-50 p-3 dark:bg-secondary-950/50"
                                key={model.id}
                              >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <h6 className="font-semibold text-secondary-900 dark:text-secondary-100">
                                      {model.name}
                                    </h6>
                                    <p className="mt-1 text-xs text-secondary-500 dark:text-secondary-400">
                                      {latest.externalModelId} ·{' '}
                                      {t('model.revision', {
                                        number: latest.revisionNumber,
                                      })}
                                    </p>
                                  </div>
                                  <StatusBadge
                                    tone={revisionTone(latest.status)}
                                  >
                                    {t(`model.status.${latest.status}`)}
                                  </StatusBadge>
                                </div>
                                <div
                                  className="mt-3 flex flex-wrap gap-2"
                                  {...devMarker({
                                    context: 'AI connection model revision',
                                    name: 'AI model lifecycle and health actions',
                                    priority: 310,
                                  })}
                                >
                                  <button
                                    className="btn-secondary px-3! py-1.5! text-xs"
                                    disabled={latest.status === 'retired'}
                                    onClick={() => openModelForm(detail, model)}
                                    type="button"
                                  >
                                    {t('actions.editModel')}
                                  </button>
                                  <button
                                    aria-busy={verifying}
                                    className="btn-secondary inline-flex items-center gap-1.5 px-3! py-1.5! text-xs disabled:cursor-not-allowed disabled:opacity-50"
                                    disabled={
                                      busy ||
                                      pendingModelAction !== null ||
                                      !detail.adapterAvailability.available ||
                                      detail.connectionEvidenceId === null ||
                                      latest.status === 'verified' ||
                                      latest.status === 'retired'
                                    }
                                    onClick={() =>
                                      void verifyModelRevision(detail, latest)
                                    }
                                    title={
                                      !detail.adapterAvailability.available
                                        ? t('adapter.unavailableAction')
                                        : detail.connectionEvidenceId === null
                                          ? t('model.verifyConnectionFirst')
                                          : latest.status === 'verified'
                                            ? t('model.alreadyVerified')
                                            : t('model.testCost')
                                    }
                                    type="button"
                                  >
                                    {verifying ? (
                                      <LoaderCircle
                                        aria-hidden="true"
                                        className="h-3.5 w-3.5 animate-spin"
                                      />
                                    ) : null}
                                    {t(
                                      verifying
                                        ? 'actions.verifyingModel'
                                        : 'actions.verifyModel',
                                    )}
                                  </button>
                                  <button
                                    aria-busy={probingHealth}
                                    className="btn-secondary inline-flex items-center gap-1.5 px-3! py-1.5! text-xs disabled:cursor-not-allowed disabled:opacity-50"
                                    disabled={
                                      busy ||
                                      pendingModelAction !== null ||
                                      !detail.adapterAvailability.available ||
                                      latest.status !== 'verified'
                                    }
                                    onClick={() =>
                                      void probeModelHealth(detail, latest)
                                    }
                                    title={
                                      !detail.adapterAvailability.available
                                        ? t('adapter.unavailableAction')
                                        : latest.status !== 'verified'
                                          ? t('health.verifyModelFirst')
                                          : t('health.safeRecoveryHelp')
                                    }
                                    type="button"
                                  >
                                    {probingHealth ? (
                                      <LoaderCircle
                                        aria-hidden="true"
                                        className="h-3.5 w-3.5 animate-spin"
                                      />
                                    ) : null}
                                    {t(
                                      probingHealth
                                        ? 'actions.probingHealth'
                                        : 'actions.probeHealth',
                                    )}
                                  </button>
                                  <button
                                    className="btn-secondary px-3! py-1.5! text-xs"
                                    disabled={
                                      busy ||
                                      usedByProfile ||
                                      latest.status === 'retired'
                                    }
                                    onClick={event =>
                                      void confirmRetirement(
                                        detail,
                                        latest,
                                        event.currentTarget,
                                      )
                                    }
                                    title={
                                      usedByProfile
                                        ? t('model.usedByProfileHelp')
                                        : latest.status === 'retired'
                                          ? t('model.alreadyRetiredHelp')
                                          : undefined
                                    }
                                    type="button"
                                  >
                                    {t('actions.retireModel')}
                                  </button>
                                  <button
                                    aria-label={t('actions.deleteModel')}
                                    className="inline-flex min-h-6 min-w-6 items-center justify-center rounded-md border border-red-300 bg-red-50 p-1.5! text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/70"
                                    disabled={
                                      busy ||
                                      usedByProfile ||
                                      latest.status !== 'retired'
                                    }
                                    onClick={event =>
                                      void confirmModelDeletion(
                                        detail,
                                        model,
                                        event.currentTarget,
                                      )
                                    }
                                    title={
                                      usedByProfile
                                        ? t('model.usedByProfileHelp')
                                        : latest.status !== 'retired'
                                          ? t(
                                              'model.deleteRequiresRetirementHelp',
                                            )
                                          : t('actions.deleteModel')
                                    }
                                    type="button"
                                  >
                                    <Trash2
                                      aria-hidden="true"
                                      className="h-4 w-4"
                                    />
                                  </button>
                                </div>
                                {latest.status !== 'verified' &&
                                latest.status !== 'retired' ? (
                                  <p className="mt-2 text-xs text-secondary-600 dark:text-secondary-300">
                                    {t('health.verifyModelFirst')}
                                  </p>
                                ) : null}
                              </article>
                            )
                          })}
                        </div>
                      </section>
                    </div>

                    <section className="rounded-2xl border border-secondary-200 p-4 dark:border-secondary-700">
                      <h5 className="font-semibold text-secondary-950 dark:text-secondary-50">
                        {t('profile.impactTitle')}
                      </h5>
                      <p className="mt-1 text-xs text-secondary-500 dark:text-secondary-400">
                        {t('profile.impactDescription')}
                      </p>
                      <div className="mt-3 grid gap-3 md:grid-cols-3">
                        {profilesForConnection(detail).length > 0 ? (
                          profilesForConnection(detail).map(profile => {
                            const status = effectiveProfileStatus(profile)
                            return (
                              <div
                                className="flex items-center justify-between gap-3 rounded-xl bg-secondary-50 p-3 dark:bg-secondary-950/50"
                                key={profile.id}
                              >
                                <span className="text-sm text-secondary-700 dark:text-secondary-200">
                                  {profileName(t, profile.profileKey)}
                                </span>
                                <StatusBadge tone={status.tone}>
                                  {t(`profile.effectiveStatus.${status.key}`)}
                                </StatusBadge>
                              </div>
                            )
                          })
                        ) : (
                          <p className="text-sm text-secondary-600 dark:text-secondary-300">
                            {t('profile.noImpact')}
                          </p>
                        )}
                      </div>
                    </section>

                    <section className="rounded-2xl border border-primary-200 bg-primary-50/50 p-4 dark:border-primary-900 dark:bg-primary-950/20">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="max-w-2xl">
                          <h5 className="flex items-center gap-2 font-semibold text-secondary-950 dark:text-secondary-50">
                            <Activity aria-hidden="true" className="h-4 w-4" />
                            {t('verification.title')}
                          </h5>
                          <p className="mt-1 text-xs leading-5 text-secondary-600 dark:text-secondary-300">
                            {t('verification.cost')}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-secondary-600 dark:text-secondary-300">
                            {t('health.safeRecoveryHelp')}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            className="btn-secondary inline-flex min-h-10 items-center gap-2 px-4! py-2! text-sm"
                            disabled={
                              busy || !detail.adapterAvailability.available
                            }
                            onClick={() => void fetchCatalog(detail)}
                            title={
                              detail.adapterAvailability.available
                                ? undefined
                                : t('adapter.unavailableAction')
                            }
                            type="button"
                          >
                            <RefreshCw aria-hidden="true" className="h-4 w-4" />
                            {t('actions.fetchCatalog')}
                          </button>
                          <button
                            className="btn-secondary px-4! py-2! text-sm"
                            disabled={
                              busy || !detail.adapterAvailability.available
                            }
                            onClick={() =>
                              void connectionAction(
                                detail,
                                { action: 'verify_connection' },
                                'verification.completed',
                                {
                                  actionLabel: t('actions.verifyConnection'),
                                },
                              )
                            }
                            title={
                              detail.adapterAvailability.available
                                ? undefined
                                : t('adapter.unavailableAction')
                            }
                            type="button"
                          >
                            {t('actions.verifyConnection')}
                          </button>
                          {detail.lifecycleStatus === 'active' ? (
                            <button
                              className="btn-secondary px-4! py-2! text-sm"
                              disabled={busy}
                              onClick={() =>
                                void connectionAction(
                                  detail,
                                  {
                                    action: 'set_lifecycle',
                                    revisionToken: detail.revisionToken,
                                    status: 'suspended',
                                  },
                                  'lifecycle.suspendedMessage',
                                  {
                                    actionLabel: t('actions.suspendConnection'),
                                  },
                                )
                              }
                              type="button"
                            >
                              {t('actions.suspendConnection')}
                            </button>
                          ) : (
                            <button
                              className="btn-primary px-4! py-2! text-sm"
                              disabled={
                                busy ||
                                !detail.adapterAvailability.available ||
                                detail.blockers.length > 0 ||
                                detail.lifecycleStatus === 'retired'
                              }
                              onClick={() =>
                                void connectionAction(
                                  detail,
                                  {
                                    action: 'set_lifecycle',
                                    revisionToken: detail.revisionToken,
                                    status: 'active',
                                  },
                                  'lifecycle.activatedMessage',
                                  {
                                    actionLabel: t(
                                      detail.lifecycleStatus === 'suspended'
                                        ? 'actions.recoverConnection'
                                        : 'actions.activateConnection',
                                    ),
                                  },
                                )
                              }
                              title={
                                !detail.adapterAvailability.available
                                  ? t('adapter.unavailableAction')
                                  : detail.blockers.length > 0
                                    ? t('blockers.resolveBeforeActivation')
                                    : undefined
                              }
                              type="button"
                            >
                              {detail.lifecycleStatus === 'suspended'
                                ? t('actions.recoverConnection')
                                : t('actions.activateConnection')}
                            </button>
                          )}
                          <button
                            className="btn-destructive px-4! py-2! text-sm"
                            disabled={
                              busy || detail.lifecycleStatus === 'retired'
                            }
                            onClick={event =>
                              void confirmRetirement(
                                detail,
                                undefined,
                                event.currentTarget,
                              )
                            }
                            type="button"
                          >
                            {t('actions.retireConnection')}
                          </button>
                        </div>
                      </div>
                      {catalog.length > 0 ? (
                        <p className="mt-3 text-xs text-secondary-600 dark:text-secondary-300">
                          {t('catalog.result', {
                            models: catalog.map(item => item.name).join(', '),
                          })}
                        </p>
                      ) : null}
                    </section>
                  </div>
                </AnimatedRegistrySection>
              ) : null}
            </article>
          )
        })}
      </div>

      <div className="border-t border-secondary-200 p-5 dark:border-secondary-700">
        <div className="flex items-start gap-3">
          <Route
            aria-hidden="true"
            className="mt-0.5 h-5 w-5 text-primary-700 dark:text-primary-300"
          />
          <div>
            <h3
              className="font-semibold text-secondary-950 dark:text-secondary-50"
              id="ai-run-profiles-title"
            >
              {t('profile.title')}
            </h3>
            <p className="mt-1 text-sm text-secondary-600 dark:text-secondary-300">
              {t('profile.description')}
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {profiles.map(profile => {
            const status = effectiveProfileStatus(profile)
            const revisionMetadata = profileRevisionMetadata(
              t,
              profile,
              profileRevisions[profile.profileKey],
            )
            const target = profile.draftRevision?.modelRevisionId
              ? modelRevisions.find(
                  ({ revision }) =>
                    revision.id === profile.draftRevision?.modelRevisionId,
                )
              : undefined
            const adapterUnavailable =
              target?.connection.adapterAvailability.available === false
            const connectionInactive =
              target?.connection.lifecycleStatus !== undefined &&
              target.connection.lifecycleStatus !== 'active'
            return (
              <article
                className="rounded-2xl border border-secondary-200 p-4 dark:border-secondary-700"
                key={profile.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-semibold text-secondary-950 dark:text-secondary-50">
                      {profileName(t, profile.profileKey)}
                    </h4>
                    {revisionMetadata ? (
                      <p className="mt-1 text-xs text-secondary-500 dark:text-secondary-400">
                        {revisionMetadata}
                      </p>
                    ) : null}
                  </div>
                  <StatusBadge tone={status.tone}>
                    {t(`profile.effectiveStatus.${status.key}`)}
                  </StatusBadge>
                </div>
                {profile.blockers.length > 0 ? (
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-amber-800 dark:text-amber-200">
                    {profile.blockers.map(blocker => (
                      <li key={`${blocker.code}-${blocker.field ?? ''}`}>
                        <BlockerText
                          attestationState={
                            target
                              ? attestationBlockerState(target.connection)
                              : undefined
                          }
                          blocker={blocker}
                        />
                      </li>
                    ))}
                  </ul>
                ) : null}
                {(candidateBlockers[profile.profileKey]?.length ?? 0) > 0 ? (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                    <p className="font-semibold">
                      {t('profile.candidateBlockers')}
                    </p>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      {candidateBlockers[profile.profileKey]?.map(blocker => (
                        <li key={`${blocker.code}-${blocker.field ?? ''}`}>
                          <BlockerText
                            attestationState={
                              target
                                ? attestationBlockerState(target.connection)
                                : undefined
                            }
                            blocker={blocker}
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    className="btn-secondary px-3! py-1.5! text-xs"
                    onClick={() => openDialog({ kind: 'profile', profile })}
                    type="button"
                  >
                    {profile.draftRevision
                      ? t('actions.editProfile')
                      : t('actions.createProfileRevision')}
                  </button>
                  <button
                    className="btn-primary px-3! py-1.5! text-xs"
                    disabled={
                      busy ||
                      !profile.draftRevision?.modelRevisionId ||
                      adapterUnavailable ||
                      connectionInactive
                    }
                    onClick={() => void activateProfile(profile)}
                    title={
                      adapterUnavailable
                        ? t('adapter.unavailableAction')
                        : connectionInactive
                          ? t('blockers.connection_inactive')
                          : undefined
                    }
                    type="button"
                  >
                    {t('actions.activateProfile')}
                  </button>
                  <button
                    className="btn-secondary px-3! py-1.5! text-xs"
                    disabled={busy}
                    onClick={() =>
                      void mutateAndReload(
                        `/api/admin/ai-run-profiles/${profile.profileKey}/actions`,
                        {
                          action: 'set_operational_status',
                          revisionToken: profile.revisionToken,
                          status:
                            profile.operationalStatus === 'enabled'
                              ? 'suspended'
                              : 'enabled',
                        },
                        profile.operationalStatus === 'enabled'
                          ? 'profile.suspended'
                          : 'profile.recovered',
                        {
                          actionLabel: t(
                            profile.operationalStatus === 'enabled'
                              ? 'actions.suspendProfile'
                              : 'actions.recoverProfile',
                          ),
                        },
                      )
                    }
                    type="button"
                  >
                    {profile.operationalStatus === 'enabled'
                      ? t('actions.suspendProfile')
                      : t('actions.recoverProfile')}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      </div>

      <FormModal
        closeDisabled={busy}
        developerModeValue="AI connection form"
        onClose={closeDialog}
        open={dialog?.kind === 'connection'}
        title={
          dialog?.kind === 'connection' && dialog.connection
            ? t('dialogs.editConnection')
            : t('dialogs.createConnection')
        }
        titleId="ai-connection-dialog-title"
      >
        {dialog?.kind === 'connection' ? (
          <ConnectionForm
            busy={busy}
            connection={dialog.connection}
            onCancel={closeDialog}
            onSubmit={async value => {
              const success = dialog.connection
                ? await mutateAndReload(
                    `/api/admin/ai-connections/${dialog.connection.id}`,
                    {
                      ...value,
                      revisionToken: dialog.connection.revisionToken,
                    },
                    'connection.updated',
                    { actionLabel: t('actions.saveConnection') },
                    'PATCH',
                  )
                : await mutateAndReload(
                    '/api/admin/ai-connections',
                    value,
                    'connection.created',
                    { actionLabel: t('actions.saveConnection') },
                  )
              if (success) closeDialog()
            }}
          />
        ) : null}
      </FormModal>

      <FormModal
        closeDisabled={busy}
        developerModeValue="AI model form"
        onClose={closeDialog}
        open={dialog?.kind === 'model'}
        title={
          dialog?.kind === 'model' && dialog.model
            ? t('dialogs.editModel')
            : t('dialogs.createModel')
        }
        titleId="ai-model-dialog-title"
      >
        {dialog?.kind === 'model' ? (
          <ModelForm
            busy={busy}
            catalog={availableCatalogItems(
              dialog.connection,
              dialog.model,
              dialogCatalogByConnection[dialog.connection.id.toLowerCase()] ??
                [],
            )}
            catalogStatus={
              catalogStatusByConnection[dialog.connection.id.toLowerCase()] ??
              'idle'
            }
            model={dialog.model}
            onCancel={closeDialog}
            onDiscoverCapabilities={input =>
              discoverModelCapabilities(dialog.connection, input)
            }
            onRefreshCatalog={() => fetchCatalog(dialog.connection, false)}
            onSubmit={async value => {
              const success = await mutateAndReload(
                `/api/admin/ai-connections/${dialog.connection.id}/actions`,
                { action: 'save_model_revision', modelRevision: value },
                'model.saved',
                { actionLabel: t('actions.saveModel') },
              )
              if (success) closeDialog()
            }}
          />
        ) : null}
      </FormModal>

      <FormModal
        closeDisabled={busy}
        developerModeValue="AI provider secret form"
        onClose={closeDialog}
        open={dialog?.kind === 'secret'}
        title={t('dialogs.secret')}
        titleId="ai-secret-dialog-title"
      >
        {dialog?.kind === 'secret' ? (
          <SecretForm
            busy={busy}
            candidateId={candidateId}
            connection={dialog.connection}
            onActivate={async secretVersionId => {
              const success = await mutateAndReload(
                `/api/admin/ai-connections/${dialog.connection.id}/actions`,
                {
                  action: 'activate_secret',
                  connectionConfigurationVersion:
                    dialog.connection.configurationVersion,
                  connectionRevisionToken: dialog.connection.revisionToken,
                  secretVersionId,
                },
                'secret.activated',
                { actionLabel: t('secret.activateCandidate') },
              )
              if (success) closeDialog()
            }}
            onCancel={closeDialog}
            onConfirmRevocation={(secretVersionId, anchorEl) => {
              void (async () => {
                const accepted = await confirm({
                  anchorEl,
                  confirmText: t('secret.confirmRevocation'),
                  icon: 'caution',
                  message: t('secret.revocationConfirmMessage'),
                  title: t('secret.revocationConfirmTitle'),
                  variant: 'danger',
                })
                if (!accepted) return
                const success = await mutateAndReload(
                  `/api/admin/ai-connections/${dialog.connection.id}/actions`,
                  { action: 'confirm_secret_revocation', secretVersionId },
                  'secret.revocationConfirmed',
                  { actionLabel: t('secret.confirmRevocation') },
                )
                if (success) closeDialog()
              })()
            }}
            onDelete={async (secretVersionId, anchorEl) => {
              const accepted = await confirm({
                anchorEl,
                confirmText: t('secret.deleteCandidate'),
                icon: 'caution',
                message: t('secret.deleteConfirmMessage'),
                title: t('secret.deleteConfirmTitle'),
                variant: 'danger',
              })
              if (!accepted) return
              const success = await mutateAndReload(
                `/api/admin/ai-connections/${dialog.connection.id}/actions`,
                { action: 'delete_secret_candidate', secretVersionId },
                'secret.deleted',
                { actionLabel: t('secret.deleteCandidate') },
              )
              if (success) setCandidateId(null)
            }}
            onWrite={async (secret, form) => {
              const response = await mutation(
                `/api/admin/ai-connections/${dialog.connection.id}/actions`,
                { action: 'write_secret', secret },
                { actionLabel: t('secret.writeCandidate') },
              )
              if (!response) return
              const candidate = (await response.json()) as { id: string }
              form.reset()
              setCandidateId(candidate.id)
              setMessage(t('secret.written'))
            }}
          />
        ) : null}
      </FormModal>

      <FormModal
        closeDisabled={busy || loading}
        developerModeValue="AI attestation form"
        maxWidthClassName="max-w-4xl"
        onClose={closeDialog}
        open={dialog?.kind === 'attestation'}
        title={t('dialogs.attestation')}
        titleId="ai-attestation-dialog-title"
      >
        {dialog?.kind === 'attestation' ? (
          <AttestationForm
            busy={busy || loading}
            connection={dialog.connection}
            onAttest={async (attestation, currentAttestationRevisionToken) => {
              const success = await mutateAndReload(
                `/api/admin/ai-connections/${dialog.connection.id}/actions`,
                {
                  action: 'attest',
                  attestation,
                  currentAttestationRevisionToken,
                },
                'attestation.approved',
                { actionLabel: t('attestation.approve') },
              )
              if (success) closeDialog()
            }}
            onCancel={closeDialog}
            onDiscard={async (
              draft,
              currentAttestationRevisionToken,
              anchorEl,
            ) => {
              const accepted = await confirm({
                anchorEl,
                confirmText: t('attestation.discardDraft'),
                icon: 'caution',
                message: t('attestation.discardConfirmMessage'),
                title: t('attestation.discardConfirmTitle'),
                variant: 'danger',
              })
              if (!accepted) return
              const success = await mutateAndReload(
                `/api/admin/ai-connections/${dialog.connection.id}/actions`,
                {
                  action: 'discard_attestation_draft',
                  currentAttestationRevisionToken,
                  draftAttestationId: draft.id,
                  draftAttestationRevisionToken: draft.revisionToken,
                },
                'attestation.discarded',
                { actionLabel: t('attestation.discardDraft') },
              )
              if (success) closeDialog()
            }}
            onSave={async attestation => {
              const response = await mutation(
                `/api/admin/ai-connections/${dialog.connection.id}/actions`,
                { action: 'save_attestation', attestation },
                { actionLabel: t('attestation.saveDraft') },
              )
              if (!response) return
              const saved = (await response.json()) as AiAdminAttestationRecord
              setSavedAttestation(saved)
              setMessage(t('attestation.saved'))
              await loadRegistry()
            }}
            savedDraft={savedAttestation}
          />
        ) : null}
      </FormModal>

      <FormModal
        closeDisabled={busy}
        developerModeValue="AI run profile form"
        maxWidthClassName="max-w-4xl"
        onClose={closeDialog}
        open={dialog?.kind === 'profile'}
        title={t('dialogs.profile')}
        titleId="ai-profile-dialog-title"
      >
        {dialog?.kind === 'profile' ? (
          <ProfileForm
            busy={busy}
            modelRevisions={modelRevisions}
            onCancel={closeDialog}
            onSubmit={async value => {
              const success = await mutateAndReload(
                `/api/admin/ai-run-profiles/${dialog.profile.profileKey}/revisions`,
                value,
                'profile.saved',
                { actionLabel: t('profile.saveDraft') },
              )
              if (success) {
                setCandidateBlockers(current => ({
                  ...current,
                  [dialog.profile.profileKey]: [],
                }))
                closeDialog()
              }
            }}
            profile={dialog.profile}
          />
        ) : null}
      </FormModal>
    </div>
  )
}

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
import { useCallback, useEffect, useRef, useState } from 'react'
import AutoDismissStatusToast from '@/components/AutoDismissStatusToast'
import { useConfirmModal } from '@/components/ConfirmModal'
import FormModal from '@/components/FormModal'
import type { AiConnectionAction } from '@/lib/ai/admin-contracts'
import type {
  AiAdminAttestationRecord,
  AiAdminCatalogItem,
  AiAdminConnectionDetail,
  AiAdminModelRecord,
  AiAdminModelRevisionRecord,
  AiAdminRunProfileRecord,
} from '@/lib/ai/admin-service'
import type { AiRunProfileKey } from '@/lib/ai/profile-resolver'
import { devMarker } from '@/lib/developer-mode-markers'
import { apiFetch } from '@/lib/http/api-fetch'
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
      pending?: NonNullable<
        AiAdminConnectionDetail['pendingVerifications']
      >[number]
      model: AiAdminModelRecord | null
    }
  | { kind: 'profile'; profile: AiAdminRunProfileRecord }
  | null

type CatalogStatus = 'idle' | 'loaded' | 'loading' | 'unavailable'
type PendingModelAction = {
  kind: 'health'
  revisionId: string
}

const OPERATIONAL_HEALTH_VALUES = [
  'degraded',
  'healthy',
  'unavailable',
  'unknown',
] as const
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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
  key: AiAdminRunProfileRecord['administrativeStatus']
  tone: 'danger' | 'neutral' | 'success' | 'warning'
} {
  return {
    key: profile.administrativeStatus,
    tone:
      profile.administrativeStatus === 'active'
        ? 'success'
        : profile.administrativeStatus === 'blocked'
          ? 'danger'
          : profile.administrativeStatus === 'paused'
            ? 'warning'
            : 'neutral',
  }
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

function PendingModelVerifications({
  connection,
  disabled,
  onOpen,
  onUnavailable,
}: {
  connection: AiAdminConnectionDetail
  disabled: boolean
  onOpen(
    connection: AiAdminConnectionDetail,
    pending: NonNullable<
      AiAdminConnectionDetail['pendingVerifications']
    >[number],
  ): void
  onUnavailable(): void
}) {
  const t = useTranslations('admin.aiConnections')
  const [now, setNow] = useState(Date.now)
  const [opening, setOpening] = useState(false)
  const attempts = connection.pendingVerifications
  useEffect(() => {
    const deadlines = (attempts ?? [])
      .map(attempt => Date.parse(attempt.expiresAt))
      .filter(deadline => deadline > now)
    if (!deadlines.length) return
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.min(...deadlines) - now + 1,
    )
    return () => clearTimeout(timer)
  }, [attempts, now])

  async function open(attemptId: string): Promise<void> {
    setOpening(true)
    try {
      const response = await apiFetch(
        `/api/admin/ai-connections/${connection.id}`,
      )
      if (!response.ok) throw new Error('pending_unavailable')
      const current: AiAdminConnectionDetail = await response.json()
      const pending = current.pendingVerifications?.find(
        attempt =>
          attempt.id === attemptId &&
          Date.parse(attempt.expiresAt) > Date.now(),
      )
      if (!pending) {
        onUnavailable()
        return
      }
      onOpen(current, pending)
    } catch {
      onUnavailable()
    } finally {
      setOpening(false)
    }
  }

  return (
    <section
      className="mt-4 space-y-2"
      {...devMarker({
        name: 'Pending AI model verifications',
        context: 'AI connection models',
      })}
    >
      <h6 className="font-semibold">{t('pending.title')}</h6>
      <p className="text-sm text-secondary-600 dark:text-secondary-300">
        {t('pending.description')}
      </p>
      {(attempts ?? [])
        .filter(attempt => Date.parse(attempt.expiresAt) > now)
        .map(attempt => (
          <button
            className="btn-secondary min-h-9 w-full px-3! py-2! text-left text-sm"
            disabled={disabled || opening}
            key={attempt.id}
            onClick={() => void open(attempt.id)}
            title={disabled || opening ? t('pending.busy') : undefined}
            type="button"
            {...devMarker({
              name: 'Open pending AI verification',
              context: 'AI connection models',
            })}
          >
            {opening
              ? t('pending.opening')
              : t('pending.open', {
                  name:
                    attempt.result.candidate.name ||
                    attempt.result.candidate.externalModelId,
                })}
          </button>
        ))}
    </section>
  )
}

export default function AiConnectionsPanel() {
  const t = useTranslations('admin.aiConnections')
  const tc = useTranslations('common')
  const { confirm } = useConfirmModal()
  const {
    busy,
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
    setError,
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
  const modelCloseHandler = useRef<(() => void) | null>(null)
  const registerModelClose = useCallback((handler: (() => void) | null) => {
    modelCloseHandler.current = handler
  }, [])
  const dismissMessage = useCallback(() => setMessage(null), [setMessage])
  function resetDialog() {
    clearError()
    setDialog(null)
    setCandidateId(null)
    setSavedAttestation(null)
  }

  function closeDialog() {
    if (dialog?.kind === 'model' && modelCloseHandler.current) {
      modelCloseHandler.current()
      return
    }
    resetDialog()
  }

  function openDialog(nextDialog: Exclude<DialogState, null>) {
    clearError()
    setDialog(nextDialog)
  }

  const modelRevisions = Object.values(details).flatMap(connection =>
    connection.models.flatMap(model =>
      model.revisions.map(revision => ({ connection, model, revision })),
    ),
  )

  function profilesForConnection(connection: AiAdminConnectionDetail) {
    const revisionIds = new Set(
      connection.models.flatMap(model =>
        model.revisions.map(revision => revision.id),
      ),
    )
    return profiles.filter(
      profile =>
        profile.modelRevisionId !== null &&
        revisionIds.has(profile.modelRevisionId),
    )
  }

  async function pauseProfile(
    profile: AiAdminRunProfileRecord,
    anchorEl: HTMLElement,
  ): Promise<void> {
    const accepted = await confirm({
      anchorEl,
      cancelText: t('actions.cancel'),
      confirmText: t('directProfile.pause'),
      icon: 'warning',
      message: t('directProfile.pauseConfirm.message'),
      title: t('directProfile.pauseConfirm.title'),
    })
    if (!accepted) return
    await mutateAndReload(
      `/api/admin/ai-run-profiles/${profile.profileKey}/actions`,
      {
        action: 'set_operational_status',
        revisionToken: profile.revisionToken,
        status: 'suspended',
      },
      'profile.suspended',
      { actionLabel: t('directProfile.pause') },
    )
  }

  async function connectionAction(
    connection: AiAdminConnectionDetail,
    action: AiConnectionAction,
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
    let items: AiAdminCatalogItem[]
    try {
      items = (await response.json()) as AiAdminCatalogItem[]
    } catch {
      setError({
        kind: 'mutation',
        message: t('actionFailed', {
          action: t('actions.fetchCatalog'),
          error: t('mutationError'),
        }),
      })
      if (!notify) {
        setCatalogStatusByConnection(current => ({
          ...current,
          [connectionId]: 'unavailable',
        }))
      }
      return null
    }
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
    anchorEl?: HTMLElement,
  ) {
    const accepted = await confirm({
      anchorEl,
      confirmText: t('actions.retireConnection'),
      icon: 'caution',
      message: t('lifecycle.retireConfirmMessage'),
      title: t('lifecycle.retireConfirmTitle'),
      variant: 'danger',
    })
    if (!accepted) return
    await connectionAction(
      connection,
      {
        action: 'set_lifecycle',
        revisionToken: connection.revisionToken,
        status: 'retired',
      },
      'lifecycle.retiredMessage',
      { actionLabel: t('actions.retireConnection') },
    )
  }

  async function modelRevisionAction(
    connection: AiAdminConnectionDetail,
    model: AiAdminModelRecord,
    revision: AiAdminModelRevisionRecord,
    action: 'delete_model_revision' | 'end_model_revision',
    anchorEl: HTMLElement,
  ): Promise<void> {
    const deleting = action === 'delete_model_revision'
    const finalRevision = model.revisions.length === 1
    const accepted = await confirm({
      anchorEl,
      confirmText: deleting
        ? t('destructive.delete.confirm')
        : t('destructive.end.confirm'),
      dangerDescription: deleting
        ? `${t('destructive.delete.message', { number: revision.revisionNumber })}${finalRevision ? ` ${t('destructive.delete.finalModel')}` : ''}`
        : t('destructive.end.message'),
      defaultCancel: true,
      icon: 'caution',
      message: deleting
        ? t('destructive.delete.message', {
            number: revision.revisionNumber,
          })
        : t('destructive.end.message'),
      title: deleting
        ? t('destructive.delete.title')
        : t('destructive.end.title'),
      variant: 'danger',
    })
    if (!accepted) return
    await connectionAction(
      connection,
      {
        action,
        modelRevisionId: revision.id,
        revisionToken: revision.revisionToken,
      },
      deleting ? 'messages.revisionDeleted' : 'messages.revisionEnded',
      {
        actionLabel: deleting
          ? t('destructive.delete.confirm')
          : t('destructive.end.confirm'),
      },
    )
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
          disabled={busy}
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
      {busy ? (
        <p className="sr-only" role="status">
          {tc('saving')}
        </p>
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
                          disabled={busy}
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
                          disabled={busy}
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
                          disabled={busy}
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
                            disabled={busy}
                            onClick={() => openModelForm(detail, null)}
                            type="button"
                          >
                            <Plus aria-hidden="true" className="h-4 w-4" />
                            {t('actions.addModel')}
                          </button>
                        </div>
                        <PendingModelVerifications
                          connection={detail}
                          disabled={busy}
                          onOpen={(connection, pending) =>
                            openDialog({
                              connection,
                              pending,
                              kind: 'model',
                              model: null,
                            })
                          }
                          onUnavailable={() => {
                            setMessage(t('pending.unavailable'))
                            void loadRegistry()
                          }}
                        />
                        <div className="mt-4 space-y-3">
                          {detail.models.length === 0 ? (
                            <p className="rounded-xl border border-dashed border-secondary-300 p-4 text-sm text-secondary-600 dark:border-secondary-700 dark:text-secondary-300">
                              {t('model.empty')}
                            </p>
                          ) : null}
                          {detail.models.map(model => {
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
                                    {model.description ? (
                                      <p className="mt-1 text-xs text-secondary-500 dark:text-secondary-400">
                                        {model.description}
                                      </p>
                                    ) : null}
                                  </div>
                                  <button
                                    className="btn-secondary px-3! py-1.5! text-xs"
                                    disabled={busy}
                                    onClick={() => openModelForm(detail, model)}
                                    type="button"
                                  >
                                    {t('actions.editModel')}
                                  </button>
                                </div>
                                <div className="mt-3 space-y-2">
                                  {[...model.revisions]
                                    .sort(
                                      (left, right) =>
                                        right.revisionNumber -
                                        left.revisionNumber,
                                    )
                                    .map(revision => {
                                      const usedByProfile = profiles.some(
                                        profile =>
                                          profile.modelRevisionId ===
                                          revision.id,
                                      )
                                      const probingHealth =
                                        pendingModelAction?.kind === 'health' &&
                                        pendingModelAction.revisionId ===
                                          revision.id
                                      return (
                                        <section
                                          className="rounded-xl border border-secondary-200 bg-white p-3 dark:border-secondary-700 dark:bg-secondary-900"
                                          key={revision.id}
                                        >
                                          <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div>
                                              <p className="text-xs font-semibold text-secondary-800 dark:text-secondary-100">
                                                {t('model.revision', {
                                                  number:
                                                    revision.revisionNumber,
                                                })}
                                              </p>
                                              <p className="mt-1 text-xs text-secondary-500 dark:text-secondary-400">
                                                {revision.externalModelId}
                                              </p>
                                              {revision.reasoning ? (
                                                <p
                                                  className="mt-1 text-xs text-secondary-600 dark:text-secondary-300"
                                                  {...devMarker({
                                                    context:
                                                      'AI connection model revision',
                                                    name: 'AI model saved reasoning',
                                                    priority: 310,
                                                  })}
                                                >
                                                  {t(
                                                    'fields.reasoningEffort.label',
                                                  )}
                                                  :{' '}
                                                  {revision.reasoning.mode ===
                                                  'model_default'
                                                    ? t(
                                                        'reasoning.modelDefault',
                                                      )
                                                    : t(
                                                        `reasoning.${revision.reasoning.effort}`,
                                                      )}
                                                </p>
                                              ) : null}
                                            </div>
                                            <StatusBadge
                                              tone={revisionTone(
                                                revision.status,
                                              )}
                                            >
                                              {t(
                                                `model.status.${revision.status}`,
                                              )}
                                            </StatusBadge>
                                          </div>
                                          <div
                                            className="mt-3 flex flex-wrap gap-2"
                                            {...devMarker({
                                              context:
                                                'AI connection model revision',
                                              name: 'AI model lifecycle and health actions',
                                              priority: 310,
                                            })}
                                          >
                                            {revision.status === 'verified' ? (
                                              <button
                                                aria-busy={probingHealth}
                                                className="btn-secondary inline-flex items-center gap-1.5 px-3! py-1.5! text-xs disabled:cursor-not-allowed disabled:opacity-50"
                                                disabled={
                                                  busy ||
                                                  pendingModelAction !== null ||
                                                  !detail.adapterAvailability
                                                    .available
                                                }
                                                onClick={() =>
                                                  void probeModelHealth(
                                                    detail,
                                                    revision,
                                                  )
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
                                            ) : null}
                                            {revision.status !== 'ended' ? (
                                              <button
                                                className="btn-secondary px-3! py-1.5! text-xs"
                                                disabled={busy || usedByProfile}
                                                onClick={event =>
                                                  void modelRevisionAction(
                                                    detail,
                                                    model,
                                                    revision,
                                                    'end_model_revision',
                                                    event.currentTarget,
                                                  )
                                                }
                                                title={
                                                  usedByProfile
                                                    ? t(
                                                        'model.usedByProfileHelp',
                                                      )
                                                    : undefined
                                                }
                                                type="button"
                                              >
                                                {t('destructive.end.confirm')}
                                              </button>
                                            ) : (
                                              <button
                                                aria-label={t(
                                                  'destructive.delete.confirm',
                                                )}
                                                className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-red-300 bg-red-50 px-3! py-1.5! text-xs font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/70"
                                                disabled={busy || usedByProfile}
                                                onClick={event =>
                                                  void modelRevisionAction(
                                                    detail,
                                                    model,
                                                    revision,
                                                    'delete_model_revision',
                                                    event.currentTarget,
                                                  )
                                                }
                                                type="button"
                                              >
                                                <Trash2
                                                  aria-hidden="true"
                                                  className="h-3.5 w-3.5"
                                                />
                                                {t(
                                                  'destructive.delete.confirm',
                                                )}
                                              </button>
                                            )}
                                          </div>
                                        </section>
                                      )
                                    })}
                                </div>
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
                                <span
                                  {...devMarker({
                                    context: 'AI run profile impact',
                                    name: 'Derived AI run profile status',
                                    priority: 315,
                                  })}
                                >
                                  <StatusBadge tone={status.tone}>
                                    {t(`directProfile.status.${status.key}`)}
                                  </StatusBadge>
                                </span>
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
            const target = profile.modelRevisionId
              ? modelRevisions.find(
                  ({ revision }) => revision.id === profile.modelRevisionId,
                )
              : undefined
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
                    <p className="mt-1 text-xs text-secondary-500 dark:text-secondary-400">
                      {target
                        ? `${target.connection.administrationName} · ${target.model.name} · ${t('model.revision', { number: target.revision.revisionNumber })}`
                        : t('directProfile.noModel')}
                    </p>
                  </div>
                  <span
                    {...devMarker({
                      context: 'AI run profile card',
                      name: 'Derived AI run profile status',
                      priority: 320,
                    })}
                  >
                    <StatusBadge tone={status.tone}>
                      {t(`directProfile.status.${status.key}`)}
                    </StatusBadge>
                  </span>
                </div>
                {profile.administrativeStatus !== 'active' ? (
                  <p className="mt-3 text-xs text-secondary-600 dark:text-secondary-300">
                    {t(
                      `directProfile.statusHelp.${profile.administrativeStatus}`,
                    )}
                  </p>
                ) : null}
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
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    className="btn-secondary px-3! py-1.5! text-xs"
                    disabled={busy}
                    onClick={() => openDialog({ kind: 'profile', profile })}
                    type="button"
                  >
                    {t('directProfile.edit')}
                  </button>
                  {profile.administrativeStatus !== 'unconfigured' ? (
                    <button
                      className="btn-secondary px-3! py-1.5! text-xs"
                      disabled={busy}
                      onClick={event =>
                        profile.administrativeStatus === 'paused'
                          ? void mutateAndReload(
                              `/api/admin/ai-run-profiles/${profile.profileKey}/actions`,
                              {
                                action: 'set_operational_status',
                                revisionToken: profile.revisionToken,
                                status: 'enabled',
                              },
                              'profile.recovered',
                              { actionLabel: t('directProfile.resume') },
                            )
                          : void pauseProfile(profile, event.currentTarget)
                      }
                      type="button"
                    >
                      {profile.administrativeStatus === 'paused'
                        ? t('directProfile.resume')
                        : t('directProfile.pause')}
                    </button>
                  ) : null}
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
        maxWidthClassName="max-w-7xl"
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
            connection={dialog.connection}
            model={dialog.model}
            onCancel={() => {
              resetDialog()
              void loadRegistry()
            }}
            onComplete={async () => {
              resetDialog()
              await loadRegistry()
              setMessage(t('model.saved'))
            }}
            onRefreshCatalog={() => fetchCatalog(dialog.connection, false)}
            onRegisterClose={registerModelClose}
            pending={dialog.pending}
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
            connections={Object.values(details)}
            onCancel={closeDialog}
            onComplete={async () => {
              closeDialog()
              await loadRegistry()
              setMessage(t('profile.saved'))
            }}
            profile={dialog.profile}
          />
        ) : null}
      </FormModal>
    </div>
  )
}

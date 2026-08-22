'use client'

import { Activity, Pencil, Plus, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useRef, useState } from 'react'
import AutoDismissStatusToast from '@/components/AutoDismissStatusToast'
import { useConfirmModal } from '@/components/ConfirmModal'
import FormModal from '@/components/FormModal'
import type {
  CreateAiConnection,
  SaveAiAttestation,
} from '@/lib/ai/admin-contracts'
import type {
  AiAdminAttestationRecord,
  AiAdminCatalogItem,
  AiAdminConnectionDetail,
  AiAdminModelRecord,
  AiAdminModelRevisionRecord,
  AiAdminRunProfileRecord,
} from '@/lib/ai/admin-service'
import { devMarker } from '@/lib/developer-mode-markers'
import { AttestationForm, ConnectionForm, SecretForm } from './connection-forms'
import { ModelForm, ProfileForm } from './model-profile-forms'
import {
  attestationBlockerState,
  BlockerText,
  healthTone,
  lifecycleTone,
  revisionTone,
  StatusBadge,
} from './registry-sections'
import { useRegistryRequestState } from './use-registry-request-state'

type Dialog =
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

export default function AiConnectionsRegistry() {
  const t = useTranslations('admin.aiConnections')
  const tc = useTranslations('common')
  const { confirm } = useConfirmModal()
  const state = useRegistryRequestState()
  const [dialog, setDialog] = useState<Dialog>(null)
  const [secretCandidateId, setSecretCandidateId] = useState<string | null>(
    null,
  )
  const [attestationDraft, setAttestationDraft] =
    useState<AiAdminAttestationRecord | null>(null)
  const [catalogs, setCatalogs] = useState<
    Readonly<Record<string, readonly AiAdminCatalogItem[]>>
  >({})
  const modelCloseHandler = useRef<(() => void) | null>(null)
  const registerModelClose = useCallback((handler: (() => void) | null) => {
    modelCloseHandler.current = handler
  }, [])

  function closeDialog(): void {
    if (dialog?.kind === 'model' && modelCloseHandler.current) {
      modelCloseHandler.current()
      return
    }
    setDialog(null)
  }

  async function done(): Promise<void> {
    setDialog(null)
    setSecretCandidateId(null)
    setAttestationDraft(null)
    await state.loadRegistry()
  }

  async function saveConnection(value: CreateAiConnection): Promise<void> {
    if (dialog?.kind !== 'connection') return
    const response = await state.mutation(
      dialog.connection
        ? `/api/admin/ai-connections/${dialog.connection.id}`
        : '/api/admin/ai-connections',
      dialog.connection
        ? { ...value, revisionToken: dialog.connection.revisionToken }
        : value,
      { actionLabel: t('actions.saveConnection') },
      dialog.connection ? 'PATCH' : 'POST',
    )
    if (response) await done()
  }

  async function modelAction(
    connection: AiAdminConnectionDetail,
    revision: AiAdminModelRevisionRecord,
    action: 'delete_model_revision' | 'end_model_revision',
    anchorEl: HTMLElement,
  ): Promise<void> {
    const deleting = action === 'delete_model_revision'
    const model = connection.models.find(candidate =>
      candidate.revisions.some(item => item.id === revision.id),
    )
    const finalRevision = model?.revisions.length === 1
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
        ? t('destructive.delete.message', { number: revision.revisionNumber })
        : t('destructive.end.message'),
      title: deleting
        ? t('destructive.delete.title')
        : t('destructive.end.title'),
      variant: 'danger',
    })
    if (!accepted) return
    await state.mutateAndReload(
      `/api/admin/ai-connections/${connection.id}/actions`,
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

  async function connectionLifecycle(
    connection: AiAdminConnectionDetail,
    status: 'active' | 'retired' | 'suspended',
  ): Promise<void> {
    await state.mutateAndReload(
      `/api/admin/ai-connections/${connection.id}/actions`,
      {
        action: 'set_lifecycle',
        revisionToken: connection.revisionToken,
        status,
      },
      status === 'active'
        ? 'lifecycle.activatedMessage'
        : status === 'suspended'
          ? 'lifecycle.suspendedMessage'
          : 'lifecycle.retiredMessage',
      {
        actionLabel: t(
          status === 'active'
            ? 'actions.activateConnection'
            : status === 'suspended'
              ? 'actions.suspendConnection'
              : 'actions.retireConnection',
        ),
      },
    )
  }

  async function fetchCatalog(connection: AiAdminConnectionDetail) {
    const response = await state.mutation(
      `/api/admin/ai-connections/${connection.id}/actions`,
      { action: 'fetch_catalog' },
      { actionLabel: t('actions.fetchCatalog') },
    )
    if (!response) return
    const items = (await response.json()) as AiAdminCatalogItem[]
    setCatalogs(current => ({
      ...current,
      [connection.id]: items,
    }))
  }

  if (state.loading) {
    return <p aria-live="polite">{t('loading')}</p>
  }
  if (state.error?.kind === 'load') {
    return (
      <div role="alert">
        <p>{state.error.message}</p>
        <button
          className="mt-2 underline"
          onClick={() => void state.loadRegistry()}
          type="button"
        >
          {t('actions.retry')}
        </button>
      </div>
    )
  }

  const connectionDetails = Object.values(state.details)

  return (
    <div
      aria-busy={state.busy}
      className="space-y-8"
      {...devMarker({
        name: 'ai-connections-registry',
        priority: 300,
        value: 'stable-profiles',
      })}
    >
      {state.busy ? (
        <p aria-live="polite" className="text-sm" role="status">
          {tc('saving')}
        </p>
      ) : null}
      {state.message ? (
        <AutoDismissStatusToast
          message={state.message}
          onDismiss={() => state.setMessage(null)}
          tone={state.messageTone}
        />
      ) : null}
      {state.error?.kind === 'mutation' ? (
        <div className="fixed inset-x-4 bottom-4 z-80 ml-auto max-w-xl sm:left-auto sm:right-4">
          <div
            className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-950 shadow-lg dark:border-red-900 dark:bg-red-950 dark:text-red-100"
            role="alert"
          >
            <p className="min-w-0 flex-1">{state.error.message}</p>
            <button
              aria-label={tc('close')}
              className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-lg font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
              onClick={state.clearError}
              type="button"
            >
              ×
            </button>
          </div>
        </div>
      ) : null}

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">{t('connections.title')}</h2>
          <button
            className="inline-flex items-center gap-2 rounded bg-primary-700 px-4 py-2 text-sm font-semibold text-white"
            disabled={state.busy}
            onClick={() => setDialog({ connection: null, kind: 'connection' })}
            type="button"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            {t('actions.addConnection')}
          </button>
        </div>
        <div className="space-y-4">
          {connectionDetails.map(connection => (
            <article
              className="rounded-2xl border border-secondary-200 p-5 dark:border-secondary-700"
              key={connection.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">
                    {connection.administrationName}
                  </h3>
                  <p className="text-sm text-secondary-600 dark:text-secondary-300">
                    {connection.publicName}
                  </p>
                </div>
                <div className="flex gap-2">
                  <StatusBadge tone={lifecycleTone(connection.lifecycleStatus)}>
                    {t(`lifecycle.${connection.lifecycleStatus}`)}
                  </StatusBadge>
                  <StatusBadge tone={healthTone(connection.operationalHealth)}>
                    {t(`health.${connection.operationalHealth}`)}
                  </StatusBadge>
                </div>
              </div>
              {connection.blockers.length > 0 ? (
                <section aria-label={t('blockers.title')} className="mt-4">
                  <h4 className="font-medium">{t('blockers.title')}</h4>
                  <ul className="mt-1 list-disc pl-5 text-sm">
                    {connection.blockers.map(blocker => (
                      <li key={`${blocker.code}-${blocker.field ?? 'none'}`}>
                        <BlockerText
                          attestationState={attestationBlockerState(connection)}
                          blocker={blocker}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  className="rounded border px-3 py-2 text-sm"
                  disabled={state.busy}
                  onClick={() => setDialog({ connection, kind: 'connection' })}
                  type="button"
                >
                  {t('actions.editConnection')}
                </button>
                <button
                  className="rounded border px-3 py-2 text-sm"
                  disabled={state.busy}
                  onClick={() => setDialog({ connection, kind: 'secret' })}
                  type="button"
                >
                  {t('actions.manageSecret')}
                </button>
                <button
                  className="rounded border px-3 py-2 text-sm"
                  disabled={state.busy}
                  onClick={() => setDialog({ connection, kind: 'attestation' })}
                  type="button"
                >
                  {t('actions.manageAttestation')}
                </button>
                <button
                  className="rounded border px-3 py-2 text-sm"
                  disabled={state.busy}
                  onClick={() =>
                    setDialog({ connection, kind: 'model', model: null })
                  }
                  type="button"
                >
                  {t('actions.addModel')}
                </button>
                <button
                  className="rounded border px-3 py-2 text-sm"
                  disabled={
                    state.busy || !connection.adapterAvailability.available
                  }
                  onClick={() => void fetchCatalog(connection)}
                  type="button"
                >
                  {t('actions.fetchCatalog')}
                </button>
                {connection.lifecycleStatus !== 'retired' ? (
                  <button
                    className="rounded border px-3 py-2 text-sm"
                    disabled={state.busy}
                    onClick={() =>
                      void connectionLifecycle(
                        connection,
                        connection.lifecycleStatus === 'active'
                          ? 'suspended'
                          : 'active',
                      )
                    }
                    type="button"
                  >
                    {connection.lifecycleStatus === 'active'
                      ? t('actions.suspendConnection')
                      : t('actions.activateConnection')}
                  </button>
                ) : null}
              </div>
              {catalogs[connection.id] ? (
                <section
                  aria-label={t('actions.fetchCatalog')}
                  className="mt-4"
                >
                  <h4 className="font-medium">{t('actions.fetchCatalog')}</h4>
                  <p className="text-sm">{t('catalog.selectionHelp')}</p>
                  <ul className="mt-1 list-disc pl-5 text-sm">
                    {catalogs[connection.id].map(item => (
                      <li
                        key={`${item.externalModelId}:${item.externalModelVersion ?? ''}`}
                      >
                        {item.name} · {item.externalModelId}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              <div className="mt-5 space-y-3">
                {connection.models.map(model => (
                  <section
                    className="rounded-xl bg-secondary-50 p-4 dark:bg-secondary-800/60"
                    key={model.id}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="font-medium">{model.name}</h4>
                      <button
                        aria-label={t('actions.editModel')}
                        className="rounded p-2"
                        disabled={state.busy}
                        onClick={() =>
                          setDialog({ connection, kind: 'model', model })
                        }
                        type="button"
                      >
                        <Pencil aria-hidden="true" className="h-4 w-4" />
                      </button>
                    </div>
                    <ul className="mt-2 space-y-2">
                      {model.revisions.map(revision => (
                        <li
                          className="flex flex-wrap items-center justify-between gap-2 rounded border border-secondary-200 bg-white p-3 dark:border-secondary-700 dark:bg-secondary-900"
                          key={revision.id}
                        >
                          <span>
                            {t('model.revision', {
                              number: revision.revisionNumber,
                            })}{' '}
                            · {revision.externalModelId}
                          </span>
                          <span className="flex items-center gap-2">
                            <StatusBadge tone={revisionTone(revision.status)}>
                              {t(`model.status.${revision.status}`)}
                            </StatusBadge>
                            {revision.status === 'verified' ? (
                              <button
                                aria-label={t('actions.probeHealth')}
                                className="rounded p-2"
                                disabled={state.busy}
                                onClick={() =>
                                  void state.mutateAndReload(
                                    `/api/admin/ai-connections/${connection.id}/actions`,
                                    {
                                      action: 'probe_health',
                                      modelRevisionId: revision.id,
                                      revisionToken: revision.revisionToken,
                                    },
                                    'health.probeResult.healthy',
                                    { actionLabel: t('actions.probeHealth') },
                                  )
                                }
                                type="button"
                              >
                                <Activity
                                  aria-hidden="true"
                                  className="h-4 w-4"
                                />
                              </button>
                            ) : null}
                            {revision.status !== 'ended' ? (
                              <button
                                className="rounded border px-2 py-1 text-sm"
                                disabled={state.busy}
                                onClick={event =>
                                  void modelAction(
                                    connection,
                                    revision,
                                    'end_model_revision',
                                    event.currentTarget,
                                  )
                                }
                                type="button"
                              >
                                {t('destructive.end.confirm')}
                              </button>
                            ) : (
                              <button
                                aria-label={t('destructive.delete.confirm')}
                                className="rounded p-2 text-red-700 dark:text-red-300"
                                disabled={state.busy}
                                onClick={event =>
                                  void modelAction(
                                    connection,
                                    revision,
                                    'delete_model_revision',
                                    event.currentTarget,
                                  )
                                }
                                type="button"
                              >
                                <Trash2
                                  aria-hidden="true"
                                  className="h-4 w-4"
                                />
                              </button>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{t('profile.title')}</h2>
        <div className="grid gap-4 lg:grid-cols-3">
          {state.profiles.map(profile => (
            <article
              className="rounded-2xl border border-secondary-200 p-5 dark:border-secondary-700"
              key={profile.id}
            >
              <h3 className="font-semibold">
                {t(`profiles.${profile.profileKey}`)}
              </h3>
              <div className="mt-2 flex flex-wrap gap-2">
                <StatusBadge
                  tone={
                    profile.configurationStatus === 'configured'
                      ? 'success'
                      : profile.configurationStatus === 'blocked'
                        ? 'danger'
                        : 'warning'
                  }
                >
                  {t(
                    `directProfile.configurationStatus.${profile.configurationStatus}`,
                  )}
                </StatusBadge>
                <StatusBadge
                  tone={
                    profile.operationalStatus === 'enabled'
                      ? 'success'
                      : 'danger'
                  }
                >
                  {t(
                    `directProfile.operationalStatus.${profile.operationalStatus}`,
                  )}
                </StatusBadge>
              </div>
              <p className="mt-3 text-sm">
                {profile.modelRevisionId
                  ? t('directProfile.modelSelected')
                  : t('directProfile.noModel')}
              </p>
              {profile.blockers.length > 0 ? (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
                  {profile.blockers.map(blocker => (
                    <li key={`${blocker.code}-${blocker.field ?? 'none'}`}>
                      <BlockerText blocker={blocker} />
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  className="rounded border px-3 py-2 text-sm"
                  disabled={state.busy}
                  onClick={() => setDialog({ kind: 'profile', profile })}
                  type="button"
                >
                  {t('directProfile.edit')}
                </button>
                <button
                  className="rounded border px-3 py-2 text-sm"
                  disabled={state.busy}
                  onClick={() =>
                    void state.mutateAndReload(
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
                        actionLabel:
                          profile.operationalStatus === 'enabled'
                            ? t('directProfile.pause')
                            : t('directProfile.resume'),
                      },
                    )
                  }
                  type="button"
                >
                  {profile.operationalStatus === 'enabled'
                    ? t('directProfile.pause')
                    : t('directProfile.resume')}
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <FormModal
        closeDisabled={state.busy}
        developerModeValue={dialog?.kind ?? 'ai-admin'}
        onClose={closeDialog}
        open={dialog !== null}
        title={
          dialog?.kind === 'profile'
            ? t('directProfile.edit')
            : dialog?.kind === 'model'
              ? t(dialog.model ? 'dialogs.editModel' : 'dialogs.createModel')
              : dialog?.kind === 'secret'
                ? t('dialogs.secret')
                : dialog?.kind === 'attestation'
                  ? t('dialogs.attestation')
                  : dialog?.connection
                    ? t('dialogs.editConnection')
                    : t('dialogs.createConnection')
        }
        titleId="ai-admin-dialog-title"
      >
        {dialog?.kind === 'connection' ? (
          <ConnectionForm
            busy={state.busy}
            connection={dialog.connection}
            onCancel={() => setDialog(null)}
            onSubmit={saveConnection}
          />
        ) : null}
        {dialog?.kind === 'model' ? (
          <ModelForm
            connection={dialog.connection}
            model={dialog.model}
            onCancel={() => setDialog(null)}
            onComplete={done}
            onRegisterClose={registerModelClose}
          />
        ) : null}
        {dialog?.kind === 'profile' ? (
          <ProfileForm
            connections={connectionDetails}
            onCancel={() => setDialog(null)}
            onComplete={done}
            profile={dialog.profile}
          />
        ) : null}
        {dialog?.kind === 'secret' ? (
          <SecretForm
            busy={state.busy}
            candidateId={secretCandidateId}
            connection={dialog.connection}
            onActivate={async candidateId => {
              const response = await state.mutation(
                `/api/admin/ai-connections/${dialog.connection.id}/actions`,
                {
                  action: 'activate_secret',
                  connectionConfigurationVersion:
                    dialog.connection.configurationVersion,
                  connectionRevisionToken: dialog.connection.revisionToken,
                  secretVersionId: candidateId,
                },
                { actionLabel: t('actions.activateSecret') },
              )
              if (response) await done()
            }}
            onCancel={() => setDialog(null)}
            onConfirmRevocation={(secretVersionId, anchorEl) => {
              void (async () => {
                if (
                  !(await confirm({
                    anchorEl,
                    defaultCancel: true,
                    icon: 'caution',
                    message: t('secret.revocationConfirmMessage'),
                    title: t('secret.revocationConfirmTitle'),
                    variant: 'danger',
                  }))
                )
                  return
                const response = await state.mutation(
                  `/api/admin/ai-connections/${dialog.connection.id}/actions`,
                  { action: 'confirm_secret_revocation', secretVersionId },
                  { actionLabel: t('actions.revokeSecret') },
                )
                if (response) await done()
              })()
            }}
            onDelete={async candidateId => {
              const response = await state.mutation(
                `/api/admin/ai-connections/${dialog.connection.id}/actions`,
                {
                  action: 'delete_secret_candidate',
                  secretVersionId: candidateId,
                },
                { actionLabel: t('actions.delete') },
              )
              if (response) setSecretCandidateId(null)
            }}
            onWrite={async secret => {
              const response = await state.mutation(
                `/api/admin/ai-connections/${dialog.connection.id}/actions`,
                { action: 'write_secret', secret },
                { actionLabel: t('actions.saveSecret') },
              )
              if (response) {
                const body = (await response.json()) as {
                  id?: string
                  secretVersionId?: string
                }
                setSecretCandidateId(body.secretVersionId ?? body.id ?? null)
              }
            }}
          />
        ) : null}
        {dialog?.kind === 'attestation' ? (
          <AttestationForm
            busy={state.busy}
            connection={dialog.connection}
            onAttest={async (attestation, currentAttestationRevisionToken) => {
              const response = await state.mutation(
                `/api/admin/ai-connections/${dialog.connection.id}/actions`,
                {
                  action: 'attest',
                  attestation,
                  currentAttestationRevisionToken,
                },
                { actionLabel: t('actions.attest') },
              )
              if (response) await done()
            }}
            onCancel={() => setDialog(null)}
            onDiscard={async (draft, currentAttestationRevisionToken) => {
              const response = await state.mutation(
                `/api/admin/ai-connections/${dialog.connection.id}/actions`,
                {
                  action: 'discard_attestation_draft',
                  currentAttestationRevisionToken,
                  draftAttestationId: draft.id,
                  draftAttestationRevisionToken: draft.revisionToken,
                },
                { actionLabel: t('actions.delete') },
              )
              if (response) setAttestationDraft(null)
            }}
            onSave={async (attestation: SaveAiAttestation) => {
              const response = await state.mutation(
                `/api/admin/ai-connections/${dialog.connection.id}/actions`,
                { action: 'save_attestation', attestation },
                { actionLabel: t('actions.save') },
              )
              if (response)
                setAttestationDraft(
                  (await response.json()) as AiAdminAttestationRecord,
                )
            }}
            savedDraft={attestationDraft}
          />
        ) : null}
      </FormModal>
    </div>
  )
}

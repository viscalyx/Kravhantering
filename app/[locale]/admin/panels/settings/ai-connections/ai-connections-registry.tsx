'use client'

import {
  Activity,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  KeyRound,
  Link2,
  Plus,
  RefreshCw,
  Route,
  ShieldCheck,
  TriangleAlert,
  Wrench,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { useConfirmModal } from '@/components/ConfirmModal'
import FormModal from '@/components/FormModal'
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
import { AttestationForm, ConnectionForm, SecretForm } from './connection-forms'
import { ModelForm, ProfileForm } from './model-profile-forms'
import {
  AnimatedRegistrySection,
  BlockerText,
  healthTone,
  lifecycleTone,
  revisionTone,
  StatusBadge,
} from './registry-sections'
import { useRegistryRequestState } from './use-registry-request-state'

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

function profileName(
  t: ReturnType<typeof useTranslations>,
  key: AiRunProfileKey,
): string {
  return t(`profiles.${key}`)
}

export default function AiConnectionsPanel() {
  const t = useTranslations('admin.aiConnections')
  const tc = useTranslations('common')
  const { confirm } = useConfirmModal()
  const {
    busy,
    candidateBlockers,
    connections,
    details,
    error,
    loading,
    loadRegistry,
    message,
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
  const [catalogByConnection, setCatalogByConnection] = useState<
    Readonly<Record<string, readonly AiAdminCatalogItem[]>>
  >({})
  function closeDialog() {
    setDialog(null)
    setCandidateId(null)
    setSavedAttestation(null)
  }

  const modelRevisions = Object.values(details).flatMap(connection =>
    connection.models.flatMap(model =>
      model.revisions
        .filter(revision => revision.status !== 'retired')
        .map(revision => ({ connection, model, revision })),
    ),
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

  async function connectionAction(
    connection: AiAdminConnectionDetail,
    action: Record<string, unknown>,
    successKey: string,
  ) {
    await mutateAndReload(
      `/api/admin/ai-connections/${connection.id}/actions`,
      action,
      successKey,
    )
  }

  async function fetchCatalog(connection: AiAdminConnectionDetail) {
    const response = await mutation(
      `/api/admin/ai-connections/${connection.id}/actions`,
      { action: 'fetch_catalog' },
    )
    if (!response) return
    const connectionId = connection.id.toLowerCase()
    const items = (await response.json()) as AiAdminCatalogItem[]
    setCatalogByConnection(current => ({
      ...current,
      [connectionId]: items,
    }))
    setMessage(t('catalog.loaded'))
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
    )
  }

  async function activateProfile(profile: AiAdminRunProfileRecord) {
    const draft = profile.draftRevision
    if (!draft?.modelRevisionId) return
    const target = modelRevisions.find(
      ({ revision }) => revision.id === draft.modelRevisionId,
    )
    if (!target?.connection.adapterAvailability.available) return
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
          onClick={() => setDialog({ connection: null, kind: 'connection' })}
          type="button"
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
          {t('actions.addConnection')}
        </button>
      </div>

      {message ? (
        <p
          className="mx-5 mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"
          role="status"
        >
          {message}
        </p>
      ) : null}
      {error ? (
        <div
          className="mx-5 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100"
          role="alert"
        >
          <span>{error}</span>
          <button
            className="btn-secondary px-3! py-1.5! text-xs"
            disabled={loading}
            onClick={() => void loadRegistry()}
            type="button"
          >
            {tc('retry')}
          </button>
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
          const catalog = catalogByConnection[connection.id.toLowerCase()] ?? []
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
                            setDialog({
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
                            setDialog({ connection: detail, kind: 'secret' })
                          }
                          type="button"
                        >
                          <KeyRound aria-hidden="true" className="h-4 w-4" />
                          {t('actions.manageSecret')}
                        </button>
                        <button
                          className="btn-secondary inline-flex min-h-10 items-center gap-2 px-4! py-2! text-sm"
                          onClick={() =>
                            setDialog({
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
                              <BlockerText blocker={blocker} />
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
                            onClick={() =>
                              setDialog({
                                connection: detail,
                                kind: 'model',
                                model: null,
                              })
                            }
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
                            const latest = model.revisions.at(-1)
                            if (!latest) return null
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
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <button
                                    className="btn-secondary px-3! py-1.5! text-xs"
                                    disabled={latest.status === 'retired'}
                                    onClick={() =>
                                      setDialog({
                                        connection: detail,
                                        kind: 'model',
                                        model,
                                      })
                                    }
                                    type="button"
                                  >
                                    {t('actions.editModel')}
                                  </button>
                                  <button
                                    className="btn-secondary px-3! py-1.5! text-xs"
                                    disabled={
                                      busy ||
                                      !detail.adapterAvailability.available ||
                                      detail.connectionEvidenceId === null ||
                                      latest.status === 'retired'
                                    }
                                    onClick={() =>
                                      void connectionAction(
                                        detail,
                                        {
                                          action: 'verify_model_revision',
                                          modelRevisionId: latest.id,
                                          revisionToken: latest.revisionToken,
                                        },
                                        'model.verified',
                                      )
                                    }
                                    title={
                                      !detail.adapterAvailability.available
                                        ? t('adapter.unavailableAction')
                                        : detail.connectionEvidenceId === null
                                          ? t('model.verifyConnectionFirst')
                                          : t('model.testCost')
                                    }
                                    type="button"
                                  >
                                    {t('actions.verifyModel')}
                                  </button>
                                  <button
                                    className="btn-secondary px-3! py-1.5! text-xs"
                                    disabled={
                                      busy ||
                                      !detail.adapterAvailability.available ||
                                      latest.status !== 'verified'
                                    }
                                    onClick={() =>
                                      void connectionAction(
                                        detail,
                                        {
                                          action: 'probe_health',
                                          modelRevisionId: latest.id,
                                          revisionToken: latest.revisionToken,
                                        },
                                        'health.probed',
                                      )
                                    }
                                    title={
                                      detail.adapterAvailability.available
                                        ? t('health.safeRecoveryHelp')
                                        : t('adapter.unavailableAction')
                                    }
                                    type="button"
                                  >
                                    {t('actions.probeHealth')}
                                  </button>
                                  <button
                                    className="btn-secondary px-3! py-1.5! text-xs"
                                    disabled={
                                      busy || latest.status === 'retired'
                                    }
                                    onClick={event =>
                                      void confirmRetirement(
                                        detail,
                                        latest,
                                        event.currentTarget,
                                      )
                                    }
                                    type="button"
                                  >
                                    {t('actions.retireModel')}
                                  </button>
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
                          profilesForConnection(detail).map(profile => (
                            <div
                              className="flex items-center justify-between gap-3 rounded-xl bg-secondary-50 p-3 dark:bg-secondary-950/50"
                              key={profile.id}
                            >
                              <span className="text-sm text-secondary-700 dark:text-secondary-200">
                                {profileName(t, profile.profileKey)}
                              </span>
                              <StatusBadge
                                tone={
                                  profile.blockers.length > 0 ||
                                  profile.operationalStatus === 'suspended'
                                    ? 'danger'
                                    : 'success'
                                }
                              >
                                {profile.blockers.length > 0
                                  ? t('profile.blocked')
                                  : t(
                                      `profile.operational.${profile.operationalStatus}`,
                                    )}
                              </StatusBadge>
                            </div>
                          ))
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
                            className="btn-secondary px-4! py-2! text-sm"
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
            const target = profile.draftRevision?.modelRevisionId
              ? modelRevisions.find(
                  ({ revision }) =>
                    revision.id === profile.draftRevision?.modelRevisionId,
                )
              : undefined
            const adapterUnavailable =
              target?.connection.adapterAvailability.available === false
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
                      {profile.activeRevisionId
                        ? t('profile.activeRevision')
                        : t('profile.noActiveRevision')}
                    </p>
                  </div>
                  <StatusBadge
                    tone={
                      profile.operationalStatus === 'enabled'
                        ? 'success'
                        : 'danger'
                    }
                  >
                    {t(`profile.operational.${profile.operationalStatus}`)}
                  </StatusBadge>
                </div>
                {profile.blockers.length > 0 ? (
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-amber-800 dark:text-amber-200">
                    {profile.blockers.map(blocker => (
                      <li key={`${blocker.code}-${blocker.field ?? ''}`}>
                        <BlockerText blocker={blocker} />
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
                          <BlockerText blocker={blocker} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    className="btn-secondary px-3! py-1.5! text-xs"
                    onClick={() => setDialog({ kind: 'profile', profile })}
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
                      adapterUnavailable
                    }
                    onClick={() => void activateProfile(profile)}
                    title={
                      adapterUnavailable
                        ? t('adapter.unavailableAction')
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
                    'PATCH',
                  )
                : await mutateAndReload(
                    '/api/admin/ai-connections',
                    value,
                    'connection.created',
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
            model={dialog.model}
            onCancel={closeDialog}
            onSubmit={async value => {
              const success = await mutateAndReload(
                `/api/admin/ai-connections/${dialog.connection.id}/actions`,
                { action: 'save_model_revision', modelRevision: value },
                'model.saved',
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
              )
              if (success) setCandidateId(null)
            }}
            onWrite={async (secret, form) => {
              const response = await mutation(
                `/api/admin/ai-connections/${dialog.connection.id}/actions`,
                { action: 'write_secret', secret },
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
        closeDisabled={busy}
        developerModeValue="AI attestation form"
        maxWidthClassName="max-w-4xl"
        onClose={closeDialog}
        open={dialog?.kind === 'attestation'}
        title={t('dialogs.attestation')}
        titleId="ai-attestation-dialog-title"
      >
        {dialog?.kind === 'attestation' ? (
          <AttestationForm
            busy={busy}
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
              )
              if (success) closeDialog()
            }}
            onCancel={closeDialog}
            onSave={async attestation => {
              const response = await mutation(
                `/api/admin/ai-connections/${dialog.connection.id}/actions`,
                { action: 'save_attestation', attestation },
              )
              if (!response) return
              const saved = (await response.json()) as AiAdminAttestationRecord
              setSavedAttestation(saved)
              setMessage(t('attestation.saved'))
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

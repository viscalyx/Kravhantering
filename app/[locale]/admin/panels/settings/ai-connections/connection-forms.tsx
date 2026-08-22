'use client'

import { CheckCircle2, CircleOff, KeyRound, TriangleAlert } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { type FormEvent, useState } from 'react'
import type {
  CreateAiConnection,
  SaveAiAttestation,
} from '@/lib/ai/admin-contracts'
import type {
  AiAdminAttestationRecord,
  AiAdminConnectionDetail,
} from '@/lib/ai/admin-service'
import { devMarker } from '@/lib/developer-mode-markers'
import { createDirtySnapshot } from '@/lib/forms/dirty-state'
import {
  DialogActions,
  Field,
  inputClassName,
  nullable,
  textareaClassName,
} from './form-controls'

function splitList(value: FormDataEntryValue | null): string[] | null {
  if (typeof value !== 'string') return null
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

function attestationPayload(
  attestation: AiAdminAttestationRecord,
): SaveAiAttestation {
  return {
    decisionReference: attestation.decisionReference,
    incidentResponseReference: attestation.incidentResponseReference,
    isPersonalDataProcessed: attestation.isPersonalDataProcessed,
    isTrainingAllowed: attestation.isTrainingAllowed,
    maximumInformationClass: attestation.maximumInformationClass,
    maximumRetentionDays: attestation.maximumRetentionDays,
    processingRegions: attestation.processingRegions,
    providerName: attestation.providerName,
    purpose: attestation.purpose,
    responsibleOrganizationUnitReference:
      attestation.responsibleOrganizationUnitReference,
    reviewDueAt: attestation.reviewDueAt,
    reviewedAt: attestation.reviewedAt,
    revisionToken: attestation.revisionToken,
    subprocessors: attestation.subprocessors,
  }
}

const ATTESTATION_DIRTY_OPTIONS = {
  unorderedArrayPaths: ['processingRegions', 'subprocessors'],
} as const

function attestationContent(attestation: SaveAiAttestation) {
  const { revisionToken: _revisionToken, ...content } = attestation
  return {
    ...content,
    incidentResponseReference:
      content.incidentResponseReference?.toLowerCase() ?? null,
    responsibleOrganizationUnitReference:
      content.responsibleOrganizationUnitReference?.toLowerCase() ?? null,
  }
}

interface ConnectionFormProps {
  busy: boolean
  connection: AiAdminConnectionDetail | null
  onCancel: () => void
  onSubmit: (value: CreateAiConnection) => Promise<void>
}

export function ConnectionForm({
  busy,
  connection,
  onCancel,
  onSubmit,
}: ConnectionFormProps) {
  const t = useTranslations('admin.aiConnections')
  const field = (name: string, property: 'help' | 'label') =>
    t(`fields.${name}.${property}`)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    await onSubmit({
      adapterKey: String(data.get('adapterKey')),
      adapterVersion: String(data.get('adapterVersion')),
      administrationName: String(data.get('administrationName')),
      agentRuntimeKey: nullable(data.get('agentRuntimeKey')),
      agentRuntimeVersion: nullable(data.get('agentRuntimeVersion')),
      authenticationType: String(
        data.get('authenticationType'),
      ) as CreateAiConnection['authenticationType'],
      dataPolicySummary: String(data.get('dataPolicySummary')),
      description: nullable(data.get('description')),
      egressPolicyKey: String(data.get('egressPolicyKey')),
      endpointUrl: String(data.get('endpointUrl')),
      maximumConcurrency: Number(data.get('maximumConcurrency')),
      publicName: String(data.get('publicName')),
      tlsPolicyKey: String(data.get('tlsPolicyKey')),
    })
  }
  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
      {[
        ['administrationName', connection?.administrationName ?? '', true],
        ['publicName', connection?.publicName ?? '', true],
        ['adapterKey', connection?.adapterKey ?? '', true],
        ['adapterVersion', connection?.adapterVersion ?? '', true],
        ['endpointUrl', connection?.endpointUrl ?? '', true],
        ['tlsPolicyKey', connection?.tlsPolicyKey ?? '', true],
        ['egressPolicyKey', connection?.egressPolicyKey ?? '', true],
        ['agentRuntimeKey', connection?.agentRuntimeKey ?? '', false],
        ['agentRuntimeVersion', connection?.agentRuntimeVersion ?? '', false],
      ].map(([name, value, required]) => {
        const id = `ai-connection-${name}`
        return (
          <Field
            help={field(String(name), 'help')}
            id={id}
            key={String(name)}
            label={field(String(name), 'label')}
            required={Boolean(required)}
          >
            <input
              className={inputClassName()}
              defaultValue={String(value)}
              id={id}
              name={String(name)}
              required={Boolean(required)}
            />
          </Field>
        )
      })}
      <Field
        help={field('authenticationType', 'help')}
        id="ai-connection-authenticationType"
        label={field('authenticationType', 'label')}
        required
      >
        <select
          className={inputClassName()}
          defaultValue={connection?.authenticationType ?? 'static_secret'}
          id="ai-connection-authenticationType"
          name="authenticationType"
        >
          {['static_secret', 'oauth2_client_credentials', 'mtls', 'none'].map(
            value => (
              <option key={value} value={value}>
                {t(`authentication.${value}`)}
              </option>
            ),
          )}
        </select>
      </Field>
      <Field
        help={field('maximumConcurrency', 'help')}
        id="ai-connection-maximumConcurrency"
        label={field('maximumConcurrency', 'label')}
        required
      >
        <input
          className={inputClassName()}
          defaultValue={connection?.maximumConcurrency ?? 1}
          id="ai-connection-maximumConcurrency"
          max={100}
          min={1}
          name="maximumConcurrency"
          required
          type="number"
        />
      </Field>
      <div className="sm:col-span-2">
        <Field
          help={field('description', 'help')}
          id="ai-connection-description"
          label={field('description', 'label')}
        >
          <textarea
            className={textareaClassName()}
            defaultValue={connection?.description ?? ''}
            id="ai-connection-description"
            name="description"
          />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field
          help={field('dataPolicySummary', 'help')}
          id="ai-connection-dataPolicySummary"
          label={field('dataPolicySummary', 'label')}
          required
        >
          <textarea
            className={textareaClassName()}
            defaultValue={connection?.dataPolicySummary ?? ''}
            id="ai-connection-dataPolicySummary"
            name="dataPolicySummary"
            required
          />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <DialogActions
          busy={busy}
          cancel={t('actions.cancel')}
          onCancel={onCancel}
          save={busy ? t('actions.saving') : t('actions.saveConnection')}
        />
      </div>
    </form>
  )
}

interface SecretFormProps {
  busy: boolean
  candidateId: string | null
  connection: AiAdminConnectionDetail
  onActivate: (candidateId: string) => Promise<void>
  onCancel: () => void
  onConfirmRevocation: (secretVersionId: string, anchorEl: HTMLElement) => void
  onDelete: (candidateId: string, anchorEl: HTMLElement) => Promise<void>
  onWrite: (secret: string, form: HTMLFormElement) => Promise<void>
}

export function SecretForm({
  busy,
  candidateId,
  connection,
  onActivate,
  onCancel,
  onConfirmRevocation,
  onDelete,
  onWrite,
}: SecretFormProps) {
  const t = useTranslations('admin.aiConnections')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    await onWrite(String(data.get('secret')), form)
  }
  return (
    <div>
      <div
        className="mb-4 flex gap-3 rounded-2xl border border-primary-200 bg-primary-50 p-4 text-sm text-primary-950 dark:border-primary-900 dark:bg-primary-950/40 dark:text-primary-100"
        role="status"
      >
        <KeyRound aria-hidden="true" className="h-5 w-5 shrink-0" />
        <p>{t('secret.writeOnly')}</p>
      </div>
      <p className="mb-4 text-sm text-secondary-600 dark:text-secondary-300">
        {connection.activeSecret.available
          ? t('secret.activeAvailable')
          : t(`secret.unavailable.${connection.activeSecret.reason}`)}
      </p>
      {connection.activeSecret.available ? (
        <button
          className="btn-secondary mb-4 px-4! py-2! text-sm"
          disabled={busy}
          onClick={event =>
            onConfirmRevocation(
              connection.activeSecret.available
                ? connection.activeSecret.secretVersionId
                : '',
              event.currentTarget,
            )
          }
          type="button"
        >
          {t('secret.confirmRevocation')}
        </button>
      ) : null}
      <form onSubmit={submit}>
        <Field
          help={t('fields.secret.help')}
          id="ai-provider-secret"
          label={t('fields.secret.label')}
          required
        >
          <input
            autoComplete="new-password"
            className={inputClassName()}
            id="ai-provider-secret"
            maxLength={16_384}
            name="secret"
            required
            type="password"
          />
        </Field>
        <DialogActions
          busy={busy}
          cancel={t('actions.cancel')}
          onCancel={onCancel}
          save={busy ? t('actions.saving') : t('secret.writeCandidate')}
        />
      </form>
      {candidateId ? (
        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">
            {t('secret.candidateReady')}
          </p>
          <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">
            {t('secret.activateCost')}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="btn-primary px-4! py-2! text-sm"
              disabled={busy}
              onClick={() => void onActivate(candidateId)}
              type="button"
            >
              {t('secret.activateCandidate')}
            </button>
            <button
              className="btn-secondary px-4! py-2! text-sm"
              disabled={busy}
              onClick={event => void onDelete(candidateId, event.currentTarget)}
              type="button"
            >
              {t('secret.deleteCandidate')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

interface AttestationFormProps {
  busy: boolean
  connection: AiAdminConnectionDetail
  onAttest: (
    value: SaveAiAttestation,
    currentValidRevisionToken: string | null,
  ) => Promise<void>
  onCancel: () => void
  onDiscard: (
    draft: AiAdminAttestationRecord,
    currentValidRevisionToken: string,
    anchorEl: HTMLElement,
  ) => Promise<void>
  onSave: (value: SaveAiAttestation) => Promise<void>
  savedDraft: AiAdminAttestationRecord | null
}

export function AttestationForm({
  busy,
  connection,
  onAttest,
  onCancel,
  onDiscard,
  onSave,
  savedDraft,
}: AttestationFormProps) {
  const t = useTranslations('admin.aiConnections')
  const existing = connection.attestation
  const validAttestation = existing?.status === 'valid' ? existing : null
  const storedDraft =
    connection.attestationDraft ??
    (existing?.status === 'draft' ? existing : null)
  const approvalDraft = savedDraft ?? storedDraft
  const currentValidToken = validAttestation?.revisionToken ?? null
  const [currentContentSnapshot, setCurrentContentSnapshot] = useState<
    string | null
  >(null)
  function valueFrom(form: HTMLFormElement): SaveAiAttestation {
    const data = new FormData(form)
    const numberValue = nullable(data.get('maximumRetentionDays'))
    return {
      decisionReference: nullable(data.get('decisionReference')),
      incidentResponseReference: nullable(
        data.get('incidentResponseReference'),
      ),
      isPersonalDataProcessed:
        nullable(data.get('isPersonalDataProcessed')) === null
          ? null
          : data.get('isPersonalDataProcessed') === 'true',
      isTrainingAllowed:
        nullable(data.get('isTrainingAllowed')) === null
          ? null
          : data.get('isTrainingAllowed') === 'true',
      maximumInformationClass: nullable(data.get('maximumInformationClass')),
      maximumRetentionDays: numberValue === null ? null : Number(numberValue),
      processingRegions: splitList(data.get('processingRegions')),
      providerName: nullable(data.get('providerName')),
      purpose: nullable(data.get('purpose')),
      responsibleOrganizationUnitReference: nullable(
        data.get('responsibleOrganizationUnitReference'),
      ),
      reviewDueAt: nullable(data.get('reviewDueAt')),
      reviewedAt: nullable(data.get('reviewedAt')),
      revisionToken: approvalDraft?.revisionToken ?? null,
      subprocessors: splitList(data.get('subprocessors')),
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await onSave(valueFrom(event.currentTarget))
  }
  const persistedAttestation = approvalDraft ?? existing
  const savedContentSnapshot = persistedAttestation
    ? createDirtySnapshot(
        attestationContent(attestationPayload(persistedAttestation)),
        ATTESTATION_DIRTY_OPTIONS,
      )
    : null
  const contentDirty =
    persistedAttestation !== null &&
    currentContentSnapshot !== null &&
    currentContentSnapshot !== savedContentSnapshot
  const saveDirty = persistedAttestation === null || contentDirty
  const banner = contentDirty
    ? {
        key: approvalDraft
          ? 'attestation.banner.unsavedChanges'
          : existing?.status === 'valid'
            ? 'attestation.banner.approvedChanged'
            : 'attestation.banner.unsavedChanges',
        tone: 'warning' as const,
      }
    : approvalDraft && existing?.status === 'valid'
      ? {
          key: 'attestation.banner.replacementDraft',
          tone: 'warning' as const,
        }
      : approvalDraft
        ? {
            key: 'attestation.banner.draft',
            tone: 'warning' as const,
          }
        : existing?.status === 'valid'
          ? {
              key: 'attestation.banner.valid',
              tone: 'success' as const,
            }
          : existing
            ? {
                key: `attestation.status.${existing.status}`,
                tone: 'danger' as const,
              }
            : {
                key: 'attestation.banner.missing',
                tone: 'warning' as const,
              }
  const BannerIcon =
    banner.tone === 'success'
      ? CheckCircle2
      : banner.tone === 'danger'
        ? CircleOff
        : TriangleAlert
  const bannerClass =
    banner.tone === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100'
      : banner.tone === 'danger'
        ? 'border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100'
        : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100'
  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onChange={event =>
        setCurrentContentSnapshot(
          createDirtySnapshot(
            attestationContent(valueFrom(event.currentTarget)),
            ATTESTATION_DIRTY_OPTIONS,
          ),
        )
      }
      onSubmit={submit}
    >
      <div
        aria-atomic="true"
        aria-live="polite"
        className={`flex items-start gap-2 rounded-xl border p-3 text-sm sm:col-span-2 ${bannerClass}`}
        role="status"
        {...devMarker({
          context: 'AI attestation form',
          name: 'AI attestation approval status',
          priority: 420,
        })}
      >
        <BannerIcon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
        <p>{t(banner.key)}</p>
      </div>
      {[
        [
          'responsibleOrganizationUnitReference',
          persistedAttestation?.responsibleOrganizationUnitReference ?? '',
          true,
          'text',
        ],
        [
          'providerName',
          persistedAttestation?.providerName ?? '',
          true,
          'text',
        ],
        [
          'maximumInformationClass',
          persistedAttestation?.maximumInformationClass ?? '',
          true,
          'text',
        ],
        [
          'maximumRetentionDays',
          persistedAttestation?.maximumRetentionDays ?? '',
          true,
          'number',
        ],
        [
          'processingRegions',
          persistedAttestation?.processingRegions?.join(', ') ?? '',
          true,
          'text',
        ],
        [
          'subprocessors',
          persistedAttestation?.subprocessors?.join(', ') ?? '',
          false,
          'text',
        ],
        [
          'incidentResponseReference',
          persistedAttestation?.incidentResponseReference ?? '',
          true,
          'text',
        ],
        [
          'decisionReference',
          persistedAttestation?.decisionReference ?? '',
          true,
          'text',
        ],
        ['reviewedAt', persistedAttestation?.reviewedAt ?? '', true, 'text'],
        ['reviewDueAt', persistedAttestation?.reviewDueAt ?? '', false, 'text'],
      ].map(([name, value, required, type]) => {
        const id = `ai-attestation-${name}`
        return (
          <Field
            help={t(`fields.${String(name)}.help`)}
            id={id}
            key={String(name)}
            label={t(`fields.${String(name)}.label`)}
            required={Boolean(required)}
          >
            <input
              className={inputClassName()}
              defaultValue={String(value)}
              id={id}
              min={type === 'number' ? 0 : undefined}
              name={String(name)}
              required={Boolean(required)}
              type={String(type)}
            />
          </Field>
        )
      })}
      {(['isPersonalDataProcessed', 'isTrainingAllowed'] as const).map(name => {
        const id = `ai-attestation-${name}`
        return (
          <Field
            help={t(`fields.${name}.help`)}
            id={id}
            key={name}
            label={t(`fields.${name}.label`)}
            required
          >
            <select
              className={inputClassName()}
              defaultValue={
                persistedAttestation?.[name] === null ||
                persistedAttestation?.[name] === undefined
                  ? ''
                  : String(persistedAttestation[name])
              }
              id={id}
              name={name}
              required
            >
              <option value="">{t('attestation.select')}</option>
              <option value="false">{t('values.no')}</option>
              <option value="true">{t('values.yes')}</option>
            </select>
          </Field>
        )
      })}
      <div className="sm:col-span-2">
        <Field
          help={t('fields.purpose.help')}
          id="ai-attestation-purpose"
          label={t('fields.purpose.label')}
          required
        >
          <textarea
            className={textareaClassName()}
            defaultValue={persistedAttestation?.purpose ?? ''}
            id="ai-attestation-purpose"
            name="purpose"
            required
          />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <DialogActions
          actions={
            <>
              {approvalDraft && currentValidToken ? (
                <button
                  className="btn-destructive px-4! py-2! text-sm"
                  disabled={busy}
                  onClick={event =>
                    void onDiscard(
                      approvalDraft,
                      currentValidToken,
                      event.currentTarget,
                    )
                  }
                  type="button"
                >
                  {t('attestation.discardDraft')}
                </button>
              ) : null}
              {approvalDraft ? (
                <button
                  className="btn-primary px-4! py-2! text-sm"
                  disabled={busy}
                  onClick={() =>
                    void onAttest(
                      attestationPayload(approvalDraft),
                      currentValidToken,
                    )
                  }
                  type="button"
                >
                  {t('attestation.approve')}
                </button>
              ) : null}
            </>
          }
          busy={busy}
          cancel={t('actions.cancel')}
          onCancel={onCancel}
          save={busy ? t('actions.saving') : t('attestation.saveDraft')}
          saveDirty={saveDirty}
        />
      </div>
    </form>
  )
}

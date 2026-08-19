'use client'

import {
  Activity,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleOff,
  Clock3,
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
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from 'react'
import { useConfirmModal } from '@/components/ConfirmModal'
import FieldLabelWithHelp from '@/components/FieldLabelWithHelp'
import FormModal from '@/components/FormModal'
import type {
  AiCapability,
  AiCapabilityPolicy,
  CreateAiConnection,
  SaveAiAttestation,
  SaveAiModelRevision,
  SaveAiRunProfileRevision,
} from '@/lib/ai/admin-contracts'
import type {
  AiAdminAttestationRecord,
  AiAdminBlockerCode,
  AiAdminCatalogItem,
  AiAdminConnectionDetail,
  AiAdminConnectionSummary,
  AiAdminModelRecord,
  AiAdminModelRevisionRecord,
  AiAdminRunProfileRecord,
  AiAdminRunProfileRevisionRecord,
} from '@/lib/ai/admin-service'
import {
  AI_RUN_PROFILE_KEYS,
  type AiRunProfileKey,
} from '@/lib/ai/profile-resolver'
import { devMarker } from '@/lib/developer-mode-markers'
import { apiFetch } from '@/lib/http/api-fetch'
import { readResponseMessage } from '@/lib/http/response-message'

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

type Tone = 'danger' | 'neutral' | 'success' | 'warning'

const CAPABILITIES = [
  'aiAnalysis',
  'cost',
  'imageInput',
  'jsonSchemaSteering',
  'streaming',
  'tokenUsage',
  'validatableJson',
] as const satisfies readonly (keyof AiCapability)[]

const POLICY_CAPABILITIES = [
  'aiAnalysis',
  'imageInput',
  'jsonSchema',
  'streaming',
  'usageMetadata',
  'validatableJson',
] as const satisfies readonly (keyof AiCapabilityPolicy)[]

const EMPTY_CAPABILITIES: AiCapability = {
  aiAnalysis: false,
  cost: false,
  imageInput: false,
  jsonSchemaSteering: false,
  streaming: false,
  tokenUsage: false,
  validatableJson: false,
}

const DEFAULT_POLICY: AiCapabilityPolicy = {
  aiAnalysis: 'allowed',
  imageInput: 'disabled',
  jsonSchema: 'required',
  streaming: 'required',
  usageMetadata: 'allowed',
  validatableJson: 'required',
}

const toneClasses: Record<Tone, string> = {
  danger:
    'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200',
  neutral:
    'border-secondary-200 bg-secondary-100 text-secondary-700 dark:border-secondary-700 dark:bg-secondary-800 dark:text-secondary-200',
  success:
    'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200',
  warning:
    'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-100',
}

interface StatusBadgeProps {
  children: ReactNode
  tone: Tone
}

function StatusBadge({ children, tone }: StatusBadgeProps) {
  const Icon =
    tone === 'success'
      ? CheckCircle2
      : tone === 'danger'
        ? CircleOff
        : tone === 'warning'
          ? TriangleAlert
          : Clock3
  return (
    <span
      className={`inline-flex min-h-6 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${toneClasses[tone]}`}
      role="status"
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      {children}
    </span>
  )
}

function lifecycleTone(
  status: AiAdminConnectionSummary['lifecycleStatus'],
): Tone {
  if (status === 'active') return 'success'
  if (status === 'retired') return 'neutral'
  if (status === 'suspended') return 'danger'
  return 'warning'
}

function healthTone(
  status: AiAdminConnectionSummary['operationalHealth'],
): Tone {
  if (status === 'healthy') return 'success'
  if (status === 'unavailable') return 'danger'
  if (status === 'degraded') return 'warning'
  return 'neutral'
}

function revisionTone(status: AiAdminModelRevisionRecord['status']): Tone {
  if (status === 'verified') return 'success'
  if (status === 'retired') return 'neutral'
  return status === 'verification_required' ? 'warning' : 'neutral'
}

function isDemoSeed(connection: AiAdminConnectionDetail): boolean {
  return /\bdemo\b/i.test(
    `${connection.administrationName} ${connection.description ?? ''}`,
  )
}

function splitList(value: FormDataEntryValue | null): string[] | null {
  if (typeof value !== 'string') return null
  const values = value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
  return values
}

function nullable(value: FormDataEntryValue | null): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
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

function inputClassName(): string {
  return 'min-h-11 w-full rounded-xl border border-secondary-300 bg-white px-3 py-2 text-sm text-secondary-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:border-secondary-700 dark:bg-secondary-950 dark:text-secondary-50'
}

function textareaClassName(): string {
  return `${inputClassName()} min-h-24`
}

interface FieldProps {
  children: ReactNode
  help: string
  id: string
  label: string
  required?: boolean
}

function Field({ children, help, id, label, required = false }: FieldProps) {
  return (
    <div>
      <FieldLabelWithHelp
        help={help}
        htmlFor={id}
        label={label}
        required={required}
      />
      {children}
    </div>
  )
}

interface DialogActionsProps {
  busy: boolean
  cancel: string
  onCancel: () => void
  save: string
}

function DialogActions({ busy, cancel, onCancel, save }: DialogActionsProps) {
  return (
    <div className="mt-6 flex flex-wrap justify-end gap-3">
      <button
        className="btn-secondary px-4! py-2! text-sm"
        disabled={busy}
        onClick={onCancel}
        type="button"
      >
        {cancel}
      </button>
      <button
        className="btn-primary px-4! py-2! text-sm"
        disabled={busy}
        type="submit"
      >
        {save}
      </button>
    </div>
  )
}

interface ConnectionFormProps {
  busy: boolean
  connection: AiAdminConnectionDetail | null
  onCancel: () => void
  onSubmit: (value: CreateAiConnection) => Promise<void>
}

function ConnectionForm({
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

interface ModelFormProps {
  busy: boolean
  model: AiAdminModelRecord | null
  onCancel: () => void
  onSubmit: (value: SaveAiModelRevision) => Promise<void>
}

function ModelForm({ busy, model, onCancel, onSubmit }: ModelFormProps) {
  const t = useTranslations('admin.aiConnections')
  const draft = model?.revisions.find(revision => revision.status === 'draft')
  const latest = draft ?? model?.revisions.at(-1)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const declaredCapabilities = Object.fromEntries(
      CAPABILITIES.map(capability => [
        capability,
        data.get(`capability-${capability}`) === 'on',
      ]),
    ) as unknown as AiCapability
    await onSubmit({
      declaredCapabilities,
      description: nullable(data.get('description')),
      discoveredCapabilities: latest?.discoveredCapabilities ?? null,
      externalModelId: String(data.get('externalModelId')),
      externalModelVersion: nullable(data.get('externalModelVersion')),
      modelId: model?.id ?? null,
      modelToken: model?.revisionToken ?? null,
      name: String(data.get('name')),
    })
  }
  return (
    <form className="grid gap-4" onSubmit={submit}>
      {[
        ['name', model?.name ?? '', true],
        ['externalModelId', latest?.externalModelId ?? '', true],
        ['externalModelVersion', latest?.externalModelVersion ?? '', false],
      ].map(([name, value, required]) => {
        const id = `ai-model-${name}`
        return (
          <Field
            help={t(`fields.${name}.help`)}
            id={id}
            key={String(name)}
            label={t(`fields.${name}.label`)}
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
        help={t('fields.modelDescription.help')}
        id="ai-model-description"
        label={t('fields.modelDescription.label')}
      >
        <textarea
          className={textareaClassName()}
          defaultValue={model?.description ?? ''}
          id="ai-model-description"
          name="description"
        />
      </Field>
      <fieldset className="rounded-2xl border border-secondary-200 p-4 dark:border-secondary-700">
        <legend className="px-1 text-sm font-semibold text-secondary-950 dark:text-secondary-50">
          {t('model.capabilities')}
        </legend>
        <p className="mb-3 text-xs text-secondary-600 dark:text-secondary-300">
          {t('model.capabilitiesHelp')}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {CAPABILITIES.map(capability => (
            <label
              className="inline-flex min-h-11 items-center gap-3 rounded-xl bg-secondary-50 px-3 text-sm dark:bg-secondary-950/50"
              key={capability}
            >
              <input
                defaultChecked={
                  latest?.declaredCapabilities[capability] ??
                  EMPTY_CAPABILITIES[capability]
                }
                name={`capability-${capability}`}
                type="checkbox"
              />
              {t(`capabilities.${capability}`)}
            </label>
          ))}
        </div>
      </fieldset>
      <DialogActions
        busy={busy}
        cancel={t('actions.cancel')}
        onCancel={onCancel}
        save={busy ? t('actions.saving') : t('actions.saveModel')}
      />
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

function SecretForm({
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
  onSave: (value: SaveAiAttestation) => Promise<void>
  savedDraft: AiAdminAttestationRecord | null
}

function AttestationForm({
  busy,
  connection,
  onAttest,
  onCancel,
  onSave,
  savedDraft,
}: AttestationFormProps) {
  const t = useTranslations('admin.aiConnections')
  const existing = connection.attestation
  const editable = existing?.status === 'draft' ? existing : null
  const currentValidToken =
    existing?.status === 'valid' ? existing.revisionToken : null
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
      revisionToken: editable?.revisionToken ?? null,
      subprocessors: splitList(data.get('subprocessors')),
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await onSave(valueFrom(event.currentTarget))
  }
  const defaults = savedDraft ?? editable ?? existing
  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
      {[
        [
          'responsibleOrganizationUnitReference',
          defaults?.responsibleOrganizationUnitReference ?? '',
          true,
          'text',
        ],
        ['providerName', defaults?.providerName ?? '', true, 'text'],
        [
          'maximumInformationClass',
          defaults?.maximumInformationClass ?? '',
          true,
          'text',
        ],
        [
          'maximumRetentionDays',
          defaults?.maximumRetentionDays ?? '',
          true,
          'number',
        ],
        [
          'processingRegions',
          defaults?.processingRegions?.join(', ') ?? '',
          true,
          'text',
        ],
        [
          'subprocessors',
          defaults?.subprocessors?.join(', ') ?? '',
          false,
          'text',
        ],
        [
          'incidentResponseReference',
          defaults?.incidentResponseReference ?? '',
          true,
          'text',
        ],
        ['decisionReference', defaults?.decisionReference ?? '', true, 'text'],
        ['reviewedAt', defaults?.reviewedAt ?? '', true, 'text'],
        ['reviewDueAt', defaults?.reviewDueAt ?? '', false, 'text'],
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
                defaults?.[name] === null || defaults?.[name] === undefined
                  ? ''
                  : String(defaults[name])
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
            defaultValue={defaults?.purpose ?? ''}
            id="ai-attestation-purpose"
            name="purpose"
            required
          />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <DialogActions
          busy={busy}
          cancel={t('actions.cancel')}
          onCancel={onCancel}
          save={busy ? t('actions.saving') : t('attestation.saveDraft')}
        />
        {savedDraft ? (
          <button
            className="btn-primary mt-3 w-full px-4! py-2! text-sm"
            disabled={busy}
            onClick={() =>
              void onAttest(attestationPayload(savedDraft), currentValidToken)
            }
            type="button"
          >
            {t('attestation.approve')}
          </button>
        ) : null}
      </div>
    </form>
  )
}

interface ProfileFormProps {
  busy: boolean
  modelRevisions: readonly {
    connection: AiAdminConnectionDetail
    model: AiAdminModelRecord
    revision: AiAdminModelRevisionRecord
  }[]
  onCancel: () => void
  onSubmit: (value: SaveAiRunProfileRevision) => Promise<void>
  profile: AiAdminRunProfileRecord
}

function ProfileForm({
  busy,
  modelRevisions,
  onCancel,
  onSubmit,
  profile,
}: ProfileFormProps) {
  const t = useTranslations('admin.aiConnections')
  const current = profile.draftRevision
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const capabilityPolicy = Object.fromEntries(
      POLICY_CAPABILITIES.map(capability => [
        capability,
        String(data.get(`policy-${capability}`)),
      ]),
    ) as unknown as AiCapabilityPolicy
    await onSubmit({
      capabilityPolicy,
      inactivityTimeBudgetSeconds: Number(
        data.get('inactivityTimeBudgetSeconds'),
      ),
      modelRevisionId: nullable(data.get('modelRevisionId')),
      queueCapacity: Number(data.get('queueCapacity')),
      revisionToken: current?.revisionToken ?? null,
      totalTimeBudgetSeconds: Number(data.get('totalTimeBudgetSeconds')),
    })
  }
  return (
    <form className="grid gap-4" onSubmit={submit}>
      <Field
        help={t('fields.modelRevisionId.help')}
        id="ai-profile-modelRevisionId"
        label={t('fields.modelRevisionId.label')}
      >
        <select
          className={inputClassName()}
          defaultValue={current?.modelRevisionId ?? ''}
          id="ai-profile-modelRevisionId"
          name="modelRevisionId"
        >
          <option value="">{t('profile.noModel')}</option>
          {modelRevisions.map(({ connection, model, revision }) => (
            <option key={revision.id} value={revision.id}>
              {connection.administrationName} · {model.name} ·{' '}
              {t('model.revision', { number: revision.revisionNumber })}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          [
            'totalTimeBudgetSeconds',
            current?.totalTimeBudgetSeconds ?? 1200,
            300,
            3600,
          ],
          [
            'inactivityTimeBudgetSeconds',
            current?.inactivityTimeBudgetSeconds ?? 300,
            300,
            3600,
          ],
          ['queueCapacity', current?.queueCapacity ?? 10, 0, 100],
        ].map(([name, value, min, max]) => {
          const id = `ai-profile-${name}`
          return (
            <Field
              help={t(`fields.${String(name)}.help`)}
              id={id}
              key={String(name)}
              label={t(`fields.${String(name)}.label`)}
              required
            >
              <input
                className={inputClassName()}
                defaultValue={Number(value)}
                id={id}
                max={Number(max)}
                min={Number(min)}
                name={String(name)}
                required
                type="number"
              />
            </Field>
          )
        })}
      </div>
      <fieldset className="rounded-2xl border border-secondary-200 p-4 dark:border-secondary-700">
        <legend className="px-1 text-sm font-semibold text-secondary-950 dark:text-secondary-50">
          {t('profile.capabilityPolicy')}
        </legend>
        <p className="mb-3 text-xs text-secondary-600 dark:text-secondary-300">
          {t('profile.capabilityPolicyHelp')}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {POLICY_CAPABILITIES.map(capability => {
            const id = `ai-profile-policy-${capability}`
            return (
              <Field
                help={t(`policy.${capability}.help`)}
                id={id}
                key={capability}
                label={t(`policy.${capability}.label`)}
              >
                <select
                  className={inputClassName()}
                  defaultValue={
                    current?.capabilityPolicy[capability] ??
                    DEFAULT_POLICY[capability]
                  }
                  id={id}
                  name={`policy-${capability}`}
                >
                  {['disabled', 'allowed', 'required'].map(mode => (
                    <option key={mode} value={mode}>
                      {t(`policy.modes.${mode}`)}
                    </option>
                  ))}
                </select>
              </Field>
            )
          })}
        </div>
      </fieldset>
      <DialogActions
        busy={busy}
        cancel={t('actions.cancel')}
        onCancel={onCancel}
        save={busy ? t('actions.saving') : t('profile.saveDraft')}
      />
    </form>
  )
}

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
  const loadErrorMessage = t('loadError')
  const [connections, setConnections] = useState<AiAdminConnectionSummary[]>([])
  const [details, setDetails] = useState<
    Record<string, AiAdminConnectionDetail>
  >({})
  const [profiles, setProfiles] = useState<AiAdminRunProfileRecord[]>([])
  const [profileRevisions, setProfileRevisions] = useState<
    Record<AiRunProfileKey, readonly AiAdminRunProfileRevisionRecord[]>
  >({
    generation_with_images: [],
    generation_without_images: [],
    invalid_json_repair: [],
  })
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<DialogState>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [candidateId, setCandidateId] = useState<string | null>(null)
  const [savedAttestation, setSavedAttestation] =
    useState<AiAdminAttestationRecord | null>(null)
  const [catalog, setCatalog] = useState<readonly AiAdminCatalogItem[]>([])

  const loadRegistry = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [connectionResponse, profileResponse, ...revisionResponses] =
        await Promise.all([
          apiFetch('/api/admin/ai-connections'),
          apiFetch('/api/admin/ai-run-profiles'),
          ...AI_RUN_PROFILE_KEYS.map(key =>
            apiFetch(`/api/admin/ai-run-profiles/${key}/revisions`),
          ),
        ])
      if (
        !connectionResponse.ok ||
        !profileResponse.ok ||
        revisionResponses.some(response => !response.ok)
      ) {
        throw new Error(loadErrorMessage)
      }
      const summaries =
        (await connectionResponse.json()) as AiAdminConnectionSummary[]
      const detailResponses = await Promise.all(
        summaries.map(connection =>
          apiFetch(`/api/admin/ai-connections/${connection.id}`),
        ),
      )
      if (detailResponses.some(response => !response.ok))
        throw new Error(loadErrorMessage)
      const loadedDetails = await Promise.all(
        detailResponses.map(
          response => response.json() as Promise<AiAdminConnectionDetail>,
        ),
      )
      const loadedProfiles =
        (await profileResponse.json()) as AiAdminRunProfileRecord[]
      const revisions = await Promise.all(
        revisionResponses.map(
          response =>
            response.json() as Promise<AiAdminRunProfileRevisionRecord[]>,
        ),
      )
      setConnections(summaries)
      setDetails(Object.fromEntries(loadedDetails.map(item => [item.id, item])))
      setProfiles(loadedProfiles)
      setProfileRevisions(
        Object.fromEntries(
          AI_RUN_PROFILE_KEYS.map((key, index) => [
            key,
            revisions[index] ?? [],
          ]),
        ) as unknown as Record<
          AiRunProfileKey,
          readonly AiAdminRunProfileRevisionRecord[]
        >,
      )
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : loadErrorMessage,
      )
    } finally {
      setLoading(false)
    }
  }, [loadErrorMessage])

  useEffect(() => {
    void loadRegistry()
  }, [loadRegistry])

  async function mutation(
    url: string,
    body: unknown,
    method: 'PATCH' | 'POST' = 'POST',
  ): Promise<Response | null> {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const response = await apiFetch(url, {
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
        method,
      })
      if (!response.ok) {
        setError((await readResponseMessage(response)) ?? t('mutationError'))
        return null
      }
      return response
    } catch {
      setError(t('mutationError'))
      return null
    } finally {
      setBusy(false)
    }
  }

  async function mutateAndReload(
    url: string,
    body: unknown,
    successKey: string,
    method: 'PATCH' | 'POST' = 'POST',
  ): Promise<boolean> {
    const response = await mutation(url, body, method)
    if (!response) return false
    setMessage(t(successKey))
    await loadRegistry()
    return true
  }

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
    setCatalog((await response.json()) as AiAdminCatalogItem[])
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
    if (!target) return
    await mutateAndReload(
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
          return (
            <article key={connection.id}>
              <button
                aria-controls={`ai-connection-${connection.id}`}
                aria-expanded={expanded}
                className={`grid w-full gap-3 p-5 text-left transition-colors sm:grid-cols-[minmax(0,1fr)_minmax(10rem,auto)_minmax(10rem,auto)_auto] sm:items-center ${expanded ? 'bg-primary-50/70 dark:bg-primary-950/30' : 'hover:bg-secondary-50 dark:hover:bg-secondary-800/40'}`}
                onClick={() =>
                  setExpandedId(current =>
                    current === connection.id ? null : connection.id,
                  )
                }
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
              {expanded && detail ? (
                <div
                  className="space-y-5 border-t border-primary-200 bg-white p-5 dark:border-primary-900 dark:bg-secondary-900"
                  id={`ai-connection-${connection.id}`}
                >
                  {isDemoSeed(detail) ? (
                    <div
                      className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
                      role="status"
                    >
                      <CircleAlert
                        aria-hidden="true"
                        className="h-5 w-5 shrink-0"
                      />
                      <p>{t('seed.demoDraft')}</p>
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
                          setDialog({ connection: detail, kind: 'connection' })
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
                          setDialog({ connection: detail, kind: 'attestation' })
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
                        <TriangleAlert aria-hidden="true" className="h-4 w-4" />
                        {t('blockers.title')}
                      </h5>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900 dark:text-amber-100">
                        {detail.blockers.map(blocker => (
                          <li key={`${blocker.code}-${blocker.field ?? ''}`}>
                            {t(
                              `blockers.${blocker.code as AiAdminBlockerCode}`,
                            )}
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
                          [t('fields.tlsPolicyKey.label'), detail.tlsPolicyKey],
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
                          ? t(`attestation.status.${detail.attestation.status}`)
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
                                <StatusBadge tone={revisionTone(latest.status)}>
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
                                    detail.connectionEvidenceId === null
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
                                    busy || latest.status !== 'verified'
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
                                  title={t('health.safeRecoveryHelp')}
                                  type="button"
                                >
                                  {t('actions.probeHealth')}
                                </button>
                                <button
                                  className="btn-secondary px-3! py-1.5! text-xs"
                                  disabled={busy || latest.status === 'retired'}
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
                          disabled={busy}
                          onClick={() => void fetchCatalog(detail)}
                          type="button"
                        >
                          <RefreshCw aria-hidden="true" className="h-4 w-4" />
                          {t('actions.fetchCatalog')}
                        </button>
                        <button
                          className="btn-secondary px-4! py-2! text-sm"
                          disabled={busy}
                          onClick={() =>
                            void connectionAction(
                              detail,
                              { action: 'verify_connection' },
                              'verification.completed',
                            )
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
                              detail.blockers.length > 0
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
          {profiles.map(profile => (
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
                      {t(`blockers.${blocker.code}`)}
                    </li>
                  ))}
                </ul>
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
                    profile.blockers.length > 0
                  }
                  onClick={() => void activateProfile(profile)}
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
          ))}
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
              if (success) closeDialog()
            }}
            profile={dialog.profile}
          />
        ) : null}
      </FormModal>
    </div>
  )
}

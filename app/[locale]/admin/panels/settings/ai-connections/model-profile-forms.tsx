'use client'

import { useTranslations } from 'next-intl'
import type { FormEvent } from 'react'
import FieldLabelWithHelp from '@/components/FieldLabelWithHelp'
import type {
  AiCapability,
  AiCapabilityPolicy,
  SaveAiModelRevision,
  SaveAiRunProfileRevision,
} from '@/lib/ai/admin-contracts'
import type {
  AiAdminConnectionDetail,
  AiAdminModelRecord,
  AiAdminModelRevisionRecord,
  AiAdminRunProfileRecord,
} from '@/lib/ai/admin-service'
import type { AiRunProfileKey } from '@/lib/ai/profile-resolver'
import {
  DialogActions,
  Field,
  inputClassName,
  nullable,
  textareaClassName,
} from './form-controls'

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

const LOCKED_PROFILE_POLICY: Record<
  AiRunProfileKey,
  Partial<AiCapabilityPolicy>
> = {
  generation_with_images: {
    imageInput: 'required',
    streaming: 'required',
    validatableJson: 'required',
  },
  generation_without_images: {
    imageInput: 'disabled',
    streaming: 'required',
    validatableJson: 'required',
  },
  invalid_json_repair: {
    aiAnalysis: 'disabled',
    imageInput: 'disabled',
    streaming: 'disabled',
    validatableJson: 'required',
  },
}

function profilePolicy(profile: AiAdminRunProfileRecord): AiCapabilityPolicy {
  return {
    ...DEFAULT_POLICY,
    ...profile.draftRevision?.capabilityPolicy,
    ...LOCKED_PROFILE_POLICY[profile.profileKey],
  }
}

export function ModelForm({
  busy,
  model,
  onCancel,
  onSubmit,
}: {
  busy: boolean
  model: AiAdminModelRecord | null
  onCancel: () => void
  onSubmit: (value: SaveAiModelRevision) => Promise<void>
}) {
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
          {CAPABILITIES.map(capability => {
            const id = `ai-model-capability-${capability}`
            return (
              <div
                className="min-h-11 rounded-xl bg-secondary-50 px-3 py-2 dark:bg-secondary-950/50"
                key={capability}
              >
                <FieldLabelWithHelp
                  help={t(`capabilityHelp.${capability}`)}
                  htmlFor={id}
                  label={t(`capabilities.${capability}`)}
                />
                <input
                  defaultChecked={
                    latest?.declaredCapabilities[capability] ??
                    EMPTY_CAPABILITIES[capability]
                  }
                  id={id}
                  name={`capability-${capability}`}
                  type="checkbox"
                />
              </div>
            )
          })}
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

export function ProfileForm({
  busy,
  modelRevisions,
  onCancel,
  onSubmit,
  profile,
}: {
  busy: boolean
  modelRevisions: readonly {
    connection: AiAdminConnectionDetail
    model: AiAdminModelRecord
    revision: AiAdminModelRevisionRecord
  }[]
  onCancel: () => void
  onSubmit: (value: SaveAiRunProfileRevision) => Promise<void>
  profile: AiAdminRunProfileRecord
}) {
  const t = useTranslations('admin.aiConnections')
  const current = profile.draftRevision
  const effectivePolicy = profilePolicy(profile)
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
            const lockedMode =
              LOCKED_PROFILE_POLICY[profile.profileKey][capability]
            return (
              <Field
                help={t(`policy.${capability}.help`)}
                id={id}
                key={capability}
                label={t(`policy.${capability}.label`)}
              >
                <select
                  className={inputClassName()}
                  defaultValue={effectivePolicy[capability]}
                  disabled={lockedMode !== undefined}
                  id={id}
                  name={`policy-${capability}`}
                >
                  {(capability === 'usageMetadata'
                    ? ['disabled', 'allowed']
                    : ['disabled', 'allowed', 'required']
                  ).map(mode => (
                    <option key={mode} value={mode}>
                      {t(`policy.modes.${mode}`)}
                    </option>
                  ))}
                </select>
                {lockedMode !== undefined ? (
                  <input
                    name={`policy-${capability}`}
                    type="hidden"
                    value={lockedMode}
                  />
                ) : null}
                {lockedMode !== undefined ? (
                  <p className="mt-1 text-xs text-secondary-500 dark:text-secondary-400">
                    {t('profile.lockedMinimum')}
                  </p>
                ) : null}
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

'use client'

import {
  CheckCircle2,
  CircleHelp,
  Info,
  LoaderCircle,
  XCircle,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { type FormEvent, useEffect, useMemo, useState } from 'react'
import FieldLabelWithHelp from '@/components/FieldLabelWithHelp'
import type {
  AiCapability,
  AiCapabilityPolicy,
  SaveAiModelRevision,
  SaveAiRunProfileRevision,
} from '@/lib/ai/admin-contracts'
import type {
  AiAdminCapabilityDiscoveryResult,
  AiAdminCapabilitySupportMap,
  AiAdminCatalogItem,
  AiAdminConnectionDetail,
  AiAdminModelRecord,
  AiAdminModelRevisionRecord,
  AiAdminRunProfileRecord,
} from '@/lib/ai/admin-service'
import { AI_CAPABILITY_KEYS } from '@/lib/ai/capability-keys'
import type { AiRunProfileKey } from '@/lib/ai/profile-resolver'
import { devMarker } from '@/lib/developer-mode-markers'
import {
  DialogActions,
  Field,
  inputClassName,
  nullable,
  textareaClassName,
} from './form-controls'

const CAPABILITIES = AI_CAPABILITY_KEYS

const POLICY_CAPABILITIES = [
  'aiAnalysis',
  'imageInput',
  'jsonSchema',
  'streaming',
  'usageMetadata',
  'validatableJson',
] as const satisfies readonly (keyof AiCapabilityPolicy)[]

type PolicyCapability = (typeof POLICY_CAPABILITIES)[number]
type PolicyMode = AiCapabilityPolicy[PolicyCapability]
type ProfileModelRevision = {
  connection: AiAdminConnectionDetail
  model: AiAdminModelRecord
  revision: AiAdminModelRevisionRecord
}

const EMPTY_CAPABILITIES: AiCapability = {
  aiAnalysis: false,
  cost: false,
  imageInput: false,
  jsonSchemaSteering: false,
  streaming: false,
  tokenUsage: false,
  validatableJson: false,
}

const CATALOG_PROVIDER_NAMES: Readonly<Record<string, string>> = {
  anthropic: 'Anthropic',
  cohere: 'Cohere',
  deepseek: 'DeepSeek',
  google: 'Google',
  'meta-llama': 'Meta',
  mistralai: 'Mistral',
  openai: 'OpenAI',
  qwen: 'Qwen',
}

function catalogItemKey(item: AiAdminCatalogItem): string {
  return JSON.stringify([item.externalModelId, item.externalModelVersion])
}

function catalogCapabilitySupport(
  item: Readonly<AiAdminCatalogItem>,
): AiAdminCapabilitySupportMap {
  if (item.capabilitySupport) return item.capabilitySupport
  return Object.fromEntries(
    CAPABILITIES.map(capability => [
      capability,
      item.capabilities[capability] ? 'supported' : 'unsupported',
    ]),
  ) as AiAdminCapabilitySupportMap
}

function resolvedCapabilitySupport(
  capabilities: Readonly<AiCapability>,
): AiAdminCapabilitySupportMap {
  return Object.fromEntries(
    CAPABILITIES.map(capability => [
      capability,
      capabilities[capability] ? 'supported' : 'unsupported',
    ]),
  ) as AiAdminCapabilitySupportMap
}

function completelyAssessedCapabilities(
  capabilities: Readonly<AiCapability>,
  support: Readonly<AiAdminCapabilitySupportMap>,
): AiCapability | null {
  return CAPABILITIES.some(capability => support[capability] === 'unknown')
    ? null
    : { ...capabilities }
}

function matchingCatalogItem(
  catalog: readonly AiAdminCatalogItem[],
  externalModelId: string,
  externalModelVersion: string,
): AiAdminCatalogItem | undefined {
  const version = externalModelVersion.trim() || null
  return catalog.find(
    item =>
      item.externalModelId === externalModelId.trim() &&
      item.externalModelVersion === version,
  )
}

function catalogProviderLabel(
  item: AiAdminCatalogItem,
  fallback: string,
): string {
  const provider = item.modelProviderName?.trim()
  if (!provider) return fallback
  return (
    CATALOG_PROVIDER_NAMES[provider.toLowerCase()] ??
    `${provider.charAt(0).toUpperCase()}${provider.slice(1)}`
  )
}

function catalogPriceSuffix(
  item: AiAdminCatalogItem,
  t: ReturnType<typeof useTranslations>,
): string {
  const prices: string[] = []
  if (item.inputPricePerMillionTokens) {
    prices.push(
      t('catalog.inputPrice', {
        amount: item.inputPricePerMillionTokens.amount,
        currency: item.inputPricePerMillionTokens.currency,
      }),
    )
  }
  if (item.outputPricePerMillionTokens) {
    prices.push(
      t('catalog.outputPrice', {
        amount: item.outputPricePerMillionTokens.amount,
        currency: item.outputPricePerMillionTokens.currency,
      }),
    )
  }
  return prices.length > 0 ? ` · ${prices.join(' · ')}` : ''
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

function supportsPolicyCapability(
  revision: Readonly<AiAdminModelRevisionRecord>,
  capability: PolicyCapability,
): boolean {
  const verified = revision.verifiedCapabilities
  if (!verified) return false
  if (capability === 'jsonSchema') return verified.jsonSchemaSteering
  if (capability === 'usageMetadata') {
    return verified.cost || verified.tokenUsage
  }
  return verified[capability]
}

function missingRequiredProfileCapabilities(
  profileKey: AiRunProfileKey,
  revision: Readonly<AiAdminModelRevisionRecord>,
): readonly PolicyCapability[] {
  return POLICY_CAPABILITIES.filter(
    capability =>
      LOCKED_PROFILE_POLICY[profileKey][capability] === 'required' &&
      !supportsPolicyCapability(revision, capability),
  )
}

function normalizePolicyForRevision(
  policy: Readonly<AiCapabilityPolicy>,
  profileKey: AiRunProfileKey,
  revision?: Readonly<AiAdminModelRevisionRecord>,
): AiCapabilityPolicy {
  return Object.fromEntries(
    POLICY_CAPABILITIES.map(capability => {
      const lockedMode = LOCKED_PROFILE_POLICY[profileKey][capability]
      if (lockedMode !== undefined) return [capability, lockedMode]
      if (revision && !supportsPolicyCapability(revision, capability)) {
        return [capability, 'disabled']
      }
      return [capability, policy[capability]]
    }),
  ) as AiCapabilityPolicy
}

export function ModelForm({
  busy,
  catalog,
  catalogStatus,
  model,
  onCancel,
  onDiscoverCapabilities,
  onRefreshCatalog,
  onSubmit,
}: {
  busy: boolean
  catalog: readonly AiAdminCatalogItem[]
  catalogStatus: 'idle' | 'loaded' | 'loading' | 'unavailable'
  model: AiAdminModelRecord | null
  onCancel: () => void
  onDiscoverCapabilities: (input: {
    capabilities: readonly (keyof AiCapability)[]
    externalModelId: string
    externalModelVersion: string | null
  }) => Promise<AiAdminCapabilityDiscoveryResult | null>
  onRefreshCatalog: () => Promise<readonly AiAdminCatalogItem[] | null>
  onSubmit: (value: SaveAiModelRevision) => Promise<void>
}) {
  const t = useTranslations('admin.aiConnections')
  const draft = model?.revisions.find(revision => revision.status === 'draft')
  const latest = draft ?? model?.revisions.at(-1)
  const [modelName, setModelName] = useState(model?.name ?? '')
  const [externalModelId, setExternalModelId] = useState(
    latest?.externalModelId ?? '',
  )
  const [externalModelVersion, setExternalModelVersion] = useState(
    latest?.externalModelVersion ?? '',
  )
  const [declaredCapabilities, setDeclaredCapabilities] =
    useState<AiCapability>(
      latest?.declaredCapabilities ?? { ...EMPTY_CAPABILITIES },
    )
  const [discoveredCapabilities, setDiscoveredCapabilities] =
    useState<AiCapability | null>(latest?.discoveredCapabilities ?? null)
  const [selectedCatalogKey, setSelectedCatalogKey] = useState('')
  const [capabilitySupport, setCapabilitySupport] =
    useState<AiAdminCapabilitySupportMap | null>(() =>
      latest?.discoveredCapabilities
        ? resolvedCapabilitySupport(latest.discoveredCapabilities)
        : null,
    )
  const [checkingCapabilities, setCheckingCapabilities] = useState(false)
  const [capabilityCheckCompleted, setCapabilityCheckCompleted] =
    useState(false)
  const capabilitiesLoading =
    catalogStatus === 'idle' || catalogStatus === 'loading'
  const catalogGroups = useMemo(() => {
    const groups = new Map<string, AiAdminCatalogItem[]>()
    for (const item of [...catalog].sort((left, right) =>
      left.name.localeCompare(right.name),
    )) {
      const provider = catalogProviderLabel(item, t('catalog.otherProvider'))
      const items = groups.get(provider) ?? []
      items.push(item)
      groups.set(provider, items)
    }
    return [...groups.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    )
  }, [catalog, t])
  useEffect(() => {
    if (catalogStatus !== 'loaded') return
    const item = matchingCatalogItem(
      catalog,
      externalModelId,
      externalModelVersion,
    )
    if (!item) {
      setSelectedCatalogKey('')
      setCapabilitySupport(null)
      return
    }
    const itemKey = catalogItemKey(item)
    if (selectedCatalogKey === itemKey) return
    setSelectedCatalogKey(itemKey)
    const catalogSupport = catalogCapabilitySupport(item)
    const persistedDiscovery =
      latest?.externalModelId === externalModelId.trim() &&
      latest.externalModelVersion === (externalModelVersion.trim() || null)
        ? latest.discoveredCapabilities
        : null
    if (persistedDiscovery) {
      const persistedSupport = resolvedCapabilitySupport(persistedDiscovery)
      const mergedSupport = Object.fromEntries(
        CAPABILITIES.map(capability => [
          capability,
          catalogSupport[capability] === 'unknown'
            ? persistedSupport[capability]
            : catalogSupport[capability],
        ]),
      ) as AiAdminCapabilitySupportMap
      const mergedCapabilities = Object.fromEntries(
        CAPABILITIES.map(capability => [
          capability,
          mergedSupport[capability] === 'supported',
        ]),
      ) as AiCapability
      setCapabilitySupport(mergedSupport)
      setDeclaredCapabilities(mergedCapabilities)
      setDiscoveredCapabilities(mergedCapabilities)
      return
    }
    setDeclaredCapabilities({ ...item.capabilities })
    setDiscoveredCapabilities(
      completelyAssessedCapabilities(item.capabilities, catalogSupport),
    )
    setCapabilitySupport(catalogSupport)
  }, [
    catalog,
    catalogStatus,
    externalModelId,
    externalModelVersion,
    latest?.discoveredCapabilities,
    latest?.externalModelId,
    latest?.externalModelVersion,
    selectedCatalogKey,
  ])
  function selectCatalogItem(key: string) {
    setSelectedCatalogKey(key)
    if (!key) {
      setCapabilitySupport(null)
      return
    }
    const item = catalog.find(candidate => catalogItemKey(candidate) === key)
    if (!item) return
    setModelName(item.name)
    setExternalModelId(item.externalModelId)
    setExternalModelVersion(item.externalModelVersion ?? '')
    setDeclaredCapabilities({ ...item.capabilities })
    const support = catalogCapabilitySupport(item)
    setDiscoveredCapabilities(
      completelyAssessedCapabilities(item.capabilities, support),
    )
    setCapabilitySupport(support)
  }
  async function checkCapabilities(): Promise<void> {
    if (!externalModelId.trim()) return
    setCheckingCapabilities(true)
    setCapabilityCheckCompleted(false)
    try {
      const refreshedCatalog = await onRefreshCatalog()
      const item = matchingCatalogItem(
        refreshedCatalog ?? catalog,
        externalModelId,
        externalModelVersion,
      )
      let nextSupport = item
        ? catalogCapabilitySupport(item)
        : capabilitySupport
      let nextCapabilities = item
        ? { ...item.capabilities }
        : { ...declaredCapabilities }
      let assessed = Boolean(item)
      if (item) setSelectedCatalogKey(catalogItemKey(item))
      const unknownCapabilities = nextSupport
        ? CAPABILITIES.filter(
            capability => nextSupport?.[capability] === 'unknown',
          )
        : [...CAPABILITIES]
      if (unknownCapabilities.length > 0) {
        const discovery = await onDiscoverCapabilities({
          capabilities: unknownCapabilities,
          externalModelId: externalModelId.trim(),
          externalModelVersion: externalModelVersion.trim() || null,
        })
        if (discovery) {
          assessed = true
          nextSupport = Object.fromEntries(
            CAPABILITIES.map(capability => [
              capability,
              nextSupport?.[capability] === 'unknown' || !nextSupport
                ? discovery.assessments[capability].support
                : nextSupport[capability],
            ]),
          ) as AiAdminCapabilitySupportMap
          nextCapabilities = Object.fromEntries(
            CAPABILITIES.map(capability => [
              capability,
              nextSupport?.[capability] === 'supported'
                ? true
                : nextSupport?.[capability] === 'unsupported'
                  ? false
                  : nextCapabilities[capability],
            ]),
          ) as AiCapability
        }
      }
      setCapabilitySupport(nextSupport)
      setDeclaredCapabilities(nextCapabilities)
      if (assessed && nextSupport) {
        setDiscoveredCapabilities(
          completelyAssessedCapabilities(nextCapabilities, nextSupport),
        )
      }
      setCapabilityCheckCompleted(nextSupport !== null)
    } finally {
      setCheckingCapabilities(false)
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    await onSubmit({
      declaredCapabilities,
      description: nullable(data.get('description')),
      discoveredCapabilities,
      externalModelId,
      externalModelVersion: externalModelVersion.trim() || null,
      modelId: model?.id ?? null,
      modelToken: model?.revisionToken ?? null,
      name: modelName,
    })
  }
  return (
    <form className="grid gap-4" onSubmit={submit}>
      <div
        aria-atomic="true"
        className="flex items-start gap-2 rounded-2xl border border-secondary-200 bg-secondary-50 p-4 text-sm text-secondary-700 dark:border-secondary-700 dark:bg-secondary-950/50 dark:text-secondary-200"
        role="status"
        {...devMarker({
          context: 'AI model form',
          name: 'AI model catalog availability',
          priority: 425,
        })}
      >
        {catalogStatus === 'loading' ? (
          <LoaderCircle
            aria-hidden="true"
            className="mt-0.5 h-4 w-4 shrink-0 animate-spin"
          />
        ) : (
          <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
        )}
        <p>
          {catalogStatus === 'loading'
            ? t('catalog.loading')
            : catalogStatus === 'loaded' && catalog.length > 0
              ? t('catalog.selectionReady')
              : catalogStatus === 'unavailable'
                ? t('catalog.unavailableManual')
                : t('catalog.selectionIntro')}
        </p>
      </div>
      {catalog.length > 0 ? (
        <Field
          help={t('catalog.selectionHelp')}
          id="ai-model-catalog-selection"
          label={t('catalog.selectionLabel')}
        >
          <select
            className={inputClassName()}
            id="ai-model-catalog-selection"
            onChange={event => selectCatalogItem(event.target.value)}
            value={selectedCatalogKey}
          >
            <option value="">{t('catalog.manualOption')}</option>
            {catalogGroups.map(([provider, items]) => (
              <optgroup key={provider} label={provider}>
                {items.map(item => (
                  <option
                    key={catalogItemKey(item)}
                    value={catalogItemKey(item)}
                  >
                    {item.name} · {item.externalModelId}
                    {catalogPriceSuffix(item, t)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>
      ) : null}
      {[
        ['name', modelName, true, setModelName],
        ['externalModelId', externalModelId, true, setExternalModelId],
        [
          'externalModelVersion',
          externalModelVersion,
          false,
          setExternalModelVersion,
        ],
      ].map(([name, value, required, setValue]) => {
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
              id={id}
              name={String(name)}
              onChange={event => {
                ;(setValue as (next: string) => void)(event.target.value)
                if (name !== 'name') {
                  setSelectedCatalogKey('')
                  setCapabilitySupport(null)
                  setDiscoveredCapabilities(null)
                  setCapabilityCheckCompleted(false)
                }
              }}
              required={Boolean(required)}
              value={String(value)}
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
      <fieldset
        aria-busy={capabilitiesLoading}
        className="rounded-2xl border border-secondary-200 p-4 dark:border-secondary-700"
        {...devMarker({
          context: 'AI model form',
          name: 'AI model capability assessment',
          priority: 430,
        })}
      >
        <legend className="px-1 text-sm font-semibold text-secondary-950 dark:text-secondary-50">
          {t('model.capabilities')}
        </legend>
        {capabilitiesLoading ? (
          <div
            aria-atomic="true"
            aria-live="polite"
            className="flex min-h-20 items-center gap-2 rounded-xl bg-secondary-50 px-3 py-4 text-sm text-secondary-600 dark:bg-secondary-950/50 dark:text-secondary-300"
            role="status"
          >
            <LoaderCircle
              aria-hidden="true"
              className="h-4 w-4 shrink-0 animate-spin"
            />
            <p>{t('model.capabilitiesLoading')}</p>
          </div>
        ) : null}
        {!capabilitiesLoading ? (
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <p className="max-w-2xl text-xs text-secondary-600 dark:text-secondary-300">
              {capabilitySupport
                ? t('model.capabilitiesManagedHelp')
                : t('model.capabilitiesHelp')}
            </p>
            <button
              className="btn-secondary px-3! py-2! text-sm"
              disabled={busy || checkingCapabilities || !externalModelId.trim()}
              onClick={() => void checkCapabilities()}
              type="button"
            >
              {checkingCapabilities ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="mr-2 inline h-4 w-4 animate-spin"
                />
              ) : null}
              {checkingCapabilities
                ? t('actions.checkingCapabilities')
                : t('actions.checkCapabilities')}
            </button>
          </div>
        ) : null}
        {!capabilitiesLoading && capabilityCheckCompleted ? (
          <p
            className="mb-3 flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300"
            role="status"
          >
            <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
            {t('model.capabilitiesCheckedInline')}
          </p>
        ) : null}
        {!capabilitiesLoading ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {CAPABILITIES.map(capability => {
              const id = `ai-model-capability-${capability}`
              const support = capabilitySupport?.[capability]
              const catalogManaged = selectedCatalogKey.length > 0
              const locked =
                checkingCapabilities ||
                (support !== undefined &&
                  (catalogManaged || support !== 'unknown'))
              const SupportIcon =
                support === 'supported'
                  ? CheckCircle2
                  : support === 'unsupported'
                    ? XCircle
                    : CircleHelp
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
                    checked={declaredCapabilities[capability]}
                    disabled={locked}
                    id={id}
                    name={`capability-${capability}`}
                    onChange={event =>
                      setDeclaredCapabilities(current => ({
                        ...current,
                        [capability]: event.target.checked,
                      }))
                    }
                    type="checkbox"
                  />
                  {support ? (
                    <span
                      className="ml-2 inline-flex items-center gap-1 text-xs text-secondary-600 dark:text-secondary-300"
                      role="status"
                    >
                      <SupportIcon aria-hidden="true" className="h-3.5 w-3.5" />
                      {t(`model.capabilitySupport.${support}`)}
                    </span>
                  ) : null}
                </div>
              )
            })}
          </div>
        ) : null}
      </fieldset>
      <DialogActions
        busy={busy}
        cancel={t('actions.cancel')}
        onCancel={onCancel}
        save={busy ? t('actions.saving') : t('actions.saveModel')}
        saveDisabled={capabilitiesLoading}
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
  modelRevisions: readonly ProfileModelRevision[]
  onCancel: () => void
  onSubmit: (value: SaveAiRunProfileRevision) => Promise<void>
  profile: AiAdminRunProfileRecord
}) {
  const t = useTranslations('admin.aiConnections')
  const current = profile.draftRevision
  const initialModelRevisionId = modelRevisions.some(
    ({ revision }) => revision.id === current?.modelRevisionId,
  )
    ? (current?.modelRevisionId ?? '')
    : ''
  const initialRevision = modelRevisions.find(
    ({ revision }) => revision.id === initialModelRevisionId,
  )?.revision
  const [modelRevisionId, setModelRevisionId] = useState(initialModelRevisionId)
  const [capabilityPolicy, setCapabilityPolicy] = useState(() =>
    normalizePolicyForRevision(
      profilePolicy(profile),
      profile.profileKey,
      initialRevision,
    ),
  )
  const selectedModelRevision = modelRevisions.find(
    ({ revision }) => revision.id === modelRevisionId,
  )?.revision
  const selectedModelIncompatible = selectedModelRevision
    ? missingRequiredProfileCapabilities(
        profile.profileKey,
        selectedModelRevision,
      ).length > 0
    : false

  function selectModelRevision(nextModelRevisionId: string): void {
    const revision = modelRevisions.find(
      candidate => candidate.revision.id === nextModelRevisionId,
    )?.revision
    setModelRevisionId(nextModelRevisionId)
    setCapabilityPolicy(currentPolicy =>
      normalizePolicyForRevision(currentPolicy, profile.profileKey, revision),
    )
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const submittedCapabilityPolicy = Object.fromEntries(
      POLICY_CAPABILITIES.map(capability => [
        capability,
        String(data.get(`policy-${capability}`)),
      ]),
    ) as unknown as AiCapabilityPolicy
    await onSubmit({
      capabilityPolicy: submittedCapabilityPolicy,
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
          id="ai-profile-modelRevisionId"
          name="modelRevisionId"
          onChange={event => selectModelRevision(event.target.value)}
          value={modelRevisionId}
        >
          <option value="">{t('profile.noModel')}</option>
          {modelRevisions.map(({ connection, model, revision }) => {
            const incompatible =
              missingRequiredProfileCapabilities(profile.profileKey, revision)
                .length > 0
            return (
              <option
                disabled={incompatible}
                key={revision.id}
                value={revision.id}
              >
                {connection.administrationName} · {model.name} ·{' '}
                {t('model.revision', { number: revision.revisionNumber })}
                {incompatible ? ` · ${t('profile.incompatibleModel')}` : ''}
              </option>
            )
          })}
        </select>
        {selectedModelIncompatible ? (
          <p
            className="mt-1 text-xs text-red-700 dark:text-red-300"
            role="status"
          >
            {t('profile.incompatibleModelHelp')}
          </p>
        ) : null}
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
      <fieldset
        className="rounded-2xl border border-secondary-200 p-4 dark:border-secondary-700"
        {...devMarker({
          context: 'AI run profile revision form',
          name: 'Verified model capability policy',
          priority: 320,
        })}
      >
        <legend className="px-1 text-sm font-semibold text-secondary-950 dark:text-secondary-50">
          {t('profile.capabilityPolicy')}
        </legend>
        <p className="mb-3 text-xs text-secondary-600 dark:text-secondary-300">
          {t('profile.capabilityPolicyHelp')}
        </p>
        {!selectedModelRevision ? (
          <p className="mb-3 text-xs text-amber-800 dark:text-amber-200">
            {t('profile.selectModelForCapabilities')}
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          {POLICY_CAPABILITIES.map(capability => {
            const id = `ai-profile-policy-${capability}`
            const lockedMode =
              LOCKED_PROFILE_POLICY[profile.profileKey][capability]
            const supported = selectedModelRevision
              ? supportsPolicyCapability(selectedModelRevision, capability)
              : false
            const unsupportedOptionalCapability =
              selectedModelRevision !== undefined &&
              lockedMode === undefined &&
              !supported
            const controlDisabled =
              selectedModelRevision === undefined ||
              lockedMode !== undefined ||
              unsupportedOptionalCapability
            return (
              <Field
                help={t(`policy.${capability}.help`)}
                id={id}
                key={capability}
                label={t(`policy.${capability}.label`)}
              >
                <select
                  className={inputClassName()}
                  disabled={controlDisabled}
                  id={id}
                  name={`policy-${capability}`}
                  onChange={event =>
                    setCapabilityPolicy(currentPolicy => ({
                      ...currentPolicy,
                      [capability]: event.target.value as PolicyMode,
                    }))
                  }
                  value={capabilityPolicy[capability]}
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
                {controlDisabled ? (
                  <input
                    name={`policy-${capability}`}
                    type="hidden"
                    value={capabilityPolicy[capability]}
                  />
                ) : null}
                {lockedMode !== undefined ? (
                  <p className="mt-1 text-xs text-secondary-500 dark:text-secondary-400">
                    {t('profile.lockedMinimum')}
                  </p>
                ) : unsupportedOptionalCapability ? (
                  <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">
                    {t('profile.unsupportedCapability')}
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
        saveDisabled={selectedModelIncompatible}
      />
    </form>
  )
}

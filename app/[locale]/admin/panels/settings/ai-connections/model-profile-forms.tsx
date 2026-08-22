'use client'

import {
  CheckCircle2,
  CircleHelp,
  Info,
  LoaderCircle,
  XCircle,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type {
  SaveAiModelRevision,
  SaveAiRunProfile,
} from '@/lib/ai/admin-contracts'
import type {
  AiAdminCandidateVerificationAttemptResult,
  AiAdminCatalogItem,
  AiAdminConnectionDetail,
  AiAdminModelRecord,
  AiAdminRunProfileRecord,
  AiAdminVerificationOutcome,
  AiAdminVerificationProgress,
} from '@/lib/ai/admin-service'
import { AI_CAPABILITY_KEYS } from '@/lib/ai/capability-keys'
import { AI_RUN_PROFILE_KEYS } from '@/lib/ai/profile-resolver'
import { devMarker } from '@/lib/developer-mode-markers'
import { apiFetch } from '@/lib/http/api-fetch'
import { readResponseMessage } from '@/lib/http/response-message'
import {
  DialogActions,
  Field,
  inputClassName,
  nullable,
  textareaClassName,
} from './form-controls'

type ModelFormProps = {
  catalog?: readonly AiAdminCatalogItem[]
  catalogStatus?: 'idle' | 'loaded' | 'loading' | 'unavailable'
  connection: AiAdminConnectionDetail
  model: AiAdminModelRecord | null
  onCancel(): void
  onComplete(): Promise<void> | void
  onRefreshCatalog?(): Promise<readonly AiAdminCatalogItem[] | null>
  onRegisterClose?(handler: (() => void) | null): void
}

type NumericInputValue = number | ''

type AdvancedBudgetDescriptor = readonly [
  key:
    | 'maximumBufferedEvents'
    | 'maximumOutputBytes'
    | 'maximumOutputTokens'
    | 'maximumRetainedMemoryBytes',
  value: NumericInputValue,
  setter: (value: NumericInputValue) => void,
  maximum: number,
]

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

function highestRevision(
  revisions: AiAdminModelRecord['revisions'],
): AiAdminModelRecord['revisions'][number] | undefined {
  let highest: AiAdminModelRecord['revisions'][number] | undefined
  for (const revision of revisions) {
    if (!highest || revision.revisionNumber > highest.revisionNumber) {
      highest = revision
    }
  }
  return highest
}

function setNumericInput(
  setter: (value: NumericInputValue) => void,
  value: number,
): void {
  setter(Number.isNaN(value) ? '' : value)
}

const outcomeKey: Record<AiAdminVerificationOutcome, string> = {
  inconclusive: 'inconclusive',
  not_checked: 'notChecked',
  not_verified: 'notVerified',
  verified: 'verified',
}

export function ModelForm({
  catalog = [],
  catalogStatus = 'idle',
  connection,
  model,
  onCancel,
  onComplete,
  onRefreshCatalog,
  onRegisterClose,
}: ModelFormProps) {
  const t = useTranslations('admin.aiConnections')
  const latest = model ? highestRevision(model.revisions) : undefined
  const [name, setName] = useState(model?.name ?? '')
  const [description, setDescription] = useState(model?.description ?? '')
  const [externalModelId, setExternalModelId] = useState(
    latest?.externalModelId ?? '',
  )
  const [externalModelVersion, setExternalModelVersion] = useState(
    latest?.externalModelVersion ?? '',
  )
  const [selectedCatalogKey, setSelectedCatalogKey] = useState('')
  const [progress, setProgress] = useState<AiAdminVerificationProgress[]>([])
  const [verification, setVerification] =
    useState<AiAdminCandidateVerificationAttemptResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const verificationAbort = useRef<AbortController | null>(null)
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

  const canVerify =
    !busy &&
    externalModelId.trim().length > 0 &&
    (connection.authenticationType === 'none' ||
      connection.activeSecret.available)

  const discardAttempt = useCallback(
    async (attemptId?: string | null): Promise<void> => {
      if (!attemptId) return
      await apiFetch(`/api/admin/ai-connections/${connection.id}/actions`, {
        body: JSON.stringify({
          action: 'discard_model_verification',
          attemptId,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
    },
    [connection.id],
  )

  const cancelAndClose = useCallback((): void => {
    verificationAbort.current?.abort()
    if (verification?.attemptId) void discardAttempt(verification.attemptId)
    onCancel()
  }, [discardAttempt, onCancel, verification?.attemptId])

  useEffect(() => {
    onRegisterClose?.(cancelAndClose)
    return () => onRegisterClose?.(null)
  }, [cancelAndClose, onRegisterClose])

  function technicalChange(update: () => void): void {
    const attemptId = verification?.attemptId
    update()
    setVerification(null)
    setProgress([])
    if (attemptId) void discardAttempt(attemptId)
  }

  function selectCatalogItem(key: string): void {
    setSelectedCatalogKey(key)
    if (!key) return
    const item = catalog.find(candidate => catalogItemKey(candidate) === key)
    if (!item) return
    technicalChange(() => {
      setName(item.name)
      setExternalModelId(item.externalModelId)
      setExternalModelVersion(item.externalModelVersion ?? '')
    })
  }

  async function verify(): Promise<void> {
    const abortController = new AbortController()
    verificationAbort.current = abortController
    setBusy(true)
    setError(null)
    setProgress([])
    setVerification(null)
    try {
      const response = await apiFetch(
        `/api/admin/ai-connections/${connection.id}/actions`,
        {
          body: JSON.stringify({
            action: 'verify_model_candidate',
            externalModelId: externalModelId.trim(),
            externalModelVersion: nullable(externalModelVersion),
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
          signal: AbortSignal.any([
            abortController.signal,
            AbortSignal.timeout(70_000),
          ]),
        },
      )
      if (!response.ok || !response.body) {
        throw new Error(
          (await readResponseMessage(response)) ?? t('mutationError'),
        )
      }
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const chunk = await reader.read()
        buffer += decoder.decode(chunk.value, { stream: !chunk.done })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line) continue
          const message = JSON.parse(line) as {
            error?: string
            progress?: AiAdminVerificationProgress
            result?: AiAdminCandidateVerificationAttemptResult
            type: string
          }
          if (message.progress) {
            setProgress(current => [
              ...current.filter(item => item.check !== message.progress?.check),
              message.progress as AiAdminVerificationProgress,
            ])
          }
          if (message.result) setVerification(message.result)
          if (message.error) throw new Error(message.error)
        }
        if (chunk.done) break
      }
    } catch (cause) {
      if (!abortController.signal.aborted) {
        setError(cause instanceof Error ? cause.message : t('mutationError'))
      }
    } finally {
      if (verificationAbort.current === abortController) {
        verificationAbort.current = null
      }
      setBusy(false)
    }
  }

  async function save(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (!verification?.attemptId || !verification.saveable) return
    setBusy(true)
    setError(null)
    const modelRevision: SaveAiModelRevision = {
      attemptId: verification.attemptId,
      description: nullable(description),
      externalModelId: externalModelId.trim(),
      externalModelVersion: nullable(externalModelVersion),
      modelId: model?.id ?? null,
      modelToken: model?.revisionToken ?? null,
      name: name.trim(),
    }
    try {
      const response = await apiFetch(
        `/api/admin/ai-connections/${connection.id}/actions`,
        {
          body: JSON.stringify({
            action: 'save_model_revision',
            modelRevision,
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        },
      )
      if (!response.ok) {
        throw new Error(
          (await readResponseMessage(response)) ?? t('mutationError'),
        )
      }
      await onComplete()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('mutationError'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="space-y-5" onSubmit={save}>
      <div
        aria-atomic="true"
        className="flex items-start justify-between gap-3 rounded-2xl border border-secondary-200 bg-secondary-50 p-4 text-sm text-secondary-700 dark:border-secondary-700 dark:bg-secondary-950/50 dark:text-secondary-200"
        role="status"
      >
        <span className="flex min-w-0 items-start gap-2">
          {catalogStatus === 'loading' ? (
            <LoaderCircle
              aria-hidden="true"
              className="mt-0.5 h-4 w-4 shrink-0 animate-spin"
            />
          ) : (
            <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>
            {catalogStatus === 'loading'
              ? t('catalog.loading')
              : catalogStatus === 'loaded' && catalog.length > 0
                ? t('catalog.selectionReady')
                : catalogStatus === 'unavailable'
                  ? t('catalog.unavailableManual')
                  : t('catalog.selectionIntro')}
          </span>
        </span>
        {onRefreshCatalog ? (
          <button
            className="btn-secondary shrink-0 px-3! py-1.5! text-xs"
            disabled={busy || catalogStatus === 'loading'}
            onClick={() => void onRefreshCatalog()}
            type="button"
          >
            {t('actions.fetchCatalog')}
          </button>
        ) : null}
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
      <Field
        help={t('fields.name.help')}
        id="ai-model-name"
        label={t('fields.name.label')}
        required
      >
        <input
          className={inputClassName()}
          id="ai-model-name"
          maxLength={300}
          onChange={event => setName(event.target.value)}
          required
          value={name}
        />
      </Field>
      <Field
        help={t('fields.externalModelId.help')}
        id="ai-model-external-id"
        label={t('fields.externalModelId.label')}
        required
      >
        <input
          className={inputClassName()}
          id="ai-model-external-id"
          maxLength={450}
          onChange={event => {
            setSelectedCatalogKey('')
            technicalChange(() => setExternalModelId(event.target.value))
          }}
          required
          value={externalModelId}
        />
      </Field>
      <Field
        help={t('fields.externalModelVersion.help')}
        id="ai-model-external-version"
        label={t('fields.externalModelVersion.label')}
      >
        <input
          className={inputClassName()}
          id="ai-model-external-version"
          maxLength={200}
          onChange={event => {
            setSelectedCatalogKey('')
            technicalChange(() => setExternalModelVersion(event.target.value))
          }}
          value={externalModelVersion}
        />
      </Field>
      <Field
        help={t('fields.modelDescription.help')}
        id="ai-model-description"
        label={t('fields.modelDescription.label')}
      >
        <textarea
          className={textareaClassName()}
          id="ai-model-description"
          maxLength={20_000}
          onChange={event => setDescription(event.target.value)}
          value={description}
        />
      </Field>

      {!connection.activeSecret.available &&
      connection.authenticationType !== 'none' ? (
        <p className="text-sm text-amber-800 dark:text-amber-200">
          {t('modelVerification.missingSecret')}
        </p>
      ) : null}

      <fieldset
        className="rounded-2xl border border-secondary-200 p-4 dark:border-secondary-700"
        {...devMarker({
          context: 'AI model form',
          name: 'AI model capability assessment',
          priority: 430,
        })}
      >
        <legend className="px-1 text-sm font-semibold text-secondary-950 dark:text-secondary-50">
          {t('modelVerification.capabilities')}
        </legend>
        <p className="mb-3 text-xs leading-5 text-secondary-600 dark:text-secondary-300">
          {t('modelVerification.capabilitiesHelp')}
        </p>
        <dl className="grid gap-2 sm:grid-cols-2">
          {AI_CAPABILITY_KEYS.map(capability => {
            const outcome =
              verification?.capabilities[capability].outcome ?? 'not_checked'
            const failureCategory =
              verification?.capabilities[capability].failureCategory
            const OutcomeIcon =
              outcome === 'verified'
                ? CheckCircle2
                : outcome === 'not_verified'
                  ? XCircle
                  : CircleHelp
            return (
              <div
                className="min-h-14 rounded-xl bg-secondary-50 px-3 py-2 dark:bg-secondary-950/50"
                key={capability}
              >
                <dt className="text-sm font-medium text-secondary-900 dark:text-secondary-100">
                  {t(`capabilities.${capability}`)}
                </dt>
                <dd className="mt-1 flex items-start gap-1.5 text-xs text-secondary-600 dark:text-secondary-300">
                  <OutcomeIcon
                    aria-hidden="true"
                    className="mt-0.5 h-3.5 w-3.5 shrink-0"
                  />
                  <span>
                    {t(`modelVerification.outcomes.${outcomeKey[outcome]}`)}
                    {outcome === 'inconclusive' && failureCategory
                      ? ` — ${t(`modelVerification.failureCategories.${failureCategory}`)}`
                      : ''}
                    {verification?.capabilities[capability].diagnosticCode
                      ? ` — ${t('modelVerification.technicalCode', {
                          code: verification.capabilities[capability]
                            .diagnosticCode,
                        })}`
                      : ''}
                  </span>
                </dd>
              </div>
            )
          })}
        </dl>
      </fieldset>

      {busy || progress.length > 0 ? (
        <fieldset
          aria-busy={busy}
          aria-label={t('modelVerification.progress')}
          aria-live="polite"
          className="rounded-2xl border border-primary-200 bg-primary-50/50 p-4 dark:border-primary-900 dark:bg-primary-950/20"
        >
          <ul className="space-y-1 text-sm">
            {progress.map(item => {
              const failureCategory = item.failureCategory
              return (
                <li
                  aria-current={item.state === 'running' ? 'step' : undefined}
                  key={item.check}
                >
                  {item.state === 'running' ? (
                    <LoaderCircle
                      aria-hidden="true"
                      className="mr-1 inline h-4 w-4 animate-spin"
                    />
                  ) : null}
                  {t(
                    `modelVerification.checks.${item.check.replace(':', '.')}`,
                  )}
                  {item.state === 'completed'
                    ? ` — ${t(`modelVerification.outcomes.${outcomeKey[item.outcome]}`)}`
                    : ''}
                  {failureCategory
                    ? ` — ${t(`modelVerification.failureCategories.${failureCategory}`)}`
                    : ''}
                  {item.diagnosticCode
                    ? ` — ${t('modelVerification.technicalCode', {
                        code: item.diagnosticCode,
                      })}`
                    : ''}
                </li>
              )
            })}
          </ul>
        </fieldset>
      ) : null}

      {verification ? (
        <section
          aria-live="polite"
          className="space-y-2 rounded-2xl border border-secondary-200 p-4 dark:border-secondary-700"
          role="status"
        >
          <h3 className="font-semibold">
            {t('modelVerification.compatibility')}
          </h3>
          <dl className="space-y-1 text-sm">
            {[
              ['connection', verification.connection],
              ['baseline', verification.baseline],
            ].map(([key, assessment]) => {
              if (typeof key !== 'string' || typeof assessment === 'string')
                return null
              return (
                <div key={key}>
                  <dt className="inline font-medium">
                    {t(`modelVerification.resultLabels.${key}`)}:{' '}
                  </dt>
                  <dd className="inline">
                    {t(
                      `modelVerification.outcomes.${outcomeKey[assessment.outcome]}`,
                    )}
                    {assessment.failureCategory
                      ? ` — ${t(`modelVerification.failureCategories.${assessment.failureCategory}`)}`
                      : ''}
                    {assessment.diagnosticCode
                      ? ` — ${t('modelVerification.technicalCode', {
                          code: assessment.diagnosticCode,
                        })}`
                      : ''}
                  </dd>
                </div>
              )
            })}
          </dl>
          <ul className="space-y-1 text-sm">
            {AI_RUN_PROFILE_KEYS.map(key => {
              const result = verification.profileCompatibility[key]
              const profileOutcome =
                result.outcome ??
                (result.supported ? 'verified' : 'not_verified')
              return (
                <li key={key}>
                  {t(`profiles.${key}`)}:{' '}
                  {profileOutcome === 'not_checked'
                    ? t('modelVerification.outcomes.notChecked')
                    : result.supported
                      ? t('modelVerification.supported')
                      : t('modelVerification.unsupported', {
                          capabilities: result.missingCapabilities
                            .map(capability => t(`capabilities.${capability}`))
                            .join(', '),
                        })}
                  {!result.supported && result.failureCategory
                    ? ` — ${t(`modelVerification.failureCategories.${result.failureCategory}`)}`
                    : ''}
                  {result.diagnosticCode
                    ? ` — ${t('modelVerification.technicalCode', {
                        code: result.diagnosticCode,
                      })}`
                    : ''}
                </li>
              )
            })}
          </ul>
          <p className="font-medium">
            {verification.saveable
              ? t('modelVerification.saveable')
              : t('modelVerification.notSaveable')}
          </p>
        </section>
      ) : null}

      {error ? (
        <p className="text-sm text-red-700 dark:text-red-300" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          className="btn-secondary inline-flex min-h-10 items-center gap-2 px-4! py-2! text-sm"
          disabled={!busy && !canVerify}
          onClick={() => {
            if (busy) verificationAbort.current?.abort()
            else void verify()
          }}
          type="button"
        >
          {busy
            ? t('modelVerification.cancelVerification')
            : t('modelVerification.verify')}
        </button>
      </div>
      <DialogActions
        busy={busy}
        cancel={t('actions.cancel')}
        onCancel={cancelAndClose}
        save={t('modelVerification.saveRevision')}
        saveDisabled={!verification?.saveable}
      />
    </form>
  )
}

type ProfileFormProps = {
  connections: readonly AiAdminConnectionDetail[]
  onCancel(): void
  onComplete(): Promise<void> | void
  profile: AiAdminRunProfileRecord
}

export function ProfileForm({
  connections,
  onCancel,
  onComplete,
  profile,
}: ProfileFormProps) {
  const t = useTranslations('admin.aiConnections')
  const choices = useMemo(
    () =>
      connections.flatMap(connection =>
        connection.models.flatMap(model =>
          model.revisions.map(revision => ({
            connection,
            label: `${connection.publicName} · ${model.name} · ${revision.revisionNumber}`,
            model,
            revision,
          })),
        ),
      ),
    [connections],
  )
  const [modelRevisionId, setModelRevisionId] = useState(
    profile.modelRevisionId ?? '',
  )
  const [total, setTotal] = useState<NumericInputValue>(
    profile.totalTimeBudgetSeconds,
  )
  const [inactivity, setInactivity] = useState<NumericInputValue>(
    profile.inactivityTimeBudgetSeconds,
  )
  const [queue, setQueue] = useState<NumericInputValue>(profile.queueCapacity)
  const [outputTokens, setOutputTokens] = useState<NumericInputValue>(
    profile.maximumOutputTokens,
  )
  const [outputBytes, setOutputBytes] = useState<NumericInputValue>(
    profile.maximumOutputBytes,
  )
  const [memoryBytes, setMemoryBytes] = useState<NumericInputValue>(
    profile.maximumRetainedMemoryBytes,
  )
  const [events, setEvents] = useState<NumericInputValue>(
    profile.maximumBufferedEvents,
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const usable = useCallback(
    (choice: (typeof choices)[number]): boolean =>
      choice.revision.status === 'verified' &&
      choice.connection.lifecycleStatus === 'active' &&
      choice.connection.blockers.length === 0 &&
      choice.revision.connectionConfigurationVersion ===
        choice.connection.configurationVersion &&
      choice.revision.profileCompatibility?.[profile.profileKey]?.supported ===
        true,
    [profile.profileKey],
  )

  const newestSelectableByModel = useMemo(() => {
    const result = new Set<string>()
    for (const model of connections.flatMap(connection => connection.models)) {
      let newest: (typeof model.revisions)[number] | undefined
      for (const revision of model.revisions) {
        const owner = choices.find(choice => choice.revision.id === revision.id)
        if (
          owner &&
          usable(owner) &&
          (!newest || revision.revisionNumber > newest.revisionNumber)
        ) {
          newest = revision
        }
      }
      if (newest) result.add(newest.id)
    }
    return result
  }, [choices, connections, usable])

  function unusableReason(choice: (typeof choices)[number]): string {
    if (choice.revision.status === 'ended') {
      return t('directProfile.reasons.ended')
    }
    if (choice.revision.status === 'new_revision_required') {
      return t('directProfile.reasons.newRevisionRequired')
    }
    if (choice.connection.lifecycleStatus !== 'active') {
      return t('directProfile.reasons.connectionUnavailable')
    }
    if (choice.connection.blockers.length > 0) {
      return choice.connection.blockers
        .map(blocker => t(`blockers.${blocker.code}`))
        .join(' ')
    }
    if (
      choice.revision.connectionConfigurationVersion !==
      choice.connection.configurationVersion
    ) {
      return t('directProfile.reasons.newRevisionRequired')
    }
    const missing =
      choice.revision.profileCompatibility?.[profile.profileKey]
        ?.missingCapabilities ?? []
    if (missing.length > 0) {
      return t('directProfile.reasons.missingCapabilities', {
        capabilities: missing
          .map(capability => t(`capabilities.${capability}`))
          .join(', '),
      })
    }
    return t('directProfile.reasons.incompatible')
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (
      total === '' ||
      inactivity === '' ||
      queue === '' ||
      outputTokens === '' ||
      outputBytes === '' ||
      memoryBytes === '' ||
      events === ''
    ) {
      return
    }
    setBusy(true)
    setError(null)
    const value: SaveAiRunProfile = {
      inactivityTimeBudgetSeconds: inactivity,
      maximumBufferedEvents: events,
      maximumOutputBytes: outputBytes,
      maximumOutputTokens: outputTokens,
      maximumRetainedMemoryBytes: memoryBytes,
      modelRevisionId: modelRevisionId || null,
      queueCapacity: queue,
      revisionToken: profile.revisionToken,
      totalTimeBudgetSeconds: total,
    }
    try {
      const response = await apiFetch(
        `/api/admin/ai-run-profiles/${profile.profileKey}`,
        {
          body: JSON.stringify(value),
          headers: { 'Content-Type': 'application/json' },
          method: 'PATCH',
        },
      )
      if (!response.ok)
        throw new Error(
          (await readResponseMessage(response)) ?? t('mutationError'),
        )
      await onComplete()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('mutationError'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="space-y-5" onSubmit={submit}>
      {profile.administrativeStatus === 'active' ? (
        <p className="rounded-xl border border-primary-200 bg-primary-50 p-3 text-sm text-primary-900 dark:border-primary-800 dark:bg-primary-950/40 dark:text-primary-100">
          {t('directProfile.activeChangeNotice')}
        </p>
      ) : null}
      <Field
        help={t('fields.modelRevisionId.help')}
        id="ai-profile-model"
        label={t('directProfile.model')}
      >
        <select
          className={inputClassName()}
          id="ai-profile-model"
          onChange={event => setModelRevisionId(event.target.value)}
          value={modelRevisionId}
        >
          <option value="">{t('directProfile.noModel')}</option>
          {choices.map(choice => (
            <option
              disabled={!usable(choice)}
              key={choice.revision.id}
              value={choice.revision.id}
            >
              {choice.label}
              {usable(choice) && newestSelectableByModel.has(choice.revision.id)
                ? ` — ${t('directProfile.recommended')}`
                : usable(choice)
                  ? ''
                  : ` — ${unusableReason(choice)}`}
            </option>
          ))}
        </select>
      </Field>
      {modelRevisionId ? (
        <button
          className="rounded border border-secondary-300 px-3 py-2 text-sm font-semibold dark:border-secondary-600"
          onClick={() => setModelRevisionId('')}
          type="button"
        >
          {t('directProfile.disconnect')}
        </button>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          help={t('fields.totalTimeBudgetSeconds.help')}
          id="ai-profile-total"
          label={t('fields.totalTimeBudgetSeconds.label')}
        >
          <input
            className={inputClassName()}
            id="ai-profile-total"
            max={3600}
            min={300}
            onChange={event =>
              setNumericInput(setTotal, event.target.valueAsNumber)
            }
            required
            type="number"
            value={total}
          />
        </Field>
        <Field
          help={t('fields.inactivityTimeBudgetSeconds.help')}
          id="ai-profile-inactivity"
          label={t('fields.inactivityTimeBudgetSeconds.label')}
        >
          <input
            className={inputClassName()}
            id="ai-profile-inactivity"
            max={3600}
            min={300}
            onChange={event =>
              setNumericInput(setInactivity, event.target.valueAsNumber)
            }
            required
            type="number"
            value={inactivity}
          />
        </Field>
        <Field
          help={t('fields.queueCapacity.help')}
          id="ai-profile-queue"
          label={t('fields.queueCapacity.label')}
        >
          <input
            className={inputClassName()}
            id="ai-profile-queue"
            max={100}
            min={0}
            onChange={event =>
              setNumericInput(setQueue, event.target.valueAsNumber)
            }
            required
            type="number"
            value={queue}
          />
        </Field>
      </div>
      <details>
        <summary className="cursor-pointer font-semibold">
          {t('directProfile.advanced')}
        </summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {(
            [
              ['maximumOutputTokens', outputTokens, setOutputTokens, 1_000_000],
              ['maximumOutputBytes', outputBytes, setOutputBytes, 67_108_864],
              [
                'maximumRetainedMemoryBytes',
                memoryBytes,
                setMemoryBytes,
                134_217_728,
              ],
              ['maximumBufferedEvents', events, setEvents, 1024],
            ] satisfies readonly AdvancedBudgetDescriptor[]
          ).map(([key, value, setter, maximum]) => (
            <Field
              help={t(`directProfile.fields.${key}.help`)}
              id={`ai-profile-${key}`}
              key={key}
              label={t(`directProfile.fields.${key}.label`)}
            >
              <input
                className={inputClassName()}
                id={`ai-profile-${key}`}
                max={maximum}
                min={1}
                onChange={event =>
                  setNumericInput(setter, event.target.valueAsNumber)
                }
                required
                type="number"
                value={value}
              />
            </Field>
          ))}
        </div>
      </details>
      {error ? (
        <p className="text-sm text-red-700 dark:text-red-300" role="alert">
          {error}
        </p>
      ) : null}
      <DialogActions
        busy={busy}
        cancel={t('actions.cancel')}
        onCancel={onCancel}
        save={t('actions.save')}
        saveDisabled={
          total === '' ||
          inactivity === '' ||
          queue === '' ||
          outputTokens === '' ||
          outputBytes === '' ||
          memoryBytes === '' ||
          events === ''
        }
      />
    </form>
  )
}

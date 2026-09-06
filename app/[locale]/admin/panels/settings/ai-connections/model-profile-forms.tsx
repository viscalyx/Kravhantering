'use client'

import { Info, LoaderCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useConfirmModal } from '@/components/ConfirmModal'
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
  AiAdminVerificationProgress,
} from '@/lib/ai/admin-service'
import type { AiReasoningConfiguration } from '@/lib/ai/reasoning'
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

import {
  ModelVerificationPanel,
  type VerificationPhase,
} from './model-verification-panel'

type ModelFormProps = {
  catalog?: readonly AiAdminCatalogItem[]
  catalogStatus?: 'idle' | 'loaded' | 'loading' | 'unavailable'
  connection: AiAdminConnectionDetail
  model: AiAdminModelRecord | null
  pending?: NonNullable<AiAdminConnectionDetail['pendingVerifications']>[number]
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

export function ModelForm({
  catalog = [],
  catalogStatus = 'idle',
  connection,
  model,
  pending,
  onCancel,
  onComplete,
  onRefreshCatalog,
  onRegisterClose,
}: ModelFormProps) {
  const t = useTranslations('admin.aiConnections')
  const { confirm } = useConfirmModal()
  const snapshot = pending?.result.candidate
  const latest = model ? highestRevision(model.revisions) : undefined
  const [name, setName] = useState(snapshot?.name ?? model?.name ?? '')
  const [description, setDescription] = useState(
    snapshot?.description ?? model?.description ?? '',
  )
  const [externalModelId, setExternalModelId] = useState(
    snapshot?.externalModelId ?? latest?.externalModelId ?? '',
  )
  const [externalModelVersion, setExternalModelVersion] = useState(
    snapshot
      ? (snapshot.externalModelVersion ?? '')
      : (latest?.externalModelVersion ?? ''),
  )
  const [reasoning, setReasoning] = useState<AiReasoningConfiguration>(
    pending?.result.verification.reasoning ??
      snapshot?.reasoning ??
      latest?.reasoning ?? { mode: 'explicit_control', effort: 'high' },
  )
  const [selectedCatalogKey, setSelectedCatalogKey] = useState('')
  const [phase, setPhase] = useState<VerificationPhase>(
    pending ? 'completed' : 'idle',
  )
  const [progress, setProgress] = useState<AiAdminVerificationProgress[]>([])
  const [verification, setVerification] =
    useState<AiAdminCandidateVerificationAttemptResult | null>(
      pending
        ? {
            ...pending.result.verification,
            attemptId: pending.id,
            attemptExpiresAt: pending.expiresAt,
          }
        : null,
    )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const remainingSeconds = verification?.attemptExpiresAt
    ? Math.max(
        0,
        Math.ceil((Date.parse(verification.attemptExpiresAt) - now) / 1000),
      )
    : 0
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

  const verifyDisabledReason = busy
    ? t('pending.busy')
    : !externalModelId.trim()
      ? t('modelVerification.enterModelId')
      : connection.authenticationType !== 'none' &&
          !connection.activeSecret.available
        ? t('modelVerification.missingSecret')
        : undefined

  async function discardAttempt(anchorEl: HTMLElement): Promise<void> {
    const attemptId = verification?.attemptId
    if (
      !attemptId ||
      !(await confirm({
        anchorEl,
        title: t('pending.discard'),
        message: t('pending.discardConfirm'),
        confirmText: t('pending.discard'),
        variant: 'danger',
        icon: 'caution',
      }))
    )
      return
    setBusy(true)
    setError(null)
    try {
      const response = await apiFetch(
        `/api/admin/ai-connections/${connection.id}/actions`,
        {
          body: JSON.stringify({
            action: 'discard_model_verification',
            attemptId,
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        },
      )
      if (!response.ok) throw new Error('discard_failed')
      setVerification(null)
      onCancel()
    } catch {
      setError(t('mutationError'))
    } finally {
      setBusy(false)
    }
  }

  const cancelAndClose = useCallback((): void => {
    verificationAbort.current?.abort()
    onCancel()
  }, [onCancel])

  useEffect(() => {
    onRegisterClose?.(cancelAndClose)
    return () => onRegisterClose?.(null)
  }, [cancelAndClose, onRegisterClose])

  function technicalChange(update: () => void): void {
    cancelVerification()
    update()
    setVerification(null)
    setProgress([])
    setPhase('idle')
    setError(null)
  }

  function cancelVerification(): void {
    const controller = verificationAbort.current
    if (!controller) return
    verificationAbort.current = null
    controller.abort()
    setPhase('cancelled')
    setVerification(null)
    setBusy(false)
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
      setReasoning(
        item.capabilitySupport?.reasoningControl === 'unsupported'
          ? { mode: 'model_default', effort: null }
          : { mode: 'explicit_control', effort: 'high' },
      )
    })
  }

  async function verify(): Promise<void> {
    const abortController = new AbortController()
    verificationAbort.current = abortController
    setBusy(true)
    setPhase('running')
    setError(null)
    setProgress([])
    setVerification(null)
    let result: AiAdminCandidateVerificationAttemptResult | null = null
    try {
      const response = await apiFetch(
        `/api/admin/ai-connections/${connection.id}/actions`,
        {
          body: JSON.stringify({
            action: 'verify_model_candidate',
            name: name.trim(),
            description: nullable(description),
            modelId: snapshot?.modelId ?? model?.id ?? null,
            modelToken: snapshot?.modelToken ?? model?.revisionToken ?? null,
            reasoning,
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
        if (abortController.signal.aborted) {
          await reader.cancel()
          return
        }
        buffer += decoder.decode(chunk.value, { stream: !chunk.done })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        if (chunk.done && buffer) lines.push(buffer)
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
          if (message.result) {
            result = message.result
          }
          if (message.error) throw new Error(message.error)
        }
        if (chunk.done) {
          if (!result) {
            setPhase('failed')
            setError(t('modelVerification.incompleteStream'))
            return
          }
          setReasoning(result.reasoning ?? reasoning)
          setVerification(result)
          setPhase('completed')
          break
        }
      }
    } catch {
      if (
        verificationAbort.current === abortController &&
        !abortController.signal.aborted
      ) {
        setPhase('failed')
        setError(t('mutationError'))
      }
    } finally {
      if (verificationAbort.current === abortController) {
        verificationAbort.current = null
        setBusy(false)
      }
    }
  }

  async function save(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (
      !verification?.attemptId ||
      !verification.saveable ||
      remainingSeconds === 0
    )
      return
    setBusy(true)
    setError(null)
    const modelRevision: SaveAiModelRevision = {
      attemptId: verification.attemptId,
      reasoning,
      description: nullable(description),
      externalModelId: externalModelId.trim(),
      externalModelVersion: nullable(externalModelVersion),
      modelId: snapshot ? snapshot.modelId : (model?.id ?? null),
      modelToken: snapshot
        ? snapshot.modelToken
        : (model?.revisionToken ?? null),
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
        const body: unknown = await response.json().catch(() => null)
        const blocker =
          typeof body === 'object' &&
          body !== null &&
          'details' in body &&
          typeof body.details === 'object' &&
          body.details !== null &&
          'blocker' in body.details
            ? body.details.blocker
            : null
        if (blocker === 'attempt_expired' || blocker === 'attempt_mismatch') {
          setVerification(null)
          setProgress([])
          setPhase('idle')
        }
        setError(
          blocker === 'attempt_expired'
            ? t('pending.expired')
            : blocker === 'attempt_mismatch'
              ? t('pending.configurationChanged')
              : response.status >= 500 || blocker === 'attempt_unavailable'
                ? t('pending.saveUncertain')
                : t('mutationError'),
        )
        return
      }
      await onComplete()
    } catch {
      setError(t('pending.saveUncertain'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:grid-rows-[auto_1fr]"
      onSubmit={save}
      {...devMarker({
        context: 'AI model form',
        name: 'AI model form layout',
        priority: 420,
      })}
    >
      <div
        className="min-w-0 space-y-5"
        {...devMarker({
          context: 'AI model form',
          name: 'AI model fields',
          priority: 420,
        })}
      >
        <div
          aria-atomic="true"
          className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-secondary-200 bg-secondary-50 p-4 text-sm text-secondary-700 dark:border-secondary-700 dark:bg-secondary-950/50 dark:text-secondary-200"
          role="status"
        >
          <span className="flex w-full min-w-0 items-start gap-2 sm:w-auto sm:flex-1">
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
              technicalChange(() => {
                setExternalModelId(event.target.value)
                setReasoning({ mode: 'explicit_control', effort: 'high' })
              })
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
              technicalChange(() => {
                setExternalModelVersion(event.target.value)
                setReasoning({ mode: 'explicit_control', effort: 'high' })
              })
            }}
            value={externalModelVersion}
          />
        </Field>
        {reasoning.mode === 'explicit_control' ? (
          <Field
            help={t('fields.reasoningEffort.help')}
            id="ai-model-reasoning-effort"
            label={t('fields.reasoningEffort.label')}
          >
            <select
              className={inputClassName()}
              id="ai-model-reasoning-effort"
              value={reasoning.effort}
              {...devMarker({
                context: 'AI model form',
                name: 'AI model reasoning effort',
                priority: 430,
              })}
              onChange={event =>
                technicalChange(() =>
                  setReasoning({
                    mode: 'explicit_control',
                    effort: event.target.value as 'low' | 'medium' | 'high',
                  }),
                )
              }
            >
              {(['low', 'medium', 'high'] as const).map(effort => (
                <option key={effort} value={effort}>
                  {t(`reasoning.${effort}`)}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <p
            {...devMarker({
              context: 'AI model form',
              name: 'AI model default reasoning',
              priority: 430,
            })}
          >
            {t('reasoning.modelDefault')}
          </p>
        )}
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
      </div>
      <div className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1">
        <ModelVerificationPanel
          onCancel={cancelVerification}
          onVerify={() => void verify()}
          phase={phase}
          progress={progress}
          remainingSeconds={remainingSeconds}
          verification={verification}
          verifyDisabledReason={verifyDisabledReason}
        />
      </div>
      <div
        className="min-w-0 space-y-3 border-t border-secondary-200 pt-4 lg:col-start-1 lg:row-start-2 dark:border-secondary-700"
        {...devMarker({
          context: 'AI model form',
          name: 'AI model form actions',
          priority: 420,
        })}
      >
        {error ? (
          <p className="text-sm text-red-700 dark:text-red-300" role="alert">
            {error}
          </p>
        ) : null}
        {verification?.attemptId ? (
          <button
            {...devMarker({
              name: 'Discard shared AI verification',
              context: 'AI model form',
            })}
            className="btn-secondary min-h-9 px-3! py-1.5! text-sm"
            disabled={busy}
            onClick={event => void discardAttempt(event.currentTarget)}
            title={busy ? t('pending.busy') : undefined}
            type="button"
          >
            {busy ? t('pending.busy') : t('pending.discard')}
          </button>
        ) : null}
        <DialogActions
          busy={busy}
          cancel={t('actions.cancel')}
          onCancel={cancelAndClose}
          save={t('modelVerification.saveRevision')}
          saveDisabled={!verification?.saveable || remainingSeconds === 0}
        />
      </div>
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

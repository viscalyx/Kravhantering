'use client'

import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleOff,
  Clock3,
  ExternalLink,
  FileJson2,
  Image,
  Link2,
  LockKeyhole,
  Network,
  Plus,
  RefreshCw,
  Route,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Wrench,
  XCircle,
} from 'lucide-react'
import type { Route as NextRoute } from 'next'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Fragment, type ReactNode, useEffect, useState } from 'react'
import { devMarker } from '@/lib/developer-mode-markers'

// Three variants of AI connection administration, switchable via ?variant=,
// inside the existing Admin Center settings surface. PROTOTYPE — throw away.

type Scenario = 'gaps' | 'outage' | 'ready'
type Variant = 'A' | 'B' | 'C' | 'D'
type Tone = 'danger' | 'neutral' | 'success' | 'warning'

interface PrototypeProps {
  onSettingsSettled?: () => void
}

interface StatusBadgeProps {
  children: ReactNode
  icon?: 'blocked' | 'check' | 'clock' | 'warning'
  tone: Tone
}

interface VariantProps {
  addModelOpen: boolean
  addOpen: boolean
  draftCreated: boolean
  modelDraftCreated: boolean
  onAddConnection: () => void
  onAddModel: () => void
  onCancelAdd: () => void
  onCancelAddModel: () => void
  onCreateDraft: () => void
  onCreateModelDraft: () => void
  scenario: Scenario
  setScenario: (scenario: Scenario) => void
}

interface EditTarget {
  kind: 'connection' | 'model'
  name: string
}

const VARIANTS: readonly Variant[] = ['A', 'B', 'C', 'D']

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

function StatusBadge({ children, icon = 'check', tone }: StatusBadgeProps) {
  const Icon =
    icon === 'blocked'
      ? CircleOff
      : icon === 'clock'
        ? Clock3
        : icon === 'warning'
          ? TriangleAlert
          : CheckCircle2

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

function ScenarioPicker({
  scenario,
  setScenario,
}: {
  scenario: Scenario
  setScenario: (scenario: Scenario) => void
}) {
  const t = useTranslations('admin.aiConnectionsPrototype')

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-secondary-500 dark:text-secondary-400">
        {t('scenario.label')}
      </span>
      {(['ready', 'gaps', 'outage'] as const).map(value => (
        <button
          aria-pressed={scenario === value}
          className={`min-h-9 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 ${
            scenario === value
              ? 'border-primary-700 bg-primary-700 text-white dark:border-primary-300 dark:bg-primary-300 dark:text-secondary-950'
              : 'border-secondary-300 bg-white text-secondary-700 hover:bg-secondary-100 dark:border-secondary-700 dark:bg-secondary-900 dark:text-secondary-200 dark:hover:bg-secondary-800'
          }`}
          key={value}
          onClick={() => setScenario(value)}
          type="button"
        >
          {t(`scenario.${value}`)}
        </button>
      ))}
    </div>
  )
}

function PrototypeHeader({
  scenario,
  setScenario,
}: Pick<VariantProps, 'scenario' | 'setScenario'>) {
  const t = useTranslations('admin.aiConnectionsPrototype')

  return (
    <header className="border-b border-secondary-200/80 pb-5 dark:border-secondary-700/70">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary-700 dark:text-primary-300">
            {t('prototypeLabel')}
          </p>
          <h3 className="mt-2 text-2xl font-semibold text-secondary-950 dark:text-secondary-50">
            {t('title')}
          </h3>
          <p className="mt-2 text-sm leading-6 text-secondary-600 dark:text-secondary-300">
            {t('description')}
          </p>
        </div>
        <StatusBadge icon="warning" tone="warning">
          {t('noPersistence')}
        </StatusBadge>
      </div>
      <div className="mt-5">
        <ScenarioPicker scenario={scenario} setScenario={setScenario} />
      </div>
    </header>
  )
}

function TrustBoundary() {
  const t = useTranslations('admin.aiConnectionsPrototype')

  return (
    <aside className="rounded-3xl border border-primary-200 bg-primary-50/70 p-4 dark:border-primary-900 dark:bg-primary-950/30">
      <div className="flex items-start gap-3">
        <ShieldCheck
          aria-hidden="true"
          className="mt-0.5 h-5 w-5 shrink-0 text-primary-700 dark:text-primary-300"
        />
        <div>
          <h4 className="font-semibold text-secondary-950 dark:text-secondary-50">
            {t('trust.title')}
          </h4>
          <p className="mt-1 text-sm leading-6 text-secondary-700 dark:text-secondary-200">
            {t('trust.description')}
          </p>
          <ul className="mt-3 space-y-2 text-sm text-secondary-700 dark:text-secondary-200">
            <li className="flex gap-2">
              <LockKeyhole
                aria-hidden="true"
                className="mt-0.5 h-4 w-4 shrink-0"
              />
              {t('trust.secret')}
            </li>
            <li className="flex gap-2">
              <Network aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              {t('trust.egress')}
            </li>
          </ul>
        </div>
      </div>
    </aside>
  )
}

function CapabilityChips({
  imageRequired = false,
}: {
  imageRequired?: boolean
}) {
  const t = useTranslations('admin.aiConnectionsPrototype')
  return (
    <div className="flex flex-wrap gap-1.5">
      <StatusBadge tone="neutral">{t('capabilities.json')}</StatusBadge>
      <StatusBadge tone="neutral">{t('capabilities.streaming')}</StatusBadge>
      {imageRequired ? (
        <StatusBadge tone="neutral">{t('capabilities.images')}</StatusBadge>
      ) : null}
    </div>
  )
}

function AddConnectionPanel({
  isOpen,
  onCancel,
  onCreateDraft,
}: {
  isOpen: boolean
  onCancel: () => void
  onCreateDraft: () => void
}) {
  const t = useTranslations('admin.aiConnectionsPrototype')
  const [adapter, setAdapter] = useState('openResponses')

  if (!isOpen) return null

  return (
    <section className="rounded-3xl border border-primary-300 bg-white p-5 shadow-lg dark:border-primary-700 dark:bg-secondary-900">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary-700 dark:text-primary-300">
            {t('create.eyebrow')}
          </p>
          <h4 className="mt-2 text-xl font-semibold text-secondary-950 dark:text-secondary-50">
            {t('create.title')}
          </h4>
          <p className="mt-1 text-sm leading-6 text-secondary-600 dark:text-secondary-300">
            {t('create.description')}
          </p>
        </div>
        <StatusBadge icon="clock" tone="neutral">
          {t('create.draftOnly')}
        </StatusBadge>
      </div>

      <fieldset className="mt-5">
        <legend className="text-sm font-semibold text-secondary-900 dark:text-secondary-100">
          {t('create.chooseAdapter')}
        </legend>
        <p className="mt-1 text-xs text-secondary-500 dark:text-secondary-400">
          {t('create.adapterHelp')}
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {(['openResponses', 'openRouter', 'dify', 'langGraph'] as const).map(
            value => (
              <button
                aria-pressed={adapter === value}
                className={`min-h-20 rounded-2xl border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 ${
                  adapter === value
                    ? 'border-primary-500 bg-primary-50 text-primary-950 dark:border-primary-500 dark:bg-primary-950/40 dark:text-primary-50'
                    : 'border-secondary-200 bg-secondary-50 text-secondary-800 hover:border-secondary-400 dark:border-secondary-700 dark:bg-secondary-950/40 dark:text-secondary-200 dark:hover:border-secondary-500'
                }`}
                key={value}
                onClick={() => setAdapter(value)}
                type="button"
              >
                <span className="flex items-center gap-2 font-semibold">
                  <Bot aria-hidden="true" className="h-4 w-4" />
                  {t(`create.adapters.${value}.title`)}
                </span>
                <span className="mt-1 block text-xs leading-5 opacity-80">
                  {t(`create.adapters.${value}.description`)}
                </span>
              </button>
            ),
          )}
        </div>
      </fieldset>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-secondary-50 p-4 dark:bg-secondary-950/50">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-secondary-500 dark:text-secondary-400">
            {t('create.resultLabel')}
          </p>
          <p className="mt-1 font-semibold text-secondary-900 dark:text-secondary-100">
            {t('create.resultName')}
          </p>
          <p className="mt-1 text-xs text-secondary-500 dark:text-secondary-400">
            {t('create.resultHelp')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="min-h-10 rounded-full border border-secondary-300 px-4 text-sm font-semibold text-secondary-800 hover:bg-secondary-100 dark:border-secondary-700 dark:text-secondary-100 dark:hover:bg-secondary-800"
            onClick={onCancel}
            type="button"
          >
            {t('actions.cancel')}
          </button>
          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-full bg-primary-700 px-4 text-sm font-semibold text-white hover:bg-primary-800 dark:bg-primary-300 dark:text-secondary-950 dark:hover:bg-primary-200"
            onClick={onCreateDraft}
            type="button"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            {t('actions.createDraft')}
          </button>
        </div>
      </div>
    </section>
  )
}

function AddModelPanel({
  isOpen,
  onCancel,
  onCreateDraft,
}: {
  isOpen: boolean
  onCancel: () => void
  onCreateDraft: () => void
}) {
  const t = useTranslations('admin.aiConnectionsPrototype')
  const [source, setSource] = useState('discover')

  if (!isOpen) return null

  return (
    <section className="rounded-3xl border border-primary-300 bg-white p-5 shadow-lg dark:border-primary-700 dark:bg-secondary-900">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary-700 dark:text-primary-300">
            {t('modelCreate.eyebrow')}
          </p>
          <h4 className="mt-2 text-xl font-semibold text-secondary-950 dark:text-secondary-50">
            {t('modelCreate.title')}
          </h4>
          <p className="mt-1 text-sm leading-6 text-secondary-600 dark:text-secondary-300">
            {t('modelCreate.description')}
          </p>
        </div>
        <StatusBadge icon="clock" tone="neutral">
          {t('modelCreate.draftOnly')}
        </StatusBadge>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.7fr)]">
        <fieldset>
          <legend className="text-sm font-semibold text-secondary-900 dark:text-secondary-100">
            {t('modelCreate.chooseSource')}
          </legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {(['discover', 'manual'] as const).map(value => (
              <button
                aria-pressed={source === value}
                className={`min-h-20 rounded-2xl border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 ${
                  source === value
                    ? 'border-primary-500 bg-primary-50 text-primary-950 dark:border-primary-500 dark:bg-primary-950/40 dark:text-primary-50'
                    : 'border-secondary-200 bg-secondary-50 text-secondary-800 hover:border-secondary-400 dark:border-secondary-700 dark:bg-secondary-950/40 dark:text-secondary-200 dark:hover:border-secondary-500'
                }`}
                key={value}
                onClick={() => setSource(value)}
                type="button"
              >
                <span className="flex items-center gap-2 font-semibold">
                  <Bot aria-hidden="true" className="h-4 w-4" />
                  {t(`modelCreate.sources.${value}.title`)}
                </span>
                <span className="mt-1 block text-xs leading-5 opacity-80">
                  {t(`modelCreate.sources.${value}.description`)}
                </span>
              </button>
            ))}
          </div>
        </fieldset>

        <div className="rounded-2xl bg-secondary-50 p-4 dark:bg-secondary-950/50">
          <p className="text-xs font-semibold uppercase tracking-wide text-secondary-500 dark:text-secondary-400">
            {t('modelCreate.connectionLabel')}
          </p>
          <p className="mt-1 font-semibold text-secondary-900 dark:text-secondary-100">
            OpenRouter Production
          </p>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-secondary-500 dark:text-secondary-400">
            {t('modelCreate.resultLabel')}
          </p>
          <p className="mt-1 font-semibold text-secondary-900 dark:text-secondary-100">
            {t('modelCreate.resultName')}
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button
          className="min-h-10 rounded-full border border-secondary-300 px-4 text-sm font-semibold text-secondary-800 hover:bg-secondary-100 dark:border-secondary-700 dark:text-secondary-100 dark:hover:bg-secondary-800"
          onClick={onCancel}
          type="button"
        >
          {t('actions.cancel')}
        </button>
        <button
          className="inline-flex min-h-10 items-center gap-2 rounded-full bg-primary-700 px-4 text-sm font-semibold text-white hover:bg-primary-800 dark:bg-primary-300 dark:text-secondary-950 dark:hover:bg-primary-200"
          onClick={onCreateDraft}
          type="button"
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
          {t('actions.createModelDraft')}
        </button>
      </div>
    </section>
  )
}

function PrototypeModal({
  children,
  label,
  onClose,
}: {
  children: ReactNode
  label: string
  onClose: () => void
}) {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  return (
    <div
      aria-label={label}
      aria-modal="true"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-secondary-950/60 p-3 backdrop-blur-sm sm:p-6"
      role="dialog"
    >
      <div className="max-h-[calc(100dvh-1.5rem)] w-full max-w-4xl overflow-y-auto rounded-3xl sm:max-h-[calc(100dvh-3rem)]">
        {children}
      </div>
    </div>
  )
}

function EditPanel({
  onCancel,
  target,
}: {
  onCancel: () => void
  target: EditTarget
}) {
  const t = useTranslations('admin.aiConnectionsPrototype')
  const isConnection = target.kind === 'connection'

  return (
    <section className="rounded-3xl border border-primary-300 bg-white p-5 shadow-xl dark:border-primary-700 dark:bg-secondary-900 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary-700 dark:text-primary-300">
            {t(isConnection ? 'edit.connectionEyebrow' : 'edit.modelEyebrow')}
          </p>
          <h4 className="mt-2 text-xl font-semibold text-secondary-950 dark:text-secondary-50">
            {t(isConnection ? 'edit.connectionTitle' : 'edit.modelTitle', {
              name: target.name,
            })}
          </h4>
          <p className="mt-1 text-sm leading-6 text-secondary-600 dark:text-secondary-300">
            {t(
              isConnection
                ? 'edit.connectionDescription'
                : 'edit.modelDescription',
            )}
          </p>
        </div>
        <button
          aria-label={t('actions.cancel')}
          className="inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-full text-secondary-600 hover:bg-secondary-100 dark:text-secondary-300 dark:hover:bg-secondary-800"
          onClick={onCancel}
          type="button"
        >
          <XCircle aria-hidden="true" className="h-5 w-5" />
        </button>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold text-secondary-900 dark:text-secondary-100">
          {t(isConnection ? 'edit.nameLabel' : 'edit.modelNameLabel')}
          <input
            className="mt-2 min-h-11 w-full rounded-xl border border-secondary-300 bg-white px-3 font-normal dark:border-secondary-700 dark:bg-secondary-950"
            defaultValue={target.name}
          />
        </label>
        <label className="text-sm font-semibold text-secondary-900 dark:text-secondary-100">
          {t(isConnection ? 'edit.endpointLabel' : 'edit.revisionLabel')}
          <input
            className="mt-2 min-h-11 w-full rounded-xl border border-secondary-300 bg-white px-3 font-normal dark:border-secondary-700 dark:bg-secondary-950"
            defaultValue={
              isConnection ? 'api.openrouter.ai' : target.name.split(' · ')[1]
            }
          />
        </label>
      </div>

      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <button
          className="min-h-10 rounded-full border border-secondary-300 px-4 text-sm font-semibold text-secondary-800 hover:bg-secondary-100 dark:border-secondary-700 dark:text-secondary-100 dark:hover:bg-secondary-800"
          onClick={onCancel}
          type="button"
        >
          {t('actions.cancel')}
        </button>
        <button
          className="min-h-10 rounded-full bg-primary-700 px-4 text-sm font-semibold text-white hover:bg-primary-800 dark:bg-primary-300 dark:text-secondary-950 dark:hover:bg-primary-200"
          onClick={onCancel}
          type="button"
        >
          {t('edit.savePrototype')}
        </button>
      </div>
    </section>
  )
}

function VariantA({
  addOpen,
  addModelOpen,
  draftCreated,
  modelDraftCreated,
  onAddConnection,
  onAddModel,
  onCancelAdd,
  onCancelAddModel,
  onCreateDraft,
  onCreateModelDraft,
  scenario,
  setScenario,
}: VariantProps) {
  const t = useTranslations('admin.aiConnectionsPrototype')
  const hasGaps = scenario === 'gaps'
  const unavailable = scenario === 'outage'

  return (
    <div className="space-y-6">
      <PrototypeHeader scenario={scenario} setScenario={setScenario} />
      <AddConnectionPanel
        isOpen={addOpen}
        onCancel={onCancelAdd}
        onCreateDraft={onCreateDraft}
      />
      <AddModelPanel
        isOpen={addModelOpen}
        onCancel={onCancelAddModel}
        onCreateDraft={onCreateModelDraft}
      />
      <div className="grid gap-4 md:grid-cols-3">
        {[
          {
            detail: t('guided.connectionsDetail'),
            icon: Link2,
            status: unavailable ? t('status.unavailable') : t('status.active'),
            tone: unavailable ? ('danger' as const) : ('success' as const),
            title: t('guided.connections'),
          },
          {
            detail: hasGaps
              ? t('guided.modelsGapDetail')
              : t('guided.modelsDetail'),
            icon: Bot,
            status: hasGaps ? t('status.actionRequired') : t('status.verified'),
            tone: hasGaps ? ('warning' as const) : ('success' as const),
            title: t('guided.models'),
          },
          {
            detail: hasGaps
              ? t('guided.profilesGapDetail')
              : unavailable
                ? t('guided.profilesOutageDetail')
                : t('guided.profilesDetail'),
            icon: Route,
            status:
              hasGaps || unavailable ? t('status.blocked') : t('status.ready'),
            tone:
              hasGaps || unavailable
                ? ('danger' as const)
                : ('success' as const),
            title: t('guided.profiles'),
          },
        ].map((step, index) => (
          <article
            className="relative rounded-3xl border border-secondary-200 bg-white p-5 shadow-sm dark:border-secondary-700 dark:bg-secondary-900"
            key={step.title}
          >
            <span className="absolute right-4 top-4 text-3xl font-semibold text-secondary-200 dark:text-secondary-700">
              {index + 1}
            </span>
            <step.icon
              aria-hidden="true"
              className="h-6 w-6 text-primary-700 dark:text-primary-300"
            />
            <h4 className="mt-4 font-semibold text-secondary-950 dark:text-secondary-50">
              {step.title}
            </h4>
            <p className="mt-1 min-h-10 text-sm text-secondary-600 dark:text-secondary-300">
              {step.detail}
            </p>
            <div className="mt-4">
              <StatusBadge
                icon={
                  step.tone === 'danger'
                    ? 'blocked'
                    : step.tone === 'warning'
                      ? 'warning'
                      : 'check'
                }
                tone={step.tone}
              >
                {step.status}
              </StatusBadge>
            </div>
            {index === 0 ? (
              <button
                className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-full border border-primary-300 px-4 text-sm font-semibold text-primary-800 hover:bg-primary-50 dark:border-primary-700 dark:text-primary-200 dark:hover:bg-primary-950/40"
                onClick={onAddConnection}
                type="button"
              >
                <Plus aria-hidden="true" className="h-4 w-4" />
                {t('actions.addConnection')}
              </button>
            ) : null}
            {index === 1 ? (
              <button
                className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-full border border-primary-300 px-4 text-sm font-semibold text-primary-800 hover:bg-primary-50 dark:border-primary-700 dark:text-primary-200 dark:hover:bg-primary-950/40"
                onClick={onAddModel}
                type="button"
              >
                <Plus aria-hidden="true" className="h-4 w-4" />
                {t('actions.addModel')}
              </button>
            ) : null}
          </article>
        ))}
      </div>

      <section className="rounded-3xl border border-secondary-200 bg-white p-5 dark:border-secondary-700 dark:bg-secondary-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="font-semibold text-secondary-950 dark:text-secondary-50">
              {t('connections.title')}
            </h4>
            <p className="mt-1 text-sm text-secondary-600 dark:text-secondary-300">
              {t('connections.description')}
            </p>
          </div>
          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-full border border-primary-300 px-4 text-sm font-semibold text-primary-800 hover:bg-primary-50 dark:border-primary-700 dark:text-primary-200 dark:hover:bg-primary-950/40"
            onClick={onAddConnection}
            type="button"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            {t('actions.addConnection')}
          </button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <button
            className="rounded-2xl border border-primary-300 bg-primary-50/50 p-4 text-left dark:border-primary-700 dark:bg-primary-950/30"
            type="button"
          >
            <span className="font-semibold text-secondary-950 dark:text-secondary-50">
              OpenRouter Production
            </span>
            <span className="mt-2 block">
              <StatusBadge tone="success">{t('status.active')}</StatusBadge>
            </span>
          </button>
          <button
            className="rounded-2xl border border-secondary-200 p-4 text-left dark:border-secondary-700"
            type="button"
          >
            <span className="font-semibold text-secondary-950 dark:text-secondary-50">
              Dify EU
            </span>
            <span className="mt-2 block">
              <StatusBadge icon="warning" tone="warning">
                {t('status.verificationRequired')}
              </StatusBadge>
            </span>
          </button>
          <button
            className="rounded-2xl border border-secondary-200 p-4 text-left dark:border-secondary-700"
            type="button"
          >
            <span className="font-semibold text-secondary-950 dark:text-secondary-50">
              LangGraph Sidecar
            </span>
            <span className="mt-2 block">
              <StatusBadge icon="clock" tone="neutral">
                {t('status.draft')}
              </StatusBadge>
            </span>
          </button>
        </div>
      </section>

      {draftCreated ? (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100"
          role="status"
        >
          <span className="flex items-center gap-2 font-semibold">
            <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
            {t('create.createdMessage')}
          </span>
          <StatusBadge icon="clock" tone="neutral">
            {t('status.draft')}
          </StatusBadge>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(19rem,0.8fr)]">
        <section className="rounded-3xl border border-secondary-200 bg-white p-5 dark:border-secondary-700 dark:bg-secondary-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="font-semibold text-secondary-950 dark:text-secondary-50">
                {t('guided.activeConnection')}
              </h4>
              <p className="mt-1 text-sm text-secondary-600 dark:text-secondary-300">
                {t('connection.openRouterDescription')}
              </p>
            </div>
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-secondary-300 px-4 text-sm font-semibold text-secondary-800 hover:bg-secondary-100 dark:border-secondary-700 dark:text-secondary-100 dark:hover:bg-secondary-800"
              onClick={() => setScenario('ready')}
              type="button"
            >
              <RefreshCw aria-hidden="true" className="h-4 w-4" />
              {t('actions.runTest')}
            </button>
          </div>
          <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
            {[
              [t('fields.adapter'), 'OpenRouter adapter 1.0'],
              [t('fields.endpoint'), 'api.openrouter.ai'],
              [t('fields.authentication'), t('values.secretAssigned')],
              [t('fields.attestation'), t('values.validUntil')],
            ].map(([label, value]) => (
              <div
                className="rounded-2xl bg-secondary-50 p-3 dark:bg-secondary-950/50"
                key={label}
              >
                <dt className="text-xs font-semibold uppercase tracking-wide text-secondary-500 dark:text-secondary-400">
                  {label}
                </dt>
                <dd className="mt-1 font-medium text-secondary-900 dark:text-secondary-100">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          <div className="mt-5 border-t border-secondary-200 pt-5 dark:border-secondary-700">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h5 className="font-semibold text-secondary-950 dark:text-secondary-50">
                  {t('models.title')}
                </h5>
                <p className="mt-1 text-xs text-secondary-500 dark:text-secondary-400">
                  {t('models.description')}
                </p>
              </div>
              <button
                className="inline-flex min-h-9 items-center gap-2 rounded-full border border-secondary-300 px-3 text-sm font-semibold dark:border-secondary-700"
                onClick={onAddModel}
                type="button"
              >
                <Plus aria-hidden="true" className="h-4 w-4" />
                {t('actions.addModel')}
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                'Claude Sonnet · 2026-07',
                'Gemini Pro · 2026-06',
                'GPT-5 mini · 2026-07',
              ].map(name => (
                <span
                  className="rounded-full border border-secondary-200 bg-secondary-50 px-3 py-1.5 text-xs font-semibold text-secondary-700 dark:border-secondary-700 dark:bg-secondary-950/50 dark:text-secondary-200"
                  key={name}
                >
                  {name}
                </span>
              ))}
              {modelDraftCreated ? (
                <StatusBadge icon="clock" tone="neutral">
                  {t('modelCreate.resultName')} · {t('status.draft')}
                </StatusBadge>
              ) : null}
            </div>
          </div>
          {unavailable ? (
            <div
              className="mt-4 flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-100"
              role="alert"
            >
              <XCircle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">{t('outage.title')}</p>
                <p className="mt-1">{t('outage.description')}</p>
              </div>
            </div>
          ) : null}
        </section>
        <TrustBoundary />
      </div>
    </div>
  )
}

function RouteStatus({
  scenario,
  type,
}: {
  scenario: Scenario
  type: 'image' | 'repair' | 'text'
}) {
  const t = useTranslations('admin.aiConnectionsPrototype')
  if (scenario === 'outage') {
    return (
      <StatusBadge icon="blocked" tone="danger">
        {t('status.blocked')}
      </StatusBadge>
    )
  }
  if (scenario === 'gaps' && type !== 'text') {
    return (
      <StatusBadge icon="warning" tone="warning">
        {type === 'image'
          ? t('status.capabilityMissing')
          : t('status.notConfigured')}
      </StatusBadge>
    )
  }
  return <StatusBadge tone="success">{t('status.ready')}</StatusBadge>
}

function VariantB({
  addOpen,
  addModelOpen,
  draftCreated,
  modelDraftCreated,
  onAddConnection,
  onAddModel,
  onCancelAdd,
  onCancelAddModel,
  onCreateDraft,
  onCreateModelDraft,
  scenario,
  setScenario,
}: VariantProps) {
  const t = useTranslations('admin.aiConnectionsPrototype')
  const [expandedRoute, setExpandedRoute] = useState<
    'image' | 'repair' | 'text' | null
  >(null)
  const rows = [
    {
      icon: Sparkles,
      model: 'Claude Sonnet · 2026-07',
      profile: t('profiles.text'),
      type: 'text' as const,
    },
    {
      icon: Image,
      model: scenario === 'gaps' ? '—' : 'Gemini Pro · 2026-06',
      profile: t('profiles.image'),
      type: 'image' as const,
    },
    {
      icon: FileJson2,
      model: scenario === 'gaps' ? '—' : 'GPT-5 mini · 2026-07',
      profile: t('profiles.repair'),
      type: 'repair' as const,
    },
  ]

  return (
    <div className="space-y-6">
      <PrototypeHeader scenario={scenario} setScenario={setScenario} />
      <AddConnectionPanel
        isOpen={addOpen}
        onCancel={onCancelAdd}
        onCreateDraft={onCreateDraft}
      />
      <AddModelPanel
        isOpen={addModelOpen}
        onCancel={onCancelAddModel}
        onCreateDraft={onCreateModelDraft}
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <section className="overflow-hidden rounded-3xl border border-secondary-200 bg-white dark:border-secondary-700 dark:bg-secondary-900">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-secondary-200 p-5 dark:border-secondary-700">
            <div>
              <h4 className="font-semibold text-secondary-950 dark:text-secondary-50">
                {t('matrix.title')}
              </h4>
              <p className="mt-1 text-sm text-secondary-600 dark:text-secondary-300">
                {t('matrix.description')}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge
                icon={
                  draftCreated
                    ? 'clock'
                    : scenario === 'ready'
                      ? 'check'
                      : 'warning'
                }
                tone={
                  draftCreated
                    ? 'neutral'
                    : scenario === 'ready'
                      ? 'success'
                      : 'warning'
                }
              >
                {draftCreated
                  ? t('matrix.draftCreated')
                  : scenario === 'ready'
                    ? t('matrix.allReady')
                    : t('matrix.needsAttention')}
              </StatusBadge>
              <button
                className="inline-flex min-h-10 items-center gap-2 rounded-full border border-primary-300 px-4 text-sm font-semibold text-primary-800 hover:bg-primary-50 dark:border-primary-700 dark:text-primary-200 dark:hover:bg-primary-950/40"
                onClick={onAddConnection}
                type="button"
              >
                <Plus aria-hidden="true" className="h-4 w-4" />
                {t('actions.addConnection')}
              </button>
            </div>
          </div>
          <div className="border-b border-secondary-200 p-5 dark:border-secondary-700">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h5 className="font-semibold text-secondary-950 dark:text-secondary-50">
                  {t('connections.poolTitle')}
                </h5>
                <p className="mt-1 text-xs text-secondary-500 dark:text-secondary-400">
                  {t('connections.poolDescription')}
                </p>
              </div>
              <button
                className="inline-flex min-h-9 items-center gap-2 rounded-full border border-secondary-300 px-3 text-sm font-semibold dark:border-secondary-700"
                onClick={onAddConnection}
                type="button"
              >
                <Plus aria-hidden="true" className="h-4 w-4" />
                {t('actions.addConnection')}
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
                <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" />
                OpenRouter Production · {t('status.active')}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                <TriangleAlert aria-hidden="true" className="h-3.5 w-3.5" />
                Dify EU · {t('status.verificationRequired')}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-secondary-200 bg-secondary-100 px-3 py-1.5 text-xs font-semibold text-secondary-700 dark:border-secondary-700 dark:bg-secondary-800 dark:text-secondary-200">
                <Clock3 aria-hidden="true" className="h-3.5 w-3.5" />
                LangGraph Sidecar · {t('status.draft')}
              </span>
              {draftCreated ? (
                <StatusBadge icon="clock" tone="neutral">
                  {t('create.resultName')} · {t('status.draft')}
                </StatusBadge>
              ) : null}
            </div>
          </div>
          <div className="border-b border-secondary-200 bg-secondary-50/70 p-5 dark:border-secondary-700 dark:bg-secondary-950/30">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h5 className="font-semibold text-secondary-950 dark:text-secondary-50">
                  {t('models.availableTitle')}
                </h5>
                <p className="mt-1 text-xs text-secondary-500 dark:text-secondary-400">
                  {t('models.availableDescription')}
                </p>
              </div>
              <button
                className="inline-flex min-h-9 items-center gap-2 rounded-full border border-secondary-300 bg-white px-3 text-sm font-semibold dark:border-secondary-700 dark:bg-secondary-900"
                onClick={onAddModel}
                type="button"
              >
                <Plus aria-hidden="true" className="h-4 w-4" />
                {t('actions.addModel')}
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                'Claude Sonnet · 2026-07',
                'Gemini Pro · 2026-06',
                'GPT-5 mini · 2026-07',
              ].map(name => (
                <span
                  className="rounded-full border border-secondary-200 bg-white px-3 py-1.5 text-xs font-semibold text-secondary-700 dark:border-secondary-700 dark:bg-secondary-900 dark:text-secondary-200"
                  key={name}
                >
                  {name}
                </span>
              ))}
              {modelDraftCreated ? (
                <StatusBadge icon="clock" tone="neutral">
                  {t('modelCreate.resultName')} · {t('status.draft')}
                </StatusBadge>
              ) : null}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-184 text-left text-sm">
              <thead className="bg-secondary-50 text-xs uppercase tracking-wide text-secondary-500 dark:bg-secondary-950/50 dark:text-secondary-400">
                <tr>
                  <th className="px-5 py-3" scope="col">
                    {t('matrix.callType')}
                  </th>
                  <th className="px-5 py-3" scope="col">
                    {t('matrix.route')}
                  </th>
                  <th className="px-5 py-3" scope="col">
                    {t('matrix.minimum')}
                  </th>
                  <th className="px-5 py-3" scope="col">
                    {t('matrix.status')}
                  </th>
                  <th className="px-5 py-3" scope="col">
                    <span className="sr-only">{t('matrix.open')}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-secondary-200 dark:divide-secondary-700">
                {rows.map(row => (
                  <Fragment key={row.type}>
                    <tr className="align-top hover:bg-secondary-50/70 dark:hover:bg-secondary-800/40">
                      <th
                        className="px-5 py-4 font-semibold text-secondary-950 dark:text-secondary-50"
                        scope="row"
                      >
                        <span className="flex items-center gap-2">
                          <row.icon
                            aria-hidden="true"
                            className="h-4 w-4 text-primary-700 dark:text-primary-300"
                          />
                          {row.profile}
                        </span>
                      </th>
                      <td className="px-5 py-4 text-secondary-700 dark:text-secondary-200">
                        <p className="font-medium">{row.model}</p>
                        <p className="mt-1 text-xs text-secondary-500 dark:text-secondary-400">
                          OpenRouter Production
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <CapabilityChips imageRequired={row.type === 'image'} />
                      </td>
                      <td className="px-5 py-4">
                        <RouteStatus scenario={scenario} type={row.type} />
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button
                          aria-controls={`route-details-${row.type}`}
                          aria-expanded={expandedRoute === row.type}
                          aria-label={`${
                            expandedRoute === row.type
                              ? t('matrix.collapse')
                              : t('matrix.expand')
                          } ${row.profile}`}
                          className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-full text-secondary-600 hover:bg-secondary-100 dark:text-secondary-300 dark:hover:bg-secondary-700"
                          onClick={() =>
                            setExpandedRoute(current =>
                              current === row.type ? null : row.type,
                            )
                          }
                          type="button"
                        >
                          {expandedRoute === row.type ? (
                            <ChevronDown
                              aria-hidden="true"
                              className="h-4 w-4"
                            />
                          ) : (
                            <ChevronRight
                              aria-hidden="true"
                              className="h-4 w-4"
                            />
                          )}
                        </button>
                      </td>
                    </tr>
                    {expandedRoute === row.type ? (
                      <tr id={`route-details-${row.type}`}>
                        <td
                          className="bg-secondary-50/80 px-5 py-5 dark:bg-secondary-950/40"
                          colSpan={5}
                        >
                          <div className="grid gap-4 lg:grid-cols-3">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-secondary-500 dark:text-secondary-400">
                                {t('matrix.activeRevision')}
                              </p>
                              <p className="mt-2 font-semibold text-secondary-900 dark:text-secondary-100">
                                {scenario === 'gaps' && row.type !== 'text'
                                  ? t('matrix.noActiveRevision')
                                  : t('matrix.revisionValue')}
                              </p>
                              <p className="mt-1 text-xs text-secondary-500 dark:text-secondary-400">
                                {scenario === 'gaps' && row.type !== 'text'
                                  ? t('matrix.revisionMissingHelp')
                                  : row.model}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-secondary-500 dark:text-secondary-400">
                                {t('matrix.capabilityPolicy')}
                              </p>
                              <div className="mt-2">
                                <CapabilityChips
                                  imageRequired={row.type === 'image'}
                                />
                              </div>
                              <p className="mt-2 text-xs text-secondary-500 dark:text-secondary-400">
                                {row.type === 'repair'
                                  ? t('matrix.repairPolicyHelp')
                                  : t('matrix.generationPolicyHelp')}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-secondary-500 dark:text-secondary-400">
                                {t('matrix.operationLimits')}
                              </p>
                              <dl className="mt-2 space-y-2 text-sm text-secondary-700 dark:text-secondary-200">
                                <div className="flex justify-between gap-3">
                                  <dt>{t('matrix.totalBudget')}</dt>
                                  <dd className="font-semibold">
                                    {row.type === 'repair'
                                      ? t('matrix.fiveMinutes')
                                      : t('matrix.twentyMinutes')}
                                  </dd>
                                </div>
                                <div className="flex justify-between gap-3">
                                  <dt>{t('matrix.queueCapacity')}</dt>
                                  <dd className="font-semibold">
                                    {t('matrix.tenRuns')}
                                  </dd>
                                </div>
                              </dl>
                            </div>
                          </div>
                          {scenario === 'gaps' && row.type !== 'text' ? (
                            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                              <span className="flex items-start gap-2 text-sm">
                                <CircleAlert
                                  aria-hidden="true"
                                  className="mt-0.5 h-4 w-4 shrink-0"
                                />
                                {row.type === 'image'
                                  ? t('matrix.imageBlocker')
                                  : t('matrix.repairBlocker')}
                              </span>
                              <button
                                className="inline-flex min-h-10 items-center gap-2 rounded-full bg-amber-900 px-4 text-sm font-semibold text-white hover:bg-amber-950 dark:bg-amber-200 dark:text-amber-950 dark:hover:bg-amber-100"
                                type="button"
                              >
                                <Wrench
                                  aria-hidden="true"
                                  className="h-4 w-4"
                                />
                                {t('actions.configureRoute')}
                              </button>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="space-y-4">
          <section
            className={`rounded-3xl border p-5 ${scenario === 'ready' ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30' : 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30'}`}
          >
            <div className="flex items-start gap-3">
              {scenario === 'ready' ? (
                <CheckCircle2
                  aria-hidden="true"
                  className="h-5 w-5 text-emerald-700 dark:text-emerald-300"
                />
              ) : (
                <CircleAlert
                  aria-hidden="true"
                  className="h-5 w-5 text-amber-800 dark:text-amber-200"
                />
              )}
              <div>
                <h4 className="font-semibold text-secondary-950 dark:text-secondary-50">
                  {scenario === 'ready'
                    ? t('matrix.readyTitle')
                    : t('matrix.blockerTitle')}
                </h4>
                <p className="mt-1 text-sm leading-6 text-secondary-700 dark:text-secondary-200">
                  {scenario === 'ready'
                    ? t('matrix.readyDescription')
                    : scenario === 'gaps'
                      ? t('matrix.gapDescription')
                      : t('matrix.outageDescription')}
                </p>
              </div>
            </div>
          </section>
          <TrustBoundary />
          <button
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary-700 px-4 font-semibold text-white hover:bg-primary-800 dark:bg-primary-300 dark:text-secondary-950 dark:hover:bg-primary-200"
            type="button"
          >
            <Wrench aria-hidden="true" className="h-4 w-4" />
            {t('actions.configureRoute')}
          </button>
        </div>
      </div>
    </div>
  )
}

function VariantC({
  addOpen,
  addModelOpen,
  draftCreated,
  modelDraftCreated,
  onAddConnection,
  onAddModel,
  onCancelAdd,
  onCancelAddModel,
  onCreateDraft,
  onCreateModelDraft,
  scenario,
  setScenario,
}: VariantProps) {
  const t = useTranslations('admin.aiConnectionsPrototype')
  const unavailable = scenario === 'outage'

  return (
    <div className="space-y-6">
      <PrototypeHeader scenario={scenario} setScenario={setScenario} />
      <AddConnectionPanel
        isOpen={addOpen}
        onCancel={onCancelAdd}
        onCreateDraft={onCreateDraft}
      />
      <AddModelPanel
        isOpen={addModelOpen}
        onCancel={onCancelAddModel}
        onCreateDraft={onCreateModelDraft}
      />
      <div className="grid min-h-152 gap-4 xl:grid-cols-[17rem_minmax(0,1fr)_19rem]">
        <nav
          aria-label={t('cockpit.connections')}
          className="rounded-3xl border border-secondary-200 bg-secondary-50/70 p-3 dark:border-secondary-700 dark:bg-secondary-950/40"
        >
          <div className="flex items-center justify-between px-2 py-2">
            <h4 className="font-semibold text-secondary-950 dark:text-secondary-50">
              {t('cockpit.connections')}
            </h4>
            <button
              aria-label={t('actions.addConnection')}
              className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-full bg-primary-700 text-white dark:bg-primary-300 dark:text-secondary-950"
              onClick={onAddConnection}
              type="button"
            >
              <Plus aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-2 space-y-2">
            <button
              className="w-full rounded-2xl border border-primary-300 bg-white p-3 text-left shadow-sm dark:border-primary-700 dark:bg-secondary-900"
              type="button"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-semibold text-secondary-950 dark:text-secondary-50">
                  OpenRouter Production
                </span>
                <Activity
                  aria-hidden="true"
                  className={`h-4 w-4 ${unavailable ? 'text-red-600' : 'text-emerald-600'}`}
                />
              </span>
              <span className="mt-2 block">
                <StatusBadge
                  icon={unavailable ? 'blocked' : 'check'}
                  tone={unavailable ? 'danger' : 'success'}
                >
                  {unavailable ? t('status.unavailable') : t('status.healthy')}
                </StatusBadge>
              </span>
            </button>
            {draftCreated ? (
              <button
                className="w-full rounded-2xl border border-dashed border-primary-300 bg-primary-50/60 p-3 text-left dark:border-primary-700 dark:bg-primary-950/30"
                type="button"
              >
                <span className="font-semibold text-secondary-900 dark:text-secondary-100">
                  {t('create.resultName')}
                </span>
                <span className="mt-2 block">
                  <StatusBadge icon="clock" tone="neutral">
                    {t('status.draft')}
                  </StatusBadge>
                </span>
              </button>
            ) : null}
            <button
              className="w-full rounded-2xl border border-transparent p-3 text-left hover:border-secondary-200 hover:bg-white dark:hover:border-secondary-700 dark:hover:bg-secondary-900"
              type="button"
            >
              <span className="font-semibold text-secondary-900 dark:text-secondary-100">
                Dify EU
              </span>
              <span className="mt-2 block">
                <StatusBadge icon="warning" tone="warning">
                  {t('status.verificationRequired')}
                </StatusBadge>
              </span>
            </button>
            <button
              className="w-full rounded-2xl border border-transparent p-3 text-left hover:border-secondary-200 hover:bg-white dark:hover:border-secondary-700 dark:hover:bg-secondary-900"
              type="button"
            >
              <span className="font-semibold text-secondary-900 dark:text-secondary-100">
                LangGraph Sidecar
              </span>
              <span className="mt-2 block">
                <StatusBadge icon="clock" tone="neutral">
                  {t('status.draft')}
                </StatusBadge>
              </span>
            </button>
          </div>
        </nav>

        <main className="rounded-3xl border border-secondary-200 bg-white p-5 dark:border-secondary-700 dark:bg-secondary-900">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-secondary-500 dark:text-secondary-400">
                {t('cockpit.selected')}
              </p>
              <h4 className="mt-1 text-xl font-semibold text-secondary-950 dark:text-secondary-50">
                OpenRouter Production
              </h4>
              <p className="mt-1 text-sm text-secondary-600 dark:text-secondary-300">
                {t('connection.openRouterDescription')}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                className="inline-flex min-h-10 items-center gap-2 rounded-full border border-secondary-300 px-4 text-sm font-semibold dark:border-secondary-700"
                type="button"
              >
                <ExternalLink aria-hidden="true" className="h-4 w-4" />
                {t('actions.edit')}
              </button>
              <button
                className="inline-flex min-h-10 items-center gap-2 rounded-full bg-primary-700 px-4 text-sm font-semibold text-white dark:bg-primary-300 dark:text-secondary-950"
                onClick={() => setScenario('ready')}
                type="button"
              >
                <RefreshCw aria-hidden="true" className="h-4 w-4" />
                {t('actions.healthCheck')}
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-secondary-50 p-4 dark:bg-secondary-950/50">
              <p className="text-xs font-semibold text-secondary-500 dark:text-secondary-400">
                {t('cockpit.health')}
              </p>
              <p className="mt-2">
                <StatusBadge
                  icon={unavailable ? 'blocked' : 'check'}
                  tone={unavailable ? 'danger' : 'success'}
                >
                  {unavailable ? t('status.unavailable') : t('status.healthy')}
                </StatusBadge>
              </p>
            </div>
            <div className="rounded-2xl bg-secondary-50 p-4 dark:bg-secondary-950/50">
              <p className="text-xs font-semibold text-secondary-500 dark:text-secondary-400">
                {t('cockpit.verification')}
              </p>
              <p className="mt-2">
                <StatusBadge tone="success">{t('status.passed')}</StatusBadge>
              </p>
            </div>
            <div className="rounded-2xl bg-secondary-50 p-4 dark:bg-secondary-950/50">
              <p className="text-xs font-semibold text-secondary-500 dark:text-secondary-400">
                {t('cockpit.attestation')}
              </p>
              <p className="mt-2">
                <StatusBadge tone="success">{t('status.valid')}</StatusBadge>
              </p>
            </div>
          </div>

          {unavailable ? (
            <div
              className="mt-5 flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100"
              role="alert"
            >
              <CircleOff
                aria-hidden="true"
                className="mt-0.5 h-5 w-5 shrink-0"
              />
              <div>
                <p className="font-semibold">{t('outage.title')}</p>
                <p className="mt-1 text-sm">{t('outage.description')}</p>
              </div>
            </div>
          ) : null}

          <section className="mt-6">
            <div className="flex items-center justify-between gap-3">
              <h5 className="font-semibold text-secondary-950 dark:text-secondary-50">
                {t('cockpit.models')}
              </h5>
              <button
                className="inline-flex min-h-9 items-center gap-2 rounded-full border border-secondary-300 px-3 text-sm font-semibold dark:border-secondary-700"
                onClick={onAddModel}
                type="button"
              >
                <Plus aria-hidden="true" className="h-4 w-4" />
                {t('actions.addModel')}
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {[
                ['Claude Sonnet · 2026-07', t('values.textJsonStreaming')],
                ['Gemini Pro · 2026-06', t('values.textImageJsonStreaming')],
                ['GPT-5 mini · 2026-07', t('values.textJson')],
              ].map(([name, capabilities], index) => (
                <div
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-secondary-200 p-4 dark:border-secondary-700"
                  key={name}
                >
                  <div>
                    <p className="font-semibold text-secondary-900 dark:text-secondary-100">
                      {name}
                    </p>
                    <p className="mt-1 text-xs text-secondary-500 dark:text-secondary-400">
                      {capabilities}
                    </p>
                  </div>
                  <StatusBadge
                    icon={
                      scenario === 'gaps' && index === 1 ? 'warning' : 'check'
                    }
                    tone={
                      scenario === 'gaps' && index === 1 ? 'warning' : 'success'
                    }
                  >
                    {scenario === 'gaps' && index === 1
                      ? t('status.verificationRequired')
                      : t('status.verified')}
                  </StatusBadge>
                </div>
              ))}
              {modelDraftCreated ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-primary-300 bg-primary-50/60 p-4 dark:border-primary-700 dark:bg-primary-950/30">
                  <div>
                    <p className="font-semibold text-secondary-900 dark:text-secondary-100">
                      {t('modelCreate.resultName')}
                    </p>
                    <p className="mt-1 text-xs text-secondary-500 dark:text-secondary-400">
                      {t('modelCreate.pendingConfiguration')}
                    </p>
                  </div>
                  <StatusBadge icon="clock" tone="neutral">
                    {t('status.draft')}
                  </StatusBadge>
                </div>
              ) : null}
            </div>
          </section>
        </main>

        <aside className="space-y-4">
          <section className="rounded-3xl border border-secondary-200 bg-white p-5 dark:border-secondary-700 dark:bg-secondary-900">
            <h4 className="font-semibold text-secondary-950 dark:text-secondary-50">
              {t('cockpit.profileImpact')}
            </h4>
            <div className="mt-4 space-y-3">
              {(['text', 'image', 'repair'] as const).map(type => (
                <div
                  className="flex items-center justify-between gap-3"
                  key={type}
                >
                  <span className="text-sm text-secondary-700 dark:text-secondary-200">
                    {t(`profiles.${type}`)}
                  </span>
                  <RouteStatus scenario={scenario} type={type} />
                </div>
              ))}
            </div>
            {unavailable ? (
              <p className="mt-4 text-xs leading-5 text-red-700 dark:text-red-300">
                {t('cockpit.noFallback')}
              </p>
            ) : null}
          </section>
          <TrustBoundary />
        </aside>
      </div>
    </div>
  )
}

function VariantD({
  addOpen,
  addModelOpen,
  draftCreated,
  modelDraftCreated,
  onAddConnection,
  onAddModel,
  onCancelAdd,
  onCancelAddModel,
  onCreateDraft,
  onCreateModelDraft,
  scenario,
  setScenario,
}: VariantProps) {
  const t = useTranslations('admin.aiConnectionsPrototype')
  const [selectedConnection, setSelectedConnection] = useState<
    'dify' | 'langGraph' | 'openRouter' | null
  >(null)
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null)
  const unavailable = scenario === 'outage'
  const connections = [
    {
      id: 'openRouter' as const,
      models: 3 + (modelDraftCreated ? 1 : 0),
      name: 'OpenRouter Production',
      profiles: 3,
      status: unavailable ? t('status.unavailable') : t('status.active'),
      tone: unavailable ? ('danger' as const) : ('success' as const),
    },
    {
      id: 'dify' as const,
      models: 1,
      name: 'Dify EU',
      profiles: 0,
      status: t('status.verificationRequired'),
      tone: 'warning' as const,
    },
    {
      id: 'langGraph' as const,
      models: 0,
      name: 'LangGraph Sidecar',
      profiles: 0,
      status: t('status.draft'),
      tone: 'neutral' as const,
    },
  ]

  return (
    <div className="space-y-6">
      <PrototypeHeader scenario={scenario} setScenario={setScenario} />
      {addOpen ? (
        <PrototypeModal label={t('create.title')} onClose={onCancelAdd}>
          <AddConnectionPanel
            isOpen={addOpen}
            onCancel={onCancelAdd}
            onCreateDraft={onCreateDraft}
          />
        </PrototypeModal>
      ) : null}
      {addModelOpen ? (
        <PrototypeModal
          label={t('modelCreate.title')}
          onClose={onCancelAddModel}
        >
          <AddModelPanel
            isOpen={addModelOpen}
            onCancel={onCancelAddModel}
            onCreateDraft={onCreateModelDraft}
          />
        </PrototypeModal>
      ) : null}
      {editTarget ? (
        <PrototypeModal
          label={t(
            editTarget.kind === 'connection'
              ? 'edit.connectionEyebrow'
              : 'edit.modelEyebrow',
          )}
          onClose={() => setEditTarget(null)}
        >
          <EditPanel onCancel={() => setEditTarget(null)} target={editTarget} />
        </PrototypeModal>
      ) : null}

      <section className="overflow-hidden rounded-3xl border border-secondary-200 bg-white dark:border-secondary-700 dark:bg-secondary-900">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-secondary-200 p-5 dark:border-secondary-700">
          <div>
            <h4 className="text-lg font-semibold text-secondary-950 dark:text-secondary-50">
              {t('register.title')}
            </h4>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-secondary-600 dark:text-secondary-300">
              {t('register.description')}
            </p>
          </div>
          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-full bg-primary-700 px-4 text-sm font-semibold text-white hover:bg-primary-800 dark:bg-primary-300 dark:text-secondary-950 dark:hover:bg-primary-200"
            onClick={onAddConnection}
            type="button"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            {t('actions.addConnection')}
          </button>
        </div>

        <div className="divide-y divide-secondary-200 dark:divide-secondary-700">
          {connections.map(connection => {
            const isSelected = selectedConnection === connection.id
            return (
              <article key={connection.id}>
                <button
                  aria-controls={`connection-register-${connection.id}`}
                  aria-expanded={isSelected}
                  className={`grid w-full gap-3 p-5 text-left transition-colors sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center ${
                    isSelected
                      ? 'bg-primary-50/70 dark:bg-primary-950/30'
                      : 'hover:bg-secondary-50 dark:hover:bg-secondary-800/40'
                  }`}
                  onClick={() =>
                    setSelectedConnection(current =>
                      current === connection.id ? null : connection.id,
                    )
                  }
                  type="button"
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 font-semibold text-secondary-950 dark:text-secondary-50">
                      <Link2
                        aria-hidden="true"
                        className="h-4 w-4 shrink-0 text-primary-700 dark:text-primary-300"
                      />
                      {connection.name}
                    </span>
                    <span className="mt-2 block">
                      <StatusBadge
                        icon={
                          connection.tone === 'danger'
                            ? 'blocked'
                            : connection.tone === 'warning'
                              ? 'warning'
                              : connection.tone === 'neutral'
                                ? 'clock'
                                : 'check'
                        }
                        tone={connection.tone}
                      >
                        {connection.status}
                      </StatusBadge>
                    </span>
                  </span>
                  <span className="text-sm text-secondary-600 dark:text-secondary-300">
                    <strong className="text-secondary-950 dark:text-secondary-50">
                      {connection.models}
                    </strong>{' '}
                    {t('register.models')}
                  </span>
                  <span className="text-sm text-secondary-600 dark:text-secondary-300">
                    <strong className="text-secondary-950 dark:text-secondary-50">
                      {connection.profiles}
                    </strong>{' '}
                    {t('register.profiles')}
                  </span>
                  <span className="inline-flex min-h-9 min-w-9 items-center justify-center justify-self-end rounded-full text-secondary-600 dark:text-secondary-300">
                    {isSelected ? (
                      <ChevronDown aria-hidden="true" className="h-4 w-4" />
                    ) : (
                      <ChevronRight aria-hidden="true" className="h-4 w-4" />
                    )}
                  </span>
                </button>

                {isSelected ? (
                  <div
                    className="border-t border-primary-200 bg-white p-5 dark:border-primary-900 dark:bg-secondary-900"
                    id={`connection-register-${connection.id}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-700 dark:text-primary-300">
                          {t('register.expandedLabel')}
                        </p>
                        <h5 className="mt-1 text-xl font-semibold text-secondary-950 dark:text-secondary-50">
                          {connection.name}
                        </h5>
                        <p className="mt-1 text-sm text-secondary-600 dark:text-secondary-300">
                          {connection.id === 'openRouter'
                            ? t('connection.openRouterDescription')
                            : connection.id === 'dify'
                              ? t('register.difyDescription')
                              : t('register.langGraphDescription')}
                        </p>
                      </div>
                      <button
                        className="inline-flex min-h-10 items-center gap-2 rounded-full border border-secondary-300 px-4 text-sm font-semibold text-secondary-800 hover:bg-secondary-100 dark:border-secondary-700 dark:text-secondary-100 dark:hover:bg-secondary-800"
                        onClick={() =>
                          setEditTarget({
                            kind: 'connection',
                            name: connection.name,
                          })
                        }
                        type="button"
                      >
                        <Wrench aria-hidden="true" className="h-4 w-4" />
                        {t('actions.edit')}
                      </button>
                    </div>

                    <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                      <section className="rounded-2xl bg-secondary-50 p-4 dark:bg-secondary-950/50">
                        <h6 className="font-semibold text-secondary-950 dark:text-secondary-50">
                          {t('register.configuration')}
                        </h6>
                        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
                          {[
                            [
                              t('fields.adapter'),
                              connection.id === 'openRouter'
                                ? 'OpenRouter adapter 1.0'
                                : connection.id === 'dify'
                                  ? 'Dify Workflow adapter 1.0'
                                  : 'Open Responses adapter 1.0',
                            ],
                            [
                              t('fields.endpoint'),
                              connection.id === 'openRouter'
                                ? 'api.openrouter.ai'
                                : connection.id === 'dify'
                                  ? 'workflow.eu.example'
                                  : 'langgraph-sidecar:8443',
                            ],
                            [
                              t('fields.authentication'),
                              connection.id === 'langGraph'
                                ? t('register.missing')
                                : t('values.secretAssigned'),
                            ],
                            [
                              t('fields.attestation'),
                              connection.id === 'openRouter'
                                ? t('values.validUntil')
                                : t('register.pending'),
                            ],
                          ].map(([label, value]) => (
                            <div key={label}>
                              <dt className="text-xs font-semibold uppercase tracking-wide text-secondary-500 dark:text-secondary-400">
                                {label}
                              </dt>
                              <dd className="mt-1 font-medium text-secondary-900 dark:text-secondary-100">
                                {value}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </section>

                      <section className="rounded-2xl border border-secondary-200 p-4 dark:border-secondary-700">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <h6 className="font-semibold text-secondary-950 dark:text-secondary-50">
                              {t('register.connectionModels')}
                            </h6>
                            <p className="mt-1 text-xs text-secondary-500 dark:text-secondary-400">
                              {t('register.modelsDescription')}
                            </p>
                          </div>
                          {connection.id === 'openRouter' ? (
                            <button
                              className="inline-flex min-h-9 items-center gap-2 rounded-full border border-secondary-300 px-3 text-sm font-semibold dark:border-secondary-700"
                              onClick={onAddModel}
                              type="button"
                            >
                              <Plus aria-hidden="true" className="h-4 w-4" />
                              {t('actions.addModel')}
                            </button>
                          ) : null}
                        </div>

                        <div className="mt-4 space-y-2">
                          {connection.id === 'openRouter' ? (
                            <>
                              {[
                                [
                                  'Claude Sonnet · 2026-07',
                                  t('status.verified'),
                                ],
                                [
                                  'Gemini Pro · 2026-06',
                                  t('status.verificationRequired'),
                                ],
                                ['GPT-5 mini · 2026-07', t('status.verified')],
                              ].map(([name, status], index) => (
                                <div
                                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-secondary-50 px-3 py-2.5 dark:bg-secondary-950/50"
                                  key={name}
                                >
                                  <span className="text-sm font-semibold text-secondary-900 dark:text-secondary-100">
                                    {name}
                                  </span>
                                  <span className="flex flex-wrap items-center gap-2">
                                    <StatusBadge
                                      icon={index === 1 ? 'warning' : 'check'}
                                      tone={index === 1 ? 'warning' : 'success'}
                                    >
                                      {status}
                                    </StatusBadge>
                                    <button
                                      className="min-h-9 rounded-full border border-secondary-300 px-3 text-xs font-semibold hover:bg-white dark:border-secondary-700 dark:hover:bg-secondary-800"
                                      onClick={() =>
                                        setEditTarget({ kind: 'model', name })
                                      }
                                      type="button"
                                    >
                                      {t('actions.edit')}
                                    </button>
                                  </span>
                                </div>
                              ))}
                              {modelDraftCreated ? (
                                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-primary-300 bg-primary-50/60 px-3 py-2.5 dark:border-primary-700 dark:bg-primary-950/30">
                                  <span className="text-sm font-semibold text-secondary-900 dark:text-secondary-100">
                                    {t('modelCreate.resultName')}
                                  </span>
                                  <StatusBadge icon="clock" tone="neutral">
                                    {t('status.draft')}
                                  </StatusBadge>
                                </div>
                              ) : null}
                            </>
                          ) : connection.id === 'dify' ? (
                            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-secondary-50 px-3 py-2.5 dark:bg-secondary-950/50">
                              <span className="text-sm font-semibold text-secondary-900 dark:text-secondary-100">
                                Krav Workflow · 2.4
                              </span>
                              <span className="flex flex-wrap items-center gap-2">
                                <StatusBadge icon="warning" tone="warning">
                                  {t('status.verificationRequired')}
                                </StatusBadge>
                                <button
                                  className="min-h-9 rounded-full border border-secondary-300 px-3 text-xs font-semibold hover:bg-white dark:border-secondary-700 dark:hover:bg-secondary-800"
                                  onClick={() =>
                                    setEditTarget({
                                      kind: 'model',
                                      name: 'Krav Workflow · 2.4',
                                    })
                                  }
                                  type="button"
                                >
                                  {t('actions.edit')}
                                </button>
                              </span>
                            </div>
                          ) : (
                            <p className="rounded-xl border border-dashed border-secondary-300 p-4 text-sm text-secondary-600 dark:border-secondary-700 dark:text-secondary-300">
                              {t('register.noModels')}
                            </p>
                          )}
                        </div>
                      </section>
                    </div>

                    <section className="mt-5 rounded-2xl border border-secondary-200 p-4 dark:border-secondary-700">
                      <h6 className="font-semibold text-secondary-950 dark:text-secondary-50">
                        {t('register.profileImpact')}
                      </h6>
                      {connection.id === 'openRouter' ? (
                        <div className="mt-3 grid gap-3 md:grid-cols-3">
                          {(['text', 'image', 'repair'] as const).map(type => (
                            <div
                              className="flex items-center justify-between gap-3 rounded-xl bg-secondary-50 p-3 dark:bg-secondary-950/50"
                              key={type}
                            >
                              <span className="text-sm text-secondary-700 dark:text-secondary-200">
                                {t(`profiles.${type}`)}
                              </span>
                              <RouteStatus scenario={scenario} type={type} />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-sm text-secondary-600 dark:text-secondary-300">
                          {t('register.noProfiles')}
                        </p>
                      )}
                    </section>
                  </div>
                ) : null}
              </article>
            )
          })}

          {draftCreated ? (
            <article className="bg-primary-50/40 p-5 dark:bg-primary-950/20">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="font-semibold text-secondary-950 dark:text-secondary-50">
                  {t('create.resultName')}
                </span>
                <StatusBadge icon="clock" tone="neutral">
                  {t('status.draft')}
                </StatusBadge>
              </div>
            </article>
          ) : null}
        </div>
      </section>
    </div>
  )
}

function PrototypeSwitcher({ current }: { current: Variant }) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useTranslations('admin.aiConnectionsPrototype')

  function selectVariant(offset: number) {
    const currentIndex = VARIANTS.indexOf(current)
    const next =
      VARIANTS[(currentIndex + offset + VARIANTS.length) % VARIANTS.length]
    const params = new URLSearchParams(searchParams.toString())
    params.set('prototype', 'ai-connections')
    params.set('variant', next)
    router.replace(`${pathname}?${params.toString()}` as NextRoute, {
      scroll: false,
    })
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.matches('input, textarea, [contenteditable="true"]') ||
          target.closest('[contenteditable="true"]'))
      ) {
        return
      }
      if (event.key === 'ArrowLeft') selectVariant(-1)
      if (event.key === 'ArrowRight') selectVariant(1)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  if (process.env.NODE_ENV === 'production') return null

  return (
    <fieldset
      aria-label={t('switcher.label')}
      className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-secondary-600 bg-secondary-950 p-1.5 text-white shadow-2xl"
      {...devMarker({
        context: 'prototype',
        name: 'variant switcher',
        priority: 1000,
      })}
    >
      <button
        aria-label={t('switcher.previous')}
        className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-full hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        onClick={() => selectVariant(-1)}
        type="button"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
      </button>
      <span className="min-w-44 px-2 text-center text-sm font-semibold">
        {current} — {t(`variants.${current}`)}
      </span>
      <button
        aria-label={t('switcher.next')}
        className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-full hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        onClick={() => selectVariant(1)}
        type="button"
      >
        <ArrowRight aria-hidden="true" className="h-4 w-4" />
      </button>
    </fieldset>
  )
}

export default function AiConnectionsPrototype({
  onSettingsSettled,
}: PrototypeProps) {
  const searchParams = useSearchParams()
  const requestedVariant = searchParams.get('variant')
  const variant: Variant = VARIANTS.includes(requestedVariant as Variant)
    ? (requestedVariant as Variant)
    : 'A'
  const [scenario, setScenario] = useState<Scenario>('gaps')
  const [addOpen, setAddOpen] = useState(false)
  const [addModelOpen, setAddModelOpen] = useState(false)
  const [draftCreated, setDraftCreated] = useState(false)
  const [modelDraftCreated, setModelDraftCreated] = useState(false)

  function createDraft() {
    setDraftCreated(true)
    setAddOpen(false)
  }

  function createModelDraft() {
    setModelDraftCreated(true)
    setAddModelOpen(false)
  }

  useEffect(() => onSettingsSettled?.(), [onSettingsSettled])

  return (
    <section
      aria-label="AI connections administration prototype"
      className="rounded-4xl border border-secondary-200/70 bg-secondary-50/60 p-4 shadow-sm dark:border-secondary-700/60 dark:bg-secondary-950/30 sm:p-6"
      {...devMarker({
        context: 'admin settings',
        name: 'AI connections prototype',
        priority: 900,
      })}
    >
      {variant === 'A' ? (
        <VariantA
          addModelOpen={addModelOpen}
          addOpen={addOpen}
          draftCreated={draftCreated}
          modelDraftCreated={modelDraftCreated}
          onAddConnection={() => setAddOpen(true)}
          onAddModel={() => setAddModelOpen(true)}
          onCancelAdd={() => setAddOpen(false)}
          onCancelAddModel={() => setAddModelOpen(false)}
          onCreateDraft={createDraft}
          onCreateModelDraft={createModelDraft}
          scenario={scenario}
          setScenario={setScenario}
        />
      ) : null}
      {variant === 'B' ? (
        <VariantB
          addModelOpen={addModelOpen}
          addOpen={addOpen}
          draftCreated={draftCreated}
          modelDraftCreated={modelDraftCreated}
          onAddConnection={() => setAddOpen(true)}
          onAddModel={() => setAddModelOpen(true)}
          onCancelAdd={() => setAddOpen(false)}
          onCancelAddModel={() => setAddModelOpen(false)}
          onCreateDraft={createDraft}
          onCreateModelDraft={createModelDraft}
          scenario={scenario}
          setScenario={setScenario}
        />
      ) : null}
      {variant === 'C' ? (
        <VariantC
          addModelOpen={addModelOpen}
          addOpen={addOpen}
          draftCreated={draftCreated}
          modelDraftCreated={modelDraftCreated}
          onAddConnection={() => setAddOpen(true)}
          onAddModel={() => setAddModelOpen(true)}
          onCancelAdd={() => setAddOpen(false)}
          onCancelAddModel={() => setAddModelOpen(false)}
          onCreateDraft={createDraft}
          onCreateModelDraft={createModelDraft}
          scenario={scenario}
          setScenario={setScenario}
        />
      ) : null}
      {variant === 'D' ? (
        <VariantD
          addModelOpen={addModelOpen}
          addOpen={addOpen}
          draftCreated={draftCreated}
          modelDraftCreated={modelDraftCreated}
          onAddConnection={() => setAddOpen(true)}
          onAddModel={() => setAddModelOpen(true)}
          onCancelAdd={() => setAddOpen(false)}
          onCancelAddModel={() => setAddModelOpen(false)}
          onCreateDraft={createDraft}
          onCreateModelDraft={createModelDraft}
          scenario={scenario}
          setScenario={setScenario}
        />
      ) : null}
      <PrototypeSwitcher current={variant} />
    </section>
  )
}

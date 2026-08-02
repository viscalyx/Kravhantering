'use client'

import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Bot,
  CheckCircle2,
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
import { type ReactNode, useEffect, useState } from 'react'
import { devMarker } from '@/lib/developer-mode-markers'

// Three variants of AI connection administration, switchable via ?variant=,
// inside the existing Admin Center settings surface. PROTOTYPE — throw away.

type Scenario = 'gaps' | 'outage' | 'ready'
type Variant = 'A' | 'B' | 'C'
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
  scenario: Scenario
  setScenario: (scenario: Scenario) => void
}

const VARIANTS: readonly Variant[] = ['A', 'B', 'C']

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

function PrototypeHeader({ scenario, setScenario }: VariantProps) {
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

function VariantA({ scenario, setScenario }: VariantProps) {
  const t = useTranslations('admin.aiConnectionsPrototype')
  const hasGaps = scenario === 'gaps'
  const unavailable = scenario === 'outage'

  return (
    <div className="space-y-6">
      <PrototypeHeader scenario={scenario} setScenario={setScenario} />
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
          </article>
        ))}
      </div>

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

function VariantB({ scenario, setScenario }: VariantProps) {
  const t = useTranslations('admin.aiConnectionsPrototype')
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
            <StatusBadge
              icon={scenario === 'ready' ? 'check' : 'warning'}
              tone={scenario === 'ready' ? 'success' : 'warning'}
            >
              {scenario === 'ready'
                ? t('matrix.allReady')
                : t('matrix.needsAttention')}
            </StatusBadge>
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
                  <tr
                    className="align-top hover:bg-secondary-50/70 dark:hover:bg-secondary-800/40"
                    key={row.type}
                  >
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
                        aria-label={`${t('matrix.open')} ${row.profile}`}
                        className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-full text-secondary-600 hover:bg-secondary-100 dark:text-secondary-300 dark:hover:bg-secondary-700"
                        type="button"
                      >
                        <ChevronRight aria-hidden="true" className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
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

function VariantC({ scenario, setScenario }: VariantProps) {
  const t = useTranslations('admin.aiConnectionsPrototype')
  const unavailable = scenario === 'outage'

  return (
    <div className="space-y-6">
      <PrototypeHeader scenario={scenario} setScenario={setScenario} />
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
        <VariantA scenario={scenario} setScenario={setScenario} />
      ) : null}
      {variant === 'B' ? (
        <VariantB scenario={scenario} setScenario={setScenario} />
      ) : null}
      {variant === 'C' ? (
        <VariantC scenario={scenario} setScenario={setScenario} />
      ) : null}
      <PrototypeSwitcher current={variant} />
    </section>
  )
}

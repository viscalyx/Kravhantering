'use client'

import {
  CheckCircle2,
  CircleHelp,
  Clock3,
  Info,
  LoaderCircle,
  Play,
  Square,
  XCircle,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import type {
  AiAdminCandidateVerificationAttemptResult,
  AiAdminCapabilityVerification,
  AiAdminVerificationCheck,
  AiAdminVerificationOutcome,
  AiAdminVerificationProgress,
} from '@/lib/ai/admin-service'
import { AI_CAPABILITY_KEYS } from '@/lib/ai/capability-keys'
import { AI_RUN_PROFILE_KEYS } from '@/lib/ai/profile-resolver'
import { devMarker } from '@/lib/developer-mode-markers'

export type VerificationPhase =
  | 'idle'
  | 'running'
  | 'completed'
  | 'cancelled'
  | 'failed'

interface ModelVerificationPanelProps {
  onCancel(): void
  onVerify(): void
  phase: VerificationPhase
  progress: readonly AiAdminVerificationProgress[]
  remainingSeconds: number
  verification: AiAdminCandidateVerificationAttemptResult | null
  verifyDisabledReason: string | undefined
}

interface VerificationRow {
  assessment?: AiAdminCapabilityVerification
  check: AiAdminVerificationCheck
  missingCapabilities?: readonly string[]
  name: string
}

type RowState = AiAdminVerificationOutcome | 'running' | 'waiting'
const outcomeKey = {
  inconclusive: 'inconclusive',
  not_checked: 'notChecked',
  not_verified: 'notVerified',
  verified: 'verified',
} as const
const statusIcons = {
  inconclusive: CircleHelp,
  not_checked: CircleHelp,
  not_verified: XCircle,
  verified: CheckCircle2,
  running: LoaderCircle,
  waiting: Clock3,
}
const statusColors: Record<RowState, string> = {
  inconclusive: 'text-amber-800 dark:text-amber-200',
  not_checked: 'text-secondary-600 dark:text-secondary-300',
  not_verified: 'text-red-700 dark:text-red-300',
  verified: 'text-green-800 dark:text-green-300',
  running: 'text-primary-700 dark:text-primary-300',
  waiting: 'text-secondary-600 dark:text-secondary-300',
}

export function ModelVerificationPanel({
  verifyDisabledReason,
  onVerify,
  onCancel,
  phase,
  progress,
  remainingSeconds,
  verification,
}: ModelVerificationPanelProps) {
  const t = useTranslations('admin.aiConnections')
  const running = phase === 'running'
  const groups: { key: string; rows: VerificationRow[] }[] = [
    {
      key: 'basicChecks',
      rows: [
        {
          check: 'connection_authentication',
          name: t('modelVerification.checks.connection_authentication'),
          assessment: verification?.connection,
        },
        {
          check: 'baseline_model_access',
          name: t('modelVerification.checks.baseline_model_access'),
          assessment: verification?.baseline,
        },
      ],
    },
    {
      key: 'capabilities',
      rows: AI_CAPABILITY_KEYS.map(key => ({
        check: `capability:${key}`,
        name: t(`capabilities.${key}`),
        assessment: verification?.capabilities[key],
      })),
    },
    {
      key: 'compatibility',
      rows: AI_RUN_PROFILE_KEYS.map(key => ({
        check: `profile:${key}`,
        name: t(`profiles.${key}`),
        assessment: verification?.profileCompatibility[key],
        missingCapabilities:
          verification?.profileCompatibility[key].missingCapabilities,
      })),
    },
  ]
  const summaryKey = verification
    ? verification.saveable
      ? 'saveable'
      : 'notSaveable'
    : phase === 'idle'
      ? 'startSummary'
      : running
        ? 'runningSummary'
        : 'interruptedSummary'
  const expired = Boolean(verification?.attemptId) && remainingSeconds === 0
  const SummaryIcon = expired
    ? XCircle
    : verification
      ? verification.saveable
        ? CheckCircle2
        : XCircle
      : Info
  const ActionIcon = running ? Square : Play
  return (
    <section
      aria-labelledby="ai-model-verification-title"
      className="min-w-0 space-y-4 rounded-2xl border border-secondary-200 p-3.5 sm:p-5 dark:border-secondary-700"
      {...devMarker({
        context: 'AI model form',
        name: 'AI model verification panel',
        priority: 430,
      })}
    >
      <div
        className="flex flex-wrap items-center justify-between gap-2"
        {...devMarker({
          context: 'AI model verification',
          name: 'AI model verification heading',
          priority: 430,
        })}
      >
        <h3
          className="font-semibold text-secondary-950 dark:text-secondary-50"
          id="ai-model-verification-title"
        >
          {t('modelVerification.title')}
        </h3>
        <button
          className="btn-secondary inline-flex min-h-10 items-center gap-2 px-4! py-2! text-sm"
          disabled={!running && verifyDisabledReason !== undefined}
          onClick={running ? onCancel : onVerify}
          title={!running ? verifyDisabledReason : undefined}
          type="button"
        >
          <ActionIcon aria-hidden="true" className="h-4 w-4 shrink-0" />
          {t(
            `modelVerification.${running ? 'cancelVerification' : phase === 'idle' ? 'verify' : 'verifyAgain'}`,
          )}
        </button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-secondary-600 dark:text-secondary-300">
          {t('modelVerification.intro')}
        </p>
        <p
          className="flex items-center gap-1.5 rounded-full bg-secondary-50 px-2 py-1 text-xs text-secondary-600 dark:bg-secondary-950/50 dark:text-secondary-300"
          role="status"
        >
          <Info aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
          {t(`modelVerification.phases.${phase}`)}
        </p>
      </div>
      {groups.map(group => (
        <fieldset
          aria-labelledby={`ai-verification-${group.key}`}
          className="min-w-0"
          key={group.key}
          {...devMarker({
            context: 'AI model verification',
            name: `AI model verification ${group.key}`,
            priority: 430,
          })}
        >
          <h4
            className="mb-2 text-sm font-semibold text-secondary-950 dark:text-secondary-50"
            id={`ai-verification-${group.key}`}
          >
            {t(`modelVerification.${group.key}`)}
          </h4>
          <dl
            className={
              group.key === 'capabilities'
                ? 'grid gap-1.5 sm:grid-cols-2'
                : 'grid gap-1.5'
            }
          >
            {group.rows.map(row => {
              const event = progress.find(item => item.check === row.check)
              const assessment =
                row.assessment ??
                (event?.state === 'completed' ? event : undefined)
              const state: RowState =
                assessment?.outcome ??
                (running
                  ? event?.state === 'running'
                    ? 'running'
                    : 'waiting'
                  : event?.state === 'running'
                    ? 'inconclusive'
                    : 'not_checked')
              const profile = group.key === 'compatibility'
              const StatusIcon = statusIcons[state]
              const status =
                state === 'running' || state === 'waiting'
                  ? t(`modelVerification.${state}`)
                  : profile && state === 'not_checked'
                    ? t('modelVerification.unknownCompatibility')
                    : profile &&
                        (state === 'verified' || state === 'not_verified')
                      ? t(
                          `modelVerification.${state === 'verified' ? 'compatible' : 'incompatible'}`,
                        )
                      : t(`modelVerification.outcomes.${outcomeKey[state]}`)
              return (
                <div
                  aria-current={state === 'running' ? 'step' : undefined}
                  className={`min-w-0 rounded-xl border px-3 py-2 ${group.key === 'capabilities' ? '' : 'sm:flex sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-4'} ${state === 'running' ? 'border-primary-200 bg-primary-50 dark:border-primary-800 dark:bg-primary-950/40' : 'border-transparent bg-secondary-50 dark:bg-secondary-950/50'}`}
                  key={row.check}
                >
                  <dt className="wrap-anywhere text-sm font-medium text-secondary-900 dark:text-secondary-100">
                    {row.name}
                  </dt>
                  <dd
                    aria-atomic="true"
                    className={`mt-1 min-w-0 max-w-full text-xs ${group.key === 'capabilities' ? '' : 'sm:mt-0'}`}
                    role="status"
                  >
                    <span className="sr-only">{row.name}: </span>
                    <span
                      className={`flex items-start gap-1.5 ${statusColors[state]}`}
                    >
                      <StatusIcon
                        aria-hidden="true"
                        className={`h-4 w-4 shrink-0 ${state === 'running' ? 'animate-spin motion-reduce:animate-none' : ''}`}
                      />
                      <span>
                        {profile &&
                        (state === 'running' || state === 'waiting') ? (
                          <>
                            <span>
                              {t('modelVerification.unknownCompatibility')}
                            </span>
                            {' · '}
                          </>
                        ) : null}
                        {status}
                      </span>
                    </span>
                    {assessment?.failureCategory ? (
                      <span className="mt-1 block wrap-anywhere text-secondary-600 dark:text-secondary-300">
                        {t(
                          `modelVerification.failureCategories.${assessment.failureCategory}`,
                        )}
                      </span>
                    ) : null}
                    {assessment?.diagnosticCode ? (
                      <span className="mt-1 block wrap-anywhere text-secondary-600 dark:text-secondary-300">
                        {t('modelVerification.technicalCode', {
                          code: assessment.diagnosticCode,
                        })}
                      </span>
                    ) : null}
                    {row.missingCapabilities?.length ? (
                      <span className="mt-1 block wrap-anywhere text-secondary-600 dark:text-secondary-300">
                        {t('modelVerification.missingCapabilities', {
                          capabilities: row.missingCapabilities
                            .map(key => t(`capabilities.${key}`))
                            .join(', '),
                        })}
                      </span>
                    ) : null}
                  </dd>
                </div>
              )
            })}
          </dl>
          {group.key === 'capabilities' ? (
            <p className="mt-2 text-xs leading-5 text-secondary-600 dark:text-secondary-300">
              {t('modelVerification.capabilitiesHelp')}
            </p>
          ) : null}
        </fieldset>
      ))}
      <div
        className="min-h-20 rounded-xl border border-secondary-200 bg-secondary-50 p-3 dark:border-secondary-700 dark:bg-secondary-950/50"
        {...devMarker({
          context: 'AI model verification',
          name: 'AI model verification summary',
          priority: 430,
        })}
      >
        <h4 className="mb-1 flex items-center gap-2 text-sm font-medium text-secondary-950 dark:text-secondary-50">
          <SummaryIcon aria-hidden="true" className="h-4 w-4 shrink-0" />
          {t('modelVerification.checks.summary')}
        </h4>
        <p
          className="text-xs text-secondary-600 dark:text-secondary-300"
          role="status"
        >
          {expired
            ? t('pending.expired')
            : t(`modelVerification.${summaryKey}`)}
        </p>
        {verification?.attemptId && remainingSeconds > 0 ? (
          <p
            className="mt-2 text-xs text-secondary-600 dark:text-secondary-300"
            role="timer"
            {...devMarker({
              name: 'AI verification validity',
              context: 'AI model form',
            })}
          >
            {t('pending.remaining', { seconds: remainingSeconds })}
          </p>
        ) : null}
      </div>
    </section>
  )
}

'use client'

import { CheckCircle2, CircleOff, Clock3, TriangleAlert } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import type {
  AiAdminBlocker,
  AiAdminConnectionDetail,
  AiAdminConnectionSummary,
  AiAdminModelRevisionRecord,
} from '@/lib/ai/admin-service'

type Tone = 'danger' | 'neutral' | 'success' | 'warning'

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

export function StatusBadge({
  children,
  tone,
}: {
  children: ReactNode
  tone: Tone
}) {
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

export function lifecycleTone(
  status: AiAdminConnectionSummary['lifecycleStatus'],
): Tone {
  if (status === 'active') return 'success'
  if (status === 'retired') return 'neutral'
  if (status === 'suspended') return 'danger'
  return 'warning'
}

export function healthTone(
  status: AiAdminConnectionSummary['operationalHealth'],
): Tone {
  if (status === 'healthy') return 'success'
  if (status === 'unavailable') return 'danger'
  if (status === 'degraded') return 'warning'
  return 'neutral'
}

export function revisionTone(
  status: AiAdminModelRevisionRecord['status'],
): Tone {
  if (status === 'verified') return 'success'
  if (status === 'ended') return 'neutral'
  return 'warning'
}

export type AttestationBlockerState = 'draft' | 'invalid' | 'missing'

export function attestationBlockerState(
  connection: Pick<AiAdminConnectionDetail, 'attestation' | 'attestationDraft'>,
): AttestationBlockerState {
  if (
    connection.attestationDraft ||
    connection.attestation?.status === 'draft'
  ) {
    return 'draft'
  }
  return connection.attestation ? 'invalid' : 'missing'
}

export function BlockerText({
  attestationState,
  blocker,
}: {
  attestationState?: AttestationBlockerState
  blocker: AiAdminBlocker
}) {
  const t = useTranslations('admin.aiConnections')
  const blockerKey =
    blocker.code === 'attestation_invalid' && attestationState
      ? attestationState === 'draft'
        ? 'attestation_draft_pending'
        : attestationState === 'missing'
          ? 'attestation_missing'
          : 'attestation_invalid'
      : blocker.code
  return (
    <>
      {t(`blockers.${blockerKey}`)}
      {blocker.field ? (
        <span className="ml-1 font-semibold">
          ({t(`blockerFields.${blocker.field}`)})
        </span>
      ) : null}
    </>
  )
}

export function AnimatedRegistrySection({
  children,
  expanded,
  id,
}: {
  children: ReactNode
  expanded: boolean
  id: string
}) {
  return (
    <div
      aria-hidden={!expanded}
      className="grid overflow-hidden transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none"
      data-state={expanded ? 'open' : 'closed'}
      id={id}
      style={{
        gridTemplateRows: expanded ? '1fr' : '0fr',
        opacity: expanded ? 1 : 0,
      }}
    >
      <div className="min-h-0 overflow-hidden">
        <div inert={expanded ? undefined : true}>{children}</div>
      </div>
    </div>
  )
}

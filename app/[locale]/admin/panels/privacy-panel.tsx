'use client'

import {
  CheckCircle2,
  CircleMinus,
  FileJson,
  FileText,
  Info,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'
import AnimatedHelpPanel from '@/components/AnimatedHelpPanel'
import { useConfirmModal } from '@/components/ConfirmModal'
import FieldHelpButton from '@/components/FieldHelpButton'
import { useDataSubjectExportDownload } from '@/components/privacy/useDataSubjectExportDownload'
import { devMarker } from '@/lib/developer-mode-markers'
import { apiFetch } from '@/lib/http/api-fetch'
import { formatActorDisplayNameForLocale } from '@/lib/privacy/display-name'

type SaveState = 'error' | 'idle' | 'saved' | 'saving'

type PrivacyAction = 'anonymize' | 'delete' | 'skip' | 'switch'
type PrivacyHelpField =
  | 'replacementEmail'
  | 'replacementFirstName'
  | 'replacementHsaId'
  | 'replacementLastName'
  | 'replacementName'
  | 'targetHsaId'

interface PrivacyOccurrenceGroup {
  affectedReferences?: string[]
  allowedActions: PrivacyAction[]
  blockingReferences?: Array<{ objectKey: string; values: string[] }>
  controlledByGroupKey?: string | null
  count: number
  currentDisplayValue: string | null
  disabledReasonKey?: string | null
  fieldKey: string
  key: string
  objectKey: string
  readOnlyReasonKey?: string | null
  recommendedAction: PrivacyAction
  warningKey: string | null
}

interface PrivacyPreview {
  groups: PrivacyOccurrenceGroup[]
  previewToken: string
  targetFingerprint: string
  totalCount: number
}

type PrivacyExecutionRowStatus =
  | {
      action: PrivacyAction
      kind: 'completed' | 'skipped'
    }
  | {
      kind: 'failed'
      reason: string | null
    }

type PrivacyExecutionStatuses = Record<string, PrivacyExecutionRowStatus>

const PRIVACY_ACTIONS: PrivacyAction[] = [
  'switch',
  'anonymize',
  'delete',
  'skip',
]

function availablePrivacyActions(
  group: PrivacyOccurrenceGroup,
  options: { canSwitch: boolean },
): PrivacyAction[] {
  const available = options.canSwitch
    ? group.allowedActions
    : group.allowedActions.filter(action => action !== 'switch')
  return available.length > 0 ? available : ['skip']
}

function effectivePrivacyAction(
  group: PrivacyOccurrenceGroup,
  actions: Record<string, PrivacyAction>,
  options: { canSwitch: boolean } = { canSwitch: true },
): PrivacyAction {
  const availableActions = availablePrivacyActions(group, options)

  if (group.controlledByGroupKey) {
    const controllerAction = actions[group.controlledByGroupKey]
    return controllerAction === 'switch' && availableActions.includes('switch')
      ? 'switch'
      : 'skip'
  }

  const requested = actions[group.key] ?? group.recommendedAction
  if (availableActions.includes(requested)) return requested
  if (availableActions.includes(group.recommendedAction)) {
    return group.recommendedAction
  }
  return availableActions[0] ?? 'skip'
}

function executionStatusForAction(
  action: PrivacyAction,
): PrivacyExecutionRowStatus {
  return action === 'skip'
    ? { action, kind: 'skipped' }
    : { action, kind: 'completed' }
}

export default function PrivacyErasurePanel() {
  const ta = useTranslations('admin')
  const tc = useTranslations('common')
  const locale = useLocale()
  const { confirm } = useConfirmModal()
  const [targetHsaId, setTargetHsaId] = useState('')
  const [replacementHsaId, setReplacementHsaId] = useState('')
  const [replacementName, setReplacementName] = useState('')
  const [replacementFirstName, setReplacementFirstName] = useState('')
  const [replacementLastName, setReplacementLastName] = useState('')
  const [replacementEmail, setReplacementEmail] = useState('')
  const [preview, setPreview] = useState<PrivacyPreview | null>(null)
  const [actions, setActions] = useState<Record<string, PrivacyAction>>({})
  const [executionStatuses, setExecutionStatuses] =
    useState<PrivacyExecutionStatuses | null>(null)
  const [openHelp, setOpenHelp] = useState<Set<PrivacyHelpField>>(
    () => new Set(),
  )
  const [status, setStatus] = useState<SaveState>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [messageScope, setMessageScope] = useState<'execute' | 'preview'>(
    'preview',
  )
  const dataSubjectExport = useDataSubjectExportDownload({
    locale,
    targetHsaId: preview ? targetHsaId.trim() : undefined,
  })

  const replacement =
    replacementHsaId.trim() ||
    replacementName.trim() ||
    replacementFirstName.trim() ||
    replacementLastName.trim() ||
    replacementEmail.trim()
      ? {
          displayName: replacementName.trim(),
          email: replacementEmail.trim() || undefined,
          firstName: replacementFirstName.trim() || undefined,
          hsaId: replacementHsaId.trim(),
          lastName: replacementLastName.trim() || undefined,
        }
      : null
  const canUseSwitchAction = Boolean(
    replacementHsaId.trim() && replacementName.trim(),
  )

  const previewPayload = () => ({
    replacement,
    target: {
      hsaId: targetHsaId.trim(),
    },
  })

  const toggleHelp = (field: PrivacyHelpField) => {
    setOpenHelp(current => {
      const next = new Set(current)
      if (next.has(field)) {
        next.delete(field)
      } else {
        next.add(field)
      }
      return next
    })
  }

  const helpButton = (field: PrivacyHelpField, label: string) => (
    <FieldHelpButton
      controls={`privacy-help-${field}`}
      expanded={openHelp.has(field)}
      label={`${tc('help')}: ${label}`}
      onClick={() => toggleHelp(field)}
    />
  )

  const helpPanel = (field: PrivacyHelpField) => (
    <AnimatedHelpPanel
      id={`privacy-help-${field}`}
      isOpen={openHelp.has(field)}
    >
      {ta(`privacy.fieldHelp.${field}` as Parameters<typeof ta>[0])}
    </AnimatedHelpPanel>
  )

  const resetExecutionFeedback = () => {
    setExecutionStatuses(null)
    setStatus(current => (current === 'saved' ? 'idle' : current))
    setMessage(null)
    setMessageScope('preview')
  }

  type PrivacyErrorBody = {
    debugMessage?: string
    details?: { groupKey?: string; reason?: string }
    error?: string
    issues?: Array<{ path?: string }>
  }

  const visibleErrorDetail = (
    body: PrivacyErrorBody | null,
    options: { includePublicError: boolean },
  ) => {
    const debugMessage =
      typeof body?.debugMessage === 'string' ? body.debugMessage.trim() : ''
    if (debugMessage) return debugMessage

    if (!options.includePublicError) return null
    const publicError = typeof body?.error === 'string' ? body.error.trim() : ''
    return publicError || null
  }

  const privacyErrorMessage = (
    response: Response,
    body: PrivacyErrorBody | null,
    copy: { fallback: string; serverFallback: string },
  ) => {
    if (response.status === 403) {
      return ta('privacy.permissionError')
    }
    if (response.status >= 500) {
      const detail = visibleErrorDetail(body, { includePublicError: false })
      return detail
        ? ta('privacy.serverErrorWithDetail', {
            detail,
            message: copy.serverFallback,
          })
        : copy.serverFallback
    }

    const issuePaths = body?.issues?.map(issue => issue.path ?? '') ?? []

    if (issuePaths.includes('replacement.displayName')) {
      return ta('privacy.replacementIncomplete')
    }
    if (issuePaths.includes('replacement.email')) {
      return ta('privacy.invalidReplacementEmail')
    }
    if (
      issuePaths.includes('target.hsaId') ||
      issuePaths.includes('replacement.hsaId')
    ) {
      return ta('privacy.invalidHsaId')
    }

    const detail = visibleErrorDetail(body, { includePublicError: true })
    return detail
      ? ta('privacy.errorWithDetail', {
          detail,
          message: copy.fallback,
        })
      : copy.fallback
  }

  const readPrivacyError = async (
    response: Response,
    copy: { fallback: string; serverFallback: string },
  ) => {
    const body = (await response
      .json()
      .catch(() => null)) as PrivacyErrorBody | null
    return {
      body,
      message: privacyErrorMessage(response, body, copy),
    }
  }

  const runPreview = async () => {
    setStatus('saving')
    setMessage(null)
    setMessageScope('preview')
    setExecutionStatuses(null)
    try {
      const response = await apiFetch('/api/privacy/erasure-preview', {
        body: JSON.stringify(previewPayload()),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      if (!response.ok) {
        setStatus('error')
        const error = await readPrivacyError(response, {
          fallback: ta('privacy.previewError'),
          serverFallback: ta('privacy.serverPreviewError'),
        })
        setMessage(error.message)
        return
      }
      const data = (await response.json()) as PrivacyPreview
      setPreview(data)
      setActions(
        Object.fromEntries(
          data.groups.map(group => [group.key, group.recommendedAction]),
        ),
      )
      setStatus('idle')
    } catch {
      setStatus('error')
      setMessage(ta('privacy.previewError'))
    }
  }

  const executeErasure = async () => {
    if (!preview) return
    const effectiveActions = Object.fromEntries(
      preview.groups.map(group => [
        group.key,
        effectivePrivacyAction(group, actions, {
          canSwitch: canUseSwitchAction,
        }),
      ]),
    ) as Record<string, PrivacyAction>
    const actionSummary = preview.groups.reduce(
      (summary, group) => {
        summary[effectiveActions[group.key]] += group.count
        return summary
      },
      { anonymize: 0, delete: 0, skip: 0, switch: 0 },
    )
    const confirmed = await confirm({
      confirmText: ta('privacy.execute'),
      icon: 'caution',
      message: ta('privacy.confirmMessage', actionSummary),
      title: ta('privacy.confirmTitle'),
      variant: 'danger',
    })
    if (!confirmed) return

    setStatus('saving')
    setMessage(null)
    setMessageScope('execute')
    try {
      const response = await apiFetch('/api/privacy/erasure-requests', {
        body: JSON.stringify({
          ...previewPayload(),
          actions: effectiveActions,
          previewToken: preview.previewToken,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      if (!response.ok) {
        const error = await readPrivacyError(response, {
          fallback: ta('privacy.executeError'),
          serverFallback: ta('privacy.serverExecuteError'),
        })
        const groupKey =
          response.status === 409 ? undefined : error.body?.details?.groupKey
        setStatus('error')
        setExecutionStatuses(
          groupKey && preview.groups.some(group => group.key === groupKey)
            ? {
                [groupKey]: {
                  kind: 'failed',
                  reason: error.body?.details?.reason ?? null,
                },
              }
            : null,
        )
        setMessage(
          response.status === 409 ? ta('privacy.stalePreview') : error.message,
        )
        return
      }
      setExecutionStatuses(
        Object.fromEntries(
          preview.groups.map(group => [
            group.key,
            executionStatusForAction(effectiveActions[group.key]),
          ]),
        ),
      )
      setStatus('saved')
      setMessageScope('preview')
      setMessage(ta('privacy.executeSuccess'))
    } catch {
      setStatus('error')
      setMessageScope('execute')
      setMessage(ta('privacy.executeError'))
    }
  }

  const hasSuccessfulExecution =
    preview && preview.groups.length > 0 && executionStatuses
      ? preview.groups.every(group => {
          const rowStatus = executionStatuses[group.key]
          return (
            rowStatus?.kind === 'completed' || rowStatus?.kind === 'skipped'
          )
        })
      : false

  return (
    <>
      <section
        aria-labelledby="privacy-tab"
        className="rounded-4xl border border-secondary-200/70 bg-white/90 p-6 shadow-sm dark:border-secondary-700/60 dark:bg-secondary-900/80"
        {...devMarker({
          context: 'admin center',
          name: 'tab panel',
          priority: 340,
          value: 'privacy',
        })}
        id="privacy-panel"
        role="tabpanel"
      >
        <div className="border-b border-secondary-200/70 pb-5 dark:border-secondary-700/60">
          <h2 className="text-xl font-semibold text-secondary-950 dark:text-secondary-50">
            {ta('privacy.title')}
          </h2>
          <p className="mt-1 text-sm text-secondary-600 dark:text-secondary-300">
            {ta('privacyDescription')}
          </p>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="block max-w-md space-y-1">
              <div className="flex items-center gap-1.5">
                <label
                  className="text-sm font-medium text-secondary-700 dark:text-secondary-200"
                  htmlFor="privacy-target-hsa-id"
                >
                  {ta('privacy.targetHsaId')}
                </label>
                {helpButton('targetHsaId', ta('privacy.targetHsaId'))}
              </div>
              {helpPanel('targetHsaId')}
              <input
                className="w-full rounded-xl border border-secondary-200 bg-white px-3 py-2.5 font-mono text-sm dark:border-secondary-700 dark:bg-secondary-900"
                id="privacy-target-hsa-id"
                onChange={event => {
                  resetExecutionFeedback()
                  setTargetHsaId(event.target.value)
                  setPreview(null)
                  setActions({})
                }}
                required
                value={targetHsaId}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <label
                    className="text-sm font-medium text-secondary-700 dark:text-secondary-200"
                    htmlFor="privacy-replacement-hsa-id"
                  >
                    {ta('privacy.replacementHsaId')}
                  </label>
                  {helpButton(
                    'replacementHsaId',
                    ta('privacy.replacementHsaId'),
                  )}
                </div>
                {helpPanel('replacementHsaId')}
                <input
                  className="w-full rounded-xl border border-secondary-200 bg-white px-3 py-2.5 font-mono text-sm dark:border-secondary-700 dark:bg-secondary-900"
                  id="privacy-replacement-hsa-id"
                  onChange={event => {
                    resetExecutionFeedback()
                    setReplacementHsaId(event.target.value)
                  }}
                  value={replacementHsaId}
                />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <label
                    className="text-sm font-medium text-secondary-700 dark:text-secondary-200"
                    htmlFor="privacy-replacement-name"
                  >
                    {ta('privacy.replacementName')}
                  </label>
                  {helpButton('replacementName', ta('privacy.replacementName'))}
                </div>
                {helpPanel('replacementName')}
                <input
                  className="w-full rounded-xl border border-secondary-200 bg-white px-3 py-2.5 text-sm dark:border-secondary-700 dark:bg-secondary-900"
                  id="privacy-replacement-name"
                  onChange={event => {
                    resetExecutionFeedback()
                    setReplacementName(event.target.value)
                  }}
                  value={replacementName}
                />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <label
                    className="text-sm font-medium text-secondary-700 dark:text-secondary-200"
                    htmlFor="privacy-replacement-first-name"
                  >
                    {ta('privacy.replacementFirstName')}
                  </label>
                  {helpButton(
                    'replacementFirstName',
                    ta('privacy.replacementFirstName'),
                  )}
                </div>
                {helpPanel('replacementFirstName')}
                <input
                  className="w-full rounded-xl border border-secondary-200 bg-white px-3 py-2.5 text-sm dark:border-secondary-700 dark:bg-secondary-900"
                  id="privacy-replacement-first-name"
                  onChange={event => {
                    resetExecutionFeedback()
                    setReplacementFirstName(event.target.value)
                  }}
                  value={replacementFirstName}
                />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <label
                    className="text-sm font-medium text-secondary-700 dark:text-secondary-200"
                    htmlFor="privacy-replacement-last-name"
                  >
                    {ta('privacy.replacementLastName')}
                  </label>
                  {helpButton(
                    'replacementLastName',
                    ta('privacy.replacementLastName'),
                  )}
                </div>
                {helpPanel('replacementLastName')}
                <input
                  className="w-full rounded-xl border border-secondary-200 bg-white px-3 py-2.5 text-sm dark:border-secondary-700 dark:bg-secondary-900"
                  id="privacy-replacement-last-name"
                  onChange={event => {
                    resetExecutionFeedback()
                    setReplacementLastName(event.target.value)
                  }}
                  value={replacementLastName}
                />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <label
                    className="text-sm font-medium text-secondary-700 dark:text-secondary-200"
                    htmlFor="privacy-replacement-email"
                  >
                    {ta('privacy.replacementEmail')}
                  </label>
                  <span
                    aria-label={ta('privacy.replacementEmailOptional')}
                    className="inline-flex text-secondary-400 dark:text-secondary-500"
                    role="img"
                    title={ta('privacy.replacementEmailOptional')}
                  >
                    <Info aria-hidden="true" className="h-3.5 w-3.5" />
                  </span>
                  {helpButton(
                    'replacementEmail',
                    ta('privacy.replacementEmail'),
                  )}
                </div>
                {helpPanel('replacementEmail')}
                <input
                  className="w-full rounded-xl border border-secondary-200 bg-white px-3 py-2.5 text-sm dark:border-secondary-700 dark:bg-secondary-900"
                  id="privacy-replacement-email"
                  onChange={event => {
                    resetExecutionFeedback()
                    setReplacementEmail(event.target.value)
                  }}
                  type="email"
                  value={replacementEmail}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-secondary-200 px-4 py-2 text-sm font-medium text-secondary-700 transition-colors hover:bg-secondary-100 disabled:opacity-60 dark:border-secondary-700 dark:text-secondary-200 dark:hover:bg-secondary-800"
                disabled={status === 'saving' || !targetHsaId.trim()}
                onClick={runPreview}
                type="button"
              >
                <RefreshCw aria-hidden="true" className="h-4 w-4" />
                {ta('privacy.preview')}
              </button>
              {message && messageScope === 'preview' ? (
                <span
                  className={`text-sm font-medium ${
                    status === 'error'
                      ? 'text-red-700 dark:text-red-400'
                      : 'text-emerald-700 dark:text-emerald-300'
                  }`}
                  role={status === 'error' ? 'alert' : 'status'}
                >
                  {message}
                </span>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-secondary-200/70 bg-secondary-50/70 p-4 dark:border-secondary-700/60 dark:bg-secondary-950/40">
            <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-secondary-700 dark:text-secondary-200">
              {ta('privacy.guidanceTitle')}
            </h3>
            <p className="mt-3 text-sm text-secondary-600 dark:text-secondary-300">
              {ta('privacy.guidanceBody')}
            </p>
          </div>
        </div>

        {preview ? (
          <div className="mt-6 overflow-hidden rounded-2xl border border-secondary-200/70 dark:border-secondary-700/60">
            <div className="flex flex-col gap-2 border-b border-secondary-200/70 bg-secondary-50 px-4 py-3 dark:border-secondary-700/60 dark:bg-secondary-950/40 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-secondary-900 dark:text-secondary-100">
                  {ta('privacy.previewResult', { count: preview.totalCount })}
                </div>
                <div className="font-mono text-xs text-secondary-500 dark:text-secondary-400">
                  {preview.targetFingerprint.slice(0, 16)}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-secondary-200 bg-white px-4 py-2 text-sm font-medium text-secondary-700 transition-colors hover:bg-secondary-100 disabled:opacity-60 dark:border-secondary-700 dark:bg-secondary-900 dark:text-secondary-200 dark:hover:bg-secondary-800"
                  disabled={
                    status === 'saving' ||
                    dataSubjectExport.downloading !== null
                  }
                  onClick={() =>
                    void dataSubjectExport.download({ delivery: 'json' })
                  }
                  type="button"
                >
                  <FileJson aria-hidden="true" className="h-4 w-4" />
                  {dataSubjectExport.downloading === 'json'
                    ? ta('privacy.exportingJson')
                    : ta('privacy.exportJson')}
                </button>
                <button
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-secondary-200 bg-white px-4 py-2 text-sm font-medium text-secondary-700 transition-colors hover:bg-secondary-100 disabled:opacity-60 dark:border-secondary-700 dark:bg-secondary-900 dark:text-secondary-200 dark:hover:bg-secondary-800"
                  disabled={
                    status === 'saving' ||
                    dataSubjectExport.downloading !== null
                  }
                  onClick={() =>
                    void dataSubjectExport.download({ delivery: 'pdf' })
                  }
                  type="button"
                >
                  <FileText aria-hidden="true" className="h-4 w-4" />
                  {dataSubjectExport.downloading === 'pdf'
                    ? ta('privacy.exportingPdf')
                    : ta('privacy.exportPdf')}
                </button>
                {dataSubjectExport.error ? (
                  <span
                    className="text-sm font-medium text-red-700 dark:text-red-300"
                    role="alert"
                  >
                    {ta('privacy.exportError', {
                      detail: dataSubjectExport.error,
                    })}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-secondary-200 text-sm dark:divide-secondary-700">
                <thead className="bg-white dark:bg-secondary-900">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">
                      {ta('privacy.object')}
                    </th>
                    <th className="px-4 py-3 text-left font-semibold">
                      {ta('privacy.count')}
                    </th>
                    <th className="px-4 py-3 text-left font-semibold">
                      {ta('privacy.affected')}
                    </th>
                    <th className="px-4 py-3 text-left font-semibold">
                      {ta('privacy.currentValue')}
                    </th>
                    <th className="px-4 py-3 text-left font-semibold">
                      {ta('privacy.action')}
                    </th>
                    <th className="px-4 py-3 text-left font-semibold">
                      {ta(
                        executionStatuses
                          ? 'privacy.status'
                          : 'privacy.warning',
                      )}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-secondary-200 bg-white dark:divide-secondary-700 dark:bg-secondary-900">
                  {preview.groups.map(group => {
                    const isReadOnly = Boolean(group.readOnlyReasonKey)
                    const isDisabled = Boolean(group.disabledReasonKey)
                    const actionValue = effectivePrivacyAction(group, actions, {
                      canSwitch: canUseSwitchAction,
                    })
                    const availableActions = availablePrivacyActions(group, {
                      canSwitch: canUseSwitchAction,
                    })
                    const rowExecutionStatus = executionStatuses?.[group.key]
                    const currentDisplayValue = formatActorDisplayNameForLocale(
                      group.currentDisplayValue,
                      locale,
                    )
                    return (
                      <tr
                        aria-disabled={isDisabled || isReadOnly || undefined}
                        className={
                          rowExecutionStatus?.kind === 'completed'
                            ? 'bg-emerald-50/70 dark:bg-emerald-950/20'
                            : rowExecutionStatus?.kind === 'skipped'
                              ? 'bg-secondary-50/80 dark:bg-secondary-950/30'
                              : rowExecutionStatus?.kind === 'failed'
                                ? 'bg-red-50/70 dark:bg-red-950/25'
                                : isDisabled
                                  ? 'bg-red-50/60 dark:bg-red-950/20'
                                  : isReadOnly
                                    ? 'bg-secondary-50/70 dark:bg-secondary-950/30'
                                    : undefined
                        }
                        key={group.key}
                      >
                        <td className="px-4 py-3">
                          <div
                            className={
                              isDisabled || isReadOnly
                                ? 'font-medium text-secondary-500 dark:text-secondary-400'
                                : 'font-medium text-secondary-900 dark:text-secondary-100'
                            }
                          >
                            {ta(`privacy.objects.${group.objectKey}`)}
                          </div>
                          <div className="text-xs text-secondary-500 dark:text-secondary-400">
                            {ta(`privacy.fields.${group.fieldKey}`)}
                          </div>
                        </td>
                        <td className="px-4 py-3">{group.count}</td>
                        <td className="max-w-xs px-4 py-3">
                          {group.affectedReferences?.length ? (
                            <ul className="list-disc space-y-1 pl-4 text-secondary-700 dark:text-secondary-200">
                              {group.affectedReferences.map(reference => (
                                <li key={`${group.key}-${reference}`}>
                                  {reference}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <span className="text-secondary-500 dark:text-secondary-400">
                              {ta('privacy.notAvailable')}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {currentDisplayValue ?? ta('privacy.notAvailable')}
                        </td>
                        <td className="px-4 py-3">
                          {isReadOnly ? (
                            <span className="inline-flex min-h-10 items-center rounded-lg border border-secondary-200 bg-secondary-100 px-3 py-2 text-secondary-500 dark:border-secondary-700 dark:bg-secondary-800 dark:text-secondary-400">
                              {ta(`privacy.actions.${actionValue}`)}
                            </span>
                          ) : (
                            <select
                              className="min-h-10 rounded-lg border border-secondary-200 bg-white px-3 py-2 disabled:cursor-not-allowed disabled:bg-secondary-100 disabled:text-secondary-500 dark:border-secondary-700 dark:bg-secondary-950 dark:disabled:bg-secondary-800 dark:disabled:text-secondary-400"
                              disabled={
                                isDisabled ||
                                status === 'saving' ||
                                hasSuccessfulExecution
                              }
                              onChange={event => {
                                resetExecutionFeedback()
                                const nextAction = event.target
                                  .value as PrivacyAction
                                setActions(current => ({
                                  ...current,
                                  [group.key]: nextAction,
                                  ...Object.fromEntries(
                                    preview.groups
                                      .filter(
                                        candidate =>
                                          candidate.controlledByGroupKey ===
                                          group.key,
                                      )
                                      .map(candidate => [
                                        candidate.key,
                                        nextAction === 'switch' &&
                                        availablePrivacyActions(candidate, {
                                          canSwitch: canUseSwitchAction,
                                        }).includes('switch')
                                          ? 'switch'
                                          : 'skip',
                                      ]),
                                  ),
                                }))
                              }}
                              value={actionValue}
                            >
                              {PRIVACY_ACTIONS.filter(action =>
                                availableActions.includes(action),
                              ).map(action => (
                                <option key={action} value={action}>
                                  {ta(`privacy.actions.${action}`)}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td className="max-w-sm px-4 py-3">
                          {rowExecutionStatus?.kind === 'completed' ? (
                            <span className="inline-flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-300">
                              <CheckCircle2
                                aria-hidden="true"
                                className="h-4 w-4"
                              />
                              {ta('privacy.executionStatus.completed')}
                            </span>
                          ) : rowExecutionStatus?.kind === 'skipped' ? (
                            <span className="inline-flex items-center gap-2 font-medium text-secondary-600 dark:text-secondary-300">
                              <CircleMinus
                                aria-hidden="true"
                                className="h-4 w-4"
                              />
                              {ta('privacy.executionStatus.skipped')}
                            </span>
                          ) : rowExecutionStatus?.kind === 'failed' ? (
                            <span
                              className="inline-flex items-center gap-2 font-medium text-red-700 dark:text-red-300"
                              role="alert"
                            >
                              <XCircle aria-hidden="true" className="h-4 w-4" />
                              {ta('privacy.executionStatus.failed', {
                                reason: rowExecutionStatus.reason
                                  ? ta(
                                      `privacy.executionErrors.${rowExecutionStatus.reason}`,
                                    )
                                  : ta('privacy.executeError'),
                              })}
                            </span>
                          ) : group.disabledReasonKey ? (
                            <div
                              className="font-medium text-red-700 dark:text-red-300"
                              role="alert"
                            >
                              <div>
                                {ta(
                                  `privacy.blockers.${group.disabledReasonKey}`,
                                )}
                              </div>
                            </div>
                          ) : group.readOnlyReasonKey ? (
                            <span className="text-secondary-500 dark:text-secondary-400">
                              {ta(
                                `privacy.readOnly.${group.readOnlyReasonKey}`,
                              )}
                            </span>
                          ) : (
                            <span className="text-secondary-600 dark:text-secondary-300">
                              {group.warningKey
                                ? ta(`privacy.warnings.${group.warningKey}`)
                                : ''}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {preview.totalCount > 0 && !hasSuccessfulExecution ? (
              <div className="flex flex-wrap items-center justify-end gap-3 border-t border-secondary-200/70 bg-white px-4 py-4 dark:border-secondary-700/60 dark:bg-secondary-900">
                <button
                  className="inline-flex min-h-11 items-center gap-2 rounded-full bg-red-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-800 disabled:opacity-60"
                  disabled={status === 'saving'}
                  onClick={executeErasure}
                  type="button"
                >
                  <ShieldCheck aria-hidden="true" className="h-4 w-4" />
                  {ta('privacy.execute')}
                </button>
                {message && messageScope === 'execute' ? (
                  <span
                    className={`max-w-2xl text-sm font-medium ${
                      status === 'error'
                        ? 'text-red-700 dark:text-red-400'
                        : 'text-emerald-700 dark:text-emerald-300'
                    }`}
                    role={status === 'error' ? 'alert' : 'status'}
                  >
                    {message}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
      {dataSubjectExport.dialog}
    </>
  )
}

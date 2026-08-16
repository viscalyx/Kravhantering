'use client'

import {
  CircleMinus,
  ClipboardList,
  FileJson,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { type MouseEvent, useCallback, useEffect, useState } from 'react'
import { useConfirmModal } from '@/components/ConfirmModal'
import { downloadBlob } from '@/lib/browser-download'
import { devMarker } from '@/lib/developer-mode-markers'
import { apiFetch } from '@/lib/http/api-fetch'
import { readResponseMessage } from '@/lib/http/response-message'
import { formatActorDisplayNameForLocale } from '@/lib/privacy/display-name'
import { createUtf8BomBlob } from '@/lib/text-export'

type SaveState = 'error' | 'idle' | 'saved' | 'saving'

const ARCHIVING_TIME_ZONE = 'UTC'

type ArchivingRetentionAction = 'delete'
interface ArchivingRetentionPolicy {
  action: ArchivingRetentionAction
  ageDays: number
  decisionReference: string | null
  id: number
  informationSet: string
  isEnabled: boolean
  lastRunAt: string | null
  latestRun: {
    archivedCount: number
    candidateCount: number
    completedAt: string
    deletedCount: number
    exceptionCount: number
    id: number
    skippedCount: number
  } | null
  policyKey: string
  statusCondition: string
}

interface ArchivingRetentionCandidate {
  action: ArchivingRetentionAction
  ageBasis: string
  blockedReasonKey: string | null
  currentDisplayValue: string | null
  fieldKey: string
  key: string
  objectKey: string
  reference: string
  requiresExport: boolean
  sourceKey: string
  subjectId: string
  subjectTable: string
}

interface ArchivingRetentionPreview {
  candidates: ArchivingRetentionCandidate[]
  cutoff: string
  policy: ArchivingRetentionPolicy
  previewToken: string
  summary: {
    archiveCount: number
    candidateCount: number
    deleteCount: number
    exceptionCount: number
    skippedCount: number
  }
}

interface ArchivingRetentionExportResponse {
  archive: Record<string, unknown>
  exportToken: string
}

interface AiForensicCaptureMetadata {
  direction: 'input' | 'output'
  eventCount: number
  expiresAt: string
  id: number
  operation: string
  requestedAt: string
  status: 'active' | 'expired' | 'pending_approval' | 'purged' | 'stopped'
  stoppedAt: string | null
}

function archivingRetentionExportFilename(
  preview: ArchivingRetentionPreview,
  locale: string,
): string {
  const date = new Date().toISOString().slice(0, 10)
  const policyKey = preview.policy.policyKey
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  const stem = locale === 'sv' ? 'arkivexport' : 'archive-export'
  return `${stem}-${policyKey || 'retention'}-${date}.json`
}

export default function ArchivingPanel() {
  const ta = useTranslations('admin')
  const locale = useLocale()
  const { confirm } = useConfirmModal()
  const [retentionPolicies, setRetentionPolicies] = useState<
    ArchivingRetentionPolicy[]
  >([])
  const [selectedRetentionPolicyId, setSelectedRetentionPolicyId] = useState<
    number | null
  >(null)
  const [retentionPreview, setRetentionPreview] =
    useState<ArchivingRetentionPreview | null>(null)
  const [retentionExportToken, setRetentionExportToken] = useState<
    string | null
  >(null)
  const [retentionStatus, setRetentionStatus] = useState<SaveState>('idle')
  const [retentionMessage, setRetentionMessage] = useState<string | null>(null)
  const [forensicCaptures, setForensicCaptures] = useState<
    AiForensicCaptureMetadata[]
  >([])
  const [canPurgeForensicCapture, setCanPurgeForensicCapture] = useState(false)
  const [forensicStatus, setForensicStatus] = useState<SaveState>('idle')
  const [forensicMessage, setForensicMessage] = useState<string | null>(null)
  const selectedRetentionPolicy =
    retentionPolicies.find(policy => policy.id === selectedRetentionPolicyId) ??
    null

  const loadRetentionPolicies = useCallback(async () => {
    try {
      const response = await apiFetch('/api/admin/archiving/policies')
      if (!response.ok) {
        setRetentionStatus('error')
        setRetentionMessage(
          (await readResponseMessage(response)) ??
            ta('archiving.retention.loadError'),
        )
        return
      }
      const body = (await response.json()) as {
        policies?: ArchivingRetentionPolicy[]
      }
      const policies = body.policies ?? []
      setRetentionPolicies(current =>
        current.length === 0 && policies.length === 0 ? current : policies,
      )
      setSelectedRetentionPolicyId(
        current => current ?? policies[0]?.id ?? null,
      )
      setRetentionStatus('idle')
    } catch {
      setRetentionStatus('error')
      setRetentionMessage(ta('archiving.retention.loadError'))
    }
  }, [ta])

  const loadForensicCaptures = useCallback(async () => {
    setForensicStatus('saving')
    try {
      const response = await apiFetch('/api/admin/ai-forensic-captures')
      if (!response.ok) {
        setForensicStatus('error')
        setForensicMessage(ta('archiving.forensic.loadError'))
        return false
      }
      const body = (await response.json()) as {
        canPurge?: boolean
        captures?: AiForensicCaptureMetadata[]
      }
      setCanPurgeForensicCapture(body.canPurge === true)
      setForensicCaptures(body.captures ?? [])
      setForensicStatus('idle')
      setForensicMessage(null)
      return true
    } catch {
      setForensicStatus('error')
      setForensicMessage(ta('archiving.forensic.loadError'))
      return false
    }
  }, [ta])

  useEffect(() => {
    void loadRetentionPolicies()
  }, [loadRetentionPolicies])

  const purgeForensicCapture = async (
    event: MouseEvent<HTMLButtonElement>,
    captureWindowId: number,
  ) => {
    const anchorEl = event.currentTarget
    const confirmed = await confirm({
      anchorEl,
      confirmText: ta('archiving.forensic.purge'),
      icon: 'caution',
      message: ta('archiving.forensic.purgeConfirmMessage'),
      title: ta('archiving.forensic.purgeConfirmTitle'),
      variant: 'danger',
    })
    if (!confirmed) return
    setForensicStatus('saving')
    setForensicMessage(null)
    try {
      const response = await apiFetch('/api/admin/ai-forensic-captures', {
        body: JSON.stringify({ action: 'purge', captureWindowId }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH',
      })
      if (!response.ok) {
        setForensicStatus('error')
        setForensicMessage(
          (await readResponseMessage(response)) ??
            ta('archiving.forensic.purgeError'),
        )
        return
      }
      if (!(await loadForensicCaptures())) return
      setForensicStatus('saved')
      setForensicMessage(ta('archiving.forensic.purgeSuccess'))
    } catch {
      setForensicStatus('error')
      setForensicMessage(ta('archiving.forensic.purgeError'))
    }
  }

  const runRetentionPreview = async (policyId = selectedRetentionPolicyId) => {
    if (!policyId) return
    setRetentionStatus('saving')
    setRetentionMessage(null)
    try {
      const response = await apiFetch('/api/admin/archiving/preview', {
        body: JSON.stringify({ policyId }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      if (!response.ok) {
        setRetentionStatus('error')
        setRetentionPreview(null)
        setRetentionExportToken(null)
        setRetentionMessage(
          (await readResponseMessage(response)) ??
            ta('archiving.retention.previewError'),
        )
        return
      }
      const data = (await response.json()) as ArchivingRetentionPreview
      setRetentionPreview(data)
      setRetentionExportToken(null)
      setRetentionStatus('idle')
    } catch {
      setRetentionStatus('error')
      setRetentionPreview(null)
      setRetentionExportToken(null)
      setRetentionMessage(ta('archiving.retention.previewError'))
    }
  }

  const createRetentionException = async (
    candidate: ArchivingRetentionCandidate,
  ) => {
    if (!retentionPreview) return
    setRetentionStatus('saving')
    setRetentionMessage(null)
    try {
      const response = await apiFetch('/api/admin/archiving/exceptions', {
        body: JSON.stringify({
          policyId: retentionPreview.policy.id,
          reason: ta('archiving.retention.defaultExceptionReason'),
          sourceKey: candidate.sourceKey,
          subjectId: candidate.subjectId,
          subjectTable: candidate.subjectTable,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      if (!response.ok) {
        setRetentionStatus('error')
        setRetentionMessage(
          (await readResponseMessage(response)) ??
            ta('archiving.retention.exceptionError'),
        )
        return
      }
      await runRetentionPreview(retentionPreview.policy.id)
      setRetentionMessage(ta('archiving.retention.exceptionCreated'))
    } catch {
      setRetentionStatus('error')
      setRetentionMessage(ta('archiving.retention.exceptionError'))
    }
  }

  const executeRetention = async (event: MouseEvent<HTMLButtonElement>) => {
    if (!retentionPreview) return
    const anchorEl = event.currentTarget
    const confirmed = await confirm({
      anchorEl,
      confirmText: ta('archiving.retention.execute'),
      icon: 'caution',
      message: ta('archiving.retention.confirmMessage', {
        archiveCount: retentionPreview.summary.archiveCount,
        deleteCount: retentionPreview.summary.deleteCount,
      }),
      title: ta('archiving.retention.confirmTitle'),
      variant: 'danger',
    })
    if (!confirmed) return

    setRetentionStatus('saving')
    setRetentionMessage(null)
    try {
      const response = await apiFetch('/api/admin/archiving/runs', {
        body: JSON.stringify({
          ...(retentionExportToken
            ? { exportToken: retentionExportToken }
            : {}),
          policyId: retentionPreview.policy.id,
          previewToken: retentionPreview.previewToken,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      if (!response.ok) {
        setRetentionStatus('error')
        setRetentionMessage(
          response.status === 409
            ? ta('archiving.retention.stalePreview')
            : ((await readResponseMessage(response)) ??
                ta('archiving.retention.executeError')),
        )
        return
      }
      setRetentionPreview(null)
      setRetentionExportToken(null)
      setRetentionStatus('saved')
      setRetentionMessage(ta('archiving.retention.executeSuccess'))
      await loadRetentionPolicies()
    } catch {
      setRetentionStatus('error')
      setRetentionMessage(ta('archiving.retention.executeError'))
    }
  }

  const exportRetentionArchive = async () => {
    if (!retentionPreview) return
    setRetentionStatus('saving')
    setRetentionMessage(null)
    try {
      const response = await apiFetch('/api/admin/archiving/exports', {
        body: JSON.stringify({
          policyId: retentionPreview.policy.id,
          previewToken: retentionPreview.previewToken,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      if (!response.ok) {
        setRetentionStatus('error')
        setRetentionMessage(
          response.status === 409
            ? ta('archiving.retention.stalePreview')
            : ((await readResponseMessage(response)) ??
                ta('archiving.retention.exportError')),
        )
        return
      }
      const exportData =
        (await response.json()) as ArchivingRetentionExportResponse
      downloadBlob(
        createUtf8BomBlob(
          JSON.stringify(exportData.archive, null, 2),
          'application/json;charset=utf-8',
        ),
        archivingRetentionExportFilename(retentionPreview, locale),
      )
      setRetentionExportToken(exportData.exportToken)
      setRetentionStatus('saved')
      setRetentionMessage(ta('archiving.retention.exportSuccess'))
    } catch {
      setRetentionStatus('error')
      setRetentionMessage(ta('archiving.retention.exportError'))
    }
  }

  const retentionRequiresArchiveExport = Boolean(
    retentionPreview && retentionPreview.summary.archiveCount > 0,
  )

  return (
    <section
      aria-labelledby="archiving-tab"
      className="rounded-4xl border border-secondary-200/70 bg-white/88 p-6 shadow-soft dark:border-secondary-800 dark:bg-secondary-950/70"
      {...devMarker({
        context: 'admin center',
        name: 'tab panel',
        priority: 340,
        value: 'archiving',
      })}
      id="archiving-panel"
      role="tabpanel"
    >
      <div>
        <h2 className="text-2xl font-semibold text-secondary-950 dark:text-secondary-50">
          {ta('archiving.title')}
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-secondary-600 dark:text-secondary-300">
          {ta('archiving.description')}
        </p>
      </div>

      <div
        className="mt-6 border-t border-secondary-200/70 pt-6 dark:border-secondary-700/60"
        {...devMarker({
          context: 'admin center',
          name: 'forensic evidence',
          priority: 350,
          value: 'AI forensic evidence',
        })}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-secondary-950 dark:text-secondary-50">
              {ta('archiving.forensic.title')}
            </h3>
            <p className="mt-1 max-w-3xl text-sm text-secondary-600 dark:text-secondary-300">
              {ta('archiving.forensic.description')}
            </p>
          </div>
          <button
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-secondary-200 px-4 py-2 text-sm font-medium text-secondary-700 transition-colors hover:bg-secondary-100 disabled:opacity-60 dark:border-secondary-700 dark:text-secondary-200 dark:hover:bg-secondary-800"
            disabled={forensicStatus === 'saving'}
            onClick={() => void loadForensicCaptures()}
            type="button"
          >
            <RefreshCw aria-hidden="true" className="h-4 w-4" />
            {ta('archiving.forensic.reload')}
          </button>
        </div>

        {forensicMessage ? (
          <p
            className={`mt-4 text-sm font-medium ${
              forensicStatus === 'error'
                ? 'text-red-700 dark:text-red-300'
                : 'text-emerald-700 dark:text-emerald-300'
            }`}
            role={forensicStatus === 'error' ? 'alert' : 'status'}
          >
            {forensicMessage}
          </p>
        ) : null}

        {forensicCaptures.length > 0 ? (
          <div className="mt-5 overflow-x-auto rounded-2xl border border-secondary-200/70 dark:border-secondary-700/60">
            <table className="min-w-full divide-y divide-secondary-200 text-sm dark:divide-secondary-700">
              <thead className="bg-secondary-50 dark:bg-secondary-950/40">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">
                    {ta('archiving.forensic.capture')}
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">
                    {ta('archiving.forensic.scope')}
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">
                    {ta('archiving.forensic.status')}
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">
                    {ta('archiving.forensic.eventCount')}
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">
                    {ta('archiving.forensic.expiresAt')}
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">
                    {ta('privacy.action')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-secondary-200 bg-white dark:divide-secondary-700 dark:bg-secondary-900">
                {forensicCaptures.map(capture => (
                  <tr key={capture.id}>
                    <td className="px-4 py-3 font-medium">#{capture.id}</td>
                    <td className="px-4 py-3">
                      <div>{capture.operation}</div>
                      <div className="text-xs text-secondary-500 dark:text-secondary-400">
                        {ta(
                          `archiving.forensic.directions.${capture.direction}`,
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {ta(`archiving.forensic.statuses.${capture.status}`)}
                    </td>
                    <td className="px-4 py-3">{capture.eventCount}</td>
                    <td className="px-4 py-3">
                      {new Date(capture.expiresAt).toLocaleString(locale, {
                        timeZone: ARCHIVING_TIME_ZONE,
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        className="inline-flex min-h-10 items-center gap-2 rounded-full border border-red-300 px-3 py-2 text-xs font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-60 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/30"
                        disabled={
                          forensicStatus === 'saving' ||
                          !canPurgeForensicCapture ||
                          capture.status === 'purged'
                        }
                        onClick={event =>
                          void purgeForensicCapture(event, capture.id)
                        }
                        title={
                          !canPurgeForensicCapture
                            ? ta('archiving.forensic.requiresPrivacyOfficer')
                            : forensicStatus === 'saving'
                              ? ta('archiving.forensic.purgePending')
                              : capture.status === 'purged'
                                ? ta('archiving.forensic.alreadyPurged')
                                : undefined
                        }
                        type="button"
                      >
                        <Trash2 aria-hidden="true" className="h-4 w-4" />
                        {ta('archiving.forensic.purge')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : forensicStatus === 'idle' ? (
          <p className="mt-4 text-sm text-secondary-500 dark:text-secondary-400">
            {ta('archiving.forensic.empty')}
          </p>
        ) : null}
      </div>

      <div className="mt-6 border-t border-secondary-200/70 pt-6 dark:border-secondary-700/60">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-secondary-950 dark:text-secondary-50">
              {ta('archiving.retention.title')}
            </h3>
            <p className="mt-1 max-w-3xl text-sm text-secondary-600 dark:text-secondary-300">
              {ta('archiving.retention.description')}
            </p>
          </div>
          <button
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-secondary-200 px-4 py-2 text-sm font-medium text-secondary-700 transition-colors hover:bg-secondary-100 disabled:opacity-60 dark:border-secondary-700 dark:text-secondary-200 dark:hover:bg-secondary-800"
            disabled={retentionStatus === 'saving'}
            onClick={() => void loadRetentionPolicies()}
            type="button"
          >
            <RefreshCw aria-hidden="true" className="h-4 w-4" />
            {ta('archiving.retention.reload')}
          </button>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
          <label className="block space-y-1">
            <span className="text-sm font-medium text-secondary-700 dark:text-secondary-200">
              {ta('archiving.retention.policy')}
            </span>
            <select
              className="min-h-11 w-full rounded-xl border border-secondary-200 bg-white px-3 py-2.5 text-sm dark:border-secondary-700 dark:bg-secondary-900"
              disabled={retentionStatus === 'saving'}
              onChange={event => {
                const policyId = Number(event.target.value)
                setSelectedRetentionPolicyId(policyId)
                setRetentionPreview(null)
                setRetentionExportToken(null)
                setRetentionMessage(null)
              }}
              value={selectedRetentionPolicyId ?? ''}
            >
              {retentionPolicies.map(policy => (
                <option key={policy.id} value={policy.id}>
                  {policy.informationSet}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-60"
              disabled={
                retentionStatus === 'saving' ||
                !selectedRetentionPolicy ||
                !selectedRetentionPolicy.isEnabled
              }
              onClick={() => void runRetentionPreview()}
              type="button"
            >
              <ClipboardList aria-hidden="true" className="h-4 w-4" />
              {ta('archiving.retention.preview')}
            </button>
          </div>
        </div>

        {selectedRetentionPolicy ? (
          <div className="mt-4 rounded-2xl border border-secondary-200/70 bg-secondary-50/70 p-4 text-sm dark:border-secondary-700/60 dark:bg-secondary-950/40">
            <dl className="grid gap-3 md:grid-cols-4">
              <div>
                <dt className="font-medium text-secondary-700 dark:text-secondary-200">
                  {ta('archiving.retention.action')}
                </dt>
                <dd className="mt-1 text-secondary-600 dark:text-secondary-300">
                  {ta(
                    `archiving.retention.actions.${selectedRetentionPolicy.action}`,
                  )}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-secondary-700 dark:text-secondary-200">
                  {ta('archiving.retention.ageDays')}
                </dt>
                <dd className="mt-1 text-secondary-600 dark:text-secondary-300">
                  {selectedRetentionPolicy.ageDays}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-secondary-700 dark:text-secondary-200">
                  {ta('archiving.retention.lastRun')}
                </dt>
                <dd className="mt-1 text-secondary-600 dark:text-secondary-300">
                  {selectedRetentionPolicy.lastRunAt
                    ? new Date(
                        selectedRetentionPolicy.lastRunAt,
                      ).toLocaleString(locale, {
                        timeZone: ARCHIVING_TIME_ZONE,
                      })
                    : ta('privacy.notAvailable')}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-secondary-700 dark:text-secondary-200">
                  {ta('archiving.retention.state')}
                </dt>
                <dd className="mt-1 text-secondary-600 dark:text-secondary-300">
                  {selectedRetentionPolicy.isEnabled
                    ? ta('archiving.retention.enabled')
                    : ta('archiving.retention.disabled')}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-secondary-600 dark:text-secondary-300">
              {selectedRetentionPolicy.statusCondition}
            </p>
          </div>
        ) : null}

        {retentionMessage ? (
          <p
            className={`mt-4 text-sm font-medium ${
              retentionStatus === 'error'
                ? 'text-red-700 dark:text-red-300'
                : 'text-emerald-700 dark:text-emerald-300'
            }`}
            role={retentionStatus === 'error' ? 'alert' : 'status'}
          >
            {retentionMessage}
          </p>
        ) : null}

        {retentionPreview ? (
          <div className="mt-5 overflow-hidden rounded-2xl border border-secondary-200/70 dark:border-secondary-700/60">
            <div className="flex flex-col gap-2 border-b border-secondary-200/70 bg-secondary-50 px-4 py-3 dark:border-secondary-700/60 dark:bg-secondary-950/40 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-secondary-900 dark:text-secondary-100">
                  {ta('archiving.retention.previewResult', {
                    count: retentionPreview.summary.candidateCount,
                  })}
                </div>
                <div className="text-xs text-secondary-500 dark:text-secondary-400">
                  {ta('archiving.retention.cutoff', {
                    date: new Date(retentionPreview.cutoff).toLocaleDateString(
                      locale,
                      { timeZone: ARCHIVING_TIME_ZONE },
                    ),
                  })}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-secondary-200 bg-white px-4 py-2 text-sm font-medium text-secondary-700 transition-colors hover:bg-secondary-100 disabled:opacity-60 dark:border-secondary-700 dark:bg-secondary-900 dark:text-secondary-200 dark:hover:bg-secondary-800"
                  disabled={
                    retentionStatus === 'saving' ||
                    retentionPreview.summary.candidateCount === 0
                  }
                  onClick={() => void exportRetentionArchive()}
                  type="button"
                >
                  <FileJson aria-hidden="true" className="h-4 w-4" />
                  {ta('archiving.retention.exportJson')}
                </button>
                <button
                  className="inline-flex min-h-11 items-center gap-2 rounded-full bg-red-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-800 disabled:opacity-60"
                  disabled={
                    retentionStatus === 'saving' ||
                    retentionPreview.summary.candidateCount === 0 ||
                    (retentionRequiresArchiveExport && !retentionExportToken)
                  }
                  onClick={event => void executeRetention(event)}
                  type="button"
                >
                  <ShieldCheck aria-hidden="true" className="h-4 w-4" />
                  {ta('archiving.retention.execute')}
                </button>
              </div>
            </div>
            {retentionRequiresArchiveExport && !retentionExportToken ? (
              <p className="border-b border-secondary-200/70 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-secondary-700/60 dark:bg-amber-950/30 dark:text-amber-100">
                {ta('archiving.retention.exportRequired')}
              </p>
            ) : null}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-secondary-200 text-sm dark:divide-secondary-700">
                <thead className="bg-white dark:bg-secondary-900">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">
                      {ta('privacy.object')}
                    </th>
                    <th className="px-4 py-3 text-left font-semibold">
                      {ta('privacy.affected')}
                    </th>
                    <th className="px-4 py-3 text-left font-semibold">
                      {ta('privacy.currentValue')}
                    </th>
                    <th className="px-4 py-3 text-left font-semibold">
                      {ta('archiving.retention.ageBasis')}
                    </th>
                    <th className="px-4 py-3 text-left font-semibold">
                      {ta('privacy.action')}
                    </th>
                    <th className="px-4 py-3 text-left font-semibold">
                      {ta('archiving.retention.exception')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-secondary-200 bg-white dark:divide-secondary-700 dark:bg-secondary-900">
                  {retentionPreview.candidates.map(candidate => (
                    <tr key={candidate.key}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-secondary-900 dark:text-secondary-100">
                          {ta(`privacy.objects.${candidate.objectKey}`)}
                        </div>
                        <div className="text-xs text-secondary-500 dark:text-secondary-400">
                          {ta(`privacy.fields.${candidate.fieldKey}`)}
                        </div>
                      </td>
                      <td className="px-4 py-3">{candidate.reference}</td>
                      <td className="px-4 py-3">
                        {formatActorDisplayNameForLocale(
                          candidate.currentDisplayValue,
                          locale,
                        ) ?? ta('privacy.notAvailable')}
                      </td>
                      <td className="px-4 py-3">
                        {new Date(candidate.ageBasis).toLocaleDateString(
                          locale,
                          { timeZone: ARCHIVING_TIME_ZONE },
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {ta(`archiving.retention.actions.${candidate.action}`)}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          className="inline-flex min-h-10 items-center gap-2 rounded-full border border-secondary-200 px-3 py-2 text-xs font-medium text-secondary-700 transition-colors hover:bg-secondary-100 disabled:opacity-60 dark:border-secondary-700 dark:text-secondary-200 dark:hover:bg-secondary-800"
                          disabled={retentionStatus === 'saving'}
                          onClick={() =>
                            void createRetentionException(candidate)
                          }
                          type="button"
                        >
                          <CircleMinus aria-hidden="true" className="h-4 w-4" />
                          {ta('archiving.retention.createException')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}
